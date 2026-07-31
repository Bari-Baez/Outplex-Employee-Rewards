'use client';

import { useState, useEffect } from 'react';
import { ConfirmDialog } from '@frontend/shared/ui/ConfirmDialog';

interface Props {
  initialConnected: boolean;
  initialEmail: string | null;
  flashParam: string | null;
}

export function GoogleConnectCard({ initialConnected, initialEmail, flashParam }: Props) {
  const [connected, setConnected] = useState(initialConnected);
  const [email, setEmail] = useState(initialEmail);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  useEffect(() => {
    if (flashParam === 'connected') {
      setFlash({ type: 'success', msg: 'Cuenta de Google conectada exitosamente.' });
      setConnected(true);
      fetch('/api/google/status')
        .then((r) => r.json())
        .then((d: { connected: boolean; email?: string }) => {
          if (d.connected && d.email) setEmail(d.email);
        })
        .catch(() => {});
    } else if (flashParam === 'error') {
      setFlash({ type: 'error', msg: 'No se pudo conectar la cuenta de Google. Intenta de nuevo.' });
    } else if (flashParam === 'forbidden') {
      setFlash({ type: 'error', msg: 'No tienes permisos para conectar una cuenta de Google.' });
    }
  }, [flashParam]);

  async function doDisconnect() {
    setDisconnecting(true);
    try {
      await fetch('/api/google/status', { method: 'DELETE' });
      setConnected(false);
      setEmail(null);
      setFlash({ type: 'success', msg: 'Cuenta de Google desconectada.' });
    } catch {
      setFlash({ type: 'error', msg: 'Error al desconectar.' });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="card" style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {/* Google logo */}
        <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
          <path d="M44.5 20H24v8.5h11.8C34.1 33.5 29.5 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20.7-8 20.7-21 0-1.4-.1-2.7-.2-4z" fill="#FFC107"/>
          <path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.2-17.7 10.7z" fill="#FF3D00"/>
          <path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.6C29.5 36 26.9 37 24 37c-5.5 0-10.1-3.5-11.8-8.3l-7 5.4C8.6 41 15.8 45 24 45z" fill="#4CAF50"/>
          <path d="M44.5 20H24v8.5h11.8c-.9 2.6-2.6 4.8-4.8 6.4l6.6 5.6c-.4.3 6.9-5 6.9-16.5 0-1.4-.1-2.7-.2-4z" fill="#1976D2"/>
        </svg>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>Google Account</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Importa Google Forms y exporta respuestas a Google Sheets
          </div>
        </div>
      </div>

      {flash && (
        <div style={{
          padding: '0.625rem 0.875rem',
          borderRadius: 10,
          fontSize: '0.8125rem',
          fontWeight: 500,
          background: flash.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          color: flash.type === 'success' ? '#34d399' : '#f87171',
          border: `1px solid ${flash.type === 'success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
        }}>
          {flash.msg}
        </div>
      )}

      {connected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#34d399', boxShadow: '0 0 6px #34d399',
              display: 'inline-block',
            }} />
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Conectado como <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
            </span>
          </div>
          <button
            className="btn"
            onClick={() => setDisconnectConfirm(true)}
            disabled={disconnecting}
            style={{
              fontSize: '0.8125rem',
              padding: '0.4rem 0.875rem',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171',
            }}
          >
            {disconnecting ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      ) : (
        <a
          href="/api/google/connect"
          className="btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          Conectar cuenta de Google
        </a>
      )}

      {disconnectConfirm && (
        <ConfirmDialog
          title="Desconectar cuenta de Google"
          body="Perderás acceso a la importación de Forms y exportación a Sheets."
          confirmLabel="Desconectar"
          tone="danger"
          busy={disconnecting}
          onConfirm={async () => {
            setDisconnectConfirm(false);
            await doDisconnect();
          }}
          onCancel={() => setDisconnectConfirm(false)}
        />
      )}
    </div>
  );
}
