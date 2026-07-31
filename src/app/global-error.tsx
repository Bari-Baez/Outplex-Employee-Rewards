'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, House, RotateCcw } from 'lucide-react';
import { SystemState } from '@frontend/shared/ui/SystemState';
import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}

export default function GlobalError({ error, unstable_retry }: GlobalErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Application error | Outplex</title>
      </head>
      <body>
        <SystemState
          eyebrow="Application error"
          title="Outplex is temporarily unavailable"
          description="We couldn't start the application. Try again now, or return to the home page and sign in again."
          icon={<AlertTriangle aria-hidden="true" size={24} />}
          referenceCode={error.digest}
          actions={
            <>
              <button type="button" className="btn btn-primary" onClick={() => unstable_retry()}>
                <RotateCcw aria-hidden="true" size={16} />
                Try again
              </button>
              <Link className="btn btn-ghost" href="/">
                <House aria-hidden="true" size={16} />
                Return home
              </Link>
            </>
          }
        />
      </body>
    </html>
  );
}
