'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  PauseCircle,
  Search,
  ShieldCheck,
  Store as StoreIcon,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { EmployeeStore, EmployeeStoreProduct, EmployeeStoreRequest, User } from '@/types/database';
import { canEditTool } from '@/lib/permissions';
import { SupervisorFilter } from '@/components/SupervisorFilter';

type RequestWithUser = EmployeeStoreRequest & {
  user: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url' | 'supervisor' | 'supervisor_id'> | null;
  reviewer: Pick<User, 'id' | 'name'> | null;
};

type StoreWithOwner = EmployeeStore & {
  owner: Pick<User, 'id' | 'name' | 'email' | 'avatar_url' | 'slack_id' | 'supervisor' | 'supervisor_id'> | null;
};

type TabKey = 'queue' | 'stores' | 'products';
type DecisionTarget = { type: 'store'; id: string } | { type: 'product'; id: string };
type DecisionDialog = { target: DecisionTarget; decision: 'approved' | 'rejected' } | null;
type SuspendProductDialog = { id: string } | null;
type DeleteProductDialog = { id: string } | null;
type SuspendStoreDialog = { id: string; name: string } | null;
type DeleteStoreDialog = { id: string; name: string } | null;

function initialsFromName(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

interface EmployeeStoresQueueClientProps {
  currentUser: User;
  initialRequests: RequestWithUser[];
  initialStores: StoreWithOwner[];
  initialProducts?: (EmployeeStoreProduct & {
    store: {
      id: string;
      name: string;
      owner_id: string;
      owner?: { id: string; name: string; supervisor: string | null; supervisor_id: string | null } | null;
    } | null
  })[];
}

export function EmployeeStoresQueueClient(props: EmployeeStoresQueueClientProps) {
  const {
    currentUser,
    initialRequests,
    initialStores,
    initialProducts = [],
  } = props;
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('queue');
  const [requests, setRequests] = useState<RequestWithUser[]>(initialRequests);
  const [stores, setStores] = useState<StoreWithOwner[]>(initialStores);
  const [products, setProducts] = useState(initialProducts);
  const [query, setQuery] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [dialog, setDialog] = useState<DecisionDialog>(null);
  const [suspendDialog, setSuspendDialog] = useState<SuspendProductDialog>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteProductDialog>(null);
  const [suspendStoreDialog, setSuspendStoreDialog] = useState<SuspendStoreDialog>(null);
  const [deleteStoreDialog, setDeleteStoreDialog] = useState<DeleteStoreDialog>(null);
  const [dialogNotes, setDialogNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [supervisorFilter, setSupervisorFilter] = useState<string | 'all' | 'my-team'>('all');

  const currentRole = currentUser.role;
  const isB1 = currentRole === 'moderator_b1';
  const isReadOnly = !canEditTool(currentRole, 'employee-stores');

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const rejectedCount = requests.filter((r) => r.status === 'rejected').length;

  const allSupervisors = useMemo(() => {
    // Map of id -> name
    const supervisors = new Map<string, string>();
    const register = (u: { supervisor?: string | null; supervisor_id?: string | null } | null | undefined) => {
      if (u?.supervisor_id && u?.supervisor) {
        supervisors.set(u.supervisor_id, u.supervisor);
      }
    };
    requests.forEach(r => register(r.user));
    stores.forEach(s => register(s.owner));
    products.forEach(p => register(p.store?.owner));
    return Array.from(supervisors.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [requests, stores, products]);

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      // Supervisor filtering
      const isSearchActive = q.length > 0;
      const shouldBypassFilter = isSearchActive && isB1;

      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (r.user?.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (r.user?.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!q) return true;
      return `${r.user?.name ?? ''} ${r.user?.email ?? ''} ${r.store_name} ${r.category ?? ''} ${r.description}`
        .toLowerCase()
        .includes(q);
    });
  }, [query, requests, supervisorFilter, currentUser.id, isB1]);

  const filteredStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((s) => {
      // Supervisor filtering
      const isSearchActive = q.length > 0;
      const shouldBypassFilter = isSearchActive && isB1;

      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (s.owner?.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (s.owner?.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!q) return true;
      return `${s.owner?.name ?? ''} ${s.owner?.email ?? ''} ${s.name} ${s.slug} ${s.category ?? ''}`.toLowerCase().includes(q);
    });
  }, [query, stores, supervisorFilter, currentUser.id, isB1]);
  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const statusPriority = (p: typeof products[number]) => {
      if (p.status === 'pending') return 0;
      if (p.is_suspended) return 1;
      if (p.status === 'rejected') return 2;
      return 3;
    };
    return products
      .filter((p) => {
        const isSearchActive = q.length > 0;
        const shouldBypassFilter = isSearchActive && isB1;

        if (!shouldBypassFilter) {
          if (supervisorFilter === 'my-team' && isB1) {
            if (p.store?.owner?.supervisor_id !== currentUser.id) return false;
          } else if (supervisorFilter !== 'all') {
            if (p.store?.owner?.supervisor_id !== supervisorFilter) return false;
          }
        }

        if (!q) return true;
        return `${p.name} ${p.description ?? ''} ${p.store?.name ?? ''}`.toLowerCase().includes(q);
      })
      .sort((a, b) => statusPriority(a) - statusPriority(b));
  }, [query, products, supervisorFilter, currentUser.id, isB1]);
  const openDecision = (target: DecisionTarget, decision: 'approved' | 'rejected') => {
    setDialog({ target, decision });
    setDialogNotes('');
  };

  const confirmDecision = async () => {
    if (!dialog) return;
    setSaving(true);
    try {
      if (dialog.target.type === 'store') {
        const res = await fetch(`/api/moderator/employee-store/requests/${dialog.target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: dialog.decision,
            notes: dialogNotes.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Unable to save decision.');

        setRequests((current) =>
          current.map((r) =>
            r.id === dialog.target.id
              ? { ...r, status: dialog.decision, review_notes: dialogNotes.trim() || null, reviewed_at: new Date().toISOString() }
              : r,
          ),
        );
        setStatusMessage({
          tone: 'success',
          text: dialog.decision === 'approved' ? 'Request approved and store created.' : 'Request rejected and the employee was notified.',
        });
      } else {
        const res = await fetch('/api/moderator/employee-store/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: dialog.target.id,
            status: dialog.decision === 'approved' ? 'active' : 'rejected',
            reviewNotes: dialogNotes.trim() || null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Unable to moderate product.');

        const updatedProduct = json.product;
        if (updatedProduct) {
          setProducts((current) =>
            current.map((p) => p.id === dialog.target.id ? { ...p, ...updatedProduct } : p)
          );
        }
        setStatusMessage({
          tone: 'success',
          text: dialog.decision === 'approved' ? 'Product approved and listed.' : 'Product rejected.',
        });
      }
      setDialog(null);
      router.refresh();
    } catch (err) {
      setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to save decision.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmSuspendProduct = async () => {
    if (!suspendDialog) return;
    setSaving(true);
    try {
      const res = await fetch('/api/moderator/employee-store/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: suspendDialog.id,
          is_suspended: true,
          suspend_reason: dialogNotes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to suspend product.');
      setProducts(current => current.map(p => p.id === suspendDialog.id ? { ...p, is_suspended: true, suspend_reason: dialogNotes.trim() || null } : p));
      setStatusMessage({ tone: 'success', text: 'Product suspended and user notified.' });
      setSuspendDialog(null);
      setDialogNotes('');
      router.refresh();
    } catch (err) {
      setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to suspend product.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteProduct = async () => {
    if (!deleteDialog) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/moderator/employee-store/products?productId=${deleteDialog.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: dialogNotes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to delete product.');
      setProducts(current => current.filter(p => p.id !== deleteDialog.id));
      setStatusMessage({ tone: 'success', text: 'Product completely deleted.' });
      setDeleteDialog(null);
      router.refresh();
    } catch (err) {
      setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to delete product.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleProductActivation = async (productId: string, suspend: boolean) => {
    if (suspend) {
      setDialogNotes('');
      setSuspendDialog({ id: productId });
    } else {
      setSaving(true);
      try {
        const res = await fetch('/api/moderator/employee-store/products', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            is_suspended: false,
            suspend_reason: null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Unable to activate product.');
        setProducts(current => current.map(p => p.id === productId ? { ...p, is_suspended: false, suspend_reason: null } : p));
        setStatusMessage({ tone: 'success', text: 'Product activated.' });
        router.refresh();
      } catch (err) {
        setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to activate product.' });
      } finally {
        setSaving(false);
      }
    }
  };

  const confirmSuspendStore = async () => {
    if (!suspendStoreDialog) return;
    setSaving(true);
    try {
      const res = await fetch('/api/moderator/employee-store/stores', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: suspendStoreDialog.id, status: 'suspended', reason: dialogNotes.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to suspend store.');
      setStores(current => current.map(s => s.id === suspendStoreDialog.id ? { ...s, status: 'suspended' as const, suspend_reason: dialogNotes.trim() || null } : s));
      setStatusMessage({ tone: 'success', text: `Store "${suspendStoreDialog.name}" suspended.` });
      setSuspendStoreDialog(null);
      setDialogNotes('');
      router.refresh();
    } catch (err) {
      setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to suspend store.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteStore = async () => {
    if (!deleteStoreDialog) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/moderator/employee-store/stores?storeId=${deleteStoreDialog.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to delete store.');
      setStores(current => current.filter(s => s.id !== deleteStoreDialog.id));
      setStatusMessage({ tone: 'success', text: `Store "${deleteStoreDialog.name}" permanently deleted.` });
      setDeleteStoreDialog(null);
      router.refresh();
    } catch (err) {
      setStatusMessage({ tone: 'danger', text: err instanceof Error ? err.message : 'Unable to delete store.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="queue-shell animate-fade-in">
      <div className="queue-header">
        <div>
          <h1 className="queue-title">Employee Stores</h1>
          <p className="queue-subtitle">
            Review access requests from employees who want to open a personal micro-store, and manage every approved
            store in one place.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`queue-status queue-status-${statusMessage.tone}`}>
          {statusMessage.tone === 'success' ? <ShieldCheck size={16} /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
          <button className="icon-btn" onClick={() => setStatusMessage(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      <div className="queue-tabs">
        <button className={`btn ${tab === 'queue' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('queue')}>
          <Users size={16} /> Requests queue
          {pendingCount > 0 && <span className="queue-badge">{pendingCount}</span>}
        </button>
        {currentRole !== 'moderator_b1' && (
          <button className={`btn ${tab === 'products' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('products')}>
            <Package size={16} /> Product Queue
            {products.filter(p => p.status === 'pending').length > 0 && 
              <span className="queue-badge" style={{ background: 'var(--brand-primary)' }}>
                {products.filter(p => p.status === 'pending').length}
              </span>
            }
          </button>
        )}
        <button className={`btn ${tab === 'stores' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('stores')}>
          <StoreIcon size={16} /> Active stores
        </button>
      </div>

      <div className="queue-summary">
        <div className="summary-card">
          <div className="summary-label">Pending</div>
          <div className="summary-value">{pendingCount}</div>
          <div className="summary-helper">Awaiting your review.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Approved</div>
          <div className="summary-value">{approvedCount}</div>
          <div className="summary-helper">Stores opened after approval.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Rejected</div>
          <div className="summary-value">{rejectedCount}</div>
          <div className="summary-helper">Requests that didn&apos;t meet policy.</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Total stores</div>
          <div className="summary-value">{stores.length}</div>
          <div className="summary-helper">All historical stores combined.</div>
        </div>
      </div>

      <div className="queue-toolbar">
        <label className="queue-search">
          <Search size={15} />
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'queue' ? 'Search by employee, store name…' : tab === 'products' ? 'Search products…' : 'Search active stores…'}
          />
        </label>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <SupervisorFilter
            supervisors={allSupervisors.filter(([, name]) => name !== currentUser.name)}
            currentSupervisorFilter={supervisorFilter}
            onFilterChange={setSupervisorFilter}
            currentUserRole={currentUser.role}
            currentUserId={currentUser.id}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setSupervisorFilter('all'); }}>
            Reset
          </button>
        </div>
      </div>

      {tab === 'queue' && (
        <section className="card queue-panel">
          {filteredRequests.length === 0 ? (
            <div className="empty-state"><Users size={32} /><p>No requests match your search.</p></div>
          ) : (
            <div className="request-list">
              {filteredRequests.map((req) => (
                <article key={req.id} className={`request-row request-row-${req.status}`}>
                  <div className="request-row-left">
                    <div className="request-avatar">
                      {req.user?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={req.user.avatar_url} alt="" />
                      ) : (
                        <span>{initialsFromName(req.user?.name ?? 'E')}</span>
                      )}
                    </div>
                    <div className="request-info">
                      <div className="request-user">
                        <strong>{req.user?.name ?? 'Unknown employee'}</strong>
                        <span>{req.user?.employee_id ?? 'No ID'} · {req.user?.email ?? 'no email'}</span>
                        <div style={{ fontSize: '0.76rem', color: 'var(--brand-primary-light)', fontWeight: 600 }}>Superior: {req.user?.supervisor || '—'}</div>
                      </div>
                      <div className="request-store">
                        <span className="request-store-name">&ldquo;{req.store_name}&rdquo;</span>
                        {req.category && <span className="request-chip">{req.category}</span>}
                      </div>
                      <p className="request-desc">{req.description}</p>
                      <div className="request-meta">
                        <span>Submitted {new Date(req.created_at).toLocaleString()}</span>
                        {req.reviewed_at && req.reviewer && (
                          <span>· Reviewed by {req.reviewer.name} on {new Date(req.reviewed_at).toLocaleString()}</span>
                        )}
                      </div>
                      {req.review_notes && (
                        <div className="request-notes">Notes: {req.review_notes}</div>
                      )}
                    </div>
                  </div>
                  <div className="request-actions">
                    {req.status === 'pending' ? (
                      <>
                        <button className="btn btn-success btn-sm" onClick={() => openDecision({ type: 'store', id: req.id }, 'approved')} disabled={isReadOnly}>
                          <CheckCircle2 size={14} /> Approve
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => openDecision({ type: 'store', id: req.id }, 'rejected')} disabled={isReadOnly}>
                          <XCircle size={14} /> Reject
                        </button>
                      </>
                    ) : (
                      <div className={`status-badge status-badge-${req.status}`}>
                        {req.status === 'approved' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                        {req.status.toUpperCase()}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'products' && (
        <section className="card queue-panel">
          {filteredProducts.length === 0 ? (
            <div className="empty-state"><Package size={32} /><p>No products awaiting review.</p></div>
          ) : (
            <div className="request-list">
              {filteredProducts.map((prod) => {
                const statusLabel = prod.is_suspended ? 'suspended' : prod.status;
                const statusColors: Record<string, { bg: string; border: string; color: string }> = {
                  pending:   { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  color: '#fbbf24' },
                  active:    { bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.3)',   color: '#22c55e' },
                  rejected:  { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)',   color: '#f87171' },
                  suspended: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  color: '#f59e0b' },
                };
                const sc = statusColors[statusLabel ?? 'active'] ?? statusColors.active;
                return (
                  <article key={prod.id} className="request-row" style={{ borderColor: prod.status === 'pending' ? 'rgba(245,158,11,0.35)' : undefined }}>
                    <div className="request-row-left">
                      <div className="product-thumb-sm">
                        {prod.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={prod.image_url} alt={prod.name} />
                        ) : (
                          <Package size={20} />
                        )}
                      </div>
                      <div className="request-info">
                        <div className="request-user">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <strong>{prod.name}</strong>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '999px', background: sc.bg, border: `1px solid ${sc.border}`, color: sc.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              {statusLabel === 'pending' ? 'Pending review' : statusLabel === 'active' ? 'Active' : statusLabel === 'rejected' ? 'Rejected' : 'Suspended'}
                            </span>
                          </div>
                          <span>{prod.store?.name || 'Unknown Store'} · RD$ {prod.price_dop.toLocaleString()}</span>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Superior: {prod.store?.owner?.supervisor || '—'}</div>
                        </div>
                        {prod.description && <p className="request-desc">{prod.description}</p>}
                        {prod.is_suspended && prod.suspend_reason && (
                          <div style={{ fontSize: '0.78rem', color: '#f59e0b', marginTop: '0.25rem' }}>Motivo de suspensión: {prod.suspend_reason}</div>
                        )}
                        <div className="request-meta">
                          <span>Submitted {new Date(prod.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="request-row-right">
                      {currentUser.role !== 'moderator_b1' && (
                        <div className="request-actions" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: '0.8rem' }}>
                          {prod.status === 'pending' ? (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className="btn btn-ghost btn-sm btn-danger-ghost"
                                onClick={() => openDecision({ type: 'product', id: prod.id }, 'rejected')}
                                disabled={isReadOnly}
                              >
                                Reject
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => openDecision({ type: 'product', id: prod.id }, 'approved')}
                                disabled={isReadOnly}
                              >
                                Approve
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              {prod.is_suspended ? (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }}
                                  onClick={() => toggleProductActivation(prod.id, false)}
                                  disabled={isReadOnly || saving}
                                >
                                  <CheckCircle2 size={13} /> Unsuspend
                                </button>
                              ) : (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}
                                  onClick={() => { setDialogNotes(''); setSuspendDialog({ id: prod.id }); }}
                                  disabled={isReadOnly || saving}
                                >
                                  <PauseCircle size={13} /> Suspend
                                </button>
                              )}
                              <button
                                className="btn btn-ghost btn-sm btn-danger-ghost"
                                onClick={() => { setDialogNotes(''); setDeleteDialog({ id: prod.id }); }}
                                disabled={isReadOnly || saving}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'stores' && (
        <section className="card queue-panel">
          {filteredStores.length === 0 ? (
            <div className="empty-state"><StoreIcon size={32} /><p>No stores match your search.</p></div>
          ) : (
            <div className="stores-grid">
              {filteredStores.map((store) => (
                <article key={store.id} className="store-card">
                  <div
                    className="store-banner"
                    style={{
                      background: store.banner_image
                        ? `linear-gradient(180deg, rgba(5,8,16,0.2), rgba(5,8,16,0.82)), url(${store.banner_image}) center/cover`
                        : `linear-gradient(135deg, ${store.accent_color ?? '#7c6cff'}33, rgba(5,8,16,0.75))`,
                    }}
                  >
                    <div className="store-logo" style={{ background: store.accent_color ?? '#7c6cff' }}>
                      {store.logo_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={store.logo_image} alt="" />
                      ) : (
                        <StoreIcon size={18} />
                      )}
                    </div>
                  </div>
                  <div className="store-body">
                    <div className="store-head">
                      <strong>{store.name}</strong>
                      <span className={`store-status store-status-${store.status}`}>{store.status}</span>
                    </div>
                    <div className="store-slug">@{store.slug}</div>
                    {store.description && <p className="store-desc">{store.description}</p>}
                    <div className="store-owner">
                      <div className="store-owner-avatar">
                        {store.owner?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={store.owner.avatar_url} alt="" />
                        ) : (
                          <span>{initialsFromName(store.owner?.name ?? '?')}</span>
                        )}
                      </div>
                      <div>
                        <strong>{store.owner?.name}</strong>
                        <span>{store.owner?.email}</span>
                        <div style={{ fontSize: '0.72rem', color: 'var(--brand-primary-light)', fontWeight: 600 }}>Superior: {store.owner?.supervisor || '—'}</div>
                      </div>
                    </div>
                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ flex: 1, color: store.status === 'suspended' ? '#22c55e' : '#f59e0b', borderColor: store.status === 'suspended' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)' }}
                          onClick={async () => { 
                            if (store.status === 'suspended') {
                              setSaving(true);
                              try {
                                const res = await fetch('/api/moderator/employee-store/stores', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ storeId: store.id, status: 'active', reason: null }),
                                });
                                if (!res.ok) throw new Error('Failed to reactivate');
                                setStores(current => current.map(s => s.id === store.id ? { ...s, status: 'active', suspend_reason: null } : s));
                                setStatusMessage({ tone: 'success', text: `Store "${store.name}" reactivated.` });
                                router.refresh();
                              } catch {
                                setStatusMessage({ tone: 'danger', text: 'Error reactivating store.' });
                              } finally {
                                setSaving(false);
                              }
                            } else {
                              setDialogNotes(''); 
                              setSuspendStoreDialog({ id: store.id, name: store.name }); 
                            }
                          }}
                          disabled={saving}
                        >
                          {store.status === 'suspended' ? <CheckCircle2 size={14} /> : <PauseCircle size={14} />}
                          {store.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ flex: 1, color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => setDeleteStoreDialog({ id: store.id, name: store.name })}
                          disabled={saving}
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {dialog && (
        <div className="modal-backdrop" onClick={() => !saving && setDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              {dialog.decision === 'approved' ? (
                <><CheckCircle2 size={22} style={{ color: '#22c55e' }} /><h3>Approve request</h3></>
              ) : (
                <><XCircle size={22} style={{ color: '#f87171' }} /><h3>Reject request</h3></>
              )}
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              {dialog.decision === 'approved'
                ? 'The employee will get access to their personal store editor. A store row will be created automatically.'
                : 'The employee will be notified. Provide a reason so they understand how to improve the request.'}
            </p>
            <label className="form-field">
              <span>{dialog.decision === 'approved' ? 'Notes (optional)' : 'Reason *'}</span>
              <textarea
                className="input"
                rows={4}
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder={dialog.decision === 'approved' ? 'Anything the employee should know…' : 'Why is this request being rejected?'}
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={saving} onClick={() => setDialog(null)}>Cancel</button>
              <button
                className={dialog.decision === 'approved' ? 'btn btn-primary' : 'btn btn-primary btn-danger'}
                disabled={saving || (dialog.decision === 'rejected' && !dialogNotes.trim())}
                onClick={() => void confirmDecision()}
              >
                {saving ? <Loader2 size={16} className="spinning" /> : dialog.decision === 'approved' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {dialog.decision === 'approved' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {suspendDialog && (
        <div className="modal-backdrop" onClick={() => !saving && setSuspendDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <XCircle size={22} style={{ color: '#f59e0b' }} /><h3>Suspend Product</h3>
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              The owner will be notified with the reason. The product will be hidden from the store.
            </p>
            <label className="form-field">
              <span>Suspension Reason *</span>
              <textarea
                className="input"
                rows={4}
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Reason for suspension..."
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={saving} onClick={() => setSuspendDialog(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-danger"
                style={{ background: '#f59e0b' }}
                disabled={saving || !dialogNotes.trim()}
                onClick={() => void confirmSuspendProduct()}
              >
                {saving ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                Suspend Product
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteDialog && (
        <div className="modal-backdrop" onClick={() => !saving && setDeleteDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <XCircle size={22} style={{ color: '#f87171' }} /><h3>Permanently Delete Product</h3>
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              Are you sure you want to completely delete this product? This action cannot be undone. The seller will receive the reason you provide below.
            </p>
            <label className="form-field">
              <span>Deletion Reason *</span>
              <textarea
                className="input"
                rows={4}
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Reason for deleting this product..."
              />
            </label>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-ghost" disabled={saving} onClick={() => setDeleteDialog(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-danger"
                disabled={saving || !dialogNotes.trim()}
                onClick={() => void confirmDeleteProduct()}
              >
                {saving ? <Loader2 size={16} className="spinning" /> : <XCircle size={16} />}
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {suspendStoreDialog && (
        <div className="modal-backdrop" onClick={() => !saving && setSuspendStoreDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <PauseCircle size={22} style={{ color: '#f59e0b' }} /><h3>Suspend Store</h3>
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              &ldquo;{suspendStoreDialog.name}&rdquo; will be hidden from all employees. The owner will be notified with your reason.
            </p>
            <label className="form-field" style={{ marginTop: '0.75rem' }}>
              <span>Suspension reason *</span>
              <textarea
                className="input"
                rows={3}
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Reason for suspending this store…"
              />
            </label>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={saving} onClick={() => setSuspendStoreDialog(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-danger"
                style={{ background: '#f59e0b' }}
                disabled={saving || !dialogNotes.trim()}
                onClick={() => void confirmSuspendStore()}
              >
                {saving ? <Loader2 size={16} className="spinning" /> : <PauseCircle size={16} />}
                Suspend
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteStoreDialog && (
        <div className="modal-backdrop" onClick={() => !saving && setDeleteStoreDialog(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Trash2 size={22} style={{ color: '#f87171' }} /><h3>Delete Store Permanently</h3>
            </div>
            <p className="text-muted" style={{ margin: 0 }}>
              Are you sure you want to permanently delete &ldquo;{deleteStoreDialog.name}&rdquo;? All products and orders will be removed. This action cannot be undone.
            </p>
            <div className="modal-actions" style={{ marginTop: '1rem' }}>
              <button className="btn btn-ghost" disabled={saving} onClick={() => setDeleteStoreDialog(null)}>Cancel</button>
              <button
                className="btn btn-primary btn-danger"
                disabled={saving}
                onClick={() => void confirmDeleteStore()}
              >
                {saving ? <Loader2 size={16} className="spinning" /> : <Trash2 size={16} />}
                Yes, Delete Store
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .queue-shell { max-width: 1320px; display: grid; gap: 1rem; }
        .queue-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
        .queue-title { font-size: 1.875rem; font-weight: 800; margin: 0 0 0.5rem; }
        .queue-subtitle { margin: 0; color: var(--text-secondary); line-height: 1.7; max-width: 72ch; }
        .queue-status { display: flex; align-items: center; gap: 0.65rem; padding: 0.9rem 1rem; border-radius: 14px; position: relative; }
        .queue-status-success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.22); }
        .queue-status-danger { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.22); }
        .queue-status-info { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.22); }
        .queue-status .icon-btn { margin-left: auto; background: transparent; border: none; color: inherit; cursor: pointer; padding: 0.25rem; }
        .queue-tabs { display: flex; gap: 0.75rem; flex-wrap: wrap; padding-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); }
        .queue-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 20px; padding: 0 0.45rem; border-radius: 999px; background: rgba(239,68,68,0.9); color: white; font-size: 0.72rem; font-weight: 800; margin-left: 0.35rem; }
        .queue-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
        .summary-card { padding: 1rem; border-radius: 18px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
        .summary-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; }
        .summary-value { font-size: 1.85rem; font-weight: 800; margin-top: 0.35rem; }
        .summary-helper { margin-top: 0.35rem; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.5; }
        .queue-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
        .queue-search { position: relative; flex: 1; min-width: 220px; max-width: 420px; width: 100%; }
        .queue-search svg { position: absolute; left: 0.9rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .queue-search .input { padding-left: 2.5rem; }
        .queue-panel { padding: 1rem; }
        .empty-state { display: grid; gap: 0.5rem; place-items: center; padding: 3rem 1rem; text-align: center; color: var(--text-muted); }
        .request-list { display: grid; gap: 0.75rem; }
        .request-row { display: flex; gap: 1rem; align-items: flex-start; justify-content: space-between; padding: 1rem; border-radius: 16px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); }
        .request-row-pending { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.04); }
        .request-row-approved { opacity: 0.82; }
        .request-row-rejected { opacity: 0.72; }
        .request-row-left { display: flex; gap: 0.85rem; flex: 1; min-width: 0; }
        .request-avatar { width: 42px; height: 42px; border-radius: 999px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--gradient-brand); color: white; font-weight: 700; font-size: 0.85rem; flex-shrink: 0; }
        .request-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .product-thumb-sm { width: 44px; height: 44px; border-radius: 10px; overflow: hidden; background: var(--bg-card); display: flex; alignItems: center; justifyContent: center; border: 1px solid var(--border-subtle); flex-shrink: 0; }
        .product-thumb-sm img { width: 100%; height: 100%; object-fit: cover; }
        .request-info { display: grid; gap: 0.4rem; min-width: 0; flex: 1; }
        .request-user { display: grid; gap: 0.15rem; }
        .request-user strong { font-weight: 700; }
        .request-user span { font-size: 0.8rem; color: var(--text-muted); }
        .request-store { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
        .request-store-name { font-weight: 600; color: var(--brand-primary-light); }
        .request-chip { font-size: 0.72rem; padding: 0.18rem 0.5rem; border-radius: 999px; background: rgba(255,255,255,0.05); color: var(--text-muted); }
        .request-desc { margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.55; }
        .request-meta { font-size: 0.75rem; color: var(--text-muted); }
        .request-notes { margin-top: 0.35rem; padding: 0.6rem 0.75rem; border-radius: 10px; background: rgba(255,255,255,0.04); font-size: 0.82rem; color: var(--text-secondary); }
        .request-row-right { display: grid; gap: 0.65rem; justify-items: flex-end; align-content: flex-start; flex-shrink: 0; }
        .status-pill { display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .status-pill-pending { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.28); }
        .status-pill-approved { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.28); }
        .status-pill-rejected { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.28); }
        .request-actions { display: flex; gap: 0.4rem; }
        .btn-danger-ghost { color: #f87171 !important; }
        .btn-danger-ghost:hover { background: rgba(239,68,68,0.1) !important; }
        .btn-danger { background: rgba(239,68,68,0.9) !important; }
        .stores-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
        .store-card { border: 1px solid var(--border-subtle); border-radius: 18px; overflow: hidden; background: rgba(255,255,255,0.03); display: flex; flex-direction: column; transition: border-color 0.18s ease, transform 0.18s ease; }
        .store-card:hover { border-color: rgba(124,108,255,0.4); transform: translateY(-2px); }
        .store-banner { position: relative; aspect-ratio: 21/9; display: flex; align-items: flex-end; padding: 0.85rem; }
        .store-logo { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.3); }
        .store-logo img { width: 100%; height: 100%; object-fit: cover; }
        .store-body { padding: 1rem; display: grid; gap: 0.5rem; }
        .store-head { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
        .store-status { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 999px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.06em; }
        .store-status-active { background: rgba(34,197,94,0.12); color: #22c55e; }
        .store-status-paused { background: rgba(148,163,184,0.12); color: #94a3b8; }
        .store-status-suspended { background: rgba(245,158,11,0.12); color: #f59e0b; }
        .store-status-closed { background: rgba(239,68,68,0.12); color: #f87171; }
        .store-slug { font-size: 0.82rem; color: var(--brand-primary-light); font-weight: 600; }
        .store-desc { margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .store-owner { display: flex; gap: 0.6rem; align-items: center; margin-top: 0.25rem; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); }
        .store-owner-avatar { width: 32px; height: 32px; border-radius: 999px; overflow: hidden; background: var(--gradient-brand); color: white; font-size: 0.72rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .store-owner-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .store-owner > div { display: grid; gap: 0.1rem; min-width: 0; }
        .store-owner strong { font-size: 0.88rem; }
        .store-owner span { font-size: 0.72rem; color: var(--text-muted); }
        .modal-backdrop { position: fixed; inset: 0; background: rgba(3,6,17,0.65); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 80; padding: 1rem; }
        .modal-card { width: min(520px, 100%); background: var(--bg-elevated, #181e30); border: 1px solid var(--border-subtle); border-radius: 20px; padding: 1.5rem; display: grid; gap: 1rem; box-shadow: 0 28px 80px rgba(0,0,0,0.55); }
        .modal-head { display: flex; align-items: center; gap: 0.6rem; }
        .modal-head h3 { margin: 0; font-size: 1.15rem; font-weight: 800; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; }
        .form-field { display: grid; gap: 0.4rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
        .form-field .input { font-weight: 500; color: var(--text-primary); }
        .spinning { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 1100px) {
          .queue-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 720px) {
          .queue-summary { grid-template-columns: 1fr; }
          .request-row { flex-direction: column; }
          .request-row-right { justify-items: flex-start; }
        }
      `}</style>
    </div>
  );
}
