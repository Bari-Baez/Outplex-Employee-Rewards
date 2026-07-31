/**
 * Availability contract shared by browser and server: the shapes an availability
 * snapshot has, the `app_settings` keys that back it, and the pure helpers that
 * derive keys and defaults. Loading and persisting live in
 * `@backend/modules/shell/application/availability`.
 */
import type { ToolKey } from '@backend/modules/shell/domain/tools-catalog';
import { TOOL_SECTIONS_CATALOG, getToolSectionId } from '@backend/modules/shell/domain/tool-sections-catalog';

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

export function buildDefaultSectionAvailability() {
  const defaults: SectionAvailabilityMap = {};
  for (const section of TOOL_SECTIONS_CATALOG) {
    defaults[getToolSectionId(section.toolKey, section.sectionKey)] = true;
  }
  return defaults;
}
