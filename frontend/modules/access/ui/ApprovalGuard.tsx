'use client';

import { ShieldAlert, Clock, LogOut } from 'lucide-react';
import { createClient } from '@frontend/platform/supabase/client';
import { useRouter } from 'next/navigation';

interface ApprovalGuardProps {
  user: {
    id: string;
    name: string;
    email: string | null;
    is_approved: boolean | null;
  };
  denialNotice?: {
    title: string;
    message: string;
  } | null;
}

export function ApprovalGuard({ user, denialNotice }: ApprovalGuardProps) {
  const router = useRouter();

  if (user.is_approved) return null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="approval-guard-overlay">
      <div className="approval-card">
        <div className="approval-icon-shell">
          <Clock className="approval-icon-clock" size={24} />
          <ShieldAlert className="approval-icon-shield" size={48} />
        </div>
        
        <h1 className="approval-title">{denialNotice ? denialNotice.title : 'Account Pending Approval'}</h1>
        
        <p className="approval-desc">
          {denialNotice ? (
            <>
              <strong>{user.name}</strong>, your access request was reviewed. {denialNotice.message}
            </>
          ) : (
            <>
              Welcome to the Outplex portal, <strong>{user.name}</strong>. 
              Your account is registered under <strong>{user.email}</strong>, but an administrator needs to verify your identity before you can access the dashboard.
            </>
          )}
        </p>
        
        <div className="approval-info-box">
          <div className="info-item">
            <strong>{denialNotice ? 'What can you do now?' : 'What happens next?'}</strong>
            <span>
              {denialNotice
                ? 'Please wait for IT or Moderator_A1 to update your access if needed, then sign in again.'
                : 'Our IT team (Moderator_A1 / Admin) will review your request. You will be able to access the portal once approved.'}
            </span>
          </div>
        </div>

        <button className="btn btn-ghost approval-logout-btn" onClick={handleLogout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>

      <style jsx>{`
        .approval-guard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #0b0d14;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          color: white;
        }

        .approval-card {
          width: 100%;
          max-width: 520px;
          background: #171d2d;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 2.5rem;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .approval-icon-shell {
          position: relative;
          width: fit-content;
          margin: 0 auto 1.5rem;
        }

        .approval-icon-shield {
          color: #7c6cff;
          filter: drop-shadow(0 0 15px rgba(124, 108, 255, 0.4));
        }

        .approval-icon-clock {
          position: absolute;
          top: -10px;
          right: -10px;
          background: #171d2d;
          border-radius: 50%;
          padding: 4px;
          color: #3b82f6;
          border: 2px solid #171d2d;
        }

        .approval-title {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
        }

        .approval-desc {
          color: #9ca3af;
          line-height: 1.6;
          font-size: 0.9375rem;
          margin-bottom: 2rem;
        }

        .approval-info-box {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 16px;
          padding: 1.25rem;
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-bottom: 2rem;
        }

        .info-item strong {
          display: block;
          font-size: 0.875rem;
          margin-bottom: 0.35rem;
          color: #e5e7eb;
        }

        .info-item span {
          font-size: 0.8125rem;
          color: #9ca3af;
          line-height: 1.5;
        }

        .approval-logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          height: 48px;
          border-radius: 12px;
          color: #9ca3af;
        }

        .approval-logout-btn:hover {
          color: #f87171;
          background: rgba(239, 68, 68, 0.08);
        }
      `}</style>
    </div>
  );
}
