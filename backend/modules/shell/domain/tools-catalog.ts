export type ToolGroup = 'main' | 'moderator';

export const TOOLS_CATALOG = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    group: 'main' as const,
    routePrefixes: ['/dashboard'],
  },
  {
    key: 'ot_calendar',
    label: 'OT Calendar',
    href: '/ot-calendar',
    group: 'main' as const,
    routePrefixes: ['/ot-calendar'],
  },
  {
    key: 'store',
    label: 'Store',
    href: '/store',
    group: 'main' as const,
    routePrefixes: ['/store'],
  },
  {
    key: 'raffles',
    label: 'Raffles',
    href: '/raffles',
    group: 'main' as const,
    routePrefixes: ['/raffles'],
  },
  {
    key: 'orders',
    label: 'Order History',
    href: '/orders',
    group: 'main' as const,
    routePrefixes: ['/orders'],
  },
  {
    key: 'forms',
    label: 'Forms',
    href: '/forms',
    group: 'main' as const,
    routePrefixes: ['/forms'],
  },
  {
    key: 'announcements',
    label: 'Announcements',
    href: '/announcements',
    group: 'main' as const,
    routePrefixes: ['/announcements'],
  },
  {
    key: 'my_store',
    label: 'My Store',
    href: '/my-store',
    group: 'main' as const,
    routePrefixes: ['/my-store'],
  },
  {
    key: 'ot_staging',
    label: 'OT Staging',
    href: '/staging',
    group: 'moderator' as const,
    routePrefixes: ['/staging'],
  },
  {
    key: 'ot_manager',
    label: 'OT Manager',
    href: '/moderator/ot-manager',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/ot-manager'],
  },
  {
    key: 'breaks_manager',
    label: 'Breaks Manager',
    href: '/moderator/breaks-manager',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/breaks-manager'],
  },
  {
    key: 'raffle_engine',
    label: 'Raffle Engine',
    href: '/moderator/raffles',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/raffles'],
  },
  {
    key: 'store_operations',
    label: 'Store Operations',
    href: '/moderator/store/orders',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/store'],
  },
  {
    key: 'communications',
    label: 'Communications',
    href: '/moderator/communications/notifications',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/communications'],
  },
  {
    key: 'employees',
    label: 'Employees',
    href: '/moderator/users',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/users'],
  },
  {
    key: 'employee_stores',
    label: 'Employee Stores',
    href: '/moderator/employee-stores',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/employee-stores'],
  },
  {
    key: 'form_builder',
    label: 'Form Builder',
    href: '/moderator/forms',
    group: 'moderator' as const,
    routePrefixes: ['/moderator/forms'],
  },
] as const;

export type ToolKey = (typeof TOOLS_CATALOG)[number]['key'];

export const TOOL_KEYS = TOOLS_CATALOG.map((tool) => tool.key) as ToolKey[];

export function resolveToolKeyFromPathname(pathname: string): ToolKey | null {
  const normalized = pathname.split('?')[0] ?? pathname;
  // Prefer longest prefix match to avoid overlap (`/moderator/...`).
  const candidates = TOOLS_CATALOG.flatMap((tool) =>
    tool.routePrefixes.map((prefix) => ({ key: tool.key, prefix })),
  ).sort((a, b) => b.prefix.length - a.prefix.length);

  for (const candidate of candidates) {
    if (normalized === candidate.prefix || normalized.startsWith(`${candidate.prefix}/`)) {
      return candidate.key;
    }
  }

  return null;
}
