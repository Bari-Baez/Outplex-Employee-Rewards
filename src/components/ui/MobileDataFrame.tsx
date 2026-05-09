'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Search, X } from 'lucide-react';

interface MobileDataFrameProps {
  children: React.ReactNode;
  searchable?: boolean;
  className?: string;
}

export function MobileDataFrame({ children, searchable = true, className = '' }: MobileDataFrameProps) {
  const [compact, setCompact] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const rows = Array.from(root.querySelectorAll('tbody tr, [data-mobile-filter-item="true"]')) as HTMLElement[];
    if (rows.length === 0) return;

    const term = query.trim().toLowerCase();
    rows.forEach((row) => {
      if (!term) {
        row.style.display = '';
        return;
      }

      row.style.display = row.textContent?.toLowerCase().includes(term) ? '' : 'none';
    });
  }, [query]);

  return (
    <>
      <div className={`mobile-data-frame ${compact ? 'mobile-data-frame-compact' : ''} ${className}`}>
        <div className="mobile-data-frame-controls">
          <button type="button" className={`mobile-data-frame-chip ${compact ? 'mobile-data-frame-chip-active' : ''}`} onClick={() => setCompact((current) => !current)}>
            {compact ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{compact ? 'Compact' : 'Normal'}</span>
          </button>

          <button type="button" className="mobile-data-frame-chip" onClick={() => setZoomOpen(true)}>
            <Maximize2 size={14} />
            <span>Zoom</span>
          </button>

          {searchable ? (
            <button type="button" className={`mobile-data-frame-chip ${searchOpen ? 'mobile-data-frame-chip-active' : ''}`} onClick={() => setSearchOpen((current) => !current)}>
              <Search size={14} />
              <span>Filter</span>
            </button>
          ) : null}
        </div>

        {searchOpen && searchable ? (
          <label className="mobile-data-frame-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter inside this panel" />
          </label>
        ) : null}

        <div ref={contentRef} className="mobile-data-frame-content">
          {children}
        </div>
      </div>

      {zoomOpen ? (
        <div className="mobile-data-frame-modal" onClick={() => setZoomOpen(false)}>
          <div className="mobile-data-frame-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="mobile-data-frame-modal-head">
              <strong>Zoomed view</strong>
              <button type="button" className="mobile-data-frame-close" onClick={() => setZoomOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="mobile-data-frame-modal-body">{children}</div>
          </div>
        </div>
      ) : null}

      <style>{`
        .mobile-data-frame {
          display: grid;
          gap: 0.75rem;
        }

        .mobile-data-frame-controls {
          display: none;
        }

        .mobile-data-frame-search {
          display: none;
        }

        @media (max-width: 767px) {
          .mobile-data-frame-controls {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
          }

          .mobile-data-frame-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.38rem;
            padding: 0.45rem 0.72rem;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.03);
            color: var(--text-secondary);
            font-size: 0.74rem;
            font-weight: 700;
          }

          .mobile-data-frame-chip-active {
            background: rgba(99,102,241,0.16);
            color: var(--text-primary);
            border-color: rgba(99,102,241,0.22);
          }

          .mobile-data-frame-search {
            display: flex;
            align-items: center;
            gap: 0.55rem;
            padding: 0.72rem 0.85rem;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.03);
            color: var(--text-muted);
          }

          .mobile-data-frame-search input {
            width: 100%;
            background: transparent;
            border: none;
            outline: none;
            color: var(--text-primary);
            font-size: 0.82rem;
          }

          .mobile-data-frame-content {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
          }

          .mobile-data-frame-compact .mobile-data-frame-content > * {
            transform: scale(0.92);
            transform-origin: top left;
            width: 108.7%;
          }

          .mobile-data-frame-modal {
            position: fixed;
            inset: 0;
            z-index: 3200;
            background: rgba(4, 6, 14, 0.82);
            backdrop-filter: blur(14px);
            padding: 1rem;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .mobile-data-frame-modal-card {
            width: min(100%, 920px);
            max-height: min(88vh, 900px);
            border-radius: 22px;
            background: rgba(10, 13, 24, 0.98);
            border: 1px solid rgba(255,255,255,0.08);
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .mobile-data-frame-modal-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.9rem 1rem;
            border-bottom: 1px solid rgba(255,255,255,0.08);
          }

          .mobile-data-frame-close {
            width: 32px;
            height: 32px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.08);
            background: rgba(255,255,255,0.04);
            color: var(--text-secondary);
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          .mobile-data-frame-modal-body {
            overflow: auto;
            padding: 1rem;
          }
        }
      `}</style>
    </>
  );
}
