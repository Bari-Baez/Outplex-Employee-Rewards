/**
 * Reads and writes the availability snapshot in `app_settings`.
 * Server-only: it needs a Supabase client. The shapes and key helpers live in
 * `@backend/modules/shell/contracts/availability`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolKey } from '@backend/modules/shell/domain/tools-catalog';
import {
  MAINTENANCE_BANNER_ACTIVE_KEY,
  MAINTENANCE_BANNER_MESSAGE_KEY,
  SECTION_ENABLED_KEY_PREFIX,
  TOOL_ENABLED_KEY_PREFIX,
  buildDefaultSectionAvailability,
  buildDefaultToolAvailability,
  getToolEnabledSettingKey,
  parseBooleanSetting,
  type MaintenanceBannerState,
  type SectionAvailabilityMap,
  type ToolAvailabilityMap,
} from '@backend/modules/shell/contracts/availability';

type AppSettingRow = {
  key: string;
  value: unknown;
};

type ServiceClient = Pick<SupabaseClient, 'from'>;

export async function loadToolAvailability(serviceClient: ServiceClient, toolKeys: readonly ToolKey[]): Promise<ToolAvailabilityMap> {
  const keys = toolKeys.map((toolKey) => getToolEnabledSettingKey(toolKey));
  const defaults = buildDefaultToolAvailability(toolKeys);

  const { data, error } = await serviceClient
    .from('app_settings')
    .select('key, value')
    .in('key', keys);

  if (error) {
    throw new Error(error.message ?? 'Unable to load tool availability.');
  }

  for (const row of data ?? []) {
    const rowKey = String(row.key);
    if (!rowKey.startsWith(TOOL_ENABLED_KEY_PREFIX)) continue;
    const toolKey = rowKey.slice(TOOL_ENABLED_KEY_PREFIX.length) as ToolKey;
    if (!(toolKey in defaults)) continue;
    const parsed = parseBooleanSetting(row.value);
    if (parsed !== null) {
      defaults[toolKey] = parsed;
    }
  }

  return defaults;
}

export async function upsertToolAvailability(serviceClient: ServiceClient, updates: Partial<ToolAvailabilityMap>) {
  const rows = Object.entries(updates).map(([toolKey, enabled]) => ({
    key: getToolEnabledSettingKey(toolKey as ToolKey),
    value: enabled ? 'true' : 'false',
  }));

  if (rows.length === 0) {
    return;
  }

  const { error } = await serviceClient.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    throw new Error(error.message ?? 'Unable to update tool availability.');
  }
}

export async function loadSectionAvailability(serviceClient: ServiceClient): Promise<SectionAvailabilityMap> {
  const defaults = buildDefaultSectionAvailability();
  const keys = Object.keys(defaults).map((id) => `${SECTION_ENABLED_KEY_PREFIX}${id}`);

  const { data, error } = await serviceClient
    .from('app_settings')
    .select('key, value')
    .in('key', keys);

  if (error) {
    throw new Error(error.message ?? 'Unable to load section availability.');
  }

  for (const row of data ?? []) {
    const rowKey = String(row.key);
    if (!rowKey.startsWith(SECTION_ENABLED_KEY_PREFIX)) continue;
    const id = rowKey.slice(SECTION_ENABLED_KEY_PREFIX.length);
    if (!(id in defaults)) continue;
    const parsed = parseBooleanSetting(row.value);
    if (parsed !== null) {
      defaults[id] = parsed;
    }
  }

  return defaults;
}

export async function upsertSectionAvailability(serviceClient: ServiceClient, updates: Partial<SectionAvailabilityMap>) {
  const rows = Object.entries(updates).map(([id, enabled]) => ({
    key: `${SECTION_ENABLED_KEY_PREFIX}${id}`,
    value: enabled ? 'true' : 'false',
  }));

  if (rows.length === 0) return;

  const { error } = await serviceClient.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    throw new Error(error.message ?? 'Unable to update section availability.');
  }
}

export async function loadMaintenanceBanner(serviceClient: ServiceClient): Promise<MaintenanceBannerState> {
  const { data, error } = await serviceClient
    .from('app_settings')
    .select('key, value')
    .in('key', [MAINTENANCE_BANNER_ACTIVE_KEY, MAINTENANCE_BANNER_MESSAGE_KEY]);

  if (error) {
    throw new Error(error.message ?? 'Unable to load maintenance banner.');
  }

  const rows = (data ?? []) as AppSettingRow[];
  const map = new Map<string, unknown>(rows.map((row) => [String(row.key), row.value]));
  const active = parseBooleanSetting(map.get(MAINTENANCE_BANNER_ACTIVE_KEY)) ?? false;
  const messageRaw = map.get(MAINTENANCE_BANNER_MESSAGE_KEY);
  const message = typeof messageRaw === 'string' ? messageRaw : messageRaw ? String(messageRaw) : '';
  return { active, message };
}

export async function upsertMaintenanceBanner(serviceClient: ServiceClient, next: MaintenanceBannerState) {
  const rows = [
    { key: MAINTENANCE_BANNER_ACTIVE_KEY, value: next.active ? 'true' : 'false' },
    { key: MAINTENANCE_BANNER_MESSAGE_KEY, value: next.message ?? '' },
  ];

  const { error } = await serviceClient.from('app_settings').upsert(rows, { onConflict: 'key' });
  if (error) {
    throw new Error(error.message ?? 'Unable to update maintenance banner.');
  }
}
