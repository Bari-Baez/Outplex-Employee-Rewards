'use client';

import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react';
import type { TransferState } from '@frontend/shared/hooks/useTransferState';

export function TransferProgress({
  state,
  compact = false,
}: {
  state: TransferState;
  compact?: boolean;
}) {
  if (state.phase === 'idle') {
    return null;
  }

  const height = compact ? 8 : 10;

  return (
    <div className={`transfer-shell ${compact ? 'transfer-shell-compact' : ''}`}>
      <div className="transfer-row">
        <div className="transfer-icon">
          {state.phase === 'working' ? (
            <Loader2 size={16} className="spinning" />
          ) : state.phase === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <XCircle size={16} />
          )}
        </div>

        <div className="transfer-meta">
          <div className="transfer-label">
            {state.phase === 'working'
              ? 'Working...'
              : state.phase === 'success'
                ? 'Done'
                : 'Failed'}
          </div>
          {state.message ? <div className="transfer-message">{state.message}</div> : null}
        </div>

        {typeof state.progress === 'number' ? (
          <div className="transfer-pct">{state.progress}%</div>
        ) : state.phase === 'working' ? (
          <div className="transfer-pct">
            <UploadCloud size={16} />
          </div>
        ) : null}
      </div>

      <div className="transfer-bar" style={{ height }}>
        <div
          className={`transfer-fill transfer-fill-${state.phase}`}
          style={{ width: typeof state.progress === 'number' ? `${state.progress}%` : state.phase === 'working' ? '40%' : '100%' }}
        />
      </div>

      <style jsx>{`
        .transfer-shell {
          width: 100%;
          display: grid;
          gap: 0.55rem;
          padding: 0.75rem 0.85rem;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));
          backdrop-filter: blur(14px);
          box-shadow: 0 18px 45px rgba(0,0,0,0.35);
        }
        .transfer-shell-compact {
          padding: 0.55rem 0.7rem;
          border-radius: 14px;
        }
        .transfer-row {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }
        .transfer-icon {
          width: 32px;
          height: 32px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(109, 93, 252, 0.16);
          border: 1px solid rgba(109, 93, 252, 0.22);
          color: rgba(241,245,249,0.96);
          flex-shrink: 0;
        }
        .transfer-meta {
          min-width: 0;
          flex: 1;
        }
        .transfer-label {
          font-weight: 900;
          letter-spacing: -0.01em;
          font-size: 0.9rem;
        }
        .transfer-message {
          margin-top: 0.1rem;
          font-size: 0.78rem;
          color: rgba(148, 163, 184, 0.95);
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .transfer-pct {
          font-weight: 900;
          color: rgba(226,232,240,0.9);
          font-size: 0.85rem;
          min-width: 42px;
          display: inline-flex;
          justify-content: flex-end;
          align-items: center;
          gap: 0.35rem;
        }
        .transfer-bar {
          width: 100%;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.45);
          border: 1px solid rgba(255,255,255,0.08);
          overflow: hidden;
        }
        .transfer-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 180ms ease;
          background: linear-gradient(90deg, rgba(109,93,252,0.95), rgba(59,130,246,0.8));
        }
        .transfer-fill-success {
          background: linear-gradient(90deg, rgba(16,185,129,0.95), rgba(34,197,94,0.8));
        }
        .transfer-fill-error {
          background: linear-gradient(90deg, rgba(239,68,68,0.95), rgba(248,113,113,0.8));
        }
      `}</style>
    </div>
  );
}
