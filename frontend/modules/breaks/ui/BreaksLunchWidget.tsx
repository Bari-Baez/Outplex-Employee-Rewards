'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  type LucideIcon,
  Coffee, 
  Utensils, 
  FileText, 
  Bath, 
  AlertCircle, 
  Clock, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  Activity,
  History,
  Timer,
  AlertOctagon
} from 'lucide-react';
import type { DailySchedule, TimeLogAudit, BreakEventType, DelayReason } from '@shared/contracts/database';
import { formatTimeDisplay } from '@backend/modules/breaks/domain/schedule';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BreakCardDef {
  eventType: BreakEventType;
  label: string;
  startField: keyof DailySchedule;
  endField: keyof DailySchedule;
  icon: LucideIcon;
  isEligible: (s: DailySchedule) => boolean;
}

const BREAK_CARDS: BreakCardDef[] = [
  {
    eventType: 'first_break',
    label: '1st Break',
    startField: 'first_break_start',
    endField: 'first_break_end',
    icon: Coffee,
    isEligible: () => true,
  },
  {
    eventType: 'lunch',
    label: 'Lunch',
    startField: 'lunch_start',
    endField: 'lunch_end',
    icon: Utensils,
    isEligible: () => true,
  },
  {
    eventType: 'second_break',
    label: '2nd Break',
    startField: 'second_break_start',
    endField: 'second_break_end',
    icon: Coffee,
    isEligible: () => true,
  },
  {
    eventType: 'third_break',
    label: '3rd Break',
    startField: 'third_break_start',
    endField: 'third_break_end',
    icon: Coffee,
    isEligible: (s) => s.third_break_start !== null,
  },
];

const DELAY_REASONS: { value: DelayReason; label: string }[] = [
  { value: 'due_a_call', label: 'Due to a call in progress' },
  { value: 'due_a_meeting', label: 'Due to a meeting' },
  { value: 'other', label: 'Other reason' },
];

// ─── Main Component ────────────────────────────────────────────────────────────

export function BreaksLunchWidget() {
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [logs, setLogs] = useState<TimeLogAudit[]>([]);
  const [loading, setLoading] = useState(true);

  // Blocking overlay state
  const [pendingEvent, setPendingEvent] = useState<BreakEventType | null>(null);
  const [varianceInfo, setVarianceInfo] = useState<{ minutes: number; requiresReason: boolean } | null>(null);
  const [selectedReason, setSelectedReason] = useState<DelayReason | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live timer for open breaks
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [timerElapsed, setTimerElapsed] = useState<Record<string, number>>({}); // logId -> seconds elapsed

  // ─── Load Schedule ──────────────────────────────────────────────────────────
  const loadSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/breaks/my-schedule');
      if (!res.ok) return;
      const data = await res.json() as { schedule: DailySchedule | null; logs: TimeLogAudit[] };
      setSchedule(data.schedule);
      setLogs(data.logs ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule();
  }, [loadSchedule]);

  // ─── Live timers for open breaks ────────────────────────────────────────────
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimerElapsed((prev) => {
        const next = { ...prev };
        logs.filter((l) => l.is_open && l.actual_start).forEach((l) => {
          next[l.id] = Math.floor((Date.now() - new Date(l.actual_start!).getTime()) / 1000);
        });
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [logs]);

  // ─── Helpers ────────────────────────────────────────────────────────────────
  const getLogFor = (eventType: BreakEventType) =>
    logs.find((l) => l.event_type === eventType) ?? null;

  const hasOpenBreak = logs.some((l) => l.is_open && l.event_type !== 'bath_time');
  const openBathTime = logs.find((l) => l.event_type === 'bath_time' && l.is_open) ?? null;

  function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // ─── Start Break ────────────────────────────────────────────────────────────
  async function startBreak(eventType: BreakEventType, reason?: DelayReason) {
    if (!schedule) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/breaks/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily_schedule_id: schedule.id,
          event_type: eventType,
          delay_reason: reason ?? null,
        }),
      });

      const data = await res.json() as {
        requiresReason?: boolean;
        varianceMinutes?: number;
        message?: string;
        success?: boolean;
        log?: TimeLogAudit;
        error?: string;
      };

      if (res.status === 422 && data.requiresReason) {
        // Show blocking overlay — mandatory reason required
        setPendingEvent(eventType);
        setVarianceInfo({ minutes: data.varianceMinutes!, requiresReason: true });
        return;
      }

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      // Success — refresh logs
      setPendingEvent(null);
      setVarianceInfo(null);
      setSelectedReason('');
      await loadSchedule();
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Confirm Delayed Break ────────────────────────────────────────────────
  async function confirmDelayedBreak() {
    if (!pendingEvent || !selectedReason) return;
    await startBreak(pendingEvent, selectedReason as DelayReason);
  }

  // ─── End Break ───────────────────────────────────────────────────────────
  async function endBreak(logId: string) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/breaks/report-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: logId }),
      });
      if (res.ok) await loadSchedule();
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="blw-card blw-loading">
        <div className="blw-shimmer" />
        <div className="blw-shimmer blw-shimmer--short" />
      </div>
    );
  }

  // ─── No schedule ─────────────────────────────────────────────────────────
  if (!schedule) {
    return (
      <div className="blw-card blw-empty">
        <div className="blw-empty__icon"><FileText size={48} /></div>
        <p className="blw-empty__title">No break schedule for today</p>
        <p className="blw-empty__sub">Check back later — your supervisor will publish it soon.</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="blw-card">
      {/* Header */}
      <div className="blw-header">
        <div className="blw-header__left">
          <span className="blw-header__icon"><Clock size={20} /></span>
          <div>
            <h3 className="blw-header__title">Breaks & Lunches</h3>
            <p className="blw-header__sub">{today} · {schedule.lob ?? ''}</p>
          </div>
        </div>
        <div className="blw-shift-badge">
          {schedule.shift_start ? formatTimeDisplay(schedule.shift_start) : '--'}
          <span className="blw-shift-badge__sep">→</span>
          {schedule.shift_end ? formatTimeDisplay(schedule.shift_end) : '--'}
        </div>
      </div>

      {/* OT flag */}
      {schedule.is_ot_day && (
        <div className="blw-ot-banner">⚡ OT Day — Overtime hours apply</div>
      )}

      {/* Break cards */}
      <div className="blw-breaks">
        {BREAK_CARDS.filter((c) => c.isEligible(schedule)).map((card) => {
          const log = getLogFor(card.eventType);
          const startTime = schedule[card.startField] as string | null;
          const endTime = schedule[card.endField] as string | null;
          const isDone = log !== null && !log.is_open;
          const isOpen = log !== null && log.is_open;

          return (
            <div
              key={card.eventType}
              className={`blw-break-card ${isDone ? 'blw-break-card--done' : ''} ${isOpen ? 'blw-break-card--open' : ''}`}
            >
              <div className="blw-break-card__info">
                <span className="blw-break-card__icon"><card.icon size={20} /></span>
                <div>
                  <p className="blw-break-card__label">{card.label}</p>
                  <p className="blw-break-card__time">
                    {startTime ? formatTimeDisplay(startTime) : '—'} 
                    {endTime ? ` – ${formatTimeDisplay(endTime)}` : ''}
                  </p>
                  {isOpen && log.actual_start && (
                    <p className="blw-break-card__timer">
                      <Timer size={14} /> {formatElapsed(timerElapsed[log.id] ?? 0)}
                    </p>
                  )}
                  {isDone && log.variance_minutes !== null && (
                    <p className={`blw-break-card__variance ${log.variance_minutes > 5 ? 'blw-var--late' : 'blw-var--ok'}`}>
                      {log.variance_minutes > 5
                        ? <><AlertTriangle size={12} className="animate-pulse" /> {Math.round(log.variance_minutes)}m late</>
                        : <><Check size={12} /> On time</>}
                    </p>
                  )}
                </div>
              </div>
              <div className="blw-break-card__actions">
                {!log && !hasOpenBreak && (
                  <button
                    className="blw-btn blw-btn--start"
                    onClick={() => startBreak(card.eventType)}
                    disabled={submitting}
                  >
                    {submitting ? '...' : 'Start'}
                  </button>
                )}
                {isOpen && (
                  <button
                    className="blw-btn blw-btn--end"
                    onClick={() => endBreak(log.id)}
                    disabled={submitting}
                  >
                    {submitting ? <Activity size={16} className="spin" /> : 'End Break'}
                  </button>
                )}
                {isDone && <span className="blw-done-check"><CheckCircle2 size={18} /></span>}
              </div>
            </div>
          );
        })}

        {/* Bath Time Card */}
        <div className={`blw-break-card blw-break-card--bath ${openBathTime ? 'blw-break-card--open' : ''}`}>
          <div className="blw-break-card__info">
            <span className="blw-break-card__icon"><Bath size={20} /></span>
            <div>
              <p className="blw-break-card__label">Bath Time</p>
              <p className="blw-break-card__time">Unpaid · Notify supervisor</p>
              {openBathTime && openBathTime.actual_start && (
                <p className="blw-break-card__timer">
                  <Activity size={14} className="blw-text-err" /> Offline {formatElapsed(timerElapsed[openBathTime.id] ?? 0)}
                </p>
              )}
            </div>
          </div>
          <div className="blw-break-card__actions">
            {!openBathTime && (
              <button
                className="blw-btn blw-btn--bath"
                onClick={() => startBreak('bath_time')}
                disabled={submitting}
              >
                Go Offline
              </button>
            )}
            {openBathTime && (
              <button
                className="blw-btn blw-btn--end"
                onClick={() => endBreak(openBathTime.id)}
                disabled={submitting}
              >
                Back Online
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="blw-error">{error}</div>}

      {/* ── BLOCKING OVERLAY: Mandatory Delay Reason ── */}
      {pendingEvent && varianceInfo && (
        <div className="blw-overlay glass-morphism animate-fade-in" role="dialog" aria-modal="true">
          <div className="blw-overlay__panel animate-pop-in">
            <div className="blw-overlay__icon"><AlertOctagon size={48} className="blw-text-err animate-pulse" /></div>
            <h3 className="blw-overlay__title">Refined Control · Delay Detected</h3>
            <p className="blw-overlay__body">
              Your {pendingEvent.replace(/_/g, ' ')} is starting outside the 5-minute grace period. 
              <br/>
              <strong>Status:</strong> {Math.round(varianceInfo.minutes)} minutes after scheduled time.
              <br/>
              Please provide a brief justification to maintain workforce accuracy.
            </p>

            <div className="blw-overlay__reasons">
              {DELAY_REASONS.map((r) => (
                <label key={r.value} className={`blw-reason-option ${selectedReason === r.value ? 'blw-reason-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="delay_reason"
                    value={r.value}
                    checked={selectedReason === r.value}
                    onChange={() => setSelectedReason(r.value)}
                  />
                  <div className="blw-reason-dot" />
                  {r.label}
                </label>
              ))}
            </div>

            <div className="blw-overlay__footer">
              <button
                className="blw-btn blw-btn--confirm"
                onClick={confirmDelayedBreak}
                disabled={!selectedReason || submitting}
              >
                {submitting ? 'Authenticating...' : 'Confirm & Log Entry'}
              </button>
              <button
                className="blw-btn blw-btn--cancel"
                onClick={() => { setPendingEvent(null); setVarianceInfo(null); setSelectedReason(''); }}
                disabled={submitting}
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
