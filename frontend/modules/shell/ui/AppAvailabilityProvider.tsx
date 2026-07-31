'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { MaintenanceBannerState, SectionAvailabilityMap, ToolAvailabilityMap } from '@backend/modules/shell/contracts/availability';
import { TOOL_KEYS, type ToolKey } from '@backend/modules/shell/domain/tools-catalog';
import { getToolSectionId } from '@backend/modules/shell/domain/tool-sections-catalog';

type AvailabilityContextValue = {
  tools: ToolAvailabilityMap;
  sections: SectionAvailabilityMap;
  banner: MaintenanceBannerState;
  refresh: () => Promise<void>;
  isToolEnabled: (toolKey: ToolKey, opts?: { bypassForAdmin?: boolean; userRole?: string }) => boolean;
  isSectionEnabled: (
    toolKey: ToolKey,
    sectionKey: string,
    opts?: { bypassForAdmin?: boolean; userRole?: string },
  ) => boolean;
};

const AvailabilityContext = createContext<AvailabilityContextValue | null>(null);

function buildDefaults(): ToolAvailabilityMap {
  return Object.fromEntries(TOOL_KEYS.map((key) => [key, true])) as ToolAvailabilityMap;
}

export function AppAvailabilityProvider({
  initialTools,
  initialSections,
  initialBanner,
  children,
}: {
  initialTools?: ToolAvailabilityMap;
  initialSections?: SectionAvailabilityMap;
  initialBanner?: MaintenanceBannerState;
  children: React.ReactNode;
}) {
  const [tools, setTools] = useState<ToolAvailabilityMap>(() => initialTools ?? buildDefaults());
  const [sections, setSections] = useState<SectionAvailabilityMap>(() => initialSections ?? {});
  const [banner, setBanner] = useState<MaintenanceBannerState>(() => initialBanner ?? { active: false, message: '' });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/tools', { method: 'GET' });
      const data = (await response.json()) as {
        tools?: ToolAvailabilityMap;
        sections?: SectionAvailabilityMap;
        banner?: MaintenanceBannerState;
        error?: string;
      };

      if (!response.ok || !data.tools || !data.banner || !data.sections) {
        return;
      }

      setTools(data.tools);
      setSections(data.sections);
      setBanner(data.banner);
    } catch {
      // ignore transient refresh failures
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };

    window.addEventListener('outplex-tools-updated', handler as EventListener);
    const interval = window.setInterval(() => void refresh(), 30_000);

    return () => {
      window.removeEventListener('outplex-tools-updated', handler as EventListener);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const isToolEnabled = useCallback(
    (toolKey: ToolKey, opts?: { bypassForAdmin?: boolean; userRole?: string }) => {
      const bypass = opts?.bypassForAdmin !== false;
      const userRole = opts?.userRole;
      if (bypass && userRole === 'admin') return true;
      return tools[toolKey] !== false;
    },
    [tools],
  );

  const isSectionEnabled = useCallback(
    (toolKey: ToolKey, sectionKey: string, opts?: { bypassForAdmin?: boolean; userRole?: string }) => {
      const bypass = opts?.bypassForAdmin !== false;
      const userRole = opts?.userRole;
      if (bypass && userRole === 'admin') return true;
      if (tools[toolKey] === false) return false;
      const id = getToolSectionId(toolKey, sectionKey);
      if (id in sections) {
        return sections[id] !== false;
      }
      return true;
    },
    [sections, tools],
  );

  const value = useMemo(
    () => ({
      tools,
      sections,
      banner,
      refresh,
      isToolEnabled,
      isSectionEnabled,
    }),
    [tools, sections, banner, refresh, isToolEnabled, isSectionEnabled],
  );

  return <AvailabilityContext.Provider value={value}>{children}</AvailabilityContext.Provider>;
}

export function useAppAvailability() {
  const ctx = useContext(AvailabilityContext);
  if (!ctx) {
    throw new Error('useAppAvailability must be used within <AppAvailabilityProvider />');
  }
  return ctx;
}
