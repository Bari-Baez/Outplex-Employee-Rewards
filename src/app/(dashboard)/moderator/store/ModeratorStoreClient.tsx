'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionMenu, ActionMenuItem, ActionMenuLabel, ActionMenuSeparator } from '@/components/layout/ActionMenu';
import { useRouter } from 'next/navigation';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { useTransferState } from '@/components/uploads/useTransferState';
import {
  canUndoCompletedOrder,
  formatPickupSummaryWithDeadline,
  formatPickupSummary,
  formatPoints,
  formatShortDate,
  getOrderReference,
  getOrderLineTotal,
  getOrderItemName,
  getOrderLineItems,
  getOrderProductCount,
  getOrderQuantity,
  getOrderSummaryPreview,
  getOrderSummaryTitle,
  getUndoCompletedRemainingMinutes,
  getStockLabel,
  getLowStockUrgencyCopy,
  isLowStockItem,
  isModeratorOrderDeleteEligible,
  RECENT_ORDER_HISTORY_WINDOW_DAYS,
} from '@/lib/store-helpers';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import type {
  OrderStatus,
  StoreItem,
  StoreOrder,
  StorePickupMode,
  StoreThemeConfig,
  StoreThemePresetConfig,
  User,
} from '@/types/database';
import { canEditTool } from '@/lib/permissions';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download, Eye, EyeOff, FileText, Layers, LayoutList, Loader2, MoreVertical, Package, PaintBucket, RefreshCcw, Star, Tag, Trash2, Upload, Wrench, XCircle, Users } from 'lucide-react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SupervisorFilter } from '@/components/SupervisorFilter';
import { toast } from 'sonner';
import { ModernSelect } from '@/components/ui/Select';
import { MobileDataFrame } from '@/components/ui/MobileDataFrame';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import { SplitWorkspace } from '@/components/ui/SplitWorkspace';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { useAppAvailability } from '@/components/layout/AppAvailabilityProvider';
import { readFileAsDataUrlWithProgress } from '@/lib/file-transfer';

interface ItemFormState {
  name: string;
  description: string;
  points_cost: number;
  stock: number;
  image_url: string;
  is_active: boolean;
  category: string;
}

type BulkColor = 'red' | 'yellow' | 'green' | 'blue';

const BULK_COLORS: { id: BulkColor; label: string; hex: string; bg: string; border: string }[] = [
  { id: 'red',    label: 'Rojo',     hex: '#f87171', bg: 'rgba(239,68,68,0.14)',   border: 'rgba(239,68,68,0.36)' },
  { id: 'yellow', label: 'Amarillo', hex: '#fbbf24', bg: 'rgba(234,179,8,0.14)',   border: 'rgba(234,179,8,0.36)' },
  { id: 'green',  label: 'Verde',    hex: '#34d399', bg: 'rgba(16,185,129,0.14)',  border: 'rgba(16,185,129,0.36)' },
  { id: 'blue',   label: 'Azul',     hex: '#60a5fa', bg: 'rgba(59,130,246,0.14)',  border: 'rgba(59,130,246,0.36)' },
];

interface ModeratorStoreOrder extends StoreOrder {
  item?: StoreItem;
  user?: { id: string; name: string; employee_id: string | null; email: string; supervisor?: string | null; supervisor_id?: string | null };
}

interface ModeratorStoreClientProps {
  currentUser: User;
  initialItems: StoreItem[];
  initialOrders: ModeratorStoreOrder[];
  initialTheme: StoreThemeConfig;
  initialTab?: 'orders' | 'inventory' | 'settings' | 'analytics' | 'recycle_bin';
  initialShowLowStock?: boolean;
  reviewSummary?: Record<string, { avg: number; count: number }>;
}

interface PickupFormState {
  pickupMode: StorePickupMode;
  pickupDate: string;
  pickupTime: string;
  pickupDeadline: string;
  pickupNote: string;
}

type ModeratorOrderFilter = 'all' | 'pending' | 'ready_for_pickup' | 'completed' | 'rejected' | 'cancelled';

interface NoticeModalState {
  title: string;
  body: string;
  tone?: 'default' | 'danger' | 'success';
}

interface ConfirmModalState {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  action: () => Promise<void> | void;
}

function getModeratorOrderStatusUi(status: OrderStatus) {
  switch (status) {
    case 'pending':
      return { label: 'Pending', icon: <Clock3 size={14} />, className: 'status-pending' };
    case 'approved':
      return { label: 'Approved', icon: <Clock3 size={14} />, className: 'status-approved' };
    case 'ready_for_pickup':
      return { label: 'Ready for pickup', icon: <Clock3 size={14} />, className: 'status-ready_for_pickup' };
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

const emptyItemForm = (): ItemFormState => ({
  name: '',
  description: '',
  points_cost: 100,
  stock: 10,
  image_url: '',
  is_active: true,
  category: '',
});

const createPickupForm = (order: ModeratorStoreOrder, pickupMode: StorePickupMode): PickupFormState => ({
  pickupMode,
  pickupDate: order.meta?.pickupDate ?? '',
  pickupTime: order.meta?.pickupTime ?? '',
  pickupDeadline: order.meta?.pickupDeadline ?? '',
  pickupNote: order.meta?.pickupNote ?? '',
});

function toItemForm(item: StoreItem): ItemFormState {
  return {
    name: item.name,
    description: item.description ?? '',
    points_cost: item.points_cost,
    stock: item.stock,
    image_url: item.image_url ?? '',
    is_active: item.is_active,
    category: item.meta?.category ?? '',
  };
}

function safeToFixed(value: unknown, digits: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : (0).toFixed(digits);
}

function upsertPreset(theme: StoreThemeConfig, presetName: string, selectedPresetId: string | null) {
  const normalizedName = presetName.trim() || `Preset ${(theme.presets?.length ?? 0) + 1}`;
  const presetPayload: StoreThemePresetConfig = {
    id: selectedPresetId ?? `preset-${Date.now()}`,
    name: normalizedName,
    backgroundImage: theme.backgroundImage ?? null,
    headline: theme.headline ?? '',
    subheading: theme.subheading ?? '',
    overlayOpacity: theme.overlayOpacity ?? 0.68,
  };
  const currentPresets = [...(theme.presets ?? [])];
  const presetIndex = currentPresets.findIndex((preset) => preset.id === presetPayload.id);
  if (presetIndex >= 0) {
    currentPresets[presetIndex] = presetPayload;
  } else {
    currentPresets.push(presetPayload);
  }
  return {
    ...theme,
    activePresetId: presetPayload.id,
    presets: currentPresets.slice(0, 5),
  } satisfies StoreThemeConfig;
}

export function ModeratorStoreClient({
  currentUser,
  initialItems,
  initialOrders,
  initialTheme,
  initialTab = 'orders',
  initialShowLowStock = false,
  reviewSummary = {},
}: ModeratorStoreClientProps) {
  const router = useRouter();
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'settings' | 'recycle_bin' | 'analytics'>(initialTab);
  const [items, setItems] = useState<StoreItem[]>(initialItems);
  const [orders, setOrders] = useState<ModeratorStoreOrder[]>(initialOrders);
  const [theme, setTheme] = useState(initialTheme);
  const [orderFilter, setOrderFilter] = useState<ModeratorOrderFilter>('all');
  const [newItem, setNewItem] = useState<ItemFormState>(emptyItemForm());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ItemFormState | null>(null);
  const [orderBusyId, setOrderBusyId] = useState<string | null>(null);
  const [pickupOrderId, setPickupOrderId] = useState<string | null>(null);
  const [pickupForm, setPickupForm] = useState<PickupFormState | null>(null);
  const [decisionOrderId, setDecisionOrderId] = useState<string | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<'rejected' | 'cancelled'>('rejected');
  const [decisionReason, setDecisionReason] = useState('');
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [historyCleanupBusy, setHistoryCleanupBusy] = useState(false);
  const [noticeModal, setNoticeModal] = useState<NoticeModalState | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const [globalMaintenanceBusy, setGlobalMaintenanceBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLowStock, setShowLowStock] = useState(initialShowLowStock);
  const [expandAllOrders, setExpandAllOrders] = useState(false);
  const [supervisorFilter, setSupervisorFilter] = useState<string | 'all' | 'my-team'>('all');

  const userRole = currentUser.role ?? 'employee';
  const isB1 = userRole === 'moderator_b1';
  const isReadOnly = !canEditTool(userRole, 'store-ops');
  const canFulfill = canEditTool(userRole, 'fulfill-orders');
  const { isSectionEnabled } = useAppAvailability();

  const importImageFile = async (file: File, onValue: (value: string) => void) => {
    transfer.start(file.name);
    try {
      const value = await readFileAsDataUrlWithProgress(file, { onProgress: transfer.setProgress });
      onValue(value);
      transfer.succeed('Imported');
    } catch (error) {
      transfer.fail('Failed');
      setNoticeModal({
        title: 'Upload failed',
        body: error instanceof Error ? error.message : 'Unable to read the selected file.',
        tone: 'danger',
      });
    }
  };

  const tabToSectionKey: Record<typeof activeTab, string> = {
    orders: 'orders',
    inventory: 'inventory',
    settings: 'theme',
    analytics: 'analytics',
    recycle_bin: 'recycle_bin',
  };

  const tabToHref: Record<typeof activeTab, string> = {
    orders: '/moderator/store/orders',
    inventory: '/moderator/store/inventory',
    settings: '/moderator/store/theme',
    analytics: '/moderator/store/analytics',
    recycle_bin: '/moderator/store/recycle-bin',
  };

  const isTabPublicEnabled = (tab: typeof activeTab) =>
    isSectionEnabled('store_operations', tabToSectionKey[tab], { userRole, bypassForAdmin: false });

  const goToTab = (tab: typeof activeTab) => {
    setActiveTab(tab);
    const lowStockSuffix = tab === 'inventory' && showLowStock ? '?lowStock=1' : '';
    router.push(`${tabToHref[tab]}${lowStockSuffix}`);
  };
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themePresetName, setThemePresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialTheme.activePresetId ?? null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [showLowStockPanel, setShowLowStockPanel] = useState(initialShowLowStock);
  const [bulkEditorOpen, setBulkEditorOpen] = useState(false);
  const [bulkColorMap, setBulkColorMap] = useState<Record<string, BulkColor>>({});
  const [bulkStockByColor, setBulkStockByColor] = useState<Record<BulkColor, string>>({ red: '', yellow: '', green: '', blue: '' });
  const [bulkApplying, setBulkApplying] = useState(false);
  const [reviewsSummary, setReviewsSummary] = useState<Record<string, { avg: number; count: number }>>({});
  const confirmModalRef = useRef<HTMLDivElement>(null);
  const noticeModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab !== 'analytics') return;
    const loadReviewsSummary = async () => {
      try {
        const res = await fetch('/api/store/reviews/summary');
        const { summary: rawSummary } = (await res.json()) as { summary: Record<string, { avg: number; count: number }> };
        setReviewsSummary(rawSummary || {});
      } catch {
        // silent fail
      }
    };
    void loadReviewsSummary();
  }, [activeTab]);

  // Scroll into view when a modal is opened so user doesn't miss it
  useEffect(() => {
    if (confirmModal && confirmModalRef.current) {
      confirmModalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [confirmModal]);

  useEffect(() => {
    if (noticeModal && noticeModalRef.current) {
      noticeModalRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [noticeModal]);

  const categories = useMemo(
    () => Array.from(new Set(items.map((item) => item.meta?.category?.trim()).filter(Boolean) as string[])).sort(),
    [items],
  );

  const lowStockItems = useMemo(
    () => items.filter((item) => isLowStockItem(item)),
    [items],
  );

  const inventoryItems = useMemo(
    () => items.filter((item) => !item.meta?.isDeleted),
    [items],
  );

  const summary = useMemo(
    () => ({
      pending: orders.filter((order) => order.status === 'pending').length,
      ready: orders.filter((order) => order.status === 'ready_for_pickup').length,
      scheduled: orders.filter((order) => order.status === 'ready_for_pickup' && order.meta?.pickupMode === 'scheduled').length,
      lowStock: items.filter((item) => isLowStockItem(item)).length,
    }),
    [items, orders],
  );

  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return orders.filter((order) => {
      if (orderFilter === 'pending' && order.status !== 'pending' && order.status !== 'approved') return false;
      if (orderFilter === 'ready_for_pickup' && order.status !== 'ready_for_pickup') return false;
      if (orderFilter === 'completed' && order.status !== 'completed') return false;
      if (orderFilter === 'rejected' && order.status !== 'rejected') return false;
      if (orderFilter === 'cancelled' && order.status !== 'cancelled') return false;

      // Supervisor filtering
      const isSearchActive = q.length > 0;
      const shouldBypassFilter = isSearchActive && isB1;

      if (!shouldBypassFilter) {
        if (supervisorFilter === 'my-team' && isB1) {
          if (order.user?.supervisor_id !== currentUser.id) return false;
        } else if (supervisorFilter !== 'all') {
          if (order.user?.supervisor_id !== supervisorFilter) return false;
        }
      }

      if (!q) return true;
      return (
        order.user?.name.toLowerCase().includes(q) ||
        order.user?.employee_id?.toLowerCase().includes(q) ||
        order.user?.email.toLowerCase().includes(q) ||
        order.id.toLowerCase().includes(q) ||
        order.item?.name.toLowerCase().includes(q)
      );
    });
  }, [orders, orderFilter, searchQuery, supervisorFilter, currentUser.id, isB1]);

  const allSupervisors = useMemo(() => {
    const supervisors = new Map<string, string>();
    orders.forEach(o => { 
      if (o.user?.supervisor_id && o.user.supervisor) {
        supervisors.set(o.user.supervisor_id, o.user.supervisor); 
      }
    });
    return Array.from(supervisors.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [orders]);

  const updateOrder = (orderId: string, updater: (order: ModeratorStoreOrder) => ModeratorStoreOrder) => {
    setOrders((current) => current.map((order) => (order.id === orderId ? updater(order) : order)));
  };

  const updateItem = (itemId: string, nextItem: StoreItem) => {
    setItems((current) => current.map((item) => (item.id === itemId ? nextItem : item)));
  };

  const openLowStockInventoryItem = (item: StoreItem) => {
    setActiveTab('inventory');
    setEditingItemId(item.id);
    setEditingItem(toItemForm(item));
    setShowLowStockPanel(true);
  };

  const openNotice = (title: string, body: string, tone: NoticeModalState['tone'] = 'default') => {
    setNoticeModal({ title, body, tone });
  };

  const openConfirm = (config: ConfirmModalState) => {
    setConfirmModal(config);
  };

  const executeConfirmAction = async () => {
    if (!confirmModal) {
      return;
    }

    setConfirmBusy(true);
    try {
      await confirmModal.action();
      setConfirmModal(null);
    } finally {
      setConfirmBusy(false);
    }
  };

  const toggleOrderExpanded = (orderId: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const exportOrdersToCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to export.');
      return;
    }
    const csvData = filteredOrders.map((order) => {
      const buyerName = order.user?.name ?? order.meta?.buyerName ?? 'Employee';
      const employeeId = order.user?.employee_id ?? order.meta?.buyerEmployeeId ?? 'No ID';
      const itemName = order.meta?.orderLabel ?? getOrderItemName(order);
      const lineItems = getOrderLineItems(order).map(li => `${li.quantity}x ${li.name}`).join(' | ');
      return {
        'Order ID': order.id,
        'Date': formatShortDate(order.created_at),
        'Status': order.status,
        'Buyer': buyerName,
        'Employee ID': employeeId,
        'Superior': order.user?.supervisor ?? '—',
        'Order Type': itemName,
        'Points Spent': order.points_spent,
        'Items Details': lineItems,
        'Pickup': formatPickupSummary(order.meta) ?? 'N/A'
      };
    });
    const result = Papa.unparse(csvData);
    const blob = new Blob([result], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Store_Orders_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportOrdersToPDF = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to export.');
      return;
    }
    const doc = new jsPDF();
    doc.text('Store Orders Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableData = filteredOrders.map(order => {
      const buyerName = order.user?.name ?? order.meta?.buyerName ?? 'Employee';
      const itemName = order.meta?.orderLabel ?? getOrderItemName(order);
      const points = order.points_spent.toString();
      const itemsDetails = getOrderLineItems(order).map(li => `${li.quantity}x ${li.name}`).join('\n');
      return [
        formatShortDate(order.created_at),
        buyerName,
        order.user?.supervisor ?? '—',
        itemName,
        itemsDetails,
        points,
        order.status
      ];
    });

    const pdfDoc = doc as jsPDF & {
      autoTable: (options: {
        startY: number;
        head: string[][];
        body: string[][];
        theme: string;
        styles: { fontSize: number };
        headStyles: { fillColor: number[] };
      }) => void;
    };

    pdfDoc.autoTable({
      startY: 30,
      head: [['Date', 'Buyer', 'Superior', 'Order Type', 'Items', 'Points', 'Status']],
      body: tableData,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Store_Orders_Export_${Date.now()}.pdf`);
  };

  const submitOrderStatus = async (order: ModeratorStoreOrder, payload: { status: OrderStatus } & Partial<PickupFormState> & { denialReason?: string }) => {
    setOrderBusyId(order.id);
    try {
      const response = await fetch(`/api/store/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; meta?: ModeratorStoreOrder['meta'] };
      if (!response.ok) throw new Error(data.error ?? 'Unable to update this order.');
      updateOrder(order.id, (currentOrder) => ({ ...currentOrder, status: payload.status, meta: data.meta ?? currentOrder.meta }));
      if (payload.status === 'rejected' || payload.status === 'cancelled') {
        const lines = getOrderLineItems(order);
        setItems((current) => current.map((item) => {
          const reservedLine = lines.find((line) => line.itemId === item.id);
          if (!reservedLine || item.stock === -1) return item;
          return { ...item, stock: item.stock + reservedLine.quantity };
        }));
      }
      setPickupOrderId(null);
      setPickupForm(null);
      setDecisionOrderId(null);
      setDecisionReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update this order.');
    } finally {
      setOrderBusyId(null);
    }
  };

  const handleCreateItem = async () => {
    if (!newItem.name.trim()) {
      toast.error('Please add a product name first.');
      return;
    }
    if (newItem.points_cost < 0) {
      toast.error('Points cost cannot be negative.');
      return;
    }
    if (newItem.stock < -1) {
      toast.error('Stock cannot be less than -1 (unlimited).');
      return;
    }
    setInventoryBusy(true);
    try {
      const response = await fetch('/api/store/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newItem, name: newItem.name.trim(), description: newItem.description.trim() || null, image_url: newItem.image_url || null, category: newItem.category.trim() || null }),
      });
      const data = (await response.json()) as { error?: string; item?: StoreItem };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to create the item.');
      setItems((current) => [data.item!, ...current]);
      setNewItem(emptyItemForm());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the item.');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleSaveItemEdit = async (itemId: string) => {
    if (!editingItem) return;
    if (editingItem.points_cost < 0) {
      toast.error('Points cost cannot be negative.');
      return;
    }
    if (editingItem.stock < -1) {
      toast.error('Stock cannot be less than -1 (unlimited).');
      return;
    }
    setInventoryBusy(true);
    try {
      const response = await fetch(`/api/store/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editingItem, name: editingItem.name.trim(), description: editingItem.description.trim() || null, image_url: editingItem.image_url || null, category: editingItem.category.trim() || null }),
      });
      const data = (await response.json()) as { error?: string; item?: StoreItem };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to save this item.');
      updateItem(itemId, data.item);
      setEditingItemId(null);
      setEditingItem(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save this item.');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleToggleActive = async (itemId: string, isActive: boolean) => {
    setInventoryBusy(true);
    try {
      const response = await fetch(`/api/store/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      });
      const data = (await response.json()) as { error?: string; item?: StoreItem };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to update item visibility.');
      updateItem(itemId, data.item);
    } catch (error) {
      openNotice('Unable to update visibility', error instanceof Error ? error.message : 'Unable to update item visibility.', 'danger');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleMarkOutOfStock = async (itemId: string) => {
    try {
      const response = await fetch(`/api/store/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: 0 }),
      });
      const data = (await response.json()) as { error?: string; item?: StoreItem };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to update stock.');
      updateItem(itemId, data.item);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update stock.');
    }
  };

  const handleRemoveFromInventory = async (itemId: string) => {
    setInventoryBusy(true);
    try {
      const response = await fetch(`/api/store/items/${itemId}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to delete this item.');
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                is_active: false,
                stock: 0,
                meta: { ...(item.meta ?? {}), isDeleted: true, deletedAt: new Date().toISOString() },
              }
            : item,
        ),
      );
    } catch (error) {
      openNotice('Unable to move item', error instanceof Error ? error.message : 'Unable to delete this item.', 'danger');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleRestoreItem = async (itemId: string) => {
    setInventoryBusy(true);
    try {
      const response = await fetch(`/api/store/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: false, deletedAt: null, is_active: false }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to restore item.');
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? { ...item, is_active: false, meta: { ...(item.meta || {}), isDeleted: false, deletedAt: null } }
            : item,
        ),
      );
    } catch (error) {
      openNotice('Unable to restore item', error instanceof Error ? error.message : 'Unable to restore item.', 'danger');
    } finally {
      setInventoryBusy(false);
    }
  };

  const handleRenewInventory = async () => {
    setInventoryBusy(true);
    try {
      const response = await fetch('/api/store/inventory/reset', { method: 'POST' });
      const data = (await response.json()) as { error?: string; erasedCount?: number };
      if (!response.ok) throw new Error(data.error ?? 'Unable to erase catalog.');
      const deletedAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => ({
          ...item,
          is_active: false,
          stock: 0,
          meta: { ...(item.meta || {}), isDeleted: true, deletedAt },
        })),
      );
      openNotice(
        'Catalog erased',
        `${data.erasedCount ?? 0} item(s) were moved to the recycle bin. You can restore them individually.`,
        'success',
      );
    } catch (error) {
      openNotice('Error', error instanceof Error ? error.message : 'Unable to erase catalog.', 'danger');
    } finally {
      setInventoryBusy(false);
    }
  };

  const promptEraseEntireCatalog = () => {
    openConfirm({
      title: 'Erase entire catalog?',
      body: 'All store items will be deactivated and moved to the recycle bin. Employees will no longer see any products. You can restore items individually afterwards.',
      confirmLabel: 'Eliminar',
      tone: 'danger',
      action: handleRenewInventory,
    });
  };

  const handleBulkStockApply = async () => {
    // Build list of { id, stock } pairs from color assignments
    const updates: { id: string; stock: number }[] = [];
    for (const [itemId, color] of Object.entries(bulkColorMap)) {
      const raw = bulkStockByColor[color];
      const stock = Math.max(0, Math.round(Number(raw)));
      if (raw.trim() !== '' && Number.isFinite(stock)) {
        updates.push({ id: itemId, stock });
      }
    }
    if (updates.length === 0) return;

    setBulkApplying(true);
    try {
      await Promise.all(
        updates.map(({ id, stock }) =>
          fetch(`/api/store/items/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stock }),
          }),
        ),
      );

      setItems((current) =>
        current.map((item) => {
          const match = updates.find((u) => u.id === item.id);
          return match ? { ...item, stock: match.stock } : item;
        }),
      );

      await fetch('/api/store/inventory/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: updates.map((u) => u.id), moderatorName: 'Store moderator' }),
      });

      openNotice('Stock actualizado', `${updates.length} producto(s) actualizados. Se notificó a todos los empleados.`, 'success');
      setBulkEditorOpen(false);
      setBulkColorMap({});
      setBulkStockByColor({ red: '', yellow: '', green: '', blue: '' });
    } catch (error) {
      openNotice('Error', error instanceof Error ? error.message : 'No se pudo aplicar el cambio de stock.', 'danger');
    } finally {
      setBulkApplying(false);
    }
  };

  const handleDeleteOldOrder = async (order: ModeratorStoreOrder) => {
    setOrderBusyId(order.id);
    try {
      const response = await fetch(`/api/store/orders/${order.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to delete this order.');
      setOrders((current) => current.filter((currentOrder) => currentOrder.id !== order.id));
    } catch (error) {
      openNotice('Unable to archive order', error instanceof Error ? error.message : 'Unable to delete this order.', 'danger');
    } finally {
      setOrderBusyId(null);
    }
  };

  const handleDeleteProcessedOrder = async (order: ModeratorStoreOrder) => {
    openConfirm({
      title: 'Hide this order from Store Operations?',
      body: `The order "${order.meta?.orderLabel ?? getOrderItemName(order)}" will be removed only from the moderator queue. The employee will still keep it in Order History.`,
      confirmLabel: 'Hide Order',
      tone: 'danger',
      action: () => handleDeleteOldOrder(order),
    });
  };

  const handleClearRecentOrderHistory = async () => {
    setHistoryCleanupBusy(true);
    try {
      const response = await fetch('/api/store/orders/cleanup', { method: 'DELETE' });
      const data = (await response.json()) as { error?: string; deletedCount?: number };
      if (!response.ok) {
        throw new Error(data.error ?? 'Unable to clear recent order history.');
      }

      setOrders((current) =>
        current.filter((order) => {
          if (!isModeratorOrderDeleteEligible(order)) {
            return true;
          }

          const orderTimestamp = new Date(order.created_at).getTime();
          const cutoff = Date.now() - RECENT_ORDER_HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
          return orderTimestamp < cutoff;
        }),
      );

      openNotice(
        'Store Operations cleaned',
        `${data.deletedCount ?? 0} processed order record(s) from the last ${RECENT_ORDER_HISTORY_WINDOW_DAYS} days were hidden from the moderator queue.`,
        'success',
      );
    } catch (error) {
      openNotice(
        'Unable to clear order history',
        error instanceof Error ? error.message : 'Unable to clear recent order history.',
        'danger',
      );
    } finally {
      setHistoryCleanupBusy(false);
    }
  };

  const promptRemoveFromInventory = (item: StoreItem) => {
    openConfirm({
      title: 'Move this item to the recycle bin?',
      body: `"${item.name}" will disappear from the store and move to the recycle bin. You can restore it later.`,
      confirmLabel: 'Move to Recycle Bin',
      tone: 'danger',
      action: () => handleRemoveFromInventory(item.id),
    });
  };

  const promptRestoreItem = (item: StoreItem) => {
    openConfirm({
      title: 'Restore this item?',
      body: `"${item.name}" will be removed from the recycle bin and kept hidden until you activate it again.`,
      confirmLabel: 'Restore Item',
      action: () => handleRestoreItem(item.id),
    });
  };

  const promptClearRecentOrderHistory = () => {
    openConfirm({
      title: 'Clear recent Store Operations history?',
      body: `Processed orders from the last ${RECENT_ORDER_HISTORY_WINDOW_DAYS} days will be hidden from moderators. Pending orders stay visible and employees will still keep their Order History.`,
      confirmLabel: `Clear ${RECENT_ORDER_HISTORY_WINDOW_DAYS} Days`,
      tone: 'danger',
      action: () => handleClearRecentOrderHistory(),
    });
  };

  const runGlobalMaintenance = async () => {
    setGlobalMaintenanceBusy(true);
    try {
      const res = await fetch('/api/moderator/maintenance/cleanup-logs', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mantenimiento fallido');
      openNotice(
        'Mantenimiento General Exitoso',
        'Se han purgado: Actividad (>30d), Pedidos (>30d), Rifas (>20d) y Solicitudes (>15d).',
        'success'
      );
    } catch (e) {
      openNotice('Error de Mantenimiento', e instanceof Error ? e.message : 'Error desconocido', 'danger');
    } finally {
      setGlobalMaintenanceBusy(false);
    }
  };

  const saveTheme = async (nextTheme?: StoreThemeConfig) => {
    const payloadTheme = nextTheme ?? theme;
    setThemeSaving(true);
    try {
      const response = await fetch('/api/store/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: payloadTheme }),
      });
      const data = (await response.json()) as { error?: string; theme?: StoreThemeConfig };
      if (!response.ok || !data.theme) throw new Error(data.error ?? 'Unable to save the store theme.');
      setTheme(data.theme);
      if (!nextTheme) openNotice('Theme saved', 'The employee storefront will now use this image and copy.', 'success');
    } catch (error) {
      openNotice('Error', error instanceof Error ? error.message : 'Unable to save the store theme.', 'danger');
    } finally {
      setThemeSaving(false);
    }
  };

  const saveCurrentAsPreset = () => {
    const currentPresets = theme.presets ?? [];
    const isUpdating = !!selectedPresetId && currentPresets.some((preset) => preset.id === selectedPresetId);
    if (!isUpdating && currentPresets.length >= 5) {
      openNotice('Limit reached', 'You can only keep up to 5 presets. Delete one before creating a new preset.');
      return;
    }
    const nextTheme = upsertPreset(theme, themePresetName, selectedPresetId);
    setTheme(nextTheme);
    setSelectedPresetId(nextTheme.activePresetId ?? null);
    const activePreset = nextTheme.presets?.find((preset) => preset.id === nextTheme.activePresetId);
    setThemePresetName(activePreset?.name ?? themePresetName);
  };

  const loadPreset = (preset: StoreThemePresetConfig) => {
    setSelectedPresetId(preset.id);
    setThemePresetName(preset.name);
    const nextTheme: StoreThemeConfig = {
      ...theme,
      activePresetId: preset.id,
      backgroundImage: preset.backgroundImage ?? null,
      headline: preset.headline ?? '',
      subheading: preset.subheading ?? '',
      overlayOpacity: preset.overlayOpacity ?? 0.68
    };
    setTheme(nextTheme);
    saveTheme(nextTheme); // Auto-save when loading preset
  };

  const deletePreset = (presetId: string) => {
    const nextPresets = (theme.presets ?? []).filter((preset) => preset.id !== presetId);
    setTheme((current) => ({ ...current, presets: nextPresets, activePresetId: current.activePresetId === presetId ? null : current.activePresetId }));
    if (selectedPresetId === presetId) {
      setSelectedPresetId(null);
      setThemePresetName('');
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: 1240 }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.35rem' }}>Store Operations</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 1.5rem' }}>
        Manage grouped orders, compare reserved stock, keep inventory clean and customize the storefront.
      </p>

      <div style={{ maxWidth: 560, marginBottom: '1rem' }}>
        <TransferProgress state={transfer.state} compact />
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '1rem', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'orders' ? 'btn-primary' : 'btn-ghost'} ${!isTabPublicEnabled('orders') ? 'btn-maint' : ''}`}
            onClick={() => goToTab('orders')}
            title={!isTabPublicEnabled('orders') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
          >
            <Package size={18} /> Orders
            {!isTabPublicEnabled('orders') && (
              <span className="btn-maint-pill">
                <Wrench size={14} /> MAINT
              </span>
            )}
          </button>
          {!isReadOnly && !isB1 && (
            <>
              <button
                className={`btn ${activeTab === 'inventory' ? 'btn-primary' : 'btn-ghost'} ${!isTabPublicEnabled('inventory') ? 'btn-maint' : ''}`}
                onClick={() => goToTab('inventory')}
                title={!isTabPublicEnabled('inventory') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
              >
                <Tag size={18} /> Inventory
                {!isTabPublicEnabled('inventory') && (
                  <span className="btn-maint-pill">
                    <Wrench size={14} /> MAINT
                  </span>
                )}
              </button>
              <button
                className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-ghost'} ${!isTabPublicEnabled('settings') ? 'btn-maint' : ''}`}
                onClick={() => goToTab('settings')}
                title={!isTabPublicEnabled('settings') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
              >
                <PaintBucket size={18} /> Store Theme
                {!isTabPublicEnabled('settings') && (
                  <span className="btn-maint-pill">
                    <Wrench size={14} /> MAINT
                  </span>
                )}
              </button>
            </>
          )}
          <button
            className={`btn ${activeTab === 'analytics' ? 'btn-primary' : 'btn-ghost'} ${!isTabPublicEnabled('analytics') ? 'btn-maint' : ''}`}
            onClick={() => goToTab('analytics')}
            title={!isTabPublicEnabled('analytics') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
          >
            <BarChart3 size={18} /> Analytics
            {!isTabPublicEnabled('analytics') && (
              <span className="btn-maint-pill">
                <Wrench size={14} /> MAINT
              </span>
            )}
          </button>
          {!isReadOnly && !isB1 && (
            <button
              className={`btn ${activeTab === 'recycle_bin' ? 'btn-danger' : 'btn-ghost'} ${!isTabPublicEnabled('recycle_bin') ? 'btn-maint' : ''}`}
              style={activeTab === 'recycle_bin' ? {} : { color: 'var(--brand-danger)' }}
              onClick={() => goToTab('recycle_bin')}
              title={!isTabPublicEnabled('recycle_bin') ? 'Esta sección está deshabilitada temporalmente por mantenimiento.' : undefined}
            >
              <Trash2 size={18} /> Recycle Bin
              {!isTabPublicEnabled('recycle_bin') && (
                <span className="btn-maint-pill">
                  <Wrench size={14} /> MAINT
                </span>
              )}
            </button>
          )}
        </div>

        {activeTab === 'orders' && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <ActionMenu
              trigger={
                <button className="btn btn-ghost" style={{ padding: '0.5rem 1rem' }}>
                  <Download size={16} /> Export Orders
                </button>
              }
            >
              <ActionMenuLabel>Export active orders</ActionMenuLabel>
              <ActionMenuSeparator />
              <ActionMenuItem onClick={exportOrdersToCSV}>
                <LayoutList size={14} style={{ marginRight: '0.4rem' }} /> Export as CSV
              </ActionMenuItem>
              <ActionMenuItem onClick={exportOrdersToPDF}>
                <FileText size={14} style={{ marginRight: '0.4rem' }} /> Export as PDF
              </ActionMenuItem>
            </ActionMenu>

            <label className="order-filter-select">
              <span>Status Filter</span>
              <ModernSelect
                className="w-44"
                value={orderFilter}
                onValueChange={v => setOrderFilter(v as ModeratorOrderFilter)}
                options={[
                  { label: 'Todas las órdenes', value: 'all' },
                  { label: 'Pendientes', value: 'pending' },
                  { label: 'Listas para retiro', value: 'ready_for_pickup' },
                  { label: 'Completadas', value: 'completed' },
                  { label: 'Rechazadas', value: 'rejected' },
                  { label: 'Canceladas', value: 'cancelled' }
                ]}
              />
            </label>

            <label className="order-filter-select">
              <span>Team</span>
              <SupervisorFilter
                supervisors={allSupervisors.filter(([id, name]) => name !== currentUser.name)}
                currentSupervisorFilter={supervisorFilter}
                onFilterChange={setSupervisorFilter}
                currentUserRole={currentUser.role}
                currentUserId={currentUser.id}
              />
            </label>
          </div>
        )}
      </div>

      {activeTab === 'orders' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="card">
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Pending review</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{summary.pending}</div>
            </div>
            <div className="card">
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Ready for pickup</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{summary.ready}</div>
            </div>
            <div className="card">
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Scheduled pickups</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{summary.scheduled}</div>
            </div>
            <button
              type="button"
              className={`card low-stock-summary-card ${showLowStockPanel ? 'low-stock-summary-card-active' : ''}`}
              onClick={() => setShowLowStockPanel((current) => !current)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>Low stock items</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{summary.lowStock}</div>
                </div>
                <AlertTriangle size={18} color={summary.lowStock > 0 ? '#f59e0b' : 'var(--text-muted)'} />
              </div>
              <div style={{ marginTop: '0.7rem', color: 'var(--text-secondary)', fontSize: '0.82rem', textAlign: 'left' }}>
                {summary.lowStock > 0 ? 'Click to review every item that is running low.' : 'No items are running low right now.'}
              </div>
            </button>
          </div>

          {showLowStockPanel && (
            <div className="card low-stock-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>Low stock watchlist</h2>
                  <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                    Items with only 2 or 1 units left are listed here so moderators can replenish them before they sell out.
                  </p>
                </div>
                <button className="btn btn-ghost" onClick={() => setShowLowStockPanel(false)}>
                  Close
                </button>
              </div>

              {lowStockItems.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem 0' }}>
                  No low stock items right now.
                </div>
              ) : (
                <div className="low-stock-grid">
                  {lowStockItems.map((item) => (
                    <div key={item.id} className="low-stock-item-card">
                      <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}>
                        <div className="low-stock-thumb">
                          {item.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={proxifyMediaUrl(item.image_url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Package size={16} color="var(--text-muted)" />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <strong style={{ display: 'block' }}>{item.name}</strong>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                            {item.meta?.category?.trim() || 'Uncategorized'} • {formatPoints(item.points_cost)}
                          </div>
                          <div className="low-stock-inline-alert">
                            <AlertTriangle size={14} />
                            <span>{getLowStockUrgencyCopy(item)}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: '0.35rem', justifyItems: 'end' }}>
                        <strong style={{ color: '#fbbf24' }}>{getStockLabel(item)}</strong>
                        <button className="btn btn-ghost btn-sm" onClick={() => openLowStockInventoryItem(item)}>
                          Open in inventory
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card" style={{ display: 'grid', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0 }}>Order queue</h2>
                <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                  Each checkout is grouped into one order. Expand it to review every product, quantity and price.
                </p>
              </div>

              <button className="btn btn-ghost danger-link" onClick={promptClearRecentOrderHistory} disabled={historyCleanupBusy || !canFulfill}>
                <Trash2 size={16} /> {historyCleanupBusy ? 'Clearing...' : `Clear last ${RECENT_ORDER_HISTORY_WINDOW_DAYS} days`}
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
                {orders.length === 0 ? 'No store orders yet.' : 'No orders match the current filter.'}
              </div>
            ) : (
              filteredOrders.map((order) => {
                const quantity = getOrderQuantity(order);
                const productCount = getOrderProductCount(order);
                const itemName = getOrderSummaryTitle(order);
                const image = order.meta?.lineItems?.[0]?.imageUrl ?? order.item?.image_url ?? order.meta?.itemImageUrl;
                const lineItems = getOrderLineItems(order);
                const orderPreview = getOrderSummaryPreview(order);
                const canDeleteOrder = isModeratorOrderDeleteEligible(order);
                const isExpanded = expandedOrders.has(order.id);
                const hasMultipleItems = lineItems.length > 1;
                const isPickupOpen = pickupOrderId === order.id && pickupForm;
                const isDecisionOpen = decisionOrderId === order.id;
                const statusUi = getModeratorOrderStatusUi(order.status);

                return (
                  <div 
                    key={order.id} 
                    className={`order-card-shell ${isExpanded ? 'expanded' : ''}`}
                    style={{ border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '1rem', display: 'grid', gap: '1rem' }}
                  >
                    <div 
                      onClick={hasMultipleItems ? () => toggleOrderExpanded(order.id) : undefined}
                      style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap', cursor: hasMultipleItems ? 'pointer' : 'default' }}
                    >
                      <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={proxifyMediaUrl(image)} alt={itemName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Reward</div>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                              {getOrderReference(order.id)}
                            </div>
                            <h3 style={{ margin: '0 0 0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              {itemName}
                              {hasMultipleItems && (isExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />)}
                            </h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                              <span>{order.user?.name ?? order.meta?.buyerName ?? 'Employee'}</span>
                              <span>•</span>
                              <span>{order.user?.email ?? order.meta?.buyerEmail ?? 'No email'}</span>
                              <span>•</span>
                              <span>{order.user?.employee_id ?? order.meta?.buyerEmployeeId ?? 'No employee id'}</span>
                              <span>•</span>
                              <span>{order.user?.supervisor || '—'}</span>
                              <span>•</span>
                              <span>{formatShortDate(order.created_at)}</span>
                            </div>
                          </div>
                          <span className={`order-status ${statusUi.className}`}>{statusUi.icon}{statusUi.label}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                          <div className="mini-card"><span>Requested</span><strong>{quantity} unit{quantity === 1 ? '' : 's'}</strong></div>
                          <div className="mini-card"><span>Total cost</span><strong>{formatPoints(order.points_spent)}</strong></div>
                          <div className="mini-card"><span>Pickup</span><strong>{formatPickupSummaryWithDeadline(order.meta) ?? 'Not scheduled yet'}</strong></div>
                          <div className="mini-card"><span>Line items</span><strong>{productCount} product{productCount === 1 ? '' : 's'}</strong></div>
                        </div>

                        {hasMultipleItems && (
                          <div className="order-summary-strip">
                            <strong>Order summary</strong>
                            <span>{orderPreview}</span>
                          </div>
                        )}

                        {(!hasMultipleItems || isExpanded) && (
                          <div className="line-items-shell" onClick={(e) => e.stopPropagation()}>
                            {lineItems.map((line) => {
                              const liveItem = items.find((item) => item.id === line.itemId);
                              const stockLabel = !liveItem ? 'Item removed from inventory' : liveItem.stock === 0 && !['rejected', 'cancelled'].includes(order.status) ? `Reserved for this order • live stock ${liveItem.stock}` : getStockLabel(liveItem);
                              return (
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
                                      <strong>{line.name}</strong>
                                      <div className="line-item-copy">
                                        {line.quantity} x {formatPoints(line.unitPoints)} each
                                      </div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gap: '0.3rem', justifyItems: 'end' }}>
                                    <strong>{formatPoints(getOrderLineTotal(line))}</strong>
                                    <div className={`line-item-stock ${liveItem?.stock === 0 ? 'line-item-stock-alert' : ''}`}>{stockLabel}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(order.meta?.pickupDeadline || order.meta?.denialReason) && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.9rem' }}>
                            {order.meta?.pickupDeadline && <div className="pill">Pick up by {formatShortDate(order.meta.pickupDeadline)}</div>}
                            {order.meta?.denialReason && <div className="pill pill-danger">{order.meta.denialReason}</div>}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                      {order.status === 'pending' && (
                        <ActionMenu
                          trigger={<button className="btn btn-ghost" disabled={orderBusyId === order.id || !canFulfill}><MoreVertical size={16} /> Update Status</button>}
                        >
                          <ActionMenuLabel>Manage order</ActionMenuLabel>
                          <ActionMenuSeparator />
                          <ActionMenuItem onClick={() => { setPickupOrderId(order.id); setPickupForm(createPickupForm(order, 'immediate')); setDecisionOrderId(null); }}>
                            Ready Now (auto-approve)
                          </ActionMenuItem>
                          <ActionMenuItem onClick={() => { setPickupOrderId(order.id); setPickupForm(createPickupForm(order, 'scheduled')); setDecisionOrderId(null); }}>
                            <Clock3 size={14} style={{ marginRight: '0.35rem' }} /> Schedule Pickup
                          </ActionMenuItem>
                          <ActionMenuSeparator />
                          <ActionMenuItem destructive onClick={() => { setDecisionOrderId(order.id); setDecisionStatus('rejected'); setDecisionReason(order.meta?.denialReason ?? ''); setPickupOrderId(null); setPickupForm(null); }}>
                            Deny order (Refund points)
                          </ActionMenuItem>
                        </ActionMenu>
                      )}

                      {order.status === 'approved' && (
                        <>
                          <button className="btn btn-primary" onClick={() => { setPickupOrderId(order.id); setPickupForm(createPickupForm(order, 'immediate')); setDecisionOrderId(null); }} disabled={orderBusyId === order.id || !canFulfill}>Ready Now</button>
                          
                          <ActionMenu
                            trigger={<button className="btn btn-ghost" disabled={orderBusyId === order.id || !canFulfill}><MoreVertical size={16} /> Options</button>}
                          >
                            <ActionMenuItem onClick={() => { setPickupOrderId(order.id); setPickupForm(createPickupForm(order, 'scheduled')); setDecisionOrderId(null); }}>
                              <Clock3 size={14} style={{ marginRight: '0.35rem' }} /> Schedule Pickup
                            </ActionMenuItem>
                            <ActionMenuSeparator />
                            <ActionMenuItem destructive onClick={() => { setDecisionOrderId(order.id); setDecisionStatus('cancelled'); setDecisionReason(order.meta?.denialReason ?? ''); setPickupOrderId(null); setPickupForm(null); }}>
                              Cancel order (Refund points)
                            </ActionMenuItem>
                          </ActionMenu>
                        </>
                      )}

                      {order.status === 'ready_for_pickup' && (
                        <button
                          className="btn complete-order-button"
                          onClick={() => void submitOrderStatus(order, { status: 'completed' })}
                          disabled={orderBusyId === order.id || !canFulfill}
                        >
                          {orderBusyId === order.id ? (
                            <>
                              <Loader2 size={16} className="animate-spin" />
                              Completing...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={16} />
                              Mark Completed
                            </>
                          )}
                        </button>
                      )}

                      {order.status === 'completed' && canUndoCompletedOrder(order.meta) && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => void submitOrderStatus(order, { status: 'ready_for_pickup' })}
                          disabled={orderBusyId === order.id}
                        >
                          Undo Complete ({getUndoCompletedRemainingMinutes(order.meta) ?? 0} min)
                        </button>
                      )}

                    </div>

                    {canDeleteOrder && currentUser.role !== 'moderator_b1' && (
                      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                        <button
                          className="btn btn-ghost danger-link order-delete-button"
                          onClick={() => void handleDeleteProcessedOrder(order)}
                          disabled={orderBusyId === order.id || !canFulfill}
                        >
                          <Trash2 size={14} /> Delete Order
                        </button>
                      </div>
                    )}

                    {isPickupOpen && pickupForm && (
                      <div className="inline-panel">
                        <div className="inline-panel-header">
                          <div>
                            <h3 style={{ margin: 0 }}>Pickup setup</h3>
                            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.82rem' }}>This panel stays attached to the order so you do not need to scroll back to the center.</p>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                          <ModernSelect
                            label="Fecha que puede recoger"
                            value={pickupForm.pickupMode}
                            onValueChange={v => setPickupForm({ ...pickupForm, pickupMode: v as StorePickupMode })}
                            options={[
                              { label: 'Ready immediately', value: 'immediate' },
                              { label: 'Scheduled pickup', value: 'scheduled' }
                            ]}
                          />
                          {pickupForm.pickupMode === 'scheduled' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                              <ModernDatePicker
                                label="Fecha"
                                date={pickupForm.pickupDate}
                                onDateChange={v => setPickupForm({ ...pickupForm, pickupDate: v })}
                              />
                              <ModernTimePicker
                                label="Hora"
                                time={pickupForm.pickupTime}
                                onTimeChange={v => setPickupForm({ ...pickupForm, pickupTime: v })}
                              />
                            </div>
                          )}
                          <ModernDatePicker
                            label="Fecha máxima para pasar por tu orden"
                            date={pickupForm.pickupDeadline}
                            onDateChange={v => setPickupForm({ ...pickupForm, pickupDeadline: v })}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost" onClick={() => { setPickupOrderId(null); setPickupForm(null); }}>Cancel</button>
                            {currentUser.role !== 'moderator_b1' && (
                              <button className="btn btn-primary" onClick={() => void submitOrderStatus(order, { status: 'ready_for_pickup', pickupMode: pickupForm.pickupMode, pickupDate: pickupForm.pickupDate, pickupTime: pickupForm.pickupTime, pickupDeadline: pickupForm.pickupDeadline, pickupNote: pickupForm.pickupNote })} disabled={orderBusyId === order.id}>Save Pickup</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {isDecisionOpen && (
                      <div className="inline-panel inline-panel-danger">
                        <div className="inline-panel-header">
                          <div>
                            <h3 style={{ margin: 0 }}>{decisionStatus === 'rejected' ? 'Deny order' : 'Cancel order'}</h3>
                            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.82rem' }}>Add a reason. The employee will be notified and refunded automatically.</p>
                          </div>
                        </div>
                        <textarea className="input" rows={4} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Explain why the order was denied or cancelled." />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                          <button className="btn btn-ghost" onClick={() => { setDecisionOrderId(null); setDecisionReason(''); }}>Close</button>
                          {currentUser.role !== 'moderator_b1' && (
                            <button className="btn btn-primary" onClick={() => void submitOrderStatus(order, { status: decisionStatus, denialReason: decisionReason })} disabled={orderBusyId === order.id}>Confirm</button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .btn-maint {
          opacity: 0.72;
          border-color: rgba(245, 158, 11, 0.22) !important;
        }
        .btn-maint:hover {
          opacity: 0.88;
        }
        .btn-maint-pill {
          margin-left: 0.6rem;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.18rem 0.55rem;
          border-radius: 999px;
          font-size: 0.68rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.22);
          color: rgba(252, 211, 77, 0.95);
        }
      `}</style>

      {activeTab === 'inventory' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>Inventory manager</h2>
              <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>Use the visibility button to temporarily hide products from the employee store without deleting them. Stock can still be managed separately.</p>
            </div>
            
            {currentUser.role !== 'moderator_b1' && (
              <ActionMenu trigger={<button className="btn btn-ghost" disabled={inventoryBusy}><RefreshCcw size={16} /> Renew Inventory</button>}>
                <ActionMenuLabel>Inventory actions</ActionMenuLabel>
                <ActionMenuSeparator />
                <ActionMenuItem onClick={() => setBulkEditorOpen(true)}>
                  <Layers size={14} style={{ marginRight: '0.4rem' }} /> Bulk stock editor
                </ActionMenuItem>
                <ActionMenuItem onClick={promptEraseEntireCatalog} destructive>
                  <Trash2 size={14} style={{ marginRight: '0.4rem' }} /> Erase catalog
                </ActionMenuItem>
              </ActionMenu>
            )}
          </div>

          {lowStockItems.length > 0 && (
            <div className="card low-stock-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h3 style={{ margin: 0 }}>Inventory needs attention</h3>
                  <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>
                    {lowStockItems.length} item{lowStockItems.length === 1 ? '' : 's'} {lowStockItems.length === 1 ? 'is' : 'are'} almost out of stock.
                  </p>
                </div>
                <button className="btn btn-ghost" onClick={() => setShowLowStockPanel((current) => !current)}>
                  {showLowStockPanel ? 'Hide list' : 'Show list'}
                </button>
              </div>

              {showLowStockPanel && (
                <div className="low-stock-grid">
                  {lowStockItems.map((item) => (
                    <div key={`inventory-low-${item.id}`} className="low-stock-item-card">
                      <div>
                        <strong>{item.name}</strong>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.25rem' }}>
                          {item.meta?.category?.trim() || 'Uncategorized'} • {formatPoints(item.points_cost)}
                        </div>
                      </div>
                      <div style={{ display: 'grid', justifyItems: 'end', gap: '0.35rem' }}>
                        <strong style={{ color: '#fbbf24' }}>{getStockLabel(item)}</strong>
                        <button className="btn btn-ghost btn-sm" onClick={() => openLowStockInventoryItem(item)}>
                          Edit item
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <SplitWorkspace
            className="inventory-workspace"
            primaryLabel="Nuevo producto"
            secondaryLabel={`Inventario (${inventoryItems.length})`}
            desktopColumns="minmax(320px, 420px) minmax(0, 1fr)"
            panelMaxHeight="calc(100vh - 14rem)"
            primaryPanelClassName="inventory-builder-panel"
            secondaryPanelClassName="inventory-list-panel"
            primary={(
              <div className="inventory-builder-shell">
                <div className="inventory-panel-heading">
                  <div>
                    <h3 style={{ margin: 0 }}>New Item Builder</h3>
                    <p className="inventory-panel-copy">Build one item at a time without losing the list on the side.</p>
                  </div>
                </div>

                <StickyActionBar
                  topOffset="0"
                  className="inventory-action-bar"
                  summary={(
                    <div className="inventory-draft-summary">
                      <strong>{newItem.name.trim() || 'Draft item'}</strong>
                      <span>
                        {formatPoints(newItem.points_cost)} · {newItem.stock < 0 ? 'Unlimited stock' : `${newItem.stock} in stock`}
                      </span>
                    </div>
                  )}
                  actions={(
                    <>
                      <button className="btn btn-ghost btn-sm" onClick={() => setNewItem(emptyItemForm())} disabled={inventoryBusy || isReadOnly}>
                        Clear
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => void handleCreateItem()} disabled={inventoryBusy || isReadOnly}>
                        Add item
                      </button>
                    </>
                  )}
                  mobileActions={(
                    <button className="btn btn-primary btn-sm" onClick={() => void handleCreateItem()} disabled={inventoryBusy || isReadOnly}>
                      Add item
                    </button>
                  )}
                />

                <div className="inventory-builder-form">
                  <div><label className="meta-label">Product name</label><input className="input" value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} /></div>
                  <div><label className="meta-label">Description</label><textarea className="input" rows={4} value={newItem.description} onChange={(event) => setNewItem({ ...newItem, description: event.target.value })} /></div>
                  <div><label className="meta-label">Category</label><input className="input" list="store-categories" value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })} placeholder="Example: Drinks, Home, Digital" /></div>
                  <div className="inventory-builder-inline">
                    <div><label className="meta-label">Points cost</label><input type="number" min="0" className="input" value={newItem.points_cost} onChange={(event) => setNewItem({ ...newItem, points_cost: Number(event.target.value) })} /></div>
                    <div><label className="meta-label">Stock (-1 = unlimited)</label><input type="number" className="input" value={newItem.stock} onChange={(event) => setNewItem({ ...newItem, stock: Number(event.target.value) })} /></div>
                  </div>
                  <div><label className="meta-label">Image URL</label><input className="input" value={newItem.image_url} onChange={(event) => setNewItem({ ...newItem, image_url: event.target.value })} placeholder="https://... or upload from device" /></div>
                  <label className="file-input-row"><Upload size={16} /><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImageFile(file, (value) => setNewItem((current) => ({ ...current, image_url: value }))); event.currentTarget.value = ''; }} /></label>
                  <div className="inventory-builder-preview preview-box">{newItem.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={proxifyMediaUrl(newItem.image_url)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : <div className="preview-empty">Preview</div>}</div>
                </div>
              </div>
            )}
            secondary={(
              <div className="inventory-list-shell">
                <div className="inventory-panel-heading">
                  <div>
                    <h3 style={{ margin: 0 }}>Current items</h3>
                    <p className="inventory-panel-copy">{inventoryItems.length} item{inventoryItems.length === 1 ? '' : 's'} currently available for moderation.</p>
                  </div>
                </div>

                <div className="inventory-list-scroll">
                  {inventoryItems.length === 0 ? (
                    <div className="preset-empty">No items have been created yet. Start with the builder on the left.</div>
                  ) : inventoryItems.map((item) => {
                const isEditing = editingItemId === item.id && editingItem;
                const summary = reviewSummary[item.id];
                return (
                  <div key={item.id} className={`inventory-item-shell ${item.is_active ? '' : 'inventory-item-hidden'}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.25rem' }}>{item.name}</h4>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                          <span>{formatPoints(item.points_cost)}</span>
                          <span>•</span>
                          <span>{getStockLabel(item)}</span>
                          <span>•</span>
                          <span>{item.meta?.category?.trim() || 'Uncategorized'}</span>
                          <span>•</span>
                          <span>{item.is_active ? 'Visible' : 'Hidden'}</span>
                          {summary && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#fbbf24', fontWeight: 800 }}>
                              <Star size={14} fill="currentColor" />
                              {summary.avg.toFixed(1)}
                              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>({summary.count})</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="inventory-visibility-stack">
                        <div className={`inventory-visibility-badge ${item.is_active ? 'inventory-visibility-badge-live' : 'inventory-visibility-badge-hidden'}`}>
                          {item.is_active ? 'Visible in store' : 'Hidden from store'}
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${item.is_active ? 'btn-ghost' : 'btn-primary'} inventory-visibility-button`}
                          onClick={() => void handleToggleActive(item.id, !item.is_active)}
                          disabled={inventoryBusy || isReadOnly}
                        >
                          {item.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                          {item.is_active ? 'Hide from Store' : 'Show in Store'}
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-secondary" onClick={() => { setEditingItemId(item.id); setEditingItem(toItemForm(item)); }} disabled={isReadOnly}>Edit</button>
                      
                      <ActionMenu trigger={<button className="btn btn-ghost" style={{ padding: '0.5rem' }}><MoreVertical size={16} /></button>}>
                        <ActionMenuItem onClick={() => void handleMarkOutOfStock(item.id)} disabled={isReadOnly}>
                          Quick Action: Mark Sold Out
                        </ActionMenuItem>
                        <ActionMenuSeparator />
                        <ActionMenuLabel>Remove item</ActionMenuLabel>
                        <ActionMenuItem destructive onClick={() => promptRemoveFromInventory(item)} disabled={isReadOnly}>
                          <Trash2 size={14} style={{ marginRight: '0.35rem' }} /> Move to Recycle Bin
                        </ActionMenuItem>
                      </ActionMenu>
                    </div>

                    {isEditing && (
                      <div style={{ display: 'grid', gap: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                        <input className="input" value={editingItem.name} onChange={(event) => setEditingItem({ ...editingItem, name: event.target.value })} />
                        <textarea className="input" rows={3} value={editingItem.description} onChange={(event) => setEditingItem({ ...editingItem, description: event.target.value })} />
                        <input className="input" list="store-categories" value={editingItem.category} onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value })} placeholder="Category" />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                          <input type="number" className="input" value={editingItem.points_cost} onChange={(event) => setEditingItem({ ...editingItem, points_cost: Number(event.target.value) })} />
                          <input type="number" className="input" value={editingItem.stock} onChange={(event) => setEditingItem({ ...editingItem, stock: Number(event.target.value) })} />
                        </div>
                        <input className="input" value={editingItem.image_url} onChange={(event) => setEditingItem({ ...editingItem, image_url: event.target.value })} />
                        <label className="file-input-row"><Upload size={16} /><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImageFile(file, (value) => setEditingItem((current) => current ? { ...current, image_url: value } : current)); event.currentTarget.value = ''; }} /></label>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <button className="btn btn-primary" onClick={() => void handleSaveItemEdit(item.id)} disabled={inventoryBusy || isReadOnly}>Save Changes</button>
                          <button className="btn btn-ghost" onClick={() => { setEditingItemId(null); setEditingItem(null); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
                </div>
              </div>
            )}
          />
          <datalist id="store-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card" style={{ display: 'grid', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0 }}>Store Theme Editor</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0', fontSize: '0.85rem' }}>Build your own presets, keep up to 5 saved looks and apply the one you want the storefront to use.</p>
          </div>

          <div className="preset-manager-grid">
            {(theme.presets ?? []).map((preset) => (
              <div key={preset.id} className={`preset-card ${theme.activePresetId === preset.id ? 'preset-card-active' : ''}`}>
                <button className="preset-load-button" onClick={() => loadPreset(preset)}>
                  <strong>{preset.name}</strong>
                  <span>{preset.backgroundImage ? 'Image preset' : 'Gradient preset'}</span>
                </button>
                <div className="preset-actions">
                  <button className="btn btn-ghost" onClick={() => loadPreset(preset)}>Load</button>
                  <button className="btn btn-ghost danger-link" onClick={() => deletePreset(preset.id)} disabled={isReadOnly}>Delete</button>
                </div>
              </div>
            ))}
            {(theme.presets?.length ?? 0) === 0 && <div className="preset-empty">No presets saved yet. Save the current setup below as your first preset.</div>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)', gap: '1rem' }} className="inventory-columns">
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div><label className="meta-label">Preset name</label><input className="input" value={themePresetName} onChange={(event) => setThemePresetName(event.target.value)} placeholder="Spring promo, Summer campaign, etc." /></div>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={saveCurrentAsPreset} disabled={isReadOnly}>{selectedPresetId ? 'Update Selected Preset' : 'Save as New Preset'}</button>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', alignSelf: 'center' }}>{(theme.presets?.length ?? 0)}/5 presets saved</span>
              </div>
              <div><label className="meta-label">Headline</label><input className="input" value={theme.headline ?? ''} onChange={(event) => setTheme({ ...theme, headline: event.target.value })} /></div>
              <div><label className="meta-label">Subheading</label><textarea className="input" rows={3} value={theme.subheading ?? ''} onChange={(event) => setTheme({ ...theme, subheading: event.target.value })} /></div>
              <div><label className="meta-label">Background image URL</label><input className="input" value={theme.backgroundImage ?? ''} onChange={(event) => setTheme({ ...theme, backgroundImage: event.target.value })} /></div>
              <label className="file-input-row"><Upload size={16} /><input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImageFile(file, (value) => setTheme((current) => ({ ...current, backgroundImage: value }))); event.currentTarget.value = ''; }} /></label>
              <div><label className="meta-label">Overlay opacity ({Math.round((theme.overlayOpacity ?? 0.68) * 100)}%)</label><input type="range" min="0.2" max="0.9" step="0.05" value={theme.overlayOpacity ?? 0.68} onChange={(event) => setTheme({ ...theme, overlayOpacity: Number(event.target.value) })} style={{ width: '100%' }} /></div>
              <button className="btn btn-primary" onClick={() => void saveTheme()} disabled={themeSaving || isReadOnly}>{themeSaving ? 'Saving...' : 'Save Theme'}</button>
            </div>

            <div className="preview-box" style={{ minHeight: 320 }}>
              <div style={{ minHeight: 320, backgroundImage: theme.backgroundImage ? `linear-gradient(180deg, rgba(8, 11, 20, ${theme.overlayOpacity ?? 0.68}) 0%, rgba(8, 11, 20, 0.92) 100%), url(${theme.backgroundImage})` : 'linear-gradient(135deg, rgba(124,108,255,0.3), rgba(59,130,246,0.18))', backgroundSize: 'cover', backgroundPosition: 'center', padding: '1.5rem', display: 'flex', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.72)', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', fontWeight: 700, marginBottom: '0.6rem' }}>Store preview</div>
                  <h3 style={{ margin: '0 0 0.5rem', color: 'white', fontSize: '2rem' }}>{theme.headline}</h3>
                  <p style={{ margin: 0, color: 'rgba(255,255,255,0.78)' }}>{theme.subheading}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Store Cart Banner */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', display: 'grid', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700 }}>Employee Store Cart Banner</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                Customize the header banner image displayed in the employee-store cart drawer. Leave blank to use the default gradient.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)', gap: '1rem' }} className="inventory-columns">
              <div style={{ display: 'grid', gap: '0.9rem' }}>
                <div>
                  <label className="meta-label">Banner image URL</label>
                  <input
                    className="input"
                    value={theme.empCartBannerImage ?? ''}
                    onChange={(event) => setTheme({ ...theme, empCartBannerImage: event.target.value || null })}
                    placeholder="https://... or leave blank for default gradient"
                  />
                </div>
                <label className="file-input-row">
                  <Upload size={16} />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importImageFile(file, (value) => setTheme((current) => ({ ...current, empCartBannerImage: value })));
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {theme.empCartBannerImage && (
                  <button
                    className="btn btn-ghost danger-link"
                    style={{ alignSelf: 'flex-start', fontSize: '0.82rem' }}
                    onClick={() => setTheme({ ...theme, empCartBannerImage: null })}
                  >
                    Remove banner image
                  </button>
                )}
                <button className="btn btn-primary" onClick={() => void saveTheme()} disabled={themeSaving || isReadOnly}>
                  {themeSaving ? 'Saving...' : 'Save Cart Banner'}
                </button>
              </div>
              <div className="preview-box" style={{ minHeight: 120 }}>
                {theme.empCartBannerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxifyMediaUrl(theme.empCartBannerImage)}
                    alt="Employee cart banner preview"
                    style={{ width: '100%', height: '100%', minHeight: 120, objectFit: 'cover', borderRadius: 'inherit', display: 'block' }}
                  />
                ) : (
                  <div className="preview-empty" style={{ flexDirection: 'column', gap: '0.5rem' }}>
                    <PaintBucket size={20} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.8rem' }}>No banner set — default gradient will be used</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Global Database Maintenance */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem', display: 'grid', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RefreshCcw size={18} className={globalMaintenanceBusy ? 'animate-spin' : ''} />
                Mantenimiento y Purga Automática
              </h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                Optimiza el almacenamiento eliminando registros antiguos según la política de retención:
                <br />• <b>Solicitudes de Tienda:</b> Eliminadas 15 días después de aprobación/rechazo.
                <br />• <b>Rifas Finalizadas:</b> Eliminadas 20 días después del sorteo.
                <br />• <b>Historial de Pedidos:</b> Todos los pedidos (Outplex y Empleados) {'>'} 30 días serán borrados permanentemente.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
               <button 
                  className="btn btn-primary" 
                  style={{ background: 'linear-gradient(135deg, #7c6cff, #6366f1)' }}
                  onClick={() => runGlobalMaintenance()} 
                  disabled={globalMaintenanceBusy || isReadOnly}
                >
                 {globalMaintenanceBusy ? 'Procesando Mantenimiento...' : 'Ejecutar Limpieza General'}
               </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (() => {
        const CHART_COLORS = ['#7c6cff', '#22d3ee', '#10b981', '#f59e0b', '#f97316', '#ef4444'];
        const totalOrders = orders.length;
        const totalPoints = orders.reduce((sum, o) => sum + o.points_spent, 0);
        const closedOrders = orders.filter((o) => ['completed', 'rejected', 'cancelled'].includes(o.status));
        const completedOrders = orders.filter((o) => o.status === 'completed');
        const completionRate = closedOrders.length > 0 ? Math.round((completedOrders.length / closedOrders.length) * 100) : 0;
        const avgOrder = totalOrders > 0 ? Math.round(totalPoints / totalOrders) : 0;
        const avgRating = Object.values(reviewsSummary).length > 0
          ? Math.round((Object.values(reviewsSummary).reduce((sum, r) => sum + (r.avg || 0), 0) / Object.values(reviewsSummary).length) * 10) / 10
          : 0;

        const productCounts: Record<string, number> = {};
        for (const o of orders) {
          const name = o.meta?.itemName ?? o.item?.name ?? 'Unknown';
          productCounts[name] = (productCounts[name] ?? 0) + 1;
        }
        const topProducts = Object.entries(productCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count }));

        const statusCounts = [
          { name: 'Pending', value: orders.filter((o) => o.status === 'pending').length, color: '#f97316' },
          { name: 'Approved', value: orders.filter((o) => o.status === 'approved').length, color: '#38bdf8' },
          { name: 'Ready', value: orders.filter((o) => o.status === 'ready_for_pickup').length, color: '#818cf8' },
          { name: 'Completed', value: orders.filter((o) => o.status === 'completed').length, color: '#10b981' },
          { name: 'Rejected', value: orders.filter((o) => o.status === 'rejected').length, color: '#ef4444' },
          { name: 'Cancelled', value: orders.filter((o) => o.status === 'cancelled').length, color: '#6b7280' },
        ].filter((s) => s.value > 0);

        const recentOrders = [...orders].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 30);

        return (
          <div style={{ display: 'grid', gap: '1rem' }} className="animate-fade-in">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              {[
                { label: 'Total orders', value: totalOrders.toLocaleString() },
                { label: 'Points redeemed', value: totalPoints.toLocaleString() + ' pts' },
                { label: 'Completion rate', value: completionRate + '%' },
                { label: 'Avg order value', value: avgOrder.toLocaleString() + ' pts' },
                { label: 'Avg rating', value: `${safeToFixed(avgRating, 1)} ★` },
              ].map((card) => (
                <div key={card.label} className="card">
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.35rem' }}>{card.label}</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{card.value}</div>
                </div>
              ))}
            </div>

            <MobileDataFrame searchable={false} className="analytics-mobile-frame">
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1rem' }} className="analytics-charts-grid">
                <div className="card" style={{ display: 'grid', gap: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Top 5 Products</h2>
                  {topProducts.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No order data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topProducts} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10 }} />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {topProducts.map((_, index) => (
                            <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="card" style={{ display: 'grid', gap: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Orders by Status</h2>
                  {statusCounts.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>No order data yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={statusCounts} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                            {statusCounts.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' }}>
                        {statusCounts.map((s) => (
                          <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                            {s.name} ({s.value})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </MobileDataFrame>

            {Object.keys(reviewsSummary).length > 0 && (
              <div className="card" style={{ display: 'grid', gap: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Top-Rated Products</h2>
                <MobileDataFrame className="analytics-mobile-frame">
                  <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ minWidth: 400 }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Avg Rating</th>
                        <th>Reviews</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(reviewsSummary)
                        .sort((a, b) => (b[1].avg || 0) - (a[1].avg || 0))
                        .slice(0, 10)
                        .map(([itemId, data]) => {
                          const item = items.find((i) => i.id === itemId);
                          return (
                            <tr key={itemId}>
                              <td>{item?.name ?? 'Unknown'}</td>
                              <td>
                                <span style={{ color: '#fbbf24', fontWeight: 700 }}>
                                  {'★'.repeat(Math.round(Number(data.avg) || 0))}{'☆'.repeat(5 - Math.round(Number(data.avg) || 0))} {safeToFixed(data.avg, 1)}
                                </span>
                              </td>
                              <td>{data.count} reseña{data.count !== 1 ? 's' : ''}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  </div>
                </MobileDataFrame>
              </div>
            )}

            <div className="card" style={{ display: 'grid', gap: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Recent Employee Spending (last 30 orders)</h2>
              {recentOrders.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No orders yet.</p>
              ) : (
                <MobileDataFrame className="analytics-mobile-frame">
                  <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ minWidth: 600 }}>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Item</th>
                        <th>Points Spent</th>
                        <th>Status</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => {
                        const statusUi = getModeratorOrderStatusUi(order.status);
                        return (
                          <tr key={order.id}>
                            <td>{order.user?.name ?? 'Unknown'}</td>
                            <td>{order.meta?.itemName ?? order.item?.name ?? '—'}</td>
                            <td>{order.points_spent.toLocaleString()} pts</td>
                            <td><span className={`order-status ${statusUi.className}`}>{statusUi.label}</span></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{formatShortDate(order.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </MobileDataFrame>
              )}
            </div>
          </div>
        );
      })()}

      {activeTab === 'recycle_bin' && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div className="card" style={{ display: 'grid', gap: '1rem' }}>
            <h2 style={{ margin: 0 }}>Recycle Bin</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0 0 1rem', fontSize: '0.85rem' }}>
              Items deleted from the store stay here for 7 days. You can restore them if you made a mistake.
            </p>
            {items.filter(item => item.meta?.isDeleted).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>La papelera está vacía.</div>
            ) : (
              items.filter(item => item.meta?.isDeleted).map(item => (
                <div key={item.id} className="inventory-item-shell inventory-item-hidden">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem' }}>{item.name}</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                        <span>Eliminado</span>
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => promptRestoreItem(item)} disabled={inventoryBusy}>
                      Restaurar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {bulkEditorOpen && (() => {
        const activeItems = items.filter((item) => !item.meta?.isDeleted);
        const assignedCount = Object.keys(bulkColorMap).length;
        const readyUpdates = Object.entries(bulkColorMap).filter(([, color]) => bulkStockByColor[color].trim() !== '').length;

        return (
          <div className="modal-overlay" onClick={() => !bulkApplying && setBulkEditorOpen(false)}>
            <div className="store-modal-card bulk-editor-modal animate-scale-in" onClick={(e) => e.stopPropagation()}>
              <div className="store-modal-header">
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Layers size={18} /> Editor de Stock por Color</h3>
                <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  Asigna un color a cada producto y define el nuevo stock por color. Varios productos del mismo color reciben el mismo valor.
                </p>
              </div>

              {/* Color legend + stock inputs */}
              <div className="bulk-color-legend">
                {BULK_COLORS.map((c) => {
                  const countWithColor = Object.values(bulkColorMap).filter((v) => v === c.id).length;
                  return (
                    <div key={c.id} className="bulk-color-lane" style={{ borderColor: c.border, background: c.bg }}>
                      <div className="bulk-color-swatch" style={{ background: c.hex }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: c.hex, marginBottom: '0.3rem' }}>
                          {c.label} <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({countWithColor} producto{countWithColor !== 1 ? 's' : ''})</span>
                        </div>
                        <input
                          className="input"
                          type="number"
                          min="0"
                          placeholder="Stock nuevo…"
                          value={bulkStockByColor[c.id]}
                          onChange={(e) => setBulkStockByColor((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          style={{ width: '100%', height: 36, padding: '0 0.65rem', fontSize: '0.875rem' }}
                          disabled={countWithColor === 0}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Item list */}
              <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Productos — toca los puntos de color para asignar
              </div>
              <div className="bulk-item-list">
                {activeItems.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem 0' }}>No hay productos activos en la tienda.</p>
                ) : (
                  activeItems.map((item) => {
                    const assignedColor = bulkColorMap[item.id] as BulkColor | undefined;
                    const colorDef = assignedColor ? BULK_COLORS.find((c) => c.id === assignedColor) : undefined;
                    return (
                      <div key={item.id} className="bulk-item-row" style={{ borderColor: colorDef ? colorDef.border : undefined, background: colorDef ? colorDef.bg : undefined }}>
                        {/* Color dot cycle buttons */}
                        <div className="bulk-color-dots">
                          {BULK_COLORS.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`bulk-color-dot ${assignedColor === c.id ? 'bulk-color-dot-active' : ''}`}
                              style={{ background: assignedColor === c.id ? c.hex : 'rgba(255,255,255,0.1)', boxShadow: assignedColor === c.id ? `0 0 0 2px ${c.hex}` : undefined }}
                              title={c.label}
                              onClick={() =>
                                setBulkColorMap((prev) => {
                                  const next = { ...prev };
                                  if (next[item.id] === c.id) { delete next[item.id]; } else { next[item.id] = c.id; }
                                  return next;
                                })
                              }
                            />
                          ))}
                        </div>
                        <span className="bulk-item-name">{item.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: 'auto' }}>{item.meta?.category ?? 'Sin categoría'}</span>
                        <span className="bulk-item-stock">{getStockLabel(item)}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="store-modal-actions" style={{ marginTop: '1rem' }}>
                <button className="btn btn-ghost" onClick={() => { setBulkEditorOpen(false); setBulkColorMap({}); setBulkStockByColor({ red: '', yellow: '', green: '', blue: '' }); }} disabled={bulkApplying}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  disabled={bulkApplying || readyUpdates === 0}
                  onClick={() => void handleBulkStockApply()}
                >
                  {bulkApplying ? 'Aplicando...' : `Aplicar a ${readyUpdates} producto(s)`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {confirmModal && (
        <div className="modal-overlay" onClick={() => !confirmBusy && setConfirmModal(null)}>
          <div ref={confirmModalRef} className={`store-modal-card ${confirmModal.tone === 'danger' ? 'store-modal-card-danger' : ''}`} onClick={(event) => event.stopPropagation()}>
            <div className="store-modal-header">
              <h3 style={{ margin: 0 }}>{confirmModal.title}</h3>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{confirmModal.body}</p>
            </div>
            <div className="store-modal-actions">
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)} disabled={confirmBusy}>Cancel</button>
              <button className={`btn ${confirmModal.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`} onClick={() => void executeConfirmAction()} disabled={confirmBusy}>
                {confirmBusy ? 'Processing...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {noticeModal && (
        <div className="modal-overlay" onClick={() => setNoticeModal(null)}>
          <div
            ref={noticeModalRef}
            className={`store-modal-card ${
              noticeModal.tone === 'danger'
                ? 'store-modal-card-danger'
                : noticeModal.tone === 'success'
                  ? 'store-modal-card-success'
                  : ''
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="store-modal-header">
              <h3 style={{ margin: 0 }}>{noticeModal.title}</h3>
              <p style={{ margin: '0.45rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{noticeModal.body}</p>
            </div>
            <div className="store-modal-actions">
              <button className="btn btn-primary" onClick={() => setNoticeModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .order-status { display: inline-flex; align-items: center; gap: 0.38rem; padding: 0.3rem 0.8rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; white-space: nowrap; border: 1px solid transparent; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
        .status-pending { background: linear-gradient(135deg, rgba(249,115,22,0.18), rgba(245,158,11,0.12)); border-color: rgba(249,115,22,0.35); color: #fb923c; }
        .status-approved, .status-ready_for_pickup { background: linear-gradient(135deg, rgba(14,165,233,0.18), rgba(56,189,248,0.12)); border-color: rgba(56,189,248,0.28); color: #67e8f9; }
        .status-completed { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,197,94,0.12)); border-color: rgba(16,185,129,0.32); color: #6ee7b7; }
        .status-rejected, .status-cancelled { background: linear-gradient(135deg, rgba(239,68,68,0.18), rgba(190,24,93,0.1)); border-color: rgba(239,68,68,0.28); color: #fca5a5; }
        .order-filter-select { display: inline-flex; align-items: center; gap: 0.65rem; border: 1px solid var(--border-subtle); border-radius: 14px; padding: 0.55rem 0.85rem; background: var(--bg-card); }
        .order-filter-select span { font-size: 0.8rem; color: var(--text-muted); }
        .order-filter-select select { border: none; background: transparent; color: var(--text-primary); font: inherit; outline: none; }
        .mini-card { border-radius: 14px; border: 1px solid var(--border-subtle); background: var(--bg-card); padding: 0.85rem 0.95rem; }
        .mini-card span { display: block; color: var(--text-muted); font-size: 0.74rem; margin-bottom: 0.35rem; }
        .mini-card strong { font-size: 0.92rem; line-height: 1.4; }
        .low-stock-summary-card { border: 1px solid var(--border-subtle); text-align: left; cursor: pointer; transition: border-color 0.2s ease, transform 0.2s ease, background 0.2s ease; }
        .low-stock-summary-card:hover { border-color: rgba(245, 158, 11, 0.32); transform: translateY(-1px); }
        .low-stock-summary-card-active { border-color: rgba(245, 158, 11, 0.38); background: rgba(245, 158, 11, 0.08); }
        .low-stock-panel { border: 1px solid rgba(245, 158, 11, 0.16); background: linear-gradient(145deg, rgba(245, 158, 11, 0.08), rgba(16, 20, 37, 0.96)); }
        .low-stock-grid { display: grid; gap: 0.85rem; }
        .low-stock-item-card { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.9rem 1rem; border-radius: 16px; border: 1px solid var(--border-subtle); background: rgba(16, 20, 37, 0.74); }
        .low-stock-thumb { width: 52px; height: 52px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border-subtle); background: var(--bg-card); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .low-stock-inline-alert { display: inline-flex; align-items: center; gap: 0.45rem; margin-top: 0.55rem; color: #fbbf24; font-size: 0.8rem; line-height: 1.45; }
        .pill { display: inline-flex; align-items: center; gap: 0.45rem; border-radius: 999px; padding: 0.4rem 0.75rem; background: rgba(56,189,248,0.1); color: #38bdf8; font-size: 0.76rem; font-weight: 600; }
        .pill-danger, .danger-link { color: #ef4444; }
        .pill-danger { background: rgba(239,68,68,0.1); }
        .order-summary-strip { display: grid; gap: 0.25rem; margin-top: 1rem; padding: 0.8rem 0.9rem; border-radius: 14px; border: 1px solid rgba(124, 108, 255, 0.16); background: rgba(124, 108, 255, 0.08); }
        .order-summary-strip strong { font-size: 0.78rem; }
        .order-summary-strip span { color: var(--text-secondary); font-size: 0.82rem; line-height: 1.45; }
        .order-delete-button { padding: 0.4rem 0.7rem; font-size: 0.78rem; }
        .complete-order-button { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; border: 1px solid rgba(16, 185, 129, 0.3); box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25), inset 0 1px 0 rgba(255,255,255,0.15); transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
        .complete-order-button:hover:not(:disabled) { transform: translateY(-2px) scale(1.02); background: linear-gradient(135deg, #34d399 0%, #10b981 100%); box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255,255,255,0.2); border-color: rgba(16, 185, 129, 0.5); }
        .complete-order-button:active:not(:disabled) { transform: translateY(0) scale(0.98); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
        .store-modal-card { width: min(560px, calc(100vw - 2rem)); border-radius: 22px; padding: 1.25rem; background: rgba(16, 20, 37, 0.98); border: 1px solid var(--border-default); box-shadow: var(--shadow-card); }
        .store-modal-card-danger { border-color: rgba(239, 68, 68, 0.28); box-shadow: 0 20px 55px rgba(239, 68, 68, 0.15); }
        .store-modal-card-success { border-color: rgba(16, 185, 129, 0.28); box-shadow: 0 20px 55px rgba(16, 185, 129, 0.15); }
        .store-modal-header { margin-bottom: 1rem; }
        .store-modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap; }
        .file-input-row { display: flex; align-items: center; gap: 0.6rem; border: 1px dashed var(--border-default); border-radius: 14px; padding: 0.8rem 0.95rem; color: var(--text-secondary); background: var(--bg-base); }
        .file-input-row input { width: 100%; border: none; background: transparent; color: inherit; font: inherit; }
        .preview-box { border: 1px dashed var(--border-default); border-radius: 18px; background: var(--bg-base); overflow: hidden; min-height: 180px; }
        .preview-empty { width: 100%; height: 100%; min-height: 180px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
        .inventory-workspace { align-items: start; }
        .inventory-builder-panel,
        .inventory-list-panel { padding: 1.25rem; }
        .inventory-builder-panel {
          position: sticky;
          top: 0.75rem;
          align-self: start;
          overflow: visible !important;
          max-height: calc(100vh - 7.75rem) !important;
        }
        .inventory-list-panel {
          align-self: start;
          overflow: visible !important;
        }
        .inventory-builder-shell,
        .inventory-list-shell,
        .inventory-list-scroll,
        .inventory-builder-form { display: grid; gap: 1rem; align-content: start; }
        .inventory-builder-shell {
          min-height: 0;
          max-height: calc(100vh - 10.5rem);
          overflow-y: auto;
          padding-right: 0.2rem;
        }
        .inventory-panel-heading { display: flex; justify-content: space-between; gap: 0.75rem; align-items: flex-start; }
        .inventory-panel-copy { margin: 0.35rem 0 0; color: var(--text-muted); font-size: 0.82rem; line-height: 1.45; }
        .inventory-list-scroll { max-height: calc(100vh - 12rem); overflow-y: auto; padding-right: 0.2rem; }
        .inventory-draft-summary { display: grid; gap: 0.2rem; }
        .inventory-draft-summary strong { color: white; font-size: 0.94rem; }
        .inventory-draft-summary span { color: var(--text-secondary); font-size: 0.78rem; }
        .inventory-action-bar { margin-bottom: 0.25rem; }
        .inventory-builder-inline { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
        .inventory-builder-preview { min-height: 220px; }
        .inventory-item-shell { border: 1px solid var(--border-subtle); border-radius: 16px; padding: 1rem; display: grid; gap: 1rem; background: var(--bg-card); }
        .inventory-item-hidden { opacity: 0.6; filter: grayscale(0.85); }
        .inventory-visibility-stack { display: grid; justify-items: end; gap: 0.55rem; }
        .inventory-visibility-badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0.35rem 0.75rem; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
        .inventory-visibility-badge-live { background: rgba(34,197,94,0.12); color: #86efac; border: 1px solid rgba(34,197,94,0.22); }
        .inventory-visibility-badge-hidden { background: rgba(239,68,68,0.12); color: #fca5a5; border: 1px solid rgba(239,68,68,0.22); }
        .inventory-visibility-button { min-width: 162px; justify-content: center; }
        .inline-panel { border: 1px solid var(--border-default); border-radius: 18px; padding: 1rem; background: rgba(16, 20, 37, 0.92); }
        .inline-panel-danger { border-color: rgba(239,68,68,0.24); }
        .inline-panel-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; margin-bottom: 1rem; }
        .line-items-shell { display: grid; gap: 0.75rem; margin-top: 1rem; }
        .line-item-row { display: flex; justify-content: space-between; gap: 1rem; align-items: center; padding: 0.8rem 0.9rem; border-radius: 14px; background: var(--bg-card); border: 1px solid var(--border-subtle); }
        .line-item-copy { margin-top: 0.3rem; color: var(--text-muted); font-size: 0.78rem; }
        .line-item-stock { color: var(--text-secondary); font-size: 0.8rem; text-align: right; }
        .line-item-stock-alert { color: #fca5a5; }
        .preset-manager-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
        .preset-card { border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-elevated); padding: 1rem; display: grid; gap: 0.9rem; }
        .preset-card-active { border-color: var(--brand-primary-light); box-shadow: 0 0 0 1px rgba(124,108,255,0.4); }
        .preset-load-button { width: 100%; border: none; background: transparent; color: inherit; text-align: left; display: grid; gap: 0.35rem; cursor: pointer; }
        .preset-load-button span { color: var(--text-muted); font-size: 0.76rem; }
        .preset-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .preset-empty { border: 1px dashed var(--border-default); border-radius: 16px; padding: 1rem; color: var(--text-muted); }
        .bulk-editor-modal { width: min(680px, calc(100vw - 1.5rem)); max-width: none; }
        .bulk-color-legend { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.65rem; margin-bottom: 1.25rem; }
        .bulk-color-lane { display: flex; align-items: center; gap: 0.65rem; border: 1px solid; border-radius: 14px; padding: 0.65rem 0.75rem; }
        .bulk-color-swatch { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; }
        .bulk-item-list { display: grid; gap: 0.45rem; max-height: 300px; overflow-y: auto; border: 1px solid var(--border-subtle); border-radius: 14px; padding: 0.5rem; }
        .bulk-item-row { display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.75rem; border-radius: 10px; border: 1px solid transparent; transition: background 0.15s ease, border-color 0.15s ease; }
        .bulk-color-dots { display: flex; gap: 0.3rem; flex-shrink: 0; }
        .bulk-color-dot { width: 16px; height: 16px; border-radius: 50%; border: none; cursor: pointer; transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .bulk-color-dot:hover { transform: scale(1.25); }
        .bulk-color-dot-active { transform: scale(1.3); }
        .bulk-item-name { font-weight: 600; font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
        .bulk-item-stock { font-size: 0.78rem; color: var(--brand-primary-light); font-weight: 700; white-space: nowrap; }
        .analytics-charts-grid { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); }
        @media (max-width: 900px) { .analytics-charts-grid { grid-template-columns: 1fr; } }
        @media (max-width: 1279px) { .inventory-builder-panel { position: static; max-height: none !important; overflow: visible !important; } .inventory-builder-shell { max-height: none; overflow: visible; padding-right: 0; } }
        @media (max-width: 980px) { .inventory-columns { grid-template-columns: 1fr !important; } }
        @media (max-width: 720px) { .inventory-builder-inline { grid-template-columns: 1fr; } }
        @media (max-width: 720px) { .line-item-row, .low-stock-item-card { flex-direction: column; align-items: flex-start; } .line-item-stock { text-align: left; } }
      `}</style>
    </div>
  );
}

export type { ModeratorStoreOrder };
