'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { createClient } from '@frontend/platform/supabase/client';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace('/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="btn btn-ghost" onClick={() => void handleLogout()} disabled={busy}>
      <LogOut size={16} />
      {busy ? 'Logging out...' : 'Log out'}
    </button>
  );
}
