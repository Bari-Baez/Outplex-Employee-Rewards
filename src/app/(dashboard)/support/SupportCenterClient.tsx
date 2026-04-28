'use client';

import { useMemo, useState } from 'react';
import { Headphones, LifeBuoy, ListTodo, MailWarning, Send } from 'lucide-react';
import { toast } from 'sonner';
import { ModernSelect } from '@/components/ui/Select';
import type {
  SupportDepartment,
  SupportTicket,
  SupportTicketStatus,
  UserRole,
} from '@/types/database';

type QueueTicket = SupportTicket & {
  user?: {
    name?: string | null;
    email?: string | null;
    employee_id?: string | null;
  };
};

interface SupportCenterClientProps {
  role: UserRole;
  myTickets: SupportTicket[];
  queueTickets: QueueTicket[];
}

const TICKET_HELP_TEXT: Record<SupportDepartment, string> = {
  it: 'Use IT Support only for technical issues, access problems, or system errors.',
  moderator:
    'Use Moderator Support only for orders, store pickups, raffle concerns, or moderation help.',
};

export function SupportCenterClient({
  role,
  myTickets,
  queueTickets,
}: SupportCenterClientProps) {
  const [activeTab, setActiveTab] = useState<'personal' | 'queue'>('personal');
  const [department, setDepartment] = useState<SupportDepartment | ''>('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [personalTickets, setPersonalTickets] = useState<SupportTicket[]>(myTickets);
  const [departmentQueue, setDepartmentQueue] = useState<QueueTicket[]>(queueTickets);

  const queueTitle = useMemo(() => {
    if (role === 'admin') {
      return 'IT Ticket Queue';
    }

    if (role === 'moderator_a1' || role === 'moderator_b1') {
      return 'Moderator Ticket Queue';
    }

    return 'Ticket Queue';
  }, [role]);

  const createTicket = async () => {
    if (!department) {
      setFormError('Select a support category first.');
      return;
    }

    if (!message.trim()) {
      setFormError('Write a short message describing the issue.');
      return;
    }

    setFormError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          department,
          message: message.trim(),
        }),
      });

      const payload = (await response.json()) as {
        data?: SupportTicket;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error ?? 'Unable to create the ticket.');
      }

      setPersonalTickets((current) => [payload.data!, ...current]);
      setMessage('');
      setDepartment('');
      setActiveTab('personal');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create the ticket.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateTicketStatus = async (ticketId: string, status: SupportTicketStatus) => {
    const response = await fetch(`/api/support/tickets/${ticketId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });

    const payload = (await response.json()) as {
      data?: SupportTicket;
      error?: string;
    };

    if (!response.ok || !payload.data) {
      toast.error(payload.error ?? 'Unable to update the ticket.');
      return;
    }

    setDepartmentQueue((currentQueue) =>
      currentQueue.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status: payload.data!.status } : ticket,
      ),
    );
  };

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: '1.5rem', maxWidth: 1100 }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
          Support Center
        </h1>
        <p className="text-muted">
          Create order or technical tickets, track your requests, and manage the support queue when
          you have elevated access.
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'personal' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('personal')}
          >
            <Headphones size={16} /> My Tickets
          </button>
          {(role === 'moderator_a1' || role === 'moderator_b1' || role === 'admin') && (
            <button
              className={`btn ${activeTab === 'queue' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('queue')}
            >
              <ListTodo size={16} /> {queueTitle}
            </button>
          )}
        </div>

        {activeTab === 'personal' && (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div className="card" style={{ background: 'var(--bg-elevated)' }}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <div>
                  <label className="meta-label">Support Category</label>
                  <ModernSelect
                    value={department}
                    onValueChange={v => {
                      setDepartment(v as SupportDepartment);
                      setFormError('');
                    }}
                    options={[
                      { label: 'IT Support', value: 'it' },
                      { label: 'Moderator Support', value: 'moderator' }
                    ]}
                  />
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {department
                    ? TICKET_HELP_TEXT[department]
                    : 'You can create 1 ticket every 5 hours. Pick the correct team first.'}
                </div>
                <div>
                  <label className="meta-label">Message</label>
                  <textarea
                    className="input"
                    rows={4}
                    placeholder={
                      department
                        ? 'Describe the issue with enough detail to help the team respond quickly.'
                        : 'Select a category first'
                    }
                    disabled={!department}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {formError ? (
                    <div style={{ fontSize: '0.8125rem', color: '#f87171' }}>{formError}</div>
                  ) : (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Resolved tickets remain visible for a short period for follow-up.
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={createTicket} disabled={isSubmitting}>
                    <Send size={16} /> {isSubmitting ? 'Sending...' : 'Create Ticket'}
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <h2 style={{ marginBottom: '1rem' }}>My Ticket History</h2>
              {personalTickets.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {personalTickets.map((ticket) => (
                    <div key={ticket.id} className="ticket-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <div>
                          <div style={{ fontWeight: 700, textTransform: 'capitalize' }}>
                            {ticket.department} Support
                          </div>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                            {new Date(ticket.created_at).toLocaleString()}
                          </div>
                        </div>
                        <span className={`badge badge-${ticket.status}`}>{ticket.status.replace(/_/g, ' ')}</span>
                      </div>
                      <p style={{ margin: '0.75rem 0 0', color: 'var(--text-secondary)' }}>{ticket.message}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <LifeBuoy size={36} style={{ color: 'var(--text-muted)' }} />
                  <p>No tickets created yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'queue' && (role === 'moderator_a1' || role === 'moderator_b1' || role === 'admin') && (
          <div className="card">
            <h2 style={{ marginBottom: '1rem' }}>{queueTitle}</h2>
            {departmentQueue.length > 0 ? (
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {departmentQueue.map((ticket) => (
                  <div key={ticket.id} className="ticket-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>
                          {ticket.user?.name || 'Unknown employee'}
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {ticket.user?.employee_id || ticket.user?.email || 'No employee details'}
                        </div>
                      </div>
                      <span className={`badge badge-${ticket.status}`}>{ticket.status.replace(/_/g, ' ')}</span>
                    </div>
                    <p style={{ margin: '0.75rem 0', color: 'var(--text-secondary)' }}>{ticket.message}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-ghost" onClick={() => void updateTicketStatus(ticket.id, 'open')}>
                        Reopen
                      </button>
                      <button className="btn btn-secondary" onClick={() => void updateTicketStatus(ticket.id, 'in_progress')}>
                        In Progress
                      </button>
                      <button className="btn btn-primary" onClick={() => void updateTicketStatus(ticket.id, 'resolved')}>
                        Resolve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <MailWarning size={36} style={{ color: 'var(--text-muted)' }} />
                <p>No tickets pending in this queue.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
