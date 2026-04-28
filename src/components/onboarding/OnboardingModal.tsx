'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  User, AlertCircle, Send, Mic, MessageSquare,
  ArrowRight, Sparkles, ShieldCheck, Clock, Star,
  CheckCircle, ArrowLeft, CreditCard,
  Pencil, Lock, RefreshCw, Eye,
} from 'lucide-react';
import type { User as UserType } from '@/types/database';
import { ModernSelect } from '@/components/ui/Select';

interface RoleRequestRef {
  id: string;
  status: 'pending' | 'approved' | 'reviewing' | 'rejected';
  notes?: string | null;
}

interface OnboardingModalProps {
  user: UserType;
  roleRequest: RoleRequestRef | null;
  onComplete: () => void;
}

interface Supervisor { id: string; name: string; }

const DEPTS = [
  { name: 'New York Times', tier: 'Tier 1', icon: Mic,           color: '#818cf8', border: 'rgba(99,102,241,0.3)',  bg: 'rgba(99,102,241,0.10)',  desc: 'Agent nivel básico' },
  { name: 'New York Times', tier: 'Tier 2', icon: Mic,           color: '#a78bfa', border: 'rgba(139,92,246,0.3)', bg: 'rgba(139,92,246,0.10)', desc: 'Agent nivel intermedio' },
  { name: 'New York Times', tier: 'Tier 3', icon: Mic,           color: '#c084fc', border: 'rgba(168,85,247,0.3)', bg: 'rgba(168,85,247,0.10)', desc: 'Agent nivel avanzado' },
  { name: 'New York Times', tier: 'Digital',icon: MessageSquare, color: '#38bdf8', border: 'rgba(14,165,233,0.3)', bg: 'rgba(14,165,233,0.10)', desc: 'Soporte vía chat y email' },
  { name: 'Subject Matter Expert', tier: 'SME',  icon: Star,          color: '#fbbf24', border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.10)', desc: 'Experto en materia — SME' },
];

type OnboardingStep  = 'department' | 'profile' | 'request' | 'pending' | 'approved' | 'rejected';
type RequestStatus   = 'pending' | 'reviewing' | 'approved' | 'rejected' | null;

// ── Inline style constants (always applied, bypass styled-jsx) ────────────
const S = {
  overlay: {
    position: 'fixed' as const,
    top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'rgba(6, 8, 18, 0.94)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    padding: '1.25rem',
    pointerEvents: 'all' as const,
    userSelect: 'none' as const,
  },
  card: {
    width: '100%',
    maxWidth: '660px',
    maxHeight: '92vh',
    background: 'linear-gradient(160deg, #141828 0%, #0e1220 100%)',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: '28px',
    padding: '2.5rem',
    position: 'relative' as const,
    color: 'white',
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    boxShadow: '0 0 0 1px rgba(99,102,241,0.08), 0 40px 120px rgba(0,0,0,0.8)',
    display: 'flex',
    flexDirection: 'column' as const,
    userSelect: 'text' as const,
  },
} as const;

// ── Editable field with Slack-sync indicator ──────────────────────────────
function EditableField({
  label, value, onChange, placeholder, required, icon, fromSlack,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; icon?: React.ReactNode; fromSlack?: boolean;
}) {
  const [editing, setEditing] = useState(!fromSlack || !value);
  return (
    <div className="ob-field">
      <div className="ob-label-row">
        <label className="ob-label">
          {label}{required && <span className="ob-req"> *</span>}
        </label>
        {fromSlack && value && (
          <span className="ob-synced-pill">
            <Sparkles size={9} /> {editing ? 'Editing' : 'Synced from Slack'}
          </span>
        )}
      </div>
      <div className="ob-field-wrap">
        {icon && <span className="ob-field-icon">{icon}</span>}
        <input
          className={`ob-input${icon ? ' padded' : ''}${!editing && fromSlack && value ? ' is-synced' : ''}`}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={!editing}
          required={required}
        />
        {fromSlack && value && (
          <button type="button" className="ob-toggle-btn" onClick={() => setEditing(p => !p)}>
            {editing ? <Lock size={11} /> : <Pencil size={11} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export function OnboardingModal({ user, roleRequest, onComplete }: OnboardingModalProps) {
  const router = useRouter();
  const supabase = createClient();

  const initialStep: OnboardingStep =
    roleRequest?.status === 'approved' ? 'approved'
    : roleRequest?.status === 'pending' || roleRequest?.status === 'reviewing' ? 'pending'
    : roleRequest?.status === 'rejected' ? 'rejected'
    : 'department';

  const [step, setStep]           = useState<OnboardingStep>(initialStep);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [selectedDept, setSelectedDept]   = useState('');
  const [profileName, setProfileName]     = useState(user.name ?? '');
  const [profileEmpId, setProfileEmpId]   = useState(user.employee_id ?? '');
  const [profileSupId, setProfileSupId]   = useState('none');
  const [supervisors, setSupervisors]     = useState<Supervisor[]>([]);
  const [loadingSups, setLoadingSups]     = useState(false);
  const [supervisorLoadError, setSupervisorLoadError] = useState<string | null>(null);
  const [reqName, setReqName]             = useState(user.name ?? '');
  const [reqEmpId, setReqEmpId]           = useState(user.employee_id ?? '');
  const [reqArea, setReqArea]             = useState('');
  const [reqReason, setReqReason]         = useState('');
  const [requestStatus, setRequestStatus] = useState<RequestStatus>(
    roleRequest?.status as RequestStatus ?? null
  );
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [lastChecked, setLastChecked]       = useState<Date | null>(null);

  const [isExiting, setIsExiting]   = useState(false);
  const [mounted, setMounted]     = useState(false);

  // ── Scroll Lock & Redirection Persistence ──
  useEffect(() => {
    setMounted(true);
    // Lock scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Logic: If user was "pending" or "reviewing" and just refreshed/opened a new tab,
    // we want them to go to /login first to click "Login with Slack" again.
    const currentStatus = roleRequest?.status;
    
    // Check if we just arrived from a fresh Slack login
    const searchParams = new URLSearchParams(window.location.search);
    const justLoggedIn = searchParams.get('onboarding_auth') === '1';

    if (justLoggedIn) {
      sessionStorage.setItem('ob_not_first_load', 'true');
      // Clean up the URL
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }

    const isReturningVisit = !sessionStorage.getItem('ob_not_first_load');
    
    if ((currentStatus === 'pending' || currentStatus === 'reviewing') && isReturningVisit) {
      // Force logout and send to login screen
      supabase.auth.signOut().then(() => {
        router.replace('/login');
      });
    } else {
      sessionStorage.setItem('ob_not_first_load', 'true');
    }

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [roleRequest?.status, router, supabase.auth]);

  // ── Intercept browser Back button → sign out & go to login ──
  useEffect(() => {
    // Push a dummy state so Back has something to intercept
    window.history.pushState({ onboarding: true }, '');

    const handlePopState = async () => {
      // User pressed Back — immediately hide UI and block screen
      setIsExiting(true);
      // User pressed Back — sign them out and redirect to login
      await supabase.auth.signOut();
      router.replace('/login');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [router, supabase.auth]);

  // ── Load supervisors when entering profile step ──
  const loadSupervisors = useCallback(async () => {
    setLoadingSups(true);
    setSupervisorLoadError(null);
    try {
      const res = await fetch('/api/onboarding/supervisors');
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load supervisors.');
      }
      setSupervisors(data.supervisors ?? []);
    } catch (err) {
      setSupervisors([]);
      setSupervisorLoadError(err instanceof Error ? err.message : 'Failed to load supervisors.');
    } finally {
      setLoadingSups(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 'profile') return;
    void loadSupervisors();
  }, [loadSupervisors, step]);

  const nameFromSlack = !!(user.name?.trim());
  const idFromSlack   = !!(user.employee_id?.trim());

  // ── Check Status (polls the API) ──
  const handleCheckStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const res  = await fetch('/api/user/role-request/status');
      const data = await res.json();
      setLastChecked(new Date());
      if (data.status === 'approved') {
        setRequestStatus('approved');
        setTimeout(() => setStep('approved'), 500);
      } else if (data.status === 'reviewing') {
        setRequestStatus('reviewing');
      } else {
        setRequestStatus('pending');
      }
    } catch { /* ignore */ }
    finally { setCheckingStatus(false); }
  }, []);

  // ── Step handlers ──
  const handleSelectDept = (dept: typeof DEPTS[0]) => {
    setSelectedDept(dept.tier ? `${dept.name} ${dept.tier}` : dept.name);
    setError(null);
    setStep('profile');
  };

  const handleCompleteProfile = async () => {
    if (!profileName.trim() || !profileEmpId.trim()) {
      setError('Full Name and Employee ID are required.'); return;
    }
    if (profileSupId === 'none') {
      setError('Please select your supervisor.'); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/onboarding/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName.trim(),
          employee_id: profileEmpId.trim(),
          supervisor_id: profileSupId === 'none' ? null : profileSupId,
          department: selectedDept,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save profile.');
      onComplete(); router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile.');
    } finally { setLoading(false); }
  };

  const handleSubmitRequest = async () => {
    if (!reqName.trim() || !reqEmpId.trim() || !reqArea.trim() || !reqReason.trim()) {
      setError('All fields are required.'); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/onboarding/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: reqName.trim(), employee_id: reqEmpId.trim(), functional_area: reqArea.trim(), reason: reqReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setRequestStatus('pending');
      setStep('pending');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit request.');
    } finally { setLoading(false); }
  };

  const handleCancelRequest = async () => {
    setLoading(true); setError(null);
    try { await fetch('/api/user/role-request/cancel', { method: 'POST' }); } catch { /* ignore */ }
    finally { setLoading(false); setRequestStatus(null); setStep('department'); }
  };

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      await fetch('/api/user/role-request/acknowledge', { method: 'POST' });
      onComplete(); router.refresh();
    } catch { setLoading(false); }
  };

  const handleLogout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    router.replace('/login');
  };

  // ── Reusable sub-components ──
  const Avatar = () => (
    <div className="ob-avatar">
      {user.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={user.avatar_url} alt="avatar" />
        : <User size={15} />}
    </div>
  );

  const UserChip = () => (
    <div className="ob-user-row">
      <span className="ob-user-email">{user.email}</span>
      <Avatar />
    </div>
  );

  const TopBar = ({ showBack, onBack }: { showBack?: boolean; onBack?: () => void }) => (
    <div className="ob-topbar">
      <div className="ob-top-left">
        {showBack ? (
          <button className="ob-back-btn" onClick={onBack}>
            <ArrowLeft size={13} /> Back
          </button>
        ) : (
          <div className="ob-auth-pill">
            <Sparkles size={10} /> SLACK AUTHENTICATED
          </div>
        )}
      </div>

      <div className="ob-top-right">
        <UserChip />
        <div className="ob-v-divider" />
        <button 
          className="ob-logout-top-btn" 
          onClick={handleLogout} 
          title="Sign Out"
          disabled={loading}
        >
          {loading ? <span className="ob-spinner ob-spinner-xs" /> : <Lock size={13} />}
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
    pending:   { label: 'Pending Review',   color: '#fbbf24', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.22)',  icon: <Clock size={13} /> },
    reviewing: { label: 'Under Review',     color: '#38bdf8', bg: 'rgba(14,165,233,0.1)',  border: 'rgba(14,165,233,0.22)',  icon: <Eye size={13} /> },
    approved:  { label: 'Approved!',        color: '#34d399', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.22)',  icon: <CheckCircle size={13} /> },
    rejected:  { label: 'Request Rejected', color: '#f87171', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.22)',   icon: <AlertCircle size={13} /> },
  };

  // ── Render ──
  if (!mounted) return null;

  if (isExiting) {
    return (
      <div style={{
        ...S.overlay,
        background: '#000',
        zIndex: 100000,
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        <div className="ob-spinner" />
        <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>Redirecting to secure login...</span>
      </div>
    );
  }

  return (
    <div style={S.overlay}>
      <div style={S.card}>
        {/* ambient glows */}
        <div className="ob-glow-a" />
        <div className="ob-glow-b" />

        {/* ═ STEP 1: Department ══════════════════════ */}
        {step === 'department' && (
          <div className="ob-animate">
            <TopBar />

            <div className="ob-hero">
              <h1 className="ob-title">
                Welcome, <span className="ob-accent">{user.name?.split(' ')[0] || 'there'}</span> 👋
              </h1>
              <p className="ob-subtitle">Select your department to get started and personalize your dashboard.</p>
            </div>

            <div className="ob-dept-grid">
              {DEPTS.map(dept => (
                <button
                  key={`${dept.name}-${dept.tier}`}
                  className="ob-dept-btn"
                  style={{ '--c': dept.color, '--cb': dept.border, '--cbg': dept.bg } as React.CSSProperties}
                  onClick={() => handleSelectDept(dept)}
                  disabled={loading}
                >
                  <div className="ob-dept-icon-wrap">
                    <dept.icon size={17} strokeWidth={2} />
                  </div>
                  <div className="ob-dept-info">
                    <span className="ob-dept-name">{dept.name}{dept.tier ? ` — ${dept.tier}` : ''}</span>
                    <span className="ob-dept-desc">{dept.desc}</span>
                  </div>
                  <ArrowRight size={12} className="ob-dept-arrow" />
                </button>
              ))}
            </div>

            <div className="ob-divider" />
            <div className="ob-footer-row">
              <span className="ob-footer-label">Not seeing your role?</span>
              <button className="ob-spec-btn" onClick={() => setStep('request')} disabled={loading}>
                Request specialized access <ShieldCheck size={13} />
              </button>
            </div>
            <p className="ob-footer-note">Roles like QA, Workforce, or Senior Ops require admin approval.</p>
          </div>
        )}

        {/* ═ STEP 2: Complete Profile ════════════════ */}
        {step === 'profile' && (
          <div className="ob-animate">
            <TopBar showBack onBack={() => { setStep('department'); setError(null); }} />
            <div className="ob-hero">
              <h1 className="ob-title">Complete Your Profile</h1>
              <p className="ob-subtitle">Confirm your identity. Slack-synced fields are pre-filled and editable.</p>
            </div>

            <div className="ob-dept-tag">
              <span className="ob-dept-tag-label">Department</span>
              <span className="ob-dept-tag-val">{selectedDept}</span>
            </div>

            <div className="ob-inner-card">
              <div className="ob-sync-bar">
                <CreditCard size={15} strokeWidth={2} style={{ color: '#818cf8', flexShrink: 0 }} />
                <div>
                  <strong>Identity Sync</strong>
                  <span>Imported from Slack — editable if needed</span>
                </div>
              </div>
              <div className="ob-fields">
                <EditableField label="Full Name" value={profileName} onChange={setProfileName}
                  placeholder="Your full name" icon={<User size={13} />} required fromSlack={nameFromSlack} />
                <div className="ob-two-col">
                  <EditableField label="Employee ID" value={profileEmpId} onChange={setProfileEmpId}
                    placeholder="EMP-XXXXX" icon={<CreditCard size={13} />} required fromSlack={idFromSlack} />
                  <div className="ob-field">
                    <div className="ob-label-row">
                      <label className="ob-label">Superior <span className="ob-req">*</span></label>
                    </div>
                    <ModernSelect
                      value={profileSupId}
                      onValueChange={setProfileSupId}
                      disabled={loadingSups}
                      options={[
                        { label: '— Select supervisor —', value: 'none' },
                        ...supervisors.map(s => ({ label: s.name, value: s.id }))
                      ]}
                    />
                    {loadingSups && <span className="ob-hint">Loading supervisors...</span>}
                    {!loadingSups && supervisorLoadError && (
                      <span className="ob-hint" style={{ color: '#fca5a5' }}>
                        {supervisorLoadError}{' '}
                        <button type="button" className="ob-link" onClick={() => void loadSupervisors()}>
                          Retry
                        </button>
                      </span>
                    )}
                    {!loadingSups && !supervisorLoadError && supervisors.length === 0 && (
                      <span className="ob-hint" style={{ color: '#fbbf24' }}>
                        No supervisors found.{' '}
                        <button type="button" className="ob-link" onClick={() => void loadSupervisors()}>
                          Refresh
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="ob-error"><AlertCircle size={13} /> {error}</div>}
            <button className="ob-cta" onClick={handleCompleteProfile}
              disabled={loading || !profileName.trim() || !profileEmpId.trim() || profileSupId === 'none'}>
              {loading ? <span className="ob-spinner" /> : <>Continue <ArrowRight size={16} /></>}
            </button>
            <p className="ob-footnote">Your email <strong>{user.email}</strong> will be saved automatically.</p>
          </div>
        )}

        {/* ═ STEP 3: Specialized Access Request ═════ */}
        {step === 'request' && (
          <div className="ob-animate">
            <TopBar showBack onBack={() => { setStep('department'); setError(null); }} />
            <div className="ob-hero">
              <div className="ob-shield-icon"><ShieldCheck size={22} strokeWidth={2} /></div>
              <h1 className="ob-title">Request Specialized Access</h1>
              <p className="ob-subtitle">Your request will be reviewed by IT and typically processed within 2–4 hours.</p>
            </div>

            <div className="ob-inner-card">
              <div className="ob-sync-bar">
                <CreditCard size={15} strokeWidth={2} style={{ color: '#818cf8', flexShrink: 0 }} />
                <div>
                  <strong>Identity Sync</strong>
                  <span>Imported from Slack — editable if needed</span>
                </div>
              </div>
              <div className="ob-fields">
                <EditableField label="Full Name" value={reqName} onChange={setReqName}
                  placeholder="Your full name" icon={<User size={13} />} required fromSlack={nameFromSlack} />
                <EditableField label="Employee ID" value={reqEmpId} onChange={setReqEmpId}
                  placeholder="EMP-XXXXX" icon={<CreditCard size={13} />} required fromSlack={idFromSlack} />
                <div className="ob-field">
                  <div className="ob-label-row">
                    <label className="ob-label">Functional Area <span className="ob-req">*</span></label>
                  </div>
                  <input className="ob-input" value={reqArea} onChange={e => setReqArea(e.target.value)}
                    placeholder="e.g. QA, Workforce Management, Senior Operations…" />
                </div>
                <div className="ob-field">
                  <div className="ob-label-row">
                    <label className="ob-label">Reason <span className="ob-req">*</span></label>
                  </div>
                  <textarea className="ob-textarea" value={reqReason} onChange={e => setReqReason(e.target.value)}
                    placeholder="Briefly explain why you need specialized access…" rows={3} />
                </div>
              </div>
            </div>

            {error && <div className="ob-error"><AlertCircle size={13} /> {error}</div>}
            <button className="ob-cta" onClick={handleSubmitRequest}
              disabled={loading || !reqName.trim() || !reqEmpId.trim() || !reqArea.trim() || !reqReason.trim()}>
              {loading ? <span className="ob-spinner" /> : <><Send size={14} /> Submit Request</>}
            </button>
          </div>
        )}

        {/* ═ STEP 4: Pending ═════════════════════════ */}
        {step === 'pending' && (
          <div className="ob-animate ob-centered">
            <div className="ob-top-logout-float">
              <button className="ob-logout-top-btn" onClick={handleLogout} disabled={loading}>
                 <Lock size={12} /> Logout
              </button>
            </div>

            <div className="ob-ring-wrap">
              <div className="ob-pulse-ring" />
              <div className="ob-big-circle ob-circle-green"><CheckCircle size={40} /></div>
            </div>

            <h2 className="ob-conf-title">Request Submitted!</h2>
            <p className="ob-conf-sub">
              Your specialized access request is now under review by the IT team.<br />
              <strong>You&apos;ll receive a notification once a decision is made.</strong>
            </p>

            {requestStatus && statusConfig[requestStatus] && (
              <div className="ob-status-badge" style={{
                color: statusConfig[requestStatus].color,
                background: statusConfig[requestStatus].bg,
                borderColor: statusConfig[requestStatus].border,
              }}>
                {statusConfig[requestStatus].icon}
                <span>{statusConfig[requestStatus].label}</span>
                {lastChecked && (
                  <span className="ob-status-time">
                    · {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}

            {requestStatus === 'reviewing' && (
              <div className="ob-notice ob-notice-blue">
                <Eye size={14} />
                <span>A member of the IT team is currently reviewing your request in real-time.</span>
              </div>
            )}
            {requestStatus === 'approved' && (
              <div className="ob-notice ob-notice-green">
                <CheckCircle size={14} />
                <span>Your request was approved! Entering dashboard…</span>
              </div>
            )}

            <div className="ob-info-cards">
              <div className="ob-info-card">
                <Clock size={14} style={{ color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />
                <div>
                  <strong>Estimated Time</strong>
                  <span>2–4 business hours by the security audit team.</span>
                </div>
              </div>
              <div className="ob-info-card">
                <ShieldCheck size={14} style={{ color: 'rgba(255,255,255,0.28)', flexShrink: 0 }} />
                <div>
                  <strong>Next Steps</strong>
                  <span>You&apos;ll be added to Slack channels upon approval.</span>
                </div>
              </div>
            </div>

            <div className="ob-pending-actions">
              <button className="ob-ghost-btn" onClick={handleCancelRequest} disabled={loading || checkingStatus}>
                {loading ? <span className="ob-spinner ob-spinner-xs" /> : <><ArrowLeft size={12} /> Cancel request</>}
              </button>
              <button className="ob-check-btn" onClick={handleCheckStatus} disabled={checkingStatus || loading}>
                {checkingStatus
                  ? <><span className="ob-spinner ob-spinner-xs" /> Checking…</>
                  : <><RefreshCw size={13} /> Check status</>}
              </button>
            </div>
          </div>
        )}

        {/* ═ STEP 5: Approved ════════════════════════ */}
        {step === 'approved' && (
          <div className="ob-animate ob-centered">
            <div className="ob-top-logout-float">
              <button className="ob-logout-top-btn" onClick={handleLogout} disabled={loading}>
                 <Lock size={12} /> Logout
              </button>
            </div>
            <div className="ob-ring-wrap">
              <div className="ob-pulse-ring" />
              <div className="ob-big-circle ob-circle-green"><CheckCircle size={40} /></div>
            </div>
            <h2 className="ob-conf-title" style={{ color: '#d1fae5' }}>Access Granted!</h2>
            <p className="ob-conf-sub">
              Your request was approved. You&apos;ve been assigned to{' '}
              <strong style={{ color: '#6ee7b7' }}>{user.department || 'your new department'}</strong>.
            </p>
            <div className="ob-approved-box">
              <div className="ob-role-chip">
                <ShieldCheck size={12} />
                <span>{user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
              </div>
              <button className="ob-cta ob-cta-green" onClick={handleAcknowledge} disabled={loading}>
                {loading ? 'Loading…' : 'Access Dashboard →'}
              </button>
            </div>
          </div>
        )}

        {step === 'rejected' && (
          <div className="ob-animate ob-centered">
            <div className="ob-ring-wrap">
              <div className="ob-big-circle" style={{ background: 'rgba(239,68,68,0.14)', color: '#f87171' }}>
                <AlertCircle size={38} />
              </div>
            </div>
            <h2 className="ob-conf-title" style={{ color: '#fecaca' }}>Request Denied</h2>
            <p className="ob-conf-sub">
              Your last special role request was denied. Review the reason below, then go back and submit a new request if needed.
            </p>
            <div className="ob-approved-box">
              <div className="ob-role-chip" style={{ color: '#fca5a5', borderColor: 'rgba(239,68,68,0.24)', background: 'rgba(239,68,68,0.08)' }}>
                <AlertCircle size={12} />
                <span>{roleRequest?.notes?.trim() || 'No reason was provided.'}</span>
              </div>
              <button className="ob-cta" onClick={() => { setStep('department'); setRequestStatus(null); }}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Scoped styles (non-critical layout, backed by inline styles above) ── */}
      <style>{`
        .ob-glow-a, .ob-glow-b {
          position: absolute; border-radius: 50%; pointer-events: none;
        }
        .ob-glow-a {
          top: -140px; right: -120px; width: 340px; height: 340px;
          background: radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%);
        }
        .ob-glow-b {
          bottom: -100px; left: -80px; width: 260px; height: 260px;
          background: radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%);
        }
        .ob-animate {
          animation: ob-in 0.28s cubic-bezier(.22,1,.36,1);
        }
        @keyframes ob-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ob-topbar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1.75rem; gap: 1rem;
        }
        .ob-top-right { display: flex; align-items: center; gap: 0.75rem; }
        .ob-v-divider { width: 1px; height: 16px; background: rgba(255,255,255,0.1); }
        
        .ob-logout-top-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.35rem 0.75rem; border-radius: 8px;
          background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.15);
          color: #f87171; font-size: 0.68rem; font-weight: 700;
          cursor: pointer; transition: all 0.15s;
          text-transform: uppercase; letter-spacing: 0.02em;
        }
        .ob-logout-top-btn:hover:not(:disabled) {
          background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.3);
          color: white; transform: translateY(-1px);
        }
        .ob-logout-top-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .ob-top-logout-float {
          position: absolute; top: 1.5rem; right: 1.5rem;
        }
        .ob-auth-pill {
          display: inline-flex; align-items: center; gap: 0.4rem;
          background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.18);
          padding: 0.3rem 0.75rem; border-radius: 999px;
          font-size: 0.6rem; font-weight: 800; letter-spacing: 0.08em;
          color: #10b981; text-transform: uppercase;
        }
        .ob-user-row { display: flex; align-items: center; gap: 0.6rem; }
        .ob-user-email { font-size: 0.71rem; color: rgba(255,255,255,0.3); }
        .ob-avatar {
          width: 30px; height: 30px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 9px; overflow: hidden;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.4); flex-shrink: 0;
        }
        .ob-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .ob-back-btn {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.78rem; font-weight: 600; color: rgba(255,255,255,0.35);
          background: none; border: none; cursor: pointer;
          padding: 0.3rem 0.6rem; border-radius: 8px;
          transition: background 0.15s, color 0.15s;
        }
        .ob-back-btn:hover { background: rgba(255,255,255,0.06); color: white; }
        .ob-hero { margin-bottom: 1.75rem; }
        .ob-title {
          font-size: 1.9rem; font-weight: 900; margin: 0 0 0.5rem;
          letter-spacing: -0.04em;
          background: linear-gradient(130deg, #ffffff 20%, rgba(255,255,255,0.65) 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .ob-accent {
          background: linear-gradient(130deg, #818cf8 0%, #c084fc 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
        }
        .ob-subtitle { color: #4b5563; font-size: 0.875rem; margin: 0; line-height: 1.6; }
        .ob-shield-icon {
          width: 48px; height: 48px;
          background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.2);
          border-radius: 14px; display: flex; align-items: center; justify-content: center;
          color: #818cf8; margin-bottom: 1rem;
        }
        .ob-dept-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; margin-bottom: 1.5rem;
        }
        .ob-dept-btn {
          display: flex; align-items: center; gap: 0.75rem;
          padding: 0.875rem 1rem;
          background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; cursor: pointer; text-align: left;
          transition: all 0.18s ease; position: relative; overflow: hidden;
        }
        .ob-dept-btn:hover {
          border-color: var(--cb); background: var(--cbg);
          transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,0,0,0.2);
        }
        .ob-dept-icon-wrap {
          width: 36px; height: 36px; flex-shrink: 0;
          background: var(--cbg, rgba(255,255,255,0.05));
          border: 1px solid var(--cb, rgba(255,255,255,0.06));
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          color: var(--c, rgba(255,255,255,0.5)); transition: transform 0.18s;
        }
        .ob-dept-btn:hover .ob-dept-icon-wrap { transform: scale(1.06); }
        .ob-dept-info { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; }
        .ob-dept-name { font-size: 0.8rem; font-weight: 700; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ob-dept-desc { font-size: 0.67rem; color: rgba(255,255,255,0.22); }
        .ob-dept-arrow {
          color: rgba(255,255,255,0.15); flex-shrink: 0;
          opacity: 0; transform: translateX(-4px); transition: all 0.18s;
        }
        .ob-dept-btn:hover .ob-dept-arrow { opacity: 1; transform: translateX(0); color: var(--c); }
        .ob-divider { height: 1px; background: rgba(255,255,255,0.05); margin-bottom: 1.25rem; }
        .ob-footer-row {
          display: flex; align-items: center; justify-content: center;
          gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem;
        }
        .ob-footer-label { font-size: 0.83rem; color: #475569; }
        .ob-spec-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.78rem; font-weight: 700; cursor: pointer; color: #818cf8;
          background: rgba(99,102,241,0.08); border: 1px solid rgba(99,102,241,0.18);
          padding: 0.42rem 0.875rem; border-radius: 9px; transition: all 0.16s;
        }
        .ob-spec-btn:hover { background: rgba(99,102,241,0.15); color: white; }
        .ob-footer-note { font-size: 0.68rem; color: #334155; text-align: center; line-height: 1.5; }
        .ob-dept-tag {
          display: inline-flex; align-items: center; gap: 0.6rem;
          padding: 0.42rem 0.875rem;
          background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.15);
          border-radius: 10px; margin-bottom: 1.25rem;
        }
        .ob-dept-tag-label { font-size: 0.66rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #818cf8; opacity: 0.7; }
        .ob-dept-tag-val { font-size: 0.8rem; font-weight: 700; color: white; }
        .ob-inner-card {
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px; padding: 1.25rem; margin-bottom: 1.25rem;
        }
        .ob-sync-bar {
          display: flex; align-items: flex-start; gap: 0.7rem;
          padding-bottom: 1rem; margin-bottom: 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .ob-sync-bar strong { display: block; font-size: 0.85rem; font-weight: 700; color: white; margin-bottom: 0.15rem; }
        .ob-sync-bar span { font-size: 0.7rem; color: rgba(255,255,255,0.25); }
        .ob-fields { display: flex; flex-direction: column; gap: 0.875rem; }
        .ob-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0.875rem; }
        .ob-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .ob-label-row { display: flex; align-items: center; gap: 0.5rem; }
        .ob-label {
          font-size: 0.66rem; font-weight: 700; letter-spacing: 0.07em;
          text-transform: uppercase; color: rgba(255,255,255,0.35);
        }
        .ob-req { color: #f87171; }
        .ob-synced-pill {
          display: inline-flex; align-items: center; gap: 0.2rem;
          padding: 0.14rem 0.48rem; border-radius: 999px;
          background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.16);
          font-size: 0.57rem; font-weight: 800; color: #10b981;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .ob-field-wrap { position: relative; display: flex; align-items: center; }
        .ob-field-icon {
          position: absolute; left: 0.8rem;
          color: rgba(255,255,255,0.22); pointer-events: none;
          display: flex; align-items: center; z-index: 1;
        }
        .ob-input {
          width: 100%; height: 41px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 11px; padding: 0 0.85rem;
          color: white; font-size: 0.875rem; font-family: inherit;
          outline: none; transition: border-color 0.16s, background 0.16s;
          box-sizing: border-box;
        }
        .ob-input.padded { padding-left: 2.3rem; }
        .ob-input:focus { border-color: rgba(99,102,241,0.4); background: rgba(99,102,241,0.05); }
        .ob-input.is-synced { color: rgba(255,255,255,0.6); background: rgba(16,185,129,0.04); border-color: rgba(16,185,129,0.12); }
        .ob-input[readonly] { cursor: default; }
        .ob-input::placeholder { color: rgba(255,255,255,0.16); }
        .ob-sel { appearance: none !important; padding-right: 2rem; cursor: pointer; }
        .ob-sel option { background: #1b2035; color: white; }
        .ob-chevron { position: absolute; right: 0.65rem; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.25); pointer-events: none; }
        .ob-toggle-btn {
          position: absolute; right: 0.5rem;
          width: 24px; height: 24px;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 7px; display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3); cursor: pointer; transition: all 0.15s;
        }
        .ob-toggle-btn:hover { background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.3); color: #818cf8; }
        .ob-hint { font-size: 0.67rem; color: rgba(255,255,255,0.22); margin-top: 0.2rem; }
        .ob-link { background: transparent; border: none; padding: 0; margin: 0; font: inherit; cursor: pointer; color: rgba(129,140,248,0.95); text-decoration: underline; text-underline-offset: 2px; }
        .ob-link:hover { color: rgba(167,139,250,0.95); }
        .ob-textarea {
          width: 100%; min-height: 85px; box-sizing: border-box;
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          border-radius: 11px; padding: 0.7rem 0.85rem;
          color: white; font-size: 0.875rem; font-family: inherit;
          resize: vertical; outline: none; transition: border-color 0.16s;
        }
        .ob-textarea:focus { border-color: rgba(99,102,241,0.4); }
        .ob-textarea::placeholder { color: rgba(255,255,255,0.16); }
        .ob-error {
          display: flex; align-items: center; gap: 0.5rem;
          padding: 0.75rem 1rem; border-radius: 11px;
          background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.18);
          color: #f87171; font-size: 0.825rem; margin-top: 0.875rem;
        }
        .ob-cta {
          width: 100%; height: 48px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border: none; border-radius: 14px; color: white;
          font-size: 0.95rem; font-weight: 800;
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          margin-top: 1rem; cursor: pointer;
          box-shadow: 0 8px 24px rgba(99,102,241,0.25);
          transition: transform 0.16s, box-shadow 0.16s, opacity 0.16s;
        }
        .ob-cta:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(99,102,241,0.38); }
        .ob-cta:disabled { opacity: 0.35; cursor: not-allowed; }
        .ob-cta-green { background: linear-gradient(135deg, #10b981, #059669) !important; box-shadow: 0 8px 24px rgba(16,185,129,0.25) !important; }
        .ob-cta-green:hover:not(:disabled) { box-shadow: 0 12px 30px rgba(16,185,129,0.38) !important; }
        .ob-footnote { text-align: center; font-size: 0.68rem; color: rgba(255,255,255,0.18); margin-top: 0.75rem; }
        .ob-footnote strong { color: rgba(255,255,255,0.35); }
        .ob-spinner {
          width: 17px; height: 17px; display: inline-block;
          border: 2px solid rgba(255,255,255,0.2); border-top-color: white;
          border-radius: 50%; animation: ob-spin 0.65s linear infinite;
        }
        .ob-spinner-xs { width: 12px; height: 12px; }
        @keyframes ob-spin { to { transform: rotate(360deg); } }
        .ob-centered { text-align: center; padding: 0.75rem 0; }
        .ob-ring-wrap { position: relative; width: fit-content; margin: 0 auto 2rem; }
        .ob-pulse-ring {
          position: absolute; inset: -16px; border-radius: 50%;
          border: 2px solid rgba(16,185,129,0.2);
          animation: ob-pulse 2.2s ease-out infinite;
        }
        @keyframes ob-pulse {
          0%   { transform: scale(0.88); opacity: 0.75; }
          100% { transform: scale(1.42); opacity: 0; }
        }
        .ob-big-circle {
          width: 84px; height: 84px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; border: 2px solid;
        }
        .ob-circle-green { border-color: #10b981; color: #10b981; background: rgba(16,185,129,0.08); box-shadow: 0 0 32px rgba(16,185,129,0.2); }
        .ob-conf-title { font-size: 1.8rem; font-weight: 900; margin: 0 0 0.6rem; letter-spacing: -0.03em; }
        .ob-conf-sub { color: #4b5563; font-size: 0.875rem; line-height: 1.65; margin: 0 auto 1.5rem; max-width: 46ch; }
        .ob-conf-sub strong { color: rgba(255,255,255,0.7); }
        .ob-status-badge {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.45rem 1rem; border-radius: 999px; border: 1px solid;
          font-size: 0.78rem; font-weight: 700; margin-bottom: 1rem; letter-spacing: 0.02em;
        }
        .ob-status-time { font-size: 0.68rem; opacity: 0.5; font-weight: 400; }
        .ob-notice {
          display: inline-flex; align-items: center; gap: 0.5rem;
          padding: 0.6rem 1rem; border-radius: 11px; margin-bottom: 1.25rem;
          font-size: 0.78rem; line-height: 1.4;
        }
        .ob-notice-blue { background: rgba(14,165,233,0.07); border: 1px solid rgba(14,165,233,0.15); color: #38bdf8; }
        .ob-notice-green { background: rgba(16,185,129,0.07); border: 1px solid rgba(16,185,129,0.15); color: #34d399; }
        .ob-info-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.75rem; }
        .ob-info-card {
          display: flex; align-items: flex-start; gap: 0.65rem;
          padding: 0.9rem; text-align: left;
          background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 13px;
        }
        .ob-info-card strong { display: block; font-size: 0.78rem; font-weight: 700; color: white; margin-bottom: 0.22rem; }
        .ob-info-card span { font-size: 0.7rem; color: rgba(255,255,255,0.25); line-height: 1.5; }
        .ob-pending-actions { display: flex; align-items: center; justify-content: center; gap: 0.875rem; flex-wrap: wrap; }
        .ob-ghost-btn {
          display: inline-flex; align-items: center; gap: 0.35rem;
          font-size: 0.77rem; font-weight: 600; color: rgba(255,255,255,0.28);
          background: none; border: none; cursor: pointer; padding: 0.3rem 0.55rem;
          border-radius: 7px; transition: color 0.15s;
        }
        .ob-ghost-btn:hover { color: white; }
        .ob-check-btn {
          display: inline-flex; align-items: center; gap: 0.4rem;
          font-size: 0.82rem; font-weight: 700;
          padding: 0.5rem 1.125rem; border-radius: 10px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: white; cursor: pointer; transition: all 0.16s;
        }
        .ob-check-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); border-color: rgba(255,255,255,0.18); }
        .ob-check-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ob-approved-box {
          background: rgba(16,185,129,0.05); border: 1px solid rgba(16,185,129,0.14);
          border-radius: 16px; padding: 1.25rem;
          display: flex; flex-direction: column; align-items: center; gap: 1rem; margin-top: 1.5rem;
        }
        .ob-role-chip {
          display: inline-flex; align-items: center; gap: 0.4rem;
          padding: 0.32rem 0.875rem; border-radius: 999px;
          background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.2);
          font-size: 0.72rem; font-weight: 800; color: #34d399;
          letter-spacing: 0.05em; text-transform: uppercase;
        }
        @media (max-width: 560px) {
          .ob-dept-grid { grid-template-columns: 1fr; }
          .ob-two-col { grid-template-columns: 1fr; }
          .ob-info-cards { grid-template-columns: 1fr; }
          .ob-title { font-size: 1.6rem; }
        }
      `}</style>
    </div>
  );
}
