'use client';

import { Suspense } from 'react';
import { LandingClient } from '../LandingClient';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LandingClient variant="login" />
    </Suspense>
  );
}
