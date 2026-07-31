'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarRange,
  Calculator,
  Clock3,
  Info,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Trash2,
  Upload,
} from 'lucide-react';
import { getOTFortnightRange, isOTSlotCompleted } from '@backend/modules/ot/domain/schedule';
import { ModernSelect } from '@frontend/shared/ui/Select';
import { ModernDatePicker } from '@frontend/shared/ui/DatePicker';
import { ModernTimePicker } from '@frontend/shared/ui/TimePicker';
import { useTransferState } from '@frontend/shared/hooks/useTransferState';
import { TransferProgress } from '@frontend/shared/ui/TransferProgress';
import { readFileAsTextWithProgress } from '@frontend/shared/lib/file-transfer';
import type { DailySchedule } from '@shared/contracts/database';

type CalculatorSlot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_hrs: number;
  shift_label?: string | null;
};

type ImportedMetricsRow = {
  employeeName: string;
  attendancePercent: number | null;
  bonusVoicePerHour: number | null;
  sourceLabel: string;
};

type WorkdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

type ScheduleEntry = {
  enabled: boolean;
  start: string;
  end: string;
};

type AbsenceEntry = {
  id: string;
  date: string;
  mode: 'full_day' | 'minutes';
  minutes: number;
  medicalCertificate: boolean;
};

type SlotOutcome = 'worked_ot' | 'recovery' | 'missed';
type OtSourceMode = 'account' | 'manual';
type MetricsTone = 'neutral' | 'success' | 'warning';
type OcrImageMode = 'contrast' | 'table';
type OcrWorkerHandle = {
  setParameters: (params: Record<string, string>) => Promise<unknown>;
  recognize: (
    image: File,
    options?: { rotateAuto?: boolean },
  ) => Promise<{ data: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

type SlotDetailRow = {
  label: string;
  meta: string;
  hours: number;
  tone: string;
};

const WEEKDAY_CONFIG: Array<{ key: WorkdayKey; label: string; short: string; dayIndex: number }> = [
  { key: 'monday', label: 'Monday', short: 'Mon', dayIndex: 1 },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue', dayIndex: 2 },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed', dayIndex: 3 },
  { key: 'thursday', label: 'Thursday', short: 'Thu', dayIndex: 4 },
  { key: 'friday', label: 'Friday', short: 'Fri', dayIndex: 5 },
  { key: 'saturday', label: 'Saturday', short: 'Sat', dayIndex: 6 },
  { key: 'sunday', label: 'Sunday', short: 'Sun', dayIndex: 0 },
];

const DEFAULT_SCHEDULE: Record<WorkdayKey, ScheduleEntry> = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: false, start: '08:00', end: '15:00' },
  sunday: { enabled: false, start: '08:00', end: '15:00' },
};

const CALCULATOR_UNLOCK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function sortWorkdayKeys(dayKeys: WorkdayKey[]) {
  const order = new Map(WEEKDAY_CONFIG.map((day, index) => [day.key, index]));
  return [...dayKeys].sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeHeader(value: string) {
  return normalizeName(value).replace(/\s+/g, ' ');
}

function parseMetricNumber(value: unknown) {
  const cleaned = String(value ?? '')
    .replace(/[,%]/g, '')
    .replace(/\$/g, '')
    .replace(/DOP/gi, '')
    .trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)} DOP`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function formatTimeLabel(value: string) {
  if (!value) {
    return '--:--';
  }

  const [hours, minutes] = String(value ?? '')
    .slice(0, 5)
    .split(':')
    .map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return value;
  }

  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCompactDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function timeToMinutes(value: string) {
  const [hours, minutes] = String(value ?? '')
    .slice(0, 5)
    .split(':')
    .map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

function minutesToHours(value: number) {
  return value / 60;
}

function getPaidShiftMinutes(start: string, end: string) {
  const startMinutes = timeToMinutes(start);
  let endMinutes = timeToMinutes(end);
  if (endMinutes <= startMinutes) {
    endMinutes += 24 * 60;
  }
  const totalMinutes = Math.max(0, endMinutes - startMinutes);
  return totalMinutes >= 6 * 60 ? totalMinutes - 30 : totalMinutes;
}

function buildDateRange(fromIso: string, toIso: string) {
  if (!fromIso || !toIso || fromIso > toIso) {
    return [];
  }

  const cursor = new Date(`${fromIso}T12:00:00`);
  const limit = new Date(`${toIso}T12:00:00`);
  const dates: string[] = [];

  while (cursor <= limit) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getScheduleKeyForDate(dateIso: string): WorkdayKey {
  return WEEKDAY_CONFIG.find(
    (day) => day.dayIndex === new Date(`${dateIso}T12:00:00`).getDay(),
  )?.key ?? 'monday';
}

function getNthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, occurrence: number) {
  const date = new Date(year, monthIndex, 1, 12, 0, 0);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() + 1);
  }
  date.setDate(date.getDate() + (occurrence - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function isUsEasternDaylightSaving(dateIso: string) {
  const [year] = dateIso.split('-').map(Number);
  return (
    dateIso >= getNthWeekdayOfMonth(year, 2, 0, 2) &&
    dateIso < getNthWeekdayOfMonth(year, 10, 0, 1)
  );
}

function getCalculatorUnlockStorageKey(userName: string) {
  return `outplex:comp-calculator-unlocked-at:${normalizeName(userName) || 'employee'}`;
}

function hasValidCalculatorAccess(unlockedAt: number | null) {
  return unlockedAt !== null && Number.isFinite(unlockedAt) && Date.now() - unlockedAt < CALCULATOR_UNLOCK_WINDOW_MS;
}

function normalizeMetricsLine(line: string) {
  return line
    .replace(/[|[\]]/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeMetricRows(rows: ImportedMetricsRow[]) {
  const byName = new Map<string, ImportedMetricsRow>();
  rows.forEach((row) => {
    const key = normalizeName(row.employeeName);
    if (!key) {
      return;
    }

    const existing = byName.get(key);
    const existingScore =
      Number(existing?.attendancePercent !== null) + Number(existing?.bonusVoicePerHour !== null);
    const nextScore = Number(row.attendancePercent !== null) + Number(row.bonusVoicePerHour !== null);

    if (!existing || nextScore >= existingScore) {
      byName.set(key, row);
    }
  });

  return Array.from(byName.values()).sort((left, right) =>
    left.employeeName.localeCompare(right.employeeName),
  );
}

function extractMetricRowFromLine(line: string, sourceLabel: string) {
  const cleaned = normalizeMetricsLine(line);
  if (!cleaned || /grand total|attendance %|agent name|opx id/i.test(cleaned)) {
    return null;
  }

  const attendanceMatch = cleaned.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (!attendanceMatch || attendanceMatch.index === undefined) {
    return null;
  }

  const prefix = cleaned.slice(0, attendanceMatch.index).replace(/^\d+\s+/, '').trim();
  const nameMatch = prefix.match(/[A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){1,4}/);
  if (!nameMatch) {
    return null;
  }

  const employeeName = nameMatch[0].trim();
  const attendancePercent = parseMetricNumber(attendanceMatch[1]);
  const moneyMatches = [...cleaned.matchAll(/\$\s*(-?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)/g)]
    .map((match) => parseMetricNumber(match[1]))
    .filter((value): value is number => value !== null);
  const fallbackMatches = [...cleaned.matchAll(/\b(\d{1,3}(?:\.\d{1,2})?)\b/g)]
    .map((match) => parseMetricNumber(match[1]))
    .filter((value): value is number => value !== null && value <= 150);

  return {
    employeeName,
    attendancePercent,
    bonusVoicePerHour: moneyMatches.at(-1) ?? fallbackMatches.at(-1) ?? null,
    sourceLabel,
  };
}

function parseMetricsOcrRows(text: string, sourceLabel: string) {
  return dedupeMetricRows(
    text
      .split(/\r?\n/)
      .map((line) => extractMetricRowFromLine(line, sourceLabel))
      .filter((row): row is ImportedMetricsRow => Boolean(row)),
  );
}

function parseMetricsCsvRows(rows: Record<string, string>[], headers: string[], sourceLabel: string) {
  const headerMap = Object.fromEntries(headers.map((header) => [header, normalizeHeader(header)]));
  const nameHeader =
    headers.find((header) => /agent|employee/.test(headerMap[header]) && /name/.test(headerMap[header])) ??
    headers.find((header) => /name/.test(headerMap[header])) ??
    '';
  const attendanceHeader =
    headers.find((header) => /attendance/.test(headerMap[header])) ??
    headers.find((header) => /att/.test(headerMap[header])) ??
    '';
  const bonusHeader =
    headers.find((header) => /bonus/.test(headerMap[header]) && /voice/.test(headerMap[header])) ??
    headers.find((header) => /bonus/.test(headerMap[header])) ??
    '';

  return dedupeMetricRows(
    rows
      .map((row) => ({
        employeeName: String(row[nameHeader] ?? '').trim(),
        attendancePercent: parseMetricNumber(row[attendanceHeader]),
        bonusVoicePerHour: parseMetricNumber(row[bonusHeader]),
        sourceLabel,
      }))
      .filter((row) => row.employeeName),
  );
}

function getNameTokensMatch(left: string, right: string) {
  const leftTokens = normalizeName(left).split(' ').filter((token) => token.length > 1);
  const rightTokens = normalizeName(right).split(' ').filter((token) => token.length > 1);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  let matches = 0;
  leftTokens.forEach((token) => {
    if (
      rightTokens.some(
        (candidate) =>
          candidate === token || candidate.startsWith(token) || token.startsWith(candidate),
      )
    ) {
      matches += 1;
    }
  });

  return matches / Math.max(leftTokens.length, rightTokens.length);
}

function findBestMetricRow(rows: ImportedMetricsRow[], userName: string) {
  const normalizedUserName = normalizeName(userName);
  const exact = rows.find((row) => normalizeName(row.employeeName) === normalizedUserName);
  if (exact) {
    return exact;
  }

  const scored = rows
    .map((row) => ({ row, score: getNameTokensMatch(userName, row.employeeName) }))
    .sort((left, right) => right.score - left.score);

  return scored[0]?.score >= 0.6 ? scored[0].row : null;
}

async function buildProcessedMetricsImage(file: File, mode: OcrImageMode) {
  return new Promise<File | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        resolve(null);
        return;
      }

      const image = new Image();
      image.onload = () => {
        const scale =
          mode === 'table'
            ? Math.max(1.8, Math.min(2.4, 2600 / Math.max(image.width, 1)))
            : Math.max(1.4, Math.min(2, 2200 / Math.max(image.width, 1)));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');

        if (!context) {
          resolve(null);
          return;
        }

        context.filter =
          mode === 'table'
            ? 'grayscale(1) contrast(1.7) brightness(1.12)'
            : 'grayscale(1) contrast(1.35) brightness(1.05)';
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;

        for (let index = 0; index < data.length; index += 4) {
          const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
          const contrast =
            mode === 'table'
              ? gray > 205
                ? 255
                : gray < 132
                  ? 0
                  : Math.round(((gray - 132) / 73) * 255)
              : gray > 185
                ? 255
                : gray < 95
                  ? 0
                  : Math.round(gray);
          data[index] = contrast;
          data[index + 1] = contrast;
          data[index + 2] = contrast;
          data[index + 3] = 255;
        }

        context.putImageData(imageData, 0, 0);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(
            new File([blob], `${file.name.replace(/\.[^.]+$/i, '')}-${mode}-metrics.png`, {
              type: 'image/png',
            }),
          );
        }, 'image/png');
      };

      image.onerror = () => resolve(null);
      image.src = reader.result;
    };

    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

async function parseCsvMetricsFile(file: File, opts?: { onProgress?: (pct: number) => void }) {
  const text = await readFileAsTextWithProgress(file, { onProgress: opts?.onProgress });
  const { default: Papa } = await import('papaparse');
  return new Promise<ImportedMetricsRow[]>((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(parseMetricsCsvRows(result.data, result.meta.fields ?? [], file.name)),
      error: (error: Error) => reject(error),
    });
  });
}

async function parseImageMetricsFile(file: File) {
  let worker: OcrWorkerHandle | null = null;
  try {
    const { createWorker, PSM } = await import('tesseract.js');
    worker = await createWorker('eng');
    const attempts: ImportedMetricsRow[][] = [];

    const runAttempt = async (label: string, source: File, pageSegmentationMode: string) => {
      if (!worker) {
        return;
      }

      await worker.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
        tessedit_pageseg_mode: pageSegmentationMode,
      });

      const result = await worker.recognize(source, { rotateAuto: true });
      attempts.push(parseMetricsOcrRows(result.data.text?.trim() ?? '', label));
    };

    await runAttempt('original scan', file, PSM.SPARSE_TEXT);
    const contrastFile = await buildProcessedMetricsImage(file, 'contrast');
    if (contrastFile) {
      await runAttempt('contrast cleanup', contrastFile, PSM.SINGLE_BLOCK);
    }
    const tableFile = await buildProcessedMetricsImage(file, 'table');
    if (tableFile) {
      await runAttempt('table cleanup', tableFile, PSM.SPARSE_TEXT);
    }

    return dedupeMetricRows(attempts.flat());
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

export function EmployeeCompensationCalculator({
  userName,
  currentDate,
  currentTime,
  claimedSlots,
  claimMetas = {},
  dailySchedules = [],
}: {
  userName: string;
  currentDate: string;
  currentTime: string;
  claimedSlots: CalculatorSlot[];
  claimMetas?: Record<string, import('@backend/modules/ot/domain/claim-kind').OTClaimKind>;
  dailySchedules?: DailySchedule[];
}) {
  const defaultRange = useMemo(() => getOTFortnightRange(currentDate), [currentDate]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const [dateFrom, setDateFrom] = useState(defaultRange.start);
  const [dateTo, setDateTo] = useState(defaultRange.end);
  const [otSource, setOtSource] = useState<OtSourceMode>('account');
  const [manualWorkedOtHours, setManualWorkedOtHours] = useState(0);
  const [manualMissedOtHours, setManualMissedOtHours] = useState(0);
  const [manualRecoveryHours, setManualRecoveryHours] = useState(0);
  const [manualBonusPerHour, setManualBonusPerHour] = useState(150);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [useAutoSchedule, setUseAutoSchedule] = useState(false);
  const [manualDaylight, setManualDaylight] = useState<boolean | null>(null);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [holidayInput, setHolidayInput] = useState('');
  const [absences, setAbsences] = useState<AbsenceEntry[]>([]);
  const [slotOutcomes, setSlotOutcomes] = useState<Record<string, SlotOutcome>>({});
  const [importingMetrics, setImportingMetrics] = useState(false);
  const [metricsTone, setMetricsTone] = useState<MetricsTone>('neutral');
  const [metricsStatus, setMetricsStatus] = useState(
    'Import a CSV or photo to prefill attendance and bonus data.',
  );
  const [importedMetrics, setImportedMetrics] = useState<ImportedMetricsRow | null>(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorRows, setSelectorRows] = useState<ImportedMetricsRow[]>([]);
  const [selectorQuery, setSelectorQuery] = useState('');
  const [selectorValue, setSelectorValue] = useState('');
  const [useImportedAttendance, setUseImportedAttendance] = useState(true);
  const [useImportedBonus, setUseImportedBonus] = useState(true);
  const [calculatorUnlocked, setCalculatorUnlocked] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [selectedScheduleDays, setSelectedScheduleDays] = useState<WorkdayKey[]>([]);
  const [scheduleEditorStart, setScheduleEditorStart] = useState(DEFAULT_SCHEDULE.monday.start);
  const [scheduleEditorEnd, setScheduleEditorEnd] = useState(DEFAULT_SCHEDULE.monday.end);
  const [scheduleEditorEnabled, setScheduleEditorEnabled] = useState(DEFAULT_SCHEDULE.monday.enabled);

  const unlockStorageKey = useMemo(() => getCalculatorUnlockStorageKey(userName), [userName]);

  const autoDaylight = isUsEasternDaylightSaving(dateFrom || currentDate);
  const daylightMode = manualDaylight ?? autoDaylight;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const unlockedAt = Number(window.localStorage.getItem(unlockStorageKey));
    const nextUnlocked = hasValidCalculatorAccess(Number.isFinite(unlockedAt) ? unlockedAt : null);
    if (!nextUnlocked) {
      window.localStorage.removeItem(unlockStorageKey);
    }
    setCalculatorUnlocked(nextUnlocked);
  }, [unlockStorageKey]);

  useEffect(() => {
    if (!calculatorUnlocked || typeof window === 'undefined') {
      return;
    }

    const syncLockState = () => {
      const unlockedAt = Number(window.localStorage.getItem(unlockStorageKey));
      const nextUnlocked = hasValidCalculatorAccess(Number.isFinite(unlockedAt) ? unlockedAt : null);
      if (!nextUnlocked) {
        window.localStorage.removeItem(unlockStorageKey);
        setCalculatorUnlocked(false);
      }
    };

    const interval = window.setInterval(syncLockState, 60_000);
    return () => window.clearInterval(interval);
  }, [calculatorUnlocked, unlockStorageKey]);

  const completedSlots = useMemo(
    () =>
      claimedSlots.filter(
        (slot) =>
          slot.date >= dateFrom &&
          slot.date <= dateTo &&
          isOTSlotCompleted(slot, { date: currentDate, time: currentTime }),
      ),
    [claimedSlots, currentDate, currentTime, dateFrom, dateTo],
  );

  useEffect(() => {
    setSlotOutcomes((current) => {
      const next: Record<string, SlotOutcome> = {};
      completedSlots.forEach((slot) => {
        const metaKind = claimMetas[slot.id];
        const defaultOutcome: SlotOutcome = metaKind === 'recovery' ? 'recovery' : 'worked_ot';
        next[slot.id] = current[slot.id] ?? defaultOutcome;
      });
      return next;
    });
  }, [completedSlots, claimMetas]);

  const scheduleOtSummary = useMemo(() => {
    return WEEKDAY_CONFIG.reduce(
      (summary, day) => {
        const matchingSlots = completedSlots.filter((slot) => getScheduleKeyForDate(slot.date) === day.key);
        summary[day.key] = {
          totalHours: matchingSlots.reduce((sum, slot) => sum + slot.duration_hrs, 0),
          entries: matchingSlots.map((slot) => ({
            id: slot.id,
            date: slot.date,
            hours: slot.duration_hrs,
            shiftLabel: slot.shift_label ?? 'OT Slot',
          })),
        };
        return summary;
      },
      {} as Record<
        WorkdayKey,
        {
          totalHours: number;
          entries: Array<{ id: string; date: string; hours: number; shiftLabel: string }>;
        }
      >,
    );
  }, [completedSlots]);

  const filteredSelectorRows = useMemo(() => {
    const query = normalizeName(selectorQuery);
    if (!query) {
      return selectorRows;
    }

    return selectorRows.filter((row) => normalizeName(row.employeeName).includes(query));
  }, [selectorQuery, selectorRows]);

  useEffect(() => {
    if (!selectorOpen) {
      return;
    }

    if (!filteredSelectorRows.some((row) => normalizeName(row.employeeName) === selectorValue)) {
      setSelectorValue(normalizeName(filteredSelectorRows[0]?.employeeName ?? ''));
    }
  }, [filteredSelectorRows, selectorOpen, selectorValue]);

  const selectedSelectorRow =
    filteredSelectorRows.find((row) => normalizeName(row.employeeName) === selectorValue) ?? null;

  const orderedSelectedScheduleDays = useMemo(
    () => sortWorkdayKeys(selectedScheduleDays),
    [selectedScheduleDays],
  );

  useEffect(() => {
    if (orderedSelectedScheduleDays.length === 0) {
      return;
    }

    const referenceDay = orderedSelectedScheduleDays[0];
    setScheduleEditorStart(schedule[referenceDay].start);
    setScheduleEditorEnd(schedule[referenceDay].end);
    setScheduleEditorEnabled(schedule[referenceDay].enabled);
  }, [orderedSelectedScheduleDays, schedule]);

  const absenceMinutesByDate = useMemo(() => {
    const map = new Map<string, { certified: number; uncertified: number }>();
    absences.forEach((entry) => {
      const daySchedule = schedule[getScheduleKeyForDate(entry.date)];
      const dayMinutes = daySchedule.enabled
        ? getPaidShiftMinutes(daySchedule.start, daySchedule.end)
        : 0;
      const entryMinutes =
        entry.mode === 'full_day' ? dayMinutes : Math.max(0, Number(entry.minutes || 0));
      const current = map.get(entry.date) ?? { certified: 0, uncertified: 0 };
      if (entry.medicalCertificate) {
        current.certified += entryMinutes;
      } else {
        current.uncertified += entryMinutes;
      }
      map.set(entry.date, current);
    });
    return map;
  }, [absences, schedule]);

  const regularSummary = useMemo(
    () =>
      buildDateRange(dateFrom, dateTo).reduce(
        (summary, date) => {
          if (holidays.includes(date)) {
            summary.holidayCount += 1;
            return summary;
          }

          let expectedMinutes = 0;
          let isScheduledDay = false;

          if (useAutoSchedule) {
            const syncSchedule = dailySchedules?.find((ds) => ds.schedule_date === date && ds.hour_type === 'regular');
            if (syncSchedule && syncSchedule.shift_start && syncSchedule.shift_end) {
              expectedMinutes = getPaidShiftMinutes(syncSchedule.shift_start, syncSchedule.shift_end);
              isScheduledDay = true;
            }
          } else {
            const daySchedule = schedule[getScheduleKeyForDate(date)];
            if (daySchedule.enabled) {
              expectedMinutes = getPaidShiftMinutes(daySchedule.start, daySchedule.end);
              isScheduledDay = true;
            }
          }

          if (!isScheduledDay) {
            return summary;
          }

          const absence = absenceMinutesByDate.get(date) ?? { certified: 0, uncertified: 0 };
          const certifiedMinutes = Math.min(expectedMinutes, absence.certified);
          const uncertifiedMinutes = Math.min(
            Math.max(0, expectedMinutes - certifiedMinutes),
            absence.uncertified,
          );
          const attendanceExpectedMinutes = Math.max(0, expectedMinutes - certifiedMinutes);
          const workedMinutes = Math.max(0, attendanceExpectedMinutes - uncertifiedMinutes);
          const payableMinutes = Math.max(0, expectedMinutes - certifiedMinutes - uncertifiedMinutes);

          summary.expectedMinutes += attendanceExpectedMinutes;
          summary.workedMinutes += workedMinutes;
          summary.payableMinutes += payableMinutes;
          summary.certifiedMinutes += certifiedMinutes;
          summary.unexcusedMinutes += uncertifiedMinutes;
          summary.holidayCount += 0;
          summary.scheduledDays += 1;
          return summary;
        },
        {
          expectedMinutes: 0,
          workedMinutes: 0,
          payableMinutes: 0,
          certifiedMinutes: 0,
          unexcusedMinutes: 0,
          holidayCount: 0,
          scheduledDays: 0,
        },
      ),
    [absenceMinutesByDate, dateFrom, dateTo, holidays, schedule, useAutoSchedule, dailySchedules],
  );

  const slotSummary = useMemo(() => {
    if (otSource === 'manual') {
      const detailRows: SlotDetailRow[] = [];
      if (manualWorkedOtHours > 0) {
        detailRows.push({
          label: 'Manual OT worked',
          meta: 'Double-rate OT',
          hours: manualWorkedOtHours,
          tone: 'worked',
        });
      }
      if (manualMissedOtHours > 0) {
        detailRows.push({
          label: 'Manual OT missed',
          meta: 'Missed OT lowers attendance',
          hours: manualMissedOtHours,
          tone: 'missed',
        });
      }
      if (manualRecoveryHours > 0) {
        detailRows.push({
          label: 'Manual recovery hours',
          meta: 'Regular pay, no attendance recovery',
          hours: manualRecoveryHours,
          tone: 'recovery',
        });
      }

      return {
        workedOtHours: manualWorkedOtHours,
        missedOtHours: manualMissedOtHours,
        recoveryHours: manualRecoveryHours,
        detailRows,
      };
    }

    return completedSlots.reduce(
      (summary, slot) => {
        const outcome = slotOutcomes[slot.id] ?? 'worked_ot';
        if (outcome === 'worked_ot') {
          summary.workedOtHours += slot.duration_hrs;
        } else if (outcome === 'missed') {
          summary.missedOtHours += slot.duration_hrs;
        } else {
          summary.recoveryHours += slot.duration_hrs;
        }
        summary.detailRows.push({
          label: `${slot.date} · ${slot.shift_label ?? 'OT Slot'}`,
          meta: `${slot.start_time.slice(0, 5)} to ${slot.end_time.slice(0, 5)} · ${outcome.replace(/_/g, ' ')}`,
          hours: slot.duration_hrs,
          tone: outcome === 'worked_ot' ? 'worked' : outcome === 'missed' ? 'missed' : 'recovery',
        });
        return summary;
      },
      {
        workedOtHours: 0,
        missedOtHours: 0,
        recoveryHours: 0,
        detailRows: [] as SlotDetailRow[],
      },
    );
  }, [
    completedSlots,
    manualMissedOtHours,
    manualRecoveryHours,
    manualWorkedOtHours,
    otSource,
    slotOutcomes,
  ]);

  const computedAttendance =
    regularSummary.expectedMinutes + (slotSummary.workedOtHours + slotSummary.missedOtHours) * 60 > 0
      ? ((regularSummary.workedMinutes + slotSummary.workedOtHours * 60) /
          (regularSummary.expectedMinutes + (slotSummary.workedOtHours + slotSummary.missedOtHours) * 60)) *
        100
      : 100;

  const effectiveAttendance =
    useImportedAttendance && importedMetrics?.attendancePercent !== null
      ? (importedMetrics?.attendancePercent ?? computedAttendance)
      : computedAttendance;

  const effectiveBonusPerHour =
    useImportedBonus && importedMetrics?.bonusVoicePerHour !== null
      ? (importedMetrics?.bonusVoicePerHour ?? manualBonusPerHour)
      : manualBonusPerHour;

  const bonusEligible = effectiveAttendance >= 95;
  const baseRegularHours = minutesToHours(regularSummary.payableMinutes);
  const workedOtHours = slotSummary.workedOtHours;
  const recoveryHours = slotSummary.recoveryHours;
  const bonusEligibleHours = baseRegularHours + workedOtHours + recoveryHours;
  const regularBasePay = baseRegularHours * 210;
  const recoveryPay = recoveryHours * 210;
  const otBasePay = workedOtHours * 420;
  const bonusPay = bonusEligible ? bonusEligibleHours * effectiveBonusPerHour : 0;
  const estimatedTotal = regularBasePay + recoveryPay + otBasePay + bonusPay;

  const applyImportedRow = (row: ImportedMetricsRow) => {
    setImportedMetrics(row);
    setUseImportedAttendance(row.attendancePercent !== null);
    setUseImportedBonus(row.bonusVoicePerHour !== null);
    if (row.bonusVoicePerHour !== null) {
      setManualBonusPerHour(row.bonusVoicePerHour);
    }
    setSelectorOpen(false);
    setSelectorRows([]);
    setSelectorQuery('');
    setSelectorValue('');
    setMetricsTone('success');
    setMetricsStatus(
      `Imported metrics for ${row.employeeName}. Only that row is now being used for this estimate.`,
    );
  };

  const handleMetricsRows = (rows: ImportedMetricsRow[], sourceLabel: string) => {
    if (rows.length === 0) {
      setMetricsTone('warning');
      setMetricsStatus('No employee metrics could be extracted from that file.');
      return;
    }

    const matched = findBestMetricRow(rows, userName);
    if (matched) {
      applyImportedRow({ ...matched, sourceLabel });
      return;
    }

    setSelectorRows(rows);
    setSelectorOpen(true);
    setSelectorQuery('');
    setSelectorValue(normalizeName(rows[0]?.employeeName ?? ''));
    setMetricsTone('warning');
    setMetricsStatus(
      'I found employee names in the file, but I could not confirm which row belongs to you. Pick your name below.',
    );
  };

  const handleImportFile = async (file: File) => {
    setImportingMetrics(true);
    setMetricsTone('neutral');
    setMetricsStatus(`Reading ${file.name}...`);
    transfer.start(file.name);

    try {
      const isCsv = /\.csv$/i.test(file.name) || /csv|spreadsheet/i.test(file.type);
      if (isCsv) {
        transfer.setMessage('Reading metrics...');
        const rows = await parseCsvMetricsFile(file, { onProgress: transfer.setProgress });
        handleMetricsRows(rows, file.name);
        transfer.succeed('Imported');
      } else {
        transfer.setProgress(18);
        transfer.setMessage('Analyzing image with AI...');

        // Try server-side Gemini Vision first (much more accurate for complex tables)
        let serverRows: ImportedMetricsRow[] | null = null;
        try {
          const fd = new FormData();
          fd.append('image', file);
          const res = await fetch('/api/ocr/metrics', { method: 'POST', body: fd });
          if (res.ok) {
            const json = await res.json() as { rows?: Array<{ name: string; opx_id: string; attendance: string; total_bonus: string }> };
            if (Array.isArray(json.rows) && json.rows.length > 0) {
              serverRows = json.rows.map((r) => ({
                employeeName: r.name.trim(),
                attendancePercent: parseMetricNumber(r.attendance),
                bonusVoicePerHour: parseMetricNumber(r.total_bonus),
                sourceLabel: file.name,
              })).filter((r) => r.employeeName.length > 1);
            }
          }
        } catch {
          // server unavailable — fall through to Tesseract
        }

        if (serverRows && serverRows.length > 0) {
          handleMetricsRows(dedupeMetricRows(serverRows), file.name);
        } else {
          transfer.setProgress(35);
          transfer.setMessage('Running OCR fallback...');
          const rows = await parseImageMetricsFile(file);
          handleMetricsRows(rows, file.name);
        }
        transfer.succeed('Imported');
      }
    } catch (error) {
      setMetricsTone('warning');
      setMetricsStatus(
        error instanceof Error ? error.message : 'Unable to import that metrics file.',
      );
      transfer.fail('Failed');
    } finally {
      setImportingMetrics(false);
      if (fileRef.current) {
        fileRef.current.value = '';
      }
    }
  };

  const toggleScheduleSelection = (dayKey: WorkdayKey) => {
    setSelectedScheduleDays((current) =>
      current.includes(dayKey)
        ? current.filter((entry) => entry !== dayKey)
        : sortWorkdayKeys([...current, dayKey]),
    );
  };

  const focusSingleScheduleDay = (dayKey: WorkdayKey) => {
    setSelectedScheduleDays([dayKey]);
  };

  const applyScheduleEditor = () => {
    if (orderedSelectedScheduleDays.length === 0) {
      return;
    }

    setSchedule((current) => {
      const next = { ...current };
      orderedSelectedScheduleDays.forEach((dayKey) => {
        next[dayKey] = {
          ...next[dayKey],
          enabled: scheduleEditorEnabled,
          start: scheduleEditorStart,
          end: scheduleEditorEnd,
        };
      });
      return next;
    });
  };

  const acknowledgeCalculatorNotice = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(unlockStorageKey, String(Date.now()));
    }
    setCalculatorUnlocked(true);
    setUnlockModalOpen(false);
  };

  const resetCalculator = () => {
    setDateFrom(defaultRange.start);
    setDateTo(defaultRange.end);
    setOtSource('account');
    setManualWorkedOtHours(0);
    setManualMissedOtHours(0);
    setManualRecoveryHours(0);
    setManualBonusPerHour(150);
    setSchedule(DEFAULT_SCHEDULE);
    setUseAutoSchedule(false);
    setManualDaylight(null);
    setHolidays([]);
    setHolidayInput('');
    setAbsences([]);
    setImportedMetrics(null);
    setUseImportedAttendance(true);
    setUseImportedBonus(true);
    setSelectorOpen(false);
    setSelectorRows([]);
    setMetricsTone('neutral');
    setMetricsStatus('Calculator reset to the current fortnight.');
    setSelectedScheduleDays([]);
  };

  const selectedScheduleLabel = orderedSelectedScheduleDays
    .map((dayKey) => WEEKDAY_CONFIG.find((day) => day.key === dayKey)?.label ?? dayKey)
    .join(', ');

  const selectedScheduleMixed = orderedSelectedScheduleDays.some((dayKey, index) => {
    if (index === 0) {
      return false;
    }

    const firstDay = schedule[orderedSelectedScheduleDays[0]];
    const currentDay = schedule[dayKey];
    return (
      firstDay.enabled !== currentDay.enabled ||
      firstDay.start !== currentDay.start ||
      firstDay.end !== currentDay.end
    );
  });

  return (
    <section className="card comp-shell animate-fade-in delay-300">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
          event.currentTarget.value = '';
        }}
      />
      <div className="comp-estimator-frame">
        <div className={`comp-estimator-content ${calculatorUnlocked ? '' : 'comp-estimator-content-locked'}`}>
      <div className="comp-header">
        <div>
          <div className="comp-eyebrow">Compensation Calculator</div>
          <h2 className="comp-title">Quincena estimator</h2>
          <p className="comp-subtitle">
            Import your metrics, compare OT versus recovery hours, and keep attendance logic aligned
            with medical certificates and missed OT.
          </p>
        </div>
        <div className="comp-header-actions">
          <button className="btn btn-ghost" onClick={resetCalculator}>
            <CalendarRange size={15} />
            Reset fortnight
          </button>
          <div className="comp-header-info">
            <button type="button" className="comp-info-button" aria-label="Estimator information">
              <Info size={14} />
            </button>
            <div className="comp-info-tooltip">
              This calculator is only an estimate. Official payroll always depends on AWS timekeeping and finalized metrics.
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={importingMetrics}
          >
            <Upload size={15} />
            {importingMetrics ? 'Importing...' : 'Import CSV or Photo'}
          </button>
        </div>
      </div>

      <div className={`comp-status comp-status-${metricsTone}`}>
        {metricsTone === 'success' ? (
          <ShieldCheck size={17} />
        ) : metricsTone === 'warning' ? (
          <ShieldAlert size={17} />
        ) : (
          <Calculator size={17} />
        )}
        <span>{metricsStatus}</span>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <TransferProgress state={transfer.state} compact />
      </div>

      <div className="comp-top-grid">
        <ModernDatePicker
          label="From"
          date={dateFrom}
          onDateChange={setDateFrom}
        />
        <ModernDatePicker
          label="To"
          date={dateTo}
          onDateChange={setDateTo}
        />
        <ModernSelect
          label="OT source"
          value={otSource}
          onValueChange={v => setOtSource(v as OtSourceMode)}
          options={[
            { label: 'Use OT from my account', value: 'account' },
            { label: 'Enter OT manually', value: 'manual' }
          ]}
        />
        <ModernSelect
          label="Regular shifts"
          value={useAutoSchedule ? 'auto' : 'manual'}
          onValueChange={v => setUseAutoSchedule(v === 'auto')}
          options={[
            { label: 'Auto sync from NYT', value: 'auto' },
            { label: 'Define shifts manually', value: 'manual' }
          ]}
        />
        <div className="summary-mini-card">
          <span>Imported metrics</span>
          <strong>{importedMetrics?.employeeName ?? 'Not loaded yet'}</strong>
        </div>
      </div>

      <div className="comp-stats-grid">
        <div className="comp-stat-card">
          <span>Regular pay</span>
          <strong>{formatMoney(regularBasePay + recoveryPay)}</strong>
          <small>{(baseRegularHours + recoveryHours).toFixed(2)} regular-rate hours</small>
        </div>
        <div className="comp-stat-card">
          <span>OT pay</span>
          <strong>{formatMoney(otBasePay)}</strong>
          <small>{workedOtHours.toFixed(2)} double-rate OT hours</small>
        </div>
        <div className="comp-stat-card">
          <span>Attendance</span>
          <strong className={bonusEligible ? 'comp-positive' : 'comp-negative'}>
            {formatPercent(effectiveAttendance)}
          </strong>
          <small>{bonusEligible ? 'Bonus applies' : 'Below the 95% bonus threshold'}</small>
        </div>
        <div className="comp-stat-card">
          <span>Bonus per hour</span>
          <strong>{bonusEligible ? formatMoney(effectiveBonusPerHour) : formatMoney(0)}</strong>
          <small>{useImportedBonus && importedMetrics ? 'Using imported metrics row' : 'Manual bonus input'}</small>
        </div>
      </div>

      <div className="comp-main-grid">
        <div className="comp-panel">
          <div className="comp-panel-head">
            <div>
              <h3>Schedule setup</h3>
              <p>Choose your regular workdays, then apply hours to one day or several at once without visual clutter.</p>
            </div>
            <div className="comp-pill-toggle">
              <button className={`btn btn-sm ${!daylightMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setManualDaylight(false)}>Standard</button>
              <button className={`btn btn-sm ${daylightMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setManualDaylight(true)}>Daylight</button>
            </div>
          </div>

          <div className="comp-reference-box">
            Company reference:
            {' '}
            {daylightMode
              ? 'Mon-Fri 8:00 AM to 7:00 PM, Sat-Sun 8:00 AM to 4:00 PM.'
              : 'Mon-Fri 7:00 AM to 6:00 PM, Sat-Sun 7:00 AM to 3:00 PM.'}
          </div>

          <div className="comp-schedule-toolbar">
            <div>
              <strong>
                {orderedSelectedScheduleDays.length > 0
                  ? `${orderedSelectedScheduleDays.length} day${orderedSelectedScheduleDays.length === 1 ? '' : 's'} selected`
                  : 'Select one or more days to edit them together'}
              </strong>
              <p>Use the sparkle chip to build a batch, or the clock icon inside any bubble to edit just that day.</p>
            </div>
            <div className="comp-schedule-toolbar-actions">
              <button
                className="btn btn-ghost btn-sm"
                disabled={orderedSelectedScheduleDays.length === 0}
                onClick={() => setSelectedScheduleDays([])}
              >
                Clear selection
              </button>
            </div>
          </div>

          <div className="comp-schedule-grid">
            {WEEKDAY_CONFIG.map((day) => {
              const daySchedule = schedule[day.key];
              const isSelectedForBatch = orderedSelectedScheduleDays.includes(day.key);
              const dayOtSummary = scheduleOtSummary[day.key];

              return (
                <div
                  key={day.key}
                  className={`comp-schedule-bubble ${daySchedule.enabled ? 'comp-schedule-bubble-enabled' : 'comp-schedule-bubble-disabled'} ${isSelectedForBatch ? 'comp-schedule-bubble-selected' : ''}`}
                >
                  <div className={`comp-schedule-banner ${daySchedule.enabled ? 'comp-schedule-banner-enabled' : 'comp-schedule-banner-disabled'}`}>
                    <span>{day.label}</span>
                    <button
                      type="button"
                      className={`comp-batch-chip-button ${isSelectedForBatch ? 'comp-batch-chip-button-active' : ''}`}
                      onClick={() => toggleScheduleSelection(day.key)}
                    >
                      <Sparkles size={13} />
                      {isSelectedForBatch ? 'Selected' : 'Batch'}
                    </button>
                  </div>

                  <div className="comp-schedule-bubble-body">
                    <div className="comp-schedule-bubble-topline">
                      <div>
                        <strong>{daySchedule.enabled ? 'Included in your schedule' : 'Not part of your schedule'}</strong>
                        <div className="comp-schedule-time-range">
                          {daySchedule.enabled
                            ? `${formatTimeLabel(daySchedule.start)} - ${formatTimeLabel(daySchedule.end)}`
                            : 'Day off / unscheduled'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="comp-clock-button"
                        onClick={() => focusSingleScheduleDay(day.key)}
                        aria-label={`Edit ${day.label} hours`}
                      >
                        <Clock3 size={16} />
                      </button>
                    </div>

                    <div className="comp-schedule-chip-row">
                      <button
                        type="button"
                        className={`comp-state-chip ${daySchedule.enabled ? 'comp-state-chip-on' : 'comp-state-chip-off'}`}
                        onClick={() =>
                          setSchedule((current) => ({
                            ...current,
                            [day.key]: { ...current[day.key], enabled: !current[day.key].enabled },
                          }))
                        }
                      >
                        {daySchedule.enabled ? 'Working day' : 'Off day'}
                      </button>
                      {dayOtSummary.totalHours > 0 && (
                        <div className="comp-auto-ot-chip">Auto OT: {dayOtSummary.totalHours.toFixed(2)}h</div>
                      )}
                    </div>

                    {dayOtSummary.entries.length > 0 && (
                      <div className="comp-auto-ot-list">
                        {dayOtSummary.entries.slice(0, 2).map((entry) => (
                          <div key={entry.id} className="comp-auto-ot-entry">
                            <span>{formatCompactDate(entry.date)}</span>
                            <strong>{entry.hours.toFixed(2)}h</strong>
                          </div>
                        ))}
                        {dayOtSummary.entries.length > 2 && (
                          <div className="comp-auto-ot-more">
                            +{dayOtSummary.entries.length - 2} more OT record(s) in this range
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {orderedSelectedScheduleDays.length > 0 && (
            <div className="comp-batch-editor">
              <div className="comp-batch-editor-head">
                <div>
                  <h4>{orderedSelectedScheduleDays.length === 1 ? `Edit ${selectedScheduleLabel}` : `Edit ${orderedSelectedScheduleDays.length} selected days`}</h4>
                  <p>
                    {selectedScheduleMixed
                      ? 'These days currently do not share the same setup. Applying the values below will standardize them.'
                      : `Apply a clean schedule update to ${selectedScheduleLabel}.`}
                  </p>
                </div>
                <div className="comp-pill-toggle">
                  <button
                    className={`btn btn-sm ${scheduleEditorEnabled ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setScheduleEditorEnabled(true)}
                  >
                    Working day
                  </button>
                  <button
                    className={`btn btn-sm ${!scheduleEditorEnabled ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setScheduleEditorEnabled(false)}
                  >
                    Day off
                  </button>
                </div>
              </div>

              <div className="comp-batch-editor-grid">
                <ModernTimePicker
                  label="Start of shift"
                  time={scheduleEditorStart}
                  onTimeChange={setScheduleEditorStart}
                />
                <ModernTimePicker
                  label="End of shift"
                  time={scheduleEditorEnd}
                  onTimeChange={setScheduleEditorEnd}
                />
              </div>

              <div className="comp-chip-row">
                {orderedSelectedScheduleDays.map((dayKey) => (
                  <span key={dayKey} className="comp-chip comp-chip-static">
                    {WEEKDAY_CONFIG.find((day) => day.key === dayKey)?.short ?? dayKey}
                  </span>
                ))}
              </div>

              <div className="comp-modal-actions">
                <button className="btn btn-ghost" onClick={() => setSelectedScheduleDays([])}>
                  Close editor
                </button>
                <button className="btn btn-primary" onClick={applyScheduleEditor}>
                  Apply to selected days
                </button>
              </div>
            </div>
          )}

          <div className="comp-subsection">
            <div className="comp-subsection-head">
              <div>
                <h4>Holidays</h4>
                <p>Holiday dates are removed from the expected schedule for this calculator.</p>
              </div>
            </div>
            <div className="comp-inline-row">
              <ModernDatePicker
                date={holidayInput}
                onDateChange={setHolidayInput}
              />
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (holidayInput && !holidays.includes(holidayInput)) {
                    setHolidays([...holidays, holidayInput].sort());
                    setHolidayInput('');
                  }
                }}
              >
                Add holiday
              </button>
            </div>
            <div className="comp-chip-row">
              {holidays.length === 0 ? (
                <span className="text-muted">No holidays added yet.</span>
              ) : (
                holidays.map((holiday) => (
                  <button key={holiday} className="comp-chip" onClick={() => setHolidays((current) => current.filter((entry) => entry !== holiday))}>
                    {holiday}
                    <Trash2 size={13} />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="comp-subsection">
            <div className="comp-subsection-head">
              <div>
                <h4>Missed scheduled time</h4>
                <p>Medical certificate removes attendance impact, but the pay for that missed time is still reduced.</p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setAbsences((current) => [
                    ...current,
                    {
                      id: `${Date.now()}-${current.length}`,
                      date: dateFrom,
                      mode: 'full_day',
                      minutes: 60,
                      medicalCertificate: false,
                    },
                  ])
                }
              >
                Add absence
              </button>
            </div>
            <div className="comp-absence-list">
              {absences.length === 0 ? (
                <div className="text-muted">No missed regular time added.</div>
              ) : (
                absences.map((entry) => (
                  <div key={entry.id} className="comp-absence-row">
                    <ModernDatePicker
                      date={entry.date}
                      onDateChange={v => setAbsences(current => current.map(item => item.id === entry.id ? { ...item, date: v } : item))}
                    />
                    <ModernSelect
                      value={entry.mode}
                      onValueChange={v => setAbsences(current => current.map(item => item.id === entry.id ? { ...item, mode: v as AbsenceEntry['mode'] } : item))}
                      options={[
                        { label: 'Full day', value: 'full_day' },
                        { label: 'Exact minutes', value: 'minutes' }
                      ]}
                    />
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="1"
                      value={entry.mode === 'full_day' ? 0 : entry.minutes}
                      disabled={entry.mode === 'full_day'}
                      onChange={e => setAbsences(current => current.map(item => item.id === entry.id ? { ...item, minutes: Number(e.target.value) } : item))}
                    />
                    <button
                      type="button"
                      className={`comp-medical-toggle ${entry.medicalCertificate ? 'comp-medical-toggle-on' : 'comp-medical-toggle-off'}`}
                      onClick={() =>
                        setAbsences((current) =>
                          current.map((item) =>
                            item.id === entry.id
                              ? { ...item, medicalCertificate: !item.medicalCertificate }
                              : item,
                          ),
                        )
                      }
                    >
                      <Stethoscope size={14} />
                      <span>{entry.medicalCertificate ? 'Certificate on file' : 'No certificate'}</span>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAbsences((current) => current.filter((item) => item.id !== entry.id))}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="comp-panel">
          <div className="comp-panel-head">
            <div>
              <h3>OT and imported metrics</h3>
              <p>Missed OT lowers attendance. Recovery hours return money at regular rate, but do not repair attendance.</p>
            </div>
          </div>
          {otSource === 'manual' ? (
            <div className="comp-manual-grid">
              <label className="comp-field">
                <span>Worked OT hours</span>
                <input className="input" type="number" min="0" step="0.25" value={manualWorkedOtHours} onChange={(event) => setManualWorkedOtHours(Number(event.target.value))} />
              </label>
              <label className="comp-field">
                <span>Missed OT hours</span>
                <input className="input" type="number" min="0" step="0.25" value={manualMissedOtHours} onChange={(event) => setManualMissedOtHours(Number(event.target.value))} />
              </label>
              <label className="comp-field">
                <span>Recovery hours</span>
                <input className="input" type="number" min="0" step="0.25" value={manualRecoveryHours} onChange={(event) => setManualRecoveryHours(Number(event.target.value))} />
              </label>
              <label className="comp-field">
                <span>Manual bonus per hour</span>
                <input className="input" type="number" min="0" max="150" step="0.1" value={manualBonusPerHour} onChange={(event) => setManualBonusPerHour(Number(event.target.value))} />
              </label>
            </div>
          ) : (
            <div className="comp-slot-list">
              {completedSlots.length === 0 ? (
                <div className="text-muted">No completed OT slots were found in this range.</div>
              ) : (
                completedSlots.map((slot) => (
                  <div key={slot.id} className="comp-slot-row">
                    <div>
                      <strong>{slot.date} · {slot.shift_label ?? 'OT Slot'}</strong>
                      <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.82rem' }}>
                        {slot.start_time.slice(0, 5)} to {slot.end_time.slice(0, 5)} · {slot.duration_hrs}h
                      </div>
                    </div>
                    <ModernSelect
                      className="w-48"
                      value={slotOutcomes[slot.id] ?? 'worked_ot'}
                      onValueChange={v => setSlotOutcomes(current => ({ ...current, [slot.id]: v as SlotOutcome }))}
                      options={[
                        { label: 'Worked OT', value: 'worked_ot' },
                        { label: 'Missed OT', value: 'missed' },
                        { label: 'Recovery / reposicion', value: 'recovery' }
                      ]}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          <div className="comp-imported-grid" style={{ gap: '1.5rem' }}>
            <button
              type="button"
              className={`comp-toggle-pill ${useImportedAttendance && importedMetrics?.attendancePercent !== null ? 'comp-toggle-pill-on' : 'comp-toggle-pill-off'} ${!importedMetrics || importedMetrics.attendancePercent === null ? 'comp-toggle-pill-disabled' : ''}`}
              disabled={!importedMetrics || importedMetrics.attendancePercent === null}
              onClick={() => setUseImportedAttendance((current) => !current)}
            >
              <span className="comp-toggle-pill-badge">
                {useImportedAttendance && importedMetrics?.attendancePercent !== null ? 'On' : 'Off'}
              </span>
              <span>Use imported attendance</span>
            </button>
            <button
              type="button"
              className={`comp-toggle-pill ${useImportedBonus && importedMetrics?.bonusVoicePerHour !== null ? 'comp-toggle-pill-on' : 'comp-toggle-pill-off'} ${!importedMetrics || importedMetrics.bonusVoicePerHour === null ? 'comp-toggle-pill-disabled' : ''}`}
              disabled={!importedMetrics || importedMetrics.bonusVoicePerHour === null}
              onClick={() => setUseImportedBonus((current) => !current)}
            >
              <span className="comp-toggle-pill-badge">
                {useImportedBonus && importedMetrics?.bonusVoicePerHour !== null ? 'On' : 'Off'}
              </span>
              <span>Use imported bonus per hour</span>
            </button>
          </div>

          <div className="comp-ring-grid">
            <div className="comp-ring-card">
              <span>OT earnings</span>
              <div className="comp-ring" style={{ ['--fill' as string]: `${Math.min(100, workedOtHours * 8)}%` }}>
                <div>
                  <strong>{formatMoney(otBasePay)}</strong>
                  <small>{workedOtHours.toFixed(2)} OT hours</small>
                </div>
              </div>
            </div>
            <div className="comp-ring-card">
              <span>Attendance</span>
              <div className="comp-ring" style={{ ['--fill' as string]: `${Math.min(100, effectiveAttendance)}%`, ['--ring-color' as string]: bonusEligible ? '#22c55e' : '#ef4444' }}>
                <div>
                  <strong>{formatPercent(effectiveAttendance)}</strong>
                  <small>{bonusEligible ? 'Eligible' : 'Bonus locked'}</small>
                </div>
              </div>
            </div>
          </div>

          <div className="comp-breakdown-list">
            <div className="comp-breakdown-row"><span>Certified missed regular time</span><strong>{minutesToHours(regularSummary.certifiedMinutes).toFixed(2)}h</strong></div>
            <div className="comp-breakdown-row"><span>Unexcused missed regular time</span><strong>{minutesToHours(regularSummary.unexcusedMinutes).toFixed(2)}h</strong></div>
            <div className="comp-breakdown-row"><span>Missed OT time</span><strong>{slotSummary.missedOtHours.toFixed(2)}h</strong></div>
            <div className="comp-breakdown-row"><span>Recovery hours at regular pay</span><strong>{recoveryHours.toFixed(2)}h</strong></div>
            <div className="comp-breakdown-row"><span>Estimated total</span><strong>{formatMoney(estimatedTotal)}</strong></div>
          </div>

          <div className="comp-subsection">
            <div className="comp-subsection-head">
              <div>
                <h4>Imported row and OT summary</h4>
                <p>This shows the row being used plus every OT or recovery item included in the estimate.</p>
              </div>
            </div>
            <div className="comp-detail-stack">
              {importedMetrics ? (
                <div className="comp-detail-card">
                  <div>
                    <strong>{importedMetrics.employeeName}</strong>
                    <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.82rem' }}>
                      {importedMetrics.sourceLabel} · Attendance {importedMetrics.attendancePercent !== null ? formatPercent(importedMetrics.attendancePercent) : 'N/A'} · Bonus {importedMetrics.bonusVoicePerHour !== null ? formatMoney(importedMetrics.bonusVoicePerHour) : 'N/A'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted">No imported metrics row selected yet.</div>
              )}

              {slotSummary.detailRows.length === 0 ? (
                <div className="text-muted">No OT rows are contributing to the current calculation.</div>
              ) : (
                slotSummary.detailRows.map((row) => (
                  <div key={`${row.label}-${row.meta}`} className={`comp-detail-card comp-detail-card-${row.tone}`}>
                    <div>
                      <strong>{row.label}</strong>
                      <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.82rem' }}>{row.meta}</div>
                    </div>
                    <strong>{row.hours.toFixed(2)}h</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
        </div>

        {!calculatorUnlocked && (
          <div className="comp-lock-overlay">
            <div className="comp-lock-card">
              <div className="comp-lock-icon">
                <Lock size={20} />
              </div>
              <strong>Protected estimator</strong>
              <p>
                Unlock the compensation estimator to review your projected fortnight pay, attendance, and OT scenarios.
              </p>
              <button type="button" className="comp-unlock-button" onClick={() => setUnlockModalOpen(true)}>
                <Lock size={16} />
                Unlock estimator
              </button>
            </div>
          </div>
        )}
      </div>

      {selectorOpen && (
        <div className="modal-overlay" onClick={() => setSelectorOpen(false)}>
          <div className="modal comp-modal" onClick={(event) => event.stopPropagation()}>
            <div className="comp-modal-head">
              <div>
                <h3 style={{ margin: 0 }}>Select your metrics row</h3>
                <p className="text-muted" style={{ margin: '0.45rem 0 0' }}>
                  I found multiple agent names. Pick your own row so the calculator only uses your attendance and bonus data.
                </p>
              </div>
            </div>

            <div className="comp-modal-grid">
              <label className="comp-field">
                <span>Search agent</span>
                <div className="comp-search-shell">
                  <Search size={15} />
                  <input className="input" value={selectorQuery} onChange={(event) => setSelectorQuery(event.target.value)} placeholder="Type part of your name" />
                </div>
              </label>
              <label className="comp-field">
                <span>Detected agent names</span>
                  <ModernSelect
                    value={selectorValue}
                    onValueChange={setSelectorValue}
                    options={filteredSelectorRows.map((row) => ({
                      label: row.employeeName,
                      value: normalizeName(row.employeeName)
                    }))}
                  />
              </label>
            </div>

            {selectedSelectorRow && (
              <div className="comp-selector-preview">
                <div className="summary-mini-card"><span>Employee</span><strong>{selectedSelectorRow.employeeName}</strong></div>
                <div className="summary-mini-card"><span>Attendance</span><strong>{selectedSelectorRow.attendancePercent !== null ? formatPercent(selectedSelectorRow.attendancePercent) : 'N/A'}</strong></div>
                <div className="summary-mini-card"><span>Total bonus voice</span><strong>{selectedSelectorRow.bonusVoicePerHour !== null ? formatMoney(selectedSelectorRow.bonusVoicePerHour) : 'N/A'}</strong></div>
              </div>
            )}

            <div className="comp-modal-actions">
              <button className="btn btn-ghost" onClick={() => setSelectorOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!selectedSelectorRow} onClick={() => selectedSelectorRow && applyImportedRow(selectedSelectorRow)}>Use this row</button>
            </div>
          </div>
        </div>
      )}

      {unlockModalOpen && (
        <div className="modal-overlay" onClick={() => setUnlockModalOpen(false)}>
          <div className="modal comp-modal comp-unlock-modal" onClick={(event) => event.stopPropagation()}>
            <div className="comp-unlock-head">
              <div className="comp-lock-icon">
                <Lock size={20} />
              </div>
              <div>
                <div className="comp-eyebrow" style={{ marginBottom: '0.35rem' }}>Estimator Notice</div>
                <h3 style={{ margin: 0 }}>Before you use this calculator</h3>
              </div>
            </div>

            <p className="comp-unlock-copy">
              This compensation calculator is provided only as a support tool to help you estimate your possible
              fortnight earnings. It is not an official payroll source and it should not be treated as a final
              salary confirmation.
            </p>

            <div className="comp-unlock-points">
              <div className="comp-unlock-point">
                <strong>Estimated result only</strong>
                <span>Your final payment may vary based on the exact hours and minutes recorded in AWS plus the final metrics submitted at the end of the pay period.</span>
              </div>
              <div className="comp-unlock-point">
                <strong>Attendance and OT depend on official records</strong>
                <span>This widget helps you project outcomes, but the official calculation always comes from the approved production systems and final reporting.</span>
              </div>
              <div className="comp-unlock-point">
                <strong>Recurring acknowledgement</strong>
                <span>For clarity and accountability, access to this calculator will lock again every 7 days and the notice must be acknowledged again.</span>
              </div>
            </div>

            <div className="comp-modal-actions">
              <button className="btn btn-ghost" onClick={() => setUnlockModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={acknowledgeCalculatorNotice}>
                I understand and want to continue
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .comp-shell { margin-top: 1.5rem; display: grid; gap: 1rem; overflow: visible; position: relative; }
        .comp-estimator-frame { position: relative; }
        .comp-estimator-content { display: grid; gap: 1rem; transition: filter 220ms ease, opacity 220ms ease, transform 220ms ease; }
        .comp-estimator-content-locked { filter: blur(14px); opacity: 0.35; pointer-events: none; transform: scale(0.995); user-select: none; }
        .comp-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
        .comp-eyebrow { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--text-muted); font-weight: 700; margin-bottom: 0.4rem; }
        .comp-title { margin: 0; font-size: 1.8rem; font-weight: 800; letter-spacing: -0.03em; }
        .comp-subtitle { margin: 0.6rem 0 0; color: var(--text-secondary); max-width: 72ch; line-height: 1.7; }
        .comp-header-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: center; }
        .comp-status { display: flex; align-items: center; gap: 0.65rem; padding: 1rem 1.1rem; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); }
        .comp-status-neutral { background: rgba(124,108,255,0.08); }
        .comp-status-success { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.22); }
        .comp-status-warning { background: rgba(245,158,11,0.1); border-color: rgba(245,158,11,0.22); }
        .comp-top-grid, .comp-stats-grid, .comp-modal-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.9rem; }
        .comp-imported-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
        .comp-field { display: grid; gap: 0.35rem; min-width: 0; }
        .comp-field span { font-size: 0.74rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .comp-main-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
        .comp-panel { display: grid; gap: 1rem; padding: 1rem; border: 1px solid var(--border-subtle); border-radius: 18px; background: rgba(255,255,255,0.02); min-width: 0; }
        .comp-panel-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
        .comp-panel h3, .comp-subsection h4, .comp-batch-editor h4 { margin: 0; font-size: 1.08rem; }
        .comp-panel p, .comp-subsection p, .comp-batch-editor p { margin: 0.35rem 0 0; color: var(--text-secondary); line-height: 1.6; }
        .comp-pill-toggle { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .comp-reference-box {
          padding: 1rem 1.05rem;
          border-radius: 16px;
          background:
            linear-gradient(135deg, rgba(124,108,255,0.16), rgba(42,190,255,0.08)),
            rgba(14, 18, 31, 0.75);
          border: 1px solid rgba(124,108,255,0.22);
          color: var(--text-secondary);
          line-height: 1.7;
        }
        .comp-schedule-toolbar,
        .comp-batch-editor,
        .comp-stat-card,
        .summary-mini-card,
        .comp-ring-card {
          border: 1px solid rgba(255,255,255,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .comp-schedule-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
          padding: 1rem 1.05rem;
          border-radius: 18px;
        }
        .comp-schedule-toolbar strong { display: block; font-size: 0.98rem; }
        .comp-schedule-toolbar p { margin: 0.35rem 0 0; font-size: 0.84rem; }
        .comp-schedule-toolbar-actions { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        .comp-schedule-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.9rem; }
        .comp-schedule-bubble {
          display: grid;
          grid-template-rows: auto 1fr;
          border-radius: 22px;
          overflow: hidden;
          min-width: 0;
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
          box-shadow: 0 18px 34px rgba(5, 10, 24, 0.18);
        }
        .comp-schedule-bubble:hover { transform: translateY(-2px); }
        .comp-schedule-bubble-enabled { border: 1px solid rgba(34,197,94,0.46); box-shadow: 0 18px 34px rgba(5, 10, 24, 0.18), 0 0 0 1px rgba(34,197,94,0.14); }
        .comp-schedule-bubble-disabled { border: 1px solid rgba(239,68,68,0.38); box-shadow: 0 18px 34px rgba(5, 10, 24, 0.18), 0 0 0 1px rgba(239,68,68,0.12); }
        .comp-schedule-bubble-selected { transform: translateY(-2px); box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 18px 34px rgba(5, 10, 24, 0.18), 0 0 28px rgba(124,108,255,0.15); }
        .comp-schedule-banner {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          padding: 0.8rem 0.95rem;
          font-size: 0.84rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .comp-schedule-banner-enabled { background: linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.08)); color: #dcfce7; }
        .comp-schedule-banner-disabled { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(239,68,68,0.08)); color: #fee2e2; }
        .comp-batch-chip-button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10, 14, 24, 0.36);
          color: inherit;
          padding: 0.4rem 0.68rem;
          font-size: 0.74rem;
          font-weight: 700;
        }
        .comp-batch-chip-button-active { background: rgba(124,108,255,0.22); border-color: rgba(167,139,250,0.5); }
        .comp-schedule-bubble-body {
          display: grid;
          gap: 0.95rem;
          padding: 1rem;
          background: linear-gradient(180deg, rgba(16,23,41,0.86), rgba(12,16,28,0.96));
        }
        .comp-schedule-bubble-topline { display: flex; justify-content: space-between; gap: 0.9rem; align-items: flex-start; }
        .comp-schedule-bubble-topline strong { display: block; font-size: 1rem; line-height: 1.4; }
        .comp-schedule-time-range { margin-top: 0.35rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; }
        .comp-clock-button {
          width: 42px;
          height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: var(--text-primary);
          display: inline-grid;
          place-items: center;
          transition: transform 180ms ease, border-color 180ms ease, background 180ms ease;
        }
        .comp-clock-button:hover { transform: translateY(-1px); border-color: rgba(42,190,255,0.42); background: rgba(42,190,255,0.12); }
        .comp-schedule-chip-row { display: flex; gap: 0.55rem; flex-wrap: wrap; align-items: center; }
        .comp-state-chip,
        .comp-auto-ot-chip,
        .comp-chip,
        .comp-chip-static {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          border-radius: 999px;
          padding: 0.45rem 0.78rem;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .comp-state-chip { border: 1px solid transparent; }
        .comp-state-chip-on { background: rgba(34,197,94,0.12); color: #86efac; border-color: rgba(34,197,94,0.24); }
        .comp-state-chip-off { background: rgba(239,68,68,0.12); color: #fca5a5; border-color: rgba(239,68,68,0.24); }
        .comp-auto-ot-chip { background: rgba(249,115,22,0.14); color: #fdba74; border: 1px solid rgba(249,115,22,0.28); }
        .comp-auto-ot-list { display: grid; gap: 0.45rem; }
        .comp-auto-ot-entry {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
          padding: 0.7rem 0.8rem;
          border-radius: 14px;
          border: 1px solid rgba(249,115,22,0.16);
          background: rgba(249,115,22,0.08);
        }
        .comp-auto-ot-more { color: var(--text-muted); font-size: 0.78rem; }
        .comp-batch-editor {
          display: grid;
          gap: 0.95rem;
          padding: 1rem 1.05rem;
          border-radius: 20px;
        }
        .comp-batch-editor-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .comp-batch-editor-grid,
        .comp-inline-row,
        .comp-absence-row,
        .comp-manual-grid {
          display: grid;
          gap: 0.75rem;
        }
        .comp-batch-editor-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .comp-subsection { display: grid; gap: 0.75rem; }
        .comp-subsection-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
        .comp-inline-row { grid-template-columns: minmax(0, 1fr) auto; }
        .comp-manual-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .comp-chip-row { display: flex; gap: 0.65rem; flex-wrap: wrap; }
        .comp-chip { border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-primary); }
        .comp-chip-static { border: 1px solid rgba(124,108,255,0.2); background: rgba(124,108,255,0.1); color: #ddd6fe; }
        .comp-day-check { display: inline-flex; align-items: center; gap: 0.45rem; font-weight: 700; }
        .comp-absence-list, .comp-slot-list, .comp-detail-stack, .comp-breakdown-list { display: grid; gap: 0.7rem; }
        .comp-absence-list { max-height: 360px; overflow-y: auto; }
        .comp-absence-row { grid-template-columns: minmax(140px, 1fr) minmax(120px, 0.9fr) minmax(120px, 0.9fr) auto auto; align-items: center; }
        .comp-slot-row, .comp-detail-card, .comp-breakdown-row { display: flex; justify-content: space-between; gap: 0.9rem; align-items: center; }
        .comp-slot-row, .comp-detail-card { padding: 0.95rem 1rem; border-radius: 14px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .comp-slot-select { min-width: 210px; }
        .comp-detail-card-worked { border-color: rgba(34,197,94,0.2); }
        .comp-detail-card-missed { border-color: rgba(239,68,68,0.2); }
        .comp-detail-card-recovery { border-color: rgba(59,130,246,0.2); }
        .comp-breakdown-row { padding: 0.8rem 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .comp-breakdown-row:last-child { border-bottom: none; padding-bottom: 0; }
        .comp-stat-card, .summary-mini-card, .comp-ring-card { padding: 1rem; border-radius: 16px; display: grid; gap: 0.35rem; min-width: 0; }
        .comp-stat-card span, .summary-mini-card span, .comp-ring-card span { color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
        .comp-stat-card strong, .summary-mini-card strong, .comp-ring-card strong { font-size: 1.18rem; }
        .comp-stat-card small, .comp-ring-card small { color: var(--text-secondary); }
        .comp-positive { color: #22c55e; }
        .comp-negative { color: #ef4444; }
        .comp-toggle-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.25rem;
          min-height: 80px;
          padding: 1.25rem 1.6rem;
          border-radius: 20px;
          border: 1px solid transparent;
          color: var(--text-primary);
          background: rgba(255,255,255,0.04);
          text-align: left;
          font-weight: 700;
          transition: all 160ms ease;
        }
        .comp-toggle-pill:hover:not(:disabled) { transform: translateY(-1px); }
        .comp-toggle-pill-on { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.28); color: #dcfce7; }
        .comp-toggle-pill-off { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.24); color: #fee2e2; }
        .comp-toggle-pill-disabled { opacity: 0.45; cursor: not-allowed; filter: grayscale(0.1); }
        .comp-toggle-pill-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 42px;
          padding: 0.28rem 0.55rem;
          border-radius: 999px;
          background: rgba(10,14,22,0.28);
          border: 1px solid rgba(255,255,255,0.12);
          font-size: 0.72rem;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .comp-ring-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
        .comp-ring { --fill: 0%; --ring-color: #7c6cff; width: 176px; height: 176px; border-radius: 50%; margin: 0.85rem auto 0; display: grid; place-items: center; background: conic-gradient(var(--ring-color) var(--fill), rgba(255,255,255,0.08) 0); }
        .comp-ring > div { width: 128px; height: 128px; border-radius: 50%; background: #141a2a; display: grid; place-items: center; text-align: center; padding: 1rem; }
        .comp-header-info { position: relative; display: inline-flex; align-items: center; }
        .comp-info-button {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: rgba(15,23,42,0.78);
          color: white;
          display: grid;
          place-items: center;
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        .comp-info-tooltip {
          position: absolute;
          top: calc(100% + 0.55rem);
          right: 0;
          width: min(280px, calc(100vw - 2rem));
          padding: 0.85rem 0.95rem;
          border-radius: 14px;
          background: rgba(10,14,22,0.94);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-secondary);
          font-size: 0.8rem;
          line-height: 1.55;
          opacity: 0;
          transform: translateY(-6px);
          pointer-events: none;
          transition: opacity 160ms ease, transform 160ms ease;
        }
        .comp-header-info:hover .comp-info-tooltip,
        .comp-header-info:focus-within .comp-info-tooltip { opacity: 1; transform: translateY(0); }
        .comp-medical-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          min-height: 44px;
          padding: 0.7rem 0.9rem;
          border-radius: 14px;
          border: 1px solid transparent;
          font-weight: 700;
          white-space: nowrap;
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .comp-medical-toggle:hover { transform: translateY(-1px); }
        .comp-medical-toggle-on { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.28); color: #bbf7d0; }
        .comp-medical-toggle-off { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.24); color: #fecaca; }
        .comp-lock-overlay {
          position: absolute;
          inset: 0;
          z-index: 4;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          border-radius: 24px;
          background: linear-gradient(180deg, rgba(7,10,18,0.18), rgba(7,10,18,0.42));
          backdrop-filter: blur(6px);
        }
        .comp-lock-card {
          width: min(420px, 100%);
          display: grid;
          justify-items: center;
          gap: 0.9rem;
          text-align: center;
          padding: 1.4rem 1.25rem;
          border-radius: 24px;
          border: 1px solid rgba(249,115,22,0.26);
          background: linear-gradient(180deg, rgba(18,23,38,0.95), rgba(12,16,28,0.98));
          box-shadow: 0 0 0 1px rgba(249,115,22,0.08), 0 0 34px rgba(249,115,22,0.18);
        }
        .comp-lock-card strong { font-size: 1.16rem; }
        .comp-lock-card p { margin: 0; color: var(--text-secondary); line-height: 1.65; }
        .comp-lock-icon {
          width: 58px;
          height: 58px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          color: white;
          background: linear-gradient(135deg, #ff8b36, #ff6b00);
          box-shadow: 0 0 28px rgba(255,123,36,0.42);
        }
        .comp-unlock-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.6rem;
          border: none;
          border-radius: 999px;
          padding: 0.9rem 1.2rem;
          background: linear-gradient(135deg, #ff8b36, #ff6b00);
          color: white;
          font-weight: 800;
          box-shadow: 0 0 22px rgba(255,123,36,0.36);
          animation: compGlow 2.8s ease-in-out infinite;
        }
        .comp-modal { width: min(780px, calc(100vw - 1.5rem)); max-width: none; display: grid; gap: 1rem; }
        .comp-unlock-modal { width: min(860px, calc(100vw - 1.5rem)); }
        .comp-modal-head, .comp-unlock-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
        .comp-unlock-head { align-items: center; }
        .comp-unlock-copy { margin: 0; color: var(--text-secondary); line-height: 1.7; }
        .comp-unlock-points { display: grid; gap: 0.85rem; }
        .comp-unlock-point {
          display: grid;
          gap: 0.35rem;
          padding: 1rem;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
        }
        .comp-unlock-point strong { font-size: 0.95rem; }
        .comp-unlock-point span { color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6; }
        .comp-search-shell, .comp-select-shell { position: relative; display: flex; align-items: center; }
        .comp-search-shell svg, .comp-select-shell svg { position: absolute; left: 0.9rem; color: var(--text-muted); pointer-events: none; }
        .comp-search-shell .input, .comp-select-shell .input { padding-left: 2.1rem; }
        .comp-select-shell svg { left: auto; right: 0.9rem; }
        .comp-select-shell .input { appearance: none; padding-right: 2.4rem; }
        .comp-selector-preview { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem; }
        .comp-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap; }
        @keyframes compGlow {
          0%, 100% { transform: translateY(0); box-shadow: 0 0 20px rgba(255,123,36,0.28); }
          50% { transform: translateY(-1px); box-shadow: 0 0 30px rgba(255,123,36,0.42); }
        }
        @media (max-width: 1200px) {
          .comp-top-grid, .comp-stats-grid, .comp-modal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .comp-imported-grid { grid-template-columns: 1fr 1fr; }
          .comp-main-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 860px) {
          .comp-inline-row, .comp-manual-grid, .comp-absence-row, .comp-ring-grid, .comp-selector-preview, .comp-batch-editor-grid { grid-template-columns: 1fr; }
          .comp-slot-row, .comp-detail-card, .comp-schedule-bubble-topline { flex-direction: column; align-items: flex-start; }
          .comp-slot-select { width: 100%; min-width: 0; }
        }
        @media (max-width: 640px) {
          .comp-top-grid, .comp-stats-grid, .comp-modal-grid, .comp-imported-grid { grid-template-columns: 1fr; }

          .comp-header, .comp-panel-head, .comp-subsection-head, .comp-batch-editor-head, .comp-schedule-toolbar { flex-direction: column; }
          .comp-absence-row { grid-template-columns: 1fr; }
          .comp-ring { width: 152px; height: 152px; }
          .comp-ring > div { width: 112px; height: 112px; }
          .comp-schedule-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  );
}
