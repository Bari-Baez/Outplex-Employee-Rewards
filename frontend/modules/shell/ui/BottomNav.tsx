'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import type { UserRole } from '@shared/contracts/database';
import { getNavigationItems } from '@frontend/modules/shell/config/navigation';

interface BottomNavProps {
  userRole: UserRole;
  onMoreClick: () => void;
}

export function BottomNav({ userRole, onMoreClick }: BottomNavProps) {
  const pathname = usePathname();
  const mainItems = getNavigationItems('mobile-primary', userRole);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="bottom-nav" aria-label="Mobile navigation">
      {mainItems.map(({ label, compactLabel, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`bottom-nav-item${isActive(href) ? ' bottom-nav-item--active' : ''}`}
          aria-label={label}
        >
          <span className="bottom-nav-icon">
            <Icon aria-hidden="true" size={22} strokeWidth={isActive(href) ? 2.2 : 1.8} />
          </span>
          <span className="bottom-nav-label">{compactLabel ?? label}</span>
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
