'use client';

import { useId, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@frontend/shared/ui/Dialog';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const errorId = useId();

  const handleConfirm = () => {
    if (required && !value.trim()) {
      inputRef.current?.focus();
      return;
    }
    void onConfirm(value.trim());
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleConfirm();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !busy) onCancel();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="store-modal-header mb-4">
            <DialogTitle asChild>
              <h3 style={{ margin: 0 }}>{title}</h3>
            </DialogTitle>
            {body && (
              <DialogDescription
                style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}
              >
                {body}
              </DialogDescription>
            )}
            {!body && (
              <DialogDescription className="sr-only">
                Enter the requested information, then submit the form.
              </DialogDescription>
            )}
            <label className="sr-only" htmlFor={inputId}>
              {title}
            </label>
            <input
              id={inputId}
              ref={inputRef}
              type="text"
              className="form-input input"
              style={{ marginTop: '0.75rem', width: '100%', borderColor: error ? 'rgba(239,68,68,0.5)' : undefined }}
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              required={required}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p
                id={errorId}
                role="alert"
                style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#fca5a5', fontWeight: 600 }}
              >
                {error}
              </p>
            )}
          </div>
          <div className="store-modal-actions flex flex-wrap justify-end gap-3">
            <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || (required && !value.trim())}
              aria-busy={busy}
            >
              {busy ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
