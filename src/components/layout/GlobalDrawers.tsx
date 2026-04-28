'use client';

import { useEffect, useState } from 'react';
import type { BroadcastNotification, StoreThemeConfig } from '@/types/database';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { formatDop } from '@/lib/utils';
import { CheckCircle2, Clipboard, MessageSquare, Minus, Phone, Plus, ShoppingBag, Store, Trash2, X, BellDot, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';

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


export function GlobalDrawers() {
  const {
    cartOpen, setCartOpen,
    notificationsOpen, setNotificationsOpen,
    cart,
    empCart, empCartOpen, setEmpCartOpen,
    setEmpCartItemQuantity, removeFromEmpCart, clearEmpCart,
    buyerWhatsappOptIn,
  } = useAppStore();
  const router = useRouter();

  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderCreatedData, setOrderCreatedData] = useState<OrderCreatedInfo[]>([]);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [empCartBanner, setEmpCartBanner] = useState<string | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastNotification[]>([]);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastNotification | null>(null);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(false);

  useEffect(() => {
    // Load the store theme to pick up the employee cart banner
    const loadTheme = async () => {
      try {
        const res = await fetch('/api/store/theme');
        if (!res.ok) return;
        const data = (await res.json()) as { theme?: StoreThemeConfig };
        setEmpCartBanner(data.theme?.empCartBannerImage ?? null);
      } catch {
        // silent
      }
    };
    void loadTheme();
  }, []);

  useEffect(() => {
    if (notificationsOpen) {
      const loadBroadcasts = async () => {
        setLoadingBroadcasts(true);
        try {
          const supabase = createClient();
          const { data } = await supabase
            .from('broadcast_notifications')
            .select('*, author:users!broadcast_notifications_created_by_fkey(id, name, avatar_url, role)')
            .eq('status', 'published')
            .order('publish_at', { ascending: false })
            .limit(10);
          setBroadcasts(data || []);
        } catch {
          // silent
        } finally {
          setLoadingBroadcasts(false);
        }
      };
      void loadBroadcasts();
    }
  }, [notificationsOpen]);

  const empTotal = empCart.reduce((s, ci) => s + ci.product.price_dop * ci.quantity, 0);

  const handleEmpCheckout = async () => {
    if (empCart.length === 0) return;
    setIsOrdering(true);
    setOrderError(null);
    try {
      const res = await fetch('/api/employee-store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: empCart.map((ci) => ({ productId: ci.product.id, quantity: ci.quantity })),
          contactMethod: 'none',
        }),
      });
      const data = await res.json() as { orders?: Record<string, unknown>[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar la orden.');
      const infos: OrderCreatedInfo[] = (data.orders ?? []).map((o) => {
        const seller = (o.seller ?? {}) as { id?: string; name?: string; email?: string; slack_id?: string | null; contactPrefs?: { whatsapp_number: string | null; whatsapp_opt_in: boolean } | null };
        const store = (o.store ?? {}) as { name?: string };
        return {
          orderId: o.id as string,
          storeName: store.name ?? 'Tienda',
          totalDop: o.total_dop as number,
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
      setOrderCreatedData(infos);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Error desconocido.');
    } finally {
      setIsOrdering(false);
    }
  };

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  const anyOpen = cartOpen || notificationsOpen || empCartOpen;
  const isCartOpen = cartOpen || empCartOpen;

  return (
    <>
      {anyOpen && (
        <div
          className="drawer-overlay"
          onClick={() => { setCartOpen(false); setNotificationsOpen(false); setEmpCartOpen(false); }}
        />
      )}

      {/* Unified Cart Drawer */}
      <div className={`drawer ${isCartOpen ? 'open' : ''}`}>
        <div className="drawer-header-unified" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={20} /> Shopping Cart
          </h2>
          <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => { setCartOpen(false); setEmpCartOpen(false); }}>
            <X size={20} />
          </button>
        </div>

        <div className="drawer-content" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {cart.length === 0 && empCart.length === 0 ? (
            <div className="empty-cart-view">
              <ShoppingBag size={48} strokeWidth={1} style={{ opacity: 0.5 }} />
              <p>Your cart is empty.</p>
            </div>
          ) : (
            <>
              {/* NYT Cart Section */}
              {cart.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>
                    Company Rewards
                  </h3>
                  {cart.map((c) => (
                    <div key={c.item.id} className="nyt-cart-item">
                      <div className="item-info">
                        <div className="item-name">{c.item.name}</div>
                        <div className="item-qty">Quantity: {c.quantity}</div>
                      </div>
                      <div className="item-price">
                        {c.item.points_cost * c.quantity} pts
                      </div>
                    </div>
                  ))}
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.6rem' }} onClick={() => {
                    setCartOpen(false);
                    router.push('/store/checkout');
                  }}>
                    Proceed to Rewards Checkout
                  </button>
                </div>
              )}

              {/* Employee Cart Section */}
              {empCart.length > 0 && (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      marginBottom: '0.5rem',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: '0.5rem',
                      ...(empCartBanner ? {
                        borderRadius: '10px 10px 0 0',
                        background: `linear-gradient(180deg, rgba(8,11,20,0.5) 0%, rgba(8,11,20,0.85) 100%), url('${empCartBanner}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        color: 'white',
                        padding: '0.8rem 0.7rem',
                        border: 'none',
                      } : { color: 'var(--text-muted)' }),
                    }}
                  >
                    <Store size={14} />
                    Employee Stores
                  </div>
                  {empCart.map((ci) => (
                    <div key={ci.product.id} className="emp-cart-item">
                      {ci.product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ci.product.image_url} alt={ci.product.name} className="emp-cart-img" />
                      ) : (
                        <div className="emp-cart-img emp-cart-img-fallback">
                          {ci.product.name.charAt(0)}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ci.product.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <button
                              className="qty-btn"
                              onClick={() => setEmpCartItemQuantity(ci.product.id, ci.quantity - 1)}
                              aria-label="Reducir"
                            >
                              <Minus size={13} />
                            </button>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, minWidth: '1.5rem', textAlign: 'center' }}>
                              {ci.quantity}
                            </span>
                            <button
                              className="qty-btn"
                              onClick={() => setEmpCartItemQuantity(ci.product.id, ci.quantity + 1)}
                              disabled={ci.product.stock !== -1 && ci.quantity >= ci.product.stock}
                              aria-label="Aumentar"
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, color: '#6ee7b7', fontSize: '0.88rem' }}>
                              {formatDop(ci.product.price_dop * ci.quantity)}
                            </span>
                            <button
                              className="qty-btn"
                              style={{ color: '#f87171' }}
                              onClick={() => removeFromEmpCart(ci.product.id)}
                              aria-label="Eliminar"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.88rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Total Dop</span>
                      <span style={{ fontWeight: 800, color: '#6ee7b7', fontSize: '1rem' }}>{formatDop(empTotal)}</span>
                    </div>
                    {orderError && (
                      <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '0.6rem', margin: '0 0 0.6rem' }}>
                        {orderError}
                      </p>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', background: 'linear-gradient(135deg,#059669,#10b981)' }}
                      disabled={isOrdering}
                      onClick={() => void handleEmpCheckout()}
                    >
                      {isOrdering ? 'Procesando…' : 'Confirm Employee Order'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Notifications Drawer */}
      <div className={`drawer ${notificationsOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Notifications</h2>
          </div>
          <button className="btn btn-ghost" style={{ padding: '0.25rem' }} onClick={() => setNotificationsOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <div className="drawer-content" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Company Updates</span>
            <button
              className="btn btn-sm btn-ghost"
              style={{ fontSize: '0.8rem', gap: '0.35rem' }}
              onClick={() => {
                setNotificationsOpen(false);
                router.push('/notifications');
              }}
            >
              <Info size={13} />
              Detail View
            </button>
          </div>
          
          <div className="notifications-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
            {loadingBroadcasts ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading updates...</div>
            ) : broadcasts.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '2rem' }}>
                You have no new notifications.
              </p>
            ) : (
              broadcasts.map((b) => (
                <div key={b.id} style={{ 
                  background: 'rgba(255,255,255,0.02)', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '14px', 
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ 
                      fontSize: '0.65rem', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.05em', 
                      fontWeight: 800,
                      color: b.category === 'availability' ? '#6ee7b7' : b.category === 'stock' ? '#93c5fd' : '#c4b5fd'
                    }}>
                      {b.category?.replace('_', ' ')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(b.publish_at || b.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{b.title}</strong>
                  <p style={{ 
                    fontSize: '0.82rem', 
                    color: 'var(--text-secondary)', 
                    margin: 0,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {b.message}
                  </p>
                  <button 
                    className="btn btn-ghost" 
                    style={{ 
                      padding: '0.4rem', 
                      fontSize: '0.75rem', 
                      justifyContent: 'flex-start', 
                      gap: '0.4rem',
                      color: 'var(--brand-primary-light)',
                      marginTop: '0.2rem'
                    }}
                    onClick={() => setSelectedBroadcast(b)}
                  >
                    <Info size={14} /> Detail view
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Broadcast Detail Modal */}
      {selectedBroadcast && (
        <div 
          className="drawer-overlay" 
          style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setSelectedBroadcast(null)}
        >
          <div 
            style={{ 
              width: 'min(500px, 100%)', 
              background: 'var(--bg-card)', 
              borderRadius: '24px', 
              border: '1px solid var(--border-default)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'popIn 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ 
              padding: '1.5rem', 
              background: 'rgba(255,255,255,0.03)', 
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Comunicado</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Publicado el {new Date(selectedBroadcast.publish_at || selectedBroadcast.created_at).toLocaleString()}</span>
              </div>
              <button className="btn btn-ghost" style={{ padding: '0.5rem' }} onClick={() => setSelectedBroadcast(null)}><X size={20} /></button>
            </div>
            <div style={{ padding: '1.5rem', overflowY: 'auto', maxHeight: '60vh' }}>
              <div style={{ 
                display: 'inline-flex', 
                padding: '0.4rem 0.8rem', 
                borderRadius: '999px', 
                fontSize: '0.7rem', 
                fontWeight: 800, 
                textTransform: 'uppercase',
                marginBottom: '1rem',
                background: selectedBroadcast.category === 'availability' ? 'rgba(110,231,183,0.1)' : selectedBroadcast.category === 'stock' ? 'rgba(147,197,253,0.1)' : 'rgba(196,181,253,0.1)',
                color: selectedBroadcast.category === 'availability' ? '#6ee7b7' : selectedBroadcast.category === 'stock' ? '#93c5fd' : '#c4b5fd',
                border: '1px solid currentColor'
              }}>
                {selectedBroadcast.category?.replace('_', ' ')}
              </div>
              <h2 style={{ fontSize: '1.5rem', margin: '0 0 1rem', lineHeight: 1.2 }}>{selectedBroadcast.title}</h2>
              <p style={{ color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>
                {selectedBroadcast.message}
              </p>
              
              <div style={{ 
                marginTop: '2rem', 
                paddingTop: '1.5rem', 
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedBroadcast.author?.avatar_url ? (
                    <img src={selectedBroadcast.author.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '10px', objectFit: 'cover' }} />
                  ) : (
                    <BellDot size={20} color="var(--text-muted)" />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{selectedBroadcast.author?.name || 'Sistema Outplex'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedBroadcast.author?.role || 'Moderador'}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '1.25rem', background: 'var(--bg-elevated)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setSelectedBroadcast(null)}>Entendido</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Created Popup */}
      {orderCreatedData.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'rgba(7,9,16,0.72)', backdropFilter: 'blur(10px)' }}
          onClick={() => setOrderCreatedData([])}
        >
          <div
            style={{ width: 'min(540px,100%)', borderRadius: 24, background: 'rgba(15,19,35,0.98)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 32px 64px rgba(0,0,0,0.5)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#059669,#10b981)', marginBottom: '1rem' }}>
                <CheckCircle2 size={28} color="white" />
              </div>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>¡Tu solicitud de orden fue generada!</h2>
              <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                Contacta al vendedor para coordinar la entrega.
              </p>
            </div>

            {orderCreatedData.map((info) => (
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
                    {copiedEmail === info.seller.email ? '¡Copiado!' : `Copiar email: ${info.seller.email}`}
                  </button>
                </div>
              </div>
            ))}

            <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.25rem' }} onClick={() => setOrderCreatedData([])}>
              Cerrar
            </button>
          </div>
        </div>
      )}

      <style>{`
        .drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(2px);
          z-index: 1000;
          animation: fadeIn 0.2s ease;
        }

        .drawer {
          position: fixed;
          top: 0;
          right: -400px;
          bottom: 0;
          width: 100%;
          max-width: 360px;
          background: var(--bg-card);
          box-shadow: -4px 0 24px rgba(0,0,0,0.2);
          z-index: 1001;
          transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
        }

        .drawer.open {
          right: 0;
        }

        .drawer-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .drawer-header-unified {
          padding: 1rem;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-elevated);
        }

        .cart-mode-toggle {
          display: flex;
          background: rgba(0,0,0,0.2);
          padding: 0.25rem;
          border-radius: 12px;
          gap: 0.25rem;
        }

        .mode-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .mode-btn.active {
          background: var(--bg-card);
          color: var(--text-primary);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .empty-cart-view {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding-top: 4rem;
          color: var(--text-muted);
        }

        .empty-cart-view p {
          font-size: 0.875rem;
        }

        .nyt-cart-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .nyt-cart-item .item-name {
          font-weight: 600;
          font-size: 0.9375rem;
        }

        .nyt-cart-item .item-qty {
          font-size: 0.8125rem;
          color: var(--text-secondary);
        }

        .nyt-cart-item .item-price {
          font-weight: 700;
          color: var(--brand-primary-light);
        }

        .drawer-content {
          flex: 1;
          padding: 1.5rem;
          overflow-y: auto;
        }

        .drawer-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
        }

        .emp-cart-item {
          display: flex;
          gap: 0.75rem;
          align-items: flex-start;
          padding: 0.85rem 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .emp-cart-item:last-child {
          border-bottom: none;
        }

        .emp-cart-img {
          width: 52px;
          height: 52px;
          border-radius: 10px;
          object-fit: cover;
          flex-shrink: 0;
          border: 1px solid var(--border-subtle);
        }

        .emp-cart-img-fallback {
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(16,185,129,0.12);
          color: #6ee7b7;
          font-size: 1.2rem;
          font-weight: 800;
        }

        .qty-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s ease;
          padding: 0;
        }

        .qty-btn:hover:not(:disabled) {
          background: rgba(255,255,255,0.08);
          color: var(--text-primary);
        }

        .qty-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
