'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, Search, LogOut, ChevronDown, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { ModernSelect } from '@/components/ui/Select';
import type { SupportTicket, User } from '@/types/database';
import { getInitials } from '@/lib/utils';
import { useAppStore } from '@/lib/store';
import { proxifyMediaUrl } from '@/lib/media-proxy';

interface TopNavProps {
  user: User | null;
}

export function TopNav({ user }: TopNavProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const { setNotificationsOpen, setMessagesOpen } = useAppStore();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const { messagesOpen } = useAppStore();
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketDept, setTicketDept] = useState('it');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const result = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
        setUnreadCount(result.count ?? 0);
      } catch {
        // silently fail
      }
    })();
  }, [user, supabase]);

  useEffect(() => {
    if (messagesOpen && user) {
      void (async () => {
        const result = await supabase.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5);
        setTickets(result.data || []);
      })();
    }
  }, [messagesOpen, user, supabase]);

  const submitTicket = async () => {
    if (!ticketMessage.trim() || !user) return;
    const response = await fetch('/api/support/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        department: ticketDept,
        message: ticketMessage.trim(),
      }),
    });

    const payload = (await response.json()) as {
      data?: SupportTicket;
      error?: string;
    };

    if (response.ok && payload.data) {
      setTickets([payload.data, ...tickets]);
      setTicketMessage('');
    }
  };

  const roleLabel: Record<string, string> = {
    employee: 'Employee',
    moderator: 'Moderator',
    admin: 'Admin (IT)',
  };

  return (
    <header className="topnav">
      {/* Search */}
      <div className="topnav-search">
        <Search size={16} className="search-icon" />
        <input
          id="topnav-search-input"
          type="text"
          className="search-input"
          placeholder="Search OT events, slots..."
        />
      </div>

      <div className="topnav-right">
        {/* Live Status */}
        <div className="topnav-live">
          <span className="live-dot" />
          <span className="topnav-live-text">Live</span>
        </div>

        {/* Notifications */}
        <button className="topnav-icon-btn" id="notifications-btn" aria-label="Notifications" onClick={() => setNotificationsOpen(true)}>
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="notif-badge animate-pop">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>

        {/* Messages */}
        <button className="topnav-icon-btn" id="messages-btn" aria-label="Messages" onClick={() => setMessagesOpen(true)}>
          <MessageSquare size={18} />
        </button>

        {/* User Avatar */}
        <div className="topnav-user" onClick={() => setDropdownOpen(!dropdownOpen)}>
          <div className="user-avatar">
            {user?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={proxifyMediaUrl(user.avatar_url)} alt={user.name} referrerPolicy="no-referrer" />
            ) : (
              <span>{getInitials(user?.name ?? 'U')}</span>
            )}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.name ?? 'Employee'}</span>
            <span className="user-role">{roleLabel[user?.role ?? 'employee']}</span>
          </div>
          <ChevronDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

          {/* Dropdown */}
          {dropdownOpen && (
            <div className="user-dropdown">
              <div className="dropdown-header">
                <span className="dropdown-name">{user?.name}</span>
                <span className="dropdown-email">{user?.email}</span>
              </div>
              <div className="dropdown-divider" />
              <div className="dropdown-points">
                <span>💎 Points Balance</span>
                <span className="points-value">{user?.points ?? 0}</span>
              </div>
              <div className="dropdown-divider" />
              <button className="dropdown-item danger" onClick={handleSignOut} id="sign-out-btn">
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          )}
        </div>
        {/* Support Chat Popover */}
        {messagesOpen && (
          <div className="support-popover">
            <div className="support-header">
              <h3 style={{ margin: 0, fontSize: '0.9375rem' }}>Support Tickets</h3>
              <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setMessagesOpen(false)}><X size={16} /></button>
            </div>
            
            <div className="support-body">
              {tickets.length > 0 ? (
                tickets.map(t => (
                  <div key={t.id} style={{ background: 'var(--bg-elevated)', padding: '0.75rem', borderRadius: 8, marginBottom: '0.5rem', border: '1px solid var(--border-subtle)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                       <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)' }}>To: {t.department}</span>
                       <span style={{ fontSize: '0.7rem', color: t.status === 'open' ? 'var(--status-claimed)' : 'var(--status-available)' }}>{t.status}</span>
                     </div>
                     <div style={{ fontSize: '0.8125rem' }}>{t.message}</div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8125rem', margin: '1rem 0' }}>No active tickets.</div>
              )}
            </div>

            <div className="support-footer">
              <ModernSelect
                value={ticketDept}
                onValueChange={v => setTicketDept(v)}
                options={[
                  { label: 'IT Support', value: 'it' },
                  { label: 'HR / Moderator', value: 'moderator' }
                ]}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="input" style={{ flex: 1, fontSize: '0.8125rem' }} placeholder="Describe your issue..." value={ticketMessage} onChange={e => setTicketMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitTicket()} />
                <button className="btn btn-primary" style={{ padding: '0.5rem' }} onClick={submitTicket}><Send size={14} /></button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .topnav-search {
          flex: 1;
          max-width: 400px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          padding: 0 0.875rem;
          height: 38px;
        }

        .search-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .search-input {
          background: none;
          border: none;
          outline: none;
          color: var(--text-primary);
          font-size: 0.875rem;
          font-family: 'Inter', sans-serif;
          width: 100%;
        }

        .search-input::placeholder {
          color: var(--text-muted);
        }

        .topnav-right {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }

        .topnav-live {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.625rem;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 999px;
        }

        .topnav-live-text {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--status-available);
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .topnav-icon-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
        }

        .topnav-icon-btn:hover {
          background: var(--bg-card-hover);
          color: var(--text-primary);
          border-color: var(--border-default);
        }

        .notif-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          width: 16px;
          height: 16px;
          background: var(--brand-primary);
          border-radius: 50%;
          font-size: 0.6rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          border: 2px solid var(--bg-surface);
        }

        .topnav-user {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.375rem 0.75rem 0.375rem 0.375rem;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          user-select: none;
        }

        .topnav-user:hover {
          border-color: var(--border-default);
          background: var(--bg-card-hover);
        }

        .user-avatar {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: var(--gradient-brand);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          font-size: 0.75rem;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
        }

        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .user-info {
          display: flex;
          flex-direction: column;
        }

        .user-name {
          font-size: 0.8125rem;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .user-role {
          font-size: 0.6875rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 500;
        }

        .user-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          width: 220px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 14px;
          box-shadow: var(--shadow-card);
          z-index: 100;
          overflow: hidden;
          animation: fadeIn 0.15s ease;
        }

        .dropdown-header {
          padding: 0.875rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        .dropdown-name {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .dropdown-email {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .dropdown-divider {
          height: 1px;
          background: var(--border-subtle);
        }

        .dropdown-points {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .points-value {
          font-weight: 700;
          color: var(--brand-primary-light);
        }

        .dropdown-item {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          font-size: 0.875rem;
          font-family: 'Inter', sans-serif;
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          transition: background 0.15s;
          color: var(--text-secondary);
        }

        .dropdown-item:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }

        .dropdown-item.danger:hover {
          background: rgba(239, 68, 68, 0.08);
          color: var(--status-claimed);
        }

        .support-popover {
          position: absolute;
          top: calc(100% + 8px);
          right: 20px;
          width: 320px;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 14px;
          box-shadow: var(--shadow-card);
          z-index: 100;
          overflow: hidden;
          animation: fadeIn 0.15s ease;
          display: flex;
          flex-direction: column;
        }

        .support-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }

        .support-body {
          padding: 1rem;
          max-height: 250px;
          overflow-y: auto;
          background: var(--bg-surface);
        }

        .support-footer {
          padding: 1rem;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }
      `}</style>
    </header>
  );
}
