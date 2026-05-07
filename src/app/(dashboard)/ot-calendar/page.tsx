'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock, CalendarDays, AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getOTClaimKindLabel, parseOTClaimMeta, type OTClaimKind } from '@/lib/ot-claim-meta';
import type { OTSlot } from '@/types/database';
import {
  formatOTDate,
  formatRelativeTime,
  formatTime,
  getCalendarDays,
  getLastDayOfMonth,
  isSameDay,
  isToday,
  toDateString,
} from '@/lib/utils';
import { getUnclaimWindowRemainingMs } from '@/lib/ot';
import { proxifyMediaUrl } from '@/lib/media-proxy';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export default function OTCalendarPage() {
  return (
    <Suspense>
      <OTCalendarPageContent />
    </Suspense>
  );
}

function OTCalendarPageContent() {
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const today = new Date();

  const initialDate = (() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsed = new Date(`${dateParam}T00:00:00`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return today;
  })();

  const [year, setYear] = useState(initialDate.getFullYear());
  const [month, setMonth] = useState(initialDate.getMonth());
  const [selectedDate, setSelectedDate] = useState<Date | null>(initialDate);
  const [selectedRange, setSelectedRange] = useState<{ start: Date; end: Date } | null>(null);
  const [rangeDraft, setRangeDraft] = useState<{ start: Date; end: Date } | null>(null);
  const [slots, setSlots] = useState<OTSlot[]>([]);
  const [selectedDaySlots, setSelectedDaySlots] = useState<OTSlot[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [slotModal, setSlotModal] = useState<{ type: 'claim' | 'unclaim'; slot: OTSlot } | null>(null);
  const [noticeModal, setNoticeModal] = useState<{ title: string; body: string } | null>(null);
  const [claimKind, setClaimKind] = useState<OTClaimKind>('scheduled_extension');
  const [claimMetas, setClaimMetas] = useState<Record<string, OTClaimKind>>({});
  const isDraggingRangeRef = useRef(false);
  const dragStartRef = useRef<Date | null>(null);
  const dragEndRef = useRef<Date | null>(null);
  const suppressClickRef = useRef(false);

  const days = getCalendarDays(year, month);

  useEffect(() => {
    void (async () => {
      const result = await supabase.auth.getUser();
      setUserId(result.data.user?.id ?? null);
    })();
  }, [supabase.auth]);

  const fetchMonthSlots = useCallback(async () => {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endDate = getLastDayOfMonth(year, month);

    const { data } = await supabase
      .from('ot_slots')
      .select(`*, claimedByUser:claimed_by(id, name, avatar_url, employee_id), batch:batch_id(id, name, status, published_at)`)
      .gte('date', startDate)
      .lte('date', endDate)
      .neq('status', 'cancelled')
      .order('start_time');

    const visibleSlots = ((data ?? []) as OTSlot[]).filter((slot: OTSlot) => !slot.batch || slot.batch.status === 'published');
    setSlots(visibleSlots);

    // Fetch OT type meta for claimed slots owned by the current user
    const currentUserId = (await supabase.auth.getUser()).data.user?.id;
    if (currentUserId) {
      const myClaimedIds = visibleSlots
        .filter(s => s.claimed_by === currentUserId)
        .map(s => `ot_claim_meta:${s.id}`);
      if (myClaimedIds.length > 0) {
        const { data: metaRows } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', myClaimedIds);
        if (metaRows) {
          const metas: Record<string, OTClaimKind> = {};
          for (const row of metaRows) {
            const meta = parseOTClaimMeta(row.value);
            if (meta) metas[meta.slotId] = meta.claimKind;
          }
          setClaimMetas(metas);
        }
      } else {
        setClaimMetas({});
      }
    }
  }, [year, month, supabase]);

  useEffect(() => {
    void fetchMonthSlots();
  }, [fetchMonthSlots]);

  useEffect(() => {
    const interval = window.setInterval(() => setClockTick(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedRange) {
      const start = toDateString(selectedRange.start);
      const end = toDateString(selectedRange.end);
      const from = start <= end ? start : end;
      const to = start <= end ? end : start;
      setSelectedDaySlots(
        slots
          .filter((slot) => slot.date >= from && slot.date <= to)
          .slice()
          .sort((a, b) => (a.date === b.date ? a.start_time.localeCompare(b.start_time) : a.date.localeCompare(b.date))),
      );
      return;
    }

    if (selectedDate) {
      const dateString = toDateString(selectedDate);
      setSelectedDaySlots(slots.filter((slot) => slot.date === dateString));
      return;
    }

    setSelectedDaySlots([]);
  }, [slots, selectedDate, selectedRange]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchMonthSlots();
    }, 15000);

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void fetchMonthSlots();
      }
    };

    const syncOnFocus = () => {
      void fetchMonthSlots();
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncOnFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncOnFocus);
    };
  }, [fetchMonthSlots]);

  const hasSlots = (day: Date) => {
    const dateString = toDateString(day);
    return slots.some((slot) => slot.date === dateString);
  };

  const hasAvailable = (day: Date) => {
    const dateString = toDateString(day);
    return slots.some((slot) => slot.date === dateString && slot.status === 'available');
  };

  const activeRange = rangeDraft ?? selectedRange;

  const isInRange = useCallback(
    (day: Date) => {
      if (!activeRange) return false;
      const start = toDateString(activeRange.start);
      const end = toDateString(activeRange.end);
      const from = start <= end ? start : end;
      const to = start <= end ? end : start;
      const target = toDateString(day);
      return target >= from && target <= to;
    },
    [activeRange],
  );

  const finalizeRangeSelection = useCallback(() => {
    if (!isDraggingRangeRef.current || !dragStartRef.current) {
      setRangeDraft(null);
      return;
    }

    const start = dragStartRef.current;
    const end = dragEndRef.current ?? dragStartRef.current;

    isDraggingRangeRef.current = false;
    dragStartRef.current = null;
    dragEndRef.current = null;
    setRangeDraft(null);

    if (isSameDay(start, end)) {
      setSelectedRange(null);
      setSelectedDate(start);
      return;
    }

    setSelectedDate(null);
    setSelectedRange(start <= end ? { start, end } : { start: end, end: start });
  }, []);

  useEffect(() => {
    const handlePointerUp = () => {
      if (!isDraggingRangeRef.current) return;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      finalizeRangeSelection();
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [finalizeRangeSelection]);

  useEffect(() => {
    const lookup = new Map(days.map((day) => [toDateString(day), day] as const));

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDraggingRangeRef.current || !dragStartRef.current) {
        return;
      }

      const hovered = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const dayButton = hovered?.closest?.('[data-cal-date]') as HTMLElement | null;
      if (!dayButton) {
        return;
      }

      const dayKey = dayButton.getAttribute('data-cal-date');
      if (!dayKey) {
        return;
      }

      const day = lookup.get(dayKey);
      if (!day) {
        return;
      }

      dragEndRef.current = day;
      setRangeDraft({ start: dragStartRef.current, end: day });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [days]);

  const headerLabel = useMemo(() => {
    if (selectedRange) {
      const start = selectedRange.start;
      const end = selectedRange.end;
      const from = start <= end ? start : end;
      const to = start <= end ? end : start;
      return `${from.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} → ${to.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }

    if (selectedDate) {
      return selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    }

    return '';
  }, [selectedDate, selectedRange]);

  const navigateMonth = (direction: 1 | -1) => {
    let nextMonth = month + direction;
    let nextYear = year;
    if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
    setSelectedDate(null);
    setSelectedRange(null);
    setRangeDraft(null);
  };

  const performClaimSlot = async (slot: OTSlot) => {
    if (!userId) return;

    setClaimingId(slot.id);
    try {
      const response = await fetch('/api/ot/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id, claimKind }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setNoticeModal({
          title: 'Unable to reserve OT',
          body: payload.error ?? 'Failed to claim slot.',
        });
        return;
      }

      setSlots((current) =>
        current.map((existing) =>
          existing.id === slot.id
            ? {
                ...existing,
                status: 'claimed',
                claimed_by: userId,
                claimed_at: new Date().toISOString(),
              }
            : existing,
        ),
      );
      setClaimMetas(current => ({ ...current, [slot.id]: claimKind }));
    } finally {
      setClaimingId(null);
      setSlotModal(null);
    }
  };

  const performUnclaimSlot = async (slot: OTSlot) => {
    setClaimingId(slot.id);
    try {
      const response = await fetch('/api/ot/unclaim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId: slot.id }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setNoticeModal({
          title: 'Unable to release OT',
          body: payload.error ?? 'Failed to release slot.',
        });
        return;
      }

      setSlots((current) =>
        current.map((existing) =>
          existing.id === slot.id
            ? {
                ...existing,
                status: 'available',
                claimed_by: null,
                claimed_at: null,
                claimedByUser: undefined,
              }
            : existing,
        ),
      );
      setClaimMetas(current => {
        const next = { ...current };
        delete next[slot.id];
        return next;
      });
    } finally {
      setClaimingId(null);
      setSlotModal(null);
    }
  };

  const claimSlot = (slot: OTSlot) => {
    if (!userId) {
      setNoticeModal({
        title: 'Sign-in required',
        body: 'You need to sign in before reserving an OT slot.',
      });
      return;
    }

    setClaimKind('scheduled_extension');
    setSlotModal({ type: 'claim', slot });
  };

  const unclaimSlot = (slot: OTSlot) => {
    setSlotModal({ type: 'unclaim', slot });
  };

  const canUnclaimSlot = (slot: OTSlot) => {
    if (slot.claimed_by !== userId || !slot.claimed_at) {
      return false;
    }

    return Math.max(0, 20 * 60 * 1000 - (clockTick - new Date(slot.claimed_at).getTime())) > 0;
  };

  const getUnclaimWindowLabel = (slot: OTSlot) => {
    const remainingMs = slot.claimed_at
      ? Math.max(0, 20 * 60 * 1000 - (clockTick - new Date(slot.claimed_at).getTime()))
      : getUnclaimWindowRemainingMs(slot.claimed_at);

    if (remainingMs <= 0) {
      return 'This slot can only be released by a moderator or IT now.';
    }

    const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
    return `${minutes} minute${minutes === 1 ? '' : 's'} left to unclaim.`;
  };

  const isCurrentMonth = (day: Date) => day.getMonth() === month;

  return (
    <div>
      <div className="otcal-header animate-fade-in">
        <div>
          <h1 className="otcal-title">OT Calendar</h1>
          <p className="otcal-subtitle">Select a day to view and claim available overtime slots</p>
        </div>
      </div>

      <div className="otcal-layout animate-fade-in delay-100">
        <div className="card otcal-calendar-panel">
          <div className="cal-nav">
            <button className="cal-nav-btn" onClick={() => navigateMonth(-1)} id="cal-prev-month-btn">
              <ChevronLeft size={18} />
            </button>
            <h2 className="cal-month-label">
              {MONTHS[month]} {year}
            </h2>
            <button className="cal-nav-btn" onClick={() => navigateMonth(1)} id="cal-next-month-btn">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="calendar-grid cal-weekdays">
            {WEEKDAYS.map((weekday) => (
              <div key={weekday} className="cal-weekday">
                {weekday}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {days.map((day, index) => {
              const inMonth = isCurrentMonth(day);
              const dayHasSlots = hasSlots(day);
              const dayHasAvailable = hasAvailable(day);
              const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
              const todayMark = isToday(day);
              const inRange = isInRange(day);
              const isRangeStart = Boolean(activeRange && isSameDay(day, activeRange.start));
              const isRangeEnd = Boolean(activeRange && isSameDay(day, activeRange.end));
              const col = index % 7;
              const extendLeft = inRange && !isRangeStart && col !== 0;
              const extendRight = inRange && !isRangeEnd && col !== 6;

              return (
                <button
                  key={index}
                  className={`calendar-day ${!inMonth ? 'other-month' : ''} ${todayMark ? 'today' : ''} ${isSelected ? 'selected' : ''} ${dayHasSlots && !isSelected ? 'has-slots' : ''} ${inRange ? 'range' : ''} ${isRangeStart ? 'range-start' : ''} ${isRangeEnd ? 'range-end' : ''} ${extendLeft ? 'range-extend-left' : ''} ${extendRight ? 'range-extend-right' : ''}`}
                  data-cal-date={toDateString(day)}
                  style={
                    dayHasSlots && !isSelected
                      ? ({ '--dot-color': dayHasAvailable ? 'var(--status-available)' : 'var(--status-claimed)' } as CSSProperties)
                      : undefined
                  }
                  onPointerDown={(event) => {
                    if (!inMonth) return;
                    // Do not capture the pointer here; we rely on hit-testing (`elementFromPoint`)
                    // while dragging to discover which day is under the cursor.
                    // Pointer capture can cause some browsers to always report the original target.
                    event.preventDefault();
                    isDraggingRangeRef.current = true;
                    dragStartRef.current = day;
                    dragEndRef.current = day;
                    setRangeDraft({ start: day, end: day });
                  }}
                  onClick={() => {
                    if (!inMonth) return;
                    if (suppressClickRef.current) return;
                    setSelectedRange(null);
                    setRangeDraft(null);
                    setSelectedDate(day);
                  }}
                  id={`cal-day-${toDateString(day)}`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

        </div>

        <div className="otcal-slots-panel">
          {selectedDate || selectedRange ? (
            <>
              <div className="slots-panel-header">
                <h2 className="slots-panel-title">
                  Available OT Slots -{' '}
                  <span className="gradient-text">
                    {headerLabel}
                  </span>
                </h2>
                <div className="slots-summary">
                  <span className="slots-count slots-count-open">
                    <span className="slots-count-dot" aria-hidden="true" />
                    <span className="slots-count-number">
                      {selectedDaySlots.filter((slot) => slot.status === 'available').length}
                    </span>
                    <span className="slots-count-label">Open</span>
                  </span>
                  <span className="slots-count slots-count-claimed">
                    <span className="slots-count-dot" aria-hidden="true" />
                    <span className="slots-count-number">
                      {selectedDaySlots.filter((slot) => slot.status === 'claimed').length}
                    </span>
                    <span className="slots-count-label">Claimed</span>
                  </span>
                </div>
              </div>

              {selectedDaySlots.length === 0 ? (
                <div className="card empty-state">
                  <Clock size={40} style={{ color: 'var(--text-muted)' }} />
                  <p>No OT slots published for this selection</p>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Check back later or select another date
                  </span>
                </div>
              ) : (
                <div className="slots-grid">
                  {selectedDaySlots.map((slot, index) => {
                    const isAvailable = slot.status === 'available';
                    const isMine = slot.claimed_by === userId;
                    const isClaiming = claimingId === slot.id;

                    return (
                      <div
                        key={slot.id}
                        className={`slot-card ${isAvailable ? 'available' : 'claimed'} animate-fade-in delay-${index * 100}`}
                        id={`slot-card-${slot.id}`}
                      >
                        <div className="slot-badge-row">
                          <span className={`badge ${isAvailable ? 'badge-available' : 'badge-claimed'}`}>
                            {isAvailable ? 'Available' : 'Claimed'}
                          </span>
                          {isMine && <span className="badge badge-purple">My Slot</span>}
                          {isMine && claimMetas[slot.id] && (
                            <span className={`badge slot-ot-type-badge slot-ot-type-${claimMetas[slot.id]}`}>
                              {getOTClaimKindLabel(claimMetas[slot.id])}
                            </span>
                          )}
                        </div>

                        <div className="slot-time">
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </div>

                        <div className="slot-meta">
                          <Clock size={13} />
                          {slot.duration_hrs}h - {slot.shift_label ?? 'OT Shift'}
                        </div>

                        {!isAvailable && slot.claimedByUser && (
                          <div className="slot-claimed-by">
                            <div className="claimed-avatar">
                              {slot.claimedByUser.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={proxifyMediaUrl(slot.claimedByUser.avatar_url)} alt={slot.claimedByUser.name} />
                              ) : (
                                <span>{slot.claimedByUser.name[0]}</span>
                              )}
                            </div>
                            <div>
                              <div className="claimed-name">{slot.claimedByUser.name}</div>
                              {slot.claimed_at && (
                                <div className="claimed-time">{formatRelativeTime(slot.claimed_at)}</div>
                              )}
                            </div>
                          </div>
                        )}

                        {isAvailable && (
                          <button
                            className="btn btn-success"
                            style={{ width: '100%', marginTop: '0.75rem' }}
                            onClick={() => claimSlot(slot)}
                            disabled={isClaiming}
                            id={`claim-btn-${slot.id}`}
                          >
                            {isClaiming ? (
                              <>
                                <span className="spinner-sm" /> Claiming...
                              </>
                            ) : (
                              'Claim Slot'
                            )}
                          </button>
                        )}

                        {isMine && !isAvailable && (
                          <>
                            {canUnclaimSlot(slot) ? (
                              <>
                                <button
                                  className="btn btn-ghost"
                                  style={{ width: '100%', marginTop: '0.75rem', color: '#f87171' }}
                                  onClick={() => unclaimSlot(slot)}
                                  disabled={isClaiming}
                                >
                                  {isClaiming ? 'Releasing...' : 'Unclaim Slot'}
                                </button>
                                <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                  {getUnclaimWindowLabel(slot)}
                                </div>
                              </>
                            ) : (
                              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {getUnclaimWindowLabel(slot)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="card empty-state">
              <CalendarDays size={48} style={{ color: 'var(--text-muted)' }} />
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Select a day to see OT slots</p>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Highlighted days have overtime slots available
              </span>
            </div>
          )}
        </div>
      </div>

      {slotModal && (
        <div className="modal-overlay" onClick={() => setSlotModal(null)}>
          <div className="modal ot-slot-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ot-slot-modal-header">
              <div>
                <div className="ot-slot-kicker" style={{ marginBottom: '0.45rem' }}>
                  {slotModal.type === 'claim' ? 'Reserve OT slot' : 'Release OT slot'}
                </div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                  {slotModal.type === 'claim'
                    ? 'Are you sure you want to reserve this OT slot?'
                    : 'Are you sure you want to release this OT slot?'}
                </h3>
              </div>
            </div>

            <div className="ot-slot-modal-summary">
              <div className="ot-slot-modal-row">
                <span>Date</span>
                <strong>{formatOTDate(slotModal.slot.date)}</strong>
              </div>
              <div className="ot-slot-modal-row">
                <span>Time</span>
                <strong>
                  {formatTime(slotModal.slot.start_time)} - {formatTime(slotModal.slot.end_time)}
                </strong>
              </div>
              <div className="ot-slot-modal-row">
                <span>Shift</span>
                <strong>{slotModal.slot.shift_label ?? 'OT Shift'}</strong>
              </div>
            </div>

            {slotModal.type === 'claim' && (
              <>
                <div className="ot-slot-modal-note">
                  <AlertCircle size={16} />
                  <span>
                    You can only reserve one OT slot per day, and overlapping OT schedules are blocked automatically.
                  </span>
                </div>
                <div className="ot-slot-claim-type-panel">
                  <div className="ot-slot-claim-type-title">What kind of OT is this?</div>
                  <div className="ot-slot-claim-type-grid">
                    {(
                      [
                        { kind: 'scheduled_extension' as OTClaimKind, desc: 'Extends a workday you were already scheduled to work.' },
                        { kind: 'day_off' as OTClaimKind, desc: 'OT worked on a day you were not scheduled.' },
                        { kind: 'recovery' as OTClaimKind, desc: 'Make-up hours for missed time. Does not count toward attendance bonus.' },
                      ]
                    ).map(({ kind, desc }) => (
                      <button
                        key={kind}
                        type="button"
                        className={`ot-slot-type-card ${claimKind === kind ? 'active' : ''} ${kind === 'recovery' ? 'recovery-card' : ''}`}
                        onClick={() => setClaimKind(kind)}
                      >
                        <strong>{getOTClaimKindLabel(kind)}</strong>
                        <span>{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {slotModal.type === 'unclaim' && (
              <div className="ot-slot-modal-warning">
                <AlertCircle size={16} />
                <span>{getUnclaimWindowLabel(slotModal.slot)}</span>
              </div>
            )}

            <div className="ot-slot-modal-actions">
              <button className="btn btn-ghost" onClick={() => setSlotModal(null)}>
                Cancel
              </button>
              <button
                className={`btn ${slotModal.type === 'claim' ? 'btn-primary' : 'btn-ghost ot-danger-btn'}`}
                onClick={() =>
                  slotModal.type === 'claim'
                    ? void performClaimSlot(slotModal.slot)
                    : void performUnclaimSlot(slotModal.slot)
                }
                disabled={claimingId === slotModal.slot.id}
              >
                {claimingId === slotModal.slot.id
                  ? slotModal.type === 'claim'
                    ? 'Reserving...'
                    : 'Releasing...'
                  : slotModal.type === 'claim'
                    ? 'Reserve slot'
                    : 'Release slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal && (
        <div className="modal-overlay" onClick={() => setNoticeModal(null)}>
          <div className="modal ot-slot-modal" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <AlertCircle size={18} style={{ color: '#f87171' }} />
              <h3 style={{ margin: 0 }}>{noticeModal.title}</h3>
            </div>
            <p className="text-muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
              {noticeModal.body}
            </p>
            <div className="ot-slot-modal-actions">
              <button className="btn btn-primary" onClick={() => setNoticeModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .otcal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1.5rem;
          gap: 1rem;
        }

        .otcal-title {
          font-size: 1.875rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          margin: 0 0 0.25rem;
        }

        .otcal-subtitle {
          color: var(--text-secondary);
          font-size: 0.9375rem;
          margin: 0;
        }

        .otcal-legend {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .otcal-layout {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 1.25rem;
          align-items: start;
        }

        .otcal-calendar-panel {
          position: sticky;
          top: calc(var(--topnav-height) + 1rem);
        }

        .cal-nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .cal-nav-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }

        .cal-nav-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-default);
        }

        .cal-month-label {
          font-size: 1rem;
          font-weight: 700;
          margin: 0;
        }

        .cal-weekdays {
          margin-bottom: 4px;
        }

        .cal-weekday {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.625rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }

        .otcal-slots-panel {
          min-height: 400px;
        }

        .slots-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .slots-panel-title {
          font-size: 1.125rem;
          font-weight: 700;
          margin: 0;
        }

        .slots-summary {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .slots-count {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.8rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(18px);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22);
          line-height: 1;
          white-space: nowrap;
        }

        .slots-count-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .slots-count-number {
          font-weight: 800;
          letter-spacing: -0.01em;
          font-variant-numeric: tabular-nums;
        }

        .slots-count-label {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          opacity: 0.88;
        }

        .slots-count-open {
          border-color: rgba(16, 185, 129, 0.26);
          background: rgba(16, 185, 129, 0.08);
          color: var(--status-available);
        }

        .slots-count-open .slots-count-dot {
          background: var(--status-available);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16);
        }

        .slots-count-claimed {
          border-color: rgba(239, 68, 68, 0.26);
          background: rgba(239, 68, 68, 0.08);
          color: var(--status-claimed);
        }

        .slots-count-claimed .slots-count-dot {
          background: var(--status-claimed);
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.14);
        }

        .slots-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1rem;
        }

        .calendar-grid {
          overflow: visible;
        }

        .calendar-day.range {
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.18);
          color: white;
        }

        .calendar-day.range::before {
          content: '';
          position: absolute;
          top: 50%;
          height: 8px;
          transform: translateY(-50%);
          background: linear-gradient(
            90deg,
            rgba(16, 185, 129, 0.0),
            rgba(16, 185, 129, 0.55),
            rgba(16, 185, 129, 0.0)
          );
          border-radius: 999px;
          opacity: 0.95;
          z-index: -1;
          pointer-events: none;
          left: 50%;
          right: 50%;
        }

        .calendar-day.range-extend-left::before {
          left: -70%;
        }

        .calendar-day.range-extend-right::before {
          right: -70%;
        }

        .calendar-day.range-start,
        .calendar-day.range-end {
          background: rgba(16, 185, 129, 0.18);
          border-color: rgba(16, 185, 129, 0.32);
          box-shadow: 0 20px 42px rgba(16, 185, 129, 0.18);
        }

        .slot-badge-row {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          margin-bottom: 0.75rem;
        }

        .slot-time {
          font-size: 1.375rem;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: var(--text-primary);
          margin-bottom: 0.375rem;
        }

        .slot-meta {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8125rem;
          color: var(--text-muted);
        }

        .slot-claimed-by {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid var(--border-subtle);
        }

        .claimed-avatar {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--bg-elevated);
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.6875rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .claimed-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .claimed-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .claimed-time {
          font-size: 0.6875rem;
          color: var(--text-muted);
        }

        .spinner-sm {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .ot-slot-modal {
          max-width: 520px;
          display: grid;
          gap: 1rem;
        }

        .ot-slot-modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .ot-slot-modal-summary {
          display: grid;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 16px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
        }

        .ot-slot-modal-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .ot-slot-modal-row strong {
          color: var(--text-primary);
          text-align: right;
        }

        .ot-slot-kicker {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .ot-slot-modal-warning {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
          font-size: 0.85rem;
        }

        .ot-slot-modal-note {
          display: flex;
          align-items: flex-start;
          gap: 0.65rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.22);
          color: var(--text-secondary);
          font-size: 0.85rem;
        }

        .ot-slot-claim-type-panel {
          display: grid;
          gap: 0.75rem;
        }

        .ot-slot-claim-type-title {
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .ot-slot-claim-type-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .ot-slot-type-card {
          display: grid;
          gap: 0.35rem;
          text-align: left;
          padding: 0.95rem 1rem;
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-primary);
          cursor: pointer;
          transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease;
        }

        .ot-slot-type-card strong {
          font-size: 0.9rem;
        }

        .ot-slot-type-card span {
          font-size: 0.78rem;
          line-height: 1.55;
          color: var(--text-secondary);
        }

        .ot-slot-type-card:hover {
          transform: translateY(-1px);
          border-color: rgba(99, 102, 241, 0.35);
        }

        .ot-slot-type-card.active {
          border-color: rgba(99, 102, 241, 0.55);
          background: linear-gradient(160deg, rgba(99, 102, 241, 0.18), rgba(35, 182, 230, 0.08));
          box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.18) inset;
        }

        .ot-slot-type-card.recovery-card {
          border-color: rgba(245, 158, 11, 0.2);
        }

        .ot-slot-type-card.recovery-card:hover {
          border-color: rgba(245, 158, 11, 0.4);
        }

        .ot-slot-type-card.recovery-card.active {
          border-color: rgba(245, 158, 11, 0.55);
          background: linear-gradient(160deg, rgba(245, 158, 11, 0.15), rgba(234, 179, 8, 0.06));
          box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.18) inset;
        }

        .ot-slot-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .slot-ot-type-badge {
          font-size: 0.65rem;
          font-weight: 700;
          padding: 0.2rem 0.55rem;
          border-radius: 6px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .slot-ot-type-badge.slot-ot-type-scheduled_extension {
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.3);
          color: #a5b4fc;
        }
        .slot-ot-type-badge.slot-ot-type-day_off {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.28);
          color: #6ee7b7;
        }
        .slot-ot-type-badge.slot-ot-type-recovery {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.3);
          color: #fcd34d;
        }

        .ot-danger-btn {
          color: #fca5a5;
          border-color: rgba(239, 68, 68, 0.25);
        }

        .ot-danger-btn:hover {
          background: rgba(239, 68, 68, 0.08);
          color: #fecaca;
        }

        @media (max-width: 960px) {
          .otcal-layout { grid-template-columns: 1fr; }
          .otcal-calendar-panel { position: static; }
          .ot-slot-claim-type-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
