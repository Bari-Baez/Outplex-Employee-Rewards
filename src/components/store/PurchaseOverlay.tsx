'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { X } from 'lucide-react';

type OverlayPhase = 'processing' | 'success';

export function PurchaseOverlay({
  open,
  phase,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  phase: OverlayPhase;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const hasFiredConfettiRef = useRef(false);
  const successIconRef = useRef<HTMLDivElement | null>(null);
  const [mounted] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    if (!open) {
      hasFiredConfettiRef.current = false;
      return;
    }

    if (phase !== 'success' || hasFiredConfettiRef.current) {
      return;
    }

    hasFiredConfettiRef.current = true;
    const t = window.setTimeout(() => {
      const rect = successIconRef.current?.getBoundingClientRect();
      const origin = rect
        ? {
            x: (rect.left + rect.width / 2) / Math.max(window.innerWidth, 1),
            y: (rect.top + rect.height / 2) / Math.max(window.innerHeight, 1),
          }
        : { x: 0.5, y: 0.35 };
      confetti({
        particleCount: 130,
        spread: 72,
        origin,
        startVelocity: 42,
        ticks: 240,
        zIndex: 2600,
      });
    }, 1250);

    return () => window.clearTimeout(t);
  }, [open, phase]);

  const ariaLabel = useMemo(() => {
    if (phase === 'processing') return 'Processing purchase';
    return 'Purchase completed';
  }, [phase]);

  if (!open || !mounted) return null;

  const overlay = (
    <div
      className={`po-overlay ${phase === 'success' ? 'po-overlay-success' : ''}`}
      role="dialog"
      aria-label={ariaLabel}
      aria-live="polite"
    >
      <div className={`po-card ${phase === 'success' ? 'po-card-success' : ''}`}>
        {onClose && (
          <button type="button" className="po-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        )}

        <div className="po-hero">
          {phase === 'processing' ? (
            <div className="po-preloader" aria-hidden="true">
              <svg className="po-cart" viewBox="0 0 128 128" width="128" height="128" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="8">
                  <g className="po-cart-track">
                    <polyline points="4,4 21,4 26,22 124,22 112,64 35,64 39,80 106,80" />
                    <circle cx="43" cy="111" r="13" />
                    <circle cx="102" cy="111" r="13" />
                  </g>
                  <g className="po-cart-lines" stroke="currentColor">
                    <polyline className="po-cart-top" points="4,4 21,4 26,22 124,22 112,64 35,64 39,80 106,80" strokeDasharray="338 338" strokeDashoffset="-338" />
                    <g className="po-cart-wheel1" transform="rotate(-90,43,111)">
                      <circle className="po-cart-wheel-stroke" cx="43" cy="111" r="13" strokeDasharray="81.68 81.68" strokeDashoffset="81.68" />
                    </g>
                    <g className="po-cart-wheel2" transform="rotate(90,102,111)">
                      <circle className="po-cart-wheel-stroke" cx="102" cy="111" r="13" strokeDasharray="81.68 81.68" strokeDashoffset="81.68" />
                    </g>
                  </g>
                </g>
              </svg>
            </div>
          ) : (
            <div className="po-success" aria-hidden="true" ref={successIconRef}>
              <svg className="po-spinner" viewBox="0 0 48 48">
                <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4">
                  <circle className="po-worm" cx="24" cy="24" r="22" strokeDasharray="138.23 138.23" strokeDashoffset="-51.84" transform="rotate(-119 24 24)" />
                  <path className="po-check" d="M 17 25 L 22 30 C 22 30 32.2 19.8 37.3 14.7 C 41.8 10.2 39 7.9 39 7.9" strokeDasharray="36.7 36.7" strokeDashoffset="-36.7" />
                </g>
              </svg>
              <div className="po-success-glow" />
            </div>
          )}
        </div>

        <div className="po-copy">
          <div className="po-title">{title}</div>
          {subtitle && <div className="po-subtitle">{subtitle}</div>}
        </div>

        {children && <div className="po-extra">{children}</div>}
      </div>

      <style jsx>{`
        .po-overlay {
          position: fixed;
          inset: 0;
          z-index: 2400;
          display: grid;
          place-items: center;
          padding: 1.5rem;
          background:
            radial-gradient(circle at 30% 20%, rgba(124, 108, 255, 0.12), transparent 55%),
            radial-gradient(circle at 70% 30%, rgba(16, 185, 129, 0.12), transparent 55%),
            rgba(0, 0, 0, 0.88);
          backdrop-filter: blur(14px);
        }

        .po-card {
          width: min(620px, 100%);
          border-radius: 26px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(12, 15, 30, 0.86);
          box-shadow: 0 46px 140px rgba(0, 0, 0, 0.75);
          padding: 1.75rem 1.6rem 1.4rem;
          position: relative;
          overflow: hidden;
          transform: translateY(0);
          transition: transform 0.28s ease;
        }

        .po-card-success {
          transform: translateY(26px);
        }

        .po-card::before {
          content: '';
          position: absolute;
          inset: -40%;
          background: conic-gradient(
            from 210deg,
            rgba(34, 211, 238, 0) 0deg,
            rgba(99, 102, 241, 0.22) 110deg,
            rgba(16, 185, 129, 0.26) 220deg,
            rgba(34, 211, 238, 0) 360deg
          );
          filter: blur(50px);
          opacity: 0.3;
          animation: poSpin 4.6s linear infinite;
          pointer-events: none;
        }

        @keyframes poSpin {
          to { transform: rotate(360deg); }
        }

        .po-close {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          color: rgba(226, 232, 240, 0.8);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
          z-index: 2;
        }

        .po-close:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(241, 245, 249, 0.95);
          transform: translateY(-1px);
        }

        .po-hero {
          display: grid;
          place-items: center;
          padding: 0.5rem 0 0.25rem;
          position: relative;
          z-index: 1;
        }

        .po-cart {
          width: 7.5rem;
          height: 7.5rem;
          color: rgba(165, 180, 252, 0.9);
        }

        .po-cart-lines,
        .po-cart-top,
        .po-cart-wheel1,
        .po-cart-wheel2,
        .po-cart-wheel-stroke {
          animation: poCartLines 2s ease-in-out infinite;
        }

        .po-cart-top { animation-name: poCartTop; }
        .po-cart-wheel1 { animation-name: poCartWheel1; transform-origin: 43px 111px; }
        .po-cart-wheel2 { animation-name: poCartWheel2; transform-origin: 102px 111px; }
        .po-cart-wheel-stroke { animation-name: poCartWheelStroke; }

        .po-cart-track {
          stroke: rgba(226, 232, 240, 0.12);
        }

        @keyframes poCartLines {
          from, to { opacity: 0; }
          8%, 92% { opacity: 1; }
        }
        @keyframes poCartTop {
          from { stroke-dashoffset: -338; }
          50% { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 338; }
        }
        @keyframes poCartWheel1 {
          from { transform: rotate(-0.25turn); }
          to { transform: rotate(2.75turn); }
        }
        @keyframes poCartWheel2 {
          from { transform: rotate(0.25turn); }
          to { transform: rotate(3.25turn); }
        }
        @keyframes poCartWheelStroke {
          from, to { stroke-dashoffset: 81.68; }
          50% { stroke-dashoffset: 40.84; }
        }

        .po-success {
          position: relative;
          display: grid;
          place-items: center;
          width: 7.5rem;
          height: 7.5rem;
          color: rgba(34, 197, 94, 0.95);
          filter: drop-shadow(0 18px 42px rgba(16, 185, 129, 0.22));
          animation: poPop 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes poPop {
          from { transform: scale(0.86); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .po-spinner {
          width: 6.5rem;
          height: 6.5rem;
          overflow: visible;
        }

        .po-worm { animation: poWorm 1.65s linear forwards; transform-origin: 24px 24px; }
        .po-check { animation: poCheck 1.65s cubic-bezier(0.16, 1, 0.3, 1) forwards; transform-origin: 24px 24px; }

        @keyframes poWorm {
          0% { stroke-dashoffset: -51.84; transform: rotate(-119deg); opacity: 1; }
          64% { stroke-dashoffset: -51.84; transform: rotate(961deg); opacity: 1; }
          100% { stroke-dashoffset: -138.23; transform: rotate(961deg); opacity: 0; }
        }

        @keyframes poCheck {
          0%, 52% { stroke-dashoffset: -36.7; opacity: 0; transform: scale(0.98); }
          72% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 1; transform: scale(1); }
        }

        .po-success-glow {
          position: absolute;
          inset: -60%;
          background: radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.28), transparent 60%);
          filter: blur(30px);
          opacity: 0.7;
          pointer-events: none;
        }

        .po-copy {
          text-align: center;
          position: relative;
          z-index: 1;
          margin-top: 0.6rem;
        }

        .po-title {
          font-size: 1.25rem;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: rgba(241, 245, 249, 0.96);
        }

        .po-subtitle {
          margin-top: 0.35rem;
          color: rgba(148, 163, 184, 0.9);
          font-size: 0.95rem;
          line-height: 1.55;
        }

        .po-extra {
          margin-top: 1.1rem;
          position: relative;
          z-index: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .po-card::before,
          .po-worm,
          .po-check,
          .po-cart-lines,
          .po-cart-top,
          .po-cart-wheel1,
          .po-cart-wheel2,
          .po-cart-wheel-stroke {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
}
