'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from './BottomNav';
import { MobileMoreSheet } from './MobileMoreSheet';
import { MobileTopBar } from './MobileTopBar';
import type { UserRole } from '@/types/database';

interface MobileNavProps {
  userRole: UserRole;
}

export function MobileNav({ userRole }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <MobileTopBar key={pathname} />
      <BottomNav userRole={userRole} onMoreClick={() => setSheetOpen(true)} />
      <MobileMoreSheet userRole={userRole} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
