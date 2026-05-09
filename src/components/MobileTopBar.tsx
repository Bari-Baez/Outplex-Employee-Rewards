'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Bell, ChevronRight, Radio, Settings, ShoppingCart } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const ROOT_PATHS = new Set([
  '/dashboard',
  '/ot-calendar',
  '/store',
  '/raffles',
  '/orders',
  '/forms',
  '/announcements',
  '/notifications',
  '/my-store',
  '/settings',
  '/support',
  '/staging',
  '/simulation',
  '/moderator/users',
  '/moderator/ot-manager',
  '/moderator/breaks-manager',
  '/moderator/raffles',
  '/moderator/store',
  '/moderator/store/orders',
  '/moderator/store/inventory',
  '/moderator/store/analytics',
  '/moderator/store/recycle-bin',
  '/moderator/communications/notifications',
  '/moderator/communications/announcements',
  '/moderator/employee-stores',
  '/moderator/forms',
]);

function getFallbackHref(pathname: string) {
  if (pathname.startsWith('/announcements/')) return '/announcements';
  if (pathname.startsWith('/store/checkout')) return '/store';
  if (pathname.startsWith('/store/employee-checkout')) return '/store';
  if (pathname.startsWith('/moderator/store/')) return '/moderator/store/orders';
  if (pathname.startsWith('/moderator/communications/')) return '/moderator/communications/notifications';
  if (pathname.startsWith('/moderator/forms')) return '/moderator/forms';
  if (pathname.startsWith('/moderator/')) return '/dashboard';
  return '/dashboard';
}

function getTitle(pathname: string) {
  const titleMap: Array<[string, string]> = [
    ['/dashboard', 'Home'],
    ['/ot-calendar', 'OT'],
    ['/store', 'Store'],
    ['/raffles', 'Raffles'],
    ['/orders', 'Orders'],
    ['/forms', 'Forms'],
    ['/announcements', 'Announcements'],
    ['/notifications', 'Notifications'],
    ['/my-store', 'My Store'],
    ['/settings', 'Account Settings'],
    ['/moderator/users', 'Employees'],
    ['/moderator/ot-manager', 'OT Manager'],
    ['/moderator/breaks-manager', 'Breaks'],
    ['/moderator/raffles', 'Raffle Engine'],
    ['/moderator/store', 'Store Ops'],
    ['/moderator/communications', 'Communications'],
    ['/moderator/employee-stores', 'Employee Stores'],
    ['/moderator/forms', 'Form Builder'],
  ];

  const exact = titleMap.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return exact?.[1] ?? 'Outplex';
}

export function MobileTopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    appShellBadge,
    cart,
    empCart,
    liveEvents,
    unreadNotificationCount,
    setCartOpen,
    setEmpCartOpen,
    setNotificationsOpen,
  } = useAppStore();
  const [liveOpen, setLiveOpen] = useState(false);
  const [backVisible, setBackVisible] = useState(true);

  const cartItemCount = useMemo(
    () =>
      cart.reduce((total, item) => total + item.quantity, 0) +
      empCart.reduce((total, item) => total + item.quantity, 0),
    [cart, empCart],
  );

  const showBackButton = !ROOT_PATHS.has(pathname);
  const currentTitle = getTitle(pathname);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let raf = 0;

    const handleScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const nextScrollY = window.scrollY;
        const scrollingUp = nextScrollY < lastScrollY;
        const nearTop = nextScrollY < 28;
        setBackVisible(scrollingUp || nearTop);
        lastScrollY = nextScrollY;
      });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const handleBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(getFallbackHref(pathname));
  };

  const handleCartOpen = () => {
    setLiveOpen(false);
    setNotificationsOpen(false);
    if (empCart.length > 0) {
      setEmpCartOpen(true);
      return;
    }
    setCartOpen(true);
  };

  const handleNotificationsOpen = () => {
    setLiveOpen(false);
    setCartOpen(false);
    setEmpCartOpen(false);
    setNotificationsOpen(true);
  };

  return (
    <>
      <div className="mobile-topbar-shell">
        <div className="mobile-topbar">
          <div className="mobile-topbar-left">
            {showBackButton ? (
              <button
                type="button"
                className={`mobile-topbar-back ${backVisible ? '' : 'mobile-topbar-back-hidden'}`}
                onClick={handleBack}
                aria-label="Go back"
              >
                <ArrowLeft size={17} />
              </button>
            ) : (
              <div className="mobile-topbar-brand">{currentTitle}</div>
            )}
          </div>

          <div className="mobile-topbar-right">
            <button
              type="button"
              className={`mobile-live-btn mobile-live-btn-${appShellBadge.status}`}
              onClick={() => setLiveOpen((current) => !current)}
              aria-label="Live activity"
            >
              <Radio size={13} />
            </button>

            <button type="button" className="mobile-topbar-icon-btn" onClick={handleCartOpen} aria-label="Shopping cart">
              <ShoppingCart size={17} />
              {cartItemCount > 0 ? (
                <span className="mobile-topbar-badge">{cartItemCount > 99 ? '99+' : cartItemCount}</span>
              ) : null}
            </button>

            <button type="button" className="mobile-topbar-icon-btn" onClick={handleNotificationsOpen} aria-label="Notifications">
              <Bell size={17} />
              {unreadNotificationCount > 0 ? (
                <span className="mobile-topbar-badge mobile-topbar-badge-info">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {liveOpen ? (
          <div className="mobile-live-popover">
            <div className="mobile-live-popover-head">
              <div>
                <div className="mobile-live-popover-title">Live status</div>
                <div className="mobile-live-popover-subtitle">{appShellBadge.description}</div>
              </div>
              <button type="button" className="mobile-live-settings-link" onClick={() => setLiveOpen(false)} aria-label="Close live status">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="mobile-live-list">
              {liveEvents.length > 0 ? (
                liveEvents.map((event) => (
                  <Link key={event.id} href={event.href} className="mobile-live-card" onClick={() => setLiveOpen(false)}>
                    <div className="mobile-live-card-copy">
                      <strong>{event.title}</strong>
                      <span>{event.summary}</span>
                    </div>
                    <ChevronRight size={15} />
                  </Link>
                ))
              ) : (
                <div className="mobile-live-empty">No hay OT ni rifas en vivo ahora mismo.</div>
              )}

              <Link href="/settings" className="mobile-live-settings-link mobile-live-settings-link-row" onClick={() => setLiveOpen(false)}>
                <Settings size={15} />
                <span>Account settings</span>
              </Link>
            </div>
          </div>
        ) : null}
      </div>

      <style>{`
        .mobile-topbar-shell {
          display: none;
        }

        @media (max-width: 767px) {
          .mobile-topbar-shell {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 260;
            padding: calc(env(safe-area-inset-top) + 0.6rem) 0.75rem 0;
            pointer-events: none;
          }

          .mobile-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.85rem;
            padding: 0.7rem 0.8rem;
            border-radius: 18px;
            background: rgba(10, 13, 24, 0.9);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(22px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.28);
            pointer-events: auto;
          }

          .mobile-topbar-left,
          .mobile-topbar-right {
            display: flex;
            align-items: center;
            gap: 0.55rem;
            min-width: 0;
          }

          .mobile-topbar-brand {
            font-size: 0.9rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: var(--text-primary);
          }

          .mobile-topbar-back,
          .mobile-topbar-icon-btn {
            width: 38px;
            height: 38px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.07);
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-primary);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            position: relative;
            transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease;
          }

          .mobile-topbar-back-hidden {
            opacity: 0;
            pointer-events: none;
            transform: translateY(-8px);
          }

          .mobile-live-btn {
            width: 34px;
            height: 34px;
            border-radius: 999px;
            border: 1px solid transparent;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;
          }

          .mobile-live-btn-live {
            background: rgba(16, 185, 129, 0.18);
            color: #34d399;
            border-color: rgba(16, 185, 129, 0.28);
          }

          .mobile-live-btn-idle {
            background: rgba(239, 68, 68, 0.14);
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.24);
          }

          .mobile-topbar-badge {
            position: absolute;
            top: -4px;
            right: -4px;
            min-width: 16px;
            height: 16px;
            padding: 0 4px;
            border-radius: 999px;
            background: var(--brand-primary);
            color: white;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.58rem;
            font-weight: 800;
            border: 2px solid rgba(10, 13, 24, 0.94);
          }

          .mobile-topbar-badge-info {
            background: #2563eb;
          }

          .mobile-live-popover {
            margin-top: 0.65rem;
            border-radius: 20px;
            background: rgba(10, 13, 24, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(24px);
            box-shadow: 0 24px 48px rgba(0, 0, 0, 0.34);
            padding: 0.95rem;
            pointer-events: auto;
            animation: fadeIn 0.18s ease;
          }

          .mobile-live-popover-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.8rem;
          }

          .mobile-live-popover-title {
            font-size: 0.82rem;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--text-primary);
          }

          .mobile-live-popover-subtitle {
            margin-top: 0.25rem;
            font-size: 0.78rem;
            line-height: 1.45;
            color: var(--text-secondary);
          }

          .mobile-live-list {
            display: grid;
            gap: 0.6rem;
          }

          .mobile-live-card,
          .mobile-live-settings-link-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.7rem;
            padding: 0.8rem 0.85rem;
            border-radius: 14px;
            text-decoration: none;
            color: inherit;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
          }

          .mobile-live-card-copy {
            display: grid;
            gap: 0.2rem;
            min-width: 0;
          }

          .mobile-live-card-copy strong {
            font-size: 0.82rem;
            color: var(--text-primary);
          }

          .mobile-live-card-copy span {
            font-size: 0.75rem;
            color: var(--text-secondary);
            line-height: 1.4;
          }

          .mobile-live-settings-link {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(255, 255, 255, 0.03);
            color: var(--text-secondary);
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          .mobile-live-settings-link-row {
            justify-content: flex-start;
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-secondary);
          }

          .mobile-live-empty {
            padding: 0.85rem 0.9rem;
            border-radius: 14px;
            border: 1px dashed rgba(255, 255, 255, 0.1);
            color: var(--text-secondary);
            font-size: 0.78rem;
            line-height: 1.45;
          }
        }
      `}</style>
    </>
  );
}
