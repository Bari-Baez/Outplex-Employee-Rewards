'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TimePickerProps {
  time?: string; // HH:mm
  onTimeChange: (time: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
  variant?: string;
}

export function ModernTimePicker({
  time,
  onTimeChange,
  label,
  className,
  disabled,
  variant
}: TimePickerProps) {
  const [hours, setHours] = React.useState('12');
  const [minutes, setMinutes] = React.useState('00');
  const [ampm, setAmpm] = React.useState('AM');
  const [editingH, setEditingH] = React.useState(false);
  const [editingM, setEditingM] = React.useState(false);
  const [rawH, setRawH] = React.useState('');
  const [rawM, setRawM] = React.useState('');

  React.useEffect(() => {
    if (time) {
      const [h, m] = time.split(':');
      const hNum = parseInt(h, 10);
      const isPm = hNum >= 12;
      setAmpm(isPm ? 'PM' : 'AM');
      const h12 = hNum % 12 || 12;
      setHours(String(h12).padStart(2, '0'));
      setMinutes((m ?? '00').padStart(2, '0'));
    }
  }, [time]);

  const commit = (h: string, m: string, ap: string) => {
    let hNum = parseInt(h, 10);
    if (isNaN(hNum) || hNum < 1) hNum = 12;
    if (hNum > 12) hNum = 12;
    if (ap === 'PM' && hNum < 12) hNum += 12;
    if (ap === 'AM' && hNum === 12) hNum = 0;
    let mNum = parseInt(m, 10);
    if (isNaN(mNum) || mNum < 0) mNum = 0;
    if (mNum > 59) mNum = 59;
    onTimeChange(`${String(hNum).padStart(2, '0')}:${String(mNum).padStart(2, '0')}`);
  };

  const finishHour = (raw: string) => {
    let hNum = parseInt(raw, 10);
    if (isNaN(hNum) || hNum < 1) hNum = 12;
    if (hNum > 12) hNum = 12;
    const val = String(hNum).padStart(2, '0');
    setHours(val);
    setEditingH(false);
    commit(val, minutes, ampm);
  };

  const finishMinutes = (raw: string) => {
    let mNum = parseInt(raw, 10);
    if (isNaN(mNum) || mNum < 0) mNum = 0;
    if (mNum > 59) mNum = 59;
    const val = String(mNum).padStart(2, '0');
    setMinutes(val);
    setEditingM(false);
    commit(hours, val, ampm);
  };

  const toggleAmpm = () => {
    const next = ampm === 'AM' ? 'PM' : 'AM';
    setAmpm(next);
    commit(hours, minutes, next);
  };

  const sharedInputClass =
    'w-8 h-full text-center rounded-lg text-sm font-mono font-bold text-[var(--text-primary)] bg-transparent border-none outline-none focus:bg-[var(--bg-hover)] transition-colors disabled:cursor-not-allowed';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label className="text-xs font-medium text-[var(--text-muted)] ml-1">{label}</label>}

      <div
        className={cn(
          'flex h-10 w-fit items-center gap-0.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-1 transition-all hover:border-[var(--border-strong)] hover:shadow-sm',
          disabled && 'opacity-50 pointer-events-none cursor-not-allowed',
        )}
      >
        <div className="flex items-center px-1.5 opacity-40">
          <Clock size={14} />
        </div>

        {/* Hours */}
        {editingH ? (
          <input
            autoFocus
            type="number"
            min={1}
            max={12}
            value={rawH}
            onChange={(e) => setRawH(e.target.value)}
            onBlur={() => finishHour(rawH)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') finishHour(rawH);
              if (e.key === 'Escape') setEditingH(false);
            }}
            className={sharedInputClass}
            style={{ width: '2.4rem' }}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onDoubleClick={() => { setRawH(hours); setEditingH(true); }}
            onClick={() => {
              const next = (parseInt(hours, 10) % 12) + 1;
              const val = String(next).padStart(2, '0');
              setHours(val);
              commit(val, minutes, ampm);
            }}
            title="Click to cycle · Double-click to type"
            className="px-2 h-full rounded-lg hover:bg-[var(--bg-hover)] text-sm font-mono font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed select-none"
          >
            {hours}
          </button>
        )}

        <span className="text-[var(--text-muted)] opacity-50 font-mono">:</span>

        {/* Minutes */}
        {editingM ? (
          <input
            autoFocus
            type="number"
            min={0}
            max={59}
            value={rawM}
            onChange={(e) => setRawM(e.target.value)}
            onBlur={() => finishMinutes(rawM)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Tab') finishMinutes(rawM);
              if (e.key === 'Escape') setEditingM(false);
            }}
            className={sharedInputClass}
            style={{ width: '2.4rem' }}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onDoubleClick={() => { setRawM(minutes); setEditingM(true); }}
            onClick={() => {
              const next = (parseInt(minutes, 10) + 1) % 60;
              const val = String(next).padStart(2, '0');
              setMinutes(val);
              commit(hours, val, ampm);
            }}
            title="Click to cycle · Double-click to type"
            className="px-2 h-full rounded-lg hover:bg-[var(--bg-hover)] text-sm font-mono font-bold text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed select-none"
          >
            {minutes}
          </button>
        )}

        <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />

        <button
          type="button"
          onClick={toggleAmpm}
          disabled={disabled}
          className={cn(
            'px-2 h-full rounded-lg text-[10px] font-bold uppercase transition-all disabled:cursor-not-allowed',
            ampm === 'AM' ? 'text-[var(--brand-primary-light)]' : 'text-[var(--brand-accent-light)]',
            'hover:bg-[var(--bg-hover)]',
          )}
        >
          {ampm}
        </button>
      </div>
    </div>
  );
}
