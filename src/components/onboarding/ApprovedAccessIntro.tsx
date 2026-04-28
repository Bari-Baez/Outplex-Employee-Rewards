'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';

interface ApprovedAccessIntroProps {
  userId: string;
  userName: string;
}

export function ApprovedAccessIntro({ userId, userName }: ApprovedAccessIntroProps) {
  const storageKey = `outplex:access-approved-intro:${userId}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(storageKey) !== 'seen') {
      setOpen(true);
    }
  }, [storageKey]);

  if (!open) return null;

  const dismiss = () => {
    window.localStorage.setItem(storageKey, 'seen');
    setOpen(false);
  };

  return (
    <div className="approved-access-overlay">
      <div className="approved-access-card">
        <div className="approved-access-icon">
          <CheckCircle2 size={42} />
        </div>
        <h1>Access Approved</h1>
        <p>
          {userName}, your login was approved. Continue to complete your department and supervisor setup before using the platform.
        </p>
        <div className="approved-access-info">
          <ShieldCheck size={14} />
          <span>This message is shown only once.</span>
        </div>
        <button className="btn btn-primary" onClick={dismiss}>
          Continue
        </button>
      </div>

      <style jsx>{`
        .approved-access-overlay {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: rgba(9, 12, 20, 0.92);
          backdrop-filter: blur(10px);
        }

        .approved-access-card {
          width: 100%;
          max-width: 520px;
          border-radius: 24px;
          padding: 2.2rem;
          background: #171d2d;
          border: 1px solid rgba(52, 211, 153, 0.2);
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
          text-align: center;
          color: #fff;
        }

        .approved-access-icon {
          width: 84px;
          height: 84px;
          margin: 0 auto 1rem;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #34d399;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(52, 211, 153, 0.2);
        }

        h1 {
          margin: 0 0 0.8rem;
          font-size: 1.85rem;
          font-weight: 800;
        }

        p {
          margin: 0 0 1.25rem;
          color: #9ca3af;
          line-height: 1.6;
        }

        .approved-access-info {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          padding: 0.6rem 0.9rem;
          border-radius: 999px;
          color: #a7f3d0;
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(52, 211, 153, 0.14);
          font-size: 0.82rem;
          font-weight: 600;
        }

        button {
          width: 100%;
          height: 48px;
          border-radius: 12px;
        }
      `}</style>
    </div>
  );
}
