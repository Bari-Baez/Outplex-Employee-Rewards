'use client';

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  Flame,
  Layers3,
  ListFilter,
  Save,
  TrendingUp,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SupervisorFilter } from '@/components/SupervisorFilter';
import { ActionMenu, ActionMenuItem, ActionMenuLabel, ActionMenuSeparator } from '@/components/layout/ActionMenu';
import { ModernSelect } from '@/components/ui/Select';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import type { OTSlot, UserRole, User } from '@/types/database';
import { canEditTool } from '@/lib/permissions';
import {
  OT_LOB_OPTIONS,
  canonicalizeOTLob,
  getCurrentOTDateTime,
  getOTFortnightRange,
  getOTColumnLabel,
  shiftOTDate,
} from '@/lib/ot';
import { formatOTDate, formatTime } from '@/lib/utils';
import { toast } from 'sonner';

type ManagerUser = {
  id: string;
  name: string;
  email: string | null;
  employee_id: string | null;
  role: UserRole;
  avatar_url?: string | null;
  supervisor?: string | null;
  supervisor_id?: string | null;
};

type TabKey = 'dashboard' | 'manager';

type FilterKey = 'all' | 'claimed' | 'available';
type QuickRangeKey = 'all' | 'last_7_days' | 'last_14_days' | 'custom';
type DashboardQuickRangeKey = 'last_14_days' | 'last_30_days' | 'custom';
type ExportAlignment = 'left' | 'center' | 'right';
type ExportStudioMode = 'manager' | 'claimed_report';
type CalendarSummaryTone = 'quiet' | 'available' | 'claimed' | 'mixed';

type EditState = {
  date: string;
  start_time: string;
  end_time: string;
  assignedUserId: string;
  lob: string;
  spot_id: string;
};

type DeleteDialogState = {
  slot: OTSlot;
  step: 1 | 2;
} | null;
type ExportColumn = {
  key: string;
  label: string;
  visible: boolean;
  align: ExportAlignment;
  width: number;
};
type ExportRow = Record<string, string>;

const EXPORT_COLUMN_KEYS = [
  'employee_name',
  'employee_id',
  'employee_email',
  'employee_superior',
  'spot_id',
  'lob',
  'date',
  'start_time',
  'end_time',
  'duration_hrs',
  'shift_label',
  'csv_status',
  'ot_status',
] as const;

const CHART_COLORS = ['#7c6cff', '#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function createExportColumns(): ExportColumn[] {
  return EXPORT_COLUMN_KEYS.map((key) => ({
    key,
    label: getOTColumnLabel(key),
    visible: true,
    align:
      key === 'duration_hrs'
        ? 'right'
        : key === 'employee_id' || key === 'spot_id'
          ? 'center'
          : 'left',
    width: key === 'employee_email' ? 240 : key === 'lob' ? 220 : 160,
  }));
}

function buildDateRange(fromIso: string, toIso: string) {
  if (!fromIso || !toIso) {
    return [];
  }

  const start = fromIso <= toIso ? fromIso : toIso;
  const end = fromIso <= toIso ? toIso : fromIso;
  const dates: string[] = [];
  let cursor = start;

  while (cursor <= end) {
    dates.push(cursor);
    cursor = shiftOTDate(cursor, 1);
  }

  return dates;
}

function getMonthStart(dateIso: string) {
  return `${dateIso.slice(0, 7)}-01`;
}

function getMonthDates(dateIso: string) {
  const monthStart = getMonthStart(dateIso);
  const [year, month] = monthStart.split('-').map(Number);
  const totalDays = new Date(year, month, 0).getDate();

  return Array.from({ length: totalDays }, (_, index) =>
    `${monthStart.slice(0, 8)}${String(index + 1).padStart(2, '0')}`,
  );
}

function getCalendarCellTone({
  claimedCount,
  availableCount,
}: {
  claimedCount: number;
  availableCount: number;
}): CalendarSummaryTone {
  if (claimedCount > 0 && availableCount > 0) {
    return 'mixed';
  }

  if (claimedCount > 0) {
    return 'claimed';
  }

  if (availableCount > 0) {
    return 'available';
  }

  return 'quiet';
}

function formatExportCellValue(key: string, raw: string): string {
  if (!raw) return '';
  if (key === 'date') {
    // ISO "2026-05-01" → "05/01/2026"
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    return raw;
  }
  if (key === 'start_time' || key === 'end_time') {
    return formatTime(raw); // "08:00" → "8:00 AM"
  }
  if (key === 'duration_hrs') {
    const n = Number(raw);
    return Number.isNaN(n) ? raw : String(n); // strip trailing zeros
  }
  return raw;
}

function serializeExportCsv(columns: ExportColumn[], rows: ExportRow[], formatted = false) {
  const escape = (value: string | number | undefined) => {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  return [
    columns.map((column) => escape(column.label)).join(','),
    ...rows.map((row) =>
      columns.map((column) =>
        escape(formatted ? formatExportCellValue(column.key, row[column.key] ?? '') : (row[column.key] ?? '')),
      ).join(','),
    ),
  ].join('\n');
}

function createBlankExportRow(columns: ExportColumn[]) {
  return Object.fromEntries(columns.map((column) => [column.key, ''])) as ExportRow;
}

function downloadBlob(contents: string, fileName: string, mimeType: string) {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsvProfessional(columns: ExportColumn[], rows: ExportRow[], label = 'ot-report') {
  const today = new Date().toISOString().slice(0, 10);
  const csv = serializeExportCsv(columns, rows, true);
  // UTF-8 BOM ensures Excel opens without encoding issues
  const bom = '﻿';
  downloadBlob(bom + csv, `Outplex-${label}-${today}.csv`, 'text/csv');
}

// ── CSV sheet aggregation helpers (used by downloadExportCsv) ──────────────
type CsvSheet = 'ot-data' | 'employee-summary' | 'lob-summary' | 'date-summary' | 'dashboard-kpis';

function csvEsc(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvLine(vals: (string | number)[]): string { return vals.map(csvEsc).join(','); }

function rowSection(row: ExportRow, today: string): string {
  if (row.ot_status === 'cancelled') return 'Cancelled';
  if ((row.date ?? '') > today) return 'Upcoming';
  if (row.ot_status === 'claimed') return 'Claimed';
  return 'Pending';
}

function buildCsvEmployeeSummary(rows: ExportRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, { name: string; id: string; email: string; sup: string; lob: string; claimed: number; pending: number; upcoming: number; cancelled: number; hrs: number }>();
  for (const row of rows) {
    const key = row.employee_id || row.employee_name || 'unassigned';
    if (!map.has(key)) map.set(key, { name: row.employee_name ?? '', id: row.employee_id ?? '', email: row.employee_email ?? '', sup: row.employee_superior ?? '', lob: row.lob ?? '', claimed: 0, pending: 0, upcoming: 0, cancelled: 0, hrs: 0 });
    const e = map.get(key)!;
    const sec = rowSection(row, today);
    if (sec === 'Claimed') e.claimed++;
    else if (sec === 'Upcoming') e.upcoming++;
    else if (sec === 'Cancelled') e.cancelled++;
    else e.pending++;
    e.hrs += Number(row.duration_hrs) || 0;
  }
  const lines = [csvLine(['Employee Name', 'Emp. ID', 'Email', 'Supervisor', 'LOB', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours'])];
  [...map.values()].sort((a, b) => b.hrs - a.hrs).forEach(e => {
    const total = e.claimed + e.pending + e.upcoming + e.cancelled;
    lines.push(csvLine([e.name, e.id, e.email, e.sup, e.lob, e.claimed, e.pending, e.upcoming, e.cancelled, total, Math.round(e.hrs * 10) / 10]));
  });
  return lines.join('\n');
}

function buildCsvLobSummary(rows: ExportRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, { claimed: number; pending: number; upcoming: number; cancelled: number; hrs: number }>();
  for (const row of rows) {
    const lob = row.lob || 'Unknown';
    if (!map.has(lob)) map.set(lob, { claimed: 0, pending: 0, upcoming: 0, cancelled: 0, hrs: 0 });
    const e = map.get(lob)!;
    const sec = rowSection(row, today);
    if (sec === 'Claimed') e.claimed++;
    else if (sec === 'Upcoming') e.upcoming++;
    else if (sec === 'Cancelled') e.cancelled++;
    else e.pending++;
    e.hrs += Number(row.duration_hrs) || 0;
  }
  const lines = [csvLine(['LOB', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours'])];
  [...map.entries()].sort((a, b) => b[1].hrs - a[1].hrs).forEach(([lob, e]) => {
    const total = e.claimed + e.pending + e.upcoming + e.cancelled;
    lines.push(csvLine([lob, e.claimed, e.pending, e.upcoming, e.cancelled, total, Math.round(e.hrs * 10) / 10]));
  });
  return lines.join('\n');
}

function buildCsvDateSummary(rows: ExportRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const map = new Map<string, { day: string; claimed: number; pending: number; upcoming: number; cancelled: number; hrs: number }>();
  for (const row of rows) {
    const date = row.date || '';
    if (!map.has(date)) {
      const d = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : '';
      map.set(date, { day: d, claimed: 0, pending: 0, upcoming: 0, cancelled: 0, hrs: 0 });
    }
    const e = map.get(date)!;
    const sec = rowSection(row, today);
    if (sec === 'Claimed') e.claimed++;
    else if (sec === 'Upcoming') e.upcoming++;
    else if (sec === 'Cancelled') e.cancelled++;
    else e.pending++;
    e.hrs += Number(row.duration_hrs) || 0;
  }
  const lines = [csvLine(['Date', 'Day', 'Claimed', 'Pending', 'Upcoming', 'Cancelled', 'Total Slots', 'Total Hours'])];
  [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([date, e]) => {
    const total = e.claimed + e.pending + e.upcoming + e.cancelled;
    lines.push(csvLine([date, e.day, e.claimed, e.pending, e.upcoming, e.cancelled, total, Math.round(e.hrs * 10) / 10]));
  });
  return lines.join('\n');
}

function buildCsvDashboardKpis(rows: ExportRow[]): string {
  const today = new Date().toISOString().slice(0, 10);
  let claimed = 0, pending = 0, upcoming = 0, cancelled = 0, totalHrs = 0;
  const empHrs = new Map<string, number>();
  const lobHrs = new Map<string, number>();
  const dateCt = new Map<string, number>();
  for (const row of rows) {
    const sec = rowSection(row, today);
    const hrs = Number(row.duration_hrs) || 0;
    totalHrs += hrs;
    if (sec === 'Claimed') claimed++;
    else if (sec === 'Upcoming') upcoming++;
    else if (sec === 'Cancelled') cancelled++;
    else pending++;
    const eKey = row.employee_id || row.employee_name || 'unassigned';
    empHrs.set(eKey, (empHrs.get(eKey) ?? 0) + hrs);
    if (row.lob) lobHrs.set(row.lob, (lobHrs.get(row.lob) ?? 0) + hrs);
    if (row.date) dateCt.set(row.date, (dateCt.get(row.date) ?? 0) + 1);
  }
  const topEmpKey = [...empHrs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const topEmp = rows.find(r => (r.employee_id || r.employee_name) === topEmpKey)?.employee_name ?? topEmpKey;
  const topLob = [...lobHrs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const peakDate = [...dateCt.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const lines = [
    csvLine(['Metric', 'Value']),
    csvLine(['Total OT Hours', Math.round(totalHrs * 10) / 10]),
    csvLine(['Total Slots', rows.length]),
    csvLine(['Claimed Slots', claimed]),
    csvLine(['Pending Slots', pending]),
    csvLine(['Upcoming Slots', upcoming]),
    csvLine(['Cancelled Slots', cancelled]),
    csvLine(['Top Employee (by hrs)', topEmp]),
    csvLine(['Top LOB (by hrs)', topLob]),
    csvLine(['Peak Date (most slots)', peakDate]),
  ];
  return lines.join('\n');
}

function toTimeInputValue(value: string) {
  return value.slice(0, 5);
}

function formatSlotLabel(slot: Pick<OTSlot, 'date' | 'start_time' | 'end_time'>) {
  return `${formatOTDate(slot.date)} - ${formatTime(slot.start_time)} to ${formatTime(slot.end_time)}`;
}

export function OTManagerClient({
  currentUser,
  initialSlots,
  users,
}: {
  currentUser: User;
  initialSlots: OTSlot[];
  users: ManagerUser[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [filter, setFilter] = useState<FilterKey>('claimed');
  const [slots, setSlots] = useState<OTSlot[]>(
    initialSlots.filter(
      (slot) => slot.status !== 'cancelled' && (!slot.batch || slot.batch.status === 'published'),
    ),
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'danger'>('success');
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [quickRange, setQuickRange] = useState<QuickRangeKey>('all');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [dashboardDateFrom, setDashboardDateFrom] = useState('');
  const [dashboardDateTo, setDashboardDateTo] = useState('');
  const [dashboardQuickRange, setDashboardQuickRange] = useState<DashboardQuickRangeKey>('last_14_days');
  const [managerHighlightSlotId, setManagerHighlightSlotId] = useState<string | null>(null);
  const [expandedEmployeeReports, setExpandedEmployeeReports] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState(() => getMonthStart(getCurrentOTDateTime().date));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [exportStudioOpen, setExportStudioOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState<ExportColumn[]>(() => createExportColumns());
  const [exportRows, setExportRows] = useState<ExportRow[]>([]);
  const [exportStudioTitle, setExportStudioTitle] = useState('Export Studio');
  const [exportStudioSubtitle, setExportStudioSubtitle] = useState(
    'Review, rename columns, and fine-tune the OT table before downloading.',
  );
  const [exportStudioMode, setExportStudioMode] = useState<ExportStudioMode>('manager');
  const [selectedExportColumnKey, setSelectedExportColumnKey] = useState<string>(EXPORT_COLUMN_KEYS[0]);
  const [exportPdfOrientation, setExportPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [selectedExportRowIndex, setSelectedExportRowIndex] = useState<number | null>(null);
  const [exportRowQuery, setExportRowQuery] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState<string | 'all' | 'my-team'>('all');
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const currentRole = currentUser.role;
  const isB1 = currentRole === 'moderator_b1';
  const isReadOnly = !canEditTool(currentRole, 'ot-manager');

  const currentMoment = useMemo(() => getCurrentOTDateTime(), []);
  const currentMonthPrefix = `${currentMoment.date.slice(0, 7)}-`;
  const currentFortnight = useMemo(() => getOTFortnightRange(currentMoment.date), [currentMoment.date]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  
  const allSupervisors = useMemo(() => {
    // Map of id -> name
    const supervisors = new Map<string, string>();
    users.forEach((u) => {
      if (u.supervisor_id && u.supervisor) {
        supervisors.set(u.supervisor_id, u.supervisor);
      }
    });
    return Array.from(supervisors.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [users]);

  useEffect(() => {
    setDashboardDateFrom(shiftOTDate(currentMoment.date, -13));
    setDashboardDateTo(currentMoment.date);
    setCalendarMonth(getMonthStart(currentMoment.date));

    // Automatic Maintenance: Purge old logs every time a moderator enters the dashboard
    void fetch('/api/moderator/maintenance/cleanup-logs', { method: 'POST' })
      .catch(err => console.error('Maintenance error:', err));
  }, [currentMoment.date]);

  const filteredSlots = useMemo(() => {
    const normalizedEmployeeQuery = employeeQuery.trim().toLowerCase();

    return slots.filter((slot) => {
      if (filter !== 'all' && slot.status !== filter) {
        return false;
      }

      if (dateFrom && slot.date < dateFrom) {
        return false;
      }

      if (dateTo && slot.date > dateTo) {
        return false;
      }

      // Supervisor filtering
      const claimedUser = usersById.get(slot.claimed_by ?? '');
      const isSearchActive = normalizedEmployeeQuery.length > 0;
      const shouldBypassFilter = isSearchActive && isB1;

      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (claimedUser?.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (claimedUser?.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!normalizedEmployeeQuery) {
        return true;
      }

      const employeeName = slot.claimedByUser?.name?.toLowerCase() ?? '';
      const employeeId = slot.claimedByUser?.employee_id?.toLowerCase() ?? '';
      const employeeEmail = claimedUser?.email?.toLowerCase() ?? '';
      const slotId = slot.claimed_by?.toLowerCase() ?? '';

      return [employeeName, employeeId, employeeEmail, slotId].some((value) =>
        value.includes(normalizedEmployeeQuery),
      );
    });
  }, [dateFrom, dateTo, employeeQuery, filter, slots, usersById, supervisorFilter, currentUser.id, isB1]);

  const normalizedDashboardDateFrom = dashboardDateFrom || shiftOTDate(currentMoment.date, -13);
  const normalizedDashboardDateTo = dashboardDateTo || currentMoment.date;

  const dashboardRangeDates = useMemo(
    () => buildDateRange(normalizedDashboardDateFrom, normalizedDashboardDateTo),
    [normalizedDashboardDateFrom, normalizedDashboardDateTo],
  );

  const dashboardWindowSlots = useMemo(() => {
    if (!normalizedDashboardDateFrom || !normalizedDashboardDateTo) {
      return slots;
    }

    const start = normalizedDashboardDateFrom <= normalizedDashboardDateTo ? normalizedDashboardDateFrom : normalizedDashboardDateTo;
    const end = normalizedDashboardDateFrom <= normalizedDashboardDateTo ? normalizedDashboardDateTo : normalizedDashboardDateFrom;

    return slots.filter((slot) => slot.date >= start && slot.date <= end);
  }, [normalizedDashboardDateFrom, normalizedDashboardDateTo, slots]);

  const dashboardClaimedSlots = useMemo(
    () =>
      dashboardWindowSlots.filter(
        (slot) => slot.status === 'claimed' && slot.claimedByUser && slot.claimed_by,
      ),
    [dashboardWindowSlots],
  );

  const dashboardAvailableSlots = useMemo(
    () => dashboardWindowSlots.filter((slot) => slot.status === 'available'),
    [dashboardWindowSlots],
  );

  const dashboardStats = useMemo(() => {
    const uniqueEmployees = new Set(
      dashboardClaimedSlots.map((slot) => slot.claimed_by).filter(Boolean),
    ).size;
    const totalClaimedHours = dashboardClaimedSlots.reduce(
      (sum, slot) => sum + (slot.duration_hrs || 0),
      0,
    );

    return {
      claimed: dashboardClaimedSlots,
      available: dashboardAvailableSlots,
      uniqueEmployees,
      totalClaimedHours,
    };
  }, [dashboardAvailableSlots, dashboardClaimedSlots]);

  const employeeSummaries = useMemo(() => {
    const claimsByEmployee = new Map<
      string,
      { user: OTSlot['claimedByUser']; slots: OTSlot[]; email: string | null }
    >();

    dashboardClaimedSlots.forEach((slot) => {
      const key = slot.claimed_by!;
      const current = claimsByEmployee.get(key) ?? {
        user: slot.claimedByUser,
        slots: [],
        email: usersById.get(key)?.email ?? null,
      };
      current.slots.push(slot);
      claimsByEmployee.set(key, current);
    });

    return Array.from(claimsByEmployee.entries())
      .map(([userId, data]) => {
        const sortedSlots = [...data.slots].sort((left, right) => {
          const dateCompare = right.date.localeCompare(left.date);
          return dateCompare !== 0
            ? dateCompare
            : right.start_time.localeCompare(left.start_time);
        });
        const totalHours = sortedSlots.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);
        const monthHours = sortedSlots
          .filter((slot) => slot.date.startsWith(currentMonthPrefix))
          .reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);
        const fortnightHours = sortedSlots
          .filter((slot) => slot.date >= currentFortnight.start && slot.date <= currentFortnight.end)
          .reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);

        return {
          userId,
          user: data.user,
          email: data.email,
          slots: sortedSlots,
          latestSlot: sortedSlots[0] ?? null,
          totalHours,
          monthHours,
          fortnightHours,
        };
      })
      .sort((left, right) => right.totalHours - left.totalHours);
  }, [
    currentFortnight.end,
    currentFortnight.start,
    currentMonthPrefix,
    dashboardClaimedSlots,
    usersById,
  ]);

  useEffect(() => {
    if (employeeSummaries.length === 0) {
      setSelectedEmployeeId(null);
      return;
    }

    if (!selectedEmployeeId || !employeeSummaries.some((employee) => employee.userId === selectedEmployeeId)) {
      setSelectedEmployeeId(employeeSummaries[0]?.userId ?? null);
    }
  }, [employeeSummaries, selectedEmployeeId]);

  useEffect(() => {
    if (employeeSummaries.length === 0) {
      setExpandedEmployeeReports(new Set());
      return;
    }

    setExpandedEmployeeReports((current) => {
      if (current.size > 0) {
        return current;
      }

      return new Set([employeeSummaries[0].userId]);
    });
  }, [employeeSummaries]);

  const dailyBreakdown = useMemo(
    () =>
      dashboardRangeDates.map((date) => {
        const daySlots = dashboardWindowSlots.filter((slot) => slot.date === date);
        const claimed = daySlots.filter((slot) => slot.status === 'claimed');
        const open = daySlots.filter((slot) => slot.status === 'available');

        return {
          date,
          claimed: claimed.length,
          open: open.length,
          hours: claimed.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0),
        };
      }),
    [dashboardRangeDates, dashboardWindowSlots],
  );

  const occupiedSlots = useMemo(
    () =>
      dashboardClaimedSlots
        .sort((left, right) => {
          const dateCompare = left.date.localeCompare(right.date);
          return dateCompare !== 0 ? dateCompare : left.start_time.localeCompare(right.start_time);
        }),
    [dashboardClaimedSlots],
  );

  const statusDistributionData = useMemo(
    () => [
      { name: 'Claimed', value: dashboardStats.claimed.length, color: CHART_COLORS[0] },
      { name: 'Available', value: dashboardStats.available.length, color: CHART_COLORS[1] },
    ].filter((item) => item.value > 0),
    [dashboardStats.available.length, dashboardStats.claimed.length],
  );

  const topEmployeeChartData = useMemo(
    () =>
      employeeSummaries.slice(0, 6).map((employee) => ({
        userId: employee.userId,
        name: employee.user?.name ?? 'Unknown',
        hours: Number(employee.totalHours.toFixed(1)),
        slots: employee.slots.length,
      })),
    [employeeSummaries],
  );

  const lobBreakdownData = useMemo(() => {
    const totals = new Map<string, number>();

    dashboardClaimedSlots.forEach((slot) => {
      const key = canonicalizeOTLob(slot.lob);
      totals.set(key, (totals.get(key) ?? 0) + (slot.duration_hrs || 0));
    });

    return Array.from(totals.entries())
      .map(([name, hours], index) => ({
        name,
        hours: Number(hours.toFixed(1)),
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((left, right) => right.hours - left.hours)
      .slice(0, 5);
  }, [dashboardClaimedSlots]);

  const trendChartData = useMemo(
    () =>
      dashboardRangeDates.map((date) => {
        const daySlots = dashboardWindowSlots.filter((slot) => slot.date === date);
        const claimedSlots = daySlots.filter((slot) => slot.status === 'claimed');
        const openSlots = daySlots.filter((slot) => slot.status === 'available');

        return {
          date,
          shortLabel: new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          claimedHours: Number(
            claimedSlots.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0).toFixed(1),
          ),
          openSlots: openSlots.length,
          claimedSlots: claimedSlots.length,
        };
      }),
    [dashboardRangeDates, dashboardWindowSlots],
  );

  const dashboardHighlights = useMemo(() => {
    const busiestEmployee = employeeSummaries[0] ?? null;
    const busiestDay = [...dailyBreakdown].sort((left, right) => right.hours - left.hours)[0] ?? null;
    const upcomingOpenSlots = dashboardAvailableSlots.length;
    const utilizationRate =
      dashboardWindowSlots.length === 0
        ? 0
        : Math.round((dashboardStats.claimed.length / dashboardWindowSlots.length) * 100);

    return {
      busiestEmployee,
      busiestDay,
      upcomingOpenSlots,
      utilizationRate,
    };
  }, [dailyBreakdown, dashboardAvailableSlots.length, dashboardStats.claimed.length, dashboardWindowSlots.length, employeeSummaries]);

  const dashboardPeriodDates = useMemo(
    () => dashboardRangeDates.length > 0 ? dashboardRangeDates : Array.from({ length: 14 }, (_, index) => shiftOTDate(currentMoment.date, index - 13)),
    [currentMoment.date, dashboardRangeDates],
  );

  const heatmapEmployees = useMemo(() => employeeSummaries.slice(0, 5), [employeeSummaries]);

  const employeeCalendarHeatmap = useMemo(
    () =>
      heatmapEmployees.map((employee) => ({
        userId: employee.userId,
        name: employee.user?.name ?? 'Unknown',
        employeeId: employee.user?.employee_id ?? '',
        cells: dashboardPeriodDates.map((date) => {
          const hours = employee.slots
            .filter((slot) => slot.date === date)
            .reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0);

          return {
            date,
            hours: Number(hours.toFixed(1)),
          };
        }),
      })),
    [dashboardPeriodDates, heatmapEmployees],
  );

  const maxHeatmapHours = useMemo(
    () =>
      Math.max(
        1,
        ...employeeCalendarHeatmap.flatMap((employee) => employee.cells.map((cell) => cell.hours)),
      ),
    [employeeCalendarHeatmap],
  );

  const calendarMonthDates = useMemo(() => getMonthDates(calendarMonth), [calendarMonth]);

  const calendarMonthSlots = useMemo(
    () => slots.filter((slot) => slot.date.startsWith(calendarMonth.slice(0, 7))),
    [calendarMonth, slots],
  );

  const calendarMonthSummary = useMemo(
    () =>
      calendarMonthDates.map((date) => {
        const daySlots = calendarMonthSlots.filter((slot) => slot.date === date);
        const claimedSlots = daySlots.filter((slot) => slot.status === 'claimed');
        const availableSlots = daySlots.filter((slot) => slot.status === 'available');

        return {
          date,
          claimedCount: claimedSlots.length,
          availableCount: availableSlots.length,
          claimedHours: claimedSlots.reduce((sum, slot) => sum + (slot.duration_hrs || 0), 0),
          tone: getCalendarCellTone({
            claimedCount: claimedSlots.length,
            availableCount: availableSlots.length,
          }),
        };
      }),
    [calendarMonthDates, calendarMonthSlots],
  );

  const calendarMonthGridCells = useMemo(() => {
    const monthStartDay = new Date(`${calendarMonth}T00:00:00`).getDay();
    return [
      ...Array.from({ length: monthStartDay }, (_, index) => ({
        key: `blank-${index}`,
        empty: true as const,
      })),
      ...calendarMonthSummary.map((day) => ({
        key: day.date,
        empty: false as const,
        ...day,
      })),
    ];
  }, [calendarMonth, calendarMonthSummary]);

  const selectedCalendarDaySlots = useMemo(
    () =>
      selectedCalendarDate
        ? calendarMonthSlots
            .filter((slot) => slot.date === selectedCalendarDate)
            .sort((left, right) => left.start_time.localeCompare(right.start_time))
        : [],
    [calendarMonthSlots, selectedCalendarDate],
  );

  const selectedCalendarClaimedSlots = useMemo(
    () => selectedCalendarDaySlots.filter((slot) => slot.status === 'claimed' && slot.claimedByUser),
    [selectedCalendarDaySlots],
  );

  const selectedCalendarAvailableSlots = useMemo(
    () => selectedCalendarDaySlots.filter((slot) => slot.status === 'available'),
    [selectedCalendarDaySlots],
  );

  const getEditState = (slot: OTSlot) =>
    edits[slot.id] ?? {
      date: slot.date,
      start_time: toTimeInputValue(slot.start_time),
      end_time: toTimeInputValue(slot.end_time),
      assignedUserId: slot.claimed_by ?? '',
    };

  const setEditState = (slotId: string, patch: Partial<EditState>) => {
    setEdits((current) => ({
      ...current,
      [slotId]: {
        ...(current[slotId] ?? { date: '', start_time: '', end_time: '', assignedUserId: '' }),
        ...patch,
      },
    }));
  };

  const enrichSlot = (slot: OTSlot, assignedUserId: string | null) => {
    const user = assignedUserId ? users.find((candidate) => candidate.id === assignedUserId) ?? null : null;
    return {
      ...slot,
      claimedByUser: user
        ? {
            id: user.id,
            name: user.name,
            avatar_url: user.avatar_url ?? null,
            employee_id: user.employee_id,
          }
        : undefined,
    };
  };

  const handleSave = async (slot: OTSlot) => {
    const draft = getEditState(slot);
    setSavingId(slot.id);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/ot/slots/${slot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: draft.date,
          start_time: draft.start_time,
          end_time: draft.end_time,
          assignedUserId: draft.assignedUserId,
          status: draft.assignedUserId ? 'claimed' : 'available',
        }),
      });

      const payload = (await response.json()) as { data?: OTSlot; error?: string; message?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'Unable to save OT slot changes.');
      }

      const nextSlot = enrichSlot(payload.data, payload.data.claimed_by ?? null);
      setSlots((current) => current.map((existing) => (existing.id === slot.id ? nextSlot : existing)));
      setEdits((current) => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
      setStatusTone('success');
      setStatusMessage(payload.message ?? 'OT slot updated. The employee was notified.');
    } catch (error) {
      setStatusTone('danger');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save OT slot changes.');
    } finally {
      setSavingId(null);
    }
  };

  const executeDelete = async (slot: OTSlot) => {
    setSavingId(slot.id);
    try {
      const response = await fetch(`/api/ot/slots/${slot.id}`, { method: 'DELETE' });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to remove OT slot.');
      }

      setSlots((current) => current.filter((existing) => existing.id !== slot.id));
      setStatusTone('success');
      setStatusMessage(payload.message ?? 'OT slot removed. The employee was notified if needed.');
    } catch (error) {
      setStatusTone('danger');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to remove OT slot.');
    } finally {
      setSavingId(null);
      setDeleteDialog(null);
    }
  };

  const handleDelete = (slot: OTSlot) => {
    setDeleteDialog({ slot, step: 1 });
  };

  const buildExportRows = (sourceSlots: OTSlot[]): ExportRow[] => {
    return sourceSlots.map((slot) => {
      const linkedUser = usersById.get(slot.claimed_by ?? '');
      return {
        employee_name: slot.claimedByUser?.name ?? 'Unassigned',
        employee_id: slot.claimedByUser?.employee_id ?? '',
        employee_email: linkedUser?.email ?? '',
        employee_superior: linkedUser?.supervisor ?? '',
        spot_id: slot.spot_id ?? '',
        lob: canonicalizeOTLob(slot.lob),
        date: slot.date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        duration_hrs: String(slot.duration_hrs ?? ''),
        shift_label: slot.shift_label ?? '',
        csv_status: slot.csv_status ?? '',
        ot_status: slot.status,
      };
    });
  };

  const applyQuickRange = (range: QuickRangeKey) => {
    setQuickRange(range);
    if (range === 'all') {
      setDateFrom('');
      setDateTo('');
      return;
    }

    if (range === 'custom') {
      return;
    }

    const daysBack = range === 'last_7_days' ? -6 : -13;
    setDateFrom(shiftOTDate(currentMoment.date, daysBack));
    setDateTo(currentMoment.date);
  };

  const applyDashboardQuickRange = (range: DashboardQuickRangeKey) => {
    setDashboardQuickRange(range);

    if (range === 'custom') {
      return;
    }

    const daysBack = range === 'last_30_days' ? -29 : -13;
    setDashboardDateFrom(shiftOTDate(currentMoment.date, daysBack));
    setDashboardDateTo(currentMoment.date);
  };

  const toggleEmployeeReport = (userId: string) => {
    setExpandedEmployeeReports((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setSelectedEmployeeId(userId);
  };

  const changeCalendarMonth = (direction: -1 | 1) => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const nextDate = new Date(year, month - 1 + direction, 1);
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`;
    setCalendarMonth(nextMonth);
    setSelectedCalendarDate(null);
  };

  const focusSlotInManager = (slot: OTSlot, employeeId?: string | null) => {
    setActiveTab('manager');
    setFilter(slot.status === 'available' ? 'all' : 'claimed');
    setQuickRange('custom');
    setDateFrom(slot.date);
    setDateTo(slot.date);
    setEmployeeQuery(employeeId ?? slot.claimedByUser?.employee_id ?? slot.claimedByUser?.name ?? '');
    setManagerHighlightSlotId(slot.id);
    setStatusTone('success');
    setStatusMessage(`Focused OT Management on ${formatOTDate(slot.date)} for ${slot.claimedByUser?.name ?? 'the selected OT slot'}.`);
  };

  const clearManagerFilters = () => {
    setQuickRange('all');
    setDateFrom('');
    setDateTo('');
    setEmployeeQuery('');
    setManagerHighlightSlotId(null);
  };

  const clearDashboardFilters = () => {
    setDashboardQuickRange('last_14_days');
    setDashboardDateFrom(shiftOTDate(currentMoment.date, -13));
    setDashboardDateTo(currentMoment.date);
  };

  const openExportStudio = ({
    sourceSlots,
    title,
    subtitle,
    mode,
  }: {
    sourceSlots: OTSlot[];
    title: string;
    subtitle: string;
    mode: ExportStudioMode;
  }) => {
    if (sourceSlots.length === 0) {
      setStatusTone('danger');
      setStatusMessage('There are no OT rows to export with the current filters.');
      return;
    }

    const nextColumns = createExportColumns();
    setExportColumns(nextColumns);
    setSelectedExportColumnKey(nextColumns[0]?.key ?? EXPORT_COLUMN_KEYS[0]);
    setExportRows(buildExportRows(sourceSlots));
    setExportStudioTitle(title);
    setExportStudioSubtitle(subtitle);
    setExportStudioMode(mode);
    setSelectedExportRowIndex(null);
    setExportRowQuery('');
    setExportStudioOpen(true);
  };

  const openManagerExportStudio = () => {
    openExportStudio({
      sourceSlots: filteredSlots,
      title: 'Export Studio',
      subtitle: 'Review, rename columns, and fine-tune the OT table before downloading.',
      mode: 'manager',
    });
  };

  const refreshExportStudio = () => {
    const sourceSlots = exportStudioMode === 'claimed_report' ? dashboardClaimedSlots : filteredSlots;
    setExportRows(buildExportRows(sourceSlots));
    setSelectedExportRowIndex(null);
  };

  const updateExportColumnLabel = (key: string, value: string) => {
    setExportColumns((current) =>
      current.map((column) =>
        column.key === key ? { ...column, label: value } : column,
      ),
    );
  };

  const updateExportColumnVisibility = (key: string, visible: boolean) => {
    setExportColumns((current) =>
      current.map((column) => (column.key === key ? { ...column, visible } : column)),
    );
  };

  const updateExportColumnAlign = (key: string, align: ExportAlignment) => {
    setExportColumns((current) =>
      current.map((column) => (column.key === key ? { ...column, align } : column)),
    );
  };

  const updateExportColumnWidth = (key: string, width: number) => {
    setExportColumns((current) =>
      current.map((column) =>
        column.key === key ? { ...column, width: Math.max(100, Math.min(320, width)) } : column,
      ),
    );
  };

  const updateExportCell = (rowIndex: number, key: string, value: string) => {
    setExportRows((current) =>
      current.map((row, index) =>
        index === rowIndex ? { ...row, [key]: value } : row,
      ),
    );
  };

  const visibleExportColumns = exportColumns.filter((column) => column.visible);
  const selectedExportColumn =
    exportColumns.find((column) => column.key === selectedExportColumnKey) ?? exportColumns[0] ?? null;
  const filteredExportRows = exportRows
    .map((row, rowIndex) => ({ row, rowIndex }))
    .filter(({ row }) => {
      const query = exportRowQuery.trim().toLowerCase();
      if (!query) {
        return true;
      }

      return visibleExportColumns.some((column) =>
        String(row[column.key] ?? '').toLowerCase().includes(query),
      );
    });

  const addExportRow = () => {
    setExportRows((current) => [...current, createBlankExportRow(exportColumns)]);
    setSelectedExportRowIndex(exportRows.length);
  };

  const duplicateSelectedExportRow = () => {
    if (selectedExportRowIndex === null || !exportRows[selectedExportRowIndex]) {
      return;
    }

    setExportRows((current) => {
      const next = [...current];
      next.splice(selectedExportRowIndex + 1, 0, { ...current[selectedExportRowIndex] });
      return next;
    });
    setSelectedExportRowIndex(selectedExportRowIndex + 1);
  };

  const deleteSelectedExportRow = () => {
    if (selectedExportRowIndex === null || !exportRows[selectedExportRowIndex]) {
      return;
    }

    setExportRows((current) => current.filter((_, index) => index !== selectedExportRowIndex));
    setSelectedExportRowIndex(null);
  };

  const downloadExportCsv = (sheet: CsvSheet = 'ot-data') => {
    const today = new Date().toISOString().slice(0, 10);
    const label = exportStudioMode === 'claimed_report' ? 'claimed-report' : 'manager-export';
    const bom = '﻿';

    if (sheet === 'ot-data') {
      downloadCsvProfessional(visibleExportColumns, filteredExportRows.map(({ row }) => row), label);
      return;
    }

    const allRows = filteredExportRows.map(({ row }) => row);
    let csv = '';
    let filename = '';

    if (sheet === 'employee-summary') {
      csv = buildCsvEmployeeSummary(allRows);
      filename = `Outplex-${label}-by-employee-${today}.csv`;
    } else if (sheet === 'lob-summary') {
      csv = buildCsvLobSummary(allRows);
      filename = `Outplex-${label}-by-lob-${today}.csv`;
    } else if (sheet === 'date-summary') {
      csv = buildCsvDateSummary(allRows);
      filename = `Outplex-${label}-by-date-${today}.csv`;
    } else {
      csv = buildCsvDashboardKpis(allRows);
      filename = `Outplex-${label}-dashboard-kpis-${today}.csv`;
    }

    downloadBlob(bom + csv, filename, 'text/csv');
  };

  const downloadExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      const params = new URLSearchParams({ status: filter });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (supervisorFilter !== 'all') params.set('supervisorFilter', String(supervisorFilter));
      if (employeeQuery.trim()) params.set('employeeQuery', employeeQuery.trim());

      const res = await fetch(`/api/ot/export/xlsx?${params.toString()}`);
      if (!res.ok) {
        const { error } = await res.json() as { error?: string };
        toast.error(error ?? 'Unable to generate the Excel report.');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Outplex-OT-Report-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Unable to generate the Excel report.');
    } finally {
      setExportingXlsx(false);
    }
  };

  const downloadExportPdf = (
    columns: ExportColumn[] = visibleExportColumns,
    rows: ExportRow[] = filteredExportRows.map(({ row }) => row),
  ) => {
    const doc = new jsPDF({ orientation: exportPdfOrientation });
    doc.setFontSize(16);
    doc.text(exportStudioTitle, 14, 15);
    autoTable(doc, {
      startY: 22,
      head: [columns.map((column) => column.label)],
      body: rows.map((row) => columns.map((column) => row[column.key] ?? '')),
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineColor: [34, 42, 63],
        lineWidth: 0.1,
      },
      columnStyles: Object.fromEntries(
        columns.map((column, index) => [index, { halign: column.align }]),
      ),
      headStyles: {
        fillColor: [24, 30, 47],
        textColor: [241, 245, 249],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 247, 250],
      },
      margin: { left: 10, right: 10 },
    });
    doc.save(`ot-manager-export-${Date.now()}.pdf`);
  };

  return (
    <div>
      <div className="otm-header animate-fade-in">
        <div>
          <h1 className="otm-title">OT Manager</h1>
          <p className="otm-subtitle">
            Dashboard comparisons, claim oversight, reassignments, and secure OT cleanup for moderators and IT.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <BarChart3 size={15} /> Dashboard
          </button>
          <button className={`btn ${activeTab === 'manager' ? 'btn-primary' : ''}`} onClick={() => setActiveTab('manager')}>
            <CalendarDays size={15} /> OT Management
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            borderRadius: 12,
            padding: '0.9rem 1rem',
            marginBottom: '1rem',
            background: statusTone === 'success' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            border: statusTone === 'success' ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(239, 68, 68, 0.2)',
            color: statusTone === 'success' ? 'var(--text-primary)' : '#fecaca',
          }}
        >
          <AlertCircle size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <>
          <section className="card otm-dashboard-toolbar animate-fade-in delay-75">
            <div>
              <h2 className="card-title" style={{ marginBottom: '0.35rem' }}>Claimed OT Dashboard Range</h2>
              <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                Default range is the last 2 weeks so moderators can review selected OT, export claimed-hour reports, and inspect the people who already worked those slots.
              </div>
            </div>
            <div className="otm-toolbar-actions">
              <ModernSelect
                label="Quick range"
                className="w-48"
                value={dashboardQuickRange}
                onValueChange={v => applyDashboardQuickRange(v as DashboardQuickRangeKey)}
                options={[
                  { label: 'Last 2 weeks', value: 'last_14_days' },
                  { label: 'Last 30 days', value: 'last_30_days' },
                  { label: 'Custom range', value: 'custom' }
                ]}
              />
              <ModernDatePicker
                label="From"
                date={dashboardDateFrom}
                onDateChange={v => {
                  setDashboardQuickRange('custom');
                  setDashboardDateFrom(v);
                }}
              />
              <ModernDatePicker
                label="To"
                date={dashboardDateTo}
                onDateChange={v => {
                  setDashboardQuickRange('custom');
                  setDashboardDateTo(v);
                }}
              />
              <button className="btn btn-ghost" onClick={clearDashboardFilters}>
                <ListFilter size={15} /> Reset range
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const cols = createExportColumns();
                  const rows = buildExportRows(dashboardClaimedSlots);
                  downloadCsvProfessional(cols, rows, 'claimed-report');
                }}
              >
                <FileSpreadsheet size={15} /> CSV
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const cols = createExportColumns();
                  const rows = buildExportRows(dashboardClaimedSlots);
                  downloadExportPdf(cols, rows);
                }}
              >
                <FileText size={15} /> PDF
              </button>
            </div>
          </section>

          <div className="otm-stats animate-fade-in delay-100">
            <SummaryCard label="Claimed Slots" value={`${dashboardStats.claimed.length}`} icon={<CalendarDays size={16} />} />
            <SummaryCard label="Open Slots" value={`${dashboardStats.available.length}`} icon={<BarChart3 size={16} />} />
            <SummaryCard label="Claimed Hours" value={dashboardStats.totalClaimedHours.toFixed(1)} icon={<Clock3 size={16} />} />
            <SummaryCard label="Employees In OT" value={`${dashboardStats.uniqueEmployees}`} icon={<Users size={16} />} />
          </div>

          <div className="otm-dashboard-highlights animate-fade-in delay-150">
            <InsightCard
              label="Utilization"
              value={`${dashboardHighlights.utilizationRate}%`}
              helper="Claimed slots versus the full OT pool."
              icon={<TrendingUp size={15} />}
            />
            <InsightCard
              label="Busiest Employee"
              value={dashboardHighlights.busiestEmployee?.user?.name ?? 'No OT yet'}
              helper={
                dashboardHighlights.busiestEmployee
                  ? `${dashboardHighlights.busiestEmployee.totalHours.toFixed(1)}h across ${dashboardHighlights.busiestEmployee.slots.length} slot(s).`
                  : 'No claimed OT has been recorded.'
              }
              icon={<Flame size={15} />}
            />
            <InsightCard
              label="Busiest Day"
              value={dashboardHighlights.busiestDay ? formatOTDate(dashboardHighlights.busiestDay.date) : 'No activity'}
              helper={
                dashboardHighlights.busiestDay
                  ? `${dashboardHighlights.busiestDay.hours.toFixed(1)} claimed hour(s) and ${dashboardHighlights.busiestDay.claimed} claimed slot(s).`
                  : 'No claimed OT has been recorded.'
              }
              icon={<CalendarDays size={15} />}
            />
            <InsightCard
              label="Upcoming Open OT"
              value={`${dashboardHighlights.upcomingOpenSlots}`}
              helper="Open OT slots scheduled within the next 7 days."
              icon={<Layers3 size={15} />}
            />
          </div>

          <div className="otm-dashboard-grid animate-fade-in delay-200">
            <section className="card">
              <div className="card-header">
                <h2 className="card-title">OT Status Mix</h2>
              </div>
              {statusDistributionData.length === 0 ? (
                <div className="text-muted">No OT slots available for charting yet.</div>
              ) : (
                <div className="otm-chart-panel">
                  <div className="otm-chart-shell">
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={statusDistributionData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={56}
                          outerRadius={86}
                          paddingAngle={4}
                        >
                          {statusDistributionData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: '#101425',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 12,
                            color: '#f1f5f9',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="otm-chart-legend">
                    {statusDistributionData.map((entry) => (
                      <div key={entry.name} className="otm-legend-row">
                        <span className="otm-legend-dot" style={{ background: entry.color }} />
                        <span>{entry.name}</span>
                        <strong>{entry.value}</strong>
                      </div>
                    ))}
                    <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.55 }}>
                      This donut shows how much OT is already taken versus how much is still open for agents.
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Employee Hours Leaderboard</h2>
              </div>
              {topEmployeeChartData.length === 0 ? (
                <div className="text-muted">No claimed OT yet.</div>
              ) : (
                <div className="otm-chart-panel">
                  <div className="otm-chart-shell">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={topEmployeeChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          cursor={{ fill: 'rgba(124, 108, 255, 0.06)' }}
                          contentStyle={{
                            background: '#101425',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 12,
                            color: '#f1f5f9',
                          }}
                        />
                        <Bar
                          dataKey="hours"
                          radius={[10, 10, 0, 0]}
                          fill={CHART_COLORS[0]}
                          onClick={(_, index) => {
                            const clickedEmployee = typeof index === 'number' ? topEmployeeChartData[index] : null;
                            if (clickedEmployee?.userId) {
                              setSelectedEmployeeId(clickedEmployee.userId);
                            }
                          }}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="metric-list">
                    {topEmployeeChartData.map((employee) => (
                      <button
                        key={employee.userId}
                        type="button"
                        className={`metric-item employee-item ${selectedEmployeeId === employee.userId ? 'employee-item-active' : ''}`}
                        onClick={() => setSelectedEmployeeId(employee.userId)}
                      >
                        <div>
                          <div style={{ fontWeight: 700 }}>{employee.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                            {employee.slots} claimed slot(s)
                          </div>
                        </div>
                        <strong>{employee.hours.toFixed(1)}h</strong>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="card otm-grid-span-2">
              <div className="card-header">
                <h2 className="card-title">Daily OT Trend</h2>
              </div>
              {trendChartData.every((day) => day.claimedHours === 0 && day.openSlots === 0) ? (
                <div className="text-muted">There is not enough OT activity yet to plot a trend.</div>
              ) : (
                <div className="otm-chart-shell">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={trendChartData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="claimedHoursGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c6cff" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#7c6cff" stopOpacity={0.05} />
                        </linearGradient>
                        <linearGradient id="openSlotsGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                      <XAxis dataKey="shortLabel" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#101425',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12,
                          color: '#f1f5f9',
                        }}
                      />
                      <Area type="monotone" dataKey="claimedHours" stroke="#7c6cff" strokeWidth={2.5} fill="url(#claimedHoursGradient)" />
                      <Area type="monotone" dataKey="openSlots" stroke="#22d3ee" strokeWidth={2.2} fill="url(#openSlotsGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="card otm-resizable-card">
              <div className="card-header">
                <h2 className="card-title">LOB Comparison</h2>
              </div>
              {lobBreakdownData.length === 0 ? (
                <div className="text-muted">LOB comparison will appear after OT is claimed.</div>
              ) : (
                <div className="otm-chart-shell">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={lobBreakdownData} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" width={120} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{
                          background: '#101425',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: 12,
                          color: '#f1f5f9',
                        }}
                      />
                      <Bar dataKey="hours" radius={[0, 10, 10, 0]}>
                        {lobBreakdownData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Claimed Employee Summaries</h2>
                  <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                    Expand an employee to review every OT slot in the selected range and jump straight into OT Management.
                  </div>
                </div>
              </div>
              {employeeSummaries.length === 0 ? (
                <div className="text-muted">No claimed OT employees in this date range yet.</div>
              ) : (
                <div className="metric-list">
                  {employeeSummaries.map((employee) => {
                    const isExpanded = expandedEmployeeReports.has(employee.userId);
                    return (
                      <div
                        key={employee.userId}
                        className={`employee-report-card ${selectedEmployeeId === employee.userId ? 'employee-item-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="employee-report-summary"
                          onClick={() => toggleEmployeeReport(employee.userId)}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="employee-report-title-row">
                              <strong>{employee.user?.name ?? 'Employee'}</strong>
                              <span>Summary: {employee.totalHours.toFixed(1)}h</span>
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                              {employee.user?.employee_id || 'No employee ID'} • {employee.email || 'No email'}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                              {employee.slots.length} claimed slot(s) inside the active report range.
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>

                        {isExpanded && (
                          <div className="employee-report-slot-list">
                            {employee.slots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                className="employee-report-slot-button"
                                onClick={() => focusSlotInManager(slot, employee.user?.employee_id ?? employee.userId)}
                              >
                                <div>
                                  <div style={{ fontWeight: 700 }}>{formatOTDate(slot.date)}</div>
                                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                    {formatTime(slot.start_time)} to {formatTime(slot.end_time)} • {slot.shift_label ?? 'OT Shift'}
                                  </div>
                                </div>
                                <div className="employee-report-slot-tail">
                                  <strong>{slot.duration_hrs}h</strong>
                                  <ArrowRight size={15} />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card otm-grid-span-2">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Monthly OT Calendar Explorer</h2>
                  <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                    Review the month day by day, then open the exact employee OT slot directly in OT Management.
                  </div>
                </div>
                <div className="otm-calendar-nav">
                  {selectedCalendarDate ? (
                    <button className="btn btn-ghost" onClick={() => setSelectedCalendarDate(null)}>
                      <ChevronLeft size={15} /> Back to month
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeCalendarMonth(-1)}>
                        <ChevronLeft size={14} />
                      </button>
                      <div className="otm-calendar-month-label">
                        <CalendarRange size={15} />
                        <span>
                          {new Date(`${calendarMonth}T00:00:00`).toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeCalendarMonth(1)}>
                        <ArrowRight size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {calendarMonthSummary.length === 0 ? (
                <div className="text-muted">No OT data is available for this month yet.</div>
              ) : selectedCalendarDate ? (
                <div className="otm-day-detail-shell">
                  <div className="otm-day-detail-summary">
                    <div className="summary-mini-card">
                      <span>Date</span>
                      <strong>{formatOTDate(selectedCalendarDate)}</strong>
                    </div>
                    <div className="summary-mini-card">
                      <span>Available OT</span>
                      <strong>{selectedCalendarAvailableSlots.length}</strong>
                    </div>
                    <div className="summary-mini-card">
                      <span>Employees Who Claimed OT</span>
                      <strong>{selectedCalendarClaimedSlots.length}</strong>
                    </div>
                  </div>

                  <div className="otm-day-detail-columns">
                    <div className="otm-day-detail-card">
                      <h3 style={{ marginTop: 0 }}>Open OT that day</h3>
                      {selectedCalendarAvailableSlots.length === 0 ? (
                        <div className="text-muted">No open OT slots were available that day.</div>
                      ) : (
                        <div className="metric-list">
                          {selectedCalendarAvailableSlots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              className="metric-item employee-report-slot-button"
                              onClick={() => focusSlotInManager(slot)}
                            >
                              <div>
                                <div style={{ fontWeight: 700 }}>{canonicalizeOTLob(slot.lob)}</div>
                                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                  {formatTime(slot.start_time)} to {formatTime(slot.end_time)} • Spot {slot.spot_id ?? 'No ID'}
                                </div>
                              </div>
                              <div className="employee-report-slot-tail">
                                <strong>Open</strong>
                                <ArrowRight size={15} />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="otm-day-detail-card">
                      <h3 style={{ marginTop: 0 }}>Employees who selected OT</h3>
                      {selectedCalendarClaimedSlots.length === 0 ? (
                        <div className="text-muted">No employees claimed OT that day.</div>
                      ) : (
                        <div className="metric-list">
                          {selectedCalendarClaimedSlots.map((slot) => (
                            <button
                              key={slot.id}
                              type="button"
                              className="metric-item employee-report-slot-button"
                              onClick={() => focusSlotInManager(slot, slot.claimedByUser?.employee_id ?? slot.claimed_by)}
                            >
                              <div>
                                <div style={{ fontWeight: 700 }}>{slot.claimedByUser?.name ?? 'Employee'}</div>
                                <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                  {formatTime(slot.start_time)} to {formatTime(slot.end_time)} • {slot.claimedByUser?.employee_id ?? 'No employee ID'}
                                </div>
                              </div>
                              <div className="employee-report-slot-tail">
                                <strong>{slot.duration_hrs}h</strong>
                                <ArrowRight size={15} />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="otm-month-calendar-shell">
                  <div className="otm-month-weekdays">
                    {WEEKDAY_LABELS.map((label) => (
                      <div key={label} className="otm-month-weekday">{label}</div>
                    ))}
                  </div>
                  <div className="otm-month-grid">
                    {calendarMonthGridCells.map((cell) =>
                      cell.empty ? (
                        <div key={cell.key} className="otm-month-cell otm-month-cell-empty" />
                      ) : (
                        <button
                          key={cell.key}
                          type="button"
                          className={`otm-month-cell otm-month-cell-${cell.tone}`}
                          onClick={() => setSelectedCalendarDate(cell.date)}
                        >
                          <span className="otm-month-day-number">{Number(cell.date.slice(8))}</span>
                          <strong>
                            {cell.claimedCount > 0
                              ? `${cell.claimedCount} claimed`
                              : cell.availableCount > 0
                                ? `${cell.availableCount} open`
                                : 'No OT'}
                          </strong>
                          <small>
                            {cell.claimedHours > 0
                              ? `${cell.claimedHours.toFixed(1)}h`
                              : cell.availableCount > 0
                                ? 'Open slots'
                                : 'No activity'}
                          </small>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="card otm-hidden-panel">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Claimed Employee Summaries</h2>
                  <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                    Expand an employee to review every OT slot in the selected range and jump straight into OT Management.
                  </div>
                </div>
              </div>
              {employeeSummaries.length === 0 ? (
                <div className="text-muted">No claimed OT employees in this date range yet.</div>
              ) : (
                <div className="metric-list">
                  {employeeSummaries.map((employee) => {
                    const isExpanded = expandedEmployeeReports.has(employee.userId);
                    return (
                      <div
                        key={employee.userId}
                        className={`employee-report-card ${selectedEmployeeId === employee.userId ? 'employee-item-active' : ''}`}
                      >
                        <button
                          type="button"
                          className="employee-report-summary"
                          onClick={() => toggleEmployeeReport(employee.userId)}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div className="employee-report-title-row">
                              <strong>{employee.user?.name ?? 'Employee'}</strong>
                              <span>Summary: {employee.totalHours.toFixed(1)}h</span>
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
                              {employee.user?.employee_id || 'No employee ID'} • {employee.email || 'No email'}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                              {employee.slots.length} claimed slot(s) inside the active report range.
                            </div>
                          </div>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>

                        {isExpanded && (
                          <div className="employee-report-slot-list">
                            {employee.slots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                className="employee-report-slot-button"
                                onClick={() => focusSlotInManager(slot, employee.user?.employee_id ?? employee.userId)}
                              >
                                <div>
                                  <div style={{ fontWeight: 700 }}>{formatOTDate(slot.date)}</div>
                                  <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                                    {formatTime(slot.start_time)} to {formatTime(slot.end_time)} • {slot.shift_label ?? 'OT Shift'}
                                  </div>
                                </div>
                                <div className="employee-report-slot-tail">
                                  <strong>{slot.duration_hrs}h</strong>
                                  <ArrowRight size={15} />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card otm-grid-span-2 otm-hidden-panel">
              <div className="card-header">
                <div>
                  <h2 className="card-title">Monthly OT Calendar Explorer</h2>
                  <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.35rem' }}>
                    Review the month day by day, then open the exact employee OT slot directly in OT Management.
                  </div>
                </div>
                <div className="otm-calendar-nav">
                  {selectedCalendarDate ? (
                    <button className="btn btn-ghost" onClick={() => setSelectedCalendarDate(null)}>
                      <ChevronLeft size={15} /> Back to month
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeCalendarMonth(-1)}>
                        <ChevronLeft size={14} />
                      </button>
                      <div className="otm-calendar-month-label">
                        <CalendarRange size={15} />
                        <span>
                          {new Date(`${calendarMonth}T00:00:00`).toLocaleDateString('en-US', {
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => changeCalendarMonth(1)}>
                        <ArrowRight size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {employeeCalendarHeatmap.length === 0 ? (
                <div className="text-muted">As employees claim OT, a day-by-day comparison grid will appear here.</div>
              ) : (
                <div className="otm-heatmap-shell">
                  <div className="otm-heatmap-grid">
                    <div className="otm-heatmap-corner">Employee</div>
                    {dashboardPeriodDates.map((date) => (
                      <div key={date} className="otm-heatmap-day">
                        {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    ))}
                    {employeeCalendarHeatmap.map((employee) => (
                      <Fragment key={employee.userId}>
                        <button
                          type="button"
                          className={`otm-heatmap-label ${selectedEmployeeId === employee.userId ? 'otm-heatmap-label-active' : ''}`}
                          onClick={() => setSelectedEmployeeId(employee.userId)}
                        >
                          <strong>{employee.name}</strong>
                          <span>{employee.employeeId || 'No ID'}</span>
                        </button>
                        {employee.cells.map((cell) => (
                          <button
                            key={`${employee.userId}-${cell.date}`}
                            type="button"
                            className="otm-heatmap-cell"
                            onClick={() => setSelectedEmployeeId(employee.userId)}
                            title={`${employee.name} · ${formatOTDate(cell.date)} · ${cell.hours.toFixed(1)}h`}
                            style={{
                              background:
                                cell.hours === 0
                                  ? 'rgba(255,255,255,0.03)'
                                  : `rgba(124, 108, 255, ${0.16 + (cell.hours / maxHeatmapHours) * 0.64})`,
                              borderColor:
                                selectedEmployeeId === employee.userId
                                  ? 'rgba(124,108,255,0.46)'
                                  : 'rgba(255,255,255,0.04)',
                            }}
                          >
                            {cell.hours > 0 ? cell.hours.toFixed(1) : ''}
                          </button>
                        ))}
                      </Fragment>
                    ))}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.55 }}>
                    Darker cells mean more OT hours on that day. Click an employee row to sync the detailed panel.
                  </div>
                </div>
              )}
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">Occupied OT Slots</h2>
              </div>
              {occupiedSlots.length === 0 ? (
                <div className="text-muted">No occupied OT slots right now.</div>
              ) : (
                <div className="metric-list">
                  {occupiedSlots.map((slot) => (
                    <div key={slot.id} className="metric-item occupied-item">
                      <div>
                        <div style={{ fontWeight: 700 }}>{slot.claimedByUser?.name ?? 'Assigned employee'}</div>
                        <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                          {formatOTDate(slot.date)} - {formatTime(slot.start_time)} to {formatTime(slot.end_time)}
                        </div>
                      </div>
                      <span className="badge badge-claimed">Occupied</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      ) : (
        <section className="card otm-resizable-card animate-fade-in delay-100">
          <div className="card-header">
            <h2 className="card-title">OT Management</h2>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <ModernSelect
                value={filter}
                onValueChange={v => setFilter(v as FilterKey)}
                options={[
                  { label: 'Claimed', value: 'claimed' },
                  { label: 'Available', value: 'available' },
                  { label: 'All', value: 'all' }
                ]}
              />
              <button className="btn btn-ghost" onClick={openManagerExportStudio}>
                <Download size={15} /> CSV
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const snapshotColumns = createExportColumns();
                  const snapshotRows = buildExportRows(filteredSlots);
                  downloadExportPdf(snapshotColumns, snapshotRows);
                }}
              >
                <FileText size={15} /> PDF
              </button>
            </div>
          </div>

          <div className="otm-filter-bar">
            <ModernSelect
              label="Quick range"
              value={quickRange}
              onValueChange={v => applyQuickRange(v as QuickRangeKey)}
              options={[
                { label: 'All dates', value: 'all' },
                { label: 'Last 7 days', value: 'last_7_days' },
                { label: 'Last 2 weeks', value: 'last_14_days' },
                { label: 'Custom range', value: 'custom' }
              ]}
            />
            <ModernDatePicker
              label="From"
              date={dateFrom}
              onDateChange={v => {
                setQuickRange('custom');
                setDateFrom(v);
              }}
            />
            <ModernDatePicker
              label="To"
              date={dateTo}
              onDateChange={v => {
                setQuickRange('custom');
                setDateTo(v);
              }}
            />
            <label className="otm-filter-field otm-filter-field-search">
              <span>Employee</span>
              <input
                className="input"
                value={employeeQuery}
                onChange={(event) => setEmployeeQuery(event.target.value)}
                placeholder="Name, employee ID, email..."
              />
            </label>
            <label className="otm-filter-field">
              <span>Team</span>
              <SupervisorFilter
                supervisors={allSupervisors.filter(([id]) => id !== currentUser.id)}
                currentSupervisorFilter={supervisorFilter}
                onFilterChange={setSupervisorFilter}
                currentUserRole={currentUser.role}
                currentUserId={currentUser.id}
              />
            </label>
            <button className="btn btn-ghost" onClick={() => { clearManagerFilters(); setSupervisorFilter('all'); }}>
              Clear filters
            </button>
          </div>

          <div className="otm-table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>LOB</th>
                  <th>Spot ID</th>
                  <th>Assigned To</th>
                  <th>Superior</th>
                  <th>Status</th>
                  {currentUser.role !== 'moderator_b1' && <th style={{ width: 190 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredSlots.map((slot) => {
                  const edit = getEditState(slot);
                  const isHighlighted = managerHighlightSlotId === slot.id;
                  return (
                    <tr key={slot.id} className={isHighlighted ? 'otm-highlight-row' : ''}>
                      <td>
                        <ModernDatePicker
                          date={edit.date}
                          onDateChange={v => setEditState(slot.id, { date: v })}
                          disabled={isReadOnly}
                        />
                      </td>
                      <td>
                        <ModernTimePicker
                          time={edit.start_time}
                          onTimeChange={v => setEditState(slot.id, { start_time: v })}
                        />
                      </td>
                      <td>
                        <ModernTimePicker
                          time={edit.end_time}
                          onTimeChange={v => setEditState(slot.id, { end_time: v })}
                        />
                      </td>
                      <td>
                          <ModernSelect
                            className="w-40"
                            value={canonicalizeOTLob(edit.lob)}
                            onValueChange={v => setEditState(slot.id, { lob: v })}
                            disabled={isReadOnly}
                            options={OT_LOB_OPTIONS.map((lob) => ({ label: lob, value: lob }))}
                          />
                        </td>
                      <td>
                        <input 
                          className="input"
                          style={{ width: '80px' }}
                          value={edit.spot_id || ''} 
                          onChange={(event) => setEditState(slot.id, { spot_id: event.target.value })} 
                          disabled={isReadOnly}
                        />
                      </td>
                      <td style={{ minWidth: 200 }}>
                        <ModernSelect
                          value={edit.assignedUserId || ''}
                          onValueChange={v => setEditState(slot.id, { assignedUserId: v })}
                          disabled={isReadOnly}
                          placeholder="Unassigned"
                          options={[
                            { label: 'Unassigned', value: '' },
                            ...users.map(u => ({ label: `${u.name}${u.employee_id ? ` (${u.employee_id})` : ''}`, value: u.id }))
                          ]}
                        />
                      </td>
                      <td>{usersById.get(slot.claimed_by ?? '')?.supervisor || '—'}</td>
                      <td>
                        <span className={`badge ${slot.status === 'claimed' ? 'badge-claimed' : 'badge-available'}`}>
                          {slot.status}
                        </span>
                      </td>
                      {currentUser.role !== 'moderator_b1' && (
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              title="Save changes"
                              onClick={() => void handleSave(slot)}
                              disabled={savingId === slot.id || isReadOnly}
                            >
                              <Save size={14} />
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--status-denied)' }}
                              title="Delete slot"
                              onClick={() => handleDelete(slot)}
                              disabled={savingId === slot.id || isReadOnly}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredSlots.length === 0 && <div className="text-muted" style={{ marginTop: '1rem' }}>No OT slots match the current filter.</div>}
          <div className="text-muted" style={{ marginTop: '1rem', fontSize: '0.8125rem' }}>
            {currentRole === 'admin' ? 'IT' : 'Moderator'} changes notify the affected employee automatically. Deletions require two confirmations.
          </div>
        </section>
      )}

      {exportStudioOpen && (
        <div className="modal-overlay" onClick={() => setExportStudioOpen(false)}>
          <div className="modal otm-export-modal" onClick={(event) => event.stopPropagation()}>
            <div className="otm-export-header">
              <div>
                <h3 style={{ margin: 0 }}>{exportStudioTitle}</h3>
                <p className="text-muted" style={{ margin: '0.45rem 0 0' }}>
                  {exportStudioSubtitle}
                </p>
              </div>
              <div className="otm-export-actions">
                <button className="btn btn-ghost" onClick={refreshExportStudio}>
                  Refresh Rows
                </button>
                <button className="btn btn-ghost" onClick={() => downloadExportPdf()}>
                  <FileText size={15} /> Download PDF
                </button>
                <ActionMenu
                  trigger={
                    <button className="btn btn-ghost">
                      <Download size={15} /> CSV <ChevronDown size={13} />
                    </button>
                  }
                >
                  <ActionMenuLabel>Select sheet to download</ActionMenuLabel>
                  <ActionMenuItem onClick={() => downloadExportCsv('ot-data')}>
                    OT Data (all rows)
                  </ActionMenuItem>
                  <ActionMenuItem onClick={() => downloadExportCsv('employee-summary')}>
                    Employee Summary
                  </ActionMenuItem>
                  <ActionMenuItem onClick={() => downloadExportCsv('lob-summary')}>
                    LOB Summary
                  </ActionMenuItem>
                  <ActionMenuItem onClick={() => downloadExportCsv('date-summary')}>
                    Date Summary
                  </ActionMenuItem>
                  <ActionMenuSeparator />
                  <ActionMenuItem onClick={() => downloadExportCsv('dashboard-kpis')}>
                    Dashboard KPIs
                  </ActionMenuItem>
                </ActionMenu>
                <button
                  className="btn btn-primary"
                  onClick={() => void downloadExportXlsx()}
                  disabled={exportingXlsx}
                >
                  <FileSpreadsheet size={15} />
                  {exportingXlsx ? 'Generating…' : 'Download XLSX'}
                </button>
              </div>
            </div>

            <div className="otm-export-summary">
              <div className="summary-mini-card">
                <span>Rows</span>
                <strong>{filteredExportRows.length}</strong>
              </div>
              <div className="summary-mini-card">
                <span>Visible columns</span>
                <strong>{visibleExportColumns.length}</strong>
              </div>
              <div className="summary-mini-card">
                <span>Filters</span>
                <strong>
                  {exportStudioMode === 'claimed_report'
                    ? `${dashboardDateFrom || normalizedDashboardDateFrom} to ${dashboardDateTo || normalizedDashboardDateTo}`
                    : quickRange === 'all'
                      ? 'Manual / all dates'
                      : quickRange.replace(/_/g, ' ')}
                </strong>
              </div>
              <div className="summary-mini-card">
                <span>PDF layout</span>
                <strong>{exportPdfOrientation}</strong>
              </div>
            </div>

            <div className="otm-export-toolbar">
              <label className="otm-filter-field otm-export-search">
                <span>Search rows</span>
                <input
                  className="input"
                  value={exportRowQuery}
                  onChange={(event) => setExportRowQuery(event.target.value)}
                  placeholder="Filter by employee, email, date, LOB..."
                />
              </label>
              <button className="btn btn-ghost" onClick={addExportRow}>
                Add row
              </button>
              <button
                className="btn btn-ghost"
                onClick={duplicateSelectedExportRow}
                disabled={selectedExportRowIndex === null}
              >
                Duplicate selected
              </button>
              <button
                className="btn btn-ghost otm-danger-btn"
                onClick={deleteSelectedExportRow}
                disabled={selectedExportRowIndex === null}
              >
                Delete selected
              </button>
            </div>

            <div className="otm-export-format-grid">
              <div className="otm-export-format-card">
                <div className="otm-export-format-title">Visible columns</div>
                <div className="otm-export-column-chips">
                  {exportColumns.map((column) => (
                    <label key={column.key} className={`otm-column-chip ${column.visible ? 'otm-column-chip-active' : ''}`}>
                      <input
                        type="checkbox"
                        style={{ display: 'none' }}
                        checked={column.visible}
                        onChange={(event) => updateExportColumnVisibility(column.key, event.target.checked)}
                      />
                      <span>{column.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="otm-export-format-card">
                <div className="otm-export-format-title">Format selected column</div>
                <div className="otm-export-format-fields">
                  <label className="otm-filter-field">
                    <span>Column</span>
                    <ModernSelect
                      value={selectedExportColumnKey}
                      onValueChange={v => setSelectedExportColumnKey(v)}
                      options={exportColumns.map(column => ({
                        label: column.label,
                        value: column.key
                      }))}
                    />
                  </label>
                  <label className="otm-filter-field">
                    <span>Alignment</span>
                    <ModernSelect
                      value={selectedExportColumn?.align ?? 'left'}
                      onValueChange={v => selectedExportColumn && updateExportColumnAlign(selectedExportColumn.key, v as ExportAlignment)}
                      options={[
                        { label: 'Left', value: 'left' },
                        { label: 'Center', value: 'center' },
                        { label: 'Right', value: 'right' }
                      ]}
                    />
                  </label>
                  <label className="otm-filter-field">
                    <span>Width</span>
                    <input
                      className="input"
                      type="number"
                      min="100"
                      max="320"
                      value={selectedExportColumn?.width ?? 160}
                      onChange={(event) => selectedExportColumn && updateExportColumnWidth(selectedExportColumn.key, Number(event.target.value))}
                    />
                  </label>
                  <label className="otm-filter-field">
                    <span>PDF orientation</span>
                    <ModernSelect
                      value={exportPdfOrientation}
                      onValueChange={v => setExportPdfOrientation(v as 'landscape' | 'portrait')}
                      options={[
                        { label: 'Landscape', value: 'landscape' },
                        { label: 'Portrait', value: 'portrait' }
                      ]}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="otm-export-table-shell">
              <table className="data-table otm-export-table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    {visibleExportColumns.map((column) => (
                      <th key={column.key}>
                        <input
                          className="input otm-export-header-input"
                          value={column.label}
                          onChange={(event) => updateExportColumnLabel(column.key, event.target.value)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredExportRows.map(({ row, rowIndex }, visibleIndex) => (
                    <tr
                      key={`export-row-${rowIndex}`}
                      className={selectedExportRowIndex === rowIndex ? 'otm-export-row-selected' : ''}
                    >
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setSelectedExportRowIndex(rowIndex)}
                        >
                          {visibleIndex + 1}
                        </button>
                      </td>
                      {visibleExportColumns.map((column) => (
                        <td key={`${column.key}-${rowIndex}`} style={{ textAlign: column.align }}>
                          <input
                            className="input otm-export-cell-input"
                            value={row[column.key] ?? ''}
                            onChange={(event) => updateExportCell(rowIndex, column.key, event.target.value)}
                            style={{ minWidth: column.width }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="modal-overlay" onClick={() => setDeleteDialog(null)}>
          <div className="modal otm-modal" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <AlertCircle size={18} style={{ color: '#f87171' }} />
              <h3 style={{ margin: 0 }}>
                {deleteDialog.step === 1 ? 'Remove this OT slot?' : 'Final warning before deletion'}
              </h3>
            </div>
            <p className="text-muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
              {deleteDialog.step === 1
                ? `This OT slot will be removed from employee selection: ${formatSlotLabel(deleteDialog.slot)}.`
                : 'This slot will be cancelled and disappear from the active OT pool. Continue only if you are sure.'}
            </p>
            <div className="otm-modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteDialog(null)}>
                Cancel
              </button>
              <button
                className={`btn ${deleteDialog.step === 1 ? 'btn-primary' : 'btn-ghost otm-danger-btn'}`}
                onClick={() =>
                  deleteDialog.step === 1
                    ? setDeleteDialog({ slot: deleteDialog.slot, step: 2 })
                    : void executeDelete(deleteDialog.slot)
                }
                disabled={savingId === deleteDialog.slot.id}
              >
                {savingId === deleteDialog.slot.id
                  ? 'Removing...'
                  : deleteDialog.step === 1
                    ? 'Continue'
                    : 'Delete slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .otm-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
        }
        .otm-title {
          font-size: 1.875rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0 0 0.25rem;
        }
        .otm-subtitle {
          margin: 0;
          color: var(--text-secondary);
          font-size: 0.9375rem;
        }
        .otm-dashboard-toolbar {
          margin-bottom: 2.25rem;
        }
        .otm-resizable-card {
          resize: both;
          overflow: auto;
        }
        .otm-table-shell {
          resize: both;
          overflow: auto;
          min-height: 420px;
          border-radius: 16px;
        }
        .otm-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .otm-dashboard-highlights {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .otm-dashboard-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
          gap: 1.75rem;
        }
        .otm-grid-span-2 {
          grid-column: 1 / -1;
        }
        .summary-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 1rem 1.1rem;
        }
        .summary-label {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--text-muted);
        }
        .summary-value {
          font-size: 2rem;
          font-weight: 800;
          margin-top: 0.5rem;
        }
        .insight-card {
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          background: linear-gradient(145deg, rgba(124,108,255,0.12), rgba(11,13,20,0.65));
          padding: 1rem 1.05rem;
          display: grid;
          gap: 0.55rem;
        }
        .insight-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .insight-card-label {
          font-size: 0.74rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
        }
        .insight-card-value {
          font-size: 1.05rem;
          font-weight: 800;
          line-height: 1.35;
        }
        .insight-card-helper {
          color: var(--text-secondary);
          font-size: 0.8rem;
          line-height: 1.5;
        }
        .metric-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .metric-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
        }
        .employee-item {
          width: 100%;
          text-align: left;
          color: inherit;
          cursor: pointer;
          transition: border-color 0.2s ease, transform 0.2s ease;
        }
        .employee-item:hover {
          border-color: var(--border-default);
          transform: translateY(-1px);
        }
        .employee-item-active {
          border-color: rgba(99, 102, 241, 0.38);
          background: rgba(99, 102, 241, 0.12);
        }
        .otm-chart-panel {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(220px, 0.95fr);
          gap: 1rem;
          align-items: center;
        }
        .otm-chart-shell {
          width: 100%;
          min-height: 240px;
        }
        .otm-chart-legend {
          display: grid;
          gap: 0.75rem;
        }
        .otm-legend-row {
          display: grid;
          grid-template-columns: 10px 1fr auto;
          align-items: center;
          gap: 0.6rem;
          padding: 0.7rem 0.8rem;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }
        .otm-legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
        }
        .occupied-item {
          align-items: center;
        }
        .detail-slot-item {
          align-items: flex-start;
        }
        .employee-summary-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .summary-mini-card {
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          display: grid;
          gap: 0.25rem;
        }
        .summary-mini-card span {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
        }
        .summary-mini-card strong {
          font-size: 1.2rem;
        }
        .otm-heatmap-shell {
          display: grid;
          gap: 0.9rem;
        }
        .otm-heatmap-grid {
          display: grid;
          grid-template-columns: minmax(180px, 1.2fr) repeat(14, minmax(54px, 1fr));
          gap: 0.45rem;
          overflow-x: auto;
        }
        .otm-heatmap-corner,
        .otm-heatmap-day {
          padding: 0.55rem 0.4rem;
          text-align: center;
          font-size: 0.72rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }
        .otm-heatmap-label,
        .otm-heatmap-cell {
          min-height: 58px;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }
        .otm-heatmap-label {
          display: grid;
          gap: 0.2rem;
          padding: 0.7rem 0.8rem;
          text-align: left;
          color: inherit;
          cursor: pointer;
        }
        .otm-heatmap-label span {
          color: var(--text-muted);
          font-size: 0.76rem;
        }
        .otm-heatmap-label-active {
          border-color: rgba(124,108,255,0.4);
          background: rgba(124,108,255,0.12);
        }
        .otm-heatmap-cell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #f8fafc;
          font-size: 0.76rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, border-color 0.2s ease;
        }
        .otm-heatmap-cell:hover {
          transform: translateY(-1px);
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .card-title {
          font-size: 1rem;
          font-weight: 700;
          margin: 0;
        }
        .otm-filter-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .otm-filter-field {
          display: grid;
          gap: 0.35rem;
        }
        .otm-filter-field span {
          font-size: 0.74rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
        }
        .otm-filter-field-search {
          min-width: 220px;
        }
        .otm-hidden-panel {
          display: none;
        }
        .employee-report-card {
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          background: rgba(255,255,255,0.02);
          overflow: hidden;
        }
        .employee-report-summary {
          width: 100%;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 1rem 1.1rem;
          background: transparent;
          border: none;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .employee-report-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .employee-report-slot-list {
          display: grid;
          gap: 0.7rem;
          padding: 0 1rem 1rem;
        }
        .employee-report-slot-button {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: inherit;
          text-align: left;
        }
        .employee-report-slot-button:hover {
          border-color: rgba(124,108,255,0.32);
        }
        .employee-report-slot-tail {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--brand-primary-light);
        }
        .otm-calendar-nav {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .otm-calendar-month-label {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.03);
          font-weight: 700;
        }
        .otm-month-calendar-shell {
          display: grid;
          gap: 0.9rem;
        }
        .otm-month-weekdays,
        .otm-month-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .otm-month-weekday {
          font-size: 0.78rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          padding: 0 0.15rem;
        }
        .otm-month-cell {
          min-height: 118px;
          display: grid;
          gap: 0.35rem;
          align-content: start;
          padding: 0.9rem;
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.03);
          color: inherit;
          text-align: left;
        }
        .otm-month-cell-empty {
          background: transparent;
          border-style: dashed;
          opacity: 0.35;
        }
        .otm-month-cell-quiet {
          background: rgba(255,255,255,0.02);
        }
        .otm-month-cell-available {
          background: rgba(34,211,238,0.08);
          border-color: rgba(34,211,238,0.18);
        }
        .otm-month-cell-claimed {
          background: rgba(124,108,255,0.12);
          border-color: rgba(124,108,255,0.26);
        }
        .otm-month-cell-mixed {
          background: linear-gradient(135deg, rgba(124,108,255,0.14), rgba(34,211,238,0.1));
          border-color: rgba(124,108,255,0.28);
        }
        .otm-month-day-number {
          font-size: 1.15rem;
          font-weight: 800;
        }
        .otm-day-detail-shell {
          display: grid;
          gap: 1rem;
        }
        .otm-day-detail-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .otm-day-detail-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 1rem;
        }
        .otm-day-detail-card {
          padding: 1rem;
          border-radius: 18px;
          border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.02);
          min-width: 0;
        }
        .otm-modal {
          max-width: 520px;
          display: grid;
          gap: 1rem;
        }
        .otm-export-modal {
          width: min(1800px, calc(100vw - 1.5rem));
          max-width: none;
          max-height: calc(100vh - 2rem);
          display: grid;
          gap: 1rem;
          overflow: hidden;
        }
        .otm-export-header {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .otm-export-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .otm-export-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
        }
        .otm-export-toolbar {
          display: grid;
          grid-template-columns: minmax(260px, 1.3fr) repeat(3, auto);
          gap: 0.75rem;
          align-items: end;
        }
        .otm-export-search {
          min-width: 280px;
        }
        .otm-export-format-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: 1rem;
        }
        .otm-export-format-card {
          border: 1px solid var(--border-subtle);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          padding: 1rem;
          display: grid;
          gap: 0.85rem;
        }
        .otm-export-format-title {
          font-size: 0.82rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-weight: 700;
        }
        .otm-export-column-chips {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }
        .otm-column-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1.1rem;
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: rgba(255,255,255,0.04);
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          user-select: none;
        }
        .otm-column-chip:hover {
          background: rgba(255,255,255,0.08);
          border-color: var(--border-default);
          color: var(--text-primary);
        }
        .otm-column-chip-active {
          border-color: var(--brand-primary-light);
          background: rgba(124,108,255,0.22);
          color: white;
          box-shadow: 0 4px 15px rgba(124, 108, 255, 0.15);
        }
        .otm-export-format-fields {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .otm-export-table-shell {
          overflow: auto;
          max-height: 54vh;
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          background: var(--bg-elevated);
        }
        .otm-export-table {
          min-width: 1200px;
        }
        .otm-export-table thead th {
          position: sticky;
          top: 0;
          background: #171d2d;
          z-index: 1;
        }
        .otm-export-header-input,
        .otm-export-cell-input {
          width: 100%;
          min-width: 140px;
        }
        .otm-export-header-input {
          font-weight: 700;
          background: rgba(255, 255, 255, 0.06);
        }
        .otm-export-row-selected td {
          background: rgba(124,108,255,0.08);
        }
        .otm-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .otm-danger-btn {
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.25);
        }
        .otm-danger-btn:hover {
          background: rgba(239, 68, 68, 0.08);
          color: #fecaca;
        }
        @media (max-width: 1100px) {
          .otm-header { flex-direction: column; }
          .otm-stats { grid-template-columns: repeat(2, 1fr); }
          .otm-dashboard-highlights { grid-template-columns: repeat(2, 1fr); }
          .otm-dashboard-grid { grid-template-columns: 1fr; }
          .otm-chart-panel { grid-template-columns: 1fr; }
          .otm-day-detail-columns { grid-template-columns: 1fr; }
          .otm-export-modal { width: calc(100vw - 1rem); }
          .otm-export-toolbar,
          .otm-export-format-grid,
          .otm-export-format-fields {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .otm-stats { grid-template-columns: 1fr; }
          .otm-dashboard-highlights { grid-template-columns: 1fr; }
          .employee-summary-grid { grid-template-columns: 1fr; }
          .otm-heatmap-grid { grid-template-columns: minmax(160px, 1.1fr) repeat(14, minmax(46px, 1fr)); }
          .otm-month-weekdays,
          .otm-month-grid,
          .otm-day-detail-summary {
            grid-template-columns: 1fr;
          }
          .employee-report-summary,
          .employee-report-slot-button {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: ReactNode;
}) {
  return (
    <div className="summary-card">
      <div className="summary-label">{label}</div>
      <div className="summary-value">{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
        {icon}
        <span>Live OT metric</span>
      </div>
    </div>
  );
}

function InsightCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="insight-card">
      <div className="insight-card-top">
        <span className="insight-card-label">{label}</span>
        <span style={{ color: 'var(--brand-primary-light)' }}>{icon}</span>
      </div>
      <div className="insight-card-value">{value}</div>
      <div className="insight-card-helper">{helper}</div>
    </div>
  );
}
