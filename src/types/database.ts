// ============================================
// Outplex Project — Database Types
// ============================================

export type UserRole = 'employee' | 'staff' | 'moderator' | 'moderator_a1' | 'moderator_b1' | 'admin';
export type SlotStatus = 'available' | 'claimed' | 'cancelled';
export type BatchStatus = 'draft' | 'scheduled' | 'published';
export type RaffleStatus = 'upcoming' | 'live' | 'completed';
export type OrderStatus = 'pending' | 'approved' | 'ready_for_pickup' | 'rejected' | 'completed' | 'cancelled';
export type NotificationType = 'system' | 'raffle' | 'ot' | 'store' | 'support';
export type SupportDepartment = 'it' | 'moderator';
export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved';
export type AppShellStatus = 'live' | 'idle';
export type StorePickupMode = 'immediate' | 'scheduled';
export type BroadcastNotificationStatus = 'draft' | 'scheduled' | 'published';
export type BroadcastNotificationCategory = 'availability' | 'stock' | 'site_visit' | 'general';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published';
export type AnnouncementBlockType = 'text' | 'image' | 'slider' | 'pdf' | 'gif';
export type AnnouncementPdfDisplayMode = 'slider' | 'download_only';
export type AnnouncementDurationDays = 1 | 3 | 5 | 7 | 15 | 30 | 60;

export interface StoreThemePresetConfig {
  id: string;
  name: string;
  backgroundImage?: string | null;
  headline?: string;
  subheading?: string;
  overlayOpacity?: number;
}

export interface StoreThemeConfig {
  backgroundImage?: string | null;
  headline?: string;
  subheading?: string;
  overlayOpacity?: number;
  activePresetId?: string | null;
  presets?: StoreThemePresetConfig[];
  empCartBannerImage?: string | null;
}

export interface StoreItemMeta {
  category?: string | null;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

export interface StoreOrderStatusHistoryEntry {
  status: OrderStatus;
  at: string;
  note?: string | null;
  updatedBy?: string | null;
}

export interface StoreOrderLineItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPoints: number;
  imageUrl?: string | null;
  description?: string | null;
  category?: string | null;
}

export interface StoreOrderMeta {
  quantity: number;
  unitPoints: number;
  itemName: string;
  itemImageUrl?: string | null;
  itemDescription?: string | null;
  lineItems?: StoreOrderLineItem[];
  buyerName?: string | null;
  buyerEmail?: string | null;
  buyerEmployeeId?: string | null;
  orderLabel?: string | null;
  pickupMode?: StorePickupMode | null;
  pickupDate?: string | null;
  pickupTime?: string | null;
  pickupDeadline?: string | null;
  pickupNote?: string | null;
  denialReason?: string | null;
  hiddenFromModerators?: boolean;
  moderatorArchivedAt?: string | null;
  statusHistory?: StoreOrderStatusHistoryEntry[];
}

export type AppSettingValue =
  | string
  | number
  | boolean
  | null
  | StoreThemeConfig
  | StoreItemMeta
  | StoreOrderMeta
  | Record<string, unknown>
  | unknown[];

export interface User {
  id: string;
  slack_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: UserRole;
  employee_id: string | null;
  supervisor: string | null;
  supervisor_id: string | null;
  department: string | null;
  points: number;
  is_approved: boolean;
  role_revoked_at: string | null;
  created_at: string;
}

export interface AppSetting {
  id: string;
  key: string;
  value: AppSettingValue;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  sender_id?: string | null;
  broadcast_notification_id?: string | null;
  title: string;
  message: string;
  is_read: boolean;
  type: NotificationType | string;
  created_at: string;
}

export interface BroadcastNotification {
  id: string;
  title: string;
  message: string;
  category: BroadcastNotificationCategory | string;
  status: BroadcastNotificationStatus | string;
  publish_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  author?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
}

export interface AnnouncementTextBlock {
  id: string;
  type: 'text';
  heading?: string | null;
  body: string;
}

export interface AnnouncementImageBlock {
  id: string;
  type: 'image';
  heading?: string | null;
  imageUrl: string;
  caption?: string | null;
  body?: string | null;
}

export interface AnnouncementSlide {
  id: string;
  imageUrl: string;
  caption?: string | null;
  body?: string | null;
}

export interface AnnouncementSliderBlock {
  id: string;
  type: 'slider';
  heading?: string | null;
  body?: string | null;
  slides: AnnouncementSlide[];
}

export interface AnnouncementPdfBlock {
  id: string;
  type: 'pdf';
  heading?: string | null;
  body?: string | null;
  fileUrl: string;
  fileName?: string | null;
  displayMode: AnnouncementPdfDisplayMode;
  previewImages?: string[] | null;
}

export interface AnnouncementGifBlock {
  id: string;
  type: 'gif';
  heading?: string | null;
  caption?: string | null;
  gifUrl: string;
  gifId?: string | null;
}

export type AnnouncementBlock =
  | AnnouncementTextBlock
  | AnnouncementImageBlock
  | AnnouncementSliderBlock
  | AnnouncementPdfBlock
  | AnnouncementGifBlock;

export interface CompanyAnnouncement {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content: AnnouncementBlock[];
  duration_days: AnnouncementDurationDays | number;
  status: AnnouncementStatus | string;
  publish_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  author?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
}

export interface EmployeeAnnouncement {
  id: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  content: AnnouncementBlock[];
  duration_days: AnnouncementDurationDays | number;
  status: AnnouncementStatus | string;
  publish_at: string | null;
  expires_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  author?: Pick<User, 'id' | 'name' | 'avatar_url' | 'role'> | null;
}

export interface OTSlot {
  id: string;
  spot_id: string | null;       // Original Spot ID from CSV (e.g. "17594")
  lob: string | null;           // Line of Business (e.g. "NYT Universal Voice")
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  duration_hrs: number;
  shift_label: string | null;
  status: SlotStatus;
  csv_status: string | null;    // Original status from CSV ("Pending")
  claimed_by: string | null;
  claimed_at: string | null;
  published_by: string | null;
  batch_id: string | null;
  created_at: string;
  // Joined fields
  claimedByUser?: Pick<User, 'id' | 'name' | 'avatar_url' | 'employee_id'>;
  batch?: Pick<OTBatch, 'id' | 'name' | 'status' | 'published_at'>;
}

export interface OTBatch {
  id: string;
  name: string;
  status: BatchStatus;
  csv_data: CSVRow[] | null;
  uploaded_by: string | null;
  published_at: string | null;
  created_at: string;
  // Joined
  uploadedByUser?: Pick<User, 'id' | 'name'>;
}

export interface CSVRow {
  id?: string;
  spot_id?: string;    // OutPLEX: "Spot ID" column
  lob?: string;        // OutPLEX: "LOB" column (e.g. "NYT Universal Voice")
  date: string;
  start_time: string;
  end_time: string;
  duration_hrs?: number;
  shift_label?: string;
  csv_status?: string; // OutPLEX: "Status" column (e.g. "Pending")
  [key: string]: string | number | undefined;
}

export interface Raffle {
  id: string;
  title: string;
  description: string | null;
  prize_image: string | null;
  draw_date: string | null;
  status: RaffleStatus;
  winner_id: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  winner?: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface RaffleEntry {
  id: string;
  raffle_id: string;
  user_id: string;
  user?: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  points_cost: number;
  image_url: string | null;
  stock: number;
  is_active: boolean;
  created_at: string;
  meta?: StoreItemMeta | null;
}

export interface StoreOrder {
  id: string;
  item_id: string;
  user_id: string;
  points_spent: number;
  status: OrderStatus;
  created_at: string;
  item?: StoreItem;
  user?: Pick<User, 'id' | 'name' | 'employee_id' | 'email'>;
  meta?: StoreOrderMeta | null;
}

export interface StoreReview {
  id: string;
  item_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  user?: Pick<User, 'id' | 'name'>;
}

export interface StoreFavorite {
  id: string;
  item_id: string;
  user_id: string;
  created_at: string;
}

// ============================================
// Ledger & Tickets (Phase 3)
// ============================================

export interface PointsLedger {
  id: string;
  user_id: string;
  points_added: number;
  granted_by?: string;
  reason?: string;
  created_at: string;
}

export interface LedgerEntry extends PointsLedger {
  user?: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url' | 'role'> | null;
  actor?: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url' | 'role'> | null;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  department: SupportDepartment | string;
  subject?: string | null;
  message: string;
  status: SupportTicketStatus | string;
  created_at: string;
  user?: Pick<User, 'id' | 'name' | 'email'>;
}

export interface AppShellBadge {
  status: AppShellStatus;
  label: string;
  description?: string;
}

// ============================================
// Employee Store (Phase 2)
// ============================================

export type EmployeeStoreRequestStatus = 'pending' | 'approved' | 'rejected';
export type EmployeeStoreStatus = 'active' | 'paused' | 'closed' | 'scheduled' | 'suspended';
export type EmployeeStoreOrderStatus = 'pending' | 'ready_for_pickup' | 'completed' | 'cancelled';
export type EmployeeStoreContactMethod = 'slack' | 'whatsapp' | 'email' | 'none';
export type EmployeeStorePickupMode = 'immediate' | 'scheduled';

export interface UserContactPreferences {
  user_id: string;
  whatsapp_number: string | null;
  whatsapp_opt_in: boolean;
  whatsapp_opt_in_at: string | null;
  updated_at: string;
}

export interface EmployeeStoreRequest {
  id: string;
  user_id: string;
  store_name: string;
  description: string;
  category: string | null;
  policy_accepted: boolean;
  status: EmployeeStoreRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  user?: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url'>;
  reviewer?: Pick<User, 'id' | 'name'> | null;
}

export interface EmployeeStore {
  id: string;
  owner_id: string;
  request_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  banner_image: string | null;
  logo_image: string | null;
  accent_color: string | null;
  status: EmployeeStoreStatus;
  approved_by: string | null;
  approved_at: string;
  is_open?: boolean;
  first_product_published_at?: string | null;
  operating_hours?: Record<string, { isOpen: boolean; open: string; close: string }> | null;
  suspend_reason?: string | null;
  created_at: string;
  updated_at: string;
  owner?: Pick<User, 'id' | 'name' | 'email' | 'avatar_url' | 'slack_id'>;
  products?: EmployeeStoreProduct[];
}

export interface EmployeeStoreProduct {
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
  is_suspended?: boolean;
  suspend_reason?: string | null;
  status?: 'pending' | 'active' | 'rejected' | 'out_of_stock' | 'draft';
  created_at: string;
  updated_at: string;
  store?: Pick<EmployeeStore, 'id' | 'slug' | 'name' | 'owner_id'>;
  reviews?: EmployeeStoreProductReview[];
}

export interface EmployeeStoreProductReview {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  created_at: string;
  user?: Pick<User, 'id' | 'name' | 'avatar_url'>;
}

export interface EmployeeStoreOrderStatusHistoryEntry {
  status: EmployeeStoreOrderStatus;
  at: string;
  note?: string | null;
  updatedBy?: string | null;
}

export interface EmployeeStoreOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  name_snapshot: string;
  image_snapshot: string | null;
  unit_price_dop: number;
  quantity: number;
  created_at: string;
}

export interface EmployeeStoreOrder {
  id: string;
  store_id: string;
  seller_id: string;
  buyer_id: string;
  total_dop: number;
  status: EmployeeStoreOrderStatus;
  contact_method: EmployeeStoreContactMethod;
  pickup_mode: EmployeeStorePickupMode | null;
  pickup_at: string | null;
  pickup_deadline: string | null;
  pickup_note: string | null;
  buyer_notes: string | null;
  seller_notes: string | null;
  status_history: EmployeeStoreOrderStatusHistoryEntry[];
  created_at: string;
  updated_at: string;
  buyer?: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url' | 'slack_id'>;
  seller?: Pick<User, 'id' | 'name' | 'email' | 'employee_id' | 'avatar_url' | 'slack_id'>;
  store?: Pick<EmployeeStore, 'id' | 'slug' | 'name'>;
  items?: EmployeeStoreOrderItem[];
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// ============================================
// Realtime Payload Types
// ============================================

export interface RealtimeSlotPayload {
  new: OTSlot;
  old: Partial<OTSlot>;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
}

// ============================================
// Dashboard Stats
// ============================================

export interface DashboardStats {
  hoursThisMonth: number;
  hoursLastMonth: number;
  claimedSlots: number;
  upcomingSlots: number;
  points: number;
}

// ============================================
// Breaks & Lunches System (NYT Schedule)
// ============================================

export type ScheduleBatchStatus = 'draft' | 'scheduled' | 'published';
export type ScheduleSourceType = 'csv' | 'manual' | 'live' | 'live_excel';
export type BreakEventType = 'first_break' | 'lunch' | 'second_break' | 'third_break' | 'bath_time';
export type HourType = 'regular' | 'ot';
export type DelayReason = 'due_a_call' | 'due_a_meeting' | 'other';

export interface PendingReviewAgent {
  rawName: string;
  rowData: Record<string, unknown>;
}

export interface ScheduleUploadBatch {
  id: string;
  name: string;
  schedule_date: string;            // YYYY-MM-DD
  source_type: ScheduleSourceType;
  status: ScheduleBatchStatus;
  scheduled_publish_at: string | null;
  published_at: string | null;
  uploaded_by: string | null;
  file_hash: string | null;
  employee_count: number;
  pending_review: PendingReviewAgent[];
  created_at: string;
  updated_at: string;
  uploader?: Pick<User, 'id' | 'name' | 'avatar_url'> | null;
}

export interface DailySchedule {
  id: string;
  batch_id: string | null;
  employee_id: string;
  schedule_date: string;            // YYYY-MM-DD
  shift_start: string | null;      // HH:MM (Santo Domingo local)
  shift_end: string | null;
  shift_length_hrs: number | null;
  first_break_start: string | null;
  first_break_end: string | null;
  lunch_start: string | null;
  lunch_end: string | null;
  second_break_start: string | null;
  second_break_end: string | null;
  third_break_start: string | null; // null = Not Eligible
  third_break_end: string | null;
  is_ot_day: boolean;
  hour_type: HourType;
  lob: string | null;
  supervisor_name: string | null;
  supervisor_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  employee?: Pick<User, 'id' | 'name' | 'employee_id' | 'avatar_url'> | null;
  logs?: TimeLogAudit[];
}

export interface TimeLogAudit {
  id: string;
  daily_schedule_id: string | null;
  employee_id: string;
  event_type: BreakEventType;
  scheduled_start: string | null;   // HH:MM (Santo Domingo local, from daily_schedules)
  actual_start: string | null;      // ISO timestamp (UTC, convert for display)
  actual_end: string | null;        // ISO timestamp (UTC)
  variance_minutes: number | null;  // positive = late, negative = early
  delay_reason: DelayReason | null;
  is_open: boolean;
  is_unpaid: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  employee?: Pick<User, 'id' | 'name' | 'avatar_url'> | null;
}

/** Row shape returned by v_schedule_variance view */
export interface ScheduleVarianceRow {
  employee_id: string;
  employee_name: string;
  opx_id: string | null;
  lob: string | null;
  supervisor_name: string | null;
  schedule_date: string;
  shift_start: string | null;
  shift_end: string | null;
  hour_type: HourType;
  log_id: string;
  event_type: BreakEventType;
  scheduled_start: string | null;
  actual_start: string | null;
  actual_end: string | null;
  variance_minutes: number | null;
  delay_reason: DelayReason | null;
  is_unpaid: boolean;
  actual_start_local: string | null;  // Converted to Santo Domingo tz
  actual_end_local: string | null;
}
