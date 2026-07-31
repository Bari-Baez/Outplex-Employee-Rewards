'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { UserRole } from '@shared/contracts/database';
import { getNavigationItems } from '@frontend/modules/shell/config/navigation';

interface MobileMoreSheetProps {
  userRole: UserRole;
  open: boolean;
  onClose: () => void;
}

export function MobileMoreSheet({ userRole, open, onClose }: MobileMoreSheetProps) {
  const pathname = usePathname();

  // Close on route change
  useEffect(() => {
    onClose();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const visibleItems = getNavigationItems('mobile-more', userRole);
  const employeeItems = visibleItems.filter((item) => item.group === 'main');
  const toolItems = visibleItems.filter((item) => item.group === 'tools');
  const moderatorItems = visibleItems.filter(
    (item) => item.group === 'moderator' || item.group === 'admin',
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="more-sheet-backdrop more-sheet-backdrop--open" />
        <DialogPrimitive.Content className="more-sheet more-sheet--open">
        <DialogPrimitive.Description className="sr-only">
          Additional navigation options for Outplex.
        </DialogPrimitive.Description>
        <div className="more-sheet-handle" />

        <div className="more-sheet-header">
          <DialogPrimitive.Title className="more-sheet-title">More</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <button type="button" className="more-sheet-close" aria-label="Close navigation">
              <X aria-hidden="true" size={20} />
            </button>
          </DialogPrimitive.Close>
        </div>

        <div className="more-sheet-body">
          <section className="more-sheet-section">
            <p className="more-sheet-section-label">Navigation</p>
            <div className="more-sheet-grid">
              {employeeItems.map(({ label, href, icon: Icon }) => (
                <Link key={href} href={href} className="more-sheet-tile" onClick={onClose}>
                  <span className="more-sheet-tile-icon">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <span className="more-sheet-tile-label">{label}</span>
                </Link>
              ))}
            </div>
          </section>

          {toolItems.length > 0 && (
            <section className="more-sheet-section">
              <p className="more-sheet-section-label">Tools</p>
              <div className="more-sheet-grid">
                {toolItems.map(({ label, href, icon: Icon }) => (
                  <Link key={href} href={href} className="more-sheet-tile" onClick={onClose}>
                    <span className="more-sheet-tile-icon">
                      <Icon aria-hidden="true" size={18} />
                    </span>
                    <span className="more-sheet-tile-label">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {moderatorItems.length > 0 && (
            <section className="more-sheet-section">
              <p className="more-sheet-section-label">Mod Panel</p>
              <div className="more-sheet-grid">
                {moderatorItems.map(({ label, href, icon: Icon }) => (
                  <Link key={href} href={href} className="more-sheet-tile more-sheet-tile--mod" onClick={onClose}>
                    <span className="more-sheet-tile-icon">
                      <Icon aria-hidden="true" size={18} />
                    </span>
                    <span className="more-sheet-tile-label">{label}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
