import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AppShellBadge, EmployeeStore, EmployeeStoreProduct, Notification, StoreItem, User } from '@/types/database';

export type NotificationWithSender = Notification & {
  sender?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
};

export interface CartItem {
  item: StoreItem;
  quantity: number;
}

export interface EmpCartItem {
  product: Omit<EmployeeStoreProduct, 'store'> & {
    store?: Pick<EmployeeStore, 'id' | 'slug' | 'name' | 'owner_id'>;
  };
  quantity: number;
}

export interface AppShellLiveEvent {
  id: string;
  type: 'raffle' | 'ot' | 'upcoming';
  title: string;
  summary: string;
  href: string;
}

const CART_TTL_MS = 2 * 60 * 60 * 1000;

interface AppState {
  cart: CartItem[];
  cartSavedAt: number | null;
  cartOpen: boolean;
  empCart: EmpCartItem[];
  empCartSavedAt: number | null;
  empCartOpen: boolean;
  buyerWhatsappOptIn: boolean | null;
  notificationsOpen: boolean;
  messagesOpen: boolean;
  sidebarExpanded: boolean;
  notifications: NotificationWithSender[];
  unreadNotificationCount: number;
  appShellBadge: AppShellBadge;
  liveEvents: AppShellLiveEvent[];
  notificationPopupsEnabled: boolean;
  notificationSoundEnabled: boolean;


  // Actions
  setCartOpen: (open: boolean) => void;
  setEmpCartOpen: (open: boolean) => void;
  setBuyerWhatsappOptIn: (value: boolean | null) => void;
  setNotificationsOpen: (open: boolean) => void;
  setMessagesOpen: (open: boolean) => void;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebarExpanded: () => void;
  setNotifications: (notifications: NotificationWithSender[]) => void;
  markNotificationsRead: (notificationIds?: string[]) => void;
  removeNotification: (notificationId: string) => void;
  clearNotifications: () => void;
  setAppShellBadge: (badge: AppShellBadge) => void;
  setLiveEvents: (events: AppShellLiveEvent[]) => void;
  setNotificationPopupsEnabled: (enabled: boolean) => void;
  setNotificationSoundEnabled: (enabled: boolean) => void;


  addToCart: (item: StoreItem) => void;
  setCartItemQuantity: (itemId: string, quantity: number) => void;
  syncCartItems: (items: StoreItem[]) => {
    removedIds: string[];
    reducedIds: string[];
    unavailableIds: string[];
  };
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;

  addToEmpCart: (product: EmpCartItem['product']) => void;
  setEmpCartItemQuantity: (productId: string, quantity: number) => void;
  removeFromEmpCart: (productId: string) => void;
  clearEmpCart: () => void;
}

type PersistedAppState = Pick<
  AppState,
  | 'cart'
  | 'cartSavedAt'
  | 'empCart'
  | 'empCartSavedAt'
  | 'sidebarExpanded'
  | 'notificationPopupsEnabled'
  | 'notificationSoundEnabled'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function migratePersistedAppState(persistedState: unknown): PersistedAppState {
  const state = isRecord(persistedState) ? persistedState : {};

  return {
    cart: Array.isArray(state.cart) ? (state.cart as CartItem[]) : [],
    cartSavedAt: typeof state.cartSavedAt === 'number' ? state.cartSavedAt : null,
    empCart: Array.isArray(state.empCart) ? (state.empCart as EmpCartItem[]) : [],
    empCartSavedAt: typeof state.empCartSavedAt === 'number' ? state.empCartSavedAt : null,
    sidebarExpanded: typeof state.sidebarExpanded === 'boolean' ? state.sidebarExpanded : true,
    notificationPopupsEnabled:
      typeof state.notificationPopupsEnabled === 'boolean' ? state.notificationPopupsEnabled : true,
    notificationSoundEnabled:
      typeof state.notificationSoundEnabled === 'boolean' ? state.notificationSoundEnabled : true,
  };
}

function isCartExpired(savedAt: number | null) {
  return !savedAt || Date.now() - savedAt > CART_TTL_MS;
}

function clampQuantity(item: StoreItem, quantity: number) {
  if (!item.is_active) {
    return 0;
  }

  if (item.stock === -1) {
    return Math.max(0, quantity);
  }

  return Math.max(0, Math.min(quantity, item.stock));
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      cart: [],
      cartSavedAt: null,
      cartOpen: false,
      empCart: [],
      empCartSavedAt: null,
      empCartOpen: false,
      buyerWhatsappOptIn: null,
      notificationsOpen: false,
      messagesOpen: false,
      sidebarExpanded: true,
      notifications: [],
      unreadNotificationCount: 0,
      appShellBadge: {
        status: 'idle',
        label: 'LIVE',
        description: 'No live events right now.',
      },
      liveEvents: [],
      notificationPopupsEnabled: true,
      notificationSoundEnabled: true,

      
      setCartOpen: (open) => set({ cartOpen: open }),
      setEmpCartOpen: (open) => set({ empCartOpen: open }),
      setBuyerWhatsappOptIn: (value) => set({ buyerWhatsappOptIn: value }),
      setNotificationsOpen: (open) => set({ notificationsOpen: open }),
      setMessagesOpen: (open) => set({ messagesOpen: open }),
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebarExpanded: () =>
        set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),
      setNotifications: (notifications) =>
        set({
          notifications,
          unreadNotificationCount: notifications.filter((notification) => !notification.is_read).length,
        }),
      markNotificationsRead: (notificationIds) =>
        set((state) => {
          const notifications = state.notifications.map((notification) => {
            if (!notificationIds || notificationIds.includes(notification.id)) {
              return {
                ...notification,
                is_read: true,
              };
            }

            return notification;
          });

          return {
            notifications,
            unreadNotificationCount: notifications.filter((notification) => !notification.is_read).length,
          };
        }),
      removeNotification: (notificationId) =>
        set((state) => {
          const notifications = state.notifications.filter((notification) => notification.id !== notificationId);
          return {
            notifications,
            unreadNotificationCount: notifications.filter((notification) => !notification.is_read).length,
          };
        }),
      clearNotifications: () =>
        set({
          notifications: [],
          unreadNotificationCount: 0,
        }),
      setAppShellBadge: (badge) => set({ appShellBadge: badge }),
      setLiveEvents: (liveEvents) => set({ liveEvents }),
      setNotificationPopupsEnabled: (enabled) => set({ notificationPopupsEnabled: enabled }),
      setNotificationSoundEnabled: (enabled) => set({ notificationSoundEnabled: enabled }),

      
      addToCart: (item) =>
        set((state) => {
          const existing = state.cart.find((cartItem) => cartItem.item.id === item.id);
          if (existing) {
            const nextQuantity = clampQuantity(item, existing.quantity + 1);
            if (nextQuantity === existing.quantity) {
              return state;
            }

            return {
              cart: state.cart.map((cartItem) =>
                cartItem.item.id === item.id
                  ? { ...cartItem, quantity: nextQuantity, item }
                  : cartItem,
              ),
              cartSavedAt: Date.now(),
            };
          }

          if (!item.is_active || item.stock === 0) {
            return state;
          }

          return {
            cart: [...state.cart, { item, quantity: 1 }],
            cartSavedAt: Date.now(),
          };
        }),
      setCartItemQuantity: (itemId, quantity) =>
        set((state) => {
          const targetItem = state.cart.find((cartItem) => cartItem.item.id === itemId);
          if (!targetItem) {
            return state;
          }

          const nextQuantity = clampQuantity(targetItem.item, quantity);
          const nextCart =
            nextQuantity === 0
              ? state.cart.filter((cartItem) => cartItem.item.id !== itemId)
              : state.cart.map((cartItem) =>
                  cartItem.item.id === itemId
                    ? { ...cartItem, quantity: nextQuantity }
                    : cartItem,
                );

          return {
            cart: nextCart,
            cartSavedAt: nextCart.length > 0 ? Date.now() : null,
          };
        }),
      syncCartItems: (items) => {
        const itemMap = new Map(items.map((item) => [item.id, item]));
        const removedIds: string[] = [];
        const reducedIds: string[] = [];
        const unavailableIds: string[] = [];

        set((state) => {
          const nextCart: CartItem[] = [];

          for (const cartItem of state.cart) {
            const liveItem = itemMap.get(cartItem.item.id);

            if (!liveItem || !liveItem.is_active || liveItem.stock === 0) {
              removedIds.push(cartItem.item.id);

              if (!liveItem || liveItem.stock === 0 || !liveItem.is_active) {
                unavailableIds.push(cartItem.item.id);
              }

              continue;
            }

            const nextQuantity = clampQuantity(liveItem, cartItem.quantity);
            if (nextQuantity < cartItem.quantity) {
              reducedIds.push(cartItem.item.id);
            }

            if (nextQuantity > 0) {
              nextCart.push({
                item: liveItem,
                quantity: nextQuantity,
              });
            } else {
              removedIds.push(cartItem.item.id);
            }
          }

          return {
            cart: nextCart,
            cartSavedAt: nextCart.length > 0 ? Date.now() : null,
          };
        });

        return {
          removedIds,
          reducedIds,
          unavailableIds,
        };
      },
      removeFromCart: (itemId) =>
        set((state) => {
          const cart = state.cart.filter((cartItem) => cartItem.item.id !== itemId);
          return {
            cart,
            cartSavedAt: cart.length > 0 ? Date.now() : null,
          };
        }),
      clearCart: () => set({ cart: [], cartSavedAt: null }),

      addToEmpCart: (product) =>
        set((state) => {
          if (!product.is_active || product.stock === 0) return state;
          const existing = state.empCart.find((ci) => ci.product.id === product.id);
          if (existing) {
            const nextQty = product.stock === -1
              ? existing.quantity + 1
              : Math.min(existing.quantity + 1, product.stock);
            if (nextQty === existing.quantity) return state;
            return {
              empCart: state.empCart.map((ci) =>
                ci.product.id === product.id ? { ...ci, quantity: nextQty, product } : ci,
              ),
              empCartSavedAt: Date.now(),
            };
          }
          return {
            empCart: [...state.empCart, { product, quantity: 1 }],
            empCartSavedAt: Date.now(),
          };
        }),

      setEmpCartItemQuantity: (productId, quantity) =>
        set((state) => {
          const target = state.empCart.find((ci) => ci.product.id === productId);
          if (!target) return state;
          const maxQty = target.product.stock === -1 ? 999 : target.product.stock;
          const nextQty = Math.max(0, Math.min(quantity, maxQty));
          const nextCart = nextQty === 0
            ? state.empCart.filter((ci) => ci.product.id !== productId)
            : state.empCart.map((ci) =>
                ci.product.id === productId ? { ...ci, quantity: nextQty } : ci,
              );
          return { empCart: nextCart, empCartSavedAt: nextCart.length > 0 ? Date.now() : null };
        }),

      removeFromEmpCart: (productId) =>
        set((state) => {
          const empCart = state.empCart.filter((ci) => ci.product.id !== productId);
          return { empCart, empCartSavedAt: empCart.length > 0 ? Date.now() : null };
        }),

      clearEmpCart: () => set({ empCart: [], empCartSavedAt: null }),
    }),
    {
      name: 'outplex-app-shell',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState) => migratePersistedAppState(persistedState),
      partialize: (state) => ({
        cart: state.cart,
        cartSavedAt: state.cartSavedAt,
        empCart: state.empCart,
        empCartSavedAt: state.empCartSavedAt,
        sidebarExpanded: state.sidebarExpanded,
        notificationPopupsEnabled: state.notificationPopupsEnabled,
        notificationSoundEnabled: state.notificationSoundEnabled,
      }),

      merge: (persistedState, currentState) => {
        const persisted = migratePersistedAppState(persistedState);

        const nytExpired = isCartExpired(persisted.cartSavedAt);
        const empExpired = isCartExpired(persisted.empCartSavedAt);
        return {
          ...currentState,
          cart: nytExpired ? [] : persisted.cart,
          cartSavedAt: nytExpired ? null : persisted.cartSavedAt,
          empCart: empExpired ? [] : persisted.empCart,
          empCartSavedAt: empExpired ? null : persisted.empCartSavedAt,
          sidebarExpanded: persisted.sidebarExpanded,
          notificationPopupsEnabled: persisted.notificationPopupsEnabled,
          notificationSoundEnabled: persisted.notificationSoundEnabled,
        };

      },
    },
  ),
);
