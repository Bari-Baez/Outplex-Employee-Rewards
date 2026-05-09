'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  X,
  Gift,
  ClipboardList,
  Megaphone,
  Store,
  FileSpreadsheet,
  CalendarDays,
  Users,
  ShoppingBag,
  FormInput,
  LayoutDashboard,
  ShoppingCart,
  Settings,
  Calculator,
} from 'lucide-react';
import type { UserRole } from '@/types/database';

interface MobileMoreSheetProps {
  userRole: UserRole;
  open: boolean;
  onClose: () => void;
}

const EMPLOYEE_ITEMS = [
  { label: 'Raffles', href: '/raffles', icon: Gift },
  { label: 'Order History', href: '/orders', icon: ShoppingCart },
  { label: 'Forms', href: '/forms', icon: ClipboardList },
  { label: 'Announcements', href: '/announcements', icon: Megaphone },
  { label: 'My Store', href: '/my-store', icon: Store },
  { label: 'Account', href: '/settings', icon: Settings },
];

const EMPLOYEE_TOOL_ITEMS = [
  { label: 'Calculator', href: '/calculator', icon: Calculator },
];

const MOD_ITEMS = [
  { label: 'OT Staging', href: '/staging', icon: FileSpreadsheet, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
  { label: 'OT Manager', href: '/moderator/ot-manager', icon: CalendarDays, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Breaks Manager', href: '/moderator/breaks-manager', icon: ClipboardList, roles: ['moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Raffle Engine', href: '/moderator/raffles', icon: Gift, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Store Operations', href: '/moderator/store/orders', icon: ShoppingBag, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Employees', href: '/moderator/users', icon: Users, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Employee Stores', href: '/moderator/employee-stores', icon: Store, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Communications', href: '/moderator/communications/notifications', icon: Megaphone, roles: ['moderator_a1', 'admin'] as UserRole[] },
  { label: 'Form Builder', href: '/moderator/forms', icon: FormInput, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Simulation Tools', href: '/simulation', icon: LayoutDashboard, roles: ['admin'] as UserRole[] },
];

const MOD_ROLES: UserRole[] = ['moderator', 'moderator_a1', 'moderator_b1', 'admin'];

export function MobileMoreSheet({ userRole, open, onClose }: MobileMoreSheetProps) {
  const pathname = usePathname();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close on backdrop click / Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isMod = MOD_ROLES.includes(userRole);
  const visibleModItems = MOD_ITEMS.filter((i) => i.roles.includes(userRole));

  return (
    <>
      {/* Backdrop */}
      <div
        className={`more-sheet-backdrop${open ? ' more-sheet-backdrop--open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`more-sheet${open ? ' more-sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation options"
      >
        {/* Handle bar */}
        <div className="more-sheet-handle" />

        <div className="more-sheet-header">
          <span className="more-sheet-title">More</span>
          <button className="more-sheet-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="more-sheet-body">
          {/* Employee section */}
          <section className="more-sheet-section">
            <p className="more-sheet-section-label">Navigation</p>
            <div className="more-sheet-grid">
              {EMPLOYEE_ITEMS.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="more-sheet-tile" onClick={onClose}>
                  <span className="more-sheet-tile-icon">
                    <Icon size={18} />
                  </span>
                  <span className="more-sheet-tile-label">{label}</span>
                </Link>
              ))}
            </div>
          </section>

          {userRole === 'employee' && (
            <section className="more-sheet-section">
              <p className="more-sheet-section-label">Tools</p>
              <div className="more-sheet-grid">
                {EMPLOYEE_TOOL_ITEMS.map(({ label, href, icon: Icon }) => (
                  <Link key={href} href={href} className="more-sheet-tile" onClick={onClose}>
                    <span className="more-sheet-tile-icon">
                      <Icon size={18} />
                    </span>
                    <span className="more-sheet-tile-label">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Moderator / Admin section */}
          {isMod && visibleModItems.length > 0 && (
            <section className="more-sheet-section">
              <p className="more-sheet-section-label">Mod Panel</p>
              <div className="more-sheet-grid">
                {visibleModItems.map(({ label, href, icon: Icon }) => (
                  <Link key={href} href={href} className="more-sheet-tile more-sheet-tile--mod" onClick={onClose}>
                    <span className="more-sheet-tile-icon">
                      <Icon size={18} />
                    </span>
                    <span className="more-sheet-tile-label">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
