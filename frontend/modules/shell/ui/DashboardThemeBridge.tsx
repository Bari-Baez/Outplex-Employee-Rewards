'use client';

import { useLayoutEffect } from 'react';

const STORAGE_KEY = 'app-theme';
const DARK_CLASS = 'dashboard-dark';
const ANIM_CLASS = 'dashboard-theme-anim';

function readTheme(): 'light' | 'dark' {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function DashboardThemeBridge() {
  useLayoutEffect(() => {
    const apply = (theme: 'light' | 'dark') => {
      document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark');
    };

    apply(readTheme());

    const handleThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ theme?: string; animate?: boolean }>).detail;
      const theme = detail?.theme === 'dark' ? 'dark' : 'light';
      const animate = detail?.animate === true;

      if (animate) {
        document.documentElement.classList.add(ANIM_CLASS);
        window.setTimeout(() => document.documentElement.classList.remove(ANIM_CLASS), 480);
      }

      apply(theme);
    };

    window.addEventListener('outplex-theme', handleThemeEvent as EventListener);

    return () => {
      window.removeEventListener('outplex-theme', handleThemeEvent as EventListener);
      // Ensure login / non-dashboard routes always render the normal theme.
      document.documentElement.classList.remove(DARK_CLASS);
      document.documentElement.classList.remove(ANIM_CLASS);
    };
  }, []);

  return null;
}

