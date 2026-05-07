'use client';

import { useRef, useState } from 'react';

interface PromptDialogProps {
  title: string;
  body?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => Promise<void> | void;
  onCancel: () => void;
  busy?: boolean;
  required?: boolean;
  error?: string | null;
}

export function PromptDialog({
  title,
  body,
  placeholder = '',
  confirmLabel = 'Submit',
  onConfirm,
  onCancel,
  busy = false,
  required = false,
  error,
}: PromptDialogProps) {
  const [value, setValue] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleConfirm = () => {
    if (required && !value.trim()) {
      inputRef.current?.focus();
      return;
    }
    void onConfirm(value.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div
        ref={cardRef}
        className="store-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="store-modal-header">
          <h3 style={{ margin: 0 }}>{title}</h3>
          {body && (
            <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {body}
            </p>
          )}
          <input
            ref={inputRef}
            type="text"
            className="form-input"
            style={{ marginTop: '0.75rem', width: '100%', borderColor: error ? 'rgba(239,68,68,0.5)' : undefined }}
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={busy}
            autoFocus
          />
          {error && (
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#fca5a5', fontWeight: 600 }}>{error}</p>
          )}
        </div>
        <div className="store-modal-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={busy || (required && !value.trim())}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
