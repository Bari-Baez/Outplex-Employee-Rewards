'use client';

import { useState, useMemo, useEffect } from 'react';
import { AlertCircle, ArrowLeft, ArrowUpRight, BarChart3, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Clock, Clock3, Edit2, Eye, EyeOff, ImageIcon, LayoutDashboard, Loader2, Lock, MoreVertical, Package, Palette, PencilLine, Plus, Save, Settings, ShoppingBag, Sparkles, Store as StoreIcon, Tag, Trash2, TrendingUp, Upload, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { useTransferState } from '@/components/uploads/useTransferState';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { EmployeeStore, EmployeeStoreProduct, EmployeeStoreRequest, Notification } from '@/types/database';
import { uploadFormDataWithProgress } from '@/lib/file-transfer';
import { createClient } from '@/lib/supabase/client';
import { formatDop } from '@/lib/utils';
import { proxifyMediaUrl } from '@/lib/media-proxy';

type ExtendedEmployeeStoreProduct = EmployeeStoreProduct & {
  status?: 'pending' | 'pending_review' | 'active' | 'rejected' | 'suspended' | 'out_of_stock' | 'draft';
  moderation_note?: string | null;
};

type TabKey = 'products' | 'orders' | 'profile' | 'dashboard';

interface ProductDraft {
  name: string;
  description: string;
  price_dop: string;
  cost_dop: string;
  profit_dop: string;
  stock: string;
  category: string;
  image_url: string;
  is_active: boolean;
}

function emptyDraft(): ProductDraft {
  return {
    name: '',
    description: '',
    price_dop: '',
    cost_dop: '0',
    profit_dop: '0',
    stock: '0',
    category: '',
    image_url: '',
    is_active: true,
  };
}

interface SellerOrderItem {
  id: string;
  product_id: string | null;
  name_snapshot: string;
  unit_price_dop: number;
  quantity: number;
}

interface SellerOrder {
  id: string;
  buyer_id: string;
  total_dop: number;
  status: 'pending' | 'ready_for_pickup' | 'completed' | 'cancelled';
  pickup_mode: 'immediate' | 'scheduled' | null;
  pickup_at: string | null;
  pickup_deadline: string | null;
  status_history: Array<{ status?: string; at?: string }>;
  created_at: string;
  updated_at: string;
  buyer?: { name?: string; email?: string; avatar_url?: string | null };
  items: SellerOrderItem[];
}

type StoreOperatingHours = NonNullable<EmployeeStore['operating_hours']>;

function toNonNegativeInt(value: string | number): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getCompletedAt(order: SellerOrder): Date | null {
  if (Array.isArray(order.status_history)) {
    for (let index = order.status_history.length - 1; index >= 0; index -= 1) {
      const entry = order.status_history[index];
      if (entry?.status === 'completed' && entry.at) {
        const completedAt = new Date(entry.at);
        if (!Number.isNaN(completedAt.getTime())) return completedAt;
      }
    }
  }

  if (order.status === 'completed') {
    const fallback = new Date(order.updated_at ?? order.created_at);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return null;
}


export function MyStoreClient({
  initialStore,
  initialLatestRequest,
  initialProducts,
  initialOrders = [],
  moderationNotifications = [],
  roleAllowed = true,
}: {
  initialStore: EmployeeStore | null;
  initialLatestRequest: EmployeeStoreRequest | null;
  initialProducts: ExtendedEmployeeStoreProduct[];
  initialOrders?: SellerOrder[];
  moderationNotifications?: Notification[];
  roleAllowed?: boolean;
}) {
  const router = useRouter();
  const [store, setStore] = useState<EmployeeStore | null>(initialStore);
  const [request, setRequest] = useState<EmployeeStoreRequest | null>(initialLatestRequest);
    const [products, setProducts] = useState<ExtendedEmployeeStoreProduct[]>(initialProducts);
  const suspendedProduct = products.find(p => p.status === 'suspended');
  const [showSuspensionAlert, setShowSuspensionAlert] = useState(!!suspendedProduct);
  const [orders, setOrders] = useState<SellerOrder[]>(initialOrders);
  const [notifications, setNotifications] = useState<Notification[]>(moderationNotifications);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);

  const needsRequest = !store && (!request || request.status === 'rejected' || request.status === 'approved');
  const isPending = !store && request?.status === 'pending';

  if (!roleAllowed) {
    return (
      <div className="my-store-shell animate-fade-in">
        <div className="my-store-header">
          <div>
            <h1 className="my-store-title">My Store</h1>
            <p className="my-store-subtitle">
              Manage your personal micro-store — list products in Dominican pesos, track inventory, and receive orders
              directly from fellow employees.
            </p>
          </div>
        </div>
        <div className="my-store-status my-store-status-info">
          <AlertCircle size={16} />
          <span>
            Moderators and admins cannot own employee stores. This feature is available only to regular employees.
          </span>
        </div>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="my-store-shell animate-fade-in">
      <div className="my-store-header">
        <div>
          <h1 className="my-store-title">My Store</h1>
          <p className="my-store-subtitle">
            Manage your personal micro-store — list products in Dominican pesos, track inventory, and receive orders
            directly from fellow employees.
          </p>
        </div>
        {store && (
          <div className={`store-pill store-pill-${store.status}`}>
            <Sparkles size={14} />
            {store.status === 'active' ? 'Active' : store.status === 'paused' ? 'Paused' : 'Closed'}
          </div>
        )}
      </div>

      {message && (
        <div className={`my-store-status my-store-status-${message.tone}`}>
          {message.tone === 'success' ? <CheckCircle2 size={16} /> : message.tone === 'danger' ? <AlertCircle size={16} /> : <Clock size={16} />}
          <span>{message.text}</span>
          <button className="icon-btn" onClick={() => setMessage(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {needsRequest && (
        <RequestAccessForm
          rejected={request?.status === 'rejected' ? request : null}
          onSubmitted={(req) => {
            setRequest(req);
            setMessage({ tone: 'success', text: 'Your request was submitted. A moderator will review it soon.' });
            router.refresh();
          }}
          onError={(err) => setMessage({ tone: 'danger', text: err })}
        />
      )}

      {isPending && request && <PendingRequestCard request={request} />}

      {store && (
        <StoreEditor
          store={store}
          products={products}
          orders={orders}
          onStoreUpdated={(next) => {
            setStore(next);
            router.refresh();
          }}
          onProductsChanged={(next) => {
            setProducts(next);
            router.refresh();
          }}
          onOrdersChanged={(next) => setOrders(next)}
          onMessage={(tone, text) => setMessage({ tone, text })}
        />
      )}

      {notifications.length > 0 && (
        <ModerationPopup
          notification={notifications[0]}
          onDismiss={async () => {
            const supabase = createClient();
            await supabase.from('notifications').update({ is_read: true }).eq('id', notifications[0].id);
            setNotifications((current) => current.slice(1));
          }}
        />
      )}

      {/* Suspension Overlay Modal */}
      {store?.status === 'suspended' && (
        <div className="modal-backdrop" style={{ zIndex: 9999 }}>
          <div className="modal-card" style={{ maxWidth: '480px', textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ 
              width: '80px', 
              height: '80px', 
              borderRadius: '999px', 
              background: 'rgba(239, 68, 68, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto 1.5rem',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              <Lock size={40} style={{ color: '#ef4444' }} />
            </div>
            
            <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171', marginBottom: '0.75rem' }}>Tienda Suspendida</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2rem' }}>
              Tu tienda ha sido suspendida temporalmente por un moderador.
            </p>

            <div style={{ 
              background: 'rgba(255,255,255,0.03)', 
              border: '1px solid var(--border-subtle)', 
              borderRadius: '16px', 
              padding: '1.25rem',
              marginBottom: '2rem',
              textAlign: 'left'
            }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.5rem' }}>Motivo de la suspensión:</div>
              <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: 1.5 }}>
                &ldquo;{store.suspend_reason || 'No se proporcionó un motivo específico.'}&rdquo;
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              De no estar en acuerdo contactarse con su superior para que someta un reporte.
            </p>
          </div>
        </div>
      )}

      {/* Product Suspension Alert */}
      {showSuspensionAlert && suspendedProduct && (
        <div className="modal-backdrop" style={{ zIndex: 9998 }}>
          <div className="modal-card animate-fade-in" style={{ maxWidth: '480px', textAlign: 'center', padding: '2rem 1.75rem' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
              <AlertCircle size={30} style={{ color: '#f59e0b' }} />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24', marginBottom: '0.5rem' }}>Producto Suspendido</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
              Un moderador suspendió el producto{' '}
              <strong style={{ color: 'var(--text-primary)' }}>&ldquo;{suspendedProduct.name}&rdquo;</strong>.
              No puedes agregar, publicar ni eliminar productos hasta que lo edites y vuelva a ser revisado.
            </p>
            {suspendedProduct.moderation_note && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
                <div style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.4rem' }}>Motivo:</div>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontStyle: 'italic', lineHeight: 1.5 }}>
                  &ldquo;{suspendedProduct.moderation_note}&rdquo;
                </div>
              </div>
            )}
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Edita el producto en la pestaña <strong>Productos</strong> para enviarlo a revisión nuevamente.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setShowSuspensionAlert(false)}
            >
              Entendido, ir a Productos
            </button>
          </div>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}
// ============================================================
// Request Access Form
// ============================================================
function RequestAccessForm({
  rejected,
  onSubmitted,
  onError,
}: {
  rejected: EmployeeStoreRequest | null;
  onSubmitted: (req: EmployeeStoreRequest) => void;
  onError: (message: string) => void;
}) {
  const [storeName, setStoreName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = storeName.trim().length >= 3 && description.trim().length >= 20 && accepted;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/employee-store/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_name: storeName.trim(),
          description: description.trim(),
          category: category.trim() || null,
          policy_accepted: accepted,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to submit request.');
      onSubmitted(json.request);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card request-card">
      <div className="request-card-head">
        <div className="request-icon"><StoreIcon size={20} /></div>
        <div>
          <h2 className="section-title">Request your personal store</h2>
          <p className="text-muted">
            Tell us about the micro-business you want to run. A moderator will review your request against company policy.
          </p>
        </div>
      </div>

      {rejected && (
        <div className="rejected-banner">
          <AlertCircle size={16} />
          <div>
            <strong>Your previous request was rejected.</strong>
            {rejected.review_notes && <p>Reason: {rejected.review_notes}</p>}
          </div>
        </div>
      )}

      <div className="form-grid">
        <label className="form-field">
          <span>Store name</span>
          <input
            className="input"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="e.g. Ana's Handmade Jewelry"
            maxLength={60}
          />
        </label>

        <label className="form-field">
          <span>Category (optional)</span>
          <input
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Accessories, Food, Crafts"
            maxLength={40}
          />
        </label>

        <label className="form-field form-field-wide">
          <span>Describe what you sell and why</span>
          <textarea
            className="input"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="At least 20 characters — include the type of products, delivery preferences, and any relevant info for the reviewer."
          />
          <span className="form-hint">{description.trim().length}/20 characters minimum</span>
        </label>
      </div>

      <label className="policy-check">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>
          I understand that my store will be reviewed by a moderator and must comply with Outplex policies. The platform is
          only an intermediary and does not process any payments — all transactions occur directly between the buyer and me.
        </span>
      </label>

      <div className="form-actions">
        <button className="btn btn-primary" disabled={!canSubmit || submitting} onClick={() => void submit()}>
          {submitting ? <Loader2 size={16} className="spinning" /> : <Save size={16} />}
          {submitting ? 'Submitting...' : 'Submit request'}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Pending state
// ============================================================
function PendingRequestCard({ request }: { request: EmployeeStoreRequest }) {
  return (
    <section className="card pending-card">
      <div className="pending-icon"><Clock size={22} /></div>
      <div>
        <h2 className="section-title">Your request is under review</h2>
        <p className="text-muted">
          Submitted on {new Date(request.created_at).toLocaleString()}. A moderator will approve or reject it shortly —
          you&apos;ll receive a notification as soon as there&apos;s an update.
        </p>
        <div className="pending-preview">
          <div><strong>Store name:</strong> {request.store_name}</div>
          {request.category && <div><strong>Category:</strong> {request.category}</div>}
          <div><strong>Description:</strong> {request.description}</div>
        </div>
      </div>
    </section>
  );
}
// ============================================================
// Uploader helper
// ============================================================
function ImageFileUpload({ value, onChange, placeholder = "URL or upload...", onUploadError }: { value: string, onChange: (v: string) => void, placeholder?: string, onUploadError?: (msg: string) => void }) {
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const uploading = transfer.state.phase === 'working';
  const doUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    transfer.start(file.name);
    e.target.value = ''; // clear input so same file can trigger changes
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'emp_store');
      const res = await uploadFormDataWithProgress<{ url?: string; error?: string }>({ url: '/api/upload', formData: fd, onProgress: transfer.setProgress });
      if (!res.ok || !res.json?.url) throw new Error(res.json?.error || 'Upload failed');
      onChange(res.json.url);
      transfer.succeed('Uploaded');
    } catch (err: unknown) {
      if (onUploadError) onUploadError(err instanceof Error ? err.message : 'Upload failed');
      transfer.fail('Failed');
    } finally {
    }
  }

  const id = `upload-${Math.random().toString(36).substr(2, 6)}`;
  return (
    <div style={{ display: 'grid', gap: '0.45rem', flex: 1 }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ flex: 1 }} disabled={uploading} />
        <input type="file" id={id} accept="image/*" style={{ display: 'none' }} onChange={doUpload} />
        <label htmlFor={id} className="btn btn-ghost" style={{ cursor: 'pointer', padding: '0 0.6rem', border: '1px solid var(--border-subtle)' }} title="Upload image">
          {uploading ? <Loader2 size={16} className="spinning" /> : <Upload size={16} />}
        </label>
      </div>
      <TransferProgress state={transfer.state} compact />
    </div>
  )
}

// ============================================================
// Editor (Products / Orders / Profile / Dashboard)
// ============================================================
function StoreEditor({
  store,
  products,
  orders,
  onStoreUpdated,
  onProductsChanged,
  onOrdersChanged,
  onMessage,
}: {
  store: EmployeeStore;
  products: ExtendedEmployeeStoreProduct[];
  orders: SellerOrder[];
  onStoreUpdated: (next: EmployeeStore) => void;
  onProductsChanged: (next: ExtendedEmployeeStoreProduct[]) => void;
  onOrdersChanged: (next: SellerOrder[]) => void;
  onMessage: (tone: 'success' | 'danger' | 'info', text: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>('products');

  const activeCount = products.filter((p) => p.is_active).length;
  const lowStockCount = products.filter((p) => p.is_active && p.stock <= 3).length;
  const totalValue = products.reduce((sum, p) => sum + p.price_dop * p.stock, 0);

  return (
    <>
      <div className="editor-stats">
        <div className="stat-card">
          <div className="stat-label">Products</div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-helper">{activeCount} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Low stock</div>
          <div className="stat-value">{lowStockCount}</div>
          <div className="stat-helper">Items with ≤ 3 units left</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Inventory value</div>
          <div className="stat-value">{formatDop(totalValue)}</div>
          <div className="stat-helper">Price × stock across catalog</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Store slug</div>
          <div className="stat-value stat-slug">@{store.slug}</div>
          <div className="stat-helper">Public section inside the employee store</div>
        </div>
      </div>

      <div className="editor-tabs">
        <button className={`btn ${tab === 'products' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('products')}>
          <Package size={16} /> Products
        </button>
        <button className={`btn ${tab === 'orders' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('orders')}>
          <ClipboardList size={16} /> Orders
          {orders.filter(o => o.status === 'pending').length > 0 && <span className="queue-badge" style={{ background: 'var(--brand-primary)', marginLeft: '0.4rem' }}>{orders.filter(o => o.status === 'pending').length}</span>}
        </button>
        <button className={`btn ${tab === 'profile' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('profile')}>
          <Palette size={16} /> Store profile
        </button>
        <button className={`btn ${tab === 'dashboard' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('dashboard')}>
          <BarChart3 size={16} /> Dashboard
        </button>
      </div>

      {tab === 'products' && (
        <ProductsTab store={store} products={products} onProductsChanged={onProductsChanged} onMessage={onMessage} />
      )}
      {tab === 'orders' && <OrdersTab orders={orders} onOrdersChanged={onOrdersChanged} onMessage={onMessage} />}
      {tab === 'profile' && <ProfileTab store={store} onStoreUpdated={onStoreUpdated} onMessage={onMessage} />}
      {tab === 'dashboard' && <DashboardTab products={products} orders={orders} />}
    </>
  );
}

// ============================================================
// Products Tab
// ============================================================
function ProductsTab({
  store,
  products,
  onProductsChanged,
  onMessage,
}: {
  store: EmployeeStore;
  products: ExtendedEmployeeStoreProduct[];
  onProductsChanged: (next: ExtendedEmployeeStoreProduct[]) => void;
  onMessage: (tone: 'success' | 'danger' | 'info', text: string) => void;
}) {
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft());
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ProductDraft>(emptyDraft());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const draftCost = toNonNegativeInt(draft.cost_dop);
  const draftProfit = toNonNegativeInt(draft.profit_dop);
  const draftTotal = draftCost + draftProfit;
  const isSuspended = products.some((product) => (product.status === 'suspended'));
  const hasBlockedModerationFlow = products.some((product) => (product.status === 'suspended') || product.status === 'pending_review');
  const canCreate =
    !hasBlockedModerationFlow &&
    draft.name.trim().length >= 2 &&
    draftTotal > 0 &&
    Number(draft.stock) >= 0;

  const create = async () => {
    setSubmitting(true);
    if (draftTotal <= 0) {
      onMessage('danger', 'Price must be greater than 0.');
      setSubmitting(false);
      return;
    }
    if (Number(draft.stock) < 0) {
      onMessage('danger', 'Stock cannot be negative.');
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch('/api/employee-store/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          price_dop: draftTotal,
          cost_dop: draftCost,
          stock: Number(draft.stock) || 0,
          category: draft.category.trim() || null,
          image_url: draft.image_url.trim() || null,
          is_active: draft.is_active,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to add product.');
      onProductsChanged([json.product, ...products]);
      setDraft(emptyDraft());
      onMessage('success', `"${json.product.name}" was added to your store.`);
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Unable to add product.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (product: ExtendedEmployeeStoreProduct) => {
    setEditingId(product.id);
      setEditDraft({
        name: product.name,
        description: product.description ?? '',
        price_dop: String(product.price_dop),
        cost_dop: String(product.cost_dop ?? 0),
        profit_dop: String(Math.max(0, product.price_dop - (product.cost_dop ?? 0))),
        stock: String(product.stock),
        category: product.category ?? '',
        image_url: product.image_url ?? '',
      is_active: product.is_active,
    });
  };

  const saveEdit = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/employee-store/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: (() => {
          const nextCost = toNonNegativeInt(editDraft.cost_dop);
          const nextProfit = toNonNegativeInt(editDraft.profit_dop);
          const nextTotal = nextCost + nextProfit;
          if (nextTotal <= 0) {
            throw new Error('Price must be greater than 0.');
          }
          if (Number(editDraft.stock) < 0) {
            throw new Error('Stock cannot be negative.');
          }
          return JSON.stringify({
            name: editDraft.name.trim(),
            description: editDraft.description.trim() || null,
            price_dop: nextTotal,
            cost_dop: nextCost,
            stock: Number(editDraft.stock),
            category: editDraft.category.trim() || null,
            image_url: editDraft.image_url.trim() || null,
            is_active: editDraft.is_active,
          });
        })(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to save product.');
      onProductsChanged(products.map((p) => (p.id === id ? json.product : p)));
      setEditingId(null);
      onMessage('success', json.product?.status === 'pending' ? 'Product sent back to moderation.' : 'Product updated.');
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Unable to save product.');
    } finally {
      setSavingId(null);
    }
  };

  const doDeleteProduct = async (id: string) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/employee-store/products/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to delete product.');
      onProductsChanged(products.filter((p) => p.id !== id));
      onMessage('success', 'Product deleted.');
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Unable to delete product.');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (product: ExtendedEmployeeStoreProduct) => {
    setSavingId(product.id);
    try {
      const res = await fetch(`/api/employee-store/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !product.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to update product.');
      onProductsChanged(products.map((p) => (p.id === product.id ? json.product : p)));
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Unable to update product.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="card editor-panel">
      <div className="editor-panel-head">
        <div>
          <h2 className="section-title">Products · {store.name}</h2>
          <p className="text-muted">Add items, set prices in DOP, and keep your inventory current.</p>
        </div>
      </div>

      <div className="add-product">
        {hasBlockedModerationFlow && (
          <div className="my-store-status my-store-status-info" style={{ marginBottom: '1rem' }}>
            <AlertCircle size={16} />
            <span>
              You cannot add new products while another product is suspended or pending review. Update the flagged product and wait for moderation.
            </span>
          </div>
        )}
        <div className="add-product-row">
          <label className="form-field" style={{ flex: 2 }}>
            <span>Name *</span>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Product name" />
          </label>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Costo de producción (DOP) *</span>
            <input
              className="input"
              type="number"
              min="0"
              value={draft.cost_dop}
              onChange={(e) => setDraft({ ...draft, cost_dop: e.target.value, price_dop: String(toNonNegativeInt(e.target.value) + toNonNegativeInt(draft.profit_dop)) })}
              placeholder="60"
            />
          </label>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Ganancia por producto (DOP) *</span>
            <input
              className="input"
              type="number"
              min="0"
              value={draft.profit_dop}
              onChange={(e) => setDraft({ ...draft, profit_dop: e.target.value, price_dop: String(toNonNegativeInt(draft.cost_dop) + toNonNegativeInt(e.target.value)) })}
              placeholder="60"
            />
          </label>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Total a cobrar (DOP)</span>
            <input className="input" type="text" value={formatDop(draftTotal)} readOnly />
          </label>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Stock</span>
            <input className="input" type="number" min="0" value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </label>
          <label className="form-field" style={{ flex: 1 }}>
            <span>Category</span>
            <input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="Optional" />
          </label>
        </div>
        <div className="add-product-row">
          <label className="form-field" style={{ flex: 2 }}>
            <span>Image</span>
            <ImageFileUpload value={draft.image_url} onChange={(url) => setDraft({ ...draft, image_url: url })} onUploadError={(msg) => onMessage('danger', msg)} placeholder="Image URL or PNG" />
          </label>
          <label className="form-field" style={{ flex: 3 }}>
            <span>Description</span>
            <input className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Short description" />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" disabled={!canCreate || submitting} onClick={() => void create()}>
              {submitting ? <Loader2 size={16} className="spinning" /> : <Plus size={16} />}
              Add product
            </button>
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="empty-state">
          <Package size={32} />
          <p>No products yet. Add your first one above to start selling.</p>
        </div>
      ) : (
        <div className="products-grid">
          {products.map((product) => {
            const isEditing = editingId === product.id;
            const isSaving = savingId === product.id;
            return (
              <article key={product.id} className={`product-card ${!product.is_active || (product.status === 'suspended') ? 'product-card-inactive' : ''} ${(product.status === 'suspended') ? 'product-card-suspended' : ''}`}>
                {(product.status === 'suspended') && (
                  <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px 10px 0 0', padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <AlertCircle size={14} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.78rem' }}>
                      <strong style={{ color: '#fbbf24', display: 'block', marginBottom: '0.15rem' }}>Suspendido por moderación</strong>
                      {product.moderation_note && <span style={{ color: '#fcd34d' }}>{product.moderation_note}</span>}
                      <span style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>Edita este producto y envíalo a revisión para reactivarlo. No puedes agregar ni eliminar productos mientras esté suspendido.</span>
                    </div>
                  </div>
                )}
                {!(product.status === 'suspended') && product.status === 'pending_review' && (
                  <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.28)', borderRadius: '10px 10px 0 0', padding: '0.5rem 0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', color: '#a5b4fc', fontWeight: 600 }}>En revisión por moderación</span>
                  </div>
                )}
                {!(product.status === 'suspended') && product.status === 'rejected' && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: '10px 10px 0 0', padding: '0.6rem 0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <AlertCircle size={14} style={{ color: '#f87171', flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '0.78rem' }}>
                      <strong style={{ color: '#fca5a5', display: 'block', marginBottom: '0.15rem' }}>Rechazado por moderación</strong>
                      <span style={{ color: 'var(--text-muted)' }}>Edita este producto para enviarlo a revisión nuevamente.</span>
                    </div>
                  </div>
                )}
                <div className="product-thumb">
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxifyMediaUrl(product.image_url)} alt={product.name} />
                  ) : (
                    <div className="product-thumb-fallback"><ImageIcon size={20} /></div>
                  )}
                  {product.stock === 0 && product.is_active && <span className="low-stock-badge" style={{ background: '#ef4444', color: '#fff' }}>Out of stock</span>}
                  {product.stock > 0 && product.stock <= 3 && product.is_active && <span className="low-stock-badge">Low stock</span>}
                </div>

                {isEditing ? (
                  <div className="product-edit">
                    <input className="input" value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} placeholder="Name" />
                    <input className="input" value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} placeholder="Description" />
                    <div className="product-edit-row">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={editDraft.cost_dop}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            cost_dop: e.target.value,
                            price_dop: String(toNonNegativeInt(e.target.value) + toNonNegativeInt(editDraft.profit_dop)),
                          })
                        }
                        placeholder="Costo"
                      />
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={editDraft.profit_dop}
                        onChange={(e) =>
                          setEditDraft({
                            ...editDraft,
                            profit_dop: e.target.value,
                            price_dop: String(toNonNegativeInt(editDraft.cost_dop) + toNonNegativeInt(e.target.value)),
                          })
                        }
                        placeholder="Ganancia"
                      />
                      <input className="input" type="number" min="0" value={editDraft.stock} onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })} placeholder="Stock" />
                    </div>
                    <input className="input" value={formatDop(toNonNegativeInt(editDraft.cost_dop) + toNonNegativeInt(editDraft.profit_dop))} readOnly />
                    <input className="input" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} placeholder="Category" />
                    <ImageFileUpload value={editDraft.image_url} onChange={(url) => setEditDraft({ ...editDraft, image_url: url })} onUploadError={(msg) => onMessage('danger', msg)} placeholder="Image URL or upload" />
                    <div className="product-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      <button className="btn btn-primary btn-sm" disabled={isSaving} onClick={() => void saveEdit(product.id)}>
                        {isSaving ? <Loader2 size={14} className="spinning" /> : <Save size={14} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="product-body">
                    <div className="product-head">
                      <strong>{product.name}</strong>
                      {product.category && <span className="product-category"><Tag size={11} /> {product.category}</span>}
                    </div>
                    {product.description && <p className="product-desc">{product.description}</p>}
                    <div className="product-meta">
                      <span className="product-price">{formatDop(product.price_dop)}</span>
                      <span className={`product-stock ${product.stock === 0 ? 'product-stock-empty' : ''}`}>{product.stock} in stock</span>
                    </div>
                    <div className="metric-helper">
                      Costo: {formatDop(product.cost_dop ?? 0)} · Ganancia: {formatDop(Math.max(0, product.price_dop - (product.cost_dop ?? 0)))}
                    </div>
                    <div className="product-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(product)} disabled={isSaving || (product.status === 'suspended') || product.status === 'pending_review'}>
                        {product.is_active ? 'Hide' : 'Show'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(product)} disabled={isSaving}>
                        <PencilLine size={13} /> Edit
                      </button>
                      <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => setDeleteConfirmId(product.id)} disabled={isSaving || isSuspended} title={isSuspended ? 'No puedes eliminar productos mientras hay uno suspendido' : undefined}>
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {deleteConfirmId && (
        <ConfirmDialog
          title="Delete product"
          body="This will permanently remove the product. This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={savingId === deleteConfirmId}
          onConfirm={async () => {
            const id = deleteConfirmId;
            setDeleteConfirmId(null);
            await doDeleteProduct(id);
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </section>
  );
}

function ModerationPopup({
  notification,
  onDismiss,
}: {
  notification: Notification;
  onDismiss: () => void | Promise<void>;
}) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 9998 }}>
      <div className="modal-card" style={{ maxWidth: '520px' }}>
        <div className="modal-head">
          <AlertCircle size={22} style={{ color: '#f59e0b' }} />
          <h3>{notification.title}</h3>
        </div>
        <p className="text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
          {notification.message}
        </p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => void onDismiss()}>
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Orders Tab (placeholder until Phase 4)
// ============================================================
function OrdersTab({
  orders,
  onOrdersChanged,
  onMessage,
}: {
  orders: SellerOrder[];
  onOrdersChanged: (n: SellerOrder[]) => void;
  onMessage: (tone: 'success' | 'danger' | 'info', text: string) => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pickupByOrder, setPickupByOrder] = useState<Record<string, { mode: 'immediate' | 'scheduled'; pickupAt: string; pickupDeadline: string }>>({});

  const getPickupDraft = (order: SellerOrder) => {
    const fromState = pickupByOrder[order.id];
    if (fromState) return fromState;
    return {
      mode: order.pickup_mode ?? 'immediate',
      pickupAt: toDateTimeLocalValue(order.pickup_at),
      pickupDeadline: toDateTimeLocalValue(order.pickup_deadline),
    };
  };

  const patchOrder = async (
    orderId: string,
    payload: Record<string, unknown>,
    successMessage: string,
  ) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/employee-store/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to update order.');
      onOrdersChanged(orders.map((o) => (o.id === orderId ? json.order : o)));
      onMessage('success', successMessage);
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Error updating order');
    } finally {
      setUpdatingId(null);
    }
  };

  const markReady = async (order: SellerOrder) => {
    const draft = getPickupDraft(order);
    const pickupAtIso = toIsoOrNull(draft.pickupAt);
    const pickupDeadlineIso = toIsoOrNull(draft.pickupDeadline);

    if (draft.mode === 'scheduled') {
      if (!pickupAtIso || !pickupDeadlineIso) {
        onMessage('danger', 'Debes seleccionar fecha de retiro y fecha límite.');
        return;
      }
      if (new Date(pickupDeadlineIso).getTime() <= new Date(pickupAtIso).getTime()) {
        onMessage('danger', 'La fecha límite debe ser después de la fecha de retiro.');
        return;
      }
    }

    await patchOrder(
      order.id,
      {
        status: 'ready_for_pickup',
        pickupMode: draft.mode,
        pickupAt: draft.mode === 'scheduled' ? pickupAtIso : null,
        pickupDeadline: draft.mode === 'scheduled' ? pickupDeadlineIso : null,
      },
      'Pedido marcado como listo para retirar.',
    );
  };

  const markCompleted = async (orderId: string) =>
    patchOrder(orderId, { status: 'completed' }, 'Venta completada y marcada como ganancia.');

  const markCancelled = async (orderId: string) =>
    patchOrder(orderId, { status: 'cancelled' }, 'Venta cancelada.');

  return (
    <section className="card editor-panel">
      <div className="editor-panel-head">
        <div>
          <h2 className="section-title">Incoming orders</h2>
          <p className="text-muted">Manage orders from your colleagues. Mark them as ready when they can be picked up.</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">
          <ClipboardList size={32} />
          <p>No orders yet. Make sure your products are active.</p>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map((order) => (
            <article key={order.id} className={`order-row-item status-${order.status}`}>
              <div className="order-row-main">
                <div className="buyer-info">
                  <div className="buyer-avatar">
                    {order.buyer?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxifyMediaUrl(order.buyer.avatar_url)} alt="" />
                    ) : (
                      <span>{order.buyer?.name?.[0] || '?'}</span>
                    )}
                  </div>
                  <div>
                    <strong>{order.buyer?.name || 'Comprador desconocido'}</strong>
                    <span>{order.buyer?.email}</span>
                  </div>
                </div>
                <div className="order-summary">
                  <div className="order-price">{formatDop(order.total_dop)}</div>
                  <div className="order-date">{new Date(order.created_at).toLocaleDateString()}</div>
                </div>
                <div className="order-actions-cell">
                  {order.status === 'pending' && (
                    <div style={{ display: 'grid', gap: '0.4rem', width: '100%', maxWidth: 320 }}>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          className={`btn btn-sm ${getPickupDraft(order).mode === 'immediate' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setPickupByOrder((prev) => ({ ...prev, [order.id]: { ...getPickupDraft(order), mode: 'immediate' } }))}
                          disabled={updatingId === order.id}
                        >
                          Listo para retirar
                        </button>
                        <button
                          className={`btn btn-sm ${getPickupDraft(order).mode === 'scheduled' ? 'btn-primary' : 'btn-ghost'}`}
                          onClick={() => setPickupByOrder((prev) => ({ ...prev, [order.id]: { ...getPickupDraft(order), mode: 'scheduled' } }))}
                          disabled={updatingId === order.id}
                        >
                          Programar retiro
                        </button>
                      </div>

                      {getPickupDraft(order).mode === 'scheduled' && (
                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                          <label className="meta-label">Hora de retiro</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <ModernDatePicker
                              date={getPickupDraft(order).pickupAt.split('T')[0]}
                              onDateChange={v => setPickupByOrder(prev => ({
                                ...prev,
                                [order.id]: { ...getPickupDraft(order), pickupAt: `${v}T${getPickupDraft(order).pickupAt.split('T')[1] || '09:00'}` }
                              }))}
                            />
                            <ModernTimePicker
                              time={getPickupDraft(order).pickupAt.split('T')[1]}
                              onTimeChange={v => setPickupByOrder(prev => ({
                                ...prev,
                                [order.id]: { ...getPickupDraft(order), pickupAt: `${getPickupDraft(order).pickupAt.split('T')[0] || new Date().toISOString().split('T')[0]}T${v}` }
                              }))}
                            />
                          </div>

                          <label className="meta-label">Límite de retiro</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <ModernDatePicker
                              date={getPickupDraft(order).pickupDeadline.split('T')[0]}
                              onDateChange={v => setPickupByOrder(prev => ({
                                ...prev,
                                [order.id]: { ...getPickupDraft(order), pickupDeadline: `${v}T${getPickupDraft(order).pickupDeadline.split('T')[1] || '17:00'}` }
                              }))}
                            />
                            <ModernTimePicker
                              time={getPickupDraft(order).pickupDeadline.split('T')[1]}
                              onTimeChange={v => setPickupByOrder(prev => ({
                                ...prev,
                                [order.id]: { ...getPickupDraft(order), pickupDeadline: `${getPickupDraft(order).pickupDeadline.split('T')[0] || new Date().toISOString().split('T')[0]}T${v}` }
                              }))}
                            />
                          </div>
                        </div>
                      )}

                      <button className="btn btn-primary btn-sm" disabled={updatingId === order.id} onClick={() => void markReady(order)}>
                        {updatingId === order.id ? <Loader2 size={14} className="spinning" /> : <Sparkles size={14} />}
                        Confirmar retiro
                      </button>
                      <button className="btn btn-ghost btn-sm btn-danger-ghost" disabled={updatingId === order.id} onClick={() => void markCancelled(order.id)}>
                        Cancelar venta
                      </button>
                    </div>
                  )}
                  {order.status === 'ready_for_pickup' && (
                    <div style={{ display: 'grid', gap: '0.35rem', width: '100%', maxWidth: 220 }}>
                      <button className="btn btn-primary btn-sm" style={{ background: '#22c55e' }} disabled={updatingId === order.id} onClick={() => void markCompleted(order.id)}>
                        {updatingId === order.id ? <Loader2 size={14} className="spinning" /> : <CheckCircle2 size={14} />}
                        Completar venta
                      </button>
                      <button className="btn btn-ghost btn-sm btn-danger-ghost" disabled={updatingId === order.id} onClick={() => void markCancelled(order.id)}>
                        Cancelar venta
                      </button>
                    </div>
                  )}
                  {order.status === 'completed' && <span className="status-label-done">Completado</span>}
                  {order.status === 'cancelled' && <span className="status-label-done" style={{ color: '#f87171' }}>Cancelado</span>}
                </div>
              </div>
              <div className="order-items-minilist">
                {order.items.map((item) => (
                  <div key={item.id} className="item-mini">
                    <span>{item.quantity}x {item.name_snapshot}</span>
                    <span>{formatDop(item.unit_price_dop * item.quantity)}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================
// Profile Tab
// ============================================================
function ProfileTab({
  store,
  onStoreUpdated,
  onMessage,
}: {
  store: EmployeeStore;
  onStoreUpdated: (next: EmployeeStore) => void;
  onMessage: (tone: 'success' | 'danger' | 'info', text: string) => void;
}) {
  const [draft, setDraft] = useState({
    name: store.name,
    description: store.description ?? '',
    category: store.category ?? '',
    banner_image: store.banner_image ?? '',
    logo_image: store.logo_image ?? '',
    accent_color: store.accent_color ?? '#7c6cff',
    status: store.status,
    is_open: store.is_open ?? true,
    operating_hours: (store.operating_hours as StoreOperatingHours | null) || {
      monday: { isOpen: true, open: '09:00', close: '17:00' },
      tuesday: { isOpen: true, open: '09:00', close: '17:00' },
      wednesday: { isOpen: true, open: '09:00', close: '17:00' },
      thursday: { isOpen: true, open: '09:00', close: '17:00' },
      friday: { isOpen: true, open: '09:00', close: '17:00' },
      saturday: { isOpen: false, open: '09:00', close: '17:00' },
      sunday: { isOpen: false, open: '09:00', close: '17:00' },
    },
  });
  const [saving, setSaving] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);

  const daysArr = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const visibleDays = [
    daysArr[carouselIndex % 7],
    daysArr[(carouselIndex + 1) % 7],
    daysArr[(carouselIndex + 2) % 7]
  ];

  const nextCarousel = () => {
    setCarouselIndex((prev) => (prev + 1) % 7);
  };
  const prevCarousel = () => {
    setCarouselIndex((prev) => (prev - 1 + 7) % 7);
  };

  const dirty = useMemo(() => {
    return (
      draft.name.trim() !== store.name ||
      draft.description !== (store.description ?? '') ||
      draft.category !== (store.category ?? '') ||
      draft.banner_image !== (store.banner_image ?? '') ||
      draft.logo_image !== (store.logo_image ?? '') ||
      draft.accent_color !== (store.accent_color ?? '#7c6cff') ||
      draft.status !== store.status ||
      draft.is_open !== store.is_open ||
      JSON.stringify(draft.operating_hours) !== JSON.stringify(store.operating_hours)
    );
  }, [draft, store]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/employee-store/my-store', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          category: draft.category.trim() || null,
          banner_image: draft.banner_image.trim() || null,
          logo_image: draft.logo_image.trim() || null,
          accent_color: draft.accent_color,
          status: draft.status,
          is_open: draft.is_open,
          operating_hours: draft.operating_hours,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Unable to save store profile.');
      onStoreUpdated(json.store);
      onMessage('success', 'Store profile updated.');
    } catch (err) {
      onMessage('danger', err instanceof Error ? err.message : 'Unable to save store profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card editor-panel">
      <div className="editor-panel-head">
        <div>
          <h2 className="section-title">Store profile</h2>
          <p className="text-muted">Customize how your store appears to other employees.</p>
        </div>
        <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? <Loader2 size={16} className="spinning" /> : <Save size={16} />}
          Save changes
        </button>
      </div>

      <div
        className="profile-preview"
        style={{
          background: draft.banner_image
            ? `linear-gradient(180deg, rgba(5,8,16,0.2), rgba(5,8,16,0.82)), url(${draft.banner_image}) center/cover`
            : `linear-gradient(135deg, ${draft.accent_color}22, rgba(5,8,16,0.65))`,
          borderColor: `${draft.accent_color}55`,
        }}
      >
        <div className="profile-preview-logo" style={{ background: draft.accent_color }}>
          {draft.logo_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proxifyMediaUrl(draft.logo_image)} alt="" />
          ) : (
            <StoreIcon size={20} />
          )}
        </div>
        <div className="profile-preview-text">
          <strong>{draft.name || 'Untitled store'}</strong>
          <span>{draft.category || 'Uncategorized'}</span>
          {draft.description && <p>{draft.description}</p>}
        </div>
      </div>

      <div className="form-grid">
        <label className="form-field">
          <span>Store name</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="form-field">
          <span>Category</span>
          <input className="input" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} placeholder="e.g. Accessories" />
        </label>
        <label className="form-field form-field-wide">
          <span>Description</span>
          <textarea className="input" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <label className="form-field">
          <span>Banner image</span>
          <ImageFileUpload value={draft.banner_image} onChange={(url) => setDraft({ ...draft, banner_image: url })} onUploadError={(msg) => onMessage('danger', msg)} placeholder="Banner Image URL" />
        </label>
        <label className="form-field">
          <span>Logo image</span>
          <ImageFileUpload value={draft.logo_image} onChange={(url) => setDraft({ ...draft, logo_image: url })} onUploadError={(msg) => onMessage('danger', msg)} placeholder="Logo Image URL" />
        </label>
        <label className="form-field">
          <span>Accent color</span>
          <input className="input" type="color" value={draft.accent_color} onChange={(e) => setDraft({ ...draft, accent_color: e.target.value })} />
        </label>
        <div className="form-field">
          <span>Visibilidad</span>
          <select
            className="input"
            value={draft.status === 'paused' ? 'paused' : 'visible'}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'paused') {
                setDraft({ ...draft, status: 'paused' });
              } else {
                // Return to whatever operation mode was set before (active or scheduled)
                setDraft({ ...draft, status: draft.status === 'paused' ? 'active' : draft.status });
              }
            }}
          >
            <option value="visible">Publicada (Visible para Todos)</option>
            <option value="paused">Oculta (Solo Privada)</option>
          </select>
          <p className="field-helper" style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
            {draft.status === 'paused' ? 'Nadie puede entrar a tu tienda.' : 'Tu tienda es visible en el listado principal.'}
          </p>
        </div>

        <div className="form-field">
          <span>Modo de Operación</span>
          <select
            className="input"
            disabled={draft.status === 'paused'}
            style={{
              transition: 'all 0.2s ease',
              ...(draft.status === 'paused'
                ? { opacity: 0.5, borderColor: 'var(--border-subtle)' }
                : !draft.is_open
                ? { background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }
                : draft.status === 'scheduled'
                ? { background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.4)', color: '#facc15' }
                : { background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.4)', color: '#4ade80' }
              )
            }}
            value={!draft.is_open ? 'manual_closed' : (draft.status === 'scheduled' ? 'scheduled' : 'active')}
            onChange={(e) => {
              const val = e.target.value as 'manual_closed' | 'scheduled' | 'active';
              if (val === 'manual_closed') {
                setDraft({ ...draft, is_open: false });
              } else if (val === 'scheduled') {
                setDraft({ ...draft, is_open: true, status: 'scheduled' });
              } else {
                setDraft({ ...draft, is_open: true, status: 'active' });
              }
            }}
          >
            <option value="active" style={{ background: '#0f172a', color: '#4ade80' }}>● Abierta 24/7 (Siempre Disponible)</option>
            <option value="scheduled" style={{ background: '#0f172a', color: '#facc15' }}>● Programada (Sigue tu Horario)</option>
            <option value="manual_closed" style={{ background: '#0f172a', color: '#f87171' }}>● Cerrada (Manual / Override)</option>
          </select>
          <p className="field-helper" style={{ marginTop: '0.4rem', fontSize: '0.75rem' }}>
            {draft.status === 'paused' ? 'Habilita la visibilidad para cambiar el modo.' : 
             !draft.is_open ? 'La tienda mostrará un aviso de cerrada permanentemente.' :
             draft.status === 'scheduled' ? 'Se abrirá automáticamente según las horas debajo.' :
             'La tienda estará abierta todo el día, todos los días.'}
          </p>
        </div>
      </div>

      <div 
        className="card" 
        style={{ 
          marginTop: '1rem', 
          border: '1px solid var(--border-subtle)', 
          background: 'rgba(13, 18, 38, 0.4)',
          position: 'relative',
          transition: 'all 0.3s ease',
          ...(draft.status !== 'scheduled' || !draft.is_open ? {
            opacity: 0.5,
            filter: 'grayscale(0.8) blur(0.5px)',
            pointerEvents: 'none',
            userSelect: 'none'
          } : {})
        }}
      >
        {/* Overlay for locked state */}
        {(draft.status !== 'scheduled' || !draft.is_open) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.05)',
            borderRadius: 'inherit'
          }}>
            <div style={{
              padding: '0.6rem 1.2rem',
              background: 'rgba(15,23,42,0.9)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              fontWeight: 600,
              boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)'
            }}>
              Solo disponible en modo &ldquo;Programada&rdquo;
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.2rem' }}>
          <div>
            <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '0.2rem' }}>Horario de Operación</h3>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Configura tus horas estándar. Si la tienda se marca como &ldquo;Cerrada&rdquo; arriba, este horario se ignorará.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ borderRadius: '12px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)', fontWeight: 600 }}
            onClick={() => {
              const allOpen = { ...draft.operating_hours };
              Object.keys(allOpen).forEach(day => {
                allOpen[day] = { isOpen: true, open: '00:00', close: '23:59' };
              });
              setDraft({ ...draft, operating_hours: allOpen });
              onMessage('info', 'Schedule set to 24/7 Always Open.');
            }}
          >
            <Clock size={16} /> 24/7 Siempre Abierta
          </button>
        </div>
        <div className="carousel-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" className="carousel-nav-btn" onClick={prevCarousel}>
            <ChevronLeft size={24} />
          </button>
          
          <div className="comp-schedule-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1rem',
            flex: 1,
            overflow: 'hidden'
          }}>
            {visibleDays.map((day) => {
              const config = draft.operating_hours[day] || { isOpen: true, open: '09:00', close: '17:00' };
              return (
                <div key={day} className={`comp-schedule-bubble ${config.isOpen ? 'comp-schedule-bubble-enabled' : 'comp-schedule-bubble-disabled'}`} style={{ background: config.isOpen ? 'rgba(124, 108, 255, 0.05)' : 'rgba(255,255,255,0.02)' }}>
                  <div className={`comp-schedule-banner ${config.isOpen ? 'comp-schedule-banner-enabled' : 'comp-schedule-banner-disabled'}`} style={{ padding: '0.75rem 1rem' }}>
                    <span style={{ fontWeight: 700, letterSpacing: '0.02em' }}>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                    <button
                      type="button"
                      className={`comp-state-chip ${config.isOpen ? 'comp-state-chip-on' : 'comp-state-chip-off'}`}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '8px', cursor: 'pointer' }}
                      onClick={() => setDraft(d => ({ ...d, operating_hours: { ...d.operating_hours, [day]: { ...config, isOpen: !config.isOpen } } }))}
                    >
                      {config.isOpen ? 'Abierto' : 'Cerrado'}
                    </button>
                  </div>
                  <div className="comp-schedule-bubble-body" style={{ padding: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', opacity: config.isOpen ? 1 : 0.3, pointerEvents: config.isOpen ? 'auto' : 'none', transition: 'all 0.2s ease' }}>
                      <ModernTimePicker
                        label="Abre"
                        time={config.open}
                        onTimeChange={v => setDraft(d => ({ ...d, operating_hours: { ...d.operating_hours, [day]: { ...config, open: v } } }))}
                      />
                      <ModernTimePicker
                        label="Cierra"
                        time={config.close}
                        onTimeChange={v => setDraft(d => ({ ...d, operating_hours: { ...d.operating_hours, [day]: { ...config, close: v } } }))}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button type="button" className="carousel-nav-btn" onClick={nextCarousel}>
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Dashboard Tab (placeholder until Phase 4)
// ============================================================
function DashboardTab({ products, orders }: { products: ExtendedEmployeeStoreProduct[]; orders: SellerOrder[] }) {
  const active = products.filter((p) => p.is_active);
  const totalStock = active.reduce((sum, p) => sum + p.stock, 0);
  const avgPrice = active.length > 0 ? active.reduce((s, p) => s + p.price_dop, 0) / active.length : 0;
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const productCostMap = new Map(products.map((product) => [product.id, product.cost_dop ?? 0]));

  const completedThisMonth = orders.filter((order) => {
    const completedAt = getCompletedAt(order);
    return Boolean(
      completedAt &&
      completedAt.getMonth() === currentMonth &&
      completedAt.getFullYear() === currentYear
    );
  });
  const cancelledThisMonth = orders.filter((order) => {
    if (order.status !== 'cancelled') return false;
    const updatedAt = new Date(order.updated_at ?? order.created_at);
    return updatedAt.getMonth() === currentMonth && updatedAt.getFullYear() === currentYear;
  });

  const grossSales = completedThisMonth.reduce((sum, order) => sum + order.total_dop, 0);
  const reinvestment = completedThisMonth.reduce((sum, order) => {
    return (
      sum +
      (order.items ?? []).reduce(
        (orderSum, item) => orderSum + (productCostMap.get(item.product_id ?? '') ?? 0) * item.quantity,
        0,
      )
    );
  }, 0);
  const netProfit = Math.max(0, grossSales - reinvestment);
  const uniqueBuyers = new Set(completedThisMonth.map((order) => order.buyer_id)).size;
  const avgTicket = completedThisMonth.length > 0 ? Math.round(grossSales / completedThisMonth.length) : 0;

  const dailyBars = completedThisMonth.reduce<Record<string, number>>((acc, order) => {
    const completedAt = getCompletedAt(order);
    if (!completedAt) return acc;
    const day = String(completedAt.getDate()).padStart(2, '0');
    acc[day] = (acc[day] ?? 0) + order.total_dop;
    return acc;
  }, {});
  const maxDayValue = Math.max(1, ...Object.values(dailyBars));

  return (
    <section className="card editor-panel">
      <div className="editor-panel-head">
        <div>
          <h2 className="section-title">Store dashboard</h2>
          <p className="text-muted">Revenue tracking will appear here once employees start placing orders.</p>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-metric">
          <div className="metric-label">Active listings</div>
          <div className="metric-value">{active.length}</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Total stock on hand</div>
          <div className="metric-value">{totalStock}</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Average price</div>
          <div className="metric-value">{formatDop(Math.round(avgPrice))}</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Ventas del mes</div>
          <div className="metric-value">{formatDop(grossSales)}</div>
          <div className="metric-helper">{completedThisMonth.length} ventas completadas</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Ganancia neta (mes)</div>
          <div className="metric-value">{formatDop(netProfit)}</div>
          <div className="metric-helper">Dinero para ti</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Reinversión (mes)</div>
          <div className="metric-value">{formatDop(reinvestment)}</div>
          <div className="metric-helper">Presupuesto para producción</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Compradores únicos</div>
          <div className="metric-value">{uniqueBuyers}</div>
          <div className="metric-helper">Clientes que compraron este mes</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Ticket promedio</div>
          <div className="metric-value">{formatDop(avgTicket)}</div>
          <div className="metric-helper">Promedio por venta completada</div>
        </div>
        <div className="dashboard-metric">
          <div className="metric-label">Ventas canceladas</div>
          <div className="metric-value">{cancelledThisMonth.length}</div>
          <div className="metric-helper">Cancelaciones del mes</div>
        </div>
      </div>
      <div className="card" style={{ marginTop: '0.5rem', padding: '1rem' }}>
        <div className="section-title" style={{ fontSize: '1rem' }}>Gráfico rápido de ventas (mes actual)</div>
        {Object.keys(dailyBars).length === 0 ? (
          <p className="text-muted" style={{ marginTop: '0.6rem' }}>Aún no hay ventas completadas este mes.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.45rem', marginTop: '0.8rem' }}>
            {Object.entries(dailyBars)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([day, total]) => (
                <div key={day} style={{ display: 'grid', gridTemplateColumns: '46px 1fr 95px', gap: '0.6rem', alignItems: 'center' }}>
                  <span className="text-muted">Día {day}</span>
                  <div style={{ width: '100%', height: 10, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(5, (total / maxDayValue) * 100)}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #7c6cff, #06b6d4)',
                      }}
                    />
                  </div>
                  <strong>{formatDop(total)}</strong>
                </div>
              ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = `
  .my-store-shell { max-width: 1320px; display: grid; gap: 1rem; }
  .my-store-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
  .my-store-title { font-size: 1.875rem; font-weight: 800; margin: 0 0 0.5rem; }
  .my-store-subtitle { margin: 0; color: var(--text-secondary); line-height: 1.7; max-width: 72ch; }
  .store-pill { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.5rem 0.9rem; border-radius: 999px; font-weight: 700; font-size: 0.82rem; }
  .store-pill-active { background: rgba(34,197,94,0.12); color: #22c55e; border: 1px solid rgba(34,197,94,0.28); }
  .store-pill-paused { background: rgba(245,158,11,0.12); color: #f59e0b; border: 1px solid rgba(245,158,11,0.28); }
  .store-pill-closed { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.28); }
  .my-store-status { display: flex; align-items: center; gap: 0.65rem; padding: 0.9rem 1rem; border-radius: 14px; position: relative; }
  .my-store-status-success { background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.22); }
  .my-store-status-danger { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.22); }
  .my-store-status-info { background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.22); }

  .carousel-nav-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
  }
  .carousel-nav-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    transform: scale(1.1);
  }
  .carousel-nav-btn:active {
    transform: scale(0.95);
  }

  .my-store-status .icon-btn { margin-left: auto; background: transparent; border: none; color: inherit; cursor: pointer; padding: 0.25rem; }
  .section-title { margin: 0; font-size: 1.2rem; font-weight: 800; }
  .request-card { display: grid; gap: 1.1rem; }
  .request-card-head { display: flex; gap: 1rem; align-items: flex-start; }
  .request-icon { width: 44px; height: 44px; border-radius: 14px; background: var(--gradient-brand); color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 10px 26px rgba(99,102,241,0.3); }
  .rejected-banner { display: flex; gap: 0.75rem; padding: 0.85rem 1rem; border-radius: 12px; background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.24); align-items: flex-start; }
  .rejected-banner p { margin: 0.25rem 0 0; font-size: 0.88rem; color: var(--text-secondary); }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
  .form-field { display: grid; gap: 0.4rem; font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
  .form-field .input { font-weight: 500; color: var(--text-primary); }
  .form-field-wide { grid-column: 1 / -1; }
  .form-hint { font-size: 0.75rem; color: var(--text-muted); font-weight: 500; }
  .policy-check { display: flex; gap: 0.75rem; align-items: flex-start; padding: 1rem; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.02); font-size: 0.88rem; line-height: 1.6; color: var(--text-secondary); }
  .policy-check input { margin-top: 0.2rem; width: 16px; height: 16px; flex-shrink: 0; }
  .form-actions { display: flex; justify-content: flex-end; }
  .pending-card { display: flex; gap: 1rem; align-items: flex-start; }
  .pending-icon { width: 46px; height: 46px; border-radius: 14px; background: rgba(245,158,11,0.14); color: #f59e0b; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border: 1px solid rgba(245,158,11,0.28); }
  .pending-preview { margin-top: 0.85rem; display: grid; gap: 0.4rem; padding: 0.9rem; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); font-size: 0.88rem; line-height: 1.55; }
  .pending-preview strong { color: var(--text-primary); }
  .editor-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
  .stat-card { padding: 1rem; border-radius: 18px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
  .stat-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; }
  .stat-value { font-size: 1.65rem; font-weight: 800; margin-top: 0.35rem; }
  .stat-slug { font-size: 1.1rem; color: var(--brand-primary-light); }
  .stat-helper { margin-top: 0.35rem; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.5; }
  .editor-tabs { display: flex; gap: 0.75rem; flex-wrap: wrap; padding-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); }
  .editor-panel { display: grid; gap: 1rem; }
  .editor-panel-head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
  .add-product { display: grid; gap: 0.75rem; padding: 1rem; border-radius: 14px; border: 1px solid var(--border-subtle); background: rgba(124,108,255,0.04); }
  .add-product-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .add-product-row .form-field { min-width: 0; }
  .products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  .product-card { border: 1px solid var(--border-subtle); border-radius: 18px; overflow: hidden; background: rgba(255,255,255,0.03); display: flex; flex-direction: column; transition: border-color 0.18s ease, transform 0.18s ease; }
  .product-card:hover { border-color: rgba(124,108,255,0.4); transform: translateY(-2px); }
  .product-card-inactive { opacity: 0.65; }
  .product-card-suspended { border-color: rgba(245,158,11,0.4) !important; opacity: 1; }
  .product-thumb { position: relative; aspect-ratio: 4 / 3; background: rgba(255,255,255,0.05); overflow: hidden; }
  .product-thumb img { width: 100%; height: 100%; object-fit: cover; }
  .product-thumb-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
  .low-stock-badge { position: absolute; top: 0.6rem; left: 0.6rem; padding: 0.25rem 0.55rem; font-size: 0.7rem; font-weight: 700; border-radius: 999px; background: rgba(245,158,11,0.9); color: #1a1a1a; }
  .product-body { padding: 0.85rem 1rem 1rem; display: grid; gap: 0.55rem; }
  .product-edit { padding: 0.85rem 1rem 1rem; display: grid; gap: 0.5rem; }
  .product-edit-row { display: flex; gap: 0.5rem; }
  .product-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
  .product-category { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.72rem; padding: 0.2rem 0.55rem; border-radius: 999px; background: rgba(255,255,255,0.06); color: var(--text-muted); }
  .product-desc { margin: 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .product-meta { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .product-price { font-weight: 800; color: var(--brand-primary-light); font-size: 1.05rem; }
  .product-stock { font-size: 0.82rem; color: var(--text-muted); }
  .product-stock-empty { color: #f87171; font-weight: 700; }
  .product-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; margin-top: 0.25rem; }
  .btn-danger-ghost { color: #f87171 !important; }
  .btn-danger-ghost:hover { background: rgba(239,68,68,0.1) !important; border-color: rgba(239,68,68,0.3) !important; }
  .empty-state { display: grid; gap: 0.5rem; place-items: center; padding: 3rem 1rem; text-align: center; color: var(--text-muted); }
  .profile-preview { padding: 1.25rem; border-radius: 18px; border: 1px solid var(--border-subtle); display: flex; gap: 1rem; align-items: center; min-height: 140px; }
  .profile-preview-logo { width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; overflow: hidden; box-shadow: 0 10px 24px rgba(0,0,0,0.3); }
  .profile-preview-logo img { width: 100%; height: 100%; object-fit: cover; }
  .profile-preview-text { display: grid; gap: 0.3rem; min-width: 0; }
  .profile-preview-text strong { font-size: 1.25rem; }
  .profile-preview-text span { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
  .profile-preview-text p { margin: 0.35rem 0 0; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.5; max-width: 60ch; }
  .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
  .dashboard-metric { padding: 1rem; border-radius: 16px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.03); }
  .dashboard-metric-disabled { opacity: 0.5; filter: grayscale(1); }
  .dashboard-metric-disabled .metric-helper { color: var(--text-muted); }
  .orders-list { display: grid; gap: 0.75rem; }
  .order-row-item { border: 1px solid var(--border-subtle); border-radius: 16px; background: rgba(255,255,255,0.02); overflow: hidden; }
  .order-row-main { display: flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-subtle); gap: 1rem; }
  .buyer-info { display: flex; align-items: center; gap: 0.75rem; flex: 1; }
  .buyer-avatar { width: 36px; height: 36px; border-radius: 999px; background: var(--gradient-brand); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; overflow: hidden; flex-shrink: 0; }
  .buyer-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .buyer-info strong { display: block; font-size: 0.88rem; }
  .buyer-info span { font-size: 0.72rem; color: var(--text-muted); }
  .order-summary { text-align: right; min-width: 100px; }
  .order-price { font-weight: 800; color: var(--brand-primary-light); font-size: 1rem; }
  .order-date { font-size: 0.7rem; color: var(--text-muted); }
  .order-actions-cell { min-width: 150px; display: flex; justify-content: flex-end; }
  .status-label-done { font-size: 0.72rem; font-weight: 700; color: #22c55e; text-transform: uppercase; letter-spacing: 0.05em; }
  .order-items-minilist { padding: 0.75rem 1rem; background: rgba(0,0,0,0.15); display: grid; gap: 0.4rem; }
  .item-mini { display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); }
  @media (max-width: 600px) {
    .order-row-main { flex-direction: column; align-items: flex-start; }
    .order-actions-cell { width: 100%; justify-content: flex-start; }
  }
  .metric-label { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); font-weight: 700; }
  .metric-value { font-size: 1.8rem; font-weight: 800; margin-top: 0.35rem; }
  .metric-helper { margin-top: 0.35rem; font-size: 0.78rem; color: var(--text-muted); }
  .spinning { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 1100px) {
    .editor-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 720px) {
    .form-grid { grid-template-columns: 1fr; }
    .editor-stats { grid-template-columns: 1fr; }
    .add-product-row { flex-direction: column; }
  }

  /* Schedule Bubbles (Modern UI) */
  .comp-pill-toggle { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .comp-schedule-bubble {
    display: flex;
    flex-direction: column;
    border-radius: 16px;
    overflow: hidden;
    min-width: 0;
    transition: all 0.2s ease;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
  }
  .comp-schedule-bubble-enabled { border-color: rgba(34, 197, 94, 0.25); background: rgba(34, 197, 94, 0.02); }
  .comp-schedule-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    border-bottom: 1px solid var(--border-subtle);
  }
  .comp-schedule-banner-enabled { background: rgba(34, 197, 94, 0.08); color: #86efac; border-bottom-color: rgba(34, 197, 94, 0.15); }
  .comp-schedule-banner-disabled { background: rgba(239, 68, 68, 0.05); color: #fca5a5; }
  .comp-schedule-bubble-body {
    display: grid;
    gap: 0.75rem;
    padding: 1.25rem 1rem;
  }
  .comp-state-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 6px;
    padding: 0.3rem 0.65rem;
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: 1px solid transparent;
  }
  .comp-state-chip-on { background: rgba(34,197,94,0.1); color: #4ade80; border-color: rgba(34,197,94,0.2); }
  .comp-state-chip-off { background: rgba(239,68,68,0.08); color: #f87171; border-color: rgba(239,68,68,0.15); }
`;




