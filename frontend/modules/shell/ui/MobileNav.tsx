'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { BottomNav } from '@frontend/modules/shell/ui/BottomNav';
import { MobileMoreSheet } from '@frontend/modules/shell/ui/MobileMoreSheet';
import { MobileTopBar } from '@frontend/modules/shell/ui/MobileTopBar';
import type { UserRole } from '@shared/contracts/database';

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
