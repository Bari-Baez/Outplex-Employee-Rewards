'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatPoints, getStockLabel } from '@/lib/store-helpers';
import { PurchaseOverlay } from '@/components/store/PurchaseOverlay';
import { useAppStore, type CartItem } from '@/lib/store';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import { AlertCircle, RefreshCcw, ShoppingBag, Trash2, Zap } from 'lucide-react';

type OverlayPhase = 'processing' | 'success';

export default function CheckoutPage() {
  const [supabase] = useState(() => createClient());
  const { cart, clearCart, removeFromCart, syncCartItems } = useAppStore();
  const router = useRouter();
  const [isRefreshingInventory, setIsRefreshingInventory] = useState(false);
  const [inventoryMessage, setInventoryMessage] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('processing');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [orderSnapshot, setOrderSnapshot] = useState<CartItem[]>([]);

  const totalPoints = useMemo(
    () => cart.reduce((accumulator, cartItem) => accumulator + cartItem.item.points_cost * cartItem.quantity, 0),
    [cart],
  );
  const snapshotPoints = useMemo(
    () => orderSnapshot.reduce((sum, line) => sum + line.item.points_cost * line.quantity, 0),
    [orderSnapshot],
  );

  const refreshInventory = async () => {
    if (cart.length === 0) {
      return true;
    }

      setIsRefreshingInventory(true);
    try {
      const itemIds = cart.map((cartItem) => cartItem.item.id);
      const { data, error } = await supabase
        .from('store_items')
        .select('id, name, description, points_cost, image_url, stock, is_active, created_at')
        .in('id', itemIds);
      if (error) {
        throw error;
      }

      const syncResult = syncCartItems(data ?? []);
      if (syncResult.removedIds.length > 0 || syncResult.reducedIds.length > 0) {
        setInventoryMessage(
          'Your checkout summary was refreshed because stock changed while your page was open.',
        );
      } else {
        setInventoryMessage(null);
      }

      return true;
    } catch (error) {
      setInventoryMessage(
        error instanceof Error ? error.message : 'Unable to verify live inventory right now.',
      );
      return false;
    } finally {
      setIsRefreshingInventory(false);
    }
  };

  useEffect(() => {
    void refreshInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinalConfirm = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setCheckoutError(null);

    const inventoryOk = await refreshInventory();
    if (!inventoryOk) return;

    setIsSubmitting(true);
    setOverlayOpen(true);
    setOverlayPhase('processing');

    try {
      const response = await fetch('/api/store/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart }),
      });

      const data = (await response.json()) as { error?: string; orderId?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Checkout failed.');
      }

      setOrderSnapshot(cart);
      setCreatedOrderId(data.orderId ?? null);
      clearCart();
      router.refresh();

      setOverlayPhase('success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected checkout error.';
      setCheckoutError(message);
      setOverlayOpen(false);
      await refreshInventory();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cart.length === 0 && !overlayOpen) {
    return (
      <div className="empty-state">
        <ShoppingBag size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
        <h2>Your cart is empty</h2>
        <p style={{ color: 'var(--text-muted)' }}>Add a reward from the store before checking out.</p>
        <button className="btn btn-primary" onClick={() => router.push('/store')}>
          Browse Store
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: 980, margin: '0 auto' }}>
      <PurchaseOverlay
        open={overlayOpen}
        phase={overlayPhase}
        title={overlayPhase === 'processing' ? 'Processing your order' : 'Order placed'}
        subtitle={
          overlayPhase === 'processing'
            ? 'Locking inventory and deducting points...'
            : 'Your order is now pending moderator review.'
        }
        onClose={
          overlayPhase === 'success'
            ? () => {
                setOverlayOpen(false);
              }
            : undefined
        }
      >
        {overlayPhase === 'success' && (
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.75rem', color: 'rgba(148,163,184,0.9)' }}>
                    Order summary
                  </div>
                  <div style={{ marginTop: '0.35rem', fontWeight: 800 }}>
                    {orderSnapshot.reduce((sum, line) => sum + line.quantity, 0)} item(s){' \u2022 '}
                    {orderSnapshot.length} reward(s)
                  </div>
                </div>
                <div style={{ fontWeight: 900, color: 'var(--brand-primary-light)' }}>{formatPoints(snapshotPoints)}</div>
              </div>

              {createdOrderId && (
                <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: 'rgba(148,163,184,0.9)' }}>
                  Reference: <span style={{ color: 'rgba(241,245,249,0.92)', fontWeight: 800 }}>{createdOrderId.slice(0, 8).toUpperCase()}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push(createdOrderId ? `/orders?highlight=${createdOrderId}` : '/orders')}
              >
                View order
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.push('/store')}>
                Continue shopping
              </button>
            </div>
          </div>
        )}
      </PurchaseOverlay>

      <div className="checkout-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShoppingBag /> Secure Checkout
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.65rem 0 0' }}>
            Live inventory is checked again before your points are deducted.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => void refreshInventory()} disabled={isRefreshingInventory}>
          <RefreshCcw size={16} /> {isRefreshingInventory ? 'Refreshing...' : 'Refresh Inventory'}
        </button>
      </div>

      {inventoryMessage && (
        <div className="checkout-alert">
          <AlertCircle size={18} />
          <span>{inventoryMessage}</span>
        </div>
      )}

      {checkoutError && (
        <div className="checkout-alert" style={{ borderColor: 'rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          <AlertCircle size={18} />
          <span>{checkoutError}</span>
        </div>
      )}

      <div className="checkout-grid">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ margin: 0 }}>Order Summary</h3>
          </div>
          <div style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
            {cart.map((cartItem) => (
              <div key={cartItem.item.id} className="checkout-line-item">
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div className="checkout-line-image">
                    {cartItem.item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={proxifyMediaUrl(cartItem.item.image_url)} alt={cartItem.item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="checkout-line-fallback">Reward</div>
                    )}
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem', fontSize: '1rem' }}>{cartItem.item.name}</h4>
                    <div className="checkout-line-meta">
                      <span>Qty: {cartItem.quantity}</span>
                      <span>{'\u2022'}</span>
                      <span>{formatPoints(cartItem.item.points_cost)} each</span>
                      <span>{'\u2022'}</span>
                      <span>{getStockLabel(cartItem.item)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div className="checkout-line-total">
                    <Zap size={16} />
                    {formatPoints(cartItem.item.points_cost * cartItem.quantity)}
                  </div>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '0.4rem', color: '#f87171' }}
                    onClick={() => removeFromCart(cartItem.item.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ position: 'sticky', top: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem' }}>Payment</h3>

            <div className="payment-row">
              <span>Subtotal</span>
              <span>{formatPoints(totalPoints)}</span>
            </div>
            <div className="payment-row">
              <span>Taxes</span>
              <span>0 pts</span>
            </div>

            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '1rem 0' }} />

            <div className="payment-total-row">
              <span>Total Due</span>
              <strong>
                <Zap size={18} />
                {formatPoints(totalPoints)}
              </strong>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', height: '3.4rem', fontSize: '1.05rem' }}
              onClick={handleFinalConfirm}
              disabled={isSubmitting || isRefreshingInventory || cart.length === 0}
            >
              {isSubmitting ? 'Processing...' : 'Complete Order'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.5 }}>
              Points are deducted only after the final stock validation passes.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .checkout-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .checkout-alert {
          display: flex;
          align-items: flex-start;
          gap: 0.7rem;
          padding: 0.95rem 1rem;
          border-radius: 16px;
          border: 1px solid rgba(234, 179, 8, 0.22);
          background: rgba(234, 179, 8, 0.1);
          color: #facc15;
          margin-bottom: 1.5rem;
          line-height: 1.5;
        }

        .checkout-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 1.5rem;
        }

        .checkout-line-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-subtle);
        }

        .checkout-line-item:last-child {
          padding-bottom: 0;
          border-bottom: none;
        }

        .checkout-line-image {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          flex-shrink: 0;
        }

        .checkout-line-fallback {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-size: 0.8rem;
        }

        .checkout-line-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          color: var(--text-muted);
          font-size: 0.78rem;
        }

        .checkout-line-total {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          font-weight: 800;
          color: var(--brand-primary-light);
          white-space: nowrap;
        }

        .payment-row,
        .payment-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
        }

        .payment-row {
          margin-bottom: 0.85rem;
          color: var(--text-secondary);
        }

        .payment-total-row {
          margin-bottom: 1.5rem;
          font-size: 1.1rem;
          font-weight: 800;
        }

        .payment-total-row strong {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          color: var(--brand-primary-light);
        }

        .empty-state {
          text-align: center;
          margin-top: 4rem;
          display: grid;
          gap: 0.75rem;
          justify-items: center;
        }

        @media (max-width: 900px) {
          .checkout-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 680px) {
          .checkout-header,
          .checkout-line-item {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
    </div>
  );
}

