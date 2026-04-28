'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckoutConfirmRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/store/checkout');
  }, [router]);

  return null;
}

