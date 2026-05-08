'use client';

import { useState } from 'react';
import { BottomNav } from './BottomNav';
import { MobileMoreSheet } from './MobileMoreSheet';
import type { UserRole } from '@/types/database';

interface MobileNavProps {
  userRole: UserRole;
}

export function MobileNav({ userRole }: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <BottomNav userRole={userRole} onMoreClick={() => setSheetOpen(true)} />
      <MobileMoreSheet userRole={userRole} open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
