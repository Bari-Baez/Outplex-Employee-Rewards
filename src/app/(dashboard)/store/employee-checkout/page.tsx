'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore, type EmpCartItem } from '@/lib/store';
import { formatDop } from '@/lib/utils';
import { PurchaseOverlay } from '@/components/store/PurchaseOverlay';
import { AlertCircle, ArrowLeft, ShoppingCart, Store } from 'lucide-react';

type OverlayPhase = 'processing' | 'success';
type SellerContactPreferences = {
  whatsapp_number: string | null;
  whatsapp_opt_in: boolean;
};

interface CreatedEmpOrder {
  id: string;
  total_dop: number;
  store?: { id: string; slug: string; name: string } | null;
  seller?: { id: string; name: string; email: string; slack_id: string | null; contactPrefs?: SellerContactPreferences } | null;
}

function groupByStore(cart: EmpCartItem[]) {
  const groups = new Map<string, { storeName: string; lines: EmpCartItem[] }>();
  for (const line of cart) {
    const storeId = line.product.store?.id ?? 'unknown';
    const storeName = line.product.store?.name ?? 'Tienda de empleado';
    const existing = groups.get(storeId);
    if (existing) existing.lines.push(line);
    else groups.set(storeId, { storeName, lines: [line] });
  }
  return [...groups.entries()].map(([storeId, value]) => ({ storeId, ...value }));
}

export default function EmployeeCheckoutPage() {
  const { empCart, clearEmpCart } = useAppStore();
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<OverlayPhase>('processing');
  const [createdOrders, setCreatedOrders] = useState<CreatedEmpOrder[]>([]);
  const [cartSnapshot, setCartSnapshot] = useState<EmpCartItem[]>([]);
  const [snapshotTotalDop, setSnapshotTotalDop] = useState(0);

  const grouped = useMemo(() => groupByStore(empCart), [empCart]);
  const totalDop = useMemo(() => empCart.reduce((sum, line) => sum + line.product.price_dop * line.quantity, 0), [empCart]);

  const handleConfirm = async () => {
    if (empCart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setOverlayOpen(true);
    setOverlayPhase('processing');
    setCartSnapshot(empCart);
    setSnapshotTotalDop(totalDop);

    try {
      const res = await fetch('/api/employee-store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: empCart.map((ci) => ({ productId: ci.product.id, quantity: ci.quantity })),
          contactMethod: 'none',
        }),
      });
      const data = (await res.json()) as { orders?: CreatedEmpOrder[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar la orden.');

      setCreatedOrders(data.orders ?? []);
      clearEmpCart();
      setOverlayPhase('success');
    } catch (err) {
      setOverlayOpen(false);
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (empCart.length === 0 && !overlayOpen) {
    return (
      <div className="empty-state">
        <Store size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
        <h2>Tu carrito de empleados está vacío</h2>
        <p style={{ color: 'var(--text-muted)' }}>Agrega productos desde “Tiendas de Empleados” para confirmar una orden.</p>
        <button className="btn btn-primary" onClick={() => router.push('/store')}>
          Volver a la tienda
        </button>
      </div>
    );
  }

  const firstOrderId = createdOrders[0]?.id ?? null;

  return (
    <div className="animate-fade-in" style={{ maxWidth: 980, margin: '0 auto' }}>
      <PurchaseOverlay
        open={overlayOpen}
        phase={overlayPhase}
        title={overlayPhase === 'processing' ? 'Procesando tu orden' : 'Orden enviada'}
        subtitle={
          overlayPhase === 'processing'
            ? 'Reservando inventario y creando tu solicitud…'
            : 'Coordina el pago y entrega directamente con el vendedor.'
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
                    Resumen
                  </div>
                  <div style={{ marginTop: '0.35rem', fontWeight: 800 }}>
                    {createdOrders.length} orden(es) • {cartSnapshot.reduce((sum, line) => sum + line.quantity, 0)} producto(s)
                  </div>
                </div>
                <div style={{ fontWeight: 900, color: '#6ee7b7' }}>{formatDop(snapshotTotalDop)}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '0.55rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => router.push(firstOrderId ? `/orders?tab=employee&highlightEmp=${firstOrderId}` : '/orders?tab=employee')}
              >
                Ver órdenes
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => router.push('/store')}>
                Seguir comprando
              </button>
            </div>
          </div>
        )}
      </PurchaseOverlay>

      <div className="checkout-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <ShoppingCart /> Confirmación de compra
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.65rem 0 0' }}>
            Confirma el resumen. Outplex no procesa pagos: coordina directamente con el vendedor.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => router.push('/store')}>
          <ArrowLeft size={16} /> Volver
        </button>
      </div>

      {error && (
        <div className="checkout-alert" style={{ borderColor: 'rgba(239,68,68,0.22)', background: 'rgba(239,68,68,0.08)', color: '#f87171' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="checkout-grid">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 style={{ margin: 0 }}>Order Summary</h3>
          </div>

          <div style={{ padding: '1.5rem', display: 'grid', gap: '1.1rem' }}>
            {grouped.map((storeGroup) => (
              <div key={storeGroup.storeId} className="card" style={{ padding: '1rem', background: 'rgba(16,185,129,0.05)', borderColor: 'rgba(16,185,129,0.18)' }}>
                <div style={{ fontWeight: 900, marginBottom: '0.75rem' }}>{storeGroup.storeName}</div>
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {storeGroup.lines.map((line) => (
                    <div key={line.product.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{line.product.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {line.quantity} × RD$ {line.product.price_dop.toLocaleString('es-DO')}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, color: '#6ee7b7' }}>
                        RD$ {(line.product.price_dop * line.quantity).toLocaleString('es-DO')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ position: 'sticky', top: '2rem' }}>
            <h3 style={{ margin: '0 0 1.5rem' }}>Pago</h3>

            <div className="payment-row">
              <span>Total</span>
              <strong style={{ color: '#6ee7b7' }}>{formatDop(totalDop)}</strong>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%', height: '3.4rem', fontSize: '1.05rem', background: 'linear-gradient(135deg,#059669,#10b981)' }}
              onClick={handleConfirm}
              disabled={isSubmitting || empCart.length === 0}
            >
              {isSubmitting ? 'Procesando…' : 'Confirmar orden'}
            </button>
            <p style={{ textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: 1.5 }}>
              Esta compra genera una solicitud de orden. El pago se coordina fuera de la plataforma.
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

        .payment-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
          color: var(--text-secondary);
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
      `}</style>
    </div>
  );
}
