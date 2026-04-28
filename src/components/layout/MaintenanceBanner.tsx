'use client';

import { useMemo, useState } from 'react';
import { X, Wrench } from 'lucide-react';
import { useAppAvailability } from '@/components/layout/AppAvailabilityProvider';

const DISMISS_KEY = 'outplex:maintenance-banner:dismissed';

export function MaintenanceBanner() {
  const { banner } = useAppAvailability();
  const message = banner.message?.trim() ?? '';

  const bannerId = useMemo(() => `${banner.active ? '1' : '0'}:${message}`, [banner.active, message]);
  const [dismissedBannerId, setDismissedBannerId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(DISMISS_KEY);
  });

  if (!banner.active || !message || dismissedBannerId === bannerId) {
    return null;
  }

  return (
    <div className="it-banner card" role="status" aria-live="polite">
      <div className="it-banner-icon">
        <Wrench size={16} />
      </div>
      <div className="it-banner-body">
        <div className="it-banner-title">Aviso de Mantenimiento</div>
        <div className="it-banner-message">{message}</div>
      </div>
      <button
        type="button"
        className="it-banner-close"
        aria-label="Cerrar aviso de mantenimiento"
        onClick={() => {
          if (typeof window === 'undefined') return;
          window.localStorage.setItem(DISMISS_KEY, bannerId);
          setDismissedBannerId(bannerId);
        }}
      >
        <X size={16} />
      </button>

      <style jsx>{`
        .it-banner {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          padding: 1rem 1.1rem;
          margin-bottom: var(--gap);
          border-radius: 18px;
          border: 1px solid rgba(251, 191, 36, 0.22);
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(109, 93, 252, 0.04));
          box-shadow: 0 18px 45px rgba(0,0,0,0.35);
          position: relative;
          overflow: hidden;
        }
        .it-banner::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 15% 15%, rgba(251,191,36,0.22), transparent 55%);
          opacity: 0.55;
          pointer-events: none;
        }
        .it-banner-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(251, 191, 36, 0.95);
          background: rgba(251, 191, 36, 0.12);
          border: 1px solid rgba(251, 191, 36, 0.22);
          flex-shrink: 0;
          position: relative;
          z-index: 1;
        }
        .it-banner-body {
          min-width: 0;
          position: relative;
          z-index: 1;
        }
        .it-banner-title {
          font-size: 0.8rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(251, 191, 36, 0.9);
          margin-bottom: 0.2rem;
        }
        .it-banner-message {
          color: rgba(226, 232, 240, 0.92);
          font-weight: 600;
          line-height: 1.45;
          font-size: 0.95rem;
          white-space: pre-wrap;
        }
        .it-banner-close {
          margin-left: auto;
          background: transparent;
          border: 0;
          color: rgba(148, 163, 184, 0.85);
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 10px;
          position: relative;
          z-index: 1;
          transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }
        .it-banner-close:hover {
          background: rgba(255,255,255,0.06);
          color: rgba(241, 245, 249, 0.95);
          transform: scale(1.03);
        }
      `}</style>
    </div>
  );
}
