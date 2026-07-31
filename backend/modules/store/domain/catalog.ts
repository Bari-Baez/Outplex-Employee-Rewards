import type {
  AppSetting,
  AppSettingValue,
  OrderStatus,
  StoreItem,
  StoreItemMeta,
  StoreOrder,
  StoreOrderLineItem,
  StoreOrderMeta,
  StoreOrderStatusHistoryEntry,
  StoreThemeConfig,
  StoreThemePresetConfig,
} from '@shared/contracts/database';

type OrderItemSnapshot = {
  id?: string;
  name?: string | null;
  description?: string | null;
  image_url?: string | null;
  points_cost?: number;
  meta?: StoreItemMeta | null;
};

export const STORE_THEME_KEY = 'store_theme';
export const STORE_ORDER_META_PREFIX = 'store_order_meta_';
export const STORE_ITEM_META_PREFIX = 'store_item_meta_';
export const STORE_CART_TTL_HOURS = 2;
export const ORDER_CANCELLATION_WINDOW_MS = 5 * 60 * 1000;
export const ORDER_CLEANUP_DAYS = 30;
export const RECENT_ORDER_HISTORY_WINDOW_DAYS = 20;
export const ORDER_COMPLETION_UNDO_WINDOW_MS = 15 * 60 * 1000;
export const LOW_STOCK_THRESHOLD = 2;

const DEFAULT_HEADLINE = 'The Collection';
const DEFAULT_SUBHEADING = 'Curated rewards for outstanding performance.';
const MAX_THEME_PRESETS = 5;
const FINAL_ORDER_STATUSES = new Set<OrderStatus>(['ready_for_pickup', 'rejected', 'completed', 'cancelled']);
const MODERATOR_ORDER_DELETE_STATUSES = new Set<OrderStatus>([
  'approved',
  'ready_for_pickup',
  'completed',
  'rejected',
  'cancelled',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeSettingValue(value: AppSettingValue | null | undefined): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}

function sanitizeThemeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sanitizeThemeImage(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sanitizeOverlayOpacity(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0.15, Math.min(0.9, value))
    : 0.68;
}

function sanitizePresetName(value: unknown, index: number) {
  return typeof value === 'string' && value.trim() ? value.trim() : `Preset ${index + 1}`;
}

function sanitizeStoreThemePreset(value: unknown, index: number): StoreThemePresetConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `preset-${index + 1}`;

  return {
    id,
    name: sanitizePresetName(value.name, index),
    backgroundImage: sanitizeThemeImage(value.backgroundImage),
    headline: sanitizeThemeText(value.headline, DEFAULT_HEADLINE),
    subheading: sanitizeThemeText(value.subheading, DEFAULT_SUBHEADING),
    overlayOpacity: sanitizeOverlayOpacity(value.overlayOpacity),
  };
}

function normalizeLineItem(value: unknown): StoreOrderLineItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const itemId = typeof value.itemId === 'string' && value.itemId.trim() ? value.itemId.trim() : '';
  if (!itemId) {
    return null;
  }

  const quantity =
    typeof value.quantity === 'number' && Number.isFinite(value.quantity) && value.quantity > 0
      ? Math.floor(value.quantity)
      : 1;

  const unitPoints =
    typeof value.unitPoints === 'number' && Number.isFinite(value.unitPoints) && value.unitPoints >= 0
      ? value.unitPoints
      : 0;

  return {
    itemId,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : 'Store Item',
    quantity,
    unitPoints,
    imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
    description: typeof value.description === 'string' ? value.description : null,
    category: typeof value.category === 'string' && value.category.trim() ? value.category.trim() : null,
  };
}

export function getStoreOrderMetaKey(orderId: string) {
  return `${STORE_ORDER_META_PREFIX}${orderId}`;
}

export function getStoreItemMetaKey(itemId: string) {
  return `${STORE_ITEM_META_PREFIX}${itemId}`;
}

export function getDefaultStoreThemeConfig(): StoreThemeConfig {
  return {
    backgroundImage: null,
    headline: DEFAULT_HEADLINE,
    subheading: DEFAULT_SUBHEADING,
    overlayOpacity: 0.68,
    activePresetId: null,
    presets: [],
    empCartBannerImage: null,
  };
}

export function normalizeStoreThemeConfig(value: AppSettingValue | undefined): StoreThemeConfig {
  const decodedValue = decodeSettingValue(value) as AppSettingValue | undefined;

  if (typeof decodedValue === 'string') {
    return {
      ...getDefaultStoreThemeConfig(),
      activePresetId: decodedValue,
    };
  }

  if (!isRecord(decodedValue)) {
    return getDefaultStoreThemeConfig();
  }

  const presets = Array.isArray(decodedValue.presets)
    ? decodedValue.presets
        .map((preset, index) => sanitizeStoreThemePreset(preset, index))
        .filter(Boolean)
        .slice(0, MAX_THEME_PRESETS) as StoreThemePresetConfig[]
    : [];

  const activePresetId =
    typeof decodedValue.activePresetId === 'string' && decodedValue.activePresetId.trim()
      ? decodedValue.activePresetId.trim()
      : null;

  return {
    backgroundImage: sanitizeThemeImage(decodedValue.backgroundImage),
    headline: sanitizeThemeText(decodedValue.headline, DEFAULT_HEADLINE),
    subheading: sanitizeThemeText(decodedValue.subheading, DEFAULT_SUBHEADING),
    overlayOpacity: sanitizeOverlayOpacity(decodedValue.overlayOpacity),
    activePresetId,
    presets,
    empCartBannerImage: sanitizeThemeImage(decodedValue.empCartBannerImage),
  };
}

export function getStoreThemePresentation(themeArg?: StoreThemeConfig) {
  void themeArg;
  return {
    accent: '#7c6cff',
    glow: 'rgba(124, 108, 255, 0.22)',
    heroGradient:
      'radial-gradient(circle at 16% 12%, rgba(124, 108, 255, 0.28), transparent 38%), radial-gradient(circle at 85% 2%, rgba(59, 130, 246, 0.18), transparent 35%), linear-gradient(180deg, rgba(9, 11, 22, 0.68) 0%, rgba(9, 11, 22, 0.96) 100%)',
    cardTint: 'rgba(124, 108, 255, 0.08)',
  };
}

export function buildStoreOrderLineItem(
  item: Pick<StoreItem, 'id' | 'name' | 'description' | 'image_url' | 'points_cost' | 'meta'>,
  quantity: number,
): StoreOrderLineItem {
  return {
    itemId: item.id,
    name: item.name,
    quantity,
    unitPoints: item.points_cost,
    imageUrl: item.image_url,
    description: item.description,
    category: item.meta?.category ?? null,
  };
}

export function buildInitialStoreOrderMeta(
  items: StoreOrderLineItem[],
  createdAt: string,
  buyer?: { name?: string | null; email?: string | null; employeeId?: string | null },
): StoreOrderMeta {
  const primaryItem = items[0];
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPoints = items.reduce((sum, item) => sum + item.unitPoints * item.quantity, 0);

  return {
    quantity: totalQuantity,
    unitPoints: primaryItem?.unitPoints ?? totalPoints,
    itemName: primaryItem?.name ?? 'Store Item',
    itemImageUrl: primaryItem?.imageUrl ?? null,
    itemDescription: primaryItem?.description ?? null,
    lineItems: items,
    buyerName: buyer?.name ?? null,
    buyerEmail: buyer?.email ?? null,
    buyerEmployeeId: buyer?.employeeId ?? null,
    orderLabel: totalQuantity === 1 && items.length === 1
      ? primaryItem?.name ?? 'Store Item'
      : `${totalQuantity} item${totalQuantity === 1 ? '' : 's'} across ${items.length} product${items.length === 1 ? '' : 's'}`,
    pickupMode: null,
    pickupDate: null,
    pickupTime: null,
    pickupDeadline: null,
    pickupNote: null,
    denialReason: null,
    hiddenFromModerators: false,
    moderatorArchivedAt: null,
    statusHistory: [
      {
        status: 'pending',
        at: createdAt,
        note: 'Order submitted',
      },
    ],
  };
}

export function parseStoreOrderMeta(value: AppSettingValue | null | undefined): StoreOrderMeta | null {
  const decodedValue = decodeSettingValue(value);

  if (!isRecord(decodedValue)) {
    return null;
  }

  const quantity =
    typeof decodedValue.quantity === 'number' && Number.isFinite(decodedValue.quantity) && decodedValue.quantity > 0
      ? Math.floor(decodedValue.quantity)
      : 1;

  const history = Array.isArray(decodedValue.statusHistory)
    ? decodedValue.statusHistory
        .map((entry) => {
          if (!isRecord(entry) || typeof entry.status !== 'string' || typeof entry.at !== 'string') {
            return null;
          }

          return {
            status: entry.status as OrderStatus,
            at: entry.at,
            note: typeof entry.note === 'string' ? entry.note : null,
            updatedBy: typeof entry.updatedBy === 'string' ? entry.updatedBy : null,
          } satisfies StoreOrderStatusHistoryEntry;
        })
        .filter(Boolean) as StoreOrderStatusHistoryEntry[]
    : [];

  const lineItems = Array.isArray(decodedValue.lineItems)
    ? decodedValue.lineItems.map((entry) => normalizeLineItem(entry)).filter(Boolean) as StoreOrderLineItem[]
    : [];

  const normalizedQuantity = lineItems.length > 0
    ? lineItems.reduce((sum, item) => sum + item.quantity, 0)
    : quantity;

  return {
    quantity: normalizedQuantity,
    unitPoints:
      typeof decodedValue.unitPoints === 'number' && Number.isFinite(decodedValue.unitPoints)
        ? decodedValue.unitPoints
        : lineItems[0]?.unitPoints ?? 0,
    itemName:
      typeof decodedValue.itemName === 'string' && decodedValue.itemName.trim()
        ? decodedValue.itemName
        : lineItems[0]?.name ?? 'Store Item',
    itemImageUrl:
      typeof decodedValue.itemImageUrl === 'string' ? decodedValue.itemImageUrl : lineItems[0]?.imageUrl ?? null,
    itemDescription:
      typeof decodedValue.itemDescription === 'string'
        ? decodedValue.itemDescription
        : lineItems[0]?.description ?? null,
    lineItems,
    buyerName: typeof decodedValue.buyerName === 'string' ? decodedValue.buyerName : null,
    buyerEmail: typeof decodedValue.buyerEmail === 'string' ? decodedValue.buyerEmail : null,
    buyerEmployeeId: typeof decodedValue.buyerEmployeeId === 'string' ? decodedValue.buyerEmployeeId : null,
    orderLabel: typeof decodedValue.orderLabel === 'string' ? decodedValue.orderLabel : null,
    pickupMode:
      decodedValue.pickupMode === 'immediate' || decodedValue.pickupMode === 'scheduled'
        ? decodedValue.pickupMode
        : null,
    pickupDate: typeof decodedValue.pickupDate === 'string' ? decodedValue.pickupDate : null,
    pickupTime: typeof decodedValue.pickupTime === 'string' ? decodedValue.pickupTime : null,
    pickupDeadline: typeof decodedValue.pickupDeadline === 'string' ? decodedValue.pickupDeadline : null,
    pickupNote: typeof decodedValue.pickupNote === 'string' ? decodedValue.pickupNote : null,
    denialReason: typeof decodedValue.denialReason === 'string' ? decodedValue.denialReason : null,
    hiddenFromModerators: decodedValue.hiddenFromModerators === true,
    moderatorArchivedAt:
      typeof decodedValue.moderatorArchivedAt === 'string' ? decodedValue.moderatorArchivedAt : null,
    statusHistory: history,
  };
}

export function parseStoreItemMeta(value: AppSettingValue | null | undefined): StoreItemMeta | null {
  const decodedValue = decodeSettingValue(value);

  if (!isRecord(decodedValue)) {
    return null;
  }

  return {
    category: typeof decodedValue.category === 'string' && decodedValue.category.trim() ? decodedValue.category.trim() : null,
    isDeleted: typeof decodedValue.isDeleted === 'boolean' ? decodedValue.isDeleted : undefined,
    deletedAt: typeof decodedValue.deletedAt === 'string' ? decodedValue.deletedAt : null,
  };
}

export function mergeOrdersWithMeta(
  orders: StoreOrder[],
  settings: Array<Pick<AppSetting, 'key' | 'value'>>,
): StoreOrder[] {
  const metaMap = new Map<string, StoreOrderMeta>();

  for (const setting of settings) {
    if (!setting.key.startsWith(STORE_ORDER_META_PREFIX)) {
      continue;
    }

    const orderId = setting.key.replace(STORE_ORDER_META_PREFIX, '');
    const parsed = parseStoreOrderMeta(setting.value);

    if (parsed) {
      metaMap.set(orderId, parsed);
    }
  }

  return orders.map((order) => ({
    ...order,
    meta: metaMap.get(order.id) ?? null,
  }));
}

export function mergeItemsWithMeta(
  items: StoreItem[],
  settings: Array<Pick<AppSetting, 'key' | 'value'>>,
): StoreItem[] {
  const metaMap = new Map<string, StoreItemMeta>();

  for (const setting of settings) {
    if (!setting.key.startsWith(STORE_ITEM_META_PREFIX)) {
      continue;
    }

    const itemId = setting.key.replace(STORE_ITEM_META_PREFIX, '');
    const parsed = parseStoreItemMeta(setting.value);

    if (parsed) {
      metaMap.set(itemId, parsed);
    }
  }

  return items.map((item) => ({
    ...item,
    meta: metaMap.get(item.id) ?? null,
  }));
}

export function appendOrderStatus(
  meta: StoreOrderMeta | null | undefined,
  status: OrderStatus,
  note?: string | null,
  updatedBy?: string | null,
): StoreOrderMeta {
  const existing = meta ?? {
    quantity: 1,
    unitPoints: 0,
    itemName: 'Store Item',
    itemImageUrl: null,
    itemDescription: null,
    lineItems: [],
    buyerName: null,
    buyerEmail: null,
    buyerEmployeeId: null,
    orderLabel: null,
    pickupMode: null,
    pickupDate: null,
    pickupTime: null,
    pickupDeadline: null,
    pickupNote: null,
    denialReason: null,
    hiddenFromModerators: false,
    moderatorArchivedAt: null,
    statusHistory: [],
  };

  const nextHistory = [...(existing.statusHistory ?? [])];
  nextHistory.push({
    status,
    at: new Date().toISOString(),
    note: note ?? null,
    updatedBy: updatedBy ?? null,
  });

  return {
    ...existing,
    statusHistory: nextHistory,
  };
}

export function getOrderLineItems(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }): StoreOrderLineItem[] {
  if (order.meta?.lineItems && order.meta.lineItems.length > 0) {
    return order.meta.lineItems;
  }

  return [
    {
      itemId: order.item?.id ?? 'unknown-item',
      name: order.item?.name ?? order.meta?.itemName ?? 'Store Item',
      quantity: order.meta?.quantity ?? 1,
      unitPoints: order.meta?.unitPoints ?? order.item?.points_cost ?? 0,
      imageUrl: order.item?.image_url ?? order.meta?.itemImageUrl ?? null,
      description: order.item?.description ?? order.meta?.itemDescription ?? null,
      category: order.item?.meta?.category ?? null,
    },
  ];
}

export function getOrderQuantity(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  return getOrderLineItems(order).reduce((sum, item) => sum + item.quantity, 0);
}

export function getOrderProductCount(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  return getOrderLineItems(order).length;
}

export function getOrderLineTotal(lineItem: Pick<StoreOrderLineItem, 'quantity' | 'unitPoints'>) {
  return lineItem.quantity * lineItem.unitPoints;
}

export function getOrderUnitPoints(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined; points_spent: number }) {
  const quantity = Math.max(getOrderQuantity(order), 1);
  const unitPoints = order.meta?.unitPoints ?? Math.round(order.points_spent / quantity);
  return unitPoints > 0 ? unitPoints : order.points_spent;
}

export function getOrderItemName(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  const lineItems = getOrderLineItems(order);
  if (lineItems.length <= 1) {
    return lineItems[0]?.name ?? 'Store Item';
  }

  return order.meta?.orderLabel ?? `Order bundle (${getOrderQuantity(order)} items)`;
}

export function getOrderSummaryTitle(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  const lineItems = getOrderLineItems(order);
  if (lineItems.length <= 1) {
    return lineItems[0]?.name ?? 'Store Item';
  }

  const firstName = lineItems[0]?.name ?? 'Store Item';
  const remainingCount = lineItems.length - 1;
  return `${firstName} + ${remainingCount} more item${remainingCount === 1 ? '' : 's'}`;
}

export function getOrderSummaryPreview(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  const lineItems = getOrderLineItems(order);
  return lineItems.map((lineItem) => `${lineItem.name} x${lineItem.quantity}`).join(' | ');
}

export function getOrderReference(orderId: string) {
  const compact = orderId.replace(/-/g, '').slice(0, 12).toUpperCase();
  return `ORDER ID: ${compact}`;
}

export function getOrderItemImage(order: { item?: OrderItemSnapshot | null; meta?: StoreOrderMeta | null | undefined }) {
  return getOrderLineItems(order)[0]?.imageUrl ?? null;
}

export function formatPoints(points: number) {
  return `${points.toLocaleString('en-US')} pts`;
}

export function formatShortDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}

export function formatShortDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPickupDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatPickupSummary(meta: StoreOrderMeta | null | undefined) {
  if (!meta?.pickupDate) {
    return null;
  }

  const base = formatPickupDate(meta.pickupDate);

  if (meta.pickupTime) {
    return `${base} at ${meta.pickupTime}`;
  }

  return base;
}

export function formatPickupSummaryWithDeadline(meta: StoreOrderMeta | null | undefined) {
  const pickupSummary = formatPickupSummary(meta);
  const pickupDeadline =
    typeof meta?.pickupDeadline === 'string' && meta.pickupDeadline ? formatShortDate(meta.pickupDeadline) : null;

  if (pickupSummary && pickupDeadline) {
    return `${pickupSummary} | Pick up by ${pickupDeadline}`;
  }

  if (pickupSummary) {
    return pickupSummary;
  }

  if (pickupDeadline) {
    return `Pick up by ${pickupDeadline}`;
  }

  return null;
}

export function getLatestStatusEntry(
  meta: StoreOrderMeta | null | undefined,
  status?: OrderStatus,
) {
  const history = meta?.statusHistory ?? [];
  const filtered = status ? history.filter((entry) => entry.status === status) : history;
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

export function canUndoCompletedOrder(meta: StoreOrderMeta | null | undefined) {
  const latestEntry = getLatestStatusEntry(meta);
  if (!latestEntry || latestEntry.status !== 'completed') {
    return false;
  }

  const completedAt = new Date(latestEntry.at).getTime();
  return Date.now() - completedAt <= ORDER_COMPLETION_UNDO_WINDOW_MS;
}

export function getUndoCompletedRemainingMinutes(meta: StoreOrderMeta | null | undefined) {
  const latestEntry = getLatestStatusEntry(meta);
  if (!latestEntry || latestEntry.status !== 'completed') {
    return null;
  }

  const remainingMs = ORDER_COMPLETION_UNDO_WINDOW_MS - (Date.now() - new Date(latestEntry.at).getTime());
  return remainingMs > 0 ? Math.ceil(remainingMs / (60 * 1000)) : 0;
}

export function getFinalStatusTimestamp(order: Pick<StoreOrder, 'status' | 'created_at' | 'meta'>) {
  const history = order.meta?.statusHistory ?? [];
  const finalEntry = [...history].reverse().find((entry) => FINAL_ORDER_STATUSES.has(entry.status));

  return finalEntry?.at ?? order.created_at;
}

export function isCleanupEligible(order: Pick<StoreOrder, 'status' | 'created_at' | 'meta'>) {
  if (!FINAL_ORDER_STATUSES.has(order.status)) {
    return false;
  }

  const finalTimestamp = new Date(getFinalStatusTimestamp(order)).getTime();
  const cutoff = ORDER_CLEANUP_DAYS * 24 * 60 * 60 * 1000;

  return Date.now() - finalTimestamp >= cutoff;
}

export function getCleanupRemainingDays(order: Pick<StoreOrder, 'status' | 'created_at' | 'meta'>) {
  if (!FINAL_ORDER_STATUSES.has(order.status)) {
    return null;
  }

  const finalTimestamp = new Date(getFinalStatusTimestamp(order)).getTime();
  const cutoff = ORDER_CLEANUP_DAYS * 24 * 60 * 60 * 1000;
  const remaining = cutoff - (Date.now() - finalTimestamp);

  return remaining > 0 ? Math.ceil(remaining / (24 * 60 * 60 * 1000)) : 0;
}

export function isModeratorOrderDeleteEligible(order: Pick<StoreOrder, 'status'>) {
  return MODERATOR_ORDER_DELETE_STATUSES.has(order.status);
}

export function isLowStockItem(item: Pick<StoreItem, 'stock' | 'is_active'>) {
  return item.is_active && item.stock !== -1 && item.stock > 0 && item.stock <= LOW_STOCK_THRESHOLD;
}

export function getLowStockUrgencyCopy(item: Pick<StoreItem, 'stock' | 'is_active'>) {
  if (!isLowStockItem(item)) {
    return null;
  }

  if (item.stock === 1) {
    return 'Only 1 left. This reward may sell out soon.';
  }

  return `Low stock. Only ${item.stock} left right now.`;
}

export function getStockLabel(item: Pick<StoreItem, 'stock'>) {
  if (item.stock === -1) {
    return 'Unlimited stock';
  }

  if (item.stock <= 0) {
    return 'Out of stock';
  }

  if (item.stock === 1) {
    return '1 left';
  }

  return `${item.stock} left`;
}


