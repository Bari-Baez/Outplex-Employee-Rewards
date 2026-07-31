'use client';

import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@frontend/shared/lib/cn';

type WorkspacePanel = 'primary' | 'secondary';

interface SplitWorkspaceProps {
  primaryLabel: string;
  secondaryLabel: string;
  primary: ReactNode;
  secondary: ReactNode;
  className?: string;
  desktopColumns?: string;
  defaultMobilePanel?: WorkspacePanel;
  mobileMode?: 'tabs' | 'stack';
  panelMaxHeight?: string;
  primaryPanelClassName?: string;
  secondaryPanelClassName?: string;
}

export function SplitWorkspace({
  primaryLabel,
  secondaryLabel,
  primary,
  secondary,
  className,
  desktopColumns = 'minmax(0,1.05fr) minmax(340px,0.95fr)',
  defaultMobilePanel = 'primary',
  mobileMode = 'tabs',
  panelMaxHeight = 'calc(100vh - 14rem)',
  primaryPanelClassName,
  secondaryPanelClassName,
}: SplitWorkspaceProps) {
  const [mobilePanel, setMobilePanel] = useState<WorkspacePanel>(defaultMobilePanel);
  const desktopStyle = {
    gridTemplateColumns: desktopColumns,
    '--workspace-panel-max-height': panelMaxHeight,
  } as CSSProperties;

  const renderPrimary = () => (
    <div
      className={cn(
        'min-h-0 self-start rounded-[24px] border border-white/8 bg-white/[0.02] p-4 xl:overflow-y-auto',
        primaryPanelClassName,
      )}
      style={{ maxHeight: panelMaxHeight }}
    >
      {primary}
    </div>
  );

  const renderSecondary = () => (
    <div
      className={cn(
        'min-h-0 self-start rounded-[24px] border border-white/8 bg-white/[0.02] p-4 xl:overflow-y-auto',
        secondaryPanelClassName,
      )}
      style={{ maxHeight: panelMaxHeight }}
    >
      {secondary}
    </div>
  );

  return (
    <div className={cn('grid gap-4', className)}>
      {mobileMode === 'tabs' ? (
        <div className="flex flex-wrap gap-2 xl:hidden">
          <button
            type="button"
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-2 text-sm font-semibold transition',
              mobilePanel === 'primary'
                ? 'border-violet-400/40 bg-violet-500/18 text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-300',
            )}
            onClick={() => setMobilePanel('primary')}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-2 text-sm font-semibold transition',
              mobilePanel === 'secondary'
                ? 'border-violet-400/40 bg-violet-500/18 text-white'
                : 'border-white/10 bg-white/[0.03] text-slate-300',
            )}
            onClick={() => setMobilePanel('secondary')}
          >
            {secondaryLabel}
          </button>
        </div>
      ) : null}

      {mobileMode === 'tabs' ? (
        <div className="grid gap-4 xl:hidden">
          {mobilePanel === 'primary' ? renderPrimary() : renderSecondary()}
        </div>
      ) : (
        <div className="grid gap-4 xl:hidden">
          {renderPrimary()}
          {renderSecondary()}
        </div>
      )}

      <div className="hidden gap-4 xl:grid" style={desktopStyle}>
        {renderPrimary()}
        {renderSecondary()}
      </div>
    </div>
  );
}
