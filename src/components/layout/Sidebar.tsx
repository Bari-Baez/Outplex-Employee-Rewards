'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Settings, Wrench } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';
import { useAppAvailability } from '@/components/layout/AppAvailabilityProvider';
import { getNavigationItem, getNavigationItems } from '@/lib/navigation';

interface SidebarProps {
  userRole: UserRole;
}

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
    () => {
      const permittedItems = getNavigationItems('sidebar', userRole);
      const employeeStoreCommunications =
        userRole === 'employee' && hasStore ? getNavigationItem('communications') : undefined;
      const items = employeeStoreCommunications
        ? [...permittedItems, employeeStoreCommunications]
        : permittedItems;

      return items.map((item) => ({ id: item.id, type: item.group, item }));
    },
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
            const toolKey = obj.item.toolKey;
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
