'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  History,
  IdCard,
  Mail,
  PencilLine,
  Save,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
  UserCog,
  Users,
  Plus,
  Minus,
  LogOut,
} from 'lucide-react';
import Papa from 'papaparse';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { UserRole, LedgerEntry, User } from '@/types/database';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import { canEditTool } from '@/lib/permissions';
import { SupervisorFilter } from '@/components/SupervisorFilter';
import { PromptDialog } from '@/components/ui/PromptDialog';
import { MobileDataFrame } from '@/components/ui/MobileDataFrame';
import { ModernSelect } from '@/components/ui/Select';
import { useTransferState } from '@/components/uploads/useTransferState';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { readFileAsTextWithProgress } from '@/lib/file-transfer';

interface EmployeeDirectoryUser {
  id: string;
  name: string;
  email: string | null;
  employee_id: string | null;
  role: UserRole;
  points: number;
  department: string | null;
  supervisor: string | null;
  supervisor_id: string | null;
  avatar_url: string | null;
  created_at: string | null;
  is_approved: boolean | null;
}

interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: UserRole;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  notes?: string | null;
  user: EmployeeDirectoryUser | null;
}

type TabKey = 'directory' | 'role-requests' | 'points' | 'activity';

interface CsvImportRow {
  identifier: string;
  rawPoints: number;
  matchedEmployee: EmployeeDirectoryUser | null;
}

function formatDelta(points: number) {
  return `${points >= 0 ? '+' : '-'}${Math.abs(points)} pts`;
}

function initialsFromName(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function UsersManagerClient({
  currentUser,
  initialEmployees = [],
  initialLedger = [],
  initialRoleRequests = [],
}: {
  currentUser: User;
  initialEmployees?: EmployeeDirectoryUser[];
  initialLedger?: LedgerEntry[];
  initialRoleRequests?: RoleRequest[];
}) {
  const router = useRouter();
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const [activeTab, setActiveTab] = useState<TabKey>(initialRoleRequests.length > 0 ? 'role-requests' : 'directory');
  const [employees, setEmployees] = useState<EmployeeDirectoryUser[]>(initialEmployees);
  const [ledger, setLedger] = useState<LedgerEntry[]>(initialLedger);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>(initialRoleRequests);
  const [draftPoints, setDraftPoints] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialEmployees.map((employee) => [employee.id, String(employee.points)])),
  );
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [directoryRoleFilter, setDirectoryRoleFilter] = useState<UserRole | 'all'>('all');
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState<'all' | 'new-logins' | 'approved' | 'pending'>('all');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [activityQuery, setActivityQuery] = useState('');
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [denyReasonModal, setDenyReasonModal] = useState<{ employee: EmployeeDirectoryUser } | null>(null);
  const [managerHighlightSlotId, setManagerHighlightSlotId] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [editingDirectoryId, setEditingDirectoryId] = useState<string | null>(null);
  const [directoryEditForm, setDirectoryEditForm] = useState<{
    name: string;
    employee_id: string;
    role: UserRole;
    department: string;
    supervisor_id: string | 'none';
  }>({ name: '', employee_id: '', role: 'employee', department: '', supervisor_id: 'none' });
  const [revokeConfirm, setRevokeConfirm] = useState<EmployeeDirectoryUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EmployeeDirectoryUser | null>(null);
  const [logoutConfirm, setLogoutConfirm] = useState<EmployeeDirectoryUser | null>(null);
  const [resetPointsConfirmOpen, setResetPointsConfirmOpen] = useState(false);
  const [resetPointsConfirmText, setResetPointsConfirmText] = useState('');
  const [resetPointsReason, setResetPointsReason] = useState('');
  const [resetPointsLoading, setResetPointsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [allDepartments, setAllDepartments] = useState<{ value: string; label: string; group: string }[]>([]);

  useEffect(() => {
    fetch('/api/departments')
      .then(r => r.json())
      .then(d => { if (d.departments) setAllDepartments(d.departments); })
      .catch(() => {});
  }, []);

  // Auto-scroll to confirm modal when opened
  useEffect(() => {
    if ((revokeConfirm || deleteConfirm || logoutConfirm || resetPointsConfirmOpen) && modalRef.current) {
      modalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [revokeConfirm, deleteConfirm, logoutConfirm, resetPointsConfirmOpen]);

  useEffect(() => {
    if (!managerHighlightSlotId) return;

    const timeout = window.setTimeout(() => setManagerHighlightSlotId(null), 2400);

    if (activeTab === 'directory') {
      window.requestAnimationFrame(() => {
        const element = document.querySelector(`[data-user-row="${managerHighlightSlotId}"]`);
        if (element instanceof HTMLElement) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    return () => window.clearTimeout(timeout);
  }, [activeTab, managerHighlightSlotId]);

  function renderRoleBadge(role: UserRole) {
    const base = { display: 'inline-flex', alignItems: 'center', gap: '4.4px', fontWeight: 700, padding: '0.4rem 0.75rem', borderRadius: '10px', fontSize: '0.72rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
    switch (role) {
      case 'admin':
        return <span style={{ ...base, background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15))', border: '1px solid rgba(139, 92, 246, 0.3)', color: '#a78bfa' }}><ShieldCheck size={13} /> ADMIN IT</span>;
      case 'moderator_a1':
        return <span style={{ ...base, backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)' }}><ShieldCheck size={13} /> MOD A1</span>;
      case 'moderator_b1':
        return <span style={{ ...base, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.25)' }}><IdCard size={13} /> MOD B1</span>;
      case 'moderator':
        return <span style={{ ...base, backgroundColor: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.25)' }}><ShieldCheck size={13} /> MODERATOR</span>;
      case 'employee':
      default:
        return <span style={{ ...base, color: '#a1a1aa', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}><Users size={13} /> EMPLOYEE</span>;
    }
  }

  async function saveDirectoryEdit(employee: EmployeeDirectoryUser) {
    if (!canEditTool(currentUser.role, 'employees')) return;
    if (!directoryEditForm.name.trim()) {
      setStatusTone('danger');
      setStatusMessage('Employee name is required.');
      return;
    }
    if (directoryEditForm.role !== 'employee' && !directoryEditForm.department.trim()) {
      setStatusTone('danger');
      setStatusMessage('Department is required when assigning a special role.');
      return;
    }
    try {
      setSavingIds(prev => new Set(prev).add(employee.id));

      const res = await fetch('/api/moderator/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: employee.id,
          name: directoryEditForm.name.trim(),
          employee_id: directoryEditForm.employee_id.trim() || null,
          role: directoryEditForm.role,
          department: directoryEditForm.department,
          supervisor_id: directoryEditForm.supervisor_id === 'none' ? null : directoryEditForm.supervisor_id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');

      setEmployees(prev => prev.map(e =>
        e.id === employee.id
          ? {
              ...e,
              name: data.user?.name ?? directoryEditForm.name,
              employee_id: data.user?.employee_id ?? (directoryEditForm.employee_id || null),
              role: data.user?.role ?? directoryEditForm.role,
              department: data.user?.department ?? null,
              supervisor_id: data.user?.supervisor_id ?? (directoryEditForm.supervisor_id === 'none' ? null : directoryEditForm.supervisor_id),
              supervisor: data.user?.supervisor ?? employee.supervisor,
              is_approved: data.user?.is_approved ?? employee.is_approved,
            }
          : e,
      ));
      setEditingDirectoryId(null);
      setStatusTone('success');
      setStatusMessage(
        data.roleChanged
          ? `Updated ${employee.name}. They will see an access-change warning and re-select their department on next login.`
          : `Updated ${employee.name} successfully.`,
      );
    } catch (err) {
      setStatusTone('danger');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to update employee details.');
    } finally {
      setSavingIds(prev => { const next = new Set(prev); next.delete(employee.id); return next; });
    }
  }

  async function executeRevoke(employee: EmployeeDirectoryUser) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/moderator/users/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: employee.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke');
      setEmployees(prev => prev.map(e =>
        e.id === employee.id ? { ...e, role: 'employee', department: null, is_approved: false } : e
      ));
      setStatusTone('success');
      setStatusMessage(`Role revoked for ${employee.name}. They will see a notification on next login.`);
    } catch (err) {
      setStatusTone('danger');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to revoke role.');
    } finally {
      setActionLoading(false);
      setRevokeConfirm(null);
    }
  }

  async function executeDelete(employee: EmployeeDirectoryUser) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/moderator/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: employee.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete');
      setEmployees(prev => prev.filter(e => e.id !== employee.id));
      setStatusTone('success');
      setStatusMessage(`${employee.name} has been permanently deleted from the system.`);
    } catch (err) {
      setStatusTone('danger');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setActionLoading(false);
      setDeleteConfirm(null);
    }
  }

  async function executeLogout(employee: EmployeeDirectoryUser) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/users/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: employee.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to revoke sessions');

      setStatusTone('success');
      setStatusMessage(`Sessions revoked for ${employee.name}. They will be signed out on their next action.`);
      setLogoutConfirm(null);
    } catch (err) {
      setStatusTone('danger');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to revoke sessions.');
    } finally {
      setActionLoading(false);
    }
  }

  async function submitPlatformAccessDecision(employee: EmployeeDirectoryUser, decision: 'approved' | 'denied', reason?: string) {
    try {
      const res = await fetch('/api/moderator/users/access-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: employee.id,
          decision,
          reason: reason?.trim() || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? 'Failed to review access.');

      setEmployees((prev) =>
        prev.map((entry) =>
          entry.id === employee.id
            ? { ...entry, is_approved: decision === 'approved' }
            : entry,
        ),
      );
      setStatusTone('success');
      setStatusMessage(
        decision === 'approved'
          ? `${employee.name} can now enter the platform and complete onboarding.`
          : `${employee.name} was denied access. They will see the denial reason on login.`,
      );
    } catch (err) {
      setStatusTone('danger');
      setStatusMessage(err instanceof Error ? err.message : 'Failed to review access.');
    }
  }
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusTone, setStatusTone] = useState<'success' | 'danger'>('success');
  const [csvPreview, setCsvPreview] = useState<CsvImportRow[] | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [applyingCsv, setApplyingCsv] = useState(false);
  const [supervisorFilter, setSupervisorFilter] = useState<string | 'all' | 'my-team'>('all');
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!statusMessage) return;
    const timeout = window.setTimeout(() => setStatusMessage(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const currentRole = currentUser.role;
  const isB1 = currentRole === 'moderator_b1';
  const isReadOnly = !canEditTool(currentRole, 'employees');
  const canResetPoints = ['admin', 'moderator', 'moderator_a1'].includes(currentRole);

  const executeResetAllPoints = async () => {
    if (!canResetPoints) return;
    try {
      setResetPointsLoading(true);

      const res = await fetch('/api/moderator/points/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirm: resetPointsConfirmText.trim(),
          reason: resetPointsReason.trim() || undefined,
        }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error ?? 'Failed to reset points.');
      }

      setEmployees((current) => current.map((u) => ({ ...u, points: 0 })));
      setDraftPoints((current) => Object.fromEntries(Object.entries(current).map(([id]) => [id, '0'])));
      toast.success('Points reset successfully.', {
        description: `Reset ${payload.resetCount ?? 0} balance(s) to 0.`,
        duration: 3500,
      });
      setResetPointsConfirmOpen(false);
      setResetPointsConfirmText('');
      setResetPointsReason('');
      router.refresh();
    } catch (error) {
      toast.error('Unable to reset points.', {
        description: error instanceof Error ? error.message : 'Unknown error',
        duration: 4500,
      });
    } finally {
      setResetPointsLoading(false);
    }
  };

  useEffect(() => {
    setEmployees(initialEmployees);
    setDraftPoints(Object.fromEntries(initialEmployees.map((employee) => [employee.id, String(employee.points)])));
  }, [initialEmployees]);

  useEffect(() => {
    setLedger(initialLedger);
  }, [initialLedger]);

  useEffect(() => {
    setRoleRequests(initialRoleRequests);
  }, [initialRoleRequests]);

  const allSupervisors = useMemo(() => {
    const supervisors = new Map<string, string>();
    employees.forEach((u) => {
      if (u.supervisor_id && u.supervisor) {
        supervisors.set(u.supervisor_id, u.supervisor);
      }
    });
    return Array.from(supervisors.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [employees]);

  const filteredDirectory = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    return employees.filter((employee) => {
      if (directoryRoleFilter !== 'all' && employee.role !== directoryRoleFilter) return false;
      if (directoryStatusFilter === 'approved' && !employee.is_approved) return false;
      if (directoryStatusFilter === 'pending' && employee.is_approved) return false;
      if (
        directoryStatusFilter === 'new-logins' &&
        (employee.is_approved || employee.department || employee.supervisor_id || employee.employee_id)
      ) {
        return false;
      }
      
      const isSearchActive = query.length > 0;
      const shouldBypassFilter = isSearchActive && isB1;

      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (employee.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (employee.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!query) return true;
      return `${employee.name} ${employee.email ?? ''} ${employee.employee_id ?? ''} ${employee.department ?? ''} ${employee.supervisor ?? ''}`
        .toLowerCase()
        .includes(query);
    });
  }, [directoryQuery, directoryRoleFilter, directoryStatusFilter, employees, supervisorFilter, currentUser.id, isB1]);

  const filteredEmployees = useMemo(() => {
    const query = employeeQuery.trim().toLowerCase();
    const isSearchActive = query.length > 0;
    const shouldBypassFilter = isSearchActive && isB1;
    
    return employees.filter((employee) => {
      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (employee.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (employee.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!query) {
        return true;
      }

      return `${employee.name} ${employee.email ?? ''} ${employee.employee_id ?? ''} ${employee.role}`.toLowerCase().includes(query);
    });
  }, [employeeQuery, employees, supervisorFilter, currentUser.id, isB1]);

  const filteredLedger = useMemo(() => {
    const query = activityQuery.trim().toLowerCase();
    if (!query) {
      return ledger;
    }

    return ledger.filter((entry) =>
      `${entry.user?.name ?? ''} ${entry.user?.employee_id ?? ''} ${entry.actor?.name ?? 'system'} ${entry.reason ?? ''}`.toLowerCase().includes(query),
    );
  }, [activityQuery, ledger]);

  const reviewRoleRequest = async (
    requestId: string,
    decision: 'approved' | 'rejected',
    role?: UserRole,
    department?: string,
    notes?: string,
  ) => {
    try {
      setSavingIds(prev => new Set(prev).add(requestId));
      const response = await fetch('/api/moderator/roles/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision, role, department, notes }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to approve role');

      const approvedRequest = roleRequests.find((request) => request.id === requestId);
      const approvedUserId = approvedRequest?.user_id ?? null;

      setRoleRequests((current) => current.filter((request) => request.id !== requestId));
      if (decision === 'approved' && approvedUserId && role && department) {
        setEmployees((current) =>
          current.map((employee) =>
            employee.id === approvedUserId ? { ...employee, role, department } : employee,
          ),
        );
        setActiveTab('directory');
        setManagerHighlightSlotId(approvedUserId);
      }

      setStatusTone('success');
      setStatusMessage(
        decision === 'approved'
          ? 'Role and department assigned successfully.'
          : 'Role request denied and the employee was notified.',
      );
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error approving role';
      if (message === 'Request is not pending') {
        setRoleRequests((current) => current.filter((request) => request.id !== requestId));
        setStatusTone('success');
        setStatusMessage('This request was already processed. Refreshing the list.');
        router.refresh();
        return;
      }

      setStatusTone('danger');
      setStatusMessage(message);
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const dirtyEmployeeIds = useMemo(
    () =>
      employees
        .filter((employee) => {
          const parsed = Number(draftPoints[employee.id]);
          return Number.isFinite(parsed) && Math.max(0, Math.round(parsed)) !== employee.points;
        })
        .map((employee) => employee.id),
    [draftPoints, employees],
  );

  const roleCounts = useMemo(() => {
    const counts = { admin: 0, moderator_a1: 0, moderator_b1: 0, employee: 0 } as Record<UserRole, number>;
    for (const employee of employees) {
      counts[employee.role] = (counts[employee.role] ?? 0) + 1;
    }
    return counts;
  }, [employees]);

  const totalPointsInSystem = useMemo(
    () => employees.reduce((sum, employee) => sum + Number(employee.points || 0), 0),
    [employees],
  );

  const copyToClipboard = async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied to clipboard`, { description: value, duration: 2500 });
    } catch {
      toast.error('Unable to copy to clipboard');
    }
  };

  const updateDraftPoints = (userId: string, value: string) => {
    setDraftPoints((current) => ({ ...current, [userId]: value }));
  };

  const resetDraft = (userId: string) => {
    const employee = employees.find((entry) => entry.id === userId);
    if (!employee) {
      return;
    }
    setDraftPoints((current) => ({ ...current, [userId]: String(employee.points) }));
  };

  const saveUsers = async (userIds: string[]) => {
    const updates = userIds
      .map((userId) => {
        const employee = employees.find((entry) => entry.id === userId);
        const parsed = Number(draftPoints[userId]);

        if (!employee || !Number.isFinite(parsed)) {
          return null;
        }

        const nextPoints = Math.max(0, Math.round(parsed));
        if (nextPoints === employee.points) {
          return null;
        }

        return {
          userId,
          points: nextPoints,
          reason: `Moderator point adjustment for ${employee.name}`,
        };
      })
      .filter((entry): entry is { userId: string; points: number; reason: string } => Boolean(entry));

    if (updates.length === 0) {
      return;
    }

    try {
      const nextSavingIds = new Set(userIds);
      setSavingIds(nextSavingIds);
      setSavingAll(userIds.length > 1);

      const response = await fetch('/api/moderator/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to update points.');
      }

      setEmployees((current) =>
        current.map((employee) => {
          const match = updates.find((entry) => entry.userId === employee.id);
          return match ? { ...employee, points: match.points } : employee;
        }),
      );
      setStatusTone('success');
      setStatusMessage(
        updates.length === 1
          ? 'Employee points updated successfully and the employee was notified.'
          : `Saved ${updates.length} point changes and notified every affected employee.`,
      );
      router.refresh();
    } catch (error) {
      setStatusTone('danger');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to update points.');
    } finally {
      setSavingIds(new Set());
      setSavingAll(false);
    }
  };

  const parseCsvFile = async (file: File) => {
    setCsvError(null);
    setCsvPreview(null);

    transfer.start(file.name);
    transfer.setMessage('Reading CSV...');

    try {
      const text = await readFileAsTextWithProgress(file, { onProgress: transfer.setProgress });
      transfer.setMessage('Parsing CSV...');

      const results = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
      });

      const headers = results.meta.fields ?? [];
      if (headers.length < 2) {
        setCsvError('CSV must have at least 2 columns: an identifier (name, email, or ID) and a points value.');
        transfer.fail('Failed');
        return;
      }

      const identifierCol = headers.find((h) => /name|email|employee|id/i.test(h)) ?? headers[0];
      const pointsCol =
        headers.find((h) => /point|pts|balance|score/i.test(h) && h !== identifierCol) ??
        headers.find((h) => h !== identifierCol) ??
        headers[1];

      const rows: CsvImportRow[] = (results.data ?? [])
        .map((row) => {
          const identifier = String(row[identifierCol] ?? '').trim();
          const rawPoints = Math.max(0, Math.round(Number(row[pointsCol] ?? '')));
          if (!identifier || !Number.isFinite(rawPoints)) return null;

          const lowerIdentifier = identifier.toLowerCase();
          const matchedEmployee =
            employees.find((e) => e.email?.toLowerCase() === lowerIdentifier) ??
            employees.find((e) => e.employee_id?.toLowerCase() === lowerIdentifier) ??
            employees.find((e) => e.name.toLowerCase().includes(lowerIdentifier)) ??
            null;

          return { identifier, rawPoints, matchedEmployee };
        })
        .filter((r): r is CsvImportRow => r !== null);

      if (rows.length === 0) {
        setCsvError('No valid rows found. Make sure the file has an identifier column and a numeric points column.');
        transfer.fail('Failed');
        return;
      }

      setCsvPreview(rows);
      transfer.succeed('Ready');
    } catch {
      setCsvError('Failed to read the CSV file. Make sure it is a valid .csv export.');
      transfer.fail('Failed');
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = '';
      }
    }
  };

  const applyCsvImport = async () => {
    if (!csvPreview) return;

    const updates = csvPreview
      .filter((r) => r.matchedEmployee !== null)
      .map((r) => ({
        userId: r.matchedEmployee!.id,
        points: r.rawPoints,
        reason: `CSV bulk import for ${r.matchedEmployee!.name}`,
      }));

    if (updates.length === 0) return;

    try {
      setApplyingCsv(true);
      const response = await fetch('/api/moderator/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to apply CSV import.');
      }

      setEmployees((current) =>
        current.map((employee) => {
          const match = updates.find((u) => u.userId === employee.id);
          return match ? { ...employee, points: match.points } : employee;
        }),
      );
      setDraftPoints((current) => {
        const next = { ...current };
        for (const u of updates) next[u.userId] = String(u.points);
        return next;
      });
      setStatusTone('success');
      setStatusMessage(`CSV import applied — ${updates.length} employee balance${updates.length === 1 ? '' : 's'} updated and employees notified.`);
      setCsvPreview(null);
      setCsvError(null);
      if (csvInputRef.current) csvInputRef.current.value = '';
      router.refresh();
    } catch (error) {
      setStatusTone('danger');
      setStatusMessage(error instanceof Error ? error.message : 'Unable to apply CSV import.');
    } finally {
      setApplyingCsv(false);
    }
  };

  return (
    <div className="users-shell animate-fade-in">
      <div className="users-header">
        <div>
          <h1 className="users-title">Employees</h1>
          <p className="users-subtitle">
            Browse the full employee directory, adjust point balances, and audit every change — all in one place.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`users-status users-status-${statusTone}`}>
          <ShieldCheck size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="users-tabs">
        <button className={`btn ${activeTab === 'directory' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('directory')}>
          <Users size={16} />
          Directory
        </button>
        <button className={`btn ${activeTab === 'role-requests' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('role-requests')}>
          <ShieldCheck size={16} />
          Role Requests
          {roleRequests.length > 0 && <span className="tab-badge">{roleRequests.length}</span>}
          {isReadOnly && <span style={{ fontSize: '0.65rem', opacity: 0.5, marginLeft: '0.25rem' }}>(view)</span>}
        </button>
        <button className={`btn ${activeTab === 'points' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('points')}>
          <UserCog size={16} />
          Points Manager
          {isReadOnly && <span style={{ fontSize: '0.65rem', opacity: 0.5, marginLeft: '0.25rem' }}>(view)</span>}
        </button>
        <button className={`btn ${activeTab === 'activity' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab('activity')}>
          <History size={16} />
          Activity Log
        </button>
      </div>

      <div className="users-summary-grid">
        <div className="summary-card">
          <div className="summary-label">Employees</div>
          <div className="summary-value">{employees.length}</div>
          <div className="summary-helper">Total accounts registered in the platform.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Moderators A1</div>
          <div className="summary-value">{roleCounts.moderator_a1 ?? 0}</div>
          <div className="summary-helper">Advanced operational tools.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Moderators B1</div>
          <div className="summary-value">{roleCounts.moderator_b1 ?? 0}</div>
          <div className="summary-helper">Supervisors / View-only tools.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Admins</div>
          <div className="summary-value">{roleCounts.admin ?? 0}</div>
          <div className="summary-helper">Administrator-level (TI) users.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total Points</div>
          <div className="summary-value">{totalPointsInSystem.toLocaleString('en-US')}</div>
          <div className="summary-helper">Combined current balance across the directory.</div>
        </div>
      </div>

      {activeTab === 'directory' && (
        <section className="card users-panel">
          <div className="users-panel-head">
            <div>
              <h2 className="users-section-title">Employee Directory</h2>
              <p className="text-muted">A complete view of every registered employee — name, email, ID, role, and team.</p>
            </div>
            <div className="users-toolbar">
              <label className="users-search">
                <Search size={15} />
                <input
                  className="input"
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder="Search name, email, ID, department…"
                />
              </label>
              <div className="role-filter-group">
                {(['all', 'employee', 'moderator_a1', 'moderator_b1', 'admin'] as const).map((role) => (
                  <button
                    key={role}
                    className={`role-filter-chip ${directoryRoleFilter === role ? 'role-filter-chip-active' : ''}`}
                    onClick={() => setDirectoryRoleFilter(role)}
                  >
                    {role === 'all' ? 'All' : role.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    <span className="role-filter-count">
                      {role === 'all' ? employees.length : roleCounts[role] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <ModernSelect
                value={directoryStatusFilter}
                onValueChange={(value) => setDirectoryStatusFilter(value as typeof directoryStatusFilter)}
                options={[
                  { label: 'All statuses', value: 'all' },
                  { label: 'New logins', value: 'new-logins' },
                  { label: 'Approved access', value: 'approved' },
                  { label: 'Pending access', value: 'pending' },
                ]}
              />
              <SupervisorFilter
                supervisors={allSupervisors.filter(([, name]) => name !== currentUser.name)}
                currentSupervisorFilter={supervisorFilter}
                onFilterChange={setSupervisorFilter}
                currentUserRole={currentUser.role}
                currentUserId={currentUser.id}
              />
            </div>
          </div>

          <MobileDataFrame className="users-table-frame">
            <div className="users-table-shell">
              <table className="data-table users-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Employee ID</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Supervisor</th>
                  <th>Points</th>
                  <th>Status</th>
                  <th>Joined</th>
                  {!isReadOnly && <th style={{ width: 130 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredDirectory.map((employee) => {
                  const isEditing = editingDirectoryId === employee.id;
                  const isSavingThis = savingIds.has(employee.id);
                  const isHighlighted = managerHighlightSlotId === employee.id;
                  return (
                  <tr
                    key={employee.id}
                    data-user-row={employee.id}
                    className={`${isEditing ? 'dir-row-editing' : ''} ${isHighlighted ? 'dir-row-highlight' : ''}`.trim()}
                  >
                    <td>
                      <div className="directory-employee-cell">
                        <div className="directory-avatar" aria-hidden>
                          {employee.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxifyMediaUrl(employee.avatar_url)} alt="" />
                          ) : (
                            <span>{initialsFromName(employee.name)}</span>
                          )}
                        </div>
                        <div className="directory-employee-text">
                          {isEditing ? (
                            <input
                              className="input"
                              value={directoryEditForm.name}
                              onChange={(event) => setDirectoryEditForm({ ...directoryEditForm, name: event.target.value })}
                              placeholder="Employee name"
                            />
                          ) : (
                            <strong>{employee.name}</strong>
                          )}
                          {employee.supervisor && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              Reports to {employee.supervisor}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td>
                      {isEditing ? (
                        <input
                          className="input"
                          value={directoryEditForm.employee_id}
                          onChange={(event) => setDirectoryEditForm({ ...directoryEditForm, employee_id: event.target.value })}
                          placeholder="Employee ID"
                        />
                      ) : employee.employee_id ? (
                        <button type="button" className="directory-copy-btn" title="Copy employee ID"
                          onClick={() => void copyToClipboard(employee.employee_id)}>
                          <IdCard size={14} />{employee.employee_id}
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>

                    <td>
                      {employee.email ? (
                        <button type="button" className="directory-copy-btn" title="Copy email"
                          onClick={() => void copyToClipboard(employee.email)}>
                          <Mail size={14} />{employee.email}
                        </button>
                      ) : <span className="text-muted">—</span>}
                    </td>

                    <td>
                      {isEditing ? (
                        <ModernSelect
                          value={directoryEditForm.role}
                          onValueChange={v => setDirectoryEditForm({ ...directoryEditForm, role: v as UserRole })}
                          options={[
                            { label: 'Employee', value: 'employee' },
                            { label: 'Moderator B1', value: 'moderator_b1' },
                            { label: 'Moderator A1', value: 'moderator_a1' },
                            ...(currentUser.role === 'admin' ? [{ label: 'Admin (TI)', value: 'admin' }] : [])
                          ]}
                        />
                      ) : (
                        employee.role === 'employee' && !employee.department && !employee.is_approved
                          ? <span className="badge badge-warning">Unassigned</span>
                          : renderRoleBadge(employee.role)
                      )}
                    </td>

                    <td>
                      {isEditing ? (
                        <ModernSelect
                          value={directoryEditForm.department}
                          onValueChange={v => setDirectoryEditForm({ ...directoryEditForm, department: v })}
                          options={[
                            { label: '— Select department —', value: '' },
                            ...allDepartments.map(d => ({ label: `[${d.group}] ${d.label}`, value: d.value })),
                            ...(directoryEditForm.department && !allDepartments.find(d => d.value === directoryEditForm.department) 
                              ? [{ label: `${directoryEditForm.department} (current)`, value: directoryEditForm.department }]
                              : [])
                          ]}
                        />
                      ) : (employee.department || <span className="text-muted">—</span>)}
                    </td>

                    <td>
                      {isEditing ? (
                        <ModernSelect
                          value={directoryEditForm.supervisor_id}
                          onValueChange={v => setDirectoryEditForm({ ...directoryEditForm, supervisor_id: v })}
                          options={[
                            { label: '— Ninguno —', value: 'none' },
                            ...allSupervisors.filter(([id]) => id !== employee.id).map(([id, name]) => ({
                              label: name,
                              value: id
                            }))
                          ]}
                        />
                      ) : (employee.supervisor || <span className="text-muted">—</span>)}
                    </td>

                    <td><div className="directory-points">{employee.points.toLocaleString()} pts</div></td>

                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {employee.is_approved ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={12} /> Approved
                          </span>
                        ) : (
                          <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <History size={12} /> Pending
                          </span>
                        )}
                        {!isReadOnly && !employee.is_approved && (
                          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <button
                              className="dir-approval-toggle"
                              onClick={() => void submitPlatformAccessDecision(employee, 'approved')}
                              title="Approve user"
                            >
                              Approve
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.28)' }}
                              onClick={() => setDenyReasonModal({ employee })}
                              title="Deny access"
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </div>
                    </td>

                    <td><span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(employee.created_at)}</span></td>

                    {!isReadOnly && (() => {
                      const targetIsAdmin = employee.role === 'admin';
                      const actorIsA1 = currentUser.role === 'moderator_a1';
                      const canActOnRow = !(actorIsA1 && targetIsAdmin);
                      const canDelete = currentUser.role === 'admin' && employee.id !== currentUser.id;

                      return (
                        <td>
                          {isEditing ? (
                            <div className="dir-action-btns">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => void saveDirectoryEdit(employee)}
                                disabled={isSavingThis}
                                style={{ minWidth: 60 }}
                              >
                                {isSavingThis ? <span className="spinner-sm" /> : <><Save size={13} /> Save</>}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditingDirectoryId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div className="dir-action-btns">
                              {canActOnRow ? (
                                <>
                                  <button
                                    className="btn btn-ghost btn-sm dir-edit-btn"
                                    onClick={() => {
                                      setDirectoryEditForm({
                                        name: employee.name,
                                        employee_id: employee.employee_id || '',
                                        role: employee.role,
                                        department: employee.department || '',
                                        supervisor_id: employee.supervisor_id || 'none',
                                      });
                                      setEditingDirectoryId(employee.id);
                                    }}
                                  >
                                    <PencilLine size={13} /> Edit
                                  </button>
                                  {employee.id !== currentUser.id && (
                                    <button
                                      className="btn btn-ghost btn-sm dir-revoke-btn"
                                      onClick={() => setRevokeConfirm(employee)}
                                      title="Revoke role"
                                    >
                                      <ShieldOff size={13} /> Revoke
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>IT Protected</span>
                              )}
                              {canDelete && (
                                <button
                                  className="btn btn-ghost btn-sm dir-delete-btn"
                                  onClick={() => setDeleteConfirm(employee)}
                                  title="Permanently delete user"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                              {currentUser.role === 'admin' && employee.id !== currentUser.id && (
                                <button
                                  className="btn btn-ghost btn-sm dir-logout-btn"
                                  onClick={() => setLogoutConfirm(employee)}
                                  title="Force Logout (Revoke Sessions)"
                                  style={{ color: 'var(--brand-primary-light)' }}
                                >
                                  <LogOut size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                  );
                })}
                {filteredDirectory.length === 0 && (
                  <tr>
                    <td colSpan={!isReadOnly ? 10 : 9} className="users-empty">
                      No employees matched this search.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </MobileDataFrame>
        </section>
      )}

      {activeTab === 'role-requests' && (
        <section className="card users-panel animate-slide-up">
          <div className="users-panel-head">
            <div>
              <h2 className="users-section-title">Pending Role Requests</h2>
              <p className="text-muted">Review and assign roles or departments to users who requested access during onboarding.</p>
            </div>
          </div>

          <MobileDataFrame className="users-table-frame">
            <div className="users-table-shell">
              <table className="data-table users-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Request Date</th>
                  <th>Assign Role</th>
                  <th>Department</th>
                  <th style={{ width: 180 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roleRequests.map((request) => (
                  <RoleRequestRow
                    key={request.id}
                    request={request}
                    onApprove={(role, dept, notes) => reviewRoleRequest(request.id, 'approved', role, dept, notes)}
                    onReject={(notes) => reviewRoleRequest(request.id, 'rejected', undefined, undefined, notes)}
                    isSaving={savingIds.has(request.id)}
                    canApprove={!isReadOnly}
                    allDepartments={allDepartments}
                  />
                ))}
                {roleRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="users-empty">
                      No pending role requests at this time.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </MobileDataFrame>
        </section>
      )}

      {activeTab === 'points' && (
        <section className="card users-panel">
          <div className="users-panel-head">
            <div>
              <h2 className="users-section-title">Employee Points</h2>
              <p className="text-muted">Search any employee, edit their current balance, then save one row or all pending changes together.</p>
            </div>
            <div className="users-toolbar">
              <label className="users-search">
                <Search size={15} />
                <input
                  className="input"
                  value={employeeQuery}
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder="Search name, email, ID or role"
                />
              </label>
              {canResetPoints && (
                <button
                  className="btn btn-modern-danger"
                  onClick={() => setResetPointsConfirmOpen(true)}
                  disabled={resetPointsLoading}
                  title="Reset all users to 0 points"
                  style={{ gap: '0.6rem', padding: '0.75rem 1.5rem', borderRadius: '14px', textTransform: 'uppercase', letterSpacing: '0.01em', fontSize: '0.8rem' }}
                >
                  <AlertTriangle size={18} strokeWidth={2.5} />
                  Reset all points
                </button>
              )}
              <button
                className="btn btn-modern-ghost"
                onClick={() => csvInputRef.current?.click()}
                disabled={transfer.state.phase === 'working'}
                style={{ gap: '0.5rem', padding: '0.6rem 1rem' }}
              >
                <Upload size={16} />
                {transfer.state.phase === 'working' ? 'Importing...' : 'Import CSV'}
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void parseCsvFile(file);
                }}
              />
              <button
                className="btn btn-primary"
                onClick={() => void saveUsers(dirtyEmployeeIds)}
                disabled={savingAll || dirtyEmployeeIds.length === 0}
              >
                <Save size={16} />
                {savingAll ? 'Saving...' : `Save ${dirtyEmployeeIds.length} change${dirtyEmployeeIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>

          {transfer.state.phase !== 'idle' && (
            <div style={{ marginBottom: '0.5rem', maxWidth: 620 }}>
              <TransferProgress state={transfer.state} compact />
            </div>
          )}

          {csvError && (
            <div className="users-status users-status-danger" style={{ marginBottom: '0.5rem' }}>
              <AlertTriangle size={16} />
              <span>{csvError}</span>
            </div>
          )}

          {csvPreview && (
            <div className="csv-import-preview">
              <div className="csv-import-preview-header">
                <div>
                  <strong>CSV Import Preview</strong>
                  <span className="text-muted" style={{ marginLeft: '0.75rem', fontSize: '0.85rem' }}>
                    {csvPreview.filter((r) => r.matchedEmployee).length} matched ·{' '}
                    {csvPreview.filter((r) => !r.matchedEmployee).length} unmatched (will be skipped)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setCsvPreview(null);
                      setCsvError(null);
                      if (csvInputRef.current) csvInputRef.current.value = '';
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void applyCsvImport()}
                    disabled={applyingCsv || csvPreview.filter((r) => r.matchedEmployee).length === 0}
                  >
                    <Save size={14} />
                    {applyingCsv ? 'Applying...' : `Apply ${csvPreview.filter((r) => r.matchedEmployee).length} change${csvPreview.filter((r) => r.matchedEmployee).length === 1 ? '' : 's'}`}
                  </button>
                </div>
              </div>
              <MobileDataFrame className="users-table-frame">
                <div className="users-table-shell">
                  <table className="data-table users-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Role</th>
                      <th>Current Points</th>
                      <th>CSV Points</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, index) => {
                      const emp = row.matchedEmployee;
                      const delta = emp ? row.rawPoints - emp.points : 0;
                      return (
                        <tr key={index} className={!emp ? 'csv-row-unmatched' : ''}>
                          <td>
                            {emp ? (
                              <div className="users-employee-cell">
                                <strong>{emp.name}</strong>
                                <span>{emp.employee_id || 'No ID'} · {emp.email || 'No email'}</span>
                              </div>
                            ) : (
                              <div className="users-employee-cell">
                                <span className="csv-unmatched-label">
                                  <AlertTriangle size={13} /> {row.identifier}
                                </span>
                                <span>No matching employee found</span>
                              </div>
                            )}
                          </td>
                          <td>
                            {emp ? renderRoleBadge(emp.role) : '—'}
                          </td>
                          <td>
                            {emp ? <div className="users-points-balance">{emp.points.toLocaleString('en-US')} pts</div> : '—'}
                          </td>
                          <td>
                            <strong>{row.rawPoints.toLocaleString('en-US')} pts</strong>
                          </td>
                          <td>
                            {emp ? (
                              <span className={`users-delta ${delta !== 0 ? (delta > 0 ? 'users-delta-positive' : 'users-delta-negative') : ''}`}>
                                {delta === 0 ? 'No change' : `${delta > 0 ? '+' : ''}${delta} pts`}
                              </span>
                            ) : (
                              <span className="csv-skip-label">Skip</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                </div>
              </MobileDataFrame>
            </div>
          )}

          <MobileDataFrame className="users-table-frame">
            <div className="users-table-shell">
              <table className="data-table users-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Current Points</th>
                   <th>Edit Balance</th>
                   <th>Change Preview</th>
                   {!isReadOnly && <th style={{ width: 220 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((employee) => {
                  const draftValue = draftPoints[employee.id] ?? String(employee.points);
                  const parsedDraft = Number(draftValue);
                  const nextPoints = Number.isFinite(parsedDraft) ? Math.max(0, Math.round(parsedDraft)) : employee.points;
                  const delta = nextPoints - employee.points;
                  const isDirty = delta !== 0;
                  const isSaving = savingIds.has(employee.id);

                  return (
                    <tr key={employee.id}>
                      <td>
                        <div className="users-employee-cell">
                          <strong>{employee.name}</strong>
                          <span>{employee.employee_id || 'No employee ID'} • {employee.email || 'No email'}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{employee.department || 'Sin Depto.'}</span>
                      </td>
                      <td>
                        {renderRoleBadge(employee.role)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="users-points-balance">{employee.points.toLocaleString('en-US')} pts</span>
                        </div>
                      </td>
                       <td>
                        <div className="points-adjuster-premium">
                          <div className="points-adjuster-stack">
                            <button 
                              className="adjust-btn adjust-btn-minus" 
                              disabled={isReadOnly}
                              onClick={() => updateDraftPoints(employee.id, String(Math.max(0, nextPoints - 100)))}
                              title="-100 pts"
                            >
                              <Minus size={14} />
                              <span>100</span>
                            </button>
                            <button 
                              className="adjust-btn adjust-btn-minus-lite" 
                              disabled={isReadOnly}
                              onClick={() => updateDraftPoints(employee.id, String(Math.max(0, nextPoints - 10)))}
                              title="-10 pts"
                            >
                              <Minus size={10} />
                              <span>10</span>
                            </button>
                          </div>
                          
                          <input
                            className="points-input-modern"
                            type="number"
                            min="0"
                            value={draftValue}
                            disabled={isReadOnly}
                            onChange={(event) => updateDraftPoints(employee.id, event.target.value)}
                          />

                          <div className="points-adjuster-stack">
                            <button 
                              className="adjust-btn adjust-btn-plus-lite" 
                              disabled={isReadOnly}
                              onClick={() => updateDraftPoints(employee.id, String(nextPoints + 10))}
                              title="+10 pts"
                            >
                              <Plus size={10} />
                              <span>10</span>
                            </button>
                            <button 
                              className="adjust-btn adjust-btn-plus" 
                              disabled={isReadOnly}
                              onClick={() => updateDraftPoints(employee.id, String(nextPoints + 100))}
                              title="+100 pts"
                            >
                              <Plus size={14} />
                              <span>100</span>
                            </button>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`users-delta ${isDirty ? (delta >= 0 ? 'users-delta-positive' : 'users-delta-negative') : ''}`}>
                          {isDirty ? formatDelta(delta) : 'No change'}
                        </span>
                      </td>
                      {!isReadOnly && (
                        <td>
                          <div className="users-actions">
                            <button 
                              className="btn btn-ghost btn-sm" 
                              onClick={() => resetDraft(employee.id)} 
                              disabled={!isDirty || isSaving}
                              style={{ height: '38px' }}
                            >
                              Reset
                            </button>
                            <button 
                              className="btn btn-primary btn-sm" 
                              onClick={() => void saveUsers([employee.id])} 
                              disabled={!isDirty || isSaving}
                              style={{ 
                                height: '38px',
                                background: isDirty ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.05)',
                                color: isDirty ? 'white' : 'var(--text-muted)',
                                border: isDirty ? 'none' : '1px solid rgba(255,255,255,0.1)',
                                boxShadow: isDirty ? '0 4px 12px rgba(99, 102, 241, 0.25)' : 'none'
                              }}
                            >
                              {isSaving ? (
                                <span className="animate-pulse">Saving...</span>
                              ) : (
                                <>
                                  <Save size={14} />
                                  Save Row
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="users-empty">
                      No employees matched this search.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </MobileDataFrame>
        </section>
      )}

      {activeTab === 'activity' && (
        <section className="card users-panel">
          <div className="users-panel-head">
            <div>
              <h2 className="users-section-title">Activity Log</h2>
              <p className="text-muted">All point changes, role assignments, and department updates logged by moderators.</p>
            </div>
            <label className="users-search">
              <Search size={15} />
              <input
                className="input"
                value={activityQuery}
                onChange={(event) => setActivityQuery(event.target.value)}
                placeholder="Search employee, actor or reason"
              />
            </label>
          </div>

          <MobileDataFrame className="users-table-frame">
            <div className="users-table-shell">
              <table className="data-table users-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employee</th>
                  <th>Changed By</th>
                  <th>Change</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((entry) => {
                  const isProfileChange = entry.points_added === 0;
                  const isPositive = entry.points_added > 0;
                  const reasonText = (entry.reason ?? '').toLowerCase();
                  const profileTag =
                    reasonText.includes('role:') ? 'Role Change'
                    : reasonText.includes('department') ? 'Department Change'
                    : 'Profile Change';
                  return (
                  <tr key={entry.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td>
                      <div className="users-employee-cell">
                        <strong>{entry.user?.name || 'Unknown user'}</strong>
                        <span>{entry.user?.employee_id || entry.user?.email || 'No identifier'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="users-employee-cell">
                        <strong>{entry.actor?.name || 'System'}</strong>
                        <span>{entry.actor?.employee_id || entry.actor?.email || 'Automatic'}</span>
                      </div>
                    </td>
                    <td>
                      {isProfileChange ? (
                        <span className="activity-tag activity-tag-change">{profileTag}</span>
                      ) : (
                        <span className={`users-delta ${isPositive ? 'users-delta-positive' : 'users-delta-negative'}`}
                          style={{ fontWeight: 800 }}>
                          {isPositive ? '+' : ''}{entry.points_added} pts
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 280 }}>
                      {entry.reason || 'Point balance updated.'}
                    </td>
                  </tr>
                  );
                })}
                {filteredLedger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="users-empty">
                      No activity entries matched this search.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </MobileDataFrame>
        </section>
      )}

      {revokeConfirm && (
        <div className="modal-overlay" onClick={() => !actionLoading && setRevokeConfirm(null)}>
          <div ref={modalRef} className="modal confirm-modal confirm-modal-danger" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-icon"><ShieldOff size={28} /></div>
            <h3>Revoke Role</h3>
            <p>
              You are about to revoke the role of <strong>{revokeConfirm.name}</strong> ({revokeConfirm.role.replace(/_/g, ' ')}).
              They will still be able to log in, but will see a notification and be redirected to onboarding to request a new role.
            </p>
            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" disabled={actionLoading} onClick={() => setRevokeConfirm(null)}>Cancel</button>
              <button className="btn confirm-btn-danger" disabled={actionLoading} onClick={() => void executeRevoke(revokeConfirm)}>
                {actionLoading ? 'Revoking...' : 'Yes, Revoke Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !actionLoading && setDeleteConfirm(null)}>
          <div ref={modalRef} className="modal confirm-modal confirm-modal-danger" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-icon confirm-modal-icon-red"><Trash2 size={28} /></div>
            <h3>Permanently Delete User</h3>
            <p>
              This will <strong>permanently</strong> delete <strong>{deleteConfirm.name}</strong> ({deleteConfirm.email}) from the system, including all their data.
              This action <strong>cannot be undone</strong>.
            </p>
            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" disabled={actionLoading} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn confirm-btn-danger" disabled={actionLoading} onClick={() => void executeDelete(deleteConfirm)}>
                {actionLoading ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {logoutConfirm && (
        <div className="modal-overlay" onClick={() => !actionLoading && setLogoutConfirm(null)}>
          <div ref={modalRef} className="modal confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-icon" style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}>
              <LogOut size={28} />
            </div>
            <h3>Force Logout</h3>
            <p>
              You are about to revoke all active sessions for <strong>{logoutConfirm.name}</strong>. 
              The user will be immediately disconnected from all devices and forced to log in again.
            </p>
            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" disabled={actionLoading} onClick={() => setLogoutConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={actionLoading} onClick={() => void executeLogout(logoutConfirm)}>
                {actionLoading ? 'Revoking...' : 'Yes, Revoke Sessions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPointsConfirmOpen && (
        <div className="modal-overlay" onClick={() => !resetPointsLoading && setResetPointsConfirmOpen(false)}>
          <div ref={modalRef} className="modal confirm-modal confirm-modal-danger" onClick={e => e.stopPropagation()}>
            <div className="confirm-modal-icon confirm-modal-icon-red"><AlertTriangle size={28} /></div>
            <h3>Reset all points</h3>
            <p>
              This will set <strong>every user</strong> to <strong>0 points</strong>. This action cannot be undone.
            </p>

            <div className="reset-points-meta">
              <div><strong>{employees.length}</strong><span>Total users</span></div>
              <div><strong>{totalPointsInSystem.toLocaleString('en-US')}</strong><span>Total points</span></div>
            </div>

            <div className="reset-points-form">
              <label className="reset-points-label">Type RESET to confirm</label>
              <input
                className="input"
                value={resetPointsConfirmText}
                onChange={(e) => setResetPointsConfirmText(e.target.value)}
                placeholder="RESET"
                disabled={resetPointsLoading}
              />
              <label className="reset-points-label" style={{ marginTop: '0.75rem' }}>Reason (optional)</label>
              <input
                className="input"
                value={resetPointsReason}
                onChange={(e) => setResetPointsReason(e.target.value)}
                placeholder="Example: Monthly reset"
                disabled={resetPointsLoading}
              />
            </div>

            <div className="confirm-modal-actions">
              <button className="btn btn-ghost" disabled={resetPointsLoading} onClick={() => setResetPointsConfirmOpen(false)}>Cancel</button>
              <button
                className="btn confirm-btn-danger"
                disabled={resetPointsLoading || resetPointsConfirmText.trim() !== 'RESET'}
                onClick={() => void executeResetAllPoints()}
              >
                {resetPointsLoading ? 'Resetting...' : 'Yes, reset all'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .users-shell { width: 100%; display: grid; gap: 1.5rem; }
        .users-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 2rem; }
        .users-title { font-size: 2.25rem; font-weight: 800; margin: 0 0 0.5rem; letter-spacing: -0.04em; }
        .users-subtitle { margin: 0; color: var(--text-secondary); line-height: 1.7; max-width: 72ch; font-size: 1rem; }
        .users-status { display: flex; align-items: center; gap: 0.65rem; padding: 0.95rem 1rem; border-radius: 14px; }
        .users-status-success { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.22); }
        .users-status-danger { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.22); }
        .users-tabs { display: flex; gap: 0.75rem; flex-wrap: wrap; padding-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 1.5rem; }
        .users-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .summary-card { padding: 1.5rem; border-radius: 20px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); backdrop-filter: blur(10px); }
        .summary-label { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; margin-bottom: 0.5rem; }
        .summary-value { font-size: 2.5rem; font-weight: 800; margin-top: 0.35rem; letter-spacing: -0.02em; }
        .summary-helper { margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.85rem; line-height: 1.6; }
        .users-panel { display: grid; gap: 1.75rem; padding: 2rem; border-radius: 24px; }
        .users-panel-head { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; flex-wrap: wrap; margin-bottom: 1rem; }
        .users-section-title { margin: 0; font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; }
        .users-toolbar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; width: 100%; justify-content: flex-end; margin-top: 0.5rem; }
        .users-search { position: relative; min-width: 250px; flex: 1; max-width: 420px; }
        .users-search svg { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); z-index: 1; pointer-events: none; }
        .users-search .input { padding-left: 2.5rem; }
        .role-filter-group { display: inline-flex; gap: 0.35rem; padding: 0.3rem; border-radius: 14px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); }
        .role-filter-chip { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.85rem; border-radius: 10px; border: none; background: transparent; color: var(--text-secondary); font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.18s ease; }
        .role-filter-chip:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
        .role-filter-chip-active { background: var(--gradient-brand); color: white; box-shadow: 0 6px 20px rgba(99, 102, 241, 0.28); }
        .role-filter-count { font-size: 0.72rem; font-weight: 700; padding: 0.1rem 0.42rem; border-radius: 999px; background: rgba(255,255,255,0.12); }
        .role-filter-chip:not(.role-filter-chip-active) .role-filter-count { background: rgba(255,255,255,0.05); color: var(--text-muted); }
        .users-table-shell { border: 1px solid var(--border-subtle); border-radius: 18px; overflow: auto; background: rgba(255,255,255,0.02); resize: both; min-height: 520px; }
        .users-table { min-width: 1120px; }
        .users-table thead th { position: sticky; top: 0; background: #181e30; z-index: 1; }
        .users-employee-cell { display: grid; gap: 0.28rem; }
        .users-employee-cell span { font-size: 0.8rem; color: var(--text-muted); }
        .directory-employee-cell { display: flex; align-items: center; gap: 0.75rem; }
        .directory-employee-text { display: grid; gap: 0.2rem; min-width: 0; }
        .directory-employee-text strong { font-weight: 700; }
        .directory-employee-text span { font-size: 0.78rem; color: var(--text-muted); }
        .directory-avatar { width: 36px; height: 36px; border-radius: 999px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--gradient-brand); color: white; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; box-shadow: 0 6px 16px rgba(99, 102, 241, 0.22); }
        .directory-avatar img { width: 100%; height: 100%; object-fit: cover; }
        tr.dir-row-editing td { background: rgba(99, 102, 241, 0.04); border-top: 1px solid rgba(99, 102, 241, 0.15); border-bottom: 1px solid rgba(99, 102, 241, 0.15); }
        tr.dir-row-highlight td { background: rgba(99, 102, 241, 0.08); border-top: 1px solid rgba(99, 102, 241, 0.35); border-bottom: 1px solid rgba(99, 102, 241, 0.35); animation: dirRowPulse 1.8s ease-out 1; }
        @keyframes dirRowPulse { 0% { box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.0); } 35% { box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.55); } 100% { box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.0); } }
        .dir-edit-select { min-width: 140px; padding: 0.3rem 0.5rem; font-size: 0.8rem; height: 34px; }
        .dir-edit-btn { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8rem; padding: 0.3rem 0.65rem; height: 32px; opacity: 0.7; transition: opacity 0.15s; }
        .dir-edit-btn:hover { opacity: 1; }
        .dir-action-btns { display: flex; flex-direction: column; gap: 0.3rem; }
        .dir-approval-toggle { display: inline-flex; align-items: center; padding: 0.2rem 0.55rem; font-size: 0.68rem; font-weight: 700; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: var(--text-muted); cursor: pointer; transition: all 0.15s; width: fit-content; }
        .dir-approval-toggle:hover { background: rgba(255,255,255,0.08); color: white; }
        .points-adjuster-premium { display: flex; align-items: center; gap: 0.75rem; background: rgba(255,255,255,0.02); padding: 0.4rem; border-radius: 12px; width: fit-content; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 10px rgba(0,0,0,0.2); }
        .points-adjuster-stack { display: flex; gap: 0.25rem; }
        .adjust-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 32px; height: 38px; padding: 0.25rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); color: var(--text-secondary); cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); font-weight: 700; font-size: 0.65rem; }
        .adjust-btn span { margin-top: 2px; font-size: 0.6rem; opacity: 0.7; }
        .adjust-btn:hover:not(:disabled) { transform: translateY(-2px); background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); color: white; }
        .adjust-btn:active:not(:disabled) { transform: translateY(0); }
        .adjust-btn-plus:hover { color: #4ade80 !important; background: rgba(34, 197, 94, 0.12) !important; border-color: rgba(34, 197, 94, 0.35) !important; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.18); }
        .adjust-btn-minus:hover { color: #f87171 !important; background: rgba(239, 68, 68, 0.12) !important; border-color: rgba(239, 68, 68, 0.35) !important; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.18); }
        .points-input-modern { width: 80px; height: 38px; background: #0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: white; text-align: center; font-weight: 800; font-size: 0.95rem; letter-spacing: 0.05em; transition: border-color 0.2s; }
        .points-input-modern:focus { outline: none; border-color: var(--brand-primary); box-shadow: 0 0 15px rgba(99, 102, 241, 0.15); }
        .points-input-modern::-webkit-outer-spin-button, .points-input-modern::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .role-selector-chips { display: flex; gap: 0.5rem; flex-wrap: wrap; padding: 0.25rem 0; }
        .role-chip { padding: 0.5rem 1rem; border-radius: 10px; font-size: 0.8rem; font-weight: 700; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--text-secondary); cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; gap: 0.5rem; }
        .role-chip:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.2); transform: translateY(-1px); }
        .role-chip.active { color: white; border-color: transparent; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
        .role-chip.active.role-admin { background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); }
        .role-chip.active.role-moderator_a1 { background: linear-gradient(135deg, #3b82f6 0%, #2dd4bf 100%); }
        .role-chip.active.role-moderator_b1 { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }
        .role-chip.active.role-employee { background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); }
        .tab-badge { background: #ef4444; color: white; padding: 0.2rem 0.5rem; border-radius: 99px; font-size: 0.75rem; font-weight: 800; margin-left: 0.6rem; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3); }
        .users-delta-positive { color: #4ade80 !important; font-weight: 700; }
        .users-delta-negative { color: #f87171 !important; font-weight: 700; }
        .activity-tag { display: inline-flex; align-items: center; padding: 0.2rem 0.6rem; border-radius: 8px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .activity-tag-change { background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.25); color: #a5b4fc; }
        .dir-revoke-btn { color: #fbbf24; border-color: rgba(251, 191, 36, 0.2); opacity: 0.75; transition: all 0.15s; }
        .dir-revoke-btn:hover { opacity: 1; background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.4); }
        .dir-delete-btn { color: #f87171; border-color: rgba(248, 113, 113, 0.2); opacity: 0.6; transition: all 0.15s; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
        .dir-delete-btn:hover { opacity: 1; background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.4); }
        .confirm-modal { max-width: 440px; text-align: center; display: grid; gap: 1rem; padding: 2rem; }
        .confirm-modal-icon { width: 56px; height: 56px; border-radius: 16px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.25); color: #fbbf24; display: flex; align-items: center; justify-content: center; margin: 0 auto; }
        .confirm-modal-icon-red { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #f87171; }

        @media (max-width: 767px) {
          .users-panel {
            padding: 1rem;
            gap: 1.2rem;
          }

          .users-panel-head {
            gap: 1rem;
            margin-bottom: 0.2rem;
          }

          .users-section-title {
            font-size: 1.18rem;
          }

          .users-toolbar,
          .users-search {
            width: 100%;
            max-width: none;
            min-width: 0;
          }

          .users-table-frame {
            gap: 0.65rem;
          }

          .users-table-shell {
            min-height: auto;
            resize: none;
          }

          .users-table {
            min-width: 920px;
          }
        }
        .confirm-modal h3 { font-size: 1.25rem; font-weight: 800; margin: 0; }
        .confirm-modal p { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.65; margin: 0; }
        .confirm-modal-actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
        .confirm-btn-danger { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; font-weight: 700; box-shadow: 0 4px 14px rgba(239, 68, 68, 0.3); padding: 0.6rem 1.5rem; border-radius: 10px; cursor: pointer; transition: all 0.2s; }
        .confirm-btn-danger:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(239, 68, 68, 0.4); }
        .confirm-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .users-reset-all-btn { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.22); color: #fca5a5; font-weight: 800; }
        .users-reset-all-btn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.18); border-color: rgba(239, 68, 68, 0.32); }
        .reset-points-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; padding: 0.85rem; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); }
        .reset-points-meta > div { display: grid; gap: 0.1rem; }
        .reset-points-meta strong { font-size: 1.25rem; letter-spacing: -0.03em; }
        .reset-points-meta span { font-size: 0.78rem; color: var(--text-muted); }
        .reset-points-form { width: 100%; text-align: left; }
        .reset-points-label { display: block; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; }
        .dir-add-dept-btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.5rem; font-size: 0.7rem; border-radius: 6px; border: 1px dashed rgba(255,255,255,0.2); background: transparent; color: var(--text-muted); cursor: pointer; margin-top: 0.3rem; }
        .dir-add-dept-row { display: flex; gap: 0.3rem; margin-top: 0.3rem; }

        .btn-modern-danger {
          background: rgba(239, 68, 68, 0.08) !important;
          color: #f87171 !important;
          border: 1px solid rgba(239, 68, 68, 0.2) !important;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        }
        .btn-modern-danger:hover:not(:disabled) {
          background: rgba(239, 68, 68, 0.12) !important;
          border-color: rgba(239, 68, 68, 0.4) !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.15);
        }
        .btn-modern-ghost {
          background: rgba(255, 255, 255, 0.03) !important;
          color: var(--text-muted) !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
          backdrop-filter: blur(8px);
          transition: all 0.2s ease;
        }
        .btn-modern-ghost:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.06) !important;
          border-color: rgba(255, 255, 255, 0.15) !important;
          color: white !important;
          transform: translateY(-1px);
        }
        .btn-modern-primary {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2)) !important;
          color: #a5b4fc !important;
          border: 1px solid rgba(99, 102, 241, 0.3) !important;
          backdrop-filter: blur(10px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
          transition: all 0.2s ease;
        }
        .btn-modern-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(139, 92, 246, 0.3)) !important;
          border-color: rgba(99, 102, 241, 0.5) !important;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.25);
        }
        .btn-modern-primary:disabled, .btn-modern-danger:disabled, .btn-modern-ghost:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>

      {denyReasonModal && (
        <PromptDialog
          title={`Deny access for ${denyReasonModal.employee.name}`}
          body="Provide a reason for denying platform access. This will be recorded."
          placeholder="e.g. Not part of the team, duplicate account..."
          confirmLabel="Deny access"
          required
          onConfirm={async (reason) => {
            const emp = denyReasonModal.employee;
            setDenyReasonModal(null);
            await submitPlatformAccessDecision(emp, 'denied', reason);
          }}
          onCancel={() => setDenyReasonModal(null)}
        />
      )}
    </div>
  );
}

const ROLE_TOOLTIPS: Partial<Record<UserRole, string>> = {
  admin: 'TI (Admin): Acceso completo a todo el sistema.',
  moderator_a1: 'Moderador A1: Acceso avanzado a herramientas operativas y gestión de empleados.',
  moderator_b1: 'Moderador B1: Supervisor con vista de equipo.',
  employee: 'Empleado: Acceso estándar a dashboard, OT y tienda.',
};

function RoleRequestRow({
  request,
  onApprove,
  onReject,
  isSaving,
  canApprove,
  allDepartments,
}: {
  request: RoleRequest;
  onApprove: (role: UserRole, dept: string, notes?: string) => void;
  onReject: (notes: string) => void;
  isSaving: boolean;
  canApprove: boolean;
  allDepartments: { value: string; label: string; group: string }[];
}) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('employee');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [newDeptName, setNewDeptName] = useState('');
  const [addingDept, setAddingDept] = useState(false);
  const [addDeptLoading, setAddDeptLoading] = useState(false);
  const [localDepts, setLocalDepts] = useState(allDepartments);

  useEffect(() => { setLocalDepts(allDepartments); }, [allDepartments]);

  async function handleAddDept() {
    if (!newDeptName.trim()) return;
    setAddDeptLoading(true);
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newDeptName.trim(), group: 'Custom' }),
      });
      if (res.ok) {
        const newEntry = { value: newDeptName.trim(), label: newDeptName.trim(), group: 'Custom' };
        setLocalDepts(prev => [...prev, newEntry]);
        setDepartment(newDeptName.trim());
        setNewDeptName('');
        setAddingDept(false);
      }
    } finally { setAddDeptLoading(false); }
  }

  return (
    <tr className="animate-fade-in">
      <td>
        <div className="directory-employee-cell">
          <div className="directory-avatar" aria-hidden>
            <span>{initialsFromName(request.user?.name ?? '??')}</span>
          </div>
          <div className="directory-employee-text">
            <strong>{request.user?.name || 'Unknown User'}</strong>
            <span>{request.user?.email} • {request.user?.employee_id || 'No ID'}</span>
          </div>
        </div>
      </td>
      <td>{formatDate(request.created_at)}</td>
      <td>
        {canApprove ? (
          <div className="role-selector-chips">
            {(['employee', 'moderator_b1', 'moderator_a1'] as UserRole[]).map(role => (
              <button
                key={role}
                className={`role-chip ${selectedRole === role ? 'active' : ''} role-${role}`}
                onClick={() => setSelectedRole(role)}
                title={ROLE_TOOLTIPS[role] ?? role}
              >
                {role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
        )}
      </td>
      <td>
        {canApprove ? (
          <>
            <ModernSelect
              value={department}
              onValueChange={setDepartment}
              options={[
                { label: '— Seleccionar departamento —', value: '' },
                ...localDepts.map(d => ({ label: `[${d.group}] ${d.label}`, value: d.value }))
              ]}
            />
            {!addingDept ? (
              <button
                type="button"
                className="dir-add-dept-btn"
                onClick={() => setAddingDept(true)}
                title="Add a new department"
              >
                <Plus size={11} /> New dept
              </button>
            ) : (
              <div className="dir-add-dept-row">
                <input
                  autoFocus
                  className="input dir-edit-select"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="Department name…"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleAddDept(); if (e.key === 'Escape') setAddingDept(false); }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
                  disabled={addDeptLoading || !newDeptName.trim()}
                  onClick={() => void handleAddDept()}
                >
                  {addDeptLoading ? '…' : <Plus size={11} />}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.72rem', background: 'rgba(255,255,255,0.05)' }}
                  onClick={() => setAddingDept(false)}
                >
                  ✕
                </button>
              </div>
            )}
          </>
        ) : (
          <span className="text-muted" style={{ fontSize: '0.8rem' }}>—</span>
        )}
      </td>
      <td>
        {canApprove ? (
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            <textarea
              className="input"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Approval note or rejection reason"
            />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1, height: '36px' }}
                disabled={isSaving || !department || !selectedRole}
                onClick={() => onApprove(selectedRole, department, notes)}
              >
                {isSaving ? <span className="spinner" /> : 'Approve'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ flex: 1, height: '36px', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                disabled={isSaving || !notes.trim()}
                onClick={() => onReject(notes.trim())}
              >
                Reject
              </button>
            </div>
          </div>
        ) : (
          <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>View only</span>
        )}
      </td>
    </tr>
  );
}
