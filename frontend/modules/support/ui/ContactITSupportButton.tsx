'use client';

import { Mail } from 'lucide-react';

export function ContactITSupportButton() {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('open-support-tickets'));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1.75rem',
        borderRadius: '16px',
        fontSize: '0.85rem',
        fontWeight: 700,
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05))',
        color: '#a5b4fc',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.1))';
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
        e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
        e.currentTarget.style.boxShadow = '0 12px 40px rgba(99, 102, 241, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1)';
        e.currentTarget.style.color = '#c7d2fe';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(99, 102, 241, 0.05))';
        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.25)';
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.05)';
        e.currentTarget.style.color = '#a5b4fc';
      }}
    >
      <Mail size={18} strokeWidth={2.5} />
      Contact IT Support
    </button>
  );
}
