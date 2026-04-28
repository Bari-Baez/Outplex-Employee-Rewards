'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarDays,
  ShoppingBag,
  Gift,
  Users,
  FileSpreadsheet,
  Settings,
  Megaphone,
  ClipboardList,
  FormInput,
  Store,
  LogOut,
  Wrench,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';
import { useAppAvailability } from '@/components/layout/AppAvailabilityProvider';
import type { ToolKey } from '@/lib/tools-catalog';

interface SidebarProps {
  userRole: UserRole;
}

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, toolKey: 'dashboard' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'OT Calendar', href: '/ot-calendar', icon: CalendarDays, toolKey: 'ot_calendar' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Store', href: '/store', icon: ShoppingBag, toolKey: 'store' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Raffles', href: '/raffles', icon: Gift, toolKey: 'raffles' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Order History', href: '/orders', icon: ShoppingBag, toolKey: 'orders' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Forms', href: '/forms', icon: ClipboardList, toolKey: 'forms' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Announcements', href: '/announcements', icon: Megaphone, toolKey: 'announcements' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'My Store', href: '/my-store', icon: Store, toolKey: 'my_store' as ToolKey, roles: ['employee', 'moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
];

const moderatorItems = [
  { label: 'OT Staging', href: '/staging', icon: FileSpreadsheet, toolKey: 'ot_staging' as ToolKey, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
  { label: 'OT Manager', href: '/moderator/ot-manager', icon: CalendarDays, toolKey: 'ot_manager' as ToolKey, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Breaks Manager', href: '/moderator/breaks-manager', icon: ClipboardList, toolKey: 'breaks_manager' as ToolKey, roles: ['moderator_a1', 'moderator_b1', 'admin'] as UserRole[] },
  { label: 'Raffle Engine', href: '/moderator/raffles', icon: Gift, toolKey: 'raffle_engine' as ToolKey, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Store Operations', href: '/moderator/store/orders', icon: ShoppingBag, toolKey: 'store_operations' as ToolKey, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Communications', href: '/moderator/communications/notifications', icon: Megaphone, toolKey: 'communications' as ToolKey, roles: ['moderator_a1', 'admin'] as UserRole[] },
  { label: 'Employees', href: '/moderator/users', icon: Users, toolKey: 'employees' as ToolKey, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Employee Stores', href: '/moderator/employee-stores', icon: Store, toolKey: 'employee_stores' as ToolKey, roles: ['moderator_a1', 'moderator_b1', 'admin', 'moderator'] as UserRole[] },
  { label: 'Form Builder', href: '/moderator/forms', icon: FormInput, toolKey: 'form_builder' as ToolKey, roles: ['moderator_a1', 'admin', 'moderator'] as UserRole[] },
];

const adminItems = [
  { label: 'Simulation Tools', href: '/simulation', icon: LayoutDashboard, roles: ['admin'] as UserRole[] },
];

export function Sidebar({ userRole }: SidebarProps) {
  const pathname = usePathname();
  const { sidebarExpanded, setSidebarExpanded } = useAppStore();
  const { isToolEnabled } = useAppAvailability();
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [roleRequestsCount, setRoleRequestsCount] = useState<number>(0);
  const [storeRequestsCount, setStoreRequestsCount] = useState<number>(0);
  const [productQueueCount, setProductQueueCount] = useState<number>(0);
  const [hasStore, setHasStore] = useState<boolean>(false);

  useEffect(() => {
    if (userRole === 'moderator_a1' || userRole === 'moderator_b1' || userRole === 'admin') {
      supabase.from('role_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        .then((res: { count: number | null }) => res.count && setRoleRequestsCount(res.count));
      supabase.from('employee_store_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        .then((res: { count: number | null }) => res.count && setStoreRequestsCount(res.count));
      supabase.from('employee_store_products').select('*', { count: 'exact', head: true }).eq('status', 'pending')
        .then((res: { count: number | null }) => res.count && setProductQueueCount(res.count));
    }
    if (userRole === 'employee') {
      supabase.from('employee_stores').select('id', { count: 'exact', head: true })
        .then((res: { count: number | null }) => res.count && setHasStore(res.count > 0));
    }
  }, [userRole, supabase]);

  const orderedItems = useMemo(
    () => [
      ...navItems.map(i => ({ id: i.label, type: 'main' as const, item: i })),
      ...moderatorItems.filter(i => i.roles.includes(userRole) || (userRole === 'employee' && hasStore && i.href === '/moderator/communications/notifications'))
        .map(i => ({ id: i.label, type: 'moderator' as const, item: i })),
      ...(userRole === 'admin' ? adminItems.map(i => ({ id: i.label, type: 'admin' as const, item: i })) : [])
    ],
    [hasStore, userRole],
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <>
      <button
        type="button"
        className={`sidebar-backdrop ${sidebarExpanded ? 'sidebar-backdrop-open' : ''}`}
        onClick={() => setSidebarExpanded(false)}
      />
      <aside className={`sidebar ${sidebarExpanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
        <div className="sidebar-logo">
          <div className="sidebar-brand-lockup">
            <div className="sidebar-logo-icon">
              <Image src="/outplex-logo.webp" alt="Outplex" width={30} height={30} priority />
            </div>
            <div className="sidebar-brand-copy">
              <div className="sidebar-brand-name">Outplex</div>
              <div className="sidebar-brand-sub">Employee Rewards</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {orderedItems.map((obj, index) => {
            const prevType = index > 0 ? orderedItems[index - 1].type : null;
            const showLabel = obj.type !== prevType;
            const toolKey = 'toolKey' in obj.item ? obj.item.toolKey : undefined;
            const enabled = toolKey ? isToolEnabled(toolKey, { userRole }) : true;
            return (
              <div key={obj.id}>
                {showLabel && <div className="nav-section-label">{obj.type.toUpperCase()}</div>}
                <div className="nav-item-wrapper">
                  {enabled ? (
                    <Link href={obj.item.href} className={`nav-item ${isActive(obj.item.href) ? 'active' : ''}`}>
                      <div className="nav-slide" />
                      <obj.item.icon size={18} className="nav-icon" />
                      <span className="nav-label">{obj.item.label}</span>
                      <div className="nav-arrow">
                        <div className="nav-arrow-stem" />
                        <div className="nav-arrow-point" />
                      </div>
                      {obj.item.label === 'Employees' && roleRequestsCount > 0 && <span className="sidebar-badge">{roleRequestsCount}</span>}
                      {obj.item.label === 'Employee Stores' && (storeRequestsCount + productQueueCount) > 0 && <span className="sidebar-badge">{storeRequestsCount + productQueueCount}</span>}
                    </Link>
                  ) : (
                    <div
                      className={`nav-item nav-item-disabled ${isActive(obj.item.href) ? 'active' : ''}`}
                      aria-disabled="true"
                      title="Esta herramienta está deshabilitada temporalmente por mantenimiento."
                    >
                      <div className="nav-slide" />
                      <obj.item.icon size={18} className="nav-icon" />
                      <span className="nav-label">{obj.item.label}</span>
                      <span className="nav-maint-pill">
                        <Wrench size={14} />
                        MAINT
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <Link href="/settings" className="nav-item">
            <div className="nav-slide" />
            <Settings size={18} className="nav-icon" />
            <span className="nav-label">Settings</span>
          </Link>
          <button onClick={handleSignOut} className="nav-item danger-hover">
            <div className="nav-slide" />
            <LogOut size={18} className="nav-icon" />
            <span className="nav-label">Sign Out</span>
          </button>
        </div>

        <style>{`
          .sidebar { 
             display: flex;
             flex-direction: column;
             transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
             position: relative;
             z-index: 50;
             border: 1px solid var(--glass-border);
             overflow: hidden;
          }
          .sidebar-collapsed {
            width: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            transform: translateX(-100%);
          }
          .sidebar-logo { 
            padding: 1.5rem 1.25rem; 
            border-bottom: 1px solid var(--glass-border);
            display: flex;
            align-items: center;
            overflow: hidden;
          }
          .sidebar-brand-lockup { display: flex; align-items: center; gap: 0.75rem; min-width: 200px; }
          .sidebar-logo-icon { 
            width: 36px; height: 36px; 
            background: var(--accent-glow); 
            border: 1px solid var(--accent);
            border-radius: 10px; 
            display: flex; align-items: center; justify-content: center; 
            overflow: hidden; padding: 4px; 
            flex-shrink: 0;
          }
          .sidebar-brand-name { color: white; font-weight: 900; font-size: 1.15rem; letter-spacing: -0.02em; white-space: nowrap; }
          .sidebar-brand-sub { color: var(--text-muted); font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700; white-space: nowrap; }
          
          .sidebar-collapsed .sidebar-brand-copy,
          .sidebar-collapsed .nav-label,
          .sidebar-collapsed .nav-arrow,
          .sidebar-collapsed .nav-section-label {
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
          }

          .sidebar-expanded .sidebar-brand-copy,
          .sidebar-expanded .nav-label,
          .sidebar-expanded .nav-arrow,
          .sidebar-expanded .nav-section-label {
            opacity: 1;
            transition: opacity 0.4s ease 0.1s;
          }

          .sidebar-nav { flex: 1; padding: 1.5rem 0.75rem; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
          .nav-section-label { color: var(--text-muted); font-size: 0.65rem; font-weight: 800; padding: 1.25rem 0.75rem 0.5rem; letter-spacing: 0.1em; opacity: 0.6; }
          .nav-item-wrapper { position: relative; }
          .nav-item { 
            display: flex; align-items: center; gap: 0.8rem; padding: 0.75rem 1rem; 
            color: var(--text-secondary); text-decoration: none; border-radius: 14px; 
            position: relative; overflow: hidden; transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); 
            min-height: 48px;
          }
          .nav-item:hover { background: var(--glass-bg-hover); color: white; transform: translateX(2px); }
          .nav-item.active { background: var(--accent-glow); color: white; border: 1px solid var(--accent); }
          .nav-item-disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }
          .nav-item-disabled:hover {
            background: transparent;
            transform: none;
            color: var(--text-secondary);
          }
          .nav-item-disabled.active {
            opacity: 0.75;
          }
          .nav-maint-pill {
            margin-left: auto;
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            padding: 0.2rem 0.5rem;
            border-radius: 999px;
            background: rgba(251, 191, 36, 0.12);
            border: 1px solid rgba(251, 191, 36, 0.18);
            color: rgba(251, 191, 36, 0.92);
            font-size: 0.6rem;
            font-weight: 900;
            letter-spacing: 0.08em;
          }
          .nav-icon { transition: transform 0.4s; flex-shrink: 0; }
          .nav-item:hover .nav-icon { transform: scale(1.1) rotate(-5deg); }
          .sidebar-bottom { padding: 1.25rem 0.75rem; border-top: 1px solid var(--glass-border); }
          .sidebar-badge { background: var(--accent); color: white; padding: 0.15rem 0.45rem; border-radius: 8px; font-size: 0.65rem; font-weight: 900; margin-left: auto; }
          .danger-hover:hover { color: #f87171 !important; background: rgba(239, 68, 68, 0.1) !important; }
        `}</style>
      </aside>
    </>
  );
}
