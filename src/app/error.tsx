'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, LayoutDashboard, RotateCcw } from 'lucide-react';
import { SystemState } from '@frontend/shared/ui/SystemState';

interface ErrorPageProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function ErrorPage({ error, unstable_retry }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemState
      eyebrow="Page error"
      title="We couldn't load this page"
      description="The problem may be temporary. Try loading the page again, or return to the dashboard."
      icon={<AlertTriangle aria-hidden="true" size={24} />}
      referenceCode={error.digest}
      actions={
        <>
          <button type="button" className="btn btn-primary" onClick={() => unstable_retry()}>
            <RotateCcw aria-hidden="true" size={16} />
            Try again
          </button>
          <Link className="btn btn-ghost" href="/dashboard">
            <LayoutDashboard aria-hidden="true" size={16} />
            Go to dashboard
          </Link>
        </>
      }
    />
  );
}
