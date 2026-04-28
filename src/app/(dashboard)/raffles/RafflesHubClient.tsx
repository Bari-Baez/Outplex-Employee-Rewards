'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, Gift, RefreshCcw, Trophy } from 'lucide-react';
import { CanvasRoulette } from '@/components/raffles/CanvasRoulette';
import {
  syncRaffleFeed,
  filterRaffles,
  RAFFLE_FEED_FILTERS,
  type RaffleFeedFilter,
} from '@/lib/raffles/feed';
import {
  getCountdownMsRemaining,
  getLatestWinner,
  getPrizeAssignment,
  getPrizeSlot,
  type RaffleViewModel,
} from '@/lib/raffles/runtime';

function fmtDate(value: string | null) {
  return value
    ? new Date(value).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not scheduled';
}

function fmtCountdown(ms: number | null) {
  if (ms === null) return null;
  const total = Math.max(Math.ceil(ms / 1000), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
}

function getStageMessage(featured: RaffleViewModel | null, countdownLabel: string | null) {
  if (!featured?.runtime) {
    return 'Select a raffle card to inspect it here.';
  }

  switch (featured.runtime.phase) {
    case 'countdown':
      return countdownLabel
        ? `Countdown active. Everyone should see ${countdownLabel} remaining before the first spin.`
        : 'Countdown active before the first spin.';
    case 'scheduled':
      return `Scheduled for ${fmtDate(featured.runtime.scheduledFor)}.`;
    case 'ready':
      return 'The first spin is queued and should start now.';
    case 'spinning':
      return 'The wheel is spinning live right now.';
    case 'winner_reveal': {
      const latestWinner = getLatestWinner(featured.runtime);
      return latestWinner ? `${latestWinner.name} is being revealed on screen.` : 'Winner reveal in progress.';
    }
    case 'intermission':
      return 'Preparing the next spin for the next winner.';
    case 'completed':
      return `${featured.runtime.winners.length} winner(s) finalized.`;
    default:
      return 'Live raffle state updated.';
  }
}

function getStatusCountLabel(filter: RaffleFeedFilter, total: number) {
  if (filter === 'everything') {
    return `${total} raffle${total === 1 ? '' : 's'} in the current feed.`;
  }

  return `${total} ${filter} raffle${total === 1 ? '' : 's'} in view.`;
}

export function RafflesHubClient() {
  const searchParams = useSearchParams();
  const [raffles, setRaffles] = useState<RaffleViewModel[]>([]);
  const [selectedRaffleId, setSelectedRaffleId] = useState<string | null>(
    searchParams.get('raffle'),
  );
  const [filter, setFilter] = useState<RaffleFeedFilter>('everything');
  const [isLoading, setIsLoading] = useState(true);
  const [nowTick, setNowTick] = useState(Date.now());
  const [error, setError] = useState('');
  const syncRef = useRef(false);

  const syncRaffles = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    try {
      const next = await syncRaffleFeed();
      setRaffles(next);
      setSelectedRaffleId((current) =>
        current && next.some((item) => item.raffle.id === current) ? current : (next[0]?.raffle.id ?? null),
      );
    } finally {
      syncRef.current = false;
    }
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await syncRaffles();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load raffles.');
      } finally {
        setIsLoading(false);
      }
    };
    void bootstrap();
  }, [syncRaffles]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const delay = raffles.some((item) => item.raffle.status !== 'completed') ? 1000 : 5000;
    const timer = window.setInterval(() => void syncRaffles(), delay);
    return () => window.clearInterval(timer);
  }, [raffles, syncRaffles]);

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncRaffles();
      }
    };

    const syncOnFocus = () => {
      void syncRaffles();
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncOnFocus);

    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncOnFocus);
    };
  }, [syncRaffles]);

  const filteredRaffles = useMemo(() => filterRaffles(raffles, filter), [filter, raffles]);

  useEffect(() => {
    if (filteredRaffles.length === 0) return;
    if (!selectedRaffleId || !filteredRaffles.some((item) => item.raffle.id === selectedRaffleId)) {
      setSelectedRaffleId(filteredRaffles[0]?.raffle.id ?? null);
    }
  }, [filteredRaffles, selectedRaffleId]);

  const featured = useMemo(() => {
    if (selectedRaffleId) {
      const selected = filteredRaffles.find((item) => item.raffle.id === selectedRaffleId);
      if (selected) return selected;
    }
    return filteredRaffles[0] ?? null;
  }, [filteredRaffles, selectedRaffleId]);

  const latestWinner = getLatestWinner(featured?.runtime ?? null);
  const featuredCountdown = featured?.runtime
    ? fmtCountdown(getCountdownMsRemaining(featured.runtime, nowTick))
    : null;

  const handleSpinComplete = async (spinToken: string) => {
    if (!featured) return;
    await fetch(`/api/raffles/${featured.raffle.id}/spin-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spinToken }),
    });
    await syncRaffles();
  };

  const handleSpinRecorded = async ({
    spinToken,
    blob,
  }: {
    spinToken: string;
    blob: Blob;
  }) => {
    if (!featured || blob.size === 0) return;

    const formData = new FormData();
    formData.append(
      'file',
      new File([blob], `raffle-${featured.raffle.id}-${spinToken}.webm`, {
        type: blob.type || 'video/webm',
      }),
    );
    formData.append('spinToken', spinToken);

    await fetch(`/api/raffles/${featured.raffle.id}/video`, {
      method: 'POST',
      body: formData,
    });
  };

  const bannerTone =
    featured?.raffle.status === 'live'
      ? 'live'
      : featured?.raffle.status === 'upcoming'
        ? 'upcoming'
        : 'completed';

  return (
    <div className="animate-fade-in raffle-layout">
      <div>
        <div style={{ marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            Company <span className="gradient-text">Raffles</span>
          </h1>
          <p className="text-muted" style={{ margin: 0 }}>
            Watch live draws, follow countdowns, and revisit the latest winners from the last 60 days.
          </p>
        </div>

        {featured && (
          <div className={`raffle-banner raffle-banner-${bannerTone}`}>
            <div className={`raffle-banner-badge raffle-banner-badge-${bannerTone}`}>
              <span className="raffle-banner-dot" aria-hidden="true" />
              <span className="raffle-banner-badge-text">
                {featured.raffle.status === 'live'
                  ? 'LIVE'
                  : featured.raffle.status === 'upcoming'
                    ? 'UPCOMING'
                    : 'RESULT'}
              </span>
            </div>

            <div className="raffle-banner-main">
              <div className="raffle-banner-title">{featured.raffle.title}</div>
              <div className="raffle-banner-subtitle">
                {featured.raffle.status === 'live' && featuredCountdown && (
                  <span className="raffle-banner-kicker">
                    Countdown: <span className="raffle-banner-countdown">{featuredCountdown}</span>
                  </span>
                )}
                {featured.raffle.status === 'live' && !featuredCountdown && 'The wheel is running live right now.'}
                {featured.raffle.status === 'upcoming' && `Scheduled for ${fmtDate(featured.raffle.draw_date)}`}
                {featured.raffle.status === 'completed' &&
                  (latestWinner ? (
                    <span className="raffle-banner-kicker">
                      Latest winner: <span className="raffle-banner-winner">{latestWinner.name}</span>
                    </span>
                  ) : (
                    'Latest winners available below.'
                  ))}
              </div>
            </div>

            <div className="raffle-banner-icon" aria-hidden="true">
              {featured.raffle.status === 'live' ? (
                <Gift size={20} />
              ) : featured.raffle.status === 'upcoming' ? (
                <CalendarClock size={20} />
              ) : (
                <Trophy size={20} />
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="feed-header-row" style={{ marginBottom: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700 }}>Raffle feed</div>
              <div className="text-muted" style={{ fontSize: '0.8125rem' }}>Live, upcoming, and completed raffles.</div>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void syncRaffles()}>
              <RefreshCcw size={15} />
              Refresh
            </button>
          </div>

          <div className="filter-row">
            {RAFFLE_FEED_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`filter-chip ${filter === option.value ? 'filter-chip-active' : ''}`}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="text-muted" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>{getStatusCountLabel(filter, filteredRaffles.length)}</div>

          {isLoading ? (
            <div className="text-muted">Loading raffles...</div>
          ) : error ? (
            <div className="text-muted">{error}</div>
          ) : filteredRaffles.length === 0 ? (
            <div className="text-muted">No raffles available right now. Check back soon.</div>
          ) : (
            <div className="feed-scroll-area">
              <div className="raffle-list-grid">
                {filteredRaffles.map((item) => {
                  const latestItemWinner = getLatestWinner(item.runtime);
                  const itemCountdown = fmtCountdown(getCountdownMsRemaining(item.runtime, nowTick));

                  return (
                <button key={item.raffle.id} type="button" className="raffle-card" onClick={() => setSelectedRaffleId(item.raffle.id)} style={{ borderColor: featured?.raffle.id === item.raffle.id ? 'rgba(99,102,241,0.45)' : 'var(--border-subtle)' }}>
                  <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem', fontSize: '1.35rem' }}>
                    <Gift size={22} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>{item.raffle.title}</div>
                    <span className={`status-pill status-${item.raffle.status}`}>{item.raffle.status}</span>
                  </div>
                  {item.raffle.description && <div className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.65rem' }}>{item.raffle.description}</div>}
                  <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.85rem' }}>{fmtDate(item.raffle.draw_date)}</div>
                  <div className="raffle-meta-row">
                    <span>{latestItemWinner?.name ? `Winner: ${latestItemWinner.name}` : `${item.runtime?.participants.length ?? 0} participants`}</span>
                    {itemCountdown && item.runtime?.phase !== 'completed' ? <strong>{itemCountdown}</strong> : null}
                  </div>
                </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="raffle-side-column">
        <div className="card raffle-stage-card">
          <div style={{ marginBottom: '1rem' }}>
            <div className="stage-title-row">
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{featured?.raffle.title ?? 'Raffle viewer'}</div>
                <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                  {getStageMessage(featured, featuredCountdown)}
                </div>
              </div>
              {featured?.raffle.status ? <span className={`status-pill status-${featured.raffle.status}`}>{featured.raffle.status}</span> : null}
            </div>
          </div>

          {featuredCountdown && featured?.runtime?.phase !== 'completed' && (
            <div className="countdown-banner">
              <span className="field-label" style={{ marginBottom: 0 }}>Countdown</span>
              <strong>{featuredCountdown}</strong>
            </div>
          )}

          <CanvasRoulette
            key={featured?.raffle.id ?? 'employee-viewer'}
            participants={featured?.runtime ? featured.visibleParticipants : []}
            winnerId={featured?.runtime?.activeWinnerId ?? null}
            spinToken={featured?.runtime?.currentSpinToken ?? null}
            isClosed={featured?.runtime?.phase === 'completed'}
            onSpinRecorded={handleSpinRecorded}
            onSpinComplete={handleSpinComplete}
          />

          {featured?.runtime ? (
            <>
              <div className="stage-stats-grid">
                <div className="stage-stat-card">
                  <CalendarClock size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Scheduled for</div>
                    <strong>{fmtDate(featured.runtime.scheduledFor)}</strong>
                  </div>
                </div>
                <div className="stage-stat-card">
                  <Trophy size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Winners</div>
                    <strong>{featured.runtime.winners.length} / {featured.runtime.spinCount}</strong>
                  </div>
                </div>
                <div className="stage-stat-card">
                  <Gift size={18} style={{ color: 'var(--brand-primary-light)' }} />
                  <div>
                    <div className="stage-stat-label">Visible names</div>
                    <strong>{featured.visibleParticipants.length}</strong>
                  </div>
                </div>
              </div>

              {featured.runtime.winners.length > 0 && (
                <div className="winner-panel">
                  <div style={{ fontWeight: 700, marginBottom: '0.85rem' }}>Winners and prizes</div>
                  <div style={{ display: 'grid', gap: '0.85rem' }}>
                    {featured.runtime.winners.map((winner) => {
                      const assignment = getPrizeAssignment(featured.runtime, winner.participantId);
                      const assignedSlot = assignment?.prizeSlotId
                        ? getPrizeSlot(featured.runtime, assignment.prizeSlotId)
                        : null;
                      const imageUrl = assignment?.imageUrl ?? assignedSlot?.imageUrl ?? null;
                      const bundleItems = assignedSlot?.type === 'bundle' ? (assignedSlot.bundleItems ?? []) : [];

                      return (
                        <div key={winner.participantId} className="winner-row-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{winner.name}</div>
                              <div className="text-muted" style={{ fontSize: '0.8125rem' }}>
                                Winner #{winner.spinIndex} · {fmtDate(winner.selectedAt)}
                              </div>
                            </div>
                            {assignment?.prizeTitle ? <span className="assignment-pill">Prize assigned</span> : null}
                          </div>

                          {assignment?.prizeTitle ? (
                            <div className="emp-prize-banner">
                              <div className="emp-prize-thumb">
                                {imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={imageUrl} alt={assignment.prizeTitle} />
                                ) : (
                                  <Gift size={22} />
                                )}
                              </div>
                              <div className="emp-prize-copy">
                                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{assignment.prizeTitle}</div>
                                <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                                  {(assignment.quantity ?? 1) > 1 ? `×${assignment.quantity} units` : '×1'}
                                  {assignment.unitPoints ? ` · ${assignment.unitPoints.toLocaleString()} pts value` : ''}
                                </div>
                                {bundleItems.length > 0 && (
                                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                                    {bundleItems.map((bi) => (
                                      <span key={bi.id} className="emp-bundle-tag">{bi.name} ×{bi.quantity}</span>
                                    ))}
                                  </div>
                                )}
                                {assignment.notes && (
                                  <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.4rem', fontStyle: 'italic' }}>
                                    {assignment.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-muted" style={{ marginTop: '0.65rem', fontSize: '0.875rem' }}>
                              Prize pending moderator assignment.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted">No raffle selected yet.</div>
          )}
        </div>
      </div>

      <style>{`
        .raffle-layout { display: grid; grid-template-columns: minmax(0, 1.08fr) minmax(420px, 0.92fr); gap: 1.75rem; align-items: start; }
        .raffle-side-column { position: sticky; top: 1.5rem; }
        .raffle-stage-card { display: grid; gap: 1rem; min-height: min(88vh, 1120px); }
        .feed-header-row, .stage-title-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; flex-wrap: wrap; }
        .raffle-banner { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 1rem; align-items: center; border-radius: 18px; padding: 1.25rem 1.4rem; margin-bottom: 1.5rem; border: 1px solid transparent; backdrop-filter: blur(18px); box-shadow: 0 30px 90px rgba(0,0,0,0.28); }
        .raffle-banner-live { background: linear-gradient(135deg, rgba(16,185,129,0.14), rgba(99,102,241,0.16)); border-color: rgba(16,185,129,0.24); }
        .raffle-banner-upcoming { background: linear-gradient(135deg, rgba(234,179,8,0.14), rgba(99,102,241,0.14)); border-color: rgba(234,179,8,0.24); }
        .raffle-banner-completed { background: linear-gradient(135deg, rgba(99,102,241,0.16), rgba(15,23,42,0.18)); border-color: rgba(99,102,241,0.22); }

        .raffle-banner-badge { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.75rem; border-radius: 999px; font-size: 0.72rem; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); }
        .raffle-banner-dot { width: 7px; height: 7px; border-radius: 999px; box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        .raffle-banner-badge-live { border-color: rgba(16,185,129,0.28); background: rgba(16,185,129,0.12); color: rgba(52,211,153,0.95); }
        .raffle-banner-badge-upcoming { border-color: rgba(234,179,8,0.28); background: rgba(234,179,8,0.12); color: rgba(252,211,77,0.95); }
        .raffle-banner-badge-completed { border-color: rgba(99,102,241,0.28); background: rgba(99,102,241,0.12); color: rgba(165,180,252,0.98); }
        .raffle-banner-badge-live .raffle-banner-dot { background: rgba(52,211,153,1); box-shadow: 0 0 0 3px rgba(16,185,129,0.18); animation: raffleDotPulse 1.6s ease-in-out infinite; }
        .raffle-banner-badge-upcoming .raffle-banner-dot { background: rgba(252,211,77,1); box-shadow: 0 0 0 3px rgba(234,179,8,0.18); }
        .raffle-banner-badge-completed .raffle-banner-dot { background: rgba(165,180,252,1); box-shadow: 0 0 0 3px rgba(99,102,241,0.18); }

        @keyframes raffleDotPulse { 0%,100%{transform:scale(1);opacity:0.95} 55%{transform:scale(1.25);opacity:0.65} }

        .raffle-banner-main { min-width: 0; }
        .raffle-banner-title { font-weight: 900; font-size: 1.2rem; letter-spacing: -0.02em; margin-bottom: 0.25rem; color: var(--text-primary); }
        .raffle-banner-subtitle { font-size: 0.9rem; color: rgba(226,232,240,0.82); line-height: 1.5; }
        .raffle-banner-kicker { display: inline-flex; gap: 0.35rem; align-items: baseline; flex-wrap: wrap; }
        .raffle-banner-countdown { font-variant-numeric: tabular-nums; font-weight: 900; color: rgba(255,255,255,0.92); }
        .raffle-banner-winner { font-weight: 900; color: rgba(255,255,255,0.92); }
        .raffle-banner-icon { width: 42px; height: 42px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: rgba(241,245,249,0.88); }
        .filter-row { display: flex; gap: 0.65rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
        .filter-chip { border: 1px solid var(--border-subtle); background: var(--bg-elevated); color: var(--text-secondary); border-radius: 999px; padding: 0.55rem 0.9rem; font-size: 0.8125rem; font-weight: 700; cursor: pointer; }
        .filter-chip-active { border-color: rgba(99,102,241,0.38); background: rgba(99,102,241,0.16); color: var(--text-primary); }
        .feed-scroll-area { max-height: min(74vh, 860px); overflow-y: auto; padding-right: 0.2rem; }
        .raffle-list-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
        .raffle-card { width: 100%; border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-card); padding: 1.25rem; text-align: left; color: inherit; cursor: pointer; }
        .raffle-card:hover { border-color: var(--border-default); }
        .raffle-meta-row { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.85rem; font-size: 0.8125rem; color: var(--text-muted); align-items: center; flex-wrap: wrap; }
        .countdown-banner { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.85rem 1rem; border-radius: 12px; border: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.12); color: var(--text-secondary); font-size: 0.875rem; }
        .field-label { display: block; margin-bottom: 0.5rem; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); }
        .status-pill { display: inline-flex; padding: 0.3rem 0.6rem; border-radius: 999px; font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; }
        .status-live { background: rgba(16,185,129,0.12); color: #34d399; }
        .status-upcoming { background: rgba(234,179,8,0.14); color: #fbbf24; }
        .status-completed { background: rgba(99,102,241,0.12); color: var(--brand-primary-light); }
        .stage-stats-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; }
        .stage-stat-card, .winner-row-card { padding: 0.95rem 1rem; border-radius: 16px; border: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .stage-stat-card { display: flex; align-items: center; gap: 0.75rem; }
        .stage-stat-label { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.15rem; }
        .winner-panel { display: grid; gap: 0.85rem; max-height: 360px; overflow-y: auto; padding-right: 0.2rem; }
        .assignment-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 0.3rem 0.65rem; background: rgba(16,185,129,0.12); color: #34d399; font-size: 0.75rem; font-weight: 700; }
        .emp-prize-banner { display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 0.85rem; align-items: center; margin-top: 0.85rem; padding: 0.85rem; border-radius: 16px; border: 1px solid rgba(16,185,129,0.2); background: linear-gradient(135deg, rgba(16,185,129,0.08), rgba(99,102,241,0.06)); }
        .emp-prize-thumb { width: 72px; height: 72px; border-radius: 16px; overflow: hidden; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); flex-shrink: 0; }
        .emp-prize-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .emp-prize-copy { min-width: 0; }
        .emp-bundle-tag { display: inline-flex; align-items: center; padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary); }
        @media (max-width: 1200px) { .raffle-layout { grid-template-columns: 1fr; } .raffle-side-column { position: static; } .raffle-stage-card, .feed-scroll-area { min-height: 0; max-height: none; } }
        @media (max-width: 720px) { .stage-stats-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
