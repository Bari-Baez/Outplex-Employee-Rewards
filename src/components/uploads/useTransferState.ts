'use client';

import { useCallback, useMemo, useRef, useState } from 'react';

export type TransferPhase = 'idle' | 'working' | 'success' | 'error';

export type TransferState = {
  phase: TransferPhase;
  progress: number | null;
  message: string | null;
};

export function useTransferState({
  resetAfterMs = 1500,
}: {
  resetAfterMs?: number;
} = {}) {
  const [state, setState] = useState<TransferState>({ phase: 'idle', progress: null, message: null });
  const resetTimeoutRef = useRef<number | null>(null);

  const clearReset = useCallback(() => {
    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearReset();
    setState({ phase: 'idle', progress: null, message: null });
  }, [clearReset]);

  const scheduleReset = useCallback(() => {
    clearReset();
    resetTimeoutRef.current = window.setTimeout(() => {
      resetTimeoutRef.current = null;
      setState({ phase: 'idle', progress: null, message: null });
    }, resetAfterMs);
  }, [clearReset, resetAfterMs]);

  const start = useCallback((message?: string) => {
    clearReset();
    setState({ phase: 'working', progress: 0, message: message ?? null });
  }, [clearReset]);

  const setProgress = useCallback((progress: number) => {
    setState((current) => {
      if (current.phase !== 'working') return current;
      const next = Math.max(0, Math.min(100, Math.round(progress)));
      return { ...current, progress: next };
    });
  }, []);

  const setMessage = useCallback((message: string | null) => {
    setState((current) => {
      if (current.phase === 'idle') return current;
      return { ...current, message };
    });
  }, []);

  const succeed = useCallback((message?: string) => {
    setState({ phase: 'success', progress: 100, message: message ?? null });
    scheduleReset();
  }, [scheduleReset]);

  const fail = useCallback((message?: string) => {
    setState({ phase: 'error', progress: null, message: message ?? null });
    scheduleReset();
  }, [scheduleReset]);

  return useMemo(
    () => ({
      state,
      start,
      setProgress,
      setMessage,
      succeed,
      fail,
      reset,
    }),
    [state, start, setProgress, setMessage, succeed, fail, reset],
  );
}
