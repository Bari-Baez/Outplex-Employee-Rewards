'use client';

import { useEffect } from 'react';
import { CheckCircle2, ShoppingCart } from 'lucide-react';

export function CheckoutCompletionAnimation({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onDone, 1700);
    return () => window.clearTimeout(t);
  }, [onDone, open]);

  if (!open) return null;

  return (
    <div className="cca-overlay" role="status" aria-live="polite">
      <div className="cca-stage">
        <div className="cca-cart" aria-hidden="true">
          <ShoppingCart size={54} />
          <span className="cca-trail" />
          <span className="cca-trail cca-trail-2" />
        </div>
        <div className="cca-check" aria-hidden="true">
          <CheckCircle2 size={62} />
        </div>
        <div className="cca-label">
          <div className="cca-title">Processing complete</div>
          <div className="cca-sub">Your order is locked in.</div>
        </div>
      </div>

      <style jsx>{`
        .cca-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at 30% 20%, rgba(124, 108, 255, 0.08), transparent 50%),
            rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(12px);
        }
        .cca-stage {
          width: min(520px, calc(100vw - 2rem));
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.7);
          box-shadow: 0 40px 110px rgba(0, 0, 0, 0.75);
          padding: 2.25rem 2rem;
          display: grid;
          justify-items: center;
          gap: 1.25rem;
          overflow: hidden;
          position: relative;
        }
        .cca-stage::before {
          content: '';
          position: absolute;
          inset: -40%;
          background: conic-gradient(from 210deg, rgba(34, 211, 238, 0) 0deg, rgba(34, 211, 238, 0.22) 110deg, rgba(16, 185, 129, 0.3) 220deg, rgba(124, 108, 255, 0) 360deg);
          filter: blur(40px);
          opacity: 0.35;
          animation: cca-spin 2.2s linear infinite;
          pointer-events: none;
        }
        @keyframes cca-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .cca-cart {
          color: #e2e8f0;
          position: relative;
          animation: cca-cart-fly 1.05s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          filter: drop-shadow(0 16px 34px rgba(0, 0, 0, 0.6));
        }
        @keyframes cca-cart-fly {
          0% {
            transform: translateX(-180px) translateY(10px) rotate(-15deg) scale(0.8);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          40% {
            transform: translateX(0) translateY(0) rotate(0deg) scale(1.1);
          }
          100% {
            transform: translateX(300px) translateY(-50px) rotate(20deg) scale(0.7);
            opacity: 0;
          }
        }
        .cca-trail {
          position: absolute;
          left: -140px;
          top: 50%;
          transform: translateY(-50%);
          width: 140px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(34, 211, 238, 0), rgba(34, 211, 238, 0.75), rgba(124, 108, 255, 0));
          opacity: 0;
          animation: cca-trail 1.05s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .cca-trail-2 {
          height: 1px;
          top: calc(50% + 9px);
          opacity: 0;
          background: linear-gradient(90deg, rgba(16, 185, 129, 0), rgba(16, 185, 129, 0.65), rgba(34, 211, 238, 0));
          animation-delay: 0.04s;
        }
        @keyframes cca-trail {
          0% {
            opacity: 0;
            transform: translateY(-50%) scaleX(0.2);
          }
          18% {
            opacity: 0.9;
            transform: translateY(-50%) scaleX(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-50%) scaleX(0.9);
          }
        }
        .cca-check {
          color: #34d399;
          opacity: 0;
          transform: scale(0.2);
          animation: cca-check-pop 0.55s 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          filter: drop-shadow(0 16px 34px rgba(16, 185, 129, 0.35));
        }
        @keyframes cca-check-pop {
          0% {
            opacity: 0;
            transform: scale(0.25);
          }
          60% {
            opacity: 1;
            transform: scale(1.12);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
        .cca-label {
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .cca-title {
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .cca-sub {
          margin-top: 0.35rem;
          color: rgba(148, 163, 184, 0.92);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}

