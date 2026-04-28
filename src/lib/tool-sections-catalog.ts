import type { ToolKey } from '@/lib/tools-catalog';

export type ToolSection = {
  toolKey: ToolKey;
  sectionKey: string;
  label: string;
  // Used for resolving the current section on the client (maintenance gate).
  routePrefixes: string[];
  // Optional: used when the section is represented by a query param in a base route.
  queryTab?: string;
};

export const TOOL_SECTIONS_CATALOG: ToolSection[] = [
  { toolKey: 'dashboard', sectionKey: 'main', label: 'Dashboard', routePrefixes: ['/dashboard'] },
  { toolKey: 'ot_calendar', sectionKey: 'main', label: 'OT Calendar', routePrefixes: ['/ot-calendar'] },

  { toolKey: 'store', sectionKey: 'browse', label: 'Browse', routePrefixes: ['/store'] },
  { toolKey: 'store', sectionKey: 'checkout', label: 'Checkout', routePrefixes: ['/store/checkout'] },
  { toolKey: 'store', sectionKey: 'checkout_confirm', label: 'Confirm', routePrefixes: ['/store/checkout/confirm'] },
  { toolKey: 'store', sectionKey: 'employee_checkout', label: 'Employee Checkout', routePrefixes: ['/store/employee-checkout'] },

  { toolKey: 'raffles', sectionKey: 'main', label: 'Raffles', routePrefixes: ['/raffles'] },
  { toolKey: 'orders', sectionKey: 'main', label: 'Order History', routePrefixes: ['/orders'] },
  { toolKey: 'forms', sectionKey: 'main', label: 'Forms', routePrefixes: ['/forms'] },

  { toolKey: 'announcements', sectionKey: 'list', label: 'List', routePrefixes: ['/announcements'] },
  { toolKey: 'announcements', sectionKey: 'detail', label: 'Detail', routePrefixes: ['/announcements/'] },

  { toolKey: 'my_store', sectionKey: 'main', label: 'My Store', routePrefixes: ['/my-store'] },

  { toolKey: 'ot_staging', sectionKey: 'main', label: 'OT Staging', routePrefixes: ['/staging'] },
  { toolKey: 'ot_manager', sectionKey: 'main', label: 'OT Manager', routePrefixes: ['/moderator/ot-manager'] },
  { toolKey: 'breaks_manager', sectionKey: 'main', label: 'Breaks Manager', routePrefixes: ['/moderator/breaks-manager'] },
  { toolKey: 'raffle_engine', sectionKey: 'main', label: 'Raffle Engine', routePrefixes: ['/moderator/raffles'] },

  // Store Operations (subroutes + legacy query tabs)
  { toolKey: 'store_operations', sectionKey: 'orders', label: 'Orders', routePrefixes: ['/moderator/store/orders'], queryTab: 'orders' },
  { toolKey: 'store_operations', sectionKey: 'inventory', label: 'Inventory', routePrefixes: ['/moderator/store/inventory'], queryTab: 'inventory' },
  { toolKey: 'store_operations', sectionKey: 'theme', label: 'Store Theme', routePrefixes: ['/moderator/store/theme'], queryTab: 'settings' },
  { toolKey: 'store_operations', sectionKey: 'analytics', label: 'Analytics', routePrefixes: ['/moderator/store/analytics'], queryTab: 'analytics' },
  { toolKey: 'store_operations', sectionKey: 'recycle_bin', label: 'Recycle Bin', routePrefixes: ['/moderator/store/recycle-bin'], queryTab: 'recycle_bin' },

  // Communications Studio
  { toolKey: 'communications', sectionKey: 'notifications', label: 'Notifications', routePrefixes: ['/moderator/communications/notifications'], queryTab: 'notifications' },
  { toolKey: 'communications', sectionKey: 'announcements', label: 'Announcements', routePrefixes: ['/moderator/communications/announcements'], queryTab: 'announcements' },

  { toolKey: 'employees', sectionKey: 'main', label: 'Employees', routePrefixes: ['/moderator/users'] },
  { toolKey: 'employee_stores', sectionKey: 'main', label: 'Employee Stores', routePrefixes: ['/moderator/employee-stores'] },
  { toolKey: 'form_builder', sectionKey: 'main', label: 'Form Builder', routePrefixes: ['/moderator/forms'] },
];

export const TOOL_SECTION_IDS = TOOL_SECTIONS_CATALOG.map((s) => `${s.toolKey}:${s.sectionKey}` as const);

export function getToolSectionId(toolKey: ToolKey, sectionKey: string) {
  return `${toolKey}:${sectionKey}`;
}

export function resolveSectionFromLocation(toolKey: ToolKey, pathname: string, searchParams: URLSearchParams | null) {
  const normalized = pathname.split('?')[0] ?? pathname;
  const sections = TOOL_SECTIONS_CATALOG.filter((s) => s.toolKey === toolKey);

  // 1) Prefer direct subroute prefix match (longest first).
  const byPrefix = sections
    .flatMap((section) => section.routePrefixes.map((prefix) => ({ section, prefix })))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  for (const candidate of byPrefix) {
    const prefix = candidate.prefix;
    if (prefix.endsWith('/') && normalized.startsWith(prefix)) {
      return candidate.section.sectionKey;
    }
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return candidate.section.sectionKey;
    }
  }

  // 2) Legacy: query tab mapping on base routes (e.g. /moderator/store?tab=analytics).
  const tab = searchParams?.get('tab') ?? '';
  if (tab) {
    const match = sections.find((section) => section.queryTab === tab);
    if (match) return match.sectionKey;
  }

  // 3) Fallback: first section (usually main/list).
  return sections[0]?.sectionKey ?? 'main';
}

