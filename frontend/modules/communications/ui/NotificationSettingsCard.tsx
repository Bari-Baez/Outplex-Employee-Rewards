'use client';

import { useAppStore } from '@frontend/modules/shell/state/app-store';
import { Bell, Volume2, Monitor } from 'lucide-react';

export function NotificationSettingsCard() {
  const {
    notificationPopupsEnabled,
    notificationSoundEnabled,
    setNotificationPopupsEnabled,
    setNotificationSoundEnabled,
  } = useAppStore();

  return (
    <div className="card settings-card">
      <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '1.25rem', fontSize: '1.1rem', fontWeight: 700 }}>
        <Bell size={20} className="icon-gradient" /> Personalizar Notificaciones
      </h3>

      <div className="settings-list">
        {/* Visual Alerts */}
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">
              <Monitor size={16} /> Alertas Visuales
            </div>
            <div className="setting-desc">Muestra un punto azul pulsante en la campana cuando hay algo nuevo.</div>
          </div>
          <button
            type="button"
            className={`switch ${notificationPopupsEnabled ? 'active' : ''}`}
            onClick={() => setNotificationPopupsEnabled(!notificationPopupsEnabled)}
            aria-label="Toggle Alertas Visuales"
          >
            <div className="switch-handle" />
          </button>
        </div>

        {/* Audio Alerts */}
        <div className="setting-item">
          <div className="setting-info">
            <div className="setting-label">
              <Volume2 size={16} /> Sonido de Notificación
            </div>
            <div className="setting-desc">Reproduce un tono suave y sutil al recibir notificaciones.</div>
          </div>
          <button
            type="button"
            className={`switch ${notificationSoundEnabled ? 'active' : ''}`}
            onClick={() => setNotificationSoundEnabled(!notificationSoundEnabled)}
            aria-label="Toggle Sonido de Notificación"
          >
            <div className="switch-handle" />
          </button>
        </div>
      </div>

      <style jsx>{`
        .settings-card {
          margin-top: 1.5rem;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        }

        .icon-gradient {
          color: var(--brand-primary);
        }

        .settings-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
        }

        .setting-info {
          flex: 1;
        }

        .setting-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.25rem;
        }

        .setting-desc {
          font-size: 0.85rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* Switch UI */
        .switch {
          width: 48px;
          height: 24px;
          border-radius: 100px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          position: relative;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
          padding: 0;
        }

        .switch.active {
          background: var(--brand-primary);
          border-color: var(--brand-primary);
          box-shadow: 0 0 15px rgba(109, 93, 252, 0.3);
        }

        .switch-handle {
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .switch.active .switch-handle {
          transform: translateX(24px);
        }

        .switch:hover {
          border-color: var(--brand-primary-light);
        }
      `}</style>
    </div>
  );
}
