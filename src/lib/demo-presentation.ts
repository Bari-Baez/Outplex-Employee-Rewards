import {
  appendOrderStatus,
  buildInitialStoreOrderMeta,
  buildStoreOrderLineItem,
  getStoreItemMetaKey,
  getStoreOrderMetaKey,
  STORE_ITEM_META_PREFIX,
  STORE_ORDER_META_PREFIX,
  STORE_THEME_KEY,
} from '@/lib/store-helpers';
import { getCurrentOTDateTime, shiftOTDate } from '@/lib/ot';
import { getOTClaimMetaKey } from '@/lib/ot-claim-meta';
import {
  persistRaffleRuntime,
  prepareRuntimeForCreate,
} from '@/lib/raffles/server';
import { RAFFLE_RUNTIME_KEY_PREFIX, type RaffleFormState, type RaffleParticipant } from '@/lib/raffles/runtime';
import type { NotificationType, StoreThemeConfig, User, UserRole } from '@/types/database';
import { createServiceClient } from '@/lib/supabase/server';

type ServiceSupabaseClient = Awaited<ReturnType<typeof createServiceClient>>;

export const DEMO_PASSWORD = 'password123';

export const PRESENTATION_DEMO_USERS = [
  {
    email: 'it@outplex.test',
    role: 'admin' as const,
    name: 'Ava Bennett',
    employeeId: 'ADM001',
    department: 'IT',
    defaultPoints: 12000,
  },
  {
    email: 'a1@outplex.test',
    role: 'moderator_a1' as const,
    name: 'Maya Ortiz',
    employeeId: 'MOD001',
    department: 'Operations',
    defaultPoints: 5400,
  },
  {
    email: 'b1@outplex.test',
    role: 'moderator_b1' as const,
    name: 'Jordan Lee',
    employeeId: 'MOD002',
    department: 'Operations',
    defaultPoints: 4700,
  },
  {
    email: 'employee@outplex.test',
    role: 'employee' as const,
    name: 'Bari Baez',
    employeeId: 'EMP001',
    department: 'NYT VOICE',
    defaultPoints: 9810,
  },
] as const;

const DEMO_EMAIL_SET = new Set<string>(PRESENTATION_DEMO_USERS.map((user) => user.email));

export interface PresentationDirectoryUser {
  id: string;
  name: string;
  email: string;
  employee_id: string | null;
  role: UserRole;
  points: number;
  department: string | null;
  isDemo: boolean;
}

export interface PresentationStatus {
  users: PresentationDirectoryUser[];
  demoUsers: PresentationDirectoryUser[];
  counts: {
    users: number;
    storeItems: number;
    storeOrders: number;
    otSlots: number;
    claimedOtSlots: number;
    otBatches: number;
    raffles: number;
    notifications: number;
    pointsLedger: number;
    supportTickets: number;
    lowStockItems: number;
  };
  defaultPassword: string;
}

type DemoActionResult = {
  message: string;
  status: PresentationStatus;
};

type SeedUserMap = Record<'admin' | 'moderator_a1' | 'moderator_b1' | 'employee', PresentationDirectoryUser>;

function startOfMinute(date: Date) {
  const next = new Date(date);
  next.setSeconds(0, 0);
  return next;
}

function shiftIso(base: Date, { days = 0, hours = 0, minutes = 0 }: { days?: number; hours?: number; minutes?: number }) {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  next.setHours(next.getHours() + hours);
  next.setMinutes(next.getMinutes() + minutes);
  return next.toISOString();
}

function byRole(users: PresentationDirectoryUser[]): SeedUserMap {
  const admin = users.find((user) => user.role === 'admin' && user.isDemo);
  const moderator = users.find((user) => (user.role === 'moderator_a1' || (user.role as string) === 'moderator') && user.isDemo);
  const moderatorB1 = users.find((user) => user.role === 'moderator_b1' && user.isDemo);
  const employee = users.find((user) => user.role === 'employee' && user.isDemo);

  if (!admin || !moderator || !moderatorB1 || !employee) {
    throw new Error('Demo users are not ready yet.');
  }

  return { admin, moderator_a1: moderator, moderator_b1: moderatorB1, employee };
}

async function countRows(serviceClient: ServiceSupabaseClient, table: string) {
  const { count, error } = await serviceClient.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function removeAllRows(serviceClient: ServiceSupabaseClient, table: string) {
  const { error } = await serviceClient.from(table).delete().not('id', 'is', null);
  if (error) {
    throw new Error(`Unable to clear ${table}: ${error.message}`);
  }
}

async function deletePresentationSettings(serviceClient: ServiceSupabaseClient) {
  const { data: settings, error } = await serviceClient.from('app_settings').select('key');
  if (error) {
    throw new Error(error.message);
  }

  const keysToDelete = (settings ?? [])
    .map((setting) => setting.key)
    .filter(
      (key) =>
        key === STORE_THEME_KEY ||
        key.startsWith(STORE_ORDER_META_PREFIX) ||
        key.startsWith(STORE_ITEM_META_PREFIX) ||
        key.startsWith(RAFFLE_RUNTIME_KEY_PREFIX) ||
        key.startsWith('ot_claim_meta:'),
    );

  if (keysToDelete.length === 0) {
    return;
  }

  for (let index = 0; index < keysToDelete.length; index += 100) {
    const chunk = keysToDelete.slice(index, index + 100);
    const { error: deleteError } = await serviceClient.from('app_settings').delete().in('key', chunk);
    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }
}

async function updateDemoUserRow(
  serviceClient: ServiceSupabaseClient,
  payload: {
    id: string;
    name: string;
    email: string;
    employee_id: string;
    role: UserRole;
    points: number;
    department: string;
  },
) {
  const { error } = await serviceClient.from('users').upsert(
    {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      employee_id: payload.employee_id,
      role: payload.role,
      points: payload.points,
      department: payload.department,
      slack_id: payload.employee_id.toLowerCase(),
      supervisor: null,
      avatar_url: null,
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export async function ensurePresentationDemoUsers(serviceClient: ServiceSupabaseClient) {
  const { data: authUsersResult, error: authUserError } = await serviceClient.auth.admin.listUsers();
  if (authUserError) {
    throw new Error(authUserError.message);
  }

  const authUsers = authUsersResult.users ?? [];
  const authByEmail = new Map(authUsers.map((user) => [String(user.email ?? '').toLowerCase(), user]));
  const ensuredUsers: PresentationDirectoryUser[] = [];

  for (const demoUser of PRESENTATION_DEMO_USERS) {
    const existingAuthUser = authByEmail.get(demoUser.email.toLowerCase());
    let authUserId = existingAuthUser?.id;

    if (!authUserId) {
      const { data: createdUser, error: createError } = await serviceClient.auth.admin.createUser({
        email: demoUser.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: demoUser.name },
      });
      if (createError || !createdUser.user) {
        throw new Error(createError?.message ?? `Unable to create ${demoUser.email}.`);
      }
      authUserId = createdUser.user.id;
    } else {
      const { error: updateError } = await serviceClient.auth.admin.updateUserById(authUserId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { name: demoUser.name },
      });
      if (updateError) {
        throw new Error(updateError.message);
      }
    }

    await updateDemoUserRow(serviceClient, {
      id: authUserId,
      email: demoUser.email,
      name: demoUser.name,
      employee_id: demoUser.employeeId,
      role: demoUser.role,
      points: demoUser.defaultPoints,
      department: demoUser.department,
    });

    ensuredUsers.push({
      id: authUserId,
      name: demoUser.name,
      email: demoUser.email,
      employee_id: demoUser.employeeId,
      role: demoUser.role,
      points: demoUser.defaultPoints,
      department: demoUser.department,
      isDemo: true,
    });
  }

  return ensuredUsers;
}

export async function loadPresentationStatus(serviceClient: ServiceSupabaseClient): Promise<PresentationStatus> {
  const [{ data: users, error: userError }, { data: items, error: itemError }, { data: otSlots, error: slotError }] = await Promise.all([
    serviceClient
      .from('users')
      .select('id, name, email, employee_id, role, points, department')
      .order('name', { ascending: true }),
    serviceClient.from('store_items').select('id, stock'),
    serviceClient.from('ot_slots').select('id, status'),
  ]);

  if (userError) {
    throw new Error(userError.message);
  }
  if (itemError) {
    throw new Error(itemError.message);
  }
  if (slotError) {
    throw new Error(slotError.message);
  }

  const [storeOrders, otBatches, raffles, notifications, pointsLedger, supportTickets] = await Promise.all([
    countRows(serviceClient, 'store_orders'),
    countRows(serviceClient, 'ot_batches'),
    countRows(serviceClient, 'raffles'),
    countRows(serviceClient, 'notifications'),
    countRows(serviceClient, 'points_ledger'),
    countRows(serviceClient, 'support_tickets'),
  ]);

  const directory = (users ?? []).map((user) => ({
    ...user,
    email: user.email ?? '',
    points: Number(user.points ?? 0),
    isDemo: DEMO_EMAIL_SET.has(String(user.email ?? '').toLowerCase()),
  }));

  return {
    users: directory,
    demoUsers: directory.filter((user) => user.isDemo),
    counts: {
      users: directory.length,
      storeItems: items?.length ?? 0,
      storeOrders,
      otSlots: otSlots?.length ?? 0,
      claimedOtSlots: (otSlots ?? []).filter((slot) => slot.status === 'claimed').length,
      otBatches,
      raffles,
      notifications,
      pointsLedger,
      supportTickets,
      lowStockItems: (items ?? []).filter((item) => item.stock >= 0 && item.stock <= 2).length,
    },
    defaultPassword: DEMO_PASSWORD,
  };
}

export async function resetPresentationData(serviceClient: ServiceSupabaseClient) {
  await Promise.all([
    removeAllRows(serviceClient, 'notifications'),
    removeAllRows(serviceClient, 'support_tickets'),
    removeAllRows(serviceClient, 'points_ledger'),
    removeAllRows(serviceClient, 'raffle_entries'),
  ]);

  await Promise.all([
    removeAllRows(serviceClient, 'raffles'),
    removeAllRows(serviceClient, 'ot_slots'),
    removeAllRows(serviceClient, 'store_orders'),
  ]);

  await Promise.all([
    removeAllRows(serviceClient, 'ot_batches'),
    removeAllRows(serviceClient, 'store_items'),
  ]);

  await deletePresentationSettings(serviceClient);

  const demoUsers = await ensurePresentationDemoUsers(serviceClient);
  for (const demoUser of demoUsers) {
    const { error } = await serviceClient
      .from('users')
      .update({ points: 0 })
      .eq('id', demoUser.id);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function seedStore(serviceClient: ServiceSupabaseClient, users: SeedUserMap, now: Date) {
  const currentDate = getCurrentOTDateTime(now).date;
  const storeTheme: StoreThemeConfig = {
    backgroundImage: '/demo/store-hero.svg',
    headline: 'NYT Desk Collection',
    subheading: 'Everyday rewards inspired by the New York newsroom and built for high performers.',
    overlayOpacity: 0.74,
    activePresetId: 'nyt-presentation',
    presets: [
      {
        id: 'nyt-presentation',
        name: 'NYT Presentation',
        backgroundImage: '/demo/store-hero.svg',
        headline: 'NYT Desk Collection',
        subheading: 'Everyday rewards inspired by the New York newsroom and built for high performers.',
        overlayOpacity: 0.74,
      },
    ],
  };

  const { error: themeError } = await serviceClient.from('app_settings').upsert(
    { key: STORE_THEME_KEY, value: storeTheme },
    { onConflict: 'key' },
  );
  if (themeError) {
    throw new Error(themeError.message);
  }

  const { data: items, error: itemError } = await serviceClient
    .from('store_items')
    .insert([
      {
        name: 'Morning Brief Mug',
        description: 'Ceramic mug inspired by the NYT morning briefing desk.',
        points_cost: 1800,
        stock: 8,
        image_url: '/demo/products/morning-brief-mug.svg',
        is_active: true,
      },
      {
        name: 'Crossword Notes Set',
        description: 'Hardcover notebook set for meeting notes, planning, and crossword breaks.',
        points_cost: 1200,
        stock: 2,
        image_url: '/demo/products/crossword-notes.svg',
        is_active: true,
      },
      {
        name: 'Audio Desk Tumbler',
        description: 'Double-wall tumbler styled for long NYT audio coverage shifts.',
        points_cost: 2400,
        stock: 5,
        image_url: '/demo/products/audio-desk-tumbler.svg',
        is_active: true,
      },
    ])
    .select('*');

  if (itemError || !items) {
    throw new Error(itemError?.message ?? 'Unable to seed store items.');
  }

  const itemByName = new Map(items.map((item) => [item.name, item]));
  const mug = itemByName.get('Morning Brief Mug');
  const notes = itemByName.get('Crossword Notes Set');
  const tumbler = itemByName.get('Audio Desk Tumbler');

  if (!mug || !notes || !tumbler) {
    throw new Error('Store seed items were not created correctly.');
  }

  const { error: itemMetaError } = await serviceClient.from('app_settings').upsert(
    [
      { key: getStoreItemMetaKey(mug.id), value: { category: 'NYT Desk Essentials' } },
      { key: getStoreItemMetaKey(notes.id), value: { category: 'NYT Desk Essentials' } },
      { key: getStoreItemMetaKey(tumbler.id), value: { category: 'NYT Audio Team' } },
    ],
    { onConflict: 'key' },
  );
  if (itemMetaError) {
    throw new Error(itemMetaError.message);
  }

  const orderCreatedAt = [
    shiftIso(now, { days: -1, hours: -3 }),
    shiftIso(now, { days: -4, hours: -2 }),
    shiftIso(now, { hours: -6 }),
    shiftIso(now, { days: -2, hours: -5 }),
  ];

  const { data: orders, error: orderError } = await serviceClient
    .from('store_orders')
    .insert([
      {
        item_id: mug.id,
        user_id: users.employee.id,
        points_spent: 4200,
        status: 'pending',
        created_at: orderCreatedAt[0],
      },
      {
        item_id: tumbler.id,
        user_id: users.employee.id,
        points_spent: 2400,
        status: 'completed',
        created_at: orderCreatedAt[1],
      },
      {
        item_id: tumbler.id,
        user_id: users.moderator_a1.id,
        points_spent: 3600,
        status: 'ready_for_pickup',
        created_at: orderCreatedAt[2],
      },
      {
        item_id: notes.id,
        user_id: users.admin.id,
        points_spent: 1200,
        status: 'cancelled',
        created_at: orderCreatedAt[3],
      },
    ])
    .select('id, created_at');

  if (orderError || !orders) {
    throw new Error(orderError?.message ?? 'Unable to seed store orders.');
  }

  const employeePendingItems = [
    buildStoreOrderLineItem(mug, 1),
    buildStoreOrderLineItem(notes, 2),
  ];
  const employeeCompletedItems = [buildStoreOrderLineItem(tumbler, 1)];
  const moderatorPickupItems = [
    buildStoreOrderLineItem(tumbler, 1),
    buildStoreOrderLineItem(notes, 1),
  ];
  const adminCancelledItems = [buildStoreOrderLineItem(notes, 1)];

  let employeePendingMeta = buildInitialStoreOrderMeta(employeePendingItems, orderCreatedAt[0], {
    name: users.employee.name,
    email: users.employee.email,
    employeeId: users.employee.employee_id,
  });
  employeePendingMeta = appendOrderStatus(employeePendingMeta, 'pending', 'Bundle submitted for review.', users.employee.id);

  let employeeCompletedMeta = buildInitialStoreOrderMeta(employeeCompletedItems, orderCreatedAt[1], {
    name: users.employee.name,
    email: users.employee.email,
    employeeId: users.employee.employee_id,
  });
  employeeCompletedMeta = appendOrderStatus(employeeCompletedMeta, 'approved', 'Fulfillment approved by moderator.', users.moderator_a1.id);
  employeeCompletedMeta = appendOrderStatus(employeeCompletedMeta, 'ready_for_pickup', 'Ready at the operations desk.', users.moderator_a1.id);
  employeeCompletedMeta = appendOrderStatus(employeeCompletedMeta, 'completed', 'Picked up by the employee.', users.moderator_a1.id);

  let moderatorPickupMeta = buildInitialStoreOrderMeta(moderatorPickupItems, orderCreatedAt[2], {
    name: users.moderator_a1.name,
    email: users.moderator_a1.email,
    employeeId: users.moderator_a1.employee_id,
  });
  moderatorPickupMeta = appendOrderStatus(moderatorPickupMeta, 'approved', 'Approved and packed for pickup.', users.admin.id);
  moderatorPickupMeta = appendOrderStatus(
    {
      ...moderatorPickupMeta,
      pickupMode: 'scheduled',
      pickupDate: shiftOTDate(currentDate, 1),
      pickupTime: '15:30',
      pickupDeadline: shiftOTDate(currentDate, 3),
      pickupNote: 'Pick up at the 2nd floor concierge desk before end of shift.',
    },
    'ready_for_pickup',
    'Scheduled pickup window shared with employee.',
    users.admin.id,
  );

  let adminCancelledMeta = buildInitialStoreOrderMeta(adminCancelledItems, orderCreatedAt[3], {
    name: users.admin.name,
    email: users.admin.email,
    employeeId: users.admin.employee_id,
  });
  adminCancelledMeta = appendOrderStatus(adminCancelledMeta, 'cancelled', 'Requested item was reserved for audit.', users.moderator_a1.id);

  const { error: orderMetaError } = await serviceClient.from('app_settings').upsert(
    [
      { key: getStoreOrderMetaKey(orders[0]!.id), value: employeePendingMeta },
      { key: getStoreOrderMetaKey(orders[1]!.id), value: employeeCompletedMeta },
      { key: getStoreOrderMetaKey(orders[2]!.id), value: moderatorPickupMeta },
      { key: getStoreOrderMetaKey(orders[3]!.id), value: adminCancelledMeta },
    ],
    { onConflict: 'key' },
  );
  if (orderMetaError) {
    throw new Error(orderMetaError.message);
  }

  const notificationRows = [
    {
      user_id: users.employee.id,
      title: 'Store order received',
      message: 'Your NYT desk bundle is pending moderator review.',
      type: 'store' as NotificationType,
    },
    {
      user_id: users.employee.id,
      title: 'Order completed',
      message: 'Your Audio Desk Tumbler was marked as picked up successfully.',
      type: 'store' as NotificationType,
    },
    {
      user_id: users.moderator_a1.id,
      title: 'Pickup scheduled',
      message: 'Your reward order is ready and scheduled for pickup tomorrow at 3:30 PM.',
      type: 'store' as NotificationType,
    },
    {
      user_id: users.admin.id,
      title: 'Store order cancelled',
      message: 'Your Crossword Notes Set order was cancelled and the balance was restored.',
      type: 'store' as NotificationType,
    },
    {
      user_id: users.admin.id,
      title: 'Low stock item alert',
      message: 'Crossword Notes Set is down to 2 units and should be restocked before the presentation.',
      type: 'store' as NotificationType,
    },
    {
      user_id: users.moderator_a1.id,
      title: 'Low stock item alert',
      message: 'Crossword Notes Set is down to 2 units and should be restocked before the presentation.',
      type: 'store' as NotificationType,
    },
  ];

  const { error: notificationError } = await serviceClient.from('notifications').insert(notificationRows);
  if (notificationError) {
    throw new Error(notificationError.message);
  }
}

async function seedOT(serviceClient: ServiceSupabaseClient, users: SeedUserMap, now: Date) {
  const today = getCurrentOTDateTime(now).date;
  const publishedRows = [
    { spot_id: '22114', lob: 'NYT VOICE', date: shiftOTDate(today, -1), start_time: '15:00', end_time: '19:00', duration_hrs: 4, shift_label: 'Afternoon Shift', csv_status: 'Pending' },
    { spot_id: '22118', lob: 'NYT VOICE', date: shiftOTDate(today, 1), start_time: '09:00', end_time: '12:00', duration_hrs: 3, shift_label: 'Morning Shift', csv_status: 'Pending' },
    { spot_id: '22122', lob: 'NYT CHAT', date: shiftOTDate(today, 2), start_time: '14:00', end_time: '18:00', duration_hrs: 4, shift_label: 'Afternoon Shift', csv_status: 'Pending' },
    { spot_id: '22128', lob: 'NYT VOICE', date: shiftOTDate(today, 2), start_time: '08:00', end_time: '12:00', duration_hrs: 4, shift_label: 'Morning Shift', csv_status: 'Pending' },
    { spot_id: '22131', lob: 'NYT CHAT', date: shiftOTDate(today, 3), start_time: '15:00', end_time: '19:00', duration_hrs: 4, shift_label: 'Afternoon Shift', csv_status: 'Pending' },
    { spot_id: '22135', lob: 'NYT VOICE', date: shiftOTDate(today, 4), start_time: '16:00', end_time: '20:00', duration_hrs: 4, shift_label: 'Evening Shift', csv_status: 'Pending' },
  ];

  const draftRows = [
    { spot_id: '22148', lob: 'NYT EMAIL', date: shiftOTDate(today, 6), start_time: '07:00', end_time: '11:00', duration_hrs: 4, shift_label: 'Morning Shift', csv_status: 'Pending' },
    { spot_id: '22149', lob: 'NYT EMAIL', date: shiftOTDate(today, 6), start_time: '11:00', end_time: '15:00', duration_hrs: 4, shift_label: 'Afternoon Shift', csv_status: 'Pending' },
  ];

  const { data: batches, error: batchError } = await serviceClient
    .from('ot_batches')
    .insert([
      {
        name: 'NYT Fortnight Coverage',
        status: 'published',
        csv_data: publishedRows,
        uploaded_by: users.moderator_a1.id,
        published_at: shiftIso(now, { days: -2 }),
      },
      {
        name: 'NYT Weekend Coverage Draft',
        status: 'draft',
        csv_data: draftRows,
        uploaded_by: users.admin.id,
        published_at: null,
      },
    ])
    .select('id, name, status');

  if (batchError || !batches) {
    throw new Error(batchError?.message ?? 'Unable to seed OT batches.');
  }

  const publishedBatch = batches.find((batch) => batch.status === 'published');
  if (!publishedBatch) {
    throw new Error('Published OT batch was not created.');
  }

  const { data: slots, error: slotError } = await serviceClient
    .from('ot_slots')
    .insert([
      {
        ...publishedRows[0],
        status: 'claimed',
        claimed_by: users.employee.id,
        claimed_at: shiftIso(now, { days: -1, hours: -5 }),
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
      {
        ...publishedRows[1],
        status: 'claimed',
        claimed_by: users.employee.id,
        claimed_at: shiftIso(now, { hours: -8 }),
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
      {
        ...publishedRows[2],
        status: 'claimed',
        claimed_by: users.moderator_a1.id,
        claimed_at: shiftIso(now, { hours: -6 }),
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
      {
        ...publishedRows[3],
        status: 'available',
        claimed_by: null,
        claimed_at: null,
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
      {
        ...publishedRows[4],
        status: 'claimed',
        claimed_by: users.admin.id,
        claimed_at: shiftIso(now, { hours: -4 }),
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
      {
        ...publishedRows[5],
        status: 'available',
        claimed_by: null,
        claimed_at: null,
        published_by: users.moderator_a1.id,
        batch_id: publishedBatch.id,
      },
    ])
    .select('id, claimed_by, date, start_time, end_time');

  if (slotError || !slots) {
    throw new Error(slotError?.message ?? 'Unable to seed OT slots.');
  }

  const claimSettings = slots
    .filter((slot) => slot.claimed_by)
    .map((slot, index) => ({
      key: getOTClaimMetaKey(slot.id),
      value: {
        slotId: slot.id,
        userId: slot.claimed_by,
        claimKind: index % 2 === 0 ? 'scheduled_extension' : 'day_off',
        claimedAt: shiftIso(now, { hours: -(index + 1) }),
        date: slot.date,
        startTime: slot.start_time,
        endTime: slot.end_time,
      },
    }));

  if (claimSettings.length > 0) {
    const { error: claimMetaError } = await serviceClient.from('app_settings').upsert(claimSettings, { onConflict: 'key' });
    if (claimMetaError) {
      throw new Error(claimMetaError.message);
    }
  }

  const { error: otNotificationsError } = await serviceClient.from('notifications').insert([
    {
      user_id: users.employee.id,
      title: 'OT reserved successfully',
      message: 'Your 9:00 AM to 12:00 PM NYT VOICE OT slot was reserved for tomorrow.',
      type: 'ot',
    },
    {
      user_id: users.moderator_a1.id,
      title: 'OT batch published',
      message: 'NYT Fortnight Coverage is live with new claimed and open OT slots.',
      type: 'ot',
    },
  ]);
  if (otNotificationsError) {
    throw new Error(otNotificationsError.message);
  }
}

async function seedRaffles(serviceClient: ServiceSupabaseClient, users: SeedUserMap, now: Date) {
  const scheduledDate = shiftOTDate(getCurrentOTDateTime(now).date, 2);
  const participants: RaffleParticipant[] = [
    { id: crypto.randomUUID(), name: users.employee.name, userId: users.employee.id, sourceId: users.employee.employee_id },
    { id: crypto.randomUUID(), name: users.moderator_a1.name, userId: users.moderator_a1.id, sourceId: users.moderator_a1.employee_id },
    { id: crypto.randomUUID(), name: users.admin.name, userId: users.admin.id, sourceId: users.admin.employee_id },
    { id: crypto.randomUUID(), name: 'News Desk Team', userId: null, sourceId: 'TEAM-NEWS' },
    { id: crypto.randomUUID(), name: 'Audio Ops Team', userId: null, sourceId: 'TEAM-AUDIO' },
  ];

  const upcomingForm: RaffleFormState = {
    mode: 'scheduled',
    title: 'NYT Friday Spotlight Giveaway',
    description: 'Desk essentials bundle for the next recognition highlight.',
    scheduledDate,
    scheduledTime: '15:00',
    countdownOption: '900',
    removeWinnerAfterSpin: true,
    spinCount: 2,
    participants,
    prizePlan: null,
    prizePlans: [],
  };

  const completedForm: RaffleFormState = {
    mode: 'immediate',
    title: 'Coffee Break Winner',
    description: 'Morning Brief Mug + notebook pair',
    scheduledDate: '',
    scheduledTime: '',
    countdownOption: 'disabled',
    removeWinnerAfterSpin: true,
    spinCount: 1,
    participants,
    prizePlan: null,
    prizePlans: [],
  };

  const { data: raffles, error: raffleError } = await serviceClient
    .from('raffles')
    .insert([
      {
        title: upcomingForm.title,
        description: upcomingForm.description,
        draw_date: shiftIso(now, { days: 2, hours: 2 }),
        status: 'upcoming',
        created_by: users.moderator_a1.id,
      },
      {
        title: completedForm.title,
        description: completedForm.description,
        draw_date: shiftIso(now, { days: -3 }),
        status: 'completed',
        created_by: users.admin.id,
        winner_id: users.employee.id,
      },
    ])
    .select('id, title, description, draw_date, status');

  if (raffleError || !raffles) {
    throw new Error(raffleError?.message ?? 'Unable to seed raffles.');
  }

  const upcomingRaffle = raffles[0];
  const completedRaffle = raffles[1];
  if (!upcomingRaffle || !completedRaffle) {
    throw new Error('Raffle seed rows are missing.');
  }

  const upcomingRuntime = prepareRuntimeForCreate(upcomingForm, upcomingRaffle.id);
  await persistRaffleRuntime(serviceClient, upcomingRuntime);

  const completedBaseRuntime = prepareRuntimeForCreate(completedForm, completedRaffle.id);
  const winningParticipant =
    completedBaseRuntime.participants.find((participant) => participant.userId === users.employee.id) ??
    completedBaseRuntime.participants[0];
  if (!winningParticipant) {
    throw new Error('Completed raffle could not determine a winner.');
  }

  await persistRaffleRuntime(serviceClient, {
    ...completedBaseRuntime,
    phase: 'completed',
    scheduledFor: shiftIso(now, { days: -3 }),
    countdownEnabled: false,
    countdownStartsAt: null,
    countdownOption: 'disabled',
    winnerQueue: [],
    winners: [
      {
        participantId: winningParticipant.id,
        name: winningParticipant.name,
        userId: winningParticipant.userId,
        selectedAt: shiftIso(now, { days: -3, minutes: 12 }),
        spinIndex: 0,
      },
    ],
    prizeAssignments: [
      {
        winnerParticipantId: winningParticipant.id,
        winnerName: winningParticipant.name,
        prizeTitle: 'Morning Brief Mug + Crossword Notes Set',
        notes: 'Awarded during the Friday all-hands wrap-up.',
        assignedAt: shiftIso(now, { days: -3, minutes: 20 }),
      },
    ],
    activeWinnerId: null,
    currentSpinIndex: 1,
    currentSpinToken: null,
    publishedAt: shiftIso(now, { days: -3, minutes: -5 }),
    launchNotifiedAt: shiftIso(now, { days: -3, minutes: -5 }),
    scheduleNotifiedAt: null,
    oneMinuteNotifiedAt: null,
    revealEndsAt: null,
    intermissionEndsAt: null,
    completedAt: shiftIso(now, { days: -3, minutes: 20 }),
    lastUpdatedAt: shiftIso(now, { days: -3, minutes: 20 }),
  });

  const { error: entryError } = await serviceClient.from('raffle_entries').insert([
    { raffle_id: upcomingRaffle.id, user_id: users.employee.id },
    { raffle_id: upcomingRaffle.id, user_id: users.moderator_a1.id },
    { raffle_id: upcomingRaffle.id, user_id: users.admin.id },
    { raffle_id: completedRaffle.id, user_id: users.employee.id },
    { raffle_id: completedRaffle.id, user_id: users.moderator_a1.id },
    { raffle_id: completedRaffle.id, user_id: users.admin.id },
  ]);

  if (entryError) {
    throw new Error(entryError.message);
  }

  const { error: raffleNotificationError } = await serviceClient.from('notifications').insert([
    {
      user_id: users.employee.id,
      title: 'Raffle scheduled',
      message: 'NYT Friday Spotlight Giveaway is scheduled for two days from now at 3:00 PM.',
      type: 'system',
    },
    {
      user_id: users.employee.id,
      title: 'You won a raffle!',
      message: 'Coffee Break Winner was assigned to your profile during the last wrap-up.',
      type: 'system',
    },
  ]);
  if (raffleNotificationError) {
    throw new Error(raffleNotificationError.message);
  }
}

async function seedSupportTickets(serviceClient: ServiceSupabaseClient, users: SeedUserMap, now: Date) {
  const { error } = await serviceClient.from('support_tickets').insert([
    {
      user_id: users.employee.id,
      department: 'it',
      subject: 'IT Support: NYT metrics import confirmation',
      message: 'Need confirmation that the NYT metrics import is ready for payroll review.',
      status: 'open',
      created_at: shiftIso(now, { hours: -3 }),
    },
    {
      user_id: users.moderator_a1.id,
      department: 'moderator',
      subject: 'Moderator Support: pickup staging checklist',
      message: 'Store pickup staging checklist updated for tomorrow.',
      status: 'resolved',
      created_at: shiftIso(now, { days: -1, hours: -2 }),
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }
}

async function seedPointsLedger(serviceClient: ServiceSupabaseClient, users: SeedUserMap, now: Date) {
  const { error: updateError } = await serviceClient
    .from('users')
    .upsert(
      [
        { id: users.admin.id, points: 12000 },
        { id: users.moderator_a1.id, points: 5400 },
        { id: users.employee.id, points: 9810 },
      ],
      { onConflict: 'id' },
    );

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error } = await serviceClient.from('points_ledger').insert([
    {
      user_id: users.admin.id,
      granted_by: users.admin.id,
      points_added: 12000,
      reason: 'Presentation opening balance for IT.',
      created_at: shiftIso(now, { days: -6 }),
    },
    {
      user_id: users.moderator_a1.id,
      granted_by: users.admin.id,
      points_added: 9000,
      reason: 'Presentation opening balance for moderation.',
      created_at: shiftIso(now, { days: -6 }),
    },
    {
      user_id: users.employee.id,
      granted_by: users.admin.id,
      points_added: 14000,
      reason: 'Presentation opening balance for employee experience demos.',
      created_at: shiftIso(now, { days: -6 }),
    },
    {
      user_id: users.employee.id,
      granted_by: users.employee.id,
      points_added: -4200,
      reason: 'Store checkout (NYT desk bundle).',
      created_at: shiftIso(now, { days: -1, hours: -3 }),
    },
    {
      user_id: users.employee.id,
      granted_by: null,
      points_added: 10,
      reason: `OT Slot Claimed: ${shiftOTDate(getCurrentOTDateTime(now).date, 1)}`,
      created_at: shiftIso(now, { hours: -8 }),
    },
    {
      user_id: users.moderator_a1.id,
      granted_by: users.moderator_a1.id,
      points_added: -3600,
      reason: 'Store checkout (Audio Desk Tumbler + notes set).',
      created_at: shiftIso(now, { hours: -6 }),
    },
  ]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function seedPresentationData(serviceClient: ServiceSupabaseClient) {
  const now = startOfMinute(new Date());
  const ensuredUsers = await ensurePresentationDemoUsers(serviceClient);
  const demoUsers = byRole(ensuredUsers);

  await seedStore(serviceClient, demoUsers, now);
  await seedOT(serviceClient, demoUsers, now);
  await seedRaffles(serviceClient, demoUsers, now);
  await seedSupportTickets(serviceClient, demoUsers, now);
  await seedPointsLedger(serviceClient, demoUsers, now);
}

export async function setPresentationPoints(
  serviceClient: ServiceSupabaseClient,
  {
    userId,
    actor,
    mode,
    amount,
    reason,
  }: {
    userId: string;
    actor: Pick<User, 'id' | 'name'>;
    mode: 'set' | 'adjust';
    amount: number;
    reason?: string;
  },
) {
  const { data: target, error: targetError } = await serviceClient
    .from('users')
    .select('id, name, points')
    .eq('id', userId)
    .single();

  if (targetError || !target) {
    throw new Error(targetError?.message ?? 'User not found.');
  }

  const normalizedAmount = Math.round(Number(amount));
  if (!Number.isFinite(normalizedAmount)) {
    throw new Error('Points amount is invalid.');
  }

  const previousPoints = Number(target.points ?? 0);
  const nextPoints = mode === 'set'
    ? Math.max(0, normalizedAmount)
    : Math.max(0, previousPoints + normalizedAmount);
  const delta = nextPoints - previousPoints;

  if (delta === 0) {
    return;
  }

  const { error: updateError } = await serviceClient
    .from('users')
    .update({ points: nextPoints })
    .eq('id', userId);
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: ledgerError } = await serviceClient.from('points_ledger').insert({
    user_id: userId,
    granted_by: actor.id,
    points_added: delta,
    reason: `${reason?.trim() || 'IT demo balance adjustment'} (${previousPoints} -> ${nextPoints})`,
  });
  if (ledgerError) {
    throw new Error(ledgerError.message);
  }

  const { error: notificationError } = await serviceClient.from('notifications').insert({
    user_id: userId,
    title: 'Points balance updated',
    message: `${actor.name} adjusted your points by ${delta >= 0 ? '+' : '-'}${Math.abs(delta)} pts. Your new balance is ${nextPoints} pts.`,
    type: 'system',
  });
  if (notificationError) {
    throw new Error(notificationError.message);
  }
}

export async function executePresentationAction(
  serviceClient: ServiceSupabaseClient,
  {
    action,
    actor,
    userId,
    amount,
    mode,
    reason,
  }: {
    action: 'ensureUsers' | 'resetDemo' | 'seedDemo' | 'resetAndSeed' | 'setPoints';
    actor: Pick<User, 'id' | 'name'>;
    userId?: string;
    amount?: number;
    mode?: 'set' | 'adjust';
    reason?: string;
  },
): Promise<DemoActionResult> {
  if (action === 'ensureUsers') {
    await ensurePresentationDemoUsers(serviceClient);
  } else if (action === 'resetDemo') {
    await resetPresentationData(serviceClient);
  } else if (action === 'seedDemo') {
    await seedPresentationData(serviceClient);
  } else if (action === 'resetAndSeed') {
    await resetPresentationData(serviceClient);
    await seedPresentationData(serviceClient);
  } else if (action === 'setPoints') {
    if (!userId) {
      throw new Error('A user must be selected before changing points.');
    }
    await setPresentationPoints(serviceClient, {
      userId,
      actor,
      mode: mode ?? 'set',
      amount: amount ?? 0,
      reason,
    });
  }

  const status = await loadPresentationStatus(serviceClient);
  const messageMap: Record<string, string> = {
    ensureUsers: 'Demo accounts are ready and synced with the public profile table.',
    resetDemo: 'Presentation activity was cleared. Demo users stayed in place with zeroed balances.',
    seedDemo: 'Professional presentation data was seeded successfully.',
    resetAndSeed: 'Demo data was reset and repopulated with the presentation dataset.',
    setPoints: 'Points were updated and the user was notified.',
  };

  return {
    message: messageMap[action],
    status,
  };
}
