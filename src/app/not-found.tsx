import Link from 'next/link';
import { ArrowLeft, FileQuestion, LayoutDashboard } from 'lucide-react';
import { SystemState } from '@/components/ui/SystemState';

export default function NotFound() {
  return (
    <SystemState
      eyebrow="404"
      title="Page not found"
      description="The page may have moved, or the address might be incorrect."
      icon={<FileQuestion aria-hidden="true" size={24} />}
      actions={
        <>
          <Link className="btn btn-primary" href="/dashboard">
            <LayoutDashboard aria-hidden="true" size={16} />
            Go to dashboard
          </Link>
          <Link className="btn btn-ghost" href="/">
            <ArrowLeft aria-hidden="true" size={16} />
            Return home
          </Link>
        </>
      }
    />
  );
}
