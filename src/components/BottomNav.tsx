'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  ShoppingBag,
  MoreHorizontal,
} from 'lucide-react';
import type { UserRole } from '@/types/database';

interface BottomNavProps {
  userRole: UserRole;
  onMoreClick: () => void;
}

const MAIN_ITEMS = [
  { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { label: 'OT', href: '/ot-calendar', icon: CalendarDays },
  { label: 'Store', href: '/store', icon: ShoppingBag },
];

export function BottomNav({ onMoreClick }: BottomNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {MAIN_ITEMS.map(({ label, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`bottom-nav-item${isActive(href) ? ' bottom-nav-item--active' : ''}`}
          aria-label={label}
        >
          <span className="bottom-nav-icon">
            <Icon size={22} strokeWidth={isActive(href) ? 2.2 : 1.8} />
          </span>
          <span className="bottom-nav-label">{label}</span>
        </Link>
      ))}

      <button
        className="bottom-nav-item"
        onClick={onMoreClick}
        aria-label="More options"
        type="button"
      >
        <span className="bottom-nav-icon">
          <MoreHorizontal size={22} strokeWidth={1.8} />
        </span>
        <span className="bottom-nav-label">More</span>
      </button>
    </nav>
  );
}
