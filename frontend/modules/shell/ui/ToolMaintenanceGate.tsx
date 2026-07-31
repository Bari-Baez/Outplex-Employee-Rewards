'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Sparkles, Wrench } from 'lucide-react';
import { resolveToolKeyFromPathname, TOOLS_CATALOG } from '@backend/modules/shell/domain/tools-catalog';
import { useAppAvailability } from '@frontend/modules/shell/ui/AppAvailabilityProvider';

export function ToolMaintenanceGate({
  userRole,
  children,
}: {
  userRole: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const { isToolEnabled } = useAppAvailability();

  const toolKey = resolveToolKeyFromPathname(pathname);
  const enabled = toolKey ? isToolEnabled(toolKey, { userRole }) : true;

  if (!toolKey || enabled) {
    return <>{children}</>;
  }

  const toolMeta = TOOLS_CATALOG.find((tool) => tool.key === toolKey);
  const fallbackHref = toolKey === 'dashboard' ? '/settings' : '/dashboard';

  return (
    <div className="tool-maint-shell animate-fade-in">
      <div className="tool-maint-card card">
        <div className="tool-maint-icon">
          <Wrench size={26} />
        </div>
        <div className="tool-maint-copy">
          <div className="tool-maint-kicker">Mantenimiento</div>
          <h1 className="tool-maint-title">{toolMeta?.label ?? 'Este módulo'} está en mantenimiento</h1>
          <p className="tool-maint-body">
            El equipo de IT está trabajando en esta función para aplicar mejoras y correcciones. Estará disponible nuevamente cuando el despliegue finalice.
          </p>

          <div className="tool-maint-actions">
            <Link href={fallbackHref} className="btn btn-primary">
              <ArrowLeft size={16} />
              {toolKey === 'dashboard' ? 'Ir a Settings' : 'Volver al Dashboard'}
            </Link>
            <div className="tool-maint-hint">
              <Sparkles size={14} />
              IT la habilitará cuando esté lista
            </div>
          </div>
        </div>

        <div className="tool-maint-glow" aria-hidden="true" />
      </div>

      <style jsx>{`
        .tool-maint-shell {
          display: grid;
          place-items: center;
          min-height: min(560px, calc(100vh - 180px));
        }
        .tool-maint-card {
          width: 100%;
          max-width: 860px;
          padding: 2rem 2.2rem;
          border-radius: 26px;
          background: linear-gradient(135deg, rgba(109, 93, 252, 0.09), rgba(255, 255, 255, 0.02));
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 30px 80px rgba(0,0,0,0.55);
          position: relative;
          overflow: hidden;
          display: grid;
          grid-template-columns: 76px 1fr;
          gap: 1.35rem;
          align-items: start;
        }
        .tool-maint-glow {
          position: absolute;
          inset: -2px;
          background: radial-gradient(circle at 20% 15%, rgba(109,93,252,0.35), transparent 55%),
            radial-gradient(circle at 85% 55%, rgba(59,130,246,0.25), transparent 55%);
          opacity: 0.6;
          pointer-events: none;
        }
        .tool-maint-icon {
          width: 66px;
          height: 66px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: rgba(255,255,255,0.95);
          background: rgba(109,93,252,0.18);
          border: 1px solid rgba(109,93,252,0.25);
          position: relative;
          z-index: 1;
        }
        .tool-maint-copy {
          position: relative;
          z-index: 1;
          min-width: 0;
        }
        .tool-maint-kicker {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          background: rgba(59,130,246,0.12);
          border: 1px solid rgba(59,130,246,0.22);
          color: rgba(191, 219, 254, 0.95);
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 0.9rem;
        }
        .tool-maint-title {
          margin: 0 0 0.75rem;
          font-size: 2.1rem;
          line-height: 1.1;
          letter-spacing: -0.03em;
          font-weight: 950;
        }
        .tool-maint-body {
          margin: 0;
          color: rgba(148, 163, 184, 0.95);
          font-weight: 600;
          line-height: 1.65;
          max-width: 60ch;
        }
        .tool-maint-actions {
          display: flex;
          gap: 0.85rem;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 1.35rem;
        }
        .tool-maint-hint {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: rgba(203, 213, 225, 0.9);
          font-weight: 700;
          font-size: 0.9rem;
          opacity: 0.9;
        }
        @media (max-width: 720px) {
          .tool-maint-card {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
