'use client';

import { useState } from 'react';
import { ShieldOff, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RevokedRoleGuardProps {
  userName: string;
}

export function RevokedRoleGuard({ userName }: RevokedRoleGuardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleAcknowledge() {
    setLoading(true);
    try {
      await fetch('/api/user/clear-revoke', { method: 'POST' });
      router.refresh();
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="revoke-overlay">
      <div className="revoke-card">
        <div className="revoke-icon-shell">
          <AlertTriangle size={16} className="revoke-warning-icon" />
          <ShieldOff size={52} className="revoke-main-icon" />
        </div>

        <h1 className="revoke-title">Your Access Has Changed</h1>

        <p className="revoke-desc">
          Hi <strong>{userName}</strong>, an administrator updated your access level.
          Your account is still active and you can continue using the platform, but you will need to
          confirm your department again before continuing.
        </p>

        <div className="revoke-info-box">
          <div className="revoke-info-item">
            <strong>What happens next?</strong>
            <span>
              After acknowledging this message, you will be redirected to select your department.
              If your role needs approval, a moderator will review it.
            </span>
          </div>
        </div>

        <button
          className="btn btn-primary revoke-cta-btn"
          onClick={handleAcknowledge}
          disabled={loading}
        >
          {loading ? 'Processing...' : 'I understand — Continue to Onboarding'}
        </button>
      </div>

      <style jsx>{`
        .revoke-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(11, 13, 20, 0.97);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          color: white;
          backdrop-filter: blur(8px);
        }

        .revoke-card {
          width: 100%;
          max-width: 520px;
          background: #171d2d;
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 24px;
          padding: 2.5rem;
          text-align: center;
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(239, 68, 68, 0.06);
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .revoke-icon-shell {
          position: relative;
          width: fit-content;
          margin: 0 auto 1.5rem;
        }

        .revoke-main-icon {
          color: #f87171;
          filter: drop-shadow(0 0 18px rgba(248, 113, 113, 0.35));
        }

        .revoke-warning-icon {
          position: absolute;
          top: -8px;
          right: -12px;
          background: #171d2d;
          border-radius: 50%;
          padding: 3px;
          color: #fbbf24;
          border: 2px solid #171d2d;
        }

        .revoke-title {
          font-size: 1.75rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin-bottom: 1rem;
          color: #fca5a5;
        }

        .revoke-desc {
          color: #9ca3af;
          line-height: 1.65;
          font-size: 0.9375rem;
          margin-bottom: 1.75rem;
        }

        .revoke-info-box {
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 16px;
          padding: 1.25rem;
          text-align: left;
          margin-bottom: 2rem;
        }

        .revoke-info-item strong {
          display: block;
          font-size: 0.875rem;
          margin-bottom: 0.4rem;
          color: #fca5a5;
        }

        .revoke-info-item span {
          font-size: 0.8125rem;
          color: #9ca3af;
          line-height: 1.55;
        }

        .revoke-cta-btn {
          width: 100%;
          height: 48px;
          border-radius: 12px;
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}
