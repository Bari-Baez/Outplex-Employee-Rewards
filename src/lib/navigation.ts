import type { LucideIcon } from 'lucide-react';
import {
  Calculator,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  FormInput,
  Gift,
  LayoutDashboard,
  Megaphone,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Users,
} from 'lucide-react';
import type { ToolKey } from '@/lib/tools-catalog';
import type { UserRole } from '@/types/database';

export type NavigationSurface = 'sidebar' | 'search' | 'mobile-more' | 'mobile-primary';
export type NavigationGroup = 'main' | 'tools' | 'moderator' | 'admin';

export interface NavigationItem {
  id: string;
  label: string;
  compactLabel?: string;
  href: string;
  icon: LucideIcon;
  group: NavigationGroup;
  roles: readonly UserRole[];
  surfaces: readonly NavigationSurface[];
  synonyms?: readonly string[];
  toolKey?: ToolKey;
}

const ALL_USER_ROLES = [
  'employee',
  'staff',
  'moderator',
  'moderator_a1',
  'moderator_b1',
  'admin',
] as const satisfies readonly UserRole[];

const MODERATOR_ROLES = [
  'moderator',
  'moderator_a1',
  'moderator_b1',
  'admin',
] as const satisfies readonly UserRole[];

const MAIN_SURFACES = ['sidebar', 'search'] as const satisfies readonly NavigationSurface[];
const MODERATOR_SURFACES = ['sidebar', 'search', 'mobile-more'] as const satisfies readonly NavigationSurface[];

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    id: 'dashboard', label: 'Dashboard', compactLabel: 'Home', href: '/dashboard', icon: LayoutDashboard,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-primary'],
    synonyms: ['panel', 'inicio', 'home'], toolKey: 'dashboard',
  },
  {
    id: 'ot-calendar', label: 'OT Calendar', compactLabel: 'OT', href: '/ot-calendar', icon: CalendarDays,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-primary'],
    synonyms: ['calendario', 'horas', 'overtime', 'ot'], toolKey: 'ot_calendar',
  },
  {
    id: 'store', label: 'Store', href: '/store', icon: ShoppingBag,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-primary'],
    synonyms: ['tienda', 'bazar', 'compra', 'shop'], toolKey: 'store',
  },
  {
    id: 'raffles', label: 'Raffles', href: '/raffles', icon: Gift,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-more'],
    synonyms: ['rifas', 'sorteos', 'ganar', 'raffle'], toolKey: 'raffles',
  },
  {
    id: 'orders', label: 'Order History', href: '/orders', icon: ShoppingCart,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-more'],
    synonyms: ['pedidos', 'compras', 'historial', 'history'], toolKey: 'orders',
  },
  {
    id: 'forms', label: 'Forms', href: '/forms', icon: ClipboardList,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-more'],
    synonyms: ['formularios', 'encuestas', 'form'], toolKey: 'forms',
  },
  {
    id: 'announcements', label: 'Announcements', href: '/announcements', icon: Megaphone,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-more'],
    synonyms: ['anuncios', 'noticias', 'announcement', 'news'], toolKey: 'announcements',
  },
  {
    id: 'my-store', label: 'My Store', href: '/my-store', icon: Store,
    group: 'main', roles: ALL_USER_ROLES, surfaces: [...MAIN_SURFACES, 'mobile-more'],
    synonyms: ['mi tienda', 'my-shop'], toolKey: 'my_store',
  },
  {
    id: 'settings', label: 'Account', href: '/settings', icon: Settings,
    group: 'main', roles: ALL_USER_ROLES, surfaces: ['mobile-more'], synonyms: ['account', 'settings', 'cuenta'],
  },
  {
    id: 'calculator', label: 'Calculator', href: '/calculator', icon: Calculator,
    group: 'tools', roles: ['employee'], surfaces: ['mobile-more'], synonyms: ['pay', 'salary', 'calculadora'],
  },
  {
    id: 'ot-staging', label: 'OT Staging', href: '/staging', icon: FileSpreadsheet,
    group: 'moderator', roles: ['moderator_a1', 'admin', 'moderator'], surfaces: MODERATOR_SURFACES,
    synonyms: ['staging', 'csv', 'importar'], toolKey: 'ot_staging',
  },
  {
    id: 'ot-manager', label: 'OT Manager', href: '/moderator/ot-manager', icon: CalendarDays,
    group: 'moderator', roles: MODERATOR_ROLES, surfaces: MODERATOR_SURFACES,
    synonyms: ['gestor ot', 'manager'], toolKey: 'ot_manager',
  },
  {
    id: 'breaks-manager', label: 'Breaks Manager', href: '/moderator/breaks-manager', icon: ClipboardList,
    group: 'moderator', roles: ['moderator_a1', 'moderator_b1', 'admin'], surfaces: MODERATOR_SURFACES,
    synonyms: ['recesos', 'almuerzos', 'breaks'], toolKey: 'breaks_manager',
  },
  {
    id: 'raffle-engine', label: 'Raffle Engine', href: '/moderator/raffles', icon: Gift,
    group: 'moderator', roles: ['moderator_a1', 'admin', 'moderator'], surfaces: MODERATOR_SURFACES,
    synonyms: ['motor rifas', 'crear rifa', 'engine'], toolKey: 'raffle_engine',
  },
  {
    id: 'store-operations', label: 'Store Operations', href: '/moderator/store/orders', icon: ShoppingBag,
    group: 'moderator', roles: MODERATOR_ROLES, surfaces: MODERATOR_SURFACES,
    synonyms: ['operaciones tienda', 'inventario', 'stock'], toolKey: 'store_operations',
  },
  {
    id: 'communications', label: 'Communications', href: '/moderator/communications/notifications', icon: Megaphone,
    group: 'moderator', roles: ['moderator_a1', 'admin'], surfaces: MODERATOR_SURFACES,
    synonyms: ['comunicaciones', 'mensajes', 'studio'], toolKey: 'communications',
  },
  {
    id: 'employees', label: 'Employees', href: '/moderator/users', icon: Users,
    group: 'moderator', roles: MODERATOR_ROLES, surfaces: MODERATOR_SURFACES,
    synonyms: ['empleados', 'usuarios', 'users'], toolKey: 'employees',
  },
  {
    id: 'employee-stores', label: 'Employee Stores', href: '/moderator/employee-stores', icon: Store,
    group: 'moderator', roles: MODERATOR_ROLES, surfaces: MODERATOR_SURFACES,
    synonyms: ['tiendas empleados', 'colmados'], toolKey: 'employee_stores',
  },
  {
    id: 'form-builder', label: 'Form Builder', href: '/moderator/forms', icon: FormInput,
    group: 'moderator', roles: ['moderator_a1', 'admin', 'moderator'], surfaces: MODERATOR_SURFACES,
    synonyms: ['constructor forms', 'crear forms', 'builder'], toolKey: 'form_builder',
  },
  {
    id: 'simulation-tools', label: 'Simulation Tools', href: '/simulation', icon: LayoutDashboard,
    group: 'admin', roles: ['admin'], surfaces: MODERATOR_SURFACES, synonyms: ['simulacion', 'dev', 'tools'],
  },
];

export function canAccessNavigationItem(item: NavigationItem, userRole: UserRole) {
  return item.roles.includes(userRole);
}

export function getNavigationItems(surface: NavigationSurface, userRole: UserRole) {
  return NAVIGATION_ITEMS.filter(
    (item) => item.surfaces.includes(surface) && canAccessNavigationItem(item, userRole),
  );
}

export function getNavigationItem(id: string) {
  return NAVIGATION_ITEMS.find((item) => item.id === id);
}
