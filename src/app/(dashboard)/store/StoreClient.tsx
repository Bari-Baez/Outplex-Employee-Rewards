'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/lib/store';
import { formatDop } from '@/lib/utils';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import {
  formatPoints,
  getLowStockUrgencyCopy,
  getStockLabel,
  getStoreThemePresentation,
  isLowStockItem,
} from '@/lib/store-helpers';
import type {
  EmployeeStoreProduct,
  EmployeeStoreProductReview,
  StoreItem,
  StoreThemeConfig,
  StoreReview,
  User,
} from '@/types/database';
import { AlertCircle, ArrowLeft, CheckCircle2, Clipboard, Clock3, Heart, Info, MessageSquare, Phone, ShoppingBag, Sparkles, Star, Store, Zap } from 'lucide-react';

type EmployeeReviewUser = Pick<User, 'id' | 'name' | 'avatar_url'>;
type EmployeeProductReview = Pick<EmployeeStoreProductReview, 'id' | 'rating' | 'user_id'> & {
  user?: EmployeeReviewUser | null;
};
type OperatingHoursConfig = Record<string, { isOpen: boolean; open: string; close: string }>;

interface EmployeeStoreProductPublic {
  id: string;
  store_id: string;
  name: string;
  description: string | null;
  price_dop: number;
  cost_dop: number;
  image_url: string | null;
  category: string | null;
  stock: number;
  is_active: boolean;
  status?: EmployeeStoreProduct['status'];
  created_at: string;
  updated_at: string;
  reviews?: EmployeeProductReview[];
}

interface EmployeeStorePublic {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  banner_image: string | null;
  logo_image: string | null;
  accent_color: string | null;
  status: string;
  is_open?: boolean;
  operating_hours?: OperatingHoursConfig | null;
  first_product_published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  owner: { id: string; name: string; email: string; avatar_url: string | null; slack_id: string | null } | null;
  products: EmployeeStoreProductPublic[];
}

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

interface StoreClientProps {
  items: StoreItem[];
  profile: { points: number; name: string; slackId: string | null };
  theme: StoreThemeConfig;
  employeeStores: EmployeeStorePublic[];
  buyerContactPrefs: { user_id: string; whatsapp_number: string | null; whatsapp_opt_in: boolean } | null;
}

const NEW_EMPLOYEE_STORE_WINDOW_DAYS = 20;

function getEmployeeStoreFirstPublishedAt(store: EmployeeStorePublic): string | null {
  if (store.first_product_published_at) return store.first_product_published_at;
  const earliestProduct = store.products?.reduce<string | null>((min, product) => {
    if (!product?.created_at) return min;
    if (!min) return product.created_at;
    return new Date(product.created_at).getTime() < new Date(min).getTime() ? product.created_at : min;
  }, null);
  return earliestProduct ?? null;
}

function isEmployeeStoreNew(store: EmployeeStorePublic) {
  const at = getEmployeeStoreFirstPublishedAt(store);
  if (!at) return false;
  const diffMs = Date.now() - new Date(at).getTime();
  return diffMs < NEW_EMPLOYEE_STORE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function isStoreCurrentlyOpen(store: EmployeeStorePublic) {
  if (store.is_open === false) return false;
  try {
    if (store.operating_hours && typeof store.operating_hours === 'object') {
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const now = new Date();
      const day = dayNames[now.getDay()];
      const config = store.operating_hours[day];
      if (config) {
        if (config.isOpen === false) return false;
        if (config.open && config.close) {
          const currentMinutes = now.getHours() * 60 + now.getMinutes();
          const [openH, openM] = String(config.open).split(':').map(Number);
          const [closeH, closeM] = String(config.close).split(':').map(Number);
          
          if (!isNaN(openH) && !isNaN(closeH)) {
            const openMinutes = openH * 60 + (openM || 0);
            const closeMinutes = closeH * 60 + (closeM || 0);
            if (currentMinutes < openMinutes || currentMinutes > closeMinutes) {
              return false;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[store] error parsing operating hours', err);
    // fallback to open if metadata is corrupted
  }
  return true;
}

export function StoreClient({ items, profile, theme, employeeStores, buyerContactPrefs }: StoreClientProps) {
  const { addToCart, cart, setCartOpen, addToEmpCart, empCart, setEmpCartOpen, setBuyerWhatsappOptIn } = useAppStore();

  useEffect(() => {
    setBuyerWhatsappOptIn(buyerContactPrefs?.whatsapp_opt_in ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [reviewsMap, setReviewsMap] = useState<Record<string, { avg: number; count: number; reviews: StoreReview[] }>>({});

  // Employee store state
  const [storeMode, setStoreMode] = useState<'nyt' | 'employee'>('nyt');
  const [activeStore, setActiveStore] = useState<EmployeeStorePublic | null>(null);
  const [ordersCreated, setOrdersCreated] = useState<OrderCreatedInfo[]>([]);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const [isRating, setIsRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);
  
  const [selectedEmpItem, setSelectedEmpItem] = useState<EmployeeStoreProductPublic | null>(null);

  // Review state for employee products: map of productId -> avg, count, user's rating
  const [empReviewsMap, setEmpReviewsMap] = useState<Record<string, { avg: number; count: number; reviews: EmployeeProductReview[] }>>({});

  const visibleEmployeeStores = useMemo(() => {
    return employeeStores
      .filter((store) => {
        const statusOk = store.status === 'active' || store.status === 'approved' || store.status === 'scheduled';
        // Only show stores publicly once they've added their first product.
        const hasFirstProduct = Boolean(getEmployeeStoreFirstPublishedAt(store)) || (store.products?.length ?? 0) > 0;
        return statusOk && hasFirstProduct;
      })
      .sort((a, b) => {
        const newA = isEmployeeStoreNew(a);
        const newB = isEmployeeStoreNew(b);
        if (newA && !newB) return -1;
        if (!newA && newB) return 1;

        const aTs = new Date(getEmployeeStoreFirstPublishedAt(a) ?? a.created_at ?? 0).getTime();
        const bTs = new Date(getEmployeeStoreFirstPublishedAt(b) ?? b.created_at ?? 0).getTime();
        return bTs - aTs;
      });
  }, [employeeStores]);

  useEffect(() => {
    // Initialize employee reviews from the prop
    const newMap: Record<string, { avg: number; count: number; reviews: EmployeeProductReview[] }> = {};
    for (const store of employeeStores) {
      for (const prod of store.products) {
        if (prod.reviews && prod.reviews.length > 0) {
          const avg = prod.reviews.reduce((sum, r) => sum + r.rating, 0) / prod.reviews.length;
          newMap[prod.id] = { avg, count: prod.reviews.length, reviews: prod.reviews };
        }
      }
    }
    setEmpReviewsMap(newMap);
  }, [employeeStores]);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    const loadFavorites = async () => {
      try {
        const res = await fetch('/api/store/favorites', { signal });
        const data = (await res.json()) as { favoriteItemIds?: string[] };
        setFavoriteIds(new Set(data.favoriteItemIds ?? []));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('[store] loadFavorites failed', err);
      }
    };

    const loadReviewsSummary = async () => {
      try {
        const res = await fetch('/api/store/reviews/summary', { signal });
        const data = (await res.json()) as { summary?: Record<string, { avg: number; count: number }> };
        if (data.summary) {
          const nextMap: typeof reviewsMap = {};
          Object.entries(data.summary).forEach(([itemId, val]) => {
            nextMap[itemId] = { ...val, reviews: [] };
          });
          setReviewsMap(nextMap);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.warn('[store] failed to load reviews summary', err);
      }
    };

    void loadFavorites();
    void loadReviewsSummary();
    return () => controller.abort();
  }, [items]);

  const toggleFavorite = useCallback(async (itemId: string) => {
    try {
      const res = await fetch('/api/store/favorites/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId }),
      });
      const data = (await res.json()) as { isFavorite?: boolean };
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (data.isFavorite) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    } catch {
      toast.error('No se pudo actualizar favoritos');
    }
  }, []);

  const submitReview = useCallback(async (itemId: string, rating: number, comment?: string) => {
    setIsRating(true);
    setRatingError(null);
    try {
      const res = await fetch('/api/store/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al calificar');

      const summaryRes = await fetch('/api/store/reviews/summary');
      const summaryData = (await summaryRes.json()) as { summary?: Record<string, { avg: number; count: number }> };
      if (summaryData.summary) {
        setReviewsMap(prev => {
          const next = { ...prev };
          Object.entries(summaryData.summary!).forEach(([id, val]) => {
            next[id] = { ...val, reviews: prev[id]?.reviews ?? [] };
          });
          return next;
        });
      }
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : 'Error al calificar');
    } finally {
      setIsRating(false);
    }
  }, [profile.name]);

  const submitEmpReview = useCallback(async (productId: string, rating: number) => {
    setIsRating(true);
    setRatingError(null);
    try {
      const res = await fetch('/api/employee-store/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating }),
      });
      const data = (await res.json()) as { review?: EmployeeProductReview; error?: string };
      if (!res.ok) throw new Error(data.error || 'Error al calificar');

      if (data.review) {
        const newReview = data.review;
        setEmpReviewsMap(prev => {
          const existing = prev[productId] || { avg: 0, count: 0, reviews: [] };
          const newReviews = [newReview, ...existing.reviews.filter(r => r.user_id !== newReview.user_id)];
          const newAvg = newReviews.reduce((sum, r) => sum + r.rating, 0) / newReviews.length;
          return { ...prev, [productId]: { avg: newAvg, count: newReviews.length, reviews: newReviews } };
        });
      }
    } catch (err) {
      setRatingError(err instanceof Error ? err.message : 'Error al calificar');
    } finally {
      setIsRating(false);
    }
  }, []);

  const themePresentation = getStoreThemePresentation(theme);
  const cartQuantities = useMemo(() => {
    return cart.reduce<Record<string, number>>((accumulator, cartItem) => {
      accumulator[cartItem.item.id] = cartItem.quantity;
      return accumulator;
    }, {});
  }, [cart]);

  const availableItems = items.filter((item) => item.stock !== 0).length;
  const groupedItems = useMemo(() => {
    const groups = new Map<string, StoreItem[]>();

    for (const item of items) {
      const category = item.meta?.category?.trim() || 'Featured Rewards';
      const existing = groups.get(category) ?? [];
      existing.push(item);
      groups.set(category, existing);
    }

    return [...groups.entries()].map(([category, categoryItems]) => ({
      category,
      items: [...categoryItems].sort((left, right) => left.points_cost - right.points_cost),
    }));
  }, [items]);

  const handleAddToCart = (item: StoreItem) => {
    addToCart(item);
    setCartOpen(true);
  };

  const empCartQuantities = useMemo(
    () => empCart.reduce<Record<string, number>>((acc, ci) => { acc[ci.product.id] = ci.quantity; return acc; }, {}),
    [empCart],
  );

  const groupedEmpProducts = useMemo(() => {
    if (!activeStore) return [];
    const groups = new Map<string, EmployeeStoreProductPublic[]>();
    for (const p of activeStore.products) {
      const cat = p.category?.trim() || 'Productos';
      groups.set(cat, [...(groups.get(cat) ?? []), p]);
    }
    return [...groups.entries()].map(([cat, prods]) => ({ cat, prods }));
  }, [activeStore]);

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
      setOrdersCreated(infos);
      if (activeStore) {
        const purchasedQty = empCart.reduce<Record<string, number>>((acc, cartItem) => {
          acc[cartItem.product.id] = (acc[cartItem.product.id] ?? 0) + cartItem.quantity;
          return acc;
        }, {});
        setActiveStore({
          ...activeStore,
          products: activeStore.products.map((product) => {
            const qty = purchasedQty[product.id] ?? 0;
            if (qty <= 0 || product.stock === -1) return product;
            return { ...product, stock: Math.max(0, product.stock - qty) };
          }),
        });
      }
      useAppStore.getState().clearEmpCart();
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

  return (
    <div className="store-shell">
      <div
        className="store-backdrop"
        style={{
          backgroundImage: storeMode === 'nyt'
            ? (theme.backgroundImage
              ? `linear-gradient(180deg, rgba(9, 11, 22, ${theme.overlayOpacity ?? 0.68}) 0%, rgba(9, 11, 22, 0.95) 100%), url(${theme.backgroundImage})`
              : themePresentation.heroGradient)
            : (activeStore?.banner_image
                ? `linear-gradient(180deg, rgba(9, 11, 22, 0.72) 0%, rgba(9, 11, 22, 0.95) 100%), url(${activeStore.banner_image})`
                : `linear-gradient(180deg, rgba(9, 11, 22, 0.72) 0%, rgba(9, 11, 22, 0.95) 100%), url(${proxifyMediaUrl('https://images.unsplash.com/photo-1557821552-17105176677c?auto=format&fit=crop&q=80&w=2000')})`),
        }}
      />

      {/* Store mode toggle */}
      <div className="store-mode-toggle animate-fade-in">
        <button
          type="button"
          className={`store-mode-btn ${storeMode === 'nyt' ? 'active' : ''}`}
          onClick={() => { setStoreMode('nyt'); setActiveStore(null); }}
        >
          <Zap size={15} />
          Tienda Outplex
        </button>
        <button
          type="button"
          className={`store-mode-btn ${storeMode === 'employee' ? 'active' : ''}`}
          onClick={() => setStoreMode('employee')}
        >
          <Store size={15} />
          Tiendas de Empleados
          {visibleEmployeeStores.length > 0 && (
            <span className="emp-store-badge">{visibleEmployeeStores.length}</span>
          )}
        </button>
      </div>

      <section className="store-hero animate-fade-in">
        <div className="store-hero-copy">
          {storeMode === 'nyt' ? (
            <>
              <div className="hero-chip">
                <Sparkles size={14} />
                {availableItems} reward{availableItems === 1 ? '' : 's'} available now
              </div>
              <h1 className="store-title">{theme.headline}</h1>
              <p className="store-subtitle">{theme.subheading}</p>
            </>
          ) : activeStore ? (
            <>
              <button
                type="button"
                className="hero-back-btn"
                onClick={() => setActiveStore(null)}
              >
                <ArrowLeft size={16} /> Todas las tiendas
              </button>
              <div className="hero-chip">
                <Store size={14} />
                {activeStore.products.length} producto{activeStore.products.length === 1 ? '' : 's'}
              </div>
              <h1 className="store-title" style={{ fontSize: 'clamp(1.8rem, 3vw, 2.8rem)' }}>{activeStore.name}</h1>
              {activeStore.description && <p className="store-subtitle">{activeStore.description}</p>}
            </>
          ) : (
            <>
              <div className="hero-chip">
                <Store size={14} />
                {visibleEmployeeStores.length} tienda{visibleEmployeeStores.length === 1 ? '' : 's'} activa{visibleEmployeeStores.length === 1 ? '' : 's'}
              </div>
              <h1 className="store-title">Tiendas de Empleados</h1>
              <p className="store-subtitle">Compra productos de tus compañeros. Los precios son en pesos dominicanos.</p>
            </>
          )}
        </div>

        <div className="store-balance-card" style={{ boxShadow: `0 20px 50px ${themePresentation.glow}` }}>
          {storeMode === 'nyt' ? (
            <>
              <div className="balance-label">Available balance</div>
              <div className="balance-value">
                <Zap size={20} />
                <span>{profile.points.toLocaleString('en-US')}</span>
                <small>pts</small>
              </div>
              <div className="balance-copy">Cart is saved on this device for 2 hours.</div>
            </>
          ) : (
            <>
              <div className="balance-label">Carrito de empleados</div>
              <div className="balance-value" style={{ fontSize: '1.5rem' }}>
                <Store size={18} />
                <span>{empCart.reduce((s, ci) => s + ci.quantity, 0)}</span>
                <small>items</small>
              </div>
              <div className="balance-copy">
                {empCart.length > 0
                  ? `Total: ${formatDop(empCart.reduce((s, ci) => s + ci.product.price_dop * ci.quantity, 0))}`
                  : 'Tu carrito de empleados está vacío.'}
              </div>
              {empCart.length > 0 && (
                <button
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.75rem', fontSize: '0.88rem' }}
                  onClick={() => setEmpCartOpen(true)}
                >
                  Ver carrito
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {storeMode === 'nyt' && (items.length === 0 ? (
        <div className="card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <ShoppingBag size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h2 style={{ marginBottom: '0.5rem' }}>The store is being refreshed</h2>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Rewards will appear here once the inventory is published again.
          </p>
        </div>
      ) : (
        <div className="store-sections animate-fade-in delay-100">
          {favoriteIds.size > 0 && (
            <section className="category-section">
              <div className="category-header">
                <div>
                  <div className="category-kicker">Saved</div>
                  <h2 className="category-title">♥ Mis Favoritos</h2>
                </div>
                <div className="category-count">{favoriteIds.size} item{favoriteIds.size === 1 ? '' : 's'}</div>
              </div>
              <div className="store-grid">
                {items
                  .filter((item) => favoriteIds.has(item.id))
                  .map((item) => {
                    const outOfStock = item.stock === 0;
                    const inCart = cartQuantities[item.id] ?? 0;
                    const insufficientPoints = profile.points < item.points_cost;
                    const lowStock = isLowStockItem(item);
                    const urgencyCopy = getLowStockUrgencyCopy(item);

                    return (
                      <article
                        key={item.id}
                        className={`store-card ${outOfStock ? 'store-card-soldout' : ''}`}
                        style={{ boxShadow: outOfStock ? 'none' : `0 18px 45px ${themePresentation.glow}` }}
                      >
                        <button type="button" className="store-image-button" onClick={() => setSelectedItem(item)}>
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxifyMediaUrl(item.image_url)} alt={item.name} className="store-image" />
                          ) : (
                            <div className="store-image-placeholder">Reward</div>
                          )}
                          <div className="store-image-overlay">
                            <span>Quick view</span>
                          </div>
                          {outOfStock && <div className="soldout-banner">Sold out for now</div>}
                        </button>
                        <button
                          type="button"
                          className="store-favorite-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void toggleFavorite(item.id);
                          }}
                          title={favoriteIds.has(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Heart size={20} fill={favoriteIds.has(item.id) ? 'currentColor' : 'none'} style={{ color: favoriteIds.has(item.id) ? '#ef4444' : 'rgba(255,255,255,0.6)' }} />
                        </button>

                        <div className="store-card-body">
                          <div className="store-card-header">
                            <div>
                              <h3>{item.name}</h3>
                              <div className="category-tag">{item.meta?.category?.trim() || 'Featured Rewards'}</div>
                            </div>
                            {inCart > 0 && <span className="cart-chip">In cart: {inCart}</span>}
                          </div>

                          <div className="price-row">
                            <div className="price-pill">
                              <Zap size={14} />
                              <span>{formatPoints(item.points_cost)}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                              <span className={`stock-copy ${outOfStock ? 'stock-copy-danger' : ''}`}>{getStockLabel(item)}</span>
                              {reviewsMap[item.id] && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
                                  <Star size={12} fill="currentColor" />
                                  <span>{reviewsMap[item.id].avg.toFixed(1)}</span>
                                  <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({reviewsMap[item.id].count})</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {lowStock && urgencyCopy && (
                            <div className="stock-urgency-banner">
                              <AlertCircle size={15} />
                              <span>{urgencyCopy}</span>
                            </div>
                          )}

                          <p className="description-copy">
                            {item.description || 'Reward item available through the Outplex points store.'}
                          </p>

                          <div className="store-card-actions">
                            <button className="btn btn-secondary" onClick={() => setSelectedItem(item)}>
                              <Info size={16} /> Details
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={outOfStock || insufficientPoints}
                              onClick={() => handleAddToCart(item)}
                            >
                              {outOfStock ? 'Unavailable' : insufficientPoints ? 'Not enough points' : 'Add to Cart'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          )}

          {groupedItems.map((group) => (
            <section key={group.category} className="category-section">
              <div className="category-header">
                <div>
                  <div className="category-kicker">Category</div>
                  <h2 className="category-title">{group.category}</h2>
                </div>
                <div className="category-count">{group.items.length} item{group.items.length === 1 ? '' : 's'}</div>
              </div>

              <div className="store-grid">
                {group.items.map((item) => {
                  const outOfStock = item.stock === 0;
                  const inCart = cartQuantities[item.id] ?? 0;
                  const insufficientPoints = profile.points < item.points_cost;
                  const lowStock = isLowStockItem(item);
                  const urgencyCopy = getLowStockUrgencyCopy(item);

                  return (
                    <article
                      key={item.id}
                      className={`store-card ${outOfStock ? 'store-card-soldout' : ''}`}
                      style={{ boxShadow: outOfStock ? 'none' : `0 18px 45px ${themePresentation.glow}` }}
                    >
                      <button type="button" className="store-image-button" onClick={() => setSelectedItem(item)}>
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxifyMediaUrl(item.image_url)} alt={item.name} className="store-image" />
                        ) : (
                          <div className="store-image-placeholder">Reward</div>
                        )}
                        <div className="store-image-overlay">
                          <span>Quick view</span>
                        </div>
                        {outOfStock && <div className="soldout-banner">Sold out for now</div>}
                      </button>
                      <button
                        type="button"
                        className="store-favorite-btn"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void toggleFavorite(item.id);
                        }}
                        title={favoriteIds.has(item.id) ? 'Remove from favorites' : 'Add to favorites'}
                        style={{
                          position: 'absolute',
                          top: '0.75rem',
                          right: '0.75rem',
                          background: 'rgba(0, 0, 0, 0.5)',
                          border: 'none',
                          borderRadius: '50%',
                          width: '40px',
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 10,
                        }}
                      >
                        <Heart size={20} fill={favoriteIds.has(item.id) ? 'currentColor' : 'none'} style={{ color: favoriteIds.has(item.id) ? '#ef4444' : 'rgba(255,255,255,0.6)' }} />
                      </button>

                      <div className="store-card-body">
                        <div className="store-card-header">
                          <div>
                            <h3>{item.name}</h3>
                            <div className="category-tag">{item.meta?.category?.trim() || 'Featured Rewards'}</div>
                          </div>
                          {inCart > 0 && <span className="cart-chip">In cart: {inCart}</span>}
                        </div>

                        <div className="price-row">
                          <div className="price-pill">
                            <Zap size={14} />
                            <span>{formatPoints(item.points_cost)}</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                            <span className={`stock-copy ${outOfStock ? 'stock-copy-danger' : ''}`}>{getStockLabel(item)}</span>
                            {reviewsMap[item.id] && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700 }}>
                                <Star size={12} fill="currentColor" />
                                <span>{reviewsMap[item.id].avg.toFixed(1)}</span>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({reviewsMap[item.id].count})</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {lowStock && urgencyCopy && (
                          <div className="stock-urgency-banner">
                            <AlertCircle size={15} />
                            <span>{urgencyCopy}</span>
                          </div>
                        )}

                        <p className="description-copy">
                          {item.description || 'Reward item available through the Outplex points store.'}
                        </p>

                        <div className="store-card-actions">
                          <button className="btn btn-secondary" onClick={() => setSelectedItem(item)}>
                            <Info size={16} /> Details
                          </button>
                          <button
                            className="btn btn-primary"
                            disabled={outOfStock || insufficientPoints}
                            onClick={() => handleAddToCart(item)}
                          >
                            {outOfStock ? 'Unavailable' : insufficientPoints ? 'Not enough points' : 'Add to Cart'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ))}

      {/* ── Employee stores view ─────────────────────────── */}
      {storeMode === 'employee' && !activeStore && (
        <div className="store-sections animate-fade-in">
          {(() => {
            // Memory optimization: move filtering logic out if this component grows
            const filtered = visibleEmployeeStores;

            if (filtered.length === 0) {
              return (
                <div className="card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                  <Store size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
                  <h2 style={{ marginBottom: '0.5rem' }}>No hay tiendas abiertas</h2>
                  <p style={{ color: 'var(--text-muted)', margin: 0 }}>Vuelve mas tarde o revisa en Mi Tienda.</p>
                </div>
              );
            }

            return (
              <div className="emp-stores-grid">
                {filtered.map((store) => {
                  const isOpen = isStoreCurrentlyOpen(store);
                  const isScheduled = store.status === 'scheduled';
                  return (
                    <button
                      key={store.id}
                      type="button"
                      className={`emp-store-card ${!isOpen ? 'emp-store-card-closed' : ''} ${isScheduled ? 'emp-store-card-scheduled' : ''}`}
                      onClick={() => setActiveStore(store)}
                      style={{
                        ...(store.accent_color ? { '--accent': store.accent_color } as React.CSSProperties : {}),
                        position: 'relative'
                      }}
                    >
                      {isScheduled && (
                        <div className="emp-store-scheduled-badge">
                          <Clock3 size={12} />
                          Automático
                        </div>
                      )}
                      {isEmployeeStoreNew(store) && (
                        <div className="emp-store-new-badge">
                          <Star size={12} fill="black" /> Lo Nuevo
                        </div>
                      )}
                      {!isOpen && (
                        <div className="emp-store-closed-overlay">
                          <Clock3 size={14} />
                          Cerrada
                        </div>
                      )}
                      <div
                        className="emp-store-banner"
                        style={{
                          backgroundImage: store.banner_image ? `url(${store.banner_image})` : undefined,
                          background: !store.banner_image ? (store.accent_color ?? 'var(--gradient-brand)') : undefined,
                        }}
                      >
                        {store.logo_image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxifyMediaUrl(store.logo_image)} alt={store.name} className="emp-store-logo" />
                        ) : (
                          <div className="emp-store-logo-fallback">
                            {store.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="emp-store-info">
                        <h3 className="emp-store-name">{store.name}</h3>
                        {store.category && <span className="emp-store-category">{store.category}</span>}
                        {store.description && (
                          <p className="emp-store-desc">{store.description}</p>
                        )}
                        <div className="emp-store-meta">
                          <span>{store.products.length} producto{store.products.length === 1 ? '' : 's'}</span>
                          {store.owner && <span>• {store.owner.name}</span>}
                        </div>
                        {/* Calculate store average rating */}
                        {(() => {
                          const allStoreReviews = store.products.flatMap(p => p.reviews || []);
                          if (allStoreReviews.length > 0) {
                            const avg = allStoreReviews.reduce((sum, r) => sum + r.rating, 0) / allStoreReviews.length;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fbbf24', fontSize: '0.8rem', fontWeight: 600, marginTop: '0.5rem' }}>
                                <Star size={14} fill="currentColor" />
                                <span>{avg.toFixed(1)}</span>
                                <span style={{ color: 'var(--text-muted)' }}>({allStoreReviews.length})</span>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── Active employee store products ───────────────── */}
      {storeMode === 'employee' && activeStore && (
        <div className="store-sections animate-fade-in">
          {activeStore.products.length === 0 ? (
            <div className="card" style={{ maxWidth: 520, margin: '0 auto', textAlign: 'center' }}>
              <ShoppingBag size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
              <h2 style={{ marginBottom: '0.5rem' }}>Sin productos aún</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>Esta tienda no tiene productos disponibles en este momento.</p>
            </div>
          ) : (
            <>
              {!isStoreCurrentlyOpen(activeStore) && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '1rem', borderRadius: 12, marginBottom: '2rem', color: '#fca5a5', textAlign: 'center' }}>
                  Esta tienda se encuentra cerrada en este momento. Puedes ver los productos, pero no realizar compras.
                </div>
              )}
            {groupedEmpProducts.map(({ cat, prods }) => (
              <section key={cat} className="category-section">
                <div className="category-header">
                  <div>
                    <div className="category-kicker">Categoría</div>
                    <h2 className="category-title">{cat}</h2>
                  </div>
                  <div className="category-count">{prods.length} producto{prods.length === 1 ? '' : 's'}</div>
                </div>
                <div className="store-grid">
                  {prods.map((product) => {
                    const outOfStock = product.stock === 0;
                    const inCart = empCartQuantities[product.id] ?? 0;
                    return (
                      <article
                        key={product.id}
                        className={`store-card ${outOfStock ? 'store-card-soldout' : ''}`}
                        style={{ boxShadow: outOfStock ? 'none' : '0 18px 45px rgba(16,185,129,0.15)' }}
                      >
                        <button type="button" className="store-image-button" onClick={() => setSelectedEmpItem(product)}>
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxifyMediaUrl(product.image_url)} alt={product.name} className="store-image" />
                          ) : (
                            <div className="store-image-placeholder">{product.name.charAt(0)}</div>
                          )}
                          <div className="store-image-overlay">
                            <span>Ver Detalle</span>
                          </div>
                          {outOfStock && <div className="soldout-banner">Sin stock</div>}
                        </button>
                        <div className="store-card-body">
                          <div className="store-card-header">
                            <div>
                              <h3>{product.name}</h3>
                              {product.category && <div className="category-tag">{product.category}</div>}
                            </div>
                            {inCart > 0 && <span className="cart-chip">En carrito: {inCart}</span>}
                          </div>
                          <div className="price-row">
                            <div className="price-pill" style={{ background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }}>
                              <span>{formatDop(product.price_dop)}</span>
                            </div>
                            <span className={`stock-copy ${outOfStock ? 'stock-copy-danger' : ''}`}>
                              {outOfStock ? 'Agotado' : `${product.stock} disponible${product.stock === 1 ? '' : 's'}`}
                            </span>
                          </div>
                          {product.description && (
                            <p className="description-copy">{product.description}</p>
                          )}
                          
                          {empReviewsMap[product.id] && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#fbbf24', fontSize: '0.85rem', fontWeight: 700, margin: '0.2rem 0 0.5rem 0' }}>
                              <Star size={14} fill="currentColor" />
                              <span>{empReviewsMap[product.id].avg.toFixed(1)}</span>
                              <span style={{ color: 'var(--text-muted)' }}>({empReviewsMap[product.id].count})</span>
                            </div>
                          )}

                          <div className="store-card-actions">
                            <button className="btn btn-secondary" onClick={() => setSelectedEmpItem(product)}>
                              <Info size={16} /> Ver
                            </button>
                            <button
                              className="btn btn-primary"
                              disabled={outOfStock || !isStoreCurrentlyOpen(activeStore)}
                              style={{ background: outOfStock || !isStoreCurrentlyOpen(activeStore) ? undefined : 'linear-gradient(135deg,#059669,#10b981)', flex: 1 }}
                              onClick={() => {
                                const { reviews, ...prodData } = product;
                                addToEmpCart({ ...prodData, cost_dop: product.cost_dop, status: product.status, store: { id: activeStore.id, slug: activeStore.slug, name: activeStore.name, owner_id: activeStore.owner_id } });
                                setEmpCartOpen(true);
                              }}
                            >
                              {!isStoreCurrentlyOpen(activeStore) ? 'Tienda Cerrada' : outOfStock ? 'Agotado' : 'Agregar al carrito'}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
            }
            </>
          )}
        </div>
      )}

      {/* ── Employee Product Quick View Modal ─────────────────────── */}
      {selectedEmpItem && (
        <div className="modal-overlay" onClick={() => setSelectedEmpItem(null)}>
          <div className="store-modal animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="store-modal-image-container">
              {selectedEmpItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxifyMediaUrl(selectedEmpItem.image_url)} alt={selectedEmpItem.name} className="store-modal-image" />
              ) : (
                <div className="store-image-placeholder">{selectedEmpItem.name.charAt(0)}</div>
              )}
            </div>
            <div className="store-modal-copy">
              <h2>{selectedEmpItem.name}</h2>
              <div className="price-row" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                <div className="price-pill" style={{ background: 'rgba(16,185,129,0.14)', color: '#6ee7b7' }}>
                  <span>{formatDop(selectedEmpItem.price_dop)}</span>
                </div>
                <span className={`stock-copy ${selectedEmpItem.stock === 0 ? 'stock-copy-danger' : ''}`}>
                  {selectedEmpItem.stock === 0 ? 'Agotado' : `${selectedEmpItem.stock} disponible${selectedEmpItem.stock === 1 ? '' : 's'}`}
                </span>
              </div>
              
              <div style={{ padding: '1rem', background: 'var(--bg-elevated)', borderRadius: 12, marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>¿Te gusta este producto?</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      className="rating-star-btn"
                      disabled={isRating}
                      style={{ background: 'none', border: 'none', cursor: isRating ? 'not-allowed' : 'pointer', padding: '0.2rem' }}
                      onClick={() => submitEmpReview(selectedEmpItem.id, star)}
                    >
                      <Star 
                        size={32} 
                        fill={empReviewsMap[selectedEmpItem.id] && star <= Math.round(empReviewsMap[selectedEmpItem.id].avg) ? '#fbbf24' : 'none'} 
                        color={empReviewsMap[selectedEmpItem.id] && star <= Math.round(empReviewsMap[selectedEmpItem.id].avg) ? '#fbbf24' : 'rgba(255,255,255,0.2)'} 
                        style={{ transition: 'all 0.2s' }}
                      />
                    </button>
                  ))}
                </div>
                {ratingError && <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.5rem' }}>{ratingError}</div>}
              </div>

              <p className="description-copy" style={{ color: 'var(--text-secondary)' }}>
                {selectedEmpItem.description || 'Sin descripción disponible.'}
              </p>

              <div className="store-modal-actions">
                <button className="btn btn-secondary" onClick={() => setSelectedEmpItem(null)}>Cerrar</button>
                <button
                  className="btn btn-primary"
                  disabled={selectedEmpItem.stock === 0 || !activeStore || !isStoreCurrentlyOpen(activeStore)}
                  style={{ background: selectedEmpItem.stock === 0 || !activeStore || !isStoreCurrentlyOpen(activeStore) ? undefined : 'linear-gradient(135deg,#059669,#10b981)' }}
                  onClick={() => {
                    if (activeStore) {
                      const { reviews, ...prodData } = selectedEmpItem;
                      addToEmpCart({ ...prodData, cost_dop: selectedEmpItem.cost_dop, status: selectedEmpItem.status, store: { id: activeStore.id, slug: activeStore.slug, name: activeStore.name, owner_id: activeStore.owner_id } });
                      setEmpCartOpen(true);
                      setSelectedEmpItem(null);
                    }
                  }}
                >
                  {(!activeStore || !isStoreCurrentlyOpen(activeStore)) ? 'Tienda Cerrada' : selectedEmpItem.stock === 0 ? 'Agotado' : 'Agregar al carrito'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Created Popup ───────────────────────────── */}
      {ordersCreated.length > 0 && (
        <div className="modal-overlay" onClick={() => setOrdersCreated([])}>
          <div className="store-modal animate-fade-in" style={{ maxWidth: 540, gridTemplateColumns: '1fr' }} onClick={(e) => e.stopPropagation()}>
            <div className="store-modal-copy" style={{ padding: '0.5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#059669,#10b981)', marginBottom: '1rem' }}>
                  <CheckCircle2 size={28} color="white" />
                </div>
                <h2 style={{ margin: 0 }}>¡Tu solicitud de orden fue generada!</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  Contacta al vendedor para coordinar la entrega.
                </p>
              </div>

              {ordersCreated.map((info) => (
                <div key={info.orderId} style={{ borderRadius: 16, border: '1px solid var(--border-subtle)', padding: '1rem', marginBottom: '0.75rem', background: 'var(--bg-elevated)' }}>
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
                    {buyerContactPrefs?.whatsapp_opt_in && info.seller.contactPrefs?.whatsapp_opt_in && info.seller.contactPrefs.whatsapp_number && (
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

              <button className="btn btn-ghost" style={{ width: '100%', marginTop: '0.25rem' }} onClick={() => setOrdersCreated([])}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedItem && (
        <div className="modal-overlay" onClick={() => setSelectedItem(null)}>
          <div className="store-modal animate-fade-in" onClick={(event) => event.stopPropagation()}>
            <div className="store-modal-media">
              {selectedItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proxifyMediaUrl(selectedItem.image_url)} alt={selectedItem.name} className="store-modal-image" />
              ) : (
                <div className="store-image-placeholder">Reward</div>
              )}
            </div>
            <div className="store-modal-copy">
              <div className="modal-kicker">Reward details</div>
              <h2>{selectedItem.name}</h2>
              <div className="modal-price">
                <Zap size={18} />
                <span>{formatPoints(selectedItem.points_cost)}</span>
              </div>
              <p>{selectedItem.description || 'No extra instructions were added for this reward yet.'}</p>

              <div className="modal-info-grid">
                <div className="modal-info-card">
                  <span>Category</span>
                  <strong>{selectedItem.meta?.category?.trim() || 'Featured Rewards'}</strong>
                </div>
                <div className="modal-info-card">
                  <span>Availability</span>
                  <strong>{getStockLabel(selectedItem)}</strong>
                </div>
                <div className="modal-info-card">
                  <span>Your cart</span>
                  <strong>{cartQuantities[selectedItem.id] ?? 0} item(s)</strong>
                </div>
                <div className="modal-info-card">
                  <span>Your balance</span>
                  <strong>{formatPoints(profile.points)}</strong>
                </div>
              </div>

              {reviewsMap[selectedItem.id] && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Calificaciones</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fbbf24' }}>★ {reviewsMap[selectedItem.id].avg.toFixed(1)}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>({reviewsMap[selectedItem.id].count} reseña{reviewsMap[selectedItem.id].count !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
                  
                  {/* Rating Selector */}
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>Tu calificación:</div>
                    <div className="fhub-rating-row" style={{ display: 'flex', gap: '0.5rem' }}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`fhub-star-btn ${reviewsMap[selectedItem.id].reviews.find(r => r.user?.name === profile.name)?.rating === n ? 'fhub-star-active' : ''}`}
                          onClick={() => void submitReview(selectedItem.id, n)}
                          disabled={isRating}
                          style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', padding: '4px', transition: 'all 0.2s' }}
                        >
                          <Star size={24} fill={reviewsMap[selectedItem.id].reviews.find(r => r.user?.name === profile.name)?.rating === n ? '#fbbf24' : 'none'} style={{ color: reviewsMap[selectedItem.id].reviews.find(r => r.user?.name === profile.name)?.rating === n ? '#fbbf24' : 'currentColor' }} />
                        </button>
                      ))}
                    </div>
                    {ratingError && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>{ratingError}</p>}
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Toca una estrella para calificar este producto.</p>
                  </div>

                  <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {reviewsMap[selectedItem.id].reviews.slice(0, 5).map((review, i) => (
                      <div key={i} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '0.875rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                          <span style={{ color: '#fbbf24' }}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                            {review.user?.name || 'Anónimo'}
                          </span>
                        </div>
                        {review.comment && <p style={{ margin: 0, color: 'var(--text-muted)' }}>{review.comment}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedItem.stock === 0 && (
                <div className="store-warning">
                  <AlertCircle size={16} />
                  <span>This reward is currently sold out. If you left the page open earlier, refresh your cart before checking out.</span>
                </div>
              )}

              {isLowStockItem(selectedItem) && (
                <div className="store-warning store-warning-urgent">
                  <AlertCircle size={16} />
                  <span>{getLowStockUrgencyCopy(selectedItem)}</span>
                </div>
              )}

              <div className="store-card-actions" style={{ marginTop: '1.25rem' }}>
                <button className="btn btn-secondary" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  disabled={selectedItem.stock === 0 || profile.points < selectedItem.points_cost}
                  onClick={() => {
                    handleAddToCart(selectedItem);
                    setSelectedItem(null);
                  }}
                >
                  {selectedItem.stock === 0 ? 'Unavailable' : 'Add to Cart'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .store-shell {
          position: relative;
          min-height: calc(100vh - 120px);
          padding-bottom: 2rem;
        }

        .store-backdrop {
          position: absolute;
          inset: -1.5rem -1.5rem auto;
          height: 380px;
          border-radius: 40px;
          background-size: cover;
          background-position: center;
          opacity: 0.95;
          pointer-events: none;
          mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 0%, transparent 100%);
        }

        .store-hero {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
          gap: 1.5rem;
          align-items: end;
          margin-bottom: 2rem;
        }

        .hero-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.9rem;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(13, 18, 34, 0.8);
          color: var(--text-secondary);
          font-size: 0.8125rem;
          font-weight: 600;
          margin-bottom: 1rem;
        }

        .store-title {
          margin: 0;
          font-size: clamp(2.4rem, 4vw, 3.75rem);
          line-height: 0.95;
          letter-spacing: -0.05em;
        }

        .store-subtitle {
          max-width: 620px;
          color: var(--text-secondary);
          font-size: 1.05rem;
          line-height: 1.6;
          margin: 0.9rem 0 0;
        }

        .store-balance-card {
          background: rgba(16, 21, 38, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 36px;
          padding: 1.2rem 1.35rem;
          backdrop-filter: blur(16px);
        }

        .balance-label {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }

        .balance-value {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          font-size: 1.9rem;
          font-weight: 800;
          margin-bottom: 0.4rem;
        }

        .balance-value svg {
          color: var(--brand-primary-light);
        }

        .balance-value small {
          font-size: 0.95rem;
          color: var(--text-muted);
          font-weight: 600;
        }

        .balance-copy {
          color: var(--text-muted);
          font-size: 0.8rem;
          line-height: 1.4;
        }

        .store-sections {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 2rem;
        }

        .category-section {
          display: grid;
          gap: 1rem;
        }

        .category-header {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .category-kicker {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-size: 0.72rem;
          font-weight: 700;
          margin-bottom: 0.35rem;
        }

        .category-title {
          margin: 0;
          font-size: 1.55rem;
        }

        .category-count {
          color: var(--text-secondary);
          font-size: 0.86rem;
        }

        .store-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(265px, 1fr));
          gap: 1.5rem;
        }

        .store-card {
          display: flex;
          flex-direction: column;
          border-radius: 36px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: rgba(16, 20, 37, 0.88);
          backdrop-filter: blur(14px);
          min-height: 100%;
        }

        .store-card-soldout {
          filter: grayscale(1);
          opacity: 0.82;
        }

        .store-image-button {
          position: relative;
          padding: 0;
          border: none;
          background: transparent;
          cursor: pointer;
          aspect-ratio: 1 / 1;
          overflow: hidden;
        }

        .store-card {
          position: relative;
        }

        .store-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.35s ease;
        }

        .store-card:hover .store-image {
          transform: scale(1.04);
        }

        .store-image-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          color: var(--text-muted);
          background: linear-gradient(135deg, rgba(124, 108, 255, 0.14), rgba(59, 130, 246, 0.08));
        }

        .store-image-overlay {
          position: absolute;
          inset: auto 0 0;
          padding: 1rem;
          background: linear-gradient(180deg, transparent 0%, rgba(8, 10, 18, 0.9) 100%);
          color: white;
          font-size: 0.85rem;
          font-weight: 700;
          text-align: left;
        }

        .soldout-banner {
          position: absolute;
          top: 0.9rem;
          left: 0.9rem;
          padding: 0.45rem 0.7rem;
          border-radius: 999px;
          background: rgba(17, 24, 39, 0.88);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .store-card-body {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 0.95rem;
          padding: 1.1rem;
        }

        .store-card-header {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: flex-start;
        }

        .store-card-header h3 {
          margin: 0 0 0.35rem;
          font-size: 1.12rem;
          line-height: 1.2;
        }

        .store-favorite-btn {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 50%;
          width: 38px;
          height: 38px;
          display: flex;
          alignItems: center;
          justify-content: center;
          cursor: pointer;
          zIndex: 10;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          color: rgba(255, 255, 255, 0.8);
        }

        .store-favorite-btn:hover {
          transform: scale(1.1);
          background: rgba(0, 0, 0, 0.65);
          color: #ef4444;
        }

        .category-tag {
          display: inline-flex;
          padding: 0.3rem 0.6rem;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          color: var(--text-secondary);
          font-size: 0.72rem;
          font-weight: 600;
        }

        .cart-chip {
          flex-shrink: 0;
          padding: 0.32rem 0.65rem;
          border-radius: 999px;
          background: rgba(124, 108, 255, 0.14);
          color: var(--brand-primary-light);
          font-size: 0.75rem;
          font-weight: 700;
        }

        .price-row {
          display: flex;
          justify-content: space-between;
          gap: 0.75rem;
          align-items: center;
        }

        .price-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.42rem 0.7rem;
          border-radius: 999px;
          background: rgba(124, 108, 255, 0.14);
          color: var(--brand-primary-light);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .stock-copy {
          color: var(--text-secondary);
          font-size: 0.78rem;
          font-weight: 600;
        }

        .stock-copy-danger {
          color: #f87171;
        }

        .stock-urgency-banner {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.7rem;
          border-radius: 12px;
          border: 1px solid rgba(245, 158, 11, 0.26);
          background: rgba(245, 158, 11, 0.12);
          color: #fcd34d;
          font-size: 0.8rem;
          line-height: 1.45;
        }

        .description-copy {
          color: var(--text-secondary);
          font-size: 0.88rem;
          line-height: 1.6;
          margin: 0;
          flex: 1;
        }

        .store-card-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }

        .store-modal {
          width: min(920px, 100%);
          display: grid;
          grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
          gap: 1.5rem;
          padding: 1.25rem;
          border-radius: 40px;
          background: rgba(15, 19, 35, 0.98);
          border: 1px solid var(--border-default);
          box-shadow: var(--shadow-card);
        }

        .store-modal-media {
          border-radius: 18px;
          overflow: hidden;
          min-height: 320px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 18px 55px rgba(0,0,0,0.35);
          padding: 0.45rem;
        }

        .store-modal-image-container {
          border-radius: 18px;
          overflow: hidden;
          min-height: 320px;
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          box-shadow: 0 18px 55px rgba(0,0,0,0.35);
          padding: 0.45rem;
        }

        .store-modal-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          border-radius: 14px;
        }

        .store-modal-copy {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .modal-kicker {
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          font-size: 0.74rem;
          font-weight: 700;
        }

        .modal-price {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--brand-primary-light);
          font-size: 1.05rem;
          font-weight: 800;
        }

        .modal-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
        }

        .modal-info-card {
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          padding: 0.85rem 0.95rem;
        }

        .modal-info-card span {
          display: block;
          color: var(--text-muted);
          font-size: 0.74rem;
          margin-bottom: 0.35rem;
        }

        .modal-info-card strong {
          font-size: 0.92rem;
        }

        .store-warning {
          display: flex;
          gap: 0.65rem;
          align-items: flex-start;
          padding: 0.85rem 0.95rem;
          border-radius: 14px;
          border: 1px solid rgba(239, 68, 68, 0.22);
          background: rgba(239, 68, 68, 0.08);
          color: #fca5a5;
          font-size: 0.82rem;
          line-height: 1.5;
        }

        .store-warning-urgent {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.12);
          color: #fbbf24;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 2200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
          background: rgba(7, 9, 16, 0.72);
          backdrop-filter: blur(10px);
        }

        @media (max-width: 900px) {
          .store-hero,
          .store-modal {
            grid-template-columns: 1fr;
          }
        }

        /* ── Store Layout Fix ─────────────────── */
        .store-shell {
          position: relative;
          min-height: 100vh;
          padding-top: 140px; /* Space for the floating Dock */
        }

        /* ── Store mode toggle ─────────────────── */
        .store-mode-toggle {
          position: relative;
          z-index: 50; /* Above content, below Dock */
          display: inline-flex;
          gap: 0.35rem;
          padding: 0.35rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(13, 17, 34, 0.6);
          backdrop-filter: blur(20px);
          margin-bottom: 2rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          transition: all 0.3s ease;
        }

        .store-mode-btn {
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

        .store-mode-btn:hover {
          background: rgba(255,255,255,0.06);
          color: var(--text-primary);
          transform: translateY(-1px);
        }

        .store-mode-btn.active {
          background: rgba(124, 108, 255, 0.18);
          border-color: rgba(124, 108, 255, 0.3);
          color: var(--brand-primary-light);
          box-shadow: 0 4px 15px rgba(124, 108, 255, 0.2);
        }

        .emp-store-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 4px;
          border-radius: 999px;
          background: rgba(16,185,129,0.2);
          color: #6ee7b7;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .hero-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-secondary);
          border-radius: 999px;
          padding: 0.4rem 0.85rem;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          margin-bottom: 1rem;
          transition: all 0.2s ease;
        }

        .hero-back-btn:hover {
          background: rgba(255,255,255,0.1);
          color: var(--text-primary);
        }

        /* ── Employee stores grid ──────────────── */
        .emp-stores-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
          position: relative;
          z-index: 1;
        }

        .emp-store-card {
          display: flex;
          flex-direction: column;
          border-radius: 36px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          background: rgba(16, 20, 37, 0.88);
          backdrop-filter: blur(14px);
          cursor: pointer;
          text-align: left;
          padding: 0;
          transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .emp-store-card:hover {
          transform: translateY(-3px);
          border-color: rgba(16,185,129,0.3);
          box-shadow: 0 18px 45px rgba(16,185,129,0.15);
        }

        .emp-store-banner {
          height: 140px;
          background-size: cover;
          background-position: center;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          border-top-left-radius: 36px;
          border-top-right-radius: 36px;
          overflow: hidden;
        }

        .emp-store-new-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: linear-gradient(90deg, rgba(245, 158, 11, 0.98), rgba(251, 191, 36, 0.98));
          color: black;
          padding: 0.24rem 0.7rem;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 900;
          z-index: 12;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 10px 26px rgba(245, 158, 11, 0.35);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border: 1px solid rgba(255,255,255,0.22);
          backdrop-filter: blur(6px);
        }

        .emp-store-logo {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255,255,255,0.2);
        }

        .emp-store-card-closed {
          filter: grayscale(1);
          opacity: 0.8;
        }

        .emp-store-card-scheduled {
          border-color: rgba(245, 158, 11, 0.4) !important;
          box-shadow: 0 0 20px rgba(245, 158, 11, 0.05);
        }

        .emp-store-scheduled-badge {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 10;
          background: rgba(245, 158, 11, 0.9);
          backdrop-filter: blur(4px);
          color: white;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          font-size: 0.7rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 0.35rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .emp-store-logo-fallback {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: rgba(255,255,255,0.15);
          border: 3px solid rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          font-weight: 800;
          color: white;
        }

        .emp-store-info {
          padding: 1.1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex: 1;
        }

        .emp-store-name {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
        }

        .emp-store-category {
          display: inline-flex;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: rgba(16,185,129,0.1);
          color: #6ee7b7;
          font-size: 0.72rem;
          font-weight: 600;
          width: fit-content;
        }

        .emp-store-desc {
          color: var(--text-secondary);
          font-size: 0.85rem;
          line-height: 1.5;
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .emp-store-meta {
          display: flex;
          gap: 0.4rem;
          color: var(--text-muted);
          font-size: 0.78rem;
          margin-top: auto;
          padding-top: 0.5rem;
        }
        .emp-store-card-closed {
          opacity: 0.85;
          filter: grayscale(0.4);
        }

        .emp-store-closed-overlay {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 20;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          background: rgba(239, 68, 68, 0.9);
          backdrop-filter: blur(8px);
          color: white;
          font-size: 0.75rem;
          font-weight: 700;
          border-radius: 999px;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}
