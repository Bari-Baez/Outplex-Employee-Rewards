'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Download, Trophy } from 'lucide-react';
import { WHEEL_SPIN_MS } from '@backend/modules/raffles/domain/runtime';

interface CanvasRouletteProps {
  participants: { id: string; name: string }[];
  winnerId: string | null;
  spinToken?: string | null;
  downloadUrl?: string | null;
  allowDownload?: boolean;
  isClosed?: boolean;
  onSpinRecorded?: (payload: { spinToken: string; blob: Blob }) => void | Promise<void>;
  onSpinComplete?: (spinToken: string) => void | Promise<void>;
}

type WheelStage = 'idle' | 'countdown' | 'spinning' | 'celebrating';

const PRE_SPIN_SECONDS = [3, 2, 1] as const;
const POST_SPIN_FLASH_STEPS = 7;
const POST_SPIN_FLASH_MS = 240;
const COUNTDOWN_STEP_MS = 930;

function getCountdownTone(value: number | null) {
  if (value === 3) {
    return 'danger';
  }

  if (value === 2) {
    return 'warning';
  }

  if (value === 1) {
    return 'success';
  }

  return 'neutral';
}

export function CanvasRoulette({
  participants,
  winnerId,
  spinToken = null,
  downloadUrl = null,
  allowDownload = false,
  isClosed = false,
  onSpinRecorded,
  onSpinComplete,
}: CanvasRouletteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const completedSpinTokenRef = useRef<string | null>(null);
  const focusedParticipantIdRef = useRef<string | null>(null);
  const lastWinnerNameRef = useRef<string | null>(null);
  const pointerNameRef = useRef<string>('');
  const lastPointerUpdateRef = useRef(0);
  const spinTimersRef = useRef<number[]>([]);
  const rotationRef = useRef(0);

  const [wheelStage, setWheelStage] = useState<WheelStage>('idle');
  const [focusedParticipantId, setFocusedParticipantId] = useState<string | null>(null);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [flashStep, setFlashStep] = useState(0);
  const [pointerName, setPointerName] = useState('');

  const clearSpinTimers = useCallback(() => {
    spinTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    spinTimersRef.current = [];
  }, []);

  const updateFocusedParticipant = useCallback(
    (rotation: number) => {
      if (participants.length === 0) {
        if (focusedParticipantIdRef.current !== null) {
          focusedParticipantIdRef.current = null;
          setFocusedParticipantId(null);
        }
        return;
      }

      const sliceAngle = (2 * Math.PI) / participants.length;
      const normalizedRotation = ((-rotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
      const pointedIndex = Math.floor(normalizedRotation / sliceAngle) % participants.length;
      const pointedParticipantId = participants[pointedIndex]?.id ?? null;

      if (focusedParticipantIdRef.current !== pointedParticipantId) {
        focusedParticipantIdRef.current = pointedParticipantId;
        setFocusedParticipantId(pointedParticipantId);
      }
    },
    [participants],
  );

  const drawWheel = useCallback(
    (ctx: CanvasRenderingContext2D, rotation: number) => {
      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(centerX, centerY) - 18;

      ctx.clearRect(0, 0, width, height);

      if (participants.length === 0) {
        ctx.fillStyle = '#161a29';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#6b7280';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '20px Inter, sans-serif';
        ctx.fillText('No participants yet', centerX, centerY);
        return;
      }

      const sliceAngle = (2 * Math.PI) / participants.length;
      const labelStep =
        participants.length <= 24
          ? 1
          : participants.length <= 60
            ? Math.ceil(participants.length / 24)
            : participants.length <= 120
              ? Math.ceil(participants.length / 18)
              : Math.ceil(participants.length / 12);
      const labelFontSize =
        participants.length <= 24
          ? 16
          : participants.length <= 60
            ? 12
            : participants.length <= 120
              ? 10
              : 0;
      const maxLabelLength = participants.length <= 24 ? 18 : participants.length <= 60 ? 14 : 11;
      const palette = ['#4f46e5', '#6366f1', '#818cf8', '#c7d2fe'];

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);

      participants.forEach((participant, index) => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, radius, index * sliceAngle, (index + 1) * sliceAngle);
        ctx.fillStyle = palette[index % palette.length] ?? '#4f46e5';
        ctx.fill();
        ctx.lineWidth = participants.length > 80 ? 0.75 : 1.1;
        ctx.strokeStyle = 'rgba(17, 24, 39, 0.65)';
        ctx.stroke();

        if (labelFontSize > 0 && index % labelStep === 0) {
          ctx.save();
          ctx.rotate(index * sliceAngle + sliceAngle / 2);
          ctx.textAlign = 'right';
          ctx.fillStyle = index % palette.length === 3 ? '#312e81' : '#ffffff';
          ctx.font = `700 ${labelFontSize}px Inter, sans-serif`;
          const text =
            participant.name.length > maxLabelLength
              ? `${participant.name.slice(0, maxLabelLength - 1)}...`
              : participant.name;
          ctx.fillText(text, radius - 18, 4);
          ctx.restore();
        }
      });

      ctx.restore();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius - 3, 0, 2 * Math.PI);
      ctx.stroke();

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(centerX + radius + 10, centerY);
      ctx.lineTo(centerX + radius - 20, centerY - 15);
      ctx.lineTo(centerX + radius - 20, centerY + 15);
      ctx.fill();

      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 20, 0, 2 * Math.PI);
      ctx.fill();
    },
    [participants],
  );

  const completeSpin = useCallback(
    async (currentSpinToken: string) => {
      completedSpinTokenRef.current = currentSpinToken;
      setWheelStage('celebrating');
      setFlashStep(1);

      const confettiModule = await import('canvas-confetti').catch(() => null);
      confettiModule?.default({ particleCount: 180, spread: 92, origin: { y: 0.58 } });

      for (let index = 1; index <= POST_SPIN_FLASH_STEPS; index += 1) {
        spinTimersRef.current.push(
          window.setTimeout(() => {
            setFlashStep(index);
          }, POST_SPIN_FLASH_MS * index),
        );
      }

      spinTimersRef.current.push(
        window.setTimeout(() => {
          setWheelStage('idle');
          setFlashStep(0);

          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            return;
          }

          void onSpinComplete?.(currentSpinToken);
        }, POST_SPIN_FLASH_MS * (POST_SPIN_FLASH_STEPS + 1)),
      );
    },
    [onSpinComplete],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawWheel(ctx, rotationRef.current);

    const currentId = focusedParticipantIdRef.current;
    const hasCurrent = Boolean(currentId && participants.some((participant) => participant.id === currentId));

    if (participants.length === 0) {
      focusedParticipantIdRef.current = null;
      setFocusedParticipantId(null);
      return;
    }

    if (!hasCurrent) {
      focusedParticipantIdRef.current = participants[0]?.id ?? null;
      setFocusedParticipantId(participants[0]?.id ?? null);
      return;
    }

    updateFocusedParticipant(rotationRef.current);
  }, [drawWheel, participants, updateFocusedParticipant]);

  useEffect(() => {
    return () => {
      clearSpinTimers();
    };
  }, [clearSpinTimers]);

  useEffect(() => {
    if (!winnerId || !spinToken || participants.length === 0) return;
    if (wheelStage === 'countdown' || wheelStage === 'spinning') return;
    if (completedSpinTokenRef.current === spinToken) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }

    const winnerIndex = participants.findIndex((participant) => participant.id === winnerId);
    if (winnerIndex === -1) {
      return;
    }

    clearSpinTimers();
    setWheelStage('countdown');
    setCountdownValue(3);
    setFlashStep(0);

    const stream = canvas.captureStream(30);
    try {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        void (async () => {
          try {
            if (blob.size > 0) {
              await onSpinRecorded?.({ spinToken, blob });
            }
          } finally {
            await onSpinComplete?.(spinToken);
          }
        })();
      };
      mediaRecorder.start();
    } catch {
      mediaRecorderRef.current = null;
    }

    PRE_SPIN_SECONDS.forEach((value, index) => {
      spinTimersRef.current.push(
        window.setTimeout(() => {
          setCountdownValue(value);
        }, COUNTDOWN_STEP_MS * index),
      );
    });

    spinTimersRef.current.push(
      window.setTimeout(() => {
        setCountdownValue(null);
        setWheelStage('spinning');

        const sliceAngle = (2 * Math.PI) / participants.length;
        const targetBaseRotation = -(winnerIndex * sliceAngle + sliceAngle / 2);
        const totalRotation = targetBaseRotation - 10 * 2 * Math.PI;
        const duration = WHEEL_SPIN_MS;
        const start = performance.now();
        const easeOutQuart = (value: number) => 1 - Math.pow(1 - value, 4);

        const animate = (time: number) => {
          let progress = (time - start) / duration;
          if (progress > 1) {
            progress = 1;
          }

          const currentRotation = totalRotation * easeOutQuart(progress);
          rotationRef.current = currentRotation;
          drawWheel(ctx, currentRotation);
          updateFocusedParticipant(currentRotation);

          if (progress < 1) {
            requestAnimationFrame(animate);
            return;
          }

          void completeSpin(spinToken);
        };

        requestAnimationFrame(animate);
      }, COUNTDOWN_STEP_MS * PRE_SPIN_SECONDS.length),
    );
  }, [
    clearSpinTimers,
    completeSpin,
    drawWheel,
    onSpinComplete,
    onSpinRecorded,
    participants,
    spinToken,
    updateFocusedParticipant,
    wheelStage,
    winnerId,
  ]);

  const focusedParticipant =
    participants.find((participant) => participant.id === focusedParticipantId) ??
    participants[0] ??
    null;
  const winner = winnerId ? participants.find((p) => p.id === winnerId) ?? null : null;
  const showsRepresentativeLabels = participants.length > 24;
  const countdownTone = getCountdownTone(countdownValue);

  useEffect(() => {
    if (winner?.name) {
      lastWinnerNameRef.current = winner.name;
    }
  }, [winner?.name]);

  useEffect(() => {
    const shouldLockWinnerName =
      !isClosed &&
      Boolean(lastWinnerNameRef.current) &&
      (wheelStage === 'celebrating' || (wheelStage === 'idle' && completedSpinTokenRef.current === spinToken));

    const nextName = isClosed
      ? 'Sorteo finalizado'
      : wheelStage === 'countdown'
        ? 'Hidden until the spin begins'
        : shouldLockWinnerName
          ? (lastWinnerNameRef.current as string)
          : focusedParticipant?.name ?? 'Waiting for participants';

    if (wheelStage === 'spinning') {
      const now = performance.now();
      if (now - lastPointerUpdateRef.current < 90) {
        return;
      }
      lastPointerUpdateRef.current = now;
    } else {
      lastPointerUpdateRef.current = 0;
    }

    if (pointerNameRef.current !== nextName) {
      pointerNameRef.current = nextName;
      setPointerName(nextName);
    }
  }, [focusedParticipant?.name, isClosed, spinToken, wheelStage]);

  const celebrationClass = useMemo(() => {
    if (flashStep === 0) {
      return '';
    }

    const toneIndex = flashStep % 3;
    if (toneIndex === 1) return 'roulette-shell-flash-a';
    if (toneIndex === 2) return 'roulette-shell-flash-b';
    return 'roulette-shell-flash-c';
  }, [flashStep]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: '1rem',
        width: '100%',
      }}
    >
      <div
        className={`roulette-shell ${wheelStage === 'celebrating' ? celebrationClass : ''}`}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          aspectRatio: '1 / 1',
          margin: '0 auto',
          borderRadius: 24,
          padding: 16,
        }}
      >
        <canvas ref={canvasRef} width={560} height={560} style={{ width: '100%', height: '100%' }} />

        {wheelStage === 'countdown' && (
          <div className={`roulette-countdown-overlay roulette-countdown-${countdownTone}`}>
            <div className="roulette-countdown-caption">Spin starts in</div>
            <div key={countdownValue} className="roulette-countdown-number">
              {countdownValue}
            </div>
          </div>
        )}
      </div>

      <div
        className={`roulette-pointer-card ${wheelStage === 'countdown' ? 'roulette-pointer-card-hidden' : ''} ${isClosed ? 'roulette-pointer-card-closed' : ''}`}
      >
        <div className="roulette-pointer-top">
          <div className="roulette-pointer-label">Bajo el puntero</div>
          <span className={`roulette-pointer-pill ${isClosed ? 'roulette-pointer-pill-closed' : 'roulette-pointer-pill-open'}`}>
            <span className="roulette-pointer-pill-dot" aria-hidden="true" />
            {isClosed ? 'Cerrado' : 'Abierto'}
          </span>
        </div>

        <div className="roulette-pointer-name" aria-live="polite">
          {isClosed ? (
            <div className="roulette-ended">
              <span className="roulette-ended-icon" aria-hidden="true">
                <Trophy size={18} />
              </span>
              <div>
                <div className="roulette-ended-title">Sorteo finalizado</div>
                <div className="roulette-ended-sub">
                  {winner ? `Ganador: ${winner.name}` : "Gracias por participar. Revisa el resultado."}
                </div>
              </div>
            </div>
          ) : wheelStage === 'countdown' ? (
            <span className="roulette-pointer-muted">Hidden until the spin begins</span>
          ) : wheelStage === 'celebrating' ? (
            <span className="roulette-winner-text" aria-label={pointerName}>
              {pointerName.split('').map((char, index) => (
                <span
                  key={`${char}-${index}`}
                  className="roulette-winner-letter"
                  style={{ ['--i' as const]: index } as CSSProperties}
                >
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
            </span>
          ) : (
            <span key={pointerName} className={`roulette-name-swap ${wheelStage === 'spinning' ? 'roulette-name-spin' : ''}`}>
              {pointerName}
            </span>
          )}
        </div>

        <div className="roulette-pointer-meta">
          <span>{participants.length} participants loaded</span>
          {showsRepresentativeLabels && (
            <span className="roulette-pointer-sampled">
              {'\u2022'} wheel labels are sampled to keep large raffles readable
            </span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '1rem',
          minHeight: '40px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {(wheelStage === 'spinning' || wheelStage === 'celebrating') && (
          <span className="text-brand-primary-light flex items-center gap-2 font-bold animate-pulse">
            <span className="spinner-sm" />
            {wheelStage === 'celebrating' ? 'Winner locked in...' : 'Sorting fate...'}
          </span>
        )}

        {allowDownload && downloadUrl && (
          <a href={downloadUrl} className="btn btn-ghost">
            <Download size={15} />
            Download Video Proof
          </a>
        )}
      </div>

      <style>{`
        .roulette-shell {
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(15,23,42,0.25));
          border: 1px solid rgba(255,255,255,0.06);
          overflow: hidden;
          transition: background 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
        }

        .roulette-shell-flash-a {
          background: linear-gradient(145deg, rgba(16,185,129,0.22), rgba(99,102,241,0.16));
          box-shadow: 0 0 38px rgba(16,185,129,0.22);
        }

        .roulette-shell-flash-b {
          background: linear-gradient(145deg, rgba(234,179,8,0.22), rgba(99,102,241,0.16));
          box-shadow: 0 0 38px rgba(234,179,8,0.18);
        }

        .roulette-shell-flash-c {
          background: linear-gradient(145deg, rgba(244,63,94,0.2), rgba(99,102,241,0.18));
          box-shadow: 0 0 38px rgba(244,63,94,0.18);
        }

        .roulette-countdown-overlay {
          position: absolute;
          inset: 16px;
          border-radius: 20px;
          background: linear-gradient(180deg, rgba(13, 17, 34, 0.92), rgba(0, 0, 0, 0.72));
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 40px 90px rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(20px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          z-index: 2;
        }

        .roulette-countdown-caption {
          font-size: 0.82rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.72);
        }

        .roulette-countdown-number {
          min-width: 110px;
          text-align: center;
          font-size: clamp(4rem, 10vw, 6.2rem);
          line-height: 1;
          font-weight: 900;
          color: white;
          font-variant-numeric: tabular-nums;
          text-shadow:
            0 0 0 rgba(0,0,0,0.85),
            0 6px 24px rgba(0,0,0,0.5);
          animation: raffleBounceCountdown 0.72s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          padding: 0.4rem 1rem;
          border-radius: 28px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
        }

        .roulette-countdown-danger .roulette-countdown-number {
          background: linear-gradient(145deg, #ef4444, #991b1b);
        }

        .roulette-countdown-warning .roulette-countdown-number {
          background: linear-gradient(145deg, #facc15, #d97706);
        }

        .roulette-countdown-success .roulette-countdown-number {
          background: linear-gradient(145deg, #22c55e, #15803d);
        }

        .roulette-pointer-card {
          display: grid;
          gap: 0.45rem;
          padding: 1rem 1.05rem;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 26px 70px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(18px);
          transition: opacity 0.22s ease, transform 0.22s ease, border-color 0.25s ease, background 0.25s ease;
        }

        .roulette-pointer-card-hidden {
          opacity: 0.12;
          transform: translateY(6px);
        }

        .roulette-pointer-card-closed {
          background:
            radial-gradient(circle at 18% 22%, rgba(99,102,241,0.22), transparent 55%),
            radial-gradient(circle at 80% 24%, rgba(244,63,94,0.22), transparent 55%),
            rgba(255, 255, 255, 0.04);
          border-color: rgba(148, 163, 184, 0.2);
          box-shadow: 0 28px 84px rgba(0, 0, 0, 0.42);
        }

        .roulette-pointer-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }

        .roulette-pointer-label {
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        .roulette-pointer-card-closed .roulette-pointer-label {
          color: rgba(165, 180, 252, 0.95);
        }

        .roulette-pointer-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          flex-shrink: 0;
        }

        .roulette-pointer-pill-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          flex-shrink: 0;
        }

        .roulette-pointer-pill-open {
          color: rgba(52, 211, 153, 0.95);
          border-color: rgba(16, 185, 129, 0.26);
          background: rgba(16, 185, 129, 0.1);
        }

        .roulette-pointer-pill-open .roulette-pointer-pill-dot {
          background: rgba(52, 211, 153, 1);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.14);
        }

        .roulette-pointer-pill-closed {
          color: rgba(226, 232, 240, 0.92);
          border-color: rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.4);
        }

        .roulette-pointer-pill-closed .roulette-pointer-pill-dot {
          background: rgba(148, 163, 184, 0.9);
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.16);
        }

        .roulette-pointer-name {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text-primary);
          min-height: 1.4em;
        }

        .roulette-pointer-card-closed .roulette-pointer-name {
          color: rgba(241, 245, 249, 0.96);
        }

        .roulette-ended {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .roulette-ended-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, rgba(99,102,241,0.32), rgba(244,63,94,0.22));
          border: 1px solid rgba(255,255,255,0.14);
          color: rgba(241, 245, 249, 0.95);
          box-shadow: 0 12px 34px rgba(99,102,241,0.16);
          flex-shrink: 0;
        }

        .roulette-ended-title {
          font-weight: 900;
          letter-spacing: -0.01em;
          line-height: 1.25;
        }

        .roulette-ended-sub {
          margin-top: 0.2rem;
          color: rgba(148, 163, 184, 0.92);
          font-weight: 650;
          font-size: 0.86rem;
          line-height: 1.35;
        }

        .roulette-pointer-muted {
          color: var(--text-secondary);
          font-weight: 700;
        }

        .roulette-name-swap {
          display: inline-block;
          animation: rouletteNameIn 0.18s ease-out both;
        }

        .roulette-name-spin {
          animation: rouletteNameSpinIn 0.14s ease-out both;
        }

        @keyframes rouletteNameSpinIn {
          from { opacity: 0; transform: translateY(7px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes rouletteNameIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .roulette-winner-text {
          display: inline-flex;
          align-items: baseline;
          gap: 0.02em;
          background: linear-gradient(90deg, #a5b4fc, #34d399, #fbbf24);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          filter: drop-shadow(0 12px 28px rgba(99, 102, 241, 0.24));
        }

        .roulette-winner-letter {
          display: inline-block;
          animation: rouletteWinnerLetter 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          animation-delay: calc(var(--i) * 22ms);
        }

        @keyframes rouletteWinnerLetter {
          from { opacity: 0; transform: translateY(12px) rotate(6deg) scale(0.96); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0) rotate(0) scale(1); filter: blur(0); }
        }

        .roulette-pointer-meta {
          font-size: 0.82rem;
          color: var(--text-muted);
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
          line-height: 1.45;
        }

        .roulette-pointer-sampled {
          color: rgba(148, 163, 184, 0.85);
        }

        @keyframes raffleBounceCountdown {
          0% { transform: scale(0.74); opacity: 0; }
          55% { transform: scale(1.16); opacity: 1; }
          75% { transform: scale(0.96); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

