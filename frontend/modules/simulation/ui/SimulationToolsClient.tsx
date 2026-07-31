'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  Lock,
  Megaphone,
  RefreshCcw,
  Shield,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Users,
  UserCog,
  Wand2,
  Zap,
} from 'lucide-react';
import type { PresentationStatus } from '@backend/modules/simulation/contracts/presentation';
import { TOOL_KEYS, TOOLS_CATALOG, type ToolKey } from '@backend/modules/shell/domain/tools-catalog';
import { TOOL_SECTIONS_CATALOG, getToolSectionId } from '@backend/modules/shell/domain/tool-sections-catalog';
import type { MaintenanceBannerState, SectionAvailabilityMap, ToolAvailabilityMap } from '@backend/modules/shell/contracts/availability';

type PendingAction =
  | { action: 'resetDemo' | 'resetAndSeed'; title: string; body: string }
  | null;

const ESTIMATOR_LOCK_STORAGE_PREFIX = 'outplex:comp-calculator-unlocked-at:';

function formatRole(role: string) {
  if (role === 'admin') return 'IT Admin';
  if (role === 'moderator_a1') return 'Moderator A1';
  if (role === 'moderator_b1') return 'Moderator B1';
  if (role === 'moderator') return 'Legacy Moderator';
  return 'Employee';
}

const TOOL_ICON_MAP: Record<ToolKey, ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  ot_calendar: <CalendarDays size={18} />,
  store: <ShoppingBag size={18} />,
  raffles: <Gift size={18} />,
  orders: <ShoppingBag size={18} />,
  forms: <ClipboardList size={18} />,
  announcements: <Megaphone size={18} />,
  my_store: <Store size={18} />,
  ot_staging: <FileSpreadsheet size={18} />,
  ot_manager: <CalendarDays size={18} />,
  breaks_manager: <ClipboardList size={18} />,
  raffle_engine: <Gift size={18} />,
  store_operations: <ShoppingBag size={18} />,
  communications: <Megaphone size={18} />,
  employees: <Users size={18} />,
  employee_stores: <Store size={18} />,
  form_builder: <ClipboardList size={18} />,
};

export function SimulationToolsClient({
  initialStatus,
  initialTools,
  initialSections,
  initialBanner,
}: {
  initialStatus: PresentationStatus;
  initialTools: ToolAvailabilityMap;
  initialSections: SectionAvailabilityMap;
  initialBanner: MaintenanceBannerState;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [toolAvailability, setToolAvailability] = useState<ToolAvailabilityMap>(initialTools);
  const [sectionAvailability, setSectionAvailability] = useState<SectionAvailabilityMap>(initialSections);
  const [maintenanceBanner, setMaintenanceBanner] = useState<MaintenanceBannerState>(initialBanner);
  const [bannerDraft, setBannerDraft] = useState(initialBanner.message ?? '');
  const [bannerActiveDraft, setBannerActiveDraft] = useState(Boolean(initialBanner.active));
  const [pointInputs, setPointInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialStatus.users.map((user) => [user.id, String(user.points)])),
  );
  const [directoryQuery, setDirectoryQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; message: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    setPointInputs(Object.fromEntries(status.users.map((user) => [user.id, String(user.points)])));
  }, [status]);

  useEffect(() => {
    setBannerDraft(maintenanceBanner.message ?? '');
    setBannerActiveDraft(Boolean(maintenanceBanner.active));
  }, [maintenanceBanner.active, maintenanceBanner.message]);

  const filteredUsers = useMemo(() => {
    const query = directoryQuery.trim().toLowerCase();
    if (!query) {
      return status.users;
    }

    return status.users.filter((user) =>
      `${user.name} ${user.email} ${user.employee_id ?? ''} ${user.role}`.toLowerCase().includes(query),
    );
  }, [directoryQuery, status.users]);

  const runAction = async (
    payload: {
      action: 'ensureUsers' | 'seedDemo' | 'resetDemo' | 'resetAndSeed' | 'setPoints';
      userId?: string;
      amount?: number;
      mode?: 'set' | 'adjust';
      reason?: string;
    },
    key: string,
  ) => {
    setBusyKey(key);
    setNotice(null);

    try {
      const response = await fetch('/api/dev/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        data?: PresentationStatus;
        message?: string;
        error?: string;
      };

      if (!response.ok || !data.data) {
        throw new Error(data.error ?? 'Unable to execute this simulation action.');
      }

      setStatus(data.data);
      setNotice({ tone: 'success', message: data.message ?? 'Action completed.' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unexpected simulation error.',
      });
    } finally {
      setBusyKey(null);
      setPendingAction(null);
    }
  };

  const refreshStatus = async () => {
    setBusyKey('refresh');
    setNotice(null);
    try {
      const response = await fetch('/api/dev/demo', { method: 'GET', cache: 'no-store' });
      const data = (await response.json()) as { data?: PresentationStatus; error?: string };
      if (!response.ok || !data.data) {
        throw new Error(data.error ?? 'Unable to refresh the demo status.');
      }
      setStatus(data.data);
      setNotice({ tone: 'success', message: 'Simulation status refreshed.' });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to refresh the demo status.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const runToolsUpdate = async (
    payload: {
      toolUpdates?: Partial<Record<ToolKey, boolean>>;
      sectionUpdates?: Partial<Record<string, boolean>>;
      banner?: MaintenanceBannerState;
    },
    key: string,
    successMessage: string,
  ) => {
    setBusyKey(key);
    setNotice(null);

    try {
      const response = await fetch('/api/admin/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as {
        tools?: ToolAvailabilityMap;
        sections?: SectionAvailabilityMap;
        banner?: MaintenanceBannerState;
        error?: string;
      };

      if (!response.ok || !data.tools || !data.banner || !data.sections) {
        throw new Error(data.error ?? 'Unable to update the tool configuration.');
      }

      setToolAvailability(data.tools);
      setSectionAvailability(data.sections);
      setMaintenanceBanner(data.banner);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('outplex-tools-updated'));
      }
      setNotice({ tone: 'success', message: successMessage });
    } catch (error) {
      setNotice({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Unable to update the tool configuration.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const setToolEnabled = async (toolKey: ToolKey, enabled: boolean) => {
    const label = TOOLS_CATALOG.find((tool) => tool.key === toolKey)?.label ?? toolKey;
    await runToolsUpdate(
      { toolUpdates: { [toolKey]: enabled } },
      `tool:${toolKey}`,
      `${enabled ? 'Habilitada' : 'Deshabilitada'}: ${label}.`,
    );
  };

  const setAllToolsEnabled = async (enabled: boolean) => {
    const updates = Object.fromEntries(TOOL_KEYS.map((key) => [key, enabled])) as Record<ToolKey, boolean>;
    await runToolsUpdate(
      { toolUpdates: updates },
      enabled ? 'tools:enableAll' : 'tools:disableAll',
      enabled ? 'Todas las herramientas habilitadas.' : 'Todas las herramientas deshabilitadas para el público.',
    );
  };

  const setSectionEnabled = async (toolKey: ToolKey, sectionKey: string, enabled: boolean) => {
    const id = getToolSectionId(toolKey, sectionKey);
    const label =
      TOOL_SECTIONS_CATALOG.find((s) => s.toolKey === toolKey && s.sectionKey === sectionKey)?.label ?? sectionKey;
    await runToolsUpdate(
      { sectionUpdates: { [id]: enabled } },
      `section:${id}`,
      `${enabled ? 'Habilitada' : 'Deshabilitada'}: ${toolKey} → ${label}.`,
    );
  };

  const setAllSectionsEnabled = async (enabled: boolean) => {
    const updates = Object.fromEntries(TOOL_SECTIONS_CATALOG.map((s) => [getToolSectionId(s.toolKey, s.sectionKey), enabled]));
    await runToolsUpdate(
      { sectionUpdates: updates },
      enabled ? 'sections:enableAll' : 'sections:disableAll',
      enabled ? 'Todas las secciones habilitadas.' : 'Todas las secciones deshabilitadas para el público.',
    );
  };

  const saveBanner = async (next: MaintenanceBannerState) => {
    await runToolsUpdate(
      { banner: next },
      'banner:save',
      next.active ? 'Aviso de mantenimiento actualizado.' : 'Aviso de mantenimiento desactivado.',
    );
  };

  const quickPointAction = async (userId: string, amount: number, mode: 'set' | 'adjust', reason: string, key: string) => {
    await runAction({ action: 'setPoints', userId, amount, mode, reason }, key);
  };

  const resetEstimatorLock = () => {
    if (typeof window === 'undefined') {
      return;
    }

    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(ESTIMATOR_LOCK_STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    setNotice({
      tone: 'success',
      message:
        keysToRemove.length > 0
          ? 'The Quincena estimator lock was reset in this browser. You can record the unlock flow again.'
          : 'No active Quincena estimator unlock state was found in this browser.',
    });
  };

  return (
    <div className="simulation-shell animate-fade-in">
      <section className="simulation-hero card">
        <div className="simulation-hero-copy">
          <div className="simulation-chip">
            <ShieldAlert size={14} />
            IT-only presentation controls
          </div>
          <h1>Demo Control Center</h1>
          <p>
            Reset the environment, seed a polished dataset, and tune balances live without touching Supabase manually during the presentation.
          </p>
        </div>

        <div className="simulation-hero-actions">
          <button className="btn btn-secondary" onClick={() => void refreshStatus()} disabled={busyKey !== null}>
            <RefreshCcw size={16} />
            {busyKey === 'refresh' ? 'Refreshing...' : 'Refresh status'}
          </button>
          <button className="btn btn-ghost" onClick={resetEstimatorLock}>
            <Lock size={16} />
            Reset estimator lock
          </button>
          <Link href="/moderator/points" className="btn btn-ghost">
            <UserCog size={16} />
            Open points manager
          </Link>
        </div>
      </section>

      {notice && (
        <div className={`simulation-notice simulation-notice-${notice.tone}`}>
          {notice.tone === 'success' ? <BadgeCheck size={16} /> : <AlertTriangle size={16} />}
          <span>{notice.message}</span>
        </div>
      )}

      <section className="card simulation-panel">
        <div className="simulation-panel-head simulation-panel-head-split">
          <div>
            <h2>Tool availability</h2>
            <p>Disable modules during maintenance so employees and moderators cannot access them. IT Admin always retains access.</p>
          </div>
          <div className="tool-bulk-actions">
            <button className="btn btn-secondary" onClick={() => void setAllToolsEnabled(false)} disabled={busyKey !== null}>
              <Shield size={16} />
              Disable all
            </button>
            <button className="btn btn-ghost" onClick={() => void setAllToolsEnabled(true)} disabled={busyKey !== null}>
              <Sparkles size={16} />
              Enable all
            </button>
          </div>
        </div>

        <div className="tool-grid">
          {TOOLS_CATALOG.map((tool) => {
            const enabled = toolAvailability[tool.key] !== false;
            return (
              <div key={tool.key} className={`tool-tile ${enabled ? '' : 'tool-tile-off'}`}>
                <div className="tool-tile-icon">{TOOL_ICON_MAP[tool.key]}</div>
                <div className="tool-tile-copy">
                  <strong>{tool.label}</strong>
                  <span>{tool.href}</span>
                </div>
                <label className="tool-switch" aria-label={`${tool.label} enabled`} title={enabled ? 'Enabled' : 'Disabled'}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => void setToolEnabled(tool.key, event.target.checked)}
                    disabled={busyKey !== null}
                  />
                  <span className="tool-switch-track" aria-hidden="true" />
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card simulation-panel">
        <div className="simulation-panel-head simulation-panel-head-split">
          <div>
            <h2>Section availability</h2>
            <p>Disable specific areas within a module (subroutes/tabs). Employees and moderators will see the maintenance screen. IT can still access for testing.</p>
          </div>
          <div className="tool-bulk-actions">
            <button className="btn btn-secondary" onClick={() => void setAllSectionsEnabled(false)} disabled={busyKey !== null}>
              <Shield size={16} />
              Disable all sections
            </button>
            <button className="btn btn-ghost" onClick={() => void setAllSectionsEnabled(true)} disabled={busyKey !== null}>
              <Sparkles size={16} />
              Enable all sections
            </button>
          </div>
        </div>

        <div className="sections-stack">
          {Array.from(new Set(TOOL_SECTIONS_CATALOG.map((s) => s.toolKey))).map((toolKey) => {
            const sections = TOOL_SECTIONS_CATALOG.filter((s) => s.toolKey === toolKey);
            return (
              <div key={toolKey} className="sections-group">
                <div className="sections-group-head">
                  <div className="sections-group-title">
                    <span className="sections-group-icon">{TOOL_ICON_MAP[toolKey]}</span>
                    <strong>{toolKey}</strong>
                  </div>
                  <span className="sections-group-sub">{sections.length} section(s)</span>
                </div>

                <div className="sections-grid">
                  {sections.map((section) => {
                    const id = getToolSectionId(section.toolKey, section.sectionKey);
                    const enabled = sectionAvailability[id] !== false;
                    return (
                      <div key={id} className={`section-tile ${enabled ? '' : 'section-tile-off'}`}>
                        <div className="section-tile-copy">
                          <strong>{section.label}</strong>
                          <span>{section.sectionKey}</span>
                        </div>
                        <label className="tool-switch" aria-label={`${section.label} enabled`} title={enabled ? 'Enabled' : 'Disabled'}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => void setSectionEnabled(section.toolKey, section.sectionKey, event.target.checked)}
                            disabled={busyKey !== null}
                          />
                          <span className="tool-switch-track" aria-hidden="true" />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card simulation-panel">
        <div className="simulation-panel-head simulation-panel-head-split">
          <div>
            <h2>Maintenance broadcast</h2>
            <p>Push a global notice across the dashboard when you are performing maintenance or deploying updates.</p>
          </div>
          <div className="tool-bulk-actions">
            <button
              className="btn btn-primary"
              onClick={() => void saveBanner({ active: bannerActiveDraft, message: bannerDraft })}
              disabled={busyKey !== null}
            >
              Save banner
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setBannerDraft('');
                setBannerActiveDraft(false);
                void saveBanner({ active: false, message: '' });
              }}
              disabled={busyKey !== null}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="banner-grid">
          <label className="field-stack banner-field">
            <span>Banner message</span>
            <textarea
              className="input banner-textarea"
              value={bannerDraft}
              onChange={(event) => setBannerDraft(event.target.value)}
              placeholder="Example: Store checkout is under maintenance. Please try again later."
              rows={4}
            />
          </label>

          <div className="banner-side">
            <div className="banner-toggle-row">
              <div>
                <div className="banner-toggle-title">Broadcast enabled</div>
                <div className="banner-toggle-sub">Shown at the top of the app for non-IT users.</div>
              </div>
              <label className="tool-switch" aria-label="Maintenance banner enabled">
                <input
                  type="checkbox"
                  checked={bannerActiveDraft}
                  onChange={(event) => setBannerActiveDraft(event.target.checked)}
                  disabled={busyKey !== null}
                />
                <span className="tool-switch-track" aria-hidden="true" />
              </label>
            </div>

            {maintenanceBanner.active && maintenanceBanner.message.trim() && (
              <div className="banner-preview">
                <div className="banner-preview-kicker">Live preview</div>
                <div className="banner-preview-message">{maintenanceBanner.message}</div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="simulation-stats">
        <StatCard label="Store Items" value={status.counts.storeItems} helper={`${status.counts.lowStockItems} low stock`} />
        <StatCard label="Store Orders" value={status.counts.storeOrders} helper="Grouped order history" />
        <StatCard label="OT Slots" value={status.counts.otSlots} helper={`${status.counts.claimedOtSlots} claimed`} />
        <StatCard label="Raffles" value={status.counts.raffles} helper="Upcoming + completed" />
        <StatCard label="Notifications" value={status.counts.notifications} helper="Bell drawer content" />
        <StatCard label="Ledger" value={status.counts.pointsLedger} helper="Points activity trail" />
      </section>

      <div className="simulation-grid">
        <section className="card simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <h2>Presentation dataset</h2>
              <p>Keep the demo crisp: sync accounts, wipe test noise, or repopulate the app with polished NYT-themed data.</p>
            </div>
          </div>

          <div className="action-grid">
            <button className="action-card" onClick={() => void runAction({ action: 'ensureUsers' }, 'ensureUsers')} disabled={busyKey !== null}>
              <div className="action-card-icon"><UserCog size={18} /></div>
              <strong>Sync demo users</strong>
              <span>Guarantee admin, moderator, and employee demo accounts with the default password.</span>
            </button>

            <button className="action-card" onClick={() => void runAction({ action: 'seedDemo' }, 'seedDemo')} disabled={busyKey !== null}>
              <div className="action-card-icon"><Sparkles size={18} /></div>
              <strong>Seed professional data</strong>
              <span>Populate store, OT, raffles, tickets, notifications, and activity with presentation-ready content.</span>
            </button>

            <button className="action-card action-card-danger" onClick={() => setPendingAction({
              action: 'resetDemo',
              title: 'Reset presentation data?',
              body: 'This removes the current demo activity and zeroes the demo balances, but keeps the demo accounts available.',
            })} disabled={busyKey !== null}>
              <div className="action-card-icon"><Trash2 size={18} /></div>
              <strong>Reset test data</strong>
              <span>Clear orders, OT, raffles, notifications, store items, and demo operational history.</span>
            </button>

            <button className="action-card action-card-primary" onClick={() => setPendingAction({
              action: 'resetAndSeed',
              title: 'Reset and reseed the presentation?',
              body: 'This is the cleanest option before a live demo. It wipes current activity and immediately recreates the polished sample dataset.',
            })} disabled={busyKey !== null}>
              <div className="action-card-icon"><Wand2 size={18} /></div>
              <strong>Reset + seed in one click</strong>
              <span>Rebuild the entire demo dataset in one safe pass before you present.</span>
            </button>
          </div>
        </section>

        <section className="card simulation-panel">
          <div className="simulation-panel-head">
            <div>
              <h2>Demo credentials</h2>
              <p>These are the accounts to use during the presentation. The password is shared across the three demo profiles.</p>
            </div>
            <div className="password-pill">
              <Zap size={14} />
              Password: <strong>{status.defaultPassword}</strong>
            </div>
          </div>

          <div className="credential-list">
            {status.demoUsers.map((user) => (
              <div key={user.id} className="credential-card">
                <div>
                  <div className="credential-role">{formatRole(user.role)}</div>
                  <strong>{user.name}</strong>
                  <div className="credential-meta">{user.email} • {user.employee_id ?? 'No employee ID'}</div>
                </div>
                <div className="credential-points">{user.points.toLocaleString('en-US')} pts</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="simulation-demo-users">
        {status.demoUsers.map((user) => (
          <article key={user.id} className="card demo-user-card">
            <div className="demo-user-head">
              <div>
                <div className="demo-user-role">{formatRole(user.role)}</div>
                <h3>{user.name}</h3>
                <div className="demo-user-meta">{user.email} • {user.employee_id ?? 'No employee ID'}</div>
              </div>
              <div className="demo-user-balance">{user.points.toLocaleString('en-US')} pts</div>
            </div>

            <div className="demo-user-controls">
              <label className="field-stack">
                <span>Exact balance</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={pointInputs[user.id] ?? String(user.points)}
                  onChange={(event) => setPointInputs((current) => ({ ...current, [user.id]: event.target.value }))}
                />
              </label>
              <div className="demo-user-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void quickPointAction(user.id, 1000, 'adjust', 'IT demo boost (+1000)', `plus1000:${user.id}`)}
                  disabled={busyKey !== null}
                >
                  +1,000
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void quickPointAction(user.id, 10000, 'adjust', 'IT demo boost (+10000)', `plus10000:${user.id}`)}
                  disabled={busyKey !== null}
                >
                  +10,000
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => void quickPointAction(
                    user.id,
                    Number(pointInputs[user.id] ?? user.points),
                    'set',
                    'IT exact demo balance',
                    `set:${user.id}`,
                  )}
                  disabled={busyKey !== null}
                >
                  Set exact
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void quickPointAction(user.id, 0, 'set', 'IT demo reset balance', `clear:${user.id}`)}
                  disabled={busyKey !== null}
                >
                  Clear
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="card simulation-panel">
        <div className="simulation-panel-head">
          <div>
            <h2>User balances</h2>
            <p>Every account in the system is visible here so IT can fine-tune exact balances without leaving the demo panel.</p>
          </div>
          <input
            className="input simulation-search"
            value={directoryQuery}
            onChange={(event) => setDirectoryQuery(event.target.value)}
            placeholder="Search by name, email, ID or role"
          />
        </div>

        <div className="simulation-table-shell">
          <table className="data-table simulation-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Department</th>
                <th>Points</th>
                <th>Edit Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="table-user">
                      <strong>{user.name}</strong>
                      <span>{user.email} • {user.employee_id ?? 'No employee ID'}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${
                      user.role === 'admin' 
                        ? 'badge-purple' 
                        : (user.role === 'moderator_a1' || user.role === 'moderator_b1' || user.role === 'moderator') 
                          ? 'badge-claimed' 
                          : ''
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td>{user.department ?? 'Unassigned'}</td>
                  <td>{user.points.toLocaleString('en-US')} pts</td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={pointInputs[user.id] ?? String(user.points)}
                      onChange={(event) => setPointInputs((current) => ({ ...current, [user.id]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void quickPointAction(user.id, 1000, 'adjust', 'IT quick top-up', `row-plus:${user.id}`)}
                        disabled={busyKey !== null}
                      >
                        +1,000
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => void quickPointAction(
                          user.id,
                          Number(pointInputs[user.id] ?? user.points),
                          'set',
                          'IT exact demo balance',
                          `row-set:${user.id}`,
                        )}
                        disabled={busyKey !== null}
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="simulation-empty">
                    No users matched that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pendingAction && (
        <div className="modal-overlay" onClick={() => setPendingAction(null)}>
          <div className="simulation-modal card animate-fade-in" onClick={(event) => event.stopPropagation()}>
            <div className="modal-kicker">Confirm action</div>
            <h3>{pendingAction.title}</h3>
            <p>{pendingAction.body}</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setPendingAction(null)} disabled={busyKey !== null}>
                Cancel
              </button>
              <button
                className={`btn ${pendingAction.action === 'resetAndSeed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => void runAction({ action: pendingAction.action }, pendingAction.action)}
                disabled={busyKey !== null}
              >
                {busyKey === pendingAction.action ? 'Working...' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .simulation-shell {
          display: grid;
          gap: 1rem;
          max-width: 1400px;
        }
        .simulation-hero {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .simulation-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.4rem 0.7rem;
          border-radius: 999px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: var(--brand-primary-light);
          font-size: 0.78rem;
          font-weight: 700;
          margin-bottom: 0.85rem;
        }
        .simulation-hero h1 {
          margin: 0 0 0.5rem;
          font-size: 2rem;
        }
        .simulation-hero p {
          margin: 0;
          color: var(--text-secondary);
          max-width: 760px;
          line-height: 1.65;
        }
        .simulation-hero-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .simulation-notice {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          border-radius: 14px;
          padding: 0.9rem 1rem;
          border: 1px solid transparent;
        }
        .simulation-notice-success {
          background: rgba(16, 185, 129, 0.1);
          color: #9cf5cc;
          border-color: rgba(16, 185, 129, 0.18);
        }
        .simulation-notice-danger {
          background: rgba(239, 68, 68, 0.1);
          color: #fecaca;
          border-color: rgba(239, 68, 68, 0.18);
        }
        .simulation-stats {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.9rem;
        }
        .simulation-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 1rem;
        }
        .stat-card {
          display: grid;
          gap: 0.35rem;
        }
        .stat-card-label {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .stat-card-value {
          font-size: 1.9rem;
          font-weight: 800;
          line-height: 1;
        }
        .stat-card-helper {
          color: var(--text-secondary);
          font-size: 0.82rem;
        }
        .simulation-panel {
          display: grid;
          gap: 1rem;
        }
        .simulation-panel-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          flex-wrap: wrap;
        }
        .simulation-panel-head-split {
          align-items: center;
        }
        .tool-bulk-actions {
          display: inline-flex;
          gap: 0.6rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .tool-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }
        .tool-tile {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 0.95rem 1rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(13, 18, 38, 0.72);
          transition: transform 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
        }
        .tool-tile:hover {
          transform: translateY(-1px);
          border-color: rgba(124, 108, 255, 0.28);
        }
        .tool-tile-off {
          opacity: 0.72;
          border-color: rgba(251, 191, 36, 0.16);
        }
        .tool-tile-icon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(109, 93, 252, 0.14);
          border: 1px solid rgba(109, 93, 252, 0.18);
          color: rgba(226, 232, 240, 0.95);
          flex-shrink: 0;
        }
        .tool-tile-off .tool-tile-icon {
          background: rgba(251, 191, 36, 0.10);
          border-color: rgba(251, 191, 36, 0.18);
          color: rgba(251, 191, 36, 0.92);
        }
        .tool-tile-copy {
          min-width: 0;
          display: grid;
          gap: 0.15rem;
        }
        .tool-tile-copy strong {
          font-size: 0.95rem;
          letter-spacing: -0.01em;
        }
        .tool-tile-copy span {
          color: var(--text-muted);
          font-size: 0.78rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tool-switch {
          margin-left: auto;
          position: relative;
          width: 52px;
          height: 30px;
          flex-shrink: 0;
          cursor: pointer;
        }
        .tool-switch input {
          position: absolute;
          opacity: 0;
          inset: 0;
          margin: 0;
        }
        .tool-switch-track {
          position: absolute;
          inset: 0;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(148, 163, 184, 0.12);
          transition: background 0.18s ease, border-color 0.18s ease;
        }
        .tool-switch-track::after {
          content: '';
          position: absolute;
          top: 3px;
          left: 3px;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.92);
          box-shadow: 0 8px 18px rgba(0,0,0,0.35);
          transition: transform 0.18s ease, background 0.18s ease;
        }
        .tool-switch input:checked + .tool-switch-track {
          background: rgba(109, 93, 252, 0.32);
          border-color: rgba(109, 93, 252, 0.35);
        }
        .tool-tile-off .tool-switch input:checked + .tool-switch-track {
          background: rgba(251, 191, 36, 0.22);
          border-color: rgba(251, 191, 36, 0.28);
        }
        .tool-switch input:checked + .tool-switch-track::after {
          transform: translateX(22px);
          background: rgba(255,255,255,0.98);
        }
        .tool-switch input:disabled + .tool-switch-track {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .banner-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr;
          gap: 1rem;
          align-items: start;
        }
        .banner-textarea {
          min-height: 110px;
          resize: vertical;
        }
        .banner-side {
          display: grid;
          gap: 0.85rem;
        }
        .banner-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.9rem 1rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(13, 18, 38, 0.62);
        }
        .banner-toggle-title {
          font-weight: 900;
          letter-spacing: -0.01em;
        }
        .banner-toggle-sub {
          color: var(--text-muted);
          font-size: 0.82rem;
          margin-top: 0.15rem;
          line-height: 1.35;
        }
        .banner-preview {
          padding: 0.95rem 1rem;
          border-radius: 18px;
          border: 1px solid rgba(251, 191, 36, 0.18);
          background: linear-gradient(135deg, rgba(251, 191, 36, 0.08), rgba(109, 93, 252, 0.04));
        }
        .banner-preview-kicker {
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(251, 191, 36, 0.92);
          margin-bottom: 0.35rem;
        }
        .banner-preview-message {
          color: rgba(226, 232, 240, 0.92);
          font-weight: 650;
          line-height: 1.5;
          white-space: pre-wrap;
        }

        .sections-stack {
          display: grid;
          gap: 1rem;
        }
        .sections-group {
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(13, 18, 38, 0.55);
          border-radius: 22px;
          padding: 1rem;
          display: grid;
          gap: 0.85rem;
        }
        .sections-group-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .sections-group-title {
          display: inline-flex;
          align-items: center;
          gap: 0.65rem;
        }
        .sections-group-icon {
          width: 36px;
          height: 36px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(109, 93, 252, 0.14);
          border: 1px solid rgba(109, 93, 252, 0.18);
          color: rgba(226,232,240,0.95);
        }
        .sections-group-sub {
          color: var(--text-muted);
          font-size: 0.82rem;
          font-weight: 700;
        }
        .sections-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .section-tile {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.85rem 0.9rem;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(18, 24, 44, 0.55);
        }
        .section-tile-off {
          opacity: 0.75;
          border-color: rgba(251, 191, 36, 0.16);
        }
        .section-tile-copy {
          display: grid;
          gap: 0.15rem;
          min-width: 0;
        }
        .section-tile-copy strong {
          font-size: 0.92rem;
        }
        .section-tile-copy span {
          color: var(--text-muted);
          font-size: 0.78rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .simulation-panel h2 {
          margin: 0 0 0.3rem;
        }
        .simulation-panel p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.55;
        }
        .action-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.85rem;
        }
        .action-card {
          display: grid;
          gap: 0.55rem;
          text-align: left;
          border-radius: 18px;
          padding: 1rem;
          border: 1px solid var(--border-subtle);
          background: rgba(13, 18, 38, 0.78);
          color: var(--text-primary);
          cursor: pointer;
          transition: transform 0.18s ease, border-color 0.18s ease;
        }
        .action-card:hover {
          transform: translateY(-1px);
          border-color: rgba(124, 108, 255, 0.34);
        }
        .action-card strong {
          font-size: 0.98rem;
        }
        .action-card span {
          color: var(--text-secondary);
          font-size: 0.86rem;
          line-height: 1.45;
        }
        .action-card-danger {
          border-color: rgba(239, 68, 68, 0.24);
        }
        .action-card-primary {
          border-color: rgba(59, 130, 246, 0.24);
          background: linear-gradient(180deg, rgba(38, 56, 106, 0.32), rgba(13, 18, 38, 0.92));
        }
        .action-card-icon {
          width: 2.35rem;
          height: 2.35rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: rgba(124, 108, 255, 0.16);
          color: var(--brand-primary-light);
        }
        .password-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.55rem 0.75rem;
          border-radius: 999px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-elevated);
          font-size: 0.85rem;
        }
        .password-pill strong {
          color: var(--text-primary);
        }
        .credential-list {
          display: grid;
          gap: 0.75rem;
        }
        .credential-card,
        .demo-user-card {
          background: rgba(18, 24, 44, 0.72);
          border: 1px solid var(--border-subtle);
        }
        .credential-card {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: center;
          padding: 0.95rem 1rem;
          border-radius: 16px;
        }
        .credential-role,
        .demo-user-role {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin-bottom: 0.25rem;
        }
        .credential-meta,
        .demo-user-meta {
          color: var(--text-secondary);
          font-size: 0.85rem;
        }
        .credential-points,
        .demo-user-balance {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--brand-primary-light);
        }
        .simulation-demo-users {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
        }
        .demo-user-card {
          display: grid;
          gap: 1rem;
        }
        .demo-user-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
        }
        .demo-user-head h3 {
          margin: 0 0 0.3rem;
        }
        .demo-user-controls {
          display: grid;
          gap: 0.8rem;
        }
        .field-stack {
          display: grid;
          gap: 0.35rem;
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .demo-user-actions,
        .table-actions {
          display: flex;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .simulation-search {
          width: min(320px, 100%);
        }
        .simulation-table-shell {
          overflow: auto;
        }
        .simulation-table td,
        .simulation-table th {
          vertical-align: middle;
        }
        .table-user {
          display: grid;
          gap: 0.2rem;
        }
        .table-user span {
          color: var(--text-secondary);
          font-size: 0.82rem;
        }
        .simulation-empty {
          text-align: center;
          color: var(--text-muted);
          padding: 1.5rem 0;
        }
        .simulation-modal {
          width: min(560px, calc(100vw - 2rem));
          display: grid;
          gap: 0.85rem;
        }
        .simulation-modal h3 {
          margin: 0;
          font-size: 1.25rem;
        }
        .simulation-modal p {
          margin: 0;
          color: var(--text-secondary);
          line-height: 1.6;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        @media (max-width: 1200px) {
          .simulation-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .tool-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .sections-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .simulation-grid,
          .simulation-demo-users {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 860px) {
          .action-grid {
            grid-template-columns: 1fr;
          }
          .tool-grid {
            grid-template-columns: 1fr;
          }
          .sections-grid {
            grid-template-columns: 1fr;
          }
          .banner-grid {
            grid-template-columns: 1fr;
          }
          .simulation-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .credential-card,
          .demo-user-head {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @media (max-width: 640px) {
          .simulation-stats {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="card stat-card">
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-helper">{helper}</div>
    </div>
  );
}
