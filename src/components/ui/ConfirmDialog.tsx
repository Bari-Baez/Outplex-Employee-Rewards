'use client';

import { useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
  busy?: boolean;
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = 'default',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="modal-overlay"
      onClick={() => !busy && onCancel()}
    >
      <div
        ref={cardRef}
        className={`store-modal-card ${tone === 'danger' ? 'store-modal-card-danger' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="store-modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
            {body}
          </p>
        </div>
        <div className="store-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
