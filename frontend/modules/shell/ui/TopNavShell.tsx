'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronDown,
  Gift,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Search,
  Send,
  ShoppingCart,
  X,
} from 'lucide-react';
import { ModernSelect } from '@frontend/shared/ui/Select';
import { createClient } from '@frontend/platform/supabase/client';
import type {
  SupportDepartment,
  SupportTicket,
  User,
} from '@shared/contracts/database';
import { getInitials } from '@shared/utils/format';
import { proxifyMediaUrl } from '@frontend/shared/lib/media-proxy';
import { useAppStore } from '@frontend/modules/shell/state/app-store';
import type { UserRole } from '@shared/contracts/database';
import { useAppAvailability } from '@frontend/modules/shell/ui/AppAvailabilityProvider';
import { resolveToolKeyFromPathname } from '@backend/modules/shell/domain/tools-catalog';
import { useShellData } from '@frontend/modules/shell/hooks/useShellData';
import { getNavigationItems } from '@frontend/modules/shell/config/navigation';

interface TopNavShellProps {
  user: User | null;
}

interface LiveEventItem {
  id: string;
  type: 'raffle' | 'ot' | 'upcoming';
  title: string;
  summary: string;
  href: string;
}

const TICKET_HELP_TEXT: Record<SupportDepartment, string> = {
  it: 'Use IT Support only for technical issues, access problems, or system errors.',
  moderator:
    'Use Moderator Support only for orders, store pickups, raffle concerns, or moderation help.',
};

function getShellBadgeState({
  hasAvailableOt,
  hasLiveRaffle,
  nextUpcomingRaffle,
}: {
  hasAvailableOt: boolean;
  hasLiveRaffle: boolean;
  nextUpcomingRaffle: { title?: string | null; draw_date?: string | null } | null;
}) {
  if (hasAvailableOt || hasLiveRaffle) {
    return {
      status: 'live' as const,
      label: 'LIVE',
      description: hasAvailableOt
        ? 'OT slots are available right now.'
        : 'A raffle is happening right now.',
    };
  }

  return {
    status: 'idle' as const,
    label: 'LIVE',
    description: nextUpcomingRaffle?.draw_date
      ? `No live events right now. Next raffle: ${new Date(nextUpcomingRaffle.draw_date).toLocaleString()}`
      : nextUpcomingRaffle
        ? 'No live events right now. A raffle has been scheduled.'
        : 'No live events right now.',
  };
}

function buildLiveEvents(
  shared: {
    availableOtCount: number;
    firstAvailableSlot: {
      id: string;
      date: string;
      start_time: string;
      end_time: string;
      shift_label: string | null;
    } | null;
    liveRaffle: {
      id: string;
      title: string | null;
      draw_date: string | null;
      status: string;
    } | null;
    upcomingRaffle: {
      id: string;
      title: string | null;
      draw_date: string | null;
      status: string;
    } | null;
  } | null,
  role: UserRole,
) {
  if (!shared) {
    return [] as LiveEventItem[];
  }

  const nextLiveEvents: LiveEventItem[] = [];

  if (shared.availableOtCount > 0) {
    nextLiveEvents.push({
      id: 'live-ot',
      type: 'ot',
      title: `${shared.availableOtCount} OT slot${shared.availableOtCount === 1 ? '' : 's'} available`,
      summary: shared.firstAvailableSlot
        ? `${new Date(`${shared.firstAvailableSlot.date}T${shared.firstAvailableSlot.start_time}`).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })} • ${shared.firstAvailableSlot.start_time} - ${shared.firstAvailableSlot.end_time}`
        : 'Open OT is available right now.',
      href: shared.firstAvailableSlot
        ? `/ot-calendar?date=${shared.firstAvailableSlot.date}`
        : '/ot-calendar',
    });
  }

  if (shared.liveRaffle) {
    nextLiveEvents.push({
      id: shared.liveRaffle.id,
      type: 'raffle',
      title: shared.liveRaffle.title ?? 'Live raffle',
      summary: shared.liveRaffle.draw_date
        ? `Running now • ${new Date(shared.liveRaffle.draw_date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'The wheel is already running.',
      href:
        role === 'employee'
          ? `/raffles?raffle=${shared.liveRaffle.id}`
          : `/moderator/raffles?raffle=${shared.liveRaffle.id}`,
    });
  }

  if (nextLiveEvents.length === 0 && shared.upcomingRaffle) {
    nextLiveEvents.push({
      id: shared.upcomingRaffle.id,
      type: 'upcoming',
      title: shared.upcomingRaffle.title ?? 'Upcoming raffle',
      summary: shared.upcomingRaffle.draw_date
        ? `Starts ${new Date(shared.upcomingRaffle.draw_date).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'Scheduled event',
      href:
        role === 'employee'
          ? `/raffles?raffle=${shared.upcomingRaffle.id}`
          : `/moderator/raffles?raffle=${shared.upcomingRaffle.id}`,
    });
  }

  return nextLiveEvents;
}

function playSoftNotificationSound() {
  if (typeof window === 'undefined') {
    return;
  }

  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(740, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.18);

  gainNode.gain.setValueAtTime(0.0001, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);

  window.setTimeout(() => {
    void context.close();
  }, 400);
}

export function TopNavShell({ user }: TopNavShellProps) {
  const [supabase] = useState(() => createClient());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [liveMenuOpen, setLiveMenuOpen] = useState(false);
  const [notificationsBadgeDismissed, setNotificationsBadgeDismissed] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [dockHoverVisible, setDockHoverVisible] = useState(false);
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketDept, setTicketDept] = useState<SupportDepartment | ''>('');
  const [ticketError, setTicketError] = useState('');
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showFloatingAlert, setShowFloatingAlert] = useState(false);
  const { data: shellData, error: shellDataError, mutate: mutateShellData } = useShellData(
    Boolean(user?.id),
  );

  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const dockShellRef = useRef<HTMLElement | null>(null);
  const shellMenuRef = useRef<HTMLDivElement | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const { isToolEnabled } = useAppAvailability();
  const pointsBalance = shellData?.pointsBalance ?? user?.points ?? 0;
  const tickets = shellData?.tickets ?? [];
  const liveEvents = useMemo(
    () => buildLiveEvents(shellData?.shared ?? null, user?.role ?? 'employee'),
    [shellData?.shared, user?.role],
  );

  useEffect(() => {
    const el = dockShellRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateOffset = () => {
      const styles = window.getComputedStyle(el);
      const topPx = Number.parseFloat(styles.top || '0') || 0;
      const heightPx = el.offsetHeight || el.getBoundingClientRect().height || 0;
      // Space below the fixed topnav so first-page actions don't render underneath it.
      // Use computed `top` + element height so transforms (dock-hidden) don't collapse the offset.
      // Keep enough space to avoid overlap with the fixed dock/search bar,
      // without pushing every page too far down.
      const next = Math.max(0, Math.ceil(topPx + heightPx + 6));
      document.documentElement.style.setProperty('--topnav-offset', `${next}px`);
    };

    updateOffset();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => updateOffset());
      ro.observe(el);
    }

    window.addEventListener('resize', updateOffset);
    window.addEventListener('orientationchange', updateOffset);

    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', updateOffset);
      window.removeEventListener('orientationchange', updateOffset);
    };
  }, []);

  // Hover-to-reveal dock: show only when cursor is near the top (desktop/hover devices).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const canHover = window.matchMedia?.('(hover: hover)').matches ?? true;
    if (!canHover) {
      setDockHoverVisible(true);
      return;
    }

    setDockHoverVisible(false);
    let raf = 0;
    const handlePointerMove = (event: PointerEvent) => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setDockHoverVisible(event.clientY <= 88);
      });
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  // Handle scroll for adaptive dock size
  useEffect(() => {
    let raf = 0;
    const handleScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        setIsScrolled(window.scrollY > 14);
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const {
    appShellBadge,
    cart,
    messagesOpen,
    notificationsOpen,
    unreadNotificationCount,
    setAppShellBadge,
    setLiveEvents: setStoredLiveEvents,
    setMessagesOpen,
    setNotifications,
    setNotificationsOpen,
    setCartOpen,
    sidebarExpanded,
    toggleSidebarExpanded,
    notificationPopupsEnabled,
    notificationSoundEnabled,
  } = useAppStore();

  useEffect(() => {
    const handleOpenSupport = () => setMessagesOpen(true);
    window.addEventListener('open-support-tickets', handleOpenSupport);
    return () => window.removeEventListener('open-support-tickets', handleOpenSupport);
  }, [setMessagesOpen]);

  const isDockInteracting =
    isSearchFocused ||
    dropdownOpen ||
    liveMenuOpen ||
    messagesOpen ||
    notificationsOpen ||
    unreadNotificationCount > 0;
  const dockVisible = dockHoverVisible || isDockInteracting;

  const cartItemCount = useMemo(
    () => cart.reduce((total, cartItem) => total + cartItem.quantity, 0),
    [cart],
  );

  useEffect(() => {
    if (unreadNotificationCount === 0) {
      setNotificationsBadgeDismissed(false);
    }
  }, [unreadNotificationCount]);

  useEffect(() => {
    if (!dropdownOpen || !user?.id) {
      return;
    }
    void mutateShellData();
  }, [dropdownOpen, mutateShellData, user?.id]);

  useEffect(() => {
    if (!user || !shellData) {
      return;
    }
 
    const nextNotifications = shellData.notifications ?? [];
    const nextNotificationIds = new Set(nextNotifications.map((notification) => notification.id));
    const newNotifications = nextNotifications.filter(
      (notification) => !seenNotificationIdsRef.current.has(notification.id),
    );

    if (newNotifications.length > 0 && seenNotificationIdsRef.current.size > 0) {
      if (notificationPopupsEnabled) {
        setShowFloatingAlert(true);
        window.setTimeout(() => setShowFloatingAlert(false), 5000);
      }

      if (notificationSoundEnabled) {
        playSoftNotificationSound();
      }
    }

    seenNotificationIdsRef.current = nextNotificationIds;
    setNotifications(nextNotifications);
    setStoredLiveEvents(liveEvents);
    setAppShellBadge(
      getShellBadgeState({
        hasAvailableOt: shellData.shared.availableOtCount > 0,
        hasLiveRaffle: Boolean(shellData.shared.liveRaffle),
        nextUpcomingRaffle: shellData.shared.upcomingRaffle,
      }),
    );
  }, [
    liveEvents,
    notificationPopupsEnabled,
    notificationSoundEnabled,
    setAppShellBadge,
    setNotifications,
    setStoredLiveEvents,
    shellData,
    user,
  ]);

  useEffect(() => {
    if (shellDataError) {
      console.warn('[topnav] shell data refresh failed', shellDataError);
    }
  }, [shellDataError]);

  useEffect(() => {
    document.documentElement.setAttribute('data-sidebar-expanded', sidebarExpanded.toString());
  }, [sidebarExpanded]);

  // Keep the dock centered relative to the *content area* (excluding the left sidebar),
  // so the search bar stays visually centered whether the sidebar is open or collapsed.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const applyShift = () => {
      const isSmall = window.matchMedia?.('(max-width: 860px)')?.matches ?? false;
      if (!sidebarExpanded || isSmall) {
        document.documentElement.style.setProperty('--dock-center-shift', '0px');
        return;
      }

      const styles = window.getComputedStyle(document.documentElement);
      const sidebarWidthRaw = styles.getPropertyValue('--sidebar-width').trim();
      const gapRaw = styles.getPropertyValue('--gap').trim();

      const sidebarWidth = Number.parseFloat(sidebarWidthRaw || '0') || 0;
      const gap = Number.parseFloat(gapRaw || '0') || 0;

      // Center of the content column is shifted right by half the sidebar width + half the gap.
      const shift = Math.max(0, (sidebarWidth + gap) / 2);
      document.documentElement.style.setProperty('--dock-center-shift', `${shift}px`);
    };

    applyShift();
    window.addEventListener('resize', applyShift);
    window.addEventListener('orientationchange', applyShift);
    return () => {
      window.removeEventListener('resize', applyShift);
      window.removeEventListener('orientationchange', applyShift);
    };
  }, [sidebarExpanded]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!shellMenuRef.current?.contains(target)) {
        setDropdownOpen(false);
        setLiveMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const submitTicket = async () => {
    if (!user || !ticketDept || !ticketMessage.trim()) return;

    setIsSubmittingTicket(true);
    setTicketError('');

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          department: ticketDept,
          message: ticketMessage.trim(),
        }),
      });

      const payload = (await response.json()) as { data?: SupportTicket; error?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'Unable to create ticket.');
      }

      await mutateShellData(
        (current) =>
          current
            ? {
                ...current,
                tickets: [payload.data!, ...current.tickets].slice(0, 10),
              }
            : current,
        {
          populateCache: true,
          revalidate: false,
        },
      );
      setTicketMessage('');
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : 'Unable to create ticket.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const filteredSearchItems = useMemo(() => {
    if (!searchQuery.trim() || !user) return [];
    const term = searchQuery.toLowerCase().trim();
    return getNavigationItems('search', user.role).filter(item => {
      const toolKey = resolveToolKeyFromPathname(item.href);
      if (toolKey && !isToolEnabled(toolKey, { userRole: user.role })) return false;
      return (
        item.label.toLowerCase().includes(term) ||
        item.synonyms?.some(syn => syn.toLowerCase().includes(term))
      );
    }).slice(0, 6);
  }, [searchQuery, user, isToolEnabled]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (!filteredSearchItems.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchSelectedIndex(prev => (prev + 1) % filteredSearchItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchSelectedIndex(prev => (prev - 1 + filteredSearchItems.length) % filteredSearchItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredSearchItems[searchSelectedIndex];
      if (selected) {
        router.push(selected.href);
        setSearchOpen(false);
        setSearchQuery('');
        setIsSearchFocused(false);
        (e.target as HTMLInputElement).blur();
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const hovered = filteredSearchItems[searchSelectedIndex];
      if (hovered) setSearchQuery(hovered.label);
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
      (e.target as HTMLInputElement).blur();
    }
  };

  const roleLabel: Record<string, string> = {
    employee: 'Employee',
    moderator_a1: 'Moderator A1',
    moderator_b1: 'Moderator B1',
    moderator: 'Moderator',
    admin: 'Admin (IT)',
  };

  return (
    <>
      <div className={`floating-island-container ${showFloatingAlert ? 'active' : ''}`}>
        <div className="floating-island-alert" onClick={() => {
          setNotificationsOpen(true);
          setShowFloatingAlert(false);
        }}>
          <div className="floating-island-sonar">
            <div className="sonar-core" />
            <div className="sonar-ring" />
          </div>
          <div className="floating-island-content">
            <div className="floating-island-label">Nuevas Notificaciones</div>
            <div className="floating-island-count">{unreadNotificationCount}</div>
          </div>
        </div>
      </div>

      <header
        ref={dockShellRef}
        className={`topnav-dock-shell ${dockVisible ? '' : 'dock-hidden'}`}
        style={{
          left: 'calc(50% + var(--dock-center-shift, 0px))',
          width: 'max-content',
          minWidth: 'min(900px, 90%)',
        }}
    >
      <button
        type="button"
        className="dock-sidebar-toggle"
        onClick={toggleSidebarExpanded}
        aria-label={sidebarExpanded ? 'Hide dashboard' : 'Show dashboard'}
        title={sidebarExpanded ? 'Hide dashboard' : 'Show dashboard'}
      >
        {sidebarExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>

      <div 
        ref={shellMenuRef}
        className={`topnav-dock group/dock ${isScrolled ? 'dock-scrolled' : 'dock-top'} ${isSearchFocused ? 'dock-search-focused' : ''}`}
      >
        <div className="dock-metal" aria-hidden="true" />
        
        {/* Search Area (Aligned from start to current end) */}

        {/* Search Area (Centered) */}
        <div
          ref={searchWrapRef}
          className="dock-search"
          onFocusCapture={() => setIsSearchFocused(true)}
          onBlurCapture={() => {
            window.setTimeout(() => {
              const wrap = searchWrapRef.current;
              if (!wrap) return;
              const active = document.activeElement;
              setIsSearchFocused(active ? wrap.contains(active) : false);
            }, 0);
          }}
        >
            {/* Legacy: disabled in favor of dock-level metallic border */}
            <div className="hidden">
              <div 
                className="absolute inset-0 rounded-[22px]"
                style={{
                  padding: '2px',
                  background: 'conic-gradient(from 0deg, transparent 20%, #94a3b8 40%, #f8fafc 50%, #94a3b8 60%, transparent 80%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  animation: 'rotate-conic 4s linear infinite',
                  filter: 'blur(1.5px)',
                }}
              />
              {/* Secondary Glow for Liquidity */}
              <div 
                className="absolute inset-0 rounded-[22px] mix-blend-overlay"
                style={{
                  padding: '2px',
                  background: 'conic-gradient(from 180deg, transparent 20%, var(--brand-primary) 50%, transparent 80%)',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                  animation: 'rotate-conic 6s linear infinite reverse',
                  filter: 'blur(3px)',
                }}
              />
            </div>

            <div className="dock-search-inner">
              <Search className="dock-search-icon" />
              <input
                type="text"
                placeholder="Search..."
                className="dock-search-input"
                value={searchQuery}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchSelectedIndex(0);
                  setSearchOpen(true);
                }}
                onKeyDown={handleSearchKeyDown}
              />

              {/* Suggestions Popover */}
              {searchOpen && filteredSearchItems.length > 0 && (
                <div className="search-suggestions animate-scale-in">
                  <div className="search-suggestions-header">
                    <span>Suggestions</span>
                  </div>
                  <div className="search-suggestions-list">
                    {filteredSearchItems.map((item, idx) => {
                      const Icon = item.icon;
                      const isSelected = idx === searchSelectedIndex;
                      return (
                        <button
                          key={item.href}
                          type="button"
                          className={`search-suggestion-item ${isSelected ? 'selected' : ''}`}
                          onMouseEnter={() => setSearchSelectedIndex(idx)}
                          onClick={() => {
                            router.push(item.href);
                            setSearchQuery('');
                            setSearchOpen(false);
                            setIsSearchFocused(false);
                            if (document.activeElement instanceof HTMLElement) {
                              document.activeElement.blur();
                            }
                          }}
                        >
                          <div className="suggestion-icon">
                            <Icon size={16} />
                          </div>
                          <div className="suggestion-info">
                            <div className="suggestion-label">{item.label}</div>
                            <div className="suggestion-href">{item.href}</div>
                          </div>
                          {isSelected && <ArrowRight size={14} className="suggestion-arrow" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
        </div>

        {/* Right Side (Actions) */}
        <div className="dock-actions">
          <div className="topnav-live-shell">
            <button
              type="button"
              className={`topnav-live topnav-live-${appShellBadge.status}`}
              title={appShellBadge.description}
              onClick={() => setLiveMenuOpen((currentOpen) => !currentOpen)}
            >
              <span className="live-dot" />
              <span className="topnav-live-text">{appShellBadge.label}</span>
            </button>

          {liveMenuOpen && (
            <div className="live-popover animate-scale-in">
              <div className="live-popover-header">
                <div>
                  <div className="live-popover-title">Live Event Center</div>
                  <div className="live-popover-subtitle">
                    {liveEvents.length > 1
                      ? 'Choose where you want to jump right now.'
                      : 'Open the active event directly.'}
                  </div>
                </div>
                <button
                  type="button"
                  className="live-popover-close"
                  onClick={() => setLiveMenuOpen(false)}
                  aria-label="Close live events"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="live-popover-list">
                {liveEvents.length === 0 ? (
                  <div className="live-empty">
                    No live OT or raffles right now.
                  </div>
                ) : (
                  liveEvents.map((eventItem) => (
                    <button
                      key={eventItem.id}
                      type="button"
                      className={`live-event-card live-event-card-${eventItem.type}`}
                      onClick={() => {
                        setLiveMenuOpen(false);
                        router.push(eventItem.href);
                      }}
                    >
                      <div className="live-event-icon">
                        {eventItem.type === 'ot' ? (
                          <CalendarClock size={16} />
                        ) : eventItem.type === 'raffle' ? (
                          <Gift size={16} />
                        ) : (
                          <Radio size={16} />
                        )}
                      </div>
                      <div className="live-event-copy">
                        <div className="live-event-title">{eventItem.title}</div>
                        <div className="live-event-summary">{eventItem.summary}</div>
                      </div>
                      <ArrowRight size={16} className="live-event-arrow" />
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          className="topnav-icon-btn"
          id="cart-btn"
          aria-label="Shopping cart"
          onClick={() => setCartOpen(true)}
        >
          <ShoppingCart size={18} />
          {cartItemCount > 0 && <span className="notif-badge">{cartItemCount}</span>}
        </button>

        <button
          className="topnav-icon-btn"
          id="notifications-btn"
          aria-label="Notifications"
          onClick={() => {
            // Hide the badge immediately on click (counts as "viewed" once the drawer opens).
            if (unreadNotificationCount > 0) {
              setNotificationsBadgeDismissed(true);
            }
            setNotificationsOpen(true);
            setShowFloatingAlert(false);
          }}
        >
          <Bell size={18} />
          {unreadNotificationCount > 0 && !notificationsBadgeDismissed && (
            <span key={unreadNotificationCount} className="notif-badge notif-badge-notifications">
              {unreadNotificationCount}
            </span>
          )}
          {unreadNotificationCount > 0 && !notificationsOpen && (
            <span className="notif-hint-ping" aria-hidden="true" />
          )}
        </button>


        <button
          className="topnav-icon-btn"
          id="messages-btn"
          aria-label="Support tickets"
          onClick={() => setMessagesOpen(true)}
        >
          <MessageSquare size={18} />
          {tickets.some((ticket) => ticket.status === 'open') && (
            <span className="notif-badge notif-badge-soft" />
          )}
        </button>

        <div className="topnav-user-menu">
          <button
            type="button"
            className="topnav-user"
            aria-haspopup="menu"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((currentOpen) => !currentOpen)}
          >
            <div className="user-avatar" style={{ minWidth: '30px', minHeight: '30px', maxWidth: '30px', maxHeight: '30px', borderRadius: '8px', overflow: 'hidden' }}>
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={proxifyMediaUrl(user.avatar_url)} 
                  alt={user.name} 
                  referrerPolicy="no-referrer"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
                />
              ) : (
                <span>{getInitials(user?.name ?? 'U')}</span>
              )}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.name ?? 'Employee'}</span>
              <span className="user-role">{roleLabel[user?.role ?? 'employee']}</span>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </button>

          {dropdownOpen && (
            <div className="user-dropdown" onClick={(event) => event.stopPropagation()}>
              <div className="dropdown-header">
                <span className="dropdown-name">{user?.name}</span>
                <span className="dropdown-email">{user?.email}</span>
              </div>
              <div className="dropdown-divider" />
              <div className="dropdown-points">
                <span>Points Balance</span>
                <span className="points-value">{pointsBalance}</span>
              </div>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item danger"
                onClick={handleSignOut}
                id="sign-out-btn"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          )}
        </div>

        {messagesOpen && (
          <div className="support-popover">
            <div className="support-header">
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Support Tickets</h3>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.25rem' }}
                onClick={() => setMessagesOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="support-body">
              {tickets.length > 0 ? (
                tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      padding: '0.75rem',
                      borderRadius: 8,
                      marginBottom: '0.5rem',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                        }}
                      >
                        To: {ticket.department}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          color:
                            ticket.status === 'resolved'
                              ? 'var(--status-available)'
                              : 'var(--brand-primary-light)',
                        }}
                      >
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8125rem' }}>{ticket.message}</div>
                  </div>
                ))
              ) : (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.8125rem',
                    margin: '1rem 0',
                  }}
                >
                  No active tickets yet.
                </div>
              )}
            </div>

            <div className="support-footer">
              <ModernSelect
                value={ticketDept}
                onValueChange={v => {
                  setTicketDept(v as SupportDepartment);
                  setTicketError('');
                }}
                options={[
                  { label: 'IT Support', value: 'it' },
                  { label: 'Moderator Support', value: 'moderator' }
                ]}
              />
              <div className="support-hint">
                {ticketDept
                  ? TICKET_HELP_TEXT[ticketDept]
                  : 'Pick a category first. You can create only 1 ticket every 5 hours.'}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: '0.8125rem' }}
                  placeholder={
                    ticketDept
                      ? 'Describe your issue so the team can help quickly...'
                      : 'Select a category first'
                  }
                  value={ticketMessage}
                  disabled={!ticketDept}
                  onChange={(event) => setTicketMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitTicket();
                    }
                  }}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '0.5rem' }}
                  onClick={() => {
                    void submitTicket();
                  }}
                  disabled={isSubmittingTicket}
                >
                  <Send size={14} />
                </button>
              </div>
              {ticketError && <div className="support-error">{ticketError}</div>}
            </div>
          </div>
        )}
      </div>
    </div>

    <style jsx>{`
        .floating-island-container {
          position: fixed;
          top: 0;
          left: 50%;
          transform: translateX(-50%) translateY(-100%);
          z-index: 9999;
          padding-top: 1.5rem;
          pointer-events: none;
          transition: all 0.6s cubic-bezier(0.2, 1.2, 0.2, 1);
          opacity: 0;
        }

        .floating-island-container.active {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }

        .floating-island-alert {
          background: rgba(13, 17, 34, 0.85);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(59, 130, 246, 0.25);
          padding: 0.6rem 1.2rem;
          border-radius: 99px;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3), 0 0 20px rgba(59, 130, 246, 0.1);
          cursor: pointer;
          pointer-events: auto;
          transition: transform 0.2s ease;
        }

        .floating-island-alert:hover {
          transform: scale(1.02);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .floating-island-sonar {
          position: relative;
          width: 12px;
          height: 12px;
        }

        .sonar-core {
          width: 100%;
          height: 100%;
          background: #3b82f6;
          border-radius: 50%;
          box-shadow: 0 0 10px #3b82f6;
        }

        .sonar-ring {
          position: absolute;
          inset: 0;
          background: #3b82f6;
          border-radius: 50%;
          animation: sonar-pulse 1.8s ease-out infinite;
        }

        .floating-island-content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: white;
        }

        .floating-island-label {
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: -0.01em;
        }

        .floating-island-count {
          background: #3b82f6;
          color: white;
          font-size: 0.7rem;
          font-weight: 800;
          padding: 0.1rem 0.5rem;
          border-radius: 6px;
          min-width: 18px;
          text-align: center;
        }

        @keyframes sonar-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(4.5); opacity: 0; }
        }

        @property --dockAngle {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }

        .topnav-dock-shell {
          position: fixed;
          top: 10px;
          transform: translateX(-50%);
          z-index: 100;
          width: 90%;
          max-width: 1100px;
          transition: transform 0.35s ease, opacity 0.35s ease,
            left 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          /* Avoid blocking clicks on page-level header buttons that sit near the top-right. */
          pointer-events: none;
        }

        .dock-hidden {
          transform: translateX(-50%) translateY(-120%);
          opacity: 0;
          pointer-events: none;
        }

        .dock-sidebar-toggle {
          position: absolute;
          left: -44px;
          top: 50%;
          transform: translateY(-50%);
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(13,17,34,0.78);
          backdrop-filter: blur(18px);
          box-shadow: 0 18px 45px rgba(0,0,0,0.55);
          color: rgba(226,232,240,0.92);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s ease, background 0.2s ease, border-color 0.2s ease;
          pointer-events: auto;
        }

        .dock-sidebar-toggle:hover {
          transform: translateY(-50%) scale(1.04);
          background: rgba(22,27,51,0.9);
          border-color: rgba(124,108,255,0.45);
        }

        .dock-sidebar-toggle:active {
          transform: translateY(-50%) scale(0.98);
        }

        .topnav-dock {
          position: relative;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 1.5rem;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 26px;
          box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5);
          transition: padding 0.35s ease, background 0.35s ease, border-color 0.35s ease;
          pointer-events: auto;
        }

        .topnav-dock:hover {
          border-color: rgba(255, 255, 255, 0.18);
        }

        .dock-top {
          padding: 0.2rem 0.75rem;
          background: rgba(13, 17, 34, 0.55);
          backdrop-filter: blur(18px);
        }

        .dock-scrolled {
          padding: 0.25rem 1rem;
          background: rgba(13, 17, 34, 0.92);
          backdrop-filter: blur(24px);
        }

        .dock-search {
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
          width: 100%;
          max-width: 440px;
          margin: 0 auto;
          transform: translateY(-1px);
        }

        .dock-side-spacer {
          min-width: 0;
        }

        .dock-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .dock-search-inner {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.7rem 1rem;
          border-radius: 22px;
          background: rgba(22, 27, 51, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.06);
          transition: background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }

        .dock-search-focused .dock-search-inner {
          background: rgba(28, 34, 66, 0.95);
          border-color: transparent;
          box-shadow: 0 0 20px rgba(148, 163, 184, 0.12);
        }

        .dock-search-icon {
          width: 20px;
          height: 20px;
          color: rgba(148, 163, 184, 0.78);
          transition: color 0.25s ease;
          flex-shrink: 0;
        }

        .dock-search-focused .dock-search-icon {
          color: rgba(226, 232, 240, 0.9);
        }

        .dock-search-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: rgba(241, 245, 249, 0.96);
          font-size: 14px;
          padding: 0;
          min-width: 0;
        }

        .dock-search-input::placeholder {
          color: rgba(148, 163, 184, 0.72);
        }

        .dock-metal {
          position: absolute;
          inset: -1px;
          border-radius: 28px;
          padding: 2px;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.35s ease;
          background: conic-gradient(
            from var(--dockAngle),
            rgba(255, 255, 255, 0) 0deg,
            rgba(148, 163, 184, 0.6) 50deg,
            rgba(248, 250, 252, 0.95) 95deg,
            rgba(148, 163, 184, 0.55) 150deg,
            rgba(255, 255, 255, 0) 220deg,
            rgba(226, 232, 240, 0.85) 280deg,
            rgba(255, 255, 255, 0) 360deg
          );
          filter: grayscale(1) blur(1.6px);
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask-composite: exclude;
        }

        .dock-search-focused .dock-metal {
          opacity: 1;
          animation: dockMetalShift 5.2s linear infinite;
        }

        @keyframes dockMetalShift {
          to {
            --dockAngle: 360deg;
          }
        }

        @keyframes popIn {
          from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.95); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }

        .topnav-live-shell {
          position: relative;
          flex-shrink: 0;
          pointer-events: auto;
        }

        .topnav-live {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.32rem 0.7rem;
          border-radius: 999px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease, border-color 0.18s ease;
          user-select: none;
        }

        .topnav-live:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35);
        }

        .topnav-live-live {
          background: rgba(16, 185, 129, 0.14);
          border-color: rgba(16, 185, 129, 0.28);
        }

        .topnav-live-idle {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.28);
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        .topnav-live-live .live-dot {
          background: var(--status-available);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.18);
          animation: livePulse 1.6s ease-in-out infinite;
        }

        .topnav-live-idle .live-dot {
          background: var(--status-claimed);
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
        }

        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          55% { transform: scale(1.25); opacity: 0.65; }
        }

        .topnav-live-text {
          font-size: 0.73rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1;
        }

        .topnav-live-live .topnav-live-text {
          color: var(--status-available);
        }

        .topnav-live-idle .topnav-live-text {
          color: var(--status-claimed);
        }

        .live-popover {
          position: absolute;
          top: calc(100% + 12px);
          left: 50%;
          right: auto;
          transform: translateX(-50%);
          width: min(360px, calc(100vw - 2rem));
          background: rgba(13, 17, 34, 0.99);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 24px;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(24px);
          padding: 1rem;
          z-index: 100;
          animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .live-popover-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.8rem;
        }

        .live-popover-title {
          font-size: 0.92rem;
          font-weight: 800;
          color: var(--text-primary);
        }

        .live-popover-subtitle {
          font-size: 0.75rem;
          color: var(--text-secondary);
          line-height: 1.45;
          margin-top: 0.25rem;
        }

        .live-popover-close {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.02);
          color: var(--text-secondary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }

        .live-popover-close:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.08);
        }

        .live-popover-list {
          display: grid;
          gap: 0.65rem;
        }

        .live-empty {
          padding: 0.9rem 1rem;
          border-radius: 16px;
          border: 1px dashed rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(226, 232, 240, 0.8);
          font-size: 0.85rem;
          line-height: 1.45;
        }

        .live-event-card {
          width: 100%;
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 0.8rem;
          align-items: center;
          padding: 0.8rem 0.9rem;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          color: inherit;
          text-align: left;
          transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
        }

        .live-event-card:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.05);
        }

        .live-event-card-ot:hover {
          border-color: rgba(16, 185, 129, 0.36);
        }

        .live-event-card-raffle:hover,
        .live-event-card-upcoming:hover {
          border-color: rgba(99, 102, 241, 0.34);
        }

        .live-event-icon {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: white;
          background: var(--gradient-brand);
          box-shadow: 0 12px 26px rgba(99, 102, 241, 0.26);
        }

        .live-event-copy {
          min-width: 0;
        }

        .live-event-title {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .live-event-summary {
          font-size: 0.74rem;
          color: var(--text-secondary);
          line-height: 1.45;
          margin-top: 0.2rem;
        }

        .live-event-arrow {
          color: var(--text-muted);
        }

        .topnav-icon-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .topnav-icon-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-default);
        }

        .notif-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          background: var(--brand-primary);
          border-radius: 999px;
          font-size: 0.6rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          border: 2px solid var(--bg-surface);
        }

        .notif-badge-notifications {
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.95), rgba(37, 99, 235, 0.95));
          border-color: var(--bg-surface);
          box-shadow: 0 10px 20px rgba(37, 99, 235, 0.25);
          animation: notifBadgePop 520ms cubic-bezier(0.2, 0.9, 0.2, 1) 1;
          z-index: 5;
        }


        @keyframes notifBadgePop {
          0% { transform: scale(0.7); }
          45% { transform: scale(1.25); }
          100% { transform: scale(1); }
        }


        .notif-hint-ping {
          position: absolute;
          inset: -8px;
          border-radius: 14px;
          background: radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.18), transparent 62%);
          z-index: -1;
          animation: notifHintPulse 1.8s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes notifHintPulse {
          0% { transform: scale(0.92); opacity: 0.55; }
          55% { transform: scale(1.05); opacity: 0.95; }
          100% { transform: scale(1.18); opacity: 0; }
        }

        .notif-badge-soft {
          width: 10px;
          min-width: 10px;
          height: 10px;
          padding: 0;
          background: var(--status-available);
        }

        .topnav-user-menu {
          position: relative;
        }

        .topnav-user {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.375rem 0.75rem 0.375rem 0.375rem;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
          color: inherit;
        }

        .topnav-user:hover {
          border-color: var(--border-default);
          background: var(--bg-card-hover);
        }

        .user-avatar {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: var(--gradient-brand);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }

        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .user-role {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 500;
        }

        .user-dropdown {
          position: absolute;
          top: calc(100% + 12px);
          right: 0;
          width: 240px;
          background: rgba(13, 17, 34, 0.99);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
          z-index: 100;
          overflow: hidden;
          animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          backdrop-filter: blur(30px);
        }

        .dropdown-header {
          padding: 0.875rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .dropdown-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .dropdown-email {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .dropdown-divider {
          height: 1px;
          background: var(--border-subtle);
        }

        .dropdown-points {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .points-value {
          font-weight: 700;
          color: var(--brand-primary-light);
        }

        .dropdown-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-family: 'Inter', sans-serif;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          color: var(--text-secondary);
        }

        .dropdown-item:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }

        .dropdown-item.danger:hover {
          background: rgba(239, 68, 68, 0.08);
          color: var(--status-claimed);
        }

        .support-popover {
          position: absolute;
          top: calc(100% + 12px);
          right: 54px;
          width: 360px;
          background: rgba(13, 17, 34, 0.99);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 20px;
          box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
          z-index: 100;
          overflow: hidden;
          animation: popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
          display: flex;
          flex-direction: column;
          backdrop-filter: blur(30px);
        }

        .support-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }

        .support-body {
          padding: 1rem;
          max-height: 250px;
          overflow-y: auto;
          background: var(--bg-surface);
        }

        .support-footer {
          padding: 1rem;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }

        .support-hint {
          font-size: 0.75rem;
          line-height: 1.4;
          color: var(--text-muted);
        }

        .support-error {
          margin-top: 0.75rem;
          font-size: 0.75rem;
          color: #f87171;
        }

        .search-suggestions {
          position: absolute;
          top: calc(100% + 14px);
          left: 0;
          width: 100%;
          background: rgba(13, 17, 34, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px;
          box-shadow: 0 35px 80px rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(35px);
          overflow: hidden;
          padding: 0.5rem;
          z-index: 200;
        }

        .search-suggestions-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.6rem 0.8rem 0.4rem;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .search-suggestions-list {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .search-suggestion-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.65rem 0.85rem;
          border-radius: 14px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          text-align: left;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .search-suggestion-item:hover,
        .search-suggestion-item.selected {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }

        .search-suggestion-item.selected {
          border: 1px solid rgba(255, 255, 255, 0.08);
        }

        .suggestion-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--brand-primary-light);
          flex-shrink: 0;
        }

        .search-suggestion-item.selected .suggestion-icon {
          background: var(--brand-primary);
          color: white;
          border-color: transparent;
          box-shadow: 0 8px 16px rgba(109, 93, 252, 0.25);
        }

        .suggestion-info {
          flex: 1;
          min-width: 0;
        }

        .suggestion-label {
          font-size: 0.875rem;
          font-weight: 600;
          line-height: 1.2;
        }

        .suggestion-href {
          font-size: 0.72rem;
          color: var(--text-muted);
          margin-top: 0.125rem;
        }

        .suggestion-arrow {
          color: var(--brand-primary-light);
          animation: slideInLeft 0.2s ease-out;
        }

        @keyframes slideInLeft {
          from { transform: translateX(-5px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </header>
  </>
);
}
