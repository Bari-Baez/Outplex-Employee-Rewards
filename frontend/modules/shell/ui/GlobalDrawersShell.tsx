'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Clipboard, LoaderCircle, MessageSquare, Minus, PackageCheck, Phone, Plus, ShoppingCart, Store, Trash2, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@frontend/platform/supabase/client';
import { formatPoints, getStockLabel, STORE_CART_TTL_HOURS } from '@backend/modules/store/domain/catalog';
import { useAppStore } from '@frontend/modules/shell/state/app-store';
import { formatDop, formatRelativeTime } from '@shared/utils/format';
import type { Notification } from '@shared/contracts/database';
import { PurchaseOverlay } from '@frontend/shared/ui/PurchaseOverlay';

interface OrderCreatedInfo {
  orderId: string;
  storeName: string;
  totalDop: number;
  seller: {
    id: string;
    name: string;
    email: string;
    slack_id: string | null;
    contactPrefs: { whatsapp_number: string | null; whatsapp_opt_in: boolean } | null;
  };
}

function resolveNotificationHref(notification: Notification, pathname: string) {
  const content = `${notification.title} ${notification.message}`.toLowerCase();

  if (content.includes('low stock') || content.includes('inventory')) {
    return '/moderator/store/inventory?lowStock=1';
  }

  if (notification.type === 'store' || content.includes('store order') || content.includes('pickup')) {
    return '/orders';
  }

  if (notification.type === 'ot' || content.includes('ot reservation') || content.includes('ot slot')) {
    return '/ot-calendar';
  }

  if (notification.type === 'raffle' || content.includes('raffle')) {
    return '/raffles';
  }

  if (notification.type === 'support' || content.includes('support')) {
    return '/support';
  }

  if (notification.type === 'system') {
    return '/announcements?tab=notifications';
  }

  if (pathname.startsWith('/moderator')) {
    return '/moderator/ot-manager';
  }

  return '/dashboard';
}

export function GlobalDrawersShell() {
  const [supabase] = useState(() => createClient());
  const [cartNotice, setCartNotice] = useState<string | null>(null);
  const [deletingNotificationIds, setDeletingNotificationIds] = useState<Set<string>>(new Set());
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ordersCreated, setOrdersCreated] = useState<OrderCreatedInfo[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<{ title: string; subtitle?: string } | null>(null);
  const {
    cart,
    cartOpen,
    clearNotifications,
    clearCart,
    markNotificationsRead,
    notifications,
    notificationsOpen,
    removeNotification,
    removeFromCart,
    setCartItemQuantity,
    setCartOpen,
    setNotifications,
    setNotificationsOpen,
    syncCartItems,
    empCart,
    empCartOpen,
    setEmpCartOpen,
    removeFromEmpCart,
    setEmpCartItemQuantity,
    clearEmpCart,
    buyerWhatsappOptIn,
  } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();

  const navigateWithOverlay = (href: string, overlay: { title: string; subtitle?: string }) => {
    setRouteOverlay(overlay);
    router.push(href);
    window.setTimeout(() => setRouteOverlay(null), 900);
  };

  const cartTotalPoints = useMemo(
    () => cart.reduce((total, cartItem) => total + cartItem.item.points_cost * cartItem.quantity, 0),
    [cart],
  );
  const cartItemCount = useMemo(
    () => cart.reduce((total, cartItem) => total + cartItem.quantity, 0),
    [cart],
  );
  const empTotalDop = useMemo(
    () => empCart.reduce((total, ci) => total + ci.product.price_dop * ci.quantity, 0),
    [empCart],
  );

  const empCartTotalDop = useMemo(
    () => empCart.reduce((total, ci) => total + ci.product.price_dop * ci.quantity, 0),
    [empCart],
  );
  const empCartItemCount = useMemo(
    () => empCart.reduce((total, ci) => total + ci.quantity, 0),
    [empCart],
  );

  useEffect(() => {
    if (!notificationsOpen) {
      return;
    }

    const unreadIds = notifications
      .filter((notification) => !notification.is_read)
      .map((notification) => notification.id);

    if (unreadIds.length === 0) {
      return;
    }

    void (async () => {
      const result = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds);

      if (!result.error) {
        markNotificationsRead(unreadIds);
      }
    })();
  }, [markNotificationsRead, notifications, notificationsOpen, supabase]);

  useEffect(() => {
    if (!cartOpen || cart.length === 0) {
      return;
    }

    let cancelled = false;

    const refreshCartInventory = async () => {
      const itemIds = cart.map((cartItem) => cartItem.item.id);
      const { data, error } = await supabase
        .from('store_items')
        .select('id,name,description,points_cost,image_url,stock,is_active,created_at')
        .in('id', itemIds);

      if (cancelled || error) {
        return;
      }

      const syncResult = syncCartItems(data ?? []);
      if (syncResult.removedIds.length > 0 || syncResult.reducedIds.length > 0) {
        const removedText =
          syncResult.removedIds.length > 0
            ? `${syncResult.removedIds.length} item${syncResult.removedIds.length === 1 ? '' : 's'} removed`
            : null;
        const reducedText =
          syncResult.reducedIds.length > 0
            ? `${syncResult.reducedIds.length} item${syncResult.reducedIds.length === 1 ? '' : 's'} adjusted`
            : null;

        setCartNotice(
          `Cart updated to match live inventory${removedText || reducedText ? `: ${[removedText, reducedText].filter(Boolean).join(', ')}` : ''}.`,
        );
      } else {
        setCartNotice(null);
      }
    };

    void refreshCartInventory();

    return () => {
      cancelled = true;
    };
  }, [cart, cartOpen, supabase, syncCartItems]);

  const closeDrawers = () => {
    setCartNotice(null);
    setCartOpen(false);
    setEmpCartOpen(false);
    setNotificationsOpen(false);
  };

  const openNotification = (notification: Notification) => {
    const href = resolveNotificationHref(notification, pathname);
    closeDrawers();
    router.push(href);
  };

  const deleteNotification = async (notificationId: string) => {
    setDeletingNotificationIds((current) => new Set(current).add(notificationId));

    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Unable to delete the notification.');
      }

      removeNotification(notificationId);
    } finally {
      setDeletingNotificationIds((current) => {
        const next = new Set(current);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const clearAllNotifications = async () => {
    setClearingNotifications(true);

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Unable to clear notifications.');
      }

      clearNotifications();
    } finally {
      setClearingNotifications(false);
    }
  };

  const muteNotificationSender = async (senderId: string) => {
    try {
      const response = await fetch('/api/notifications/mutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId }),
      });

      if (!response.ok) {
        return;
      }

      setNotifications(notifications.filter((notification) => (notification.sender?.id ?? notification.sender_id) !== senderId));
    } catch {
      // ignore
    }
  };

  const handleEmpCheckout = async () => {
    if (empCart.length === 0) {
      return;
    }
    setIsOrdering(true);
    setOrderError(null);
    try {
      const response = await fetch('/api/employee-store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: empCart.map((ci) => ({ productId: ci.product.id, quantity: ci.quantity })),
          contactMethod: 'none',
        }),
      });
      const data = (await response.json()) as { orders?: Record<string, unknown>[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Error al procesar la orden.');
      }

      const infos: OrderCreatedInfo[] = (data.orders ?? []).map((order) => {
        const seller = (order.seller ?? {}) as {
          id?: string;
          name?: string;
          email?: string;
          slack_id?: string | null;
          contactPrefs?: { whatsapp_number: string | null; whatsapp_opt_in: boolean } | null;
        };
        const store = (order.store ?? {}) as { name?: string };
        return {
          orderId: String(order.id ?? ''),
          storeName: store.name ?? 'Tienda',
          totalDop: Number(order.total_dop ?? 0),
          seller: {
            id: seller.id ?? '',
            name: seller.name ?? '',
            email: seller.email ?? '',
            slack_id: seller.slack_id ?? null,
            contactPrefs: seller.contactPrefs ?? null,
          },
        };
      });

      clearEmpCart();
      setEmpCartOpen(false);
      setOrdersCreated(infos);
      router.refresh();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : 'Error desconocido.');
    } finally {
      setIsOrdering(false);
    }
  };

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  return (
    <>
      {(cartOpen || notificationsOpen || empCartOpen) && <div className="drawer-overlay" onClick={closeDrawers} />}

      <div className={`drawer ${cartOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <ShoppingCart size={20} />
              <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Your Cart</h2>
            </div>
            <div className="drawer-subcopy">
              {cartItemCount > 0 ? `${cartItemCount} item${cartItemCount === 1 ? '' : 's'} selected` : 'Saved on this device for 2 hours'}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={closeDrawers}>
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content">
          {cartNotice && cart.length > 0 && <div className="drawer-alert">{cartNotice}</div>}

          {cart.length === 0 ? (
            <div className="drawer-empty">
              <PackageCheck size={34} />
              <p>Your cart is empty.</p>
              <span>Anything you add here stays saved for {STORE_CART_TTL_HOURS} hours on this device.</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.95rem' }}>
              {cart.map((cartItem) => {
                const isInfiniteStock = cartItem.item.stock === -1;
                const maxQuantityReached = !isInfiniteStock && cartItem.quantity >= Math.max(cartItem.item.stock, 0);

                return (
                  <div key={cartItem.item.id} className="cart-item-card">
                    <div className="cart-item-top">
                      <div>
                        <div className="cart-item-name">{cartItem.item.name}</div>
                        <div className="cart-item-meta">
                          <span>{formatPoints(cartItem.item.points_cost)} each</span>
                          <span>•</span>
                          <span>{getStockLabel(cartItem.item)}</span>
                        </div>
                      </div>
                      <button className="btn btn-ghost" style={{ padding: '0.35rem', color: '#f87171' }} onClick={() => removeFromCart(cartItem.item.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="cart-item-bottom">
                      <div className="cart-stepper">
                        <button className="qty-btn" onClick={() => setCartItemQuantity(cartItem.item.id, cartItem.quantity - 1)}>
                          <Minus size={14} />
                        </button>
                        <span className="qty-pill">{cartItem.quantity}</span>
                        <button className="qty-btn" onClick={() => setCartItemQuantity(cartItem.item.id, cartItem.quantity + 1)} disabled={maxQuantityReached}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="cart-line-total">{formatPoints(cartItem.item.points_cost * cartItem.quantity)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="drawer-footer">
            <div className="cart-summary-panel">
              <div>
                <span>Total</span>
                <small>{cartItemCount} item(s)</small>
              </div>
              <strong>{formatPoints(cartTotalPoints)}</strong>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => {
                  setCartNotice(null);
                  setCartOpen(false);
                  navigateWithOverlay('/store/checkout', {
                    title: 'Preparing checkout',
                    subtitle: 'Bringing you the goods…',
                  });
                }}
              >
                Proceed to Checkout
              </button>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setCartNotice(null); clearCart(); }}>
                Clear Cart
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Employee Cart Drawer ─────────────────────────── */}
      <div className={`drawer ${empCartOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <ShoppingCart size={20} className="text-emerald-500" />
              <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Carrito de Empleados</h2>
            </div>
            <div className="drawer-subcopy">
              {empCartItemCount > 0 
                ? `${empCartItemCount} producto${empCartItemCount === 1 ? '' : 's'} seleccionado${empCartItemCount === 1 ? '' : 's'}` 
                : 'Productos de tus compañeros'}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={closeDrawers}>
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content">
          {empCart.length === 0 ? (
            <div className="drawer-empty">
              <Store size={34} />
              <p>Tu carrito de empleados está vacío.</p>
              <span>Agrega productos del apartado Tiendas de Empleados para verlos aqui.</span>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.95rem' }}>
              {empCart.map((ci) => {
                const maxQtyReached = ci.product.stock !== -1 && ci.quantity >= ci.product.stock;
                
                return (
                  <div key={ci.product.id} className="cart-item-card" style={{ borderLeft: '4px solid #10b981' }}>
                    <div className="cart-item-top">
                      <div>
                        <div className="cart-item-name">{ci.product.name}</div>
                        <div className="cart-item-meta">
                          <span>RD$ {ci.product.price_dop.toLocaleString()} cada uno</span>
                        </div>
                      </div>
                      <button className="btn btn-ghost" style={{ padding: '0.35rem', color: '#f87171' }} onClick={() => removeFromEmpCart(ci.product.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="cart-item-bottom">
                      <div className="cart-stepper">
                        <button className="qty-btn" onClick={() => setEmpCartItemQuantity(ci.product.id, ci.quantity - 1)}>
                          <Minus size={14} />
                        </button>
                        <span className="qty-pill">{ci.quantity}</span>
                        <button className="qty-btn" onClick={() => setEmpCartItemQuantity(ci.product.id, ci.quantity + 1)} disabled={maxQtyReached}>
                          <Plus size={14} />
                        </button>
                      </div>
                      <div className="cart-line-total" style={{ color: '#6ee7b7' }}>
                        RD$ {(ci.product.price_dop * ci.quantity).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {empCart.length > 0 && (
          <div className="drawer-footer">
            <div className="cart-summary-panel" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
              <div>
                <span>Total a pagar</span>
                <small>{empCartItemCount} producto(s)</small>
              </div>
              <strong style={{ color: '#6ee7b7' }}>RD$ {empCartTotalDop.toLocaleString()}</strong>
            </div>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {orderError && (
                <p style={{ color: '#f87171', fontSize: '0.8rem', margin: 0 }}>
                  {orderError}
                </p>
              )}
              <button
                className="btn btn-primary"
                style={{ width: '100%', background: 'linear-gradient(135deg,#059669,#10b981)' }}
                onClick={() => {
                  setOrderError(null);
                  setEmpCartOpen(false);
                  navigateWithOverlay('/store/employee-checkout', {
                    title: 'Revisa tu orden',
                    subtitle: 'Confirma los detalles antes de notificar al vendedor.',
                  });
                }}
              >
                Confirmar orden
              </button>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => clearEmpCart()}>
                Vaciar Carrito
              </button>
            </div>
          </div>
        )}
      </div>

      <PurchaseOverlay
        open={Boolean(routeOverlay)}
        phase="processing"
        title={routeOverlay?.title ?? ''}
        subtitle={routeOverlay?.subtitle}
      />

      {ordersCreated.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            background: 'rgba(7,9,16,0.72)',
            backdropFilter: 'blur(10px)',
          }}
          onClick={() => setOrdersCreated([])}
        >
          <div
            style={{
              width: 'min(540px,100%)',
              borderRadius: 24,
              background: 'rgba(15,19,35,0.98)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#059669,#10b981)', marginBottom: '1rem' }}>
                <CheckCircle2 size={28} color="white" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Tu solicitud de orden fue generada</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Coordina con el vendedor usando la información de contacto.
              </p>
            </div>

            {ordersCreated.map((info) => (
              <div key={info.orderId} style={{ borderRadius: 16, border: '1px solid var(--border-subtle)', padding: '1rem', marginBottom: '0.5rem', background: 'var(--bg-elevated)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{info.storeName}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Vendedor: {info.seller.name}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: '#6ee7b7', fontSize: '1rem' }}>{formatDop(info.totalDop)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {info.seller.slack_id && (
                    <a
                      href={`https://slack.com/app_redirect?channel=${info.seller.slack_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', textDecoration: 'none' }}
                    >
                      <MessageSquare size={16} /> Escribir por Slack
                    </a>
                  )}
                  {buyerWhatsappOptIn && info.seller.contactPrefs?.whatsapp_opt_in && info.seller.contactPrefs.whatsapp_number && (
                    <a
                      href={`https://wa.me/${info.seller.contactPrefs.whatsapp_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', textDecoration: 'none', background: 'rgba(37,211,102,0.12)', borderColor: 'rgba(37,211,102,0.3)', color: '#25d366' }}
                    >
                      <Phone size={16} /> WhatsApp
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
                    onClick={() => void copyEmail(info.seller.email)}
                  >
                    <Clipboard size={16} />
                    {copiedEmail === info.seller.email ? 'Copiado' : `Copiar email: ${info.seller.email}`}
                  </button>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.25rem' }} onClick={() => setOrdersCreated([])}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className={`drawer ${notificationsOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <Bell size={20} />
              <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Notifications</h2>
            </div>
            <div className="drawer-subcopy">Recent updates from OT, raffles, support and store activity</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {notifications.length > 0 && (
              <button
                className="btn btn-ghost"
                style={{ padding: '0.45rem 0.7rem', fontSize: '0.76rem' }}
                onClick={() => void clearAllNotifications()}
                disabled={clearingNotifications}
              >
                {clearingNotifications ? 'Clearing...' : 'Clear all'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={closeDrawers}>
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="drawer-content">
          {notifications.length > 0 ? (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className="notification-item notification-item-clickable"
                  onClick={() => openNotification(notification)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openNotification(notification);
                    }
                  }}
                >
                  <div className={`notification-dot ${notification.is_read ? '' : 'purple'}`} />
                  <div style={{ flex: 1 }}>
                    <button
                      className="notification-delete-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteNotification(notification.id);
                      }}
                      disabled={deletingNotificationIds.has(notification.id)}
                      aria-label="Delete notification"
                    >
                      {deletingNotificationIds.has(notification.id) ? (
                        <LoaderCircle size={13} className="spin" />
                      ) : (
                        <X size={13} />
                      )}
                    </button>
                    <div className="notification-title">{notification.title}</div>
                    <div className="notification-message">{notification.message}</div>
                    <div className="notification-time">{formatRelativeTime(notification.created_at)}</div>
                    {notification.sender?.role === 'employee' ? (
                      <button
                        type="button"
                        className="notification-mute-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (notification.sender?.id) {
                            void muteNotificationSender(notification.sender.id);
                          }
                        }}
                      >
                        Silenciar remitente
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="drawer-empty">
              <Bell size={30} />
              <p>You have no new notifications.</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .drawer-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px); z-index: 1000; animation: fadeIn 0.2s ease; }
        .drawer { position: fixed; top: 0; right: -420px; bottom: 0; width: 100%; max-width: 380px; background: var(--bg-card); box-shadow: -4px 0 24px rgba(0, 0, 0, 0.2); z-index: 1001; transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; flex-direction: column; }
        .drawer.open { right: 0; }
        .drawer-header { padding: 1.25rem 1.4rem; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
        .drawer-subcopy { margin-top: 0.35rem; color: var(--text-muted); font-size: 0.76rem; line-height: 1.4; }
        .drawer-content { flex: 1; padding: 1.25rem 1.4rem; overflow-y: auto; }
        .drawer-footer { padding: 1.2rem 1.4rem; border-top: 1px solid var(--border-subtle); background: var(--bg-elevated); }
        .drawer-alert { border-radius: 14px; border: 1px solid rgba(234, 179, 8, 0.22); background: rgba(234, 179, 8, 0.1); color: #facc15; padding: 0.85rem 0.95rem; font-size: 0.8rem; line-height: 1.45; margin-bottom: 1rem; }
        .drawer-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; text-align: center; color: var(--text-muted); min-height: 220px; }
        .drawer-empty p { margin: 0; font-weight: 600; color: var(--text-secondary); }
        .drawer-empty span { font-size: 0.8rem; line-height: 1.45; }
        .cart-item-card { border: 1px solid var(--border-subtle); border-radius: 16px; padding: 0.95rem; background: var(--bg-surface); display: grid; gap: 0.85rem; }
        .cart-item-top, .cart-item-bottom { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .cart-item-name { font-weight: 700; font-size: 0.95rem; }
        .cart-item-meta { display: flex; flex-wrap: wrap; gap: 0.35rem; color: var(--text-muted); font-size: 0.75rem; margin-top: 0.2rem; }
        .cart-stepper { display: inline-flex; align-items: center; gap: 0.55rem; padding: 0.25rem; border-radius: 999px; background: rgba(124, 108, 255, 0.08); border: 1px solid rgba(124, 108, 255, 0.14); }
        .qty-btn { width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .qty-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .qty-pill { min-width: 26px; text-align: center; font-weight: 800; }
        .cart-line-total { font-weight: 800; color: var(--brand-primary-light); white-space: nowrap; }
        .cart-summary-panel { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; padding: 0.95rem 1rem; border-radius: 16px; background: rgba(124, 108, 255, 0.08); }
        .cart-summary-panel span { display: block; font-size: 0.82rem; color: var(--text-muted); margin-bottom: 0.15rem; }
        .cart-summary-panel small { color: var(--text-muted); }
        .notification-item { position: relative; display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.875rem; border: 1px solid var(--border-subtle); border-radius: 12px; }
        .notification-item-clickable { cursor: pointer; transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease; }
        .notification-item-clickable:hover { transform: translateY(-1px); border-color: rgba(124, 108, 255, 0.22); background: rgba(255, 255, 255, 0.02); }
        .notification-delete-btn { position: absolute; top: 0.7rem; right: 0.7rem; width: 26px; height: 26px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.08); background: rgba(11, 13, 20, 0.75); color: var(--text-secondary); display: inline-flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.2s ease, color 0.2s ease, border-color 0.2s ease; }
        .notification-item:hover .notification-delete-btn,
        .notification-item:focus-within .notification-delete-btn { opacity: 1; pointer-events: auto; }
        .notification-delete-btn:hover { color: #fca5a5; border-color: rgba(239,68,68,0.28); }
        .notification-title { font-size: 0.875rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; }
        .notification-message { font-size: 0.8125rem; color: var(--text-secondary); line-height: 1.45; padding-right: 1.8rem; }
        .notification-time { margin-top: 0.375rem; font-size: 0.75rem; color: var(--text-muted); }
        .notification-mute-btn { margin-top: 0.55rem; padding: 0; border: 0; background: transparent; color: #93c5fd; font-size: 0.76rem; font-weight: 800; cursor: pointer; text-align: left; }
        .notification-mute-btn:hover { color: #bfdbfe; text-decoration: underline; }
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

