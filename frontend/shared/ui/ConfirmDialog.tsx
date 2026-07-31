'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@frontend/shared/ui/Dialog';

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
  const handleOpenChange = (open: boolean) => {
    if (!open && !busy) onCancel();
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        className={
          tone === 'danger'
            ? 'store-modal-card-danger border-[rgba(239,68,68,0.28)] shadow-[0_20px_55px_rgba(239,68,68,0.15)]'
            : undefined
        }
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <div className="store-modal-header mb-4">
          <DialogTitle asChild>
            <h3 style={{ margin: 0 }}>{title}</h3>
          </DialogTitle>
          <DialogDescription
            style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}
          >
            {body}
          </DialogDescription>
        </div>
        <div className="store-modal-actions flex flex-wrap justify-end gap-3">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${
              tone === 'danger'
                ? 'btn-danger bg-[rgba(239,68,68,0.9)] px-5 py-2.5 text-sm text-white'
                : 'btn-primary'
            }`}
            onClick={() => void onConfirm()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
