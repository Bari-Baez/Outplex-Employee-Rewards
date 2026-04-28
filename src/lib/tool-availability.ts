import type { ToolKey } from '@/lib/tools-catalog';
import { TOOL_SECTIONS_CATALOG, getToolSectionId } from '@/lib/tool-sections-catalog';
import type { SupabaseClient } from '@supabase/supabase-js';

type AppSettingRow = {
  key: string;
  value: unknown;
};

type ServiceClient = Pick<SupabaseClient, 'from'>;

export type ToolAvailabilityMap = Record<ToolKey, boolean>;
export type SectionAvailabilityMap = Record<string, boolean>;

export const TOOL_ENABLED_KEY_PREFIX = 'tool_enabled:';
export const SECTION_ENABLED_KEY_PREFIX = 'section_enabled:';

export const MAINTENANCE_BANNER_ACTIVE_KEY = 'it_maintenance_banner:active';
export const MAINTENANCE_BANNER_MESSAGE_KEY = 'it_maintenance_banner:message';

export type MaintenanceBannerState = {
  active: boolean;
  message: string;
};

export function getToolEnabledSettingKey(toolKey: ToolKey) {
  return `${TOOL_ENABLED_KEY_PREFIX}${toolKey}`;
}

export function getSectionEnabledSettingKey(toolKey: ToolKey, sectionKey: string) {
  return `${SECTION_ENABLED_KEY_PREFIX}${toolKey}:${sectionKey}`;
}

export function parseBooleanSetting(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return null;
}

export function buildDefaultToolAvailability(toolKeys: readonly ToolKey[]) {
  return Object.fromEntries(toolKeys.map((key) => [key, true])) as ToolAvailabilityMap;
}

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

export function buildDefaultSectionAvailability() {
  const defaults: SectionAvailabilityMap = {};
  for (const section of TOOL_SECTIONS_CATALOG) {
    defaults[getToolSectionId(section.toolKey, section.sectionKey)] = true;
  }
  return defaults;
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
