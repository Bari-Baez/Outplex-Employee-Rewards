'use client';

import { useEffect, useMemo, useState } from 'react';
import { ActionMenu, ActionMenuItem, ActionMenuLabel, ActionMenuSeparator } from '@/components/layout/ActionMenu';
import {
  formatPickupSummaryWithDeadline,
  formatPoints,
  formatShortDate,
  formatShortDateTime,
  getOrderItemImage,
  getOrderLineTotal,
  getOrderLineItems,
  getOrderProductCount,
  getOrderQuantity,
  getOrderReference,
  getOrderSummaryPreview,
  getOrderSummaryTitle,
} from '@/lib/store-helpers';
import { formatDop } from '@/lib/utils';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import type { StoreOrder } from '@/types/database';
import { ModernSelect } from '@/components/ui/Select';
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Clock3, IdCard, Mail, MessageSquare, MoreVertical, Package, Star, Store, Zap, XCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

type OrderFilter = 'all' | 'pending' | 'ready_for_pickup' | 'completed';

interface EmpOrderItem {
  id: string;
  order_id: string;
  product_id: string;
  name_snapshot: string;
  image_snapshot: string | null;
  unit_price_dop: number;
  quantity: number;
}

interface EmpOrder {
  id: string;
  store_id: string;
  seller_id: string;
  buyer_id: string;
  total_dop: number;
  status: string;
  contact_method: string | null;
  buyer_notes: string | null;
  created_at: string;
  items: EmpOrderItem[];
  store: { id: string; slug: string; name: string } | null;
  seller: { id: string; name: string; email: string; avatar_url: string | null; slack_id: string | null } | null;
}


function getEmpOrderStatusUi(status: string) {
  switch (status) {
    case 'pending':
      return { label: 'Pendiente', className: 'status-pending' };
    case 'confirmed':
      return { label: 'Confirmado', className: 'status-approved' };
    case 'ready_for_pickup':
      return { label: 'Listo para retirar', className: 'status-ready_for_pickup' };
    case 'completed':
      return { label: 'Completado', className: 'status-completed' };
    case 'cancelled':
      return { label: 'Cancelado', className: 'status-cancelled' };
    default:
      return { label: status.replace(/_/g, ' '), className: 'status-approved' };
  }
}

function getEmployeeOrderStatusUi(status: StoreOrder['status']) {
  switch (status) {
    case 'pending':
      return { label: 'Pending', icon: <Clock3 size={14} />, className: 'status-pending' };
    case 'ready_for_pickup':
      return { label: 'Ready for pickup', icon: <CalendarClock size={14} />, className: 'status-ready_for_pickup' };
    case 'approved':
      return { label: 'Approved', icon: <CalendarClock size={14} />, className: 'status-approved' };
    case 'completed':
      return { label: 'Completed', icon: <CheckCircle2 size={14} />, className: 'status-completed' };
    case 'rejected':
      return { label: 'Rejected', icon: <XCircle size={14} />, className: 'status-rejected' };
    case 'cancelled':
      return { label: 'Cancelled', icon: <XCircle size={14} />, className: 'status-cancelled' };
    default:
      return { label: String(status).replace(/_/g, ' '), icon: <Package size={14} />, className: 'status-approved' };
  }
}

export function OrdersClient({ initialOrders, initialEmpOrders }: { initialOrders: StoreOrder[]; initialEmpOrders: EmpOrder[] }) {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<StoreOrder[]>(initialOrders);
  const [empOrdersState, setEmpOrdersState] = useState<EmpOrder[]>(initialEmpOrders);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [storeTab, setStoreTab] = useState<'nyt' | 'employee'>('nyt');
  const [copiedEmailId, setCopiedEmailId] = useState<string | null>(null);
  const [nytRatings, setNytRatings] = useState<Record<string, number>>({});
  const [empRatings, setEmpRatings] = useState<Record<string, number>>({});
  const [ratingBusy, setRatingBusy] = useState<Record<string, boolean>>({});
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  const setBusy = (key: string, value: boolean) => {
    setRatingBusy((prev) => ({ ...prev, [key]: value }));
  };

  const rateNytItem = async (itemId: string, rating: number) => {
    const key = `nyt:${itemId}`;
    if (ratingBusy[key]) return;
    setBusy(key, true);
    try {
      const res = await fetch('/api/store/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, rating }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar la calificación.');
      setNytRatings((prev) => ({ ...prev, [itemId]: rating }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al calificar.');
    } finally {
      setBusy(key, false);
    }
  };

  const rateEmpProduct = async (productId: string, rating: number) => {
    const key = `emp:${productId}`;
    if (ratingBusy[key]) return;
    setBusy(key, true);
    try {
      const res = await fetch('/api/employee-store/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'No se pudo guardar la calificación.');
      setEmpRatings((prev) => ({ ...prev, [productId]: rating }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al calificar.');
    } finally {
      setBusy(key, false);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const itemIds = Array.from(
      new Set(orders.flatMap((order) => getOrderLineItems(order).map((li) => li.itemId)).filter(Boolean)),
    );
    if (itemIds.length > 0) {
      fetch('/api/store/reviews/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds }),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((json: { ratings?: Record<string, number> }) => {
          if (json.ratings) setNytRatings(json.ratings);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.warn('[orders] loadUserRatings failed', err);
        });
    }
    return () => controller.abort();
  }, [orders]);

  useEffect(() => {
    const controller = new AbortController();
    const productIds = Array.from(new Set(empOrdersState.flatMap((o) => o.items.map((i) => i.product_id)).filter(Boolean)));
    if (productIds.length > 0) {
      fetch('/api/employee-store/reviews/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds }),
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((json: { ratings?: Record<string, number> }) => {
          if (json.ratings) setEmpRatings(json.ratings);
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          console.warn('[orders] loadUserEmpRatings failed', err);
        });
    }
    return () => controller.abort();
  }, [empOrdersState]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    const highlight = searchParams.get('highlight');
    const highlightEmp = searchParams.get('highlightEmp');

    if (tab === 'employee') {
      setStoreTab('employee');
    }

    const targetId = highlightEmp
      ? `emp-order-${highlightEmp}`
      : highlight
        ? `order-${highlight}`
        : null;

    if (!targetId) return;

    const reveal = () => {
      const el = document.getElementById(targetId);
      if (!el) return;
      el.classList.add('order-highlight');
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => el.classList.remove('order-highlight'), 2400);
    };

    // Wait for the correct tab and cards to render.
    window.setTimeout(reveal, tab === 'employee' ? 420 : 160);
    window.setTimeout(reveal, tab === 'employee' ? 780 : 420);
  }, [searchParams]);

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const handleCancelOrder = async (orderId: string) => {
    if (cancellingOrderId) return;
    setCancellingOrderId(orderId);
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to cancel the order.');
      }

      setOrders((previousOrders) =>
        previousOrders.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: 'cancelled',
                meta: order.meta
                  ? {
                      ...order.meta,
                      statusHistory: [
                        ...(order.meta.statusHistory ?? []),
                        {
                          status: 'cancelled',
                          at: new Date().toISOString(),
                          note: 'Cancelled by employee',
                        },
                      ],
                    }
                  : order.meta,
              }
            : order,
        ),
      );
    } catch (error) {
      toast.error(`Failed to cancel order: ${error instanceof Error ? error.message : 'Unexpected error'}`);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const handleCancelEmpOrder = async (orderId: string) => {
    if (cancellingOrderId) return;
    setCancellingOrderId(orderId);
    try {
      const response = await fetch('/api/employee-store/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to cancel the order.');
      }

      setEmpOrdersState((previousOrders) =>
        previousOrders.map((order) =>
          order.id === orderId ? { ...order, status: 'cancelled' } : order
        ),
      );
    } catch (error) {
      toast.error(`Error al cancelar la orden: ${error instanceof Error ? error.message : 'Error inesperado'}`);
    } finally {
      setCancellingOrderId(null);
    }
  };

  const isWithinGracePeriod = (createdAt: string) => {
    const diffMs = currentTime - new Date(createdAt).getTime();
    return diffMs <= 5 * 60 * 1000;
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (orderFilter === 'pending') {
        return order.status === 'pending';
      }

      if (orderFilter === 'ready_for_pickup') {
        return order.status === 'ready_for_pickup';
      }

      if (orderFilter === 'completed') {
        return order.status === 'completed';
      }

      return true;
    });
  }, [orderFilter, orders]);

  const empOrders = empOrdersState;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Order History</h1>
      </div>

      {/* Tab toggle */}
      <div className="orders-tab-toggle">
        <button type="button" className={`orders-tab-btn ${storeTab === 'nyt' ? 'active' : ''}`} onClick={() => setStoreTab('nyt')}>
          <Zap size={15} /> Tienda Outplex
          {orders.length > 0 && <span className="orders-tab-count">{orders.length}</span>}
        </button>
        <button type="button" className={`orders-tab-btn ${storeTab === 'employee' ? 'active' : ''}`} onClick={() => setStoreTab('employee')}>
          <Store size={15} /> Tiendas de Empleados
          {empOrders.length > 0 && <span className="orders-tab-count" style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>{empOrders.length}</span>}
        </button>
      </div>

      {/* Employee store orders tab */}
      {storeTab === 'employee' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {empOrders.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Store size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
              <h3>No hay órdenes de empleados aún</h3>
              <p>Cuando compres en una tienda de empleados, tus órdenes aparecerán aquí.</p>
            </div>
          ) : (
            empOrders.map((order) => {
              const statusUi = getEmpOrderStatusUi(order.status);
              return (
                <div key={order.id} id={`emp-order-${order.id}`} className="card order-card-shell">
                  <div className="order-image-shell" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    {order.items[0]?.image_snapshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxifyMediaUrl(order.items[0].image_snapshot)} alt={order.items[0].name_snapshot} className="order-image" />
                    ) : (
                      <div className="order-image-fallback"><Store size={24} style={{ color: '#6ee7b7' }} /></div>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="order-header-row">
                      <div>
                        <div className="order-reference">{order.id.slice(0, 8).toUpperCase()}</div>
                        <h3 style={{ margin: '0 0 0.35rem' }}>{order.store?.name ?? 'Tienda de empleado'}</h3>
                        <div className="order-meta-line">
                          <span>{order.items.reduce((s, i) => s + i.quantity, 0)} item{order.items.length === 1 ? '' : 's'}</span>
                          <span>•</span>
                          <span style={{ color: '#6ee7b7', fontWeight: 700 }}>{formatDop(order.total_dop)}</span>
                          <span>•</span>
                          <span>{new Date(order.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        </div>
                        {order.seller && (
                          <div className="order-meta-line" style={{ marginTop: '0.2rem' }}>
                            <span>Vendedor: <strong style={{ color: 'var(--text-primary)' }}>{order.seller.name}</strong></span>
                          </div>
                        )}
                      </div>
                      <div className="order-status-column">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className={`order-status-badge ${statusUi.className}`}>{statusUi.label}</span>
                          {(order.status === 'pending' || order.status === 'ready_for_pickup' || order.status === 'confirmed') && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <ActionMenu
                              trigger={
                                <button className="btn btn-ghost danger-trigger" style={{ padding: '0.4rem' }}>
                                  <MoreVertical size={16} />
                                </button>
                              }
                            >
                              <ActionMenuLabel>Acciones</ActionMenuLabel>
                              <ActionMenuSeparator />
                              <ActionMenuItem destructive onClick={() => handleCancelEmpOrder(order.id)} disabled={cancellingOrderId === order.id}>
                                <XCircle size={14} style={{ marginRight: '0.4rem' }} /> Cancelar Orden Libremente
                              </ActionMenuItem>
                            </ActionMenu>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="order-contact-section">
                      <div className="contact-disclaimer">
                        <Zap size={14} />
                        <span>Transacción externa: Outplex no procesa pagos. Coordina directamente con el vendedor.</span>
                      </div>
                      <div className="contact-actions">
                        {order.seller?.slack_id && (
                          <a 
                            href={`https://slack.com/app_redirect?channel=${order.seller.slack_id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-sm"
                          >
                            <MessageSquare size={14} /> Slack
                          </a>
                        )}
                        <button 
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            if (order.seller?.email) {
                              navigator.clipboard.writeText(order.seller.email);
                              setCopiedEmailId(order.id);
                              setTimeout(() => setCopiedEmailId(null), 2000);
                            }
                          }}
                        >
                          {copiedEmailId === order.id ? (
                            <><CheckCircle2 size={14} style={{ color: '#10b981' }} /> Copiado</>
                          ) : (
                            <><Mail size={14} /> Email</>
                          )}
                        </button>
                        {/* More actions could be added here if phone is available */}
                      </div>
                    </div>

                    {order.items.length > 0 && (
                      <div className="line-items-shell">
                        {order.items.map((item) => (
                          <div key={item.id} className="line-item-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                              {item.image_snapshot ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={proxifyMediaUrl(item.image_snapshot)} alt={item.name_snapshot} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Package size={16} color="var(--text-muted)" />
                                </div>
                              )}
                              <div>
                                <strong style={{ display: 'block', fontSize: '0.9rem' }}>{item.name_snapshot}</strong>
                                {order.status === 'completed' && (
                                  <div className="order-rating-row">
                                    <span className="order-rating-label">Tu calificaciÃ³n:</span>
                                    <div className="order-rating-stars">
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <button
                                          key={n}
                                          type="button"
                                          className="order-rating-star"
                                          onClick={() => void rateEmpProduct(item.product_id, n)}
                                          disabled={ratingBusy[`emp:${item.product_id}`]}
                                          aria-label={`Calificar ${n} estrellas`}
                                        >
                                          <Star
                                            size={16}
                                            fill={n <= (empRatings[item.product_id] ?? 0) ? '#fbbf24' : 'none'}
                                            color={n <= (empRatings[item.product_id] ?? 0) ? '#fbbf24' : 'rgba(255,255,255,0.28)'}
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                  Cantidad: {item.quantity} · {formatDop(item.unit_price_dop)} c/u
                                </span>
                              </div>
                            </div>
                            <span style={{ fontWeight: 600, color: '#6ee7b7' }}>{formatDop(item.unit_price_dop * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* NYT orders tab */}
      {storeTab === 'nyt' && <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
        <label className="order-filter-select">
          <span>Filter</span>
          <ModernSelect
            value={orderFilter}
            onValueChange={v => setOrderFilter(v as OrderFilter)}
            options={[
              { label: 'All orders', value: 'all' },
              { label: 'Pending', value: 'pending' },
              { label: 'Ready for pickup', value: 'ready_for_pickup' },
              { label: 'Past orders', value: 'completed' }
            ]}
          />
        </label>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
          <Package size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
          <h3>{orders.length === 0 ? 'No orders yet' : 'No orders match this filter'}</h3>
          <p>
            {orders.length === 0
              ? 'When you redeem rewards from the store, they will appear here.'
              : 'Try another filter to see your other orders.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredOrders.map((order) => {
            const canCancel = order.status === 'pending' && isWithinGracePeriod(order.created_at);
            const quantity = getOrderQuantity(order);
            const productCount = getOrderProductCount(order);
            const itemName = getOrderSummaryTitle(order);
            const itemImage = getOrderItemImage(order);
            const pickupSummary = formatPickupSummaryWithDeadline(order.meta);
            const pickupDeadline = order.meta?.pickupDeadline ? formatShortDate(order.meta.pickupDeadline) : null;
            const lineItems = getOrderLineItems(order);
            const orderPreview = getOrderSummaryPreview(order);
            const statusUi = getEmployeeOrderStatusUi(order.status);
            
            const isExpanded = expandedOrders.has(order.id);
            const hasMultipleItems = lineItems.length > 1;

            return (
              <div 
                key={order.id} 
                id={`order-${order.id}`}
                className={`card order-card-shell ${isExpanded ? 'expanded' : ''}`}
                onClick={hasMultipleItems ? () => toggleOrderExpanded(order.id) : undefined}
                style={{ cursor: hasMultipleItems ? 'pointer' : 'default' }}
              >
                <div className="order-image-shell">
                  {itemImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxifyMediaUrl(itemImage)} alt={itemName} className="order-image" />
                  ) : (
                    <div className="order-image-fallback">
                      <Package size={24} />
                    </div>
                  )}
                </div>

                <div style={{ flex: 1 }}>
                  <div className="order-header-row">
                    <div>
                      <div className="order-reference">{getOrderReference(order.id)}</div>
                      <h3 style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {itemName}
                      </h3>
                      <div className="order-meta-line">
                        <span>{quantity} item{quantity === 1 ? '' : 's'}</span>
                        <span>•</span>
                        <span>{productCount} product{productCount === 1 ? '' : 's'}</span>
                        <span>•</span>
                        <span>{formatPoints(order.points_spent)}</span>
                        <span>•</span>
                        <span>{formatShortDateTime(order.created_at)}</span>
                      </div>
                    </div>

                    <div className="order-status-column">
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className={`order-status-badge ${statusUi.className}`}>
                          {statusUi.icon}
                          {statusUi.label}
                        </span>

                        {canCancel && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <ActionMenu
                              trigger={
                                <button className="btn btn-ghost danger-trigger" style={{ padding: '0.4rem' }}>
                                  <MoreVertical size={16} />
                                </button>
                              }
                            >
                              <ActionMenuLabel>Actions</ActionMenuLabel>
                              <ActionMenuSeparator />
                              <ActionMenuItem destructive onClick={() => handleCancelOrder(order.id)} disabled={cancellingOrderId === order.id}>
                                <XCircle size={14} style={{ marginRight: '0.4rem' }} /> Cancel Order
                              </ActionMenuItem>
                            </ActionMenu>
                          </div>
                        )}
                        {hasMultipleItems && (
                          <button className="btn btn-ghost" style={{ padding: '0.4rem' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                      </div>

                      {!canCancel && order.status === 'pending' && (
                        <span className="order-status-copy">Pending review</span>
                      )}
                    </div>
                  </div>

                  {hasMultipleItems && (
                    <div className="order-summary-strip">
                      <strong>Order summary</strong>
                      <span>{orderPreview}</span>
                    </div>
                  )}

                  {(!hasMultipleItems || isExpanded) && (
                    <div className="line-items-shell" onClick={(e) => e.stopPropagation()}>
                      {lineItems.map((line) => (
                        <div key={`${order.id}-${line.itemId}`} className="line-item-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            {line.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={proxifyMediaUrl(line.imageUrl)} alt={line.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={16} color="var(--text-muted)" />
                              </div>
                            )}
                            <div>
                              <strong style={{ display: 'block', fontSize: '0.9rem' }}>{line.name}</strong>
                              {order.status === 'completed' && (
                                <div className="order-rating-row">
                                  <span className="order-rating-label">Tu calificaciÃ³n:</span>
                                  <div className="order-rating-stars">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                      <button
                                        key={n}
                                        type="button"
                                        className="order-rating-star"
                                        onClick={() => void rateNytItem(line.itemId, n)}
                                        disabled={ratingBusy[`nyt:${line.itemId}`]}
                                        aria-label={`Calificar ${n} estrellas`}
                                      >
                                        <Star
                                          size={16}
                                          fill={n <= (nytRatings[line.itemId] ?? 0) ? '#fbbf24' : 'none'}
                                          color={n <= (nytRatings[line.itemId] ?? 0) ? '#fbbf24' : 'rgba(255,255,255,0.28)'}
                                        />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                Quantity: {line.quantity} | {formatPoints(line.unitPoints)} each
                              </span>
                            </div>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {formatPoints(getOrderLineTotal(line))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(pickupSummary || pickupDeadline || order.meta?.denialReason) && (
                    <div className="order-extra-grid">
                      {pickupSummary && (
                        <div className="order-extra-card">
                          <CalendarClock size={16} />
                          <div>
                            <strong>Pickup schedule</strong>
                            <span>{pickupSummary}</span>
                          </div>
                        </div>
                      )}

                      {pickupDeadline && order.status === 'ready_for_pickup' && (
                        <div className="order-extra-card" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                          <CheckCircle2 size={16} color="#10b981" />
                          <div>
                            <strong style={{ color: '#10b981' }}>¡Listo para buscarse!</strong>
                            <span style={{ color: 'var(--text-secondary)' }}>Tienes hasta el <strong>{pickupDeadline}</strong> para irlo a buscar.</span>
                          </div>
                        </div>
                      )}

                      {order.meta?.denialReason && (
                        <div className="order-extra-card order-extra-card-danger">
                          <XCircle size={16} />
                          <div>
                            <strong>Reason</strong>
                            <span>{order.meta.denialReason}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>}

      <style>{`
        .order-card-shell {
          display: flex;
          gap: 1.25rem;
          align-items: flex-start;
          transition: border-color 0.2s, background 0.2s;
        }

        .order-card-shell.order-highlight {
          border-color: rgba(99, 102, 241, 0.55);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.22), 0 32px 80px rgba(99, 102, 241, 0.12);
          background: rgba(99, 102, 241, 0.06);
        }

        .order-card-shell.expanded {
          border-color: var(--brand-primary);
        }

        .order-image-shell {
          width: 86px;
          height: 86px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          flex-shrink: 0;
        }

        .order-image,
        .order-image-fallback {
          width: 100%;
          height: 100%;
        }

        .order-image {
          object-fit: cover;
        }

        .order-image-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
        }

        .order-header-row {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }

        .order-meta-line {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          color: var(--text-secondary);
          font-size: 0.82rem;
        }

        .order-status-column {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .order-status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          padding: 0.3rem 0.8rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          border: 1px solid transparent;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }

        .status-pending {
          background: linear-gradient(135deg, rgba(249, 115, 22, 0.18), rgba(245, 158, 11, 0.12));
          border-color: rgba(249, 115, 22, 0.35);
          color: #fb923c;
        }

        .status-approved,
        .status-ready_for_pickup {
          background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(56, 189, 248, 0.12));
          border-color: rgba(56, 189, 248, 0.28);
          color: #67e8f9;
        }

        .status-completed {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(34, 197, 94, 0.12));
          border-color: rgba(16, 185, 129, 0.32);
          color: #6ee7b7;
        }

        .status-rejected,
        .status-cancelled {
          background: linear-gradient(135deg, rgba(239, 68, 68, 0.18), rgba(190, 24, 93, 0.1));
          border-color: rgba(239, 68, 68, 0.28);
          color: #fca5a5;
        }

        .danger-trigger {
          color: #ef4444;
          background: rgba(239, 68, 68, 0.08);
          border-radius: 8px;
        }

        .danger-trigger:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        .order-status-copy {
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        .order-filter-select {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 0.55rem 0.85rem;
          background: var(--bg-card);
        }

        .order-filter-select span {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .order-filter-select select {
          border: none;
          background: transparent;
          color: var(--text-primary);
          font: inherit;
          outline: none;
        }

        .order-reference {
          font-size: 0.76rem;
          font-weight: 800;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
          margin-bottom: 0.4rem;
        }

        .order-summary-strip {
          display: grid;
          gap: 0.25rem;
          margin-top: 1rem;
          padding: 0.8rem 0.9rem;
          border-radius: 14px;
          border: 1px solid rgba(124, 108, 255, 0.16);
          background: rgba(124, 108, 255, 0.08);
        }

        .order-summary-strip strong {
          font-size: 0.78rem;
        }

        .order-summary-strip span {
          color: var(--text-secondary);
          font-size: 0.82rem;
          line-height: 1.45;
        }

        .line-items-shell {
          display: grid;
          gap: 0.65rem;
          margin-top: 1rem;
        }

        .order-rating-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 0.35rem;
          flex-wrap: wrap;
        }

        .order-rating-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .order-rating-stars {
          display: flex;
          gap: 0.15rem;
          align-items: center;
        }

        .order-rating-star {
          background: none;
          border: none;
          padding: 2px;
          line-height: 0;
          cursor: pointer;
          transition: transform 0.12s ease;
        }

        .order-rating-star:hover {
          transform: translateY(-1px);
        }

        .order-rating-star:disabled {
          cursor: not-allowed;
          opacity: 0.6;
          transform: none;
        }

        .line-item-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding: 0.7rem 0.85rem;
          border-radius: 14px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          font-size: 0.84rem;
        }

        .order-contact-section {
          margin-top: 1rem;
          padding: 1rem;
          background: rgba(16, 185, 129, 0.05);
          border-radius: 14px;
          border: 1px dashed rgba(16, 185, 129, 0.2);
        }

        .contact-disclaimer {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-bottom: 0.75rem;
          line-height: 1.4;
        }

        .contact-disclaimer svg {
          color: #fbbf24;
          flex-shrink: 0;
          margin-top: 2px;
        }

        .contact-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .contact-actions .btn {
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
        }

        .contact-actions .btn:hover {
          background: var(--bg-elevated);
          border-color: var(--brand-primary);
        }

        .order-extra-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 0.75rem;
          margin-top: 1rem;
        }

        .order-extra-card {
          display: flex;
          gap: 0.65rem;
          align-items: flex-start;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          padding: 0.85rem 0.95rem;
        }

        .order-extra-card strong {
          display: block;
          font-size: 0.8rem;
          margin-bottom: 0.2rem;
        }

        .order-extra-card span {
          display: block;
          color: var(--text-secondary);
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .order-extra-card-danger {
          border-color: rgba(239, 68, 68, 0.2);
          background: rgba(239, 68, 68, 0.06);
        }

        @media (max-width: 720px) {
          .order-card-shell,
          .order-header-row,
          .line-item-row {
            flex-direction: column;
          }

          .order-status-column {
            align-items: flex-start;
          }
        }

        .orders-tab-toggle {
          display: inline-flex;
          gap: 0.25rem;
          padding: 0.25rem;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: rgba(10,14,26,0.6);
          backdrop-filter: blur(12px);
          margin-bottom: 1.5rem;
        }

        .orders-tab-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 1rem;
          border-radius: 10px;
          border: 1px solid transparent;
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.22s ease;
        }

        .orders-tab-btn:hover {
          background: rgba(255,255,255,0.04);
          color: var(--text-primary);
        }

        .orders-tab-btn.active {
          background: rgba(124,108,255,0.14);
          border-color: rgba(124,108,255,0.3);
          color: var(--brand-primary-light);
        }

        .orders-tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 999px;
          background: rgba(124,108,255,0.2);
          color: var(--brand-primary-light);
          font-size: 0.7rem;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
