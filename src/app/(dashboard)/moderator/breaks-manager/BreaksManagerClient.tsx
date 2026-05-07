'use client';

import { useCallback, useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react';
import gsap from 'gsap';
import { 
  type LucideIcon,
  Upload, 
  ClipboardList, 
  BarChart3, 
  Activity, 
  Clock, 
  Lock, 
  FileText, 
  Edit3, 
  Link, 
  CloudUpload, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Save,
  Trash2,
  Database,
  FileSpreadsheet,
  Search,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar
} from 'lucide-react';
import type { ScheduleUploadBatch, User, PendingReviewAgent } from '@/types/database';
import { proxifyMediaUrl } from '@/lib/media-proxy';
import { findBestUserMatch } from '@/lib/breaks';
import { BatchSchedulesEditor } from '@/components/dashboard/BatchSchedulesEditor';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TransferProgress } from '@/components/uploads/TransferProgress';
import { useTransferState } from '@/components/uploads/useTransferState';
import { uploadFormDataWithProgress } from '@/lib/file-transfer';

type TabKey = 'upload' | 'schedules' | 'reports' | 'analytics';

interface Props {
  currentUser: User;
  initialBatches: ScheduleUploadBatch[];
  employees: Pick<User, 'id' | 'name' | 'employee_id' | 'department' | 'supervisor' | 'supervisor_id' | 'avatar_url'>[];
}

// ─── Tab Navigation ────────────────────────────────────────────────────────────
const TABS: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'upload',    label: 'Upload / Import',    icon: Upload },
  { key: 'schedules', label: 'Published Schedules', icon: ClipboardList },
  { key: 'reports',   label: 'Variance Report',    icon: BarChart3 },
  { key: 'analytics', label: 'Analytics',          icon: Activity },
];

type UploadMode = 'csv' | 'manual' | 'live';

export function BreaksManagerClient({ currentUser, initialBatches, employees }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('upload');
  const [batches, setBatches] = useState(initialBatches);
  const [matchingBatch, setMatchingBatch] = useState<ScheduleUploadBatch | null>(null);
  const [editingBatch, setEditingBatch] = useState<ScheduleUploadBatch | null>(null);
  const isReadOnly = currentUser.role === 'moderator_b1';

  async function refreshBatches() {
    const res = await fetch('/api/breaks/batches');
    if (res.ok) {
      const data = await res.json() as { batches: ScheduleUploadBatch[] };
      setBatches(data.batches ?? []);
    }
  }

  // --- GSAP ANIMATIONS ---
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.glass-card', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: 'power4.out',
      });
    });
    return () => ctx.revert();
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] p-4">
      {/* Page Header - Bento Card Full */}
      <div className="glass-card bento-card--full flex justify-between items-center bg-gradient-to-r from-[rgba(109,93,252,0.1)] to-transparent border-l-4 border-l-[#6d5dfc]">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <span className="p-2 bg-[#6d5dfc] rounded-xl shadow-[0_0_20px_rgba(109,93,252,0.4)]">
              <Clock size={28} />
            </span>
            Breaks Manager
          </h1>
          <p className="text-slate-400 mt-1 font-medium ml-1">NYT Break & Lunch Scheduling System</p>
        </div>

        {/* Stats Summary in Header */}
        <div className="flex gap-8 px-6 border-l border-white/5">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Batches</span>
            <span className="text-2xl font-black text-white">{batches.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Agents Synced</span>
            <span className="text-2xl font-black text-[#10b981]">{employees.length}</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation - Glassy Bar */}
      <div className="p-1 glass-panel flex gap-2 w-fit mb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 ${activeTab === tab.key ? 'bg-[#6d5dfc] text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid Content */}
      <div className="bento-grid">
        {activeTab === 'upload' && (
          <>
            <div className="bento-card--wide">
              <UploadTab 
                isReadOnly={isReadOnly} 
                employees={employees} 
                onSuccess={refreshBatches} 
                onOpenMatching={(batchId) => {
                  const batch = batches.find(b => b.id === batchId);
                  if (batch) setMatchingBatch(batch);
                }}
              />
            </div>
            
            {/* Quick Tips / Status Card */}
            <div className="bento-card glass-card border-[#10b981]/20 flex flex-col justify-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-[#10b981]/10 rounded-full text-[#10b981]">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-white">Smart Match Active</h3>
                  <p className="text-xs text-slate-400">Tokens & Elimination logic enabled</p>
                </div>
              </div>
              <div className="h-px bg-white/5 my-2" />
              <div className="space-y-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Confidence Threshold</span>
                  <span className="text-white font-bold">85%</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#10b981] h-full w-[85%]" />
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'schedules' && (
          <div className="bento-card--full">
            <SchedulesTab 
              batches={batches} 
              isReadOnly={isReadOnly} 
              onRefresh={refreshBatches}
              setMatchingBatch={setMatchingBatch}
              setEditingBatch={setEditingBatch}
            />
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="bento-card--full glass-card">
            <ReportsTab currentUser={currentUser} />
          </div>
        )}
        
        {activeTab === 'analytics' && (
          <div className="bento-card--full glass-card">
            <AnalyticsTab currentUser={currentUser} />
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {editingBatch && (
        <BatchSchedulesEditor 
          batchId={editingBatch.id}
          batchName={editingBatch.name}
          onClose={() => setEditingBatch(null)}
          onSuccess={() => {
            refreshBatches();
            setEditingBatch(null);
          }}
        />
      )}
      
      {/* Match Agent Drawer */}
      {matchingBatch && (
        <MatchAgentDrawer 
          batch={matchingBatch} 
          employees={employees} 
          onClose={() => setMatchingBatch(null)} 
          onSuccess={() => {
            setMatchingBatch(null);
            refreshBatches();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — UPLOAD / IMPORT
// ═══════════════════════════════════════════════════════════════════════════════

function UploadTab({
  isReadOnly,
  employees,
  onSuccess,
  onOpenMatching,
}: {
  isReadOnly: boolean;
  employees: Props['employees'];
  onSuccess: () => void;
  onOpenMatching: (batchId: string) => void;
}) {
  const [mode, setMode] = useState<UploadMode>('csv');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const transfer = useTransferState({ resetAfterMs: 1500 });
  const uploading = transfer.state.phase === 'working';
  const [result, setResult] = useState<{
    success?: boolean;
    batchId?: string;
    batchName?: string;
    scheduleDate?: string;
    matched?: number;
    pendingReview?: PendingReviewAgent[];
    message?: string;
    error?: string;
    conflict?: boolean;
    existingBatchName?: string;
    existingBatchId?: string;
  } | null>(null);

  // Auto-open matching drawer if unlinked agents detected
  useEffect(() => {
    if (result?.success && result.batchId && result.pendingReview && result.pendingReview.length > 0) {
      onOpenMatching(result.batchId);
    }
  }, [result, onOpenMatching]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setSelectedFile(f);
  }

  async function uploadFile(forceReplace = false) {
    if (!selectedFile) return;
    transfer.start(selectedFile.name);
    setResult(null);
    const fd = new FormData();
    fd.append('file', selectedFile);
    if (forceReplace) fd.append('force_replace', 'true');

    const res = await uploadFormDataWithProgress<Record<string, unknown>>({
      url: '/api/breaks/upload',
      formData: fd,
      onProgress: transfer.setProgress,
    });
    const data = res.json ?? (res.text ? { error: res.text } : {});
    setResult(data);
    if (!res.ok) {
      transfer.fail('Failed');
      return;
    }
    if (data?.success) {
      onSuccess();
      transfer.succeed('Uploaded');
    } else {
      transfer.fail('Failed');
    }
  }

  async function publishBatch(batchId: string) {
    await fetch(`/api/breaks/batches/${batchId}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    });
    onSuccess();
    setResult(null);
    setSelectedFile(null);
  }

  if (isReadOnly) {
    return (
      <div className="glass-card flex items-center gap-4 border-amber-500/20 bg-amber-500/5">
        <div className="p-3 bg-amber-500/10 rounded-full text-amber-500"><Lock size={24} /></div>
        <p className="text-amber-200/80 text-sm">You have view-only access. Only moderator_a1 and admin can upload schedules.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode Selector - Glass Pill */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-2xl w-fit">
        {([['csv', '📄 CSV / Excel'], ['manual', '✏️ Manual'], ['live', '🔗 SharePoint']] as [UploadMode, string][]).map(([m, label]) => (
          <button
            key={m}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${mode === m ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CSV Upload Mode */}
      {mode === 'csv' && (
        <div className="glass-card flex flex-col gap-6 min-h-[340px] justify-center items-center">
          <div
            className={`w-full max-w-xl border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer flex flex-col items-center gap-4 ${dragging ? 'bg-[#6d5dfc]/10 border-[#6d5dfc]' : 'bg-white/5 border-white/10 hover:border-[#6d5dfc]/50'}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            {selectedFile ? (
              <>
                <div className="p-5 bg-[#6d5dfc]/20 rounded-full text-[#6d5dfc]"><FileSpreadsheet size={48} /></div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{selectedFile.name}</p>
                  <p className="text-sm text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB · Ready to process</p>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 bg-white/5 rounded-full text-slate-500"><CloudUpload size={48} /></div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">Select Workforce File</p>
                  <p className="text-sm text-slate-400">Drop your CSV or Excel file here</p>
                </div>
              </>
            )}
          </div>

          <div className="w-full max-w-xl">
            <TransferProgress state={transfer.state} />
          </div>

          {selectedFile && !result && (
            <button
              className={`px-10 py-4 rounded-2xl font-black text-lg transition-all flex items-center gap-3 ${uploading ? 'bg-slate-800 text-slate-500 pointer-events-none' : 'bg-[#6d5dfc] text-white hover:scale-105 hover:shadow-[0_0_30px_rgba(109,93,252,0.4)] active:scale-95'}`}
              onClick={() => uploadFile()}
              disabled={uploading}
            >
              {uploading ? <Activity size={24} className="animate-spin" /> : <Database size={24} />}
              {uploading ? 'ANALYZING...' : 'PROCESS DATA'}
            </button>
          )}

          {/* Results Handling (Same logic, new styling) */}
          {result?.conflict && (
            <div className="w-full max-w-xl p-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-4">
              <div className="text-red-500"><AlertTriangle size={32} /></div>
              <div className="flex-1">
                <p className="font-bold text-white text-lg">Batch Duplicate Detected</p>
                <p className="text-slate-400 text-sm mt-1">&quot;{result.existingBatchName}&quot; already exists. Replace existing data?</p>
                <div className="flex gap-3 mt-4">
                  <button className="px-4 py-2 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-colors" onClick={() => uploadFile(true)}>
                    Yes, Overwrite
                  </button>
                  <button className="px-4 py-2 bg-white/5 text-slate-300 rounded-xl font-bold text-sm hover:bg-white/10 transition-colors" onClick={() => { setResult(null); setSelectedFile(null); }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {result?.success && (
            <div className="w-full max-w-xl p-6 rounded-2xl bg-[#10b981]/10 border border-[#10b981]/20">
              <div className="flex gap-4">
                <div className="text-[#10b981]"><CheckCircle2 size={32} /></div>
                <div className="flex-1">
                  <p className="font-bold text-white text-lg">File Processed Successfully</p>
                  <p className="text-slate-400 text-sm">{result.message}</p>
                </div>
              </div>

              {(result.pendingReview?.length ?? 0) > 0 && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-between">
                  <div className="flex gap-3 items-center">
                    <AlertTriangle size={20} className="text-amber-500" />
                    <div>
                      <p className="text-xs font-black text-amber-200">UNLINKED AGENTS ({result.pendingReview?.length})</p>
                      <p className="text-[10px] text-amber-200/50">Some names could not be matched automatically</p>
                    </div>
                  </div>
                  <button 
                    className="px-3 py-1.5 bg-amber-500 text-black text-[10px] font-black rounded-lg hover:bg-amber-400 transition-colors uppercase"
                    onClick={() => result.batchId && onOpenMatching(result.batchId)}
                  >
                    Link Now
                  </button>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  className="flex-1 py-3 bg-[#6d5dfc] text-white rounded-xl font-black text-sm hover:bg-[#5d4dfc] shadow-lg shadow-[#6d5dfc]/20"
                  onClick={() => result.batchId && publishBatch(result.batchId)}
                >
                  PUBLISH TO LIVE FEED
                </button>
                <button 
                  className="px-6 py-3 bg-white/5 text-slate-300 rounded-xl font-bold text-sm hover:bg-white/10 transition-colors"
                  onClick={() => { setResult(null); setSelectedFile(null); }}
                >
                  Save as Draft
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'manual' && (
        <div className="glass-card">
          <ManualEntryForm employees={employees} onSuccess={onSuccess} />
        </div>
      )}

      {mode === 'live' && (
        <div className="glass-card min-h-[400px] flex items-center justify-center text-center">
          <LiveExcelStub onSuccess={onSuccess} />
        </div>
      )}
    </div>
  );
}


// ─── Manual Entry Form ────────────────────────────────────────────────────────
function ManualEntryForm({ employees, onSuccess }: { employees: Props['employees']; onSuccess: () => void }) {
  const [scheduleDate, setScheduleDate] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftIn, setShiftIn] = useState('');
  const [shiftOut, setShiftOut] = useState('');
  const [firstBreak, setFirstBreak] = useState('');
  const [lunch, setLunch] = useState('');
  const [secondBreak, setSecondBreak] = useState('');
  const [thirdBreak, setThirdBreak] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (!scheduleDate || !employeeId) return;
    setSaving(true);
    const res = await fetch('/api/breaks/manual-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleDate, employeeId, shiftIn, shiftOut, firstBreak, lunch, secondBreak, thirdBreak: thirdBreak || null }),
    });
    const data = await res.json() as { success?: boolean; error?: string };
    setMsg(data.success ? '✓ Saved successfully' : `✕ ${data.error}`);
    if (data.success) { onSuccess(); }
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-6 p-2">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-[#6d5dfc]/20 rounded-lg text-[#6d5dfc]"><Edit3 size={20} /></div>
        <h3 className="font-black text-xl text-white">Manual Schedule Entry</h3>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl flex items-center gap-3 font-bold text-sm ${msg.startsWith('✓') ? 'bg-[#10b981]/10 text-[#10b981] border border-[#10b981]/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
          {msg.startsWith('✓') ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">Schedule Date</label>
          <input type="date" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-[#6d5dfc] transition-all" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[10px] uppercase tracking-widest font-black text-slate-500 ml-1">Employee</label>
          <select className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white outline-none focus:border-[#6d5dfc] transition-all appearance-none" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="" className="bg-[#121215]">— Select Agent —</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id} className="bg-[#121215]">{e.name} {e.employee_id ? `(${e.employee_id})` : ''}</option>
            ))}
          </select>
        </div>

        {/* Times Grid */}
        <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-white/5 rounded-2xl border border-white/5">
          {[
            { label: 'Shift In', val: shiftIn, set: setShiftIn },
            { label: 'Shift Out', val: shiftOut, set: setShiftOut },
            { label: '1st Break', val: firstBreak, set: setFirstBreak },
            { label: 'Lunch', val: lunch, set: setLunch },
            { label: '2nd Break', val: secondBreak, set: setSecondBreak },
            { label: '3rd Break', val: thirdBreak, set: setThirdBreak, opt: true },
          ].map((field) => (
            <div key={field.label} className="flex flex-col gap-1.5">
              <label className="text-[9px] uppercase tracking-tighter font-black text-slate-500 ml-1">{field.label} {field.opt && '(OPT)'}</label>
              <input 
                type="time" 
                className="w-full bg-white/5 border border-white/5 rounded-lg p-2 text-white text-sm outline-none focus:border-[#6d5dfc] transition-all" 
                value={field.val} 
                onChange={(e) => field.set(e.target.value)} 
              />
            </div>
          ))}
        </div>
      </div>

      <button 
        className={`mt-4 w-full py-4 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-3 ${saving || !scheduleDate || !employeeId ? 'bg-slate-800 text-slate-500 pointer-events-none' : 'bg-[#6d5dfc] text-white hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(109,93,252,0.4)] active:scale-95'}`}
        onClick={save} 
        disabled={saving || !scheduleDate || !employeeId}
      >
        {saving ? <Activity size={20} className="animate-spin" /> : <Save size={20} />}
        {saving ? 'SAVING DATA...' : 'CREATE SCHEDULE ENTRY'}
      </button>
    </div>
  );
}

// ─── Live Excel Stub ──────────────────────────────────────────────────────────
function LiveExcelStub({ onSuccess }: { onSuccess: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  async function startSync() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch('/api/breaks/live-sync', { method: 'POST' });
      const data = await res.json();
      setSyncStatus(data);
      if (data.success) onSuccess();
    } catch {
      setSyncStatus({ error: 'Failed to connect to synchronization service.' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="brm-live-stub">
      <div className="brm-live-stub__icon"><Link size={48} /></div>
      <h3 className="brm-live-stub__title">SharePoint Live Excel</h3>
      <p className="brm-live-stub__body">
        This feature connects directly to the NYT Breaks & Lunches file on SharePoint.
        It requires an Azure App Registration with <code>Files.Read.All</code> permissions.
      </p>
      <div className="brm-live-stub__url">
        <span className="brm-live-stub__url-label">Integration:</span>
        <code className="brm-live-stub__url-value">Microsoft Graph API (v1.0)</code>
      </div>
      
      {syncStatus?.error && (
        <div className="brm-msg brm-msg--error">
          <AlertTriangle size={16} /> {syncStatus.error}
        </div>
      )}
      {syncStatus?.success && (
        <div className="brm-msg brm-msg--success">
          <CheckCircle2 size={16} /> {syncStatus.message}
        </div>
      )}

      <div className="brm-live-stub__actions">
        <button 
          className="brm-btn brm-btn--primary" 
          onClick={startSync} 
          disabled={syncing}
        >
          {syncing ? <Activity size={16} className="spin" /> : <Activity size={16} />}
          {syncing ? 'Syncing...' : 'Sync from 365 Now'}
        </button>
        <p className="brm-live-stub__note">
          <Lock size={12} /> Requires MS_GRAPH_CLIENT_SECRET configured in environment.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — PUBLISHED SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════════

function SchedulesTab({
  batches,
  isReadOnly,
  onRefresh,
  setMatchingBatch,
  setEditingBatch,
}: {
  batches: ScheduleUploadBatch[];
  isReadOnly: boolean;
  onRefresh: () => void;
  setMatchingBatch: (b: ScheduleUploadBatch) => void;
  setEditingBatch: (b: ScheduleUploadBatch) => void;
}) {
  const [{ dateFrom: initialDateFrom, dateTo: initialDateTo }] = useState(() => {
    const now = Date.now();
    return {
      dateFrom: new Date(now - 32 * 864e5).toISOString().slice(0, 10),
      dateTo: new Date(now).toISOString().slice(0, 10),
    };
  });
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  const toggleDate = (date: string) => {
    setExpandedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
  };

  const filteredAndGrouped = useMemo(() => {
    const filtered = batches.filter(b => b.schedule_date >= dateFrom && b.schedule_date <= dateTo);
    const groups: Record<string, ScheduleUploadBatch[]> = {};
    
    // Sort by date desc
    const sorted = [...filtered].sort((a, b) => b.schedule_date.localeCompare(a.schedule_date));
    
    sorted.forEach(b => {
      if (!groups[b.schedule_date]) groups[b.schedule_date] = [];
      groups[b.schedule_date].push(b);
    });
    
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [batches, dateFrom, dateTo]);

  const visibleExpandedDates =
    expandedDates.length > 0 ? expandedDates : filteredAndGrouped.length > 0 ? [filteredAndGrouped[0][0]] : [];

  const statusColor: Record<string, string> = {
    draft: '#f59e0b',
    scheduled: '#06b6d4',
    published: '#10b981',
  };

  async function doDeleteBatch(id: string) {
    setDeleting(id);
    await fetch(`/api/breaks/batches/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    });
    onRefresh();
    setDeleting(null);
  }

  async function publishBatch(id: string) {
    await fetch(`/api/breaks/batches/${id}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    });
    onRefresh();
  }

  return (
    <div className="brm-schedules-tab">
      <div className="brm-filter-bar" style={{ marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div className="brm-field">
            <label className="brm-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} /> From
            </label>
            <input type="date" className="brm-input brm-input--sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="brm-field">
            <label className="brm-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} /> To
            </label>
            <input type="date" className="brm-input brm-input--sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <div className="brm-field" style={{ flex: 1 }}>
            <label className="brm-label">Total Days: {filteredAndGrouped.length}</label>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Viewing activity from your selected range</div>
          </div>
        </div>
      </div>

      <div className="brm-daily-container">
        {filteredAndGrouped.length === 0 ? (
          <div className="brm-empty-state" style={{ padding: '4rem 2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <Calendar size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
            <p style={{ color: 'var(--text-muted)' }}>No schedules found in this date range.</p>
          </div>
        ) : (
          filteredAndGrouped.map(([date, dayBatches]) => {
            const isExpanded = visibleExpandedDates.includes(date);
            const totalEmps = dayBatches.reduce((acc, b) => acc + b.employee_count, 0);
            const totalPending = dayBatches.reduce((acc, b) => acc + b.pending_review.length, 0);

            return (
              <div key={date} className={`brm-daily-block ${isExpanded ? 'active' : ''}`}>
                <div className="brm-daily-header" onClick={() => toggleDate(date)}>
                  <div className="brm-daily-title">
                    <div className="brm-daily-date-badge">
                      <span className="month">{new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="day">{new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric' })}</span>
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 700 }}>
                        {new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {dayBatches.length} {dayBatches.length === 1 ? 'batch' : 'batches'} uploaded for this day
                      </p>
                    </div>
                  </div>
                  
                  <div className="brm-daily-stats">
                    <div className="brm-stat">
                      <span className="val">{totalEmps}</span>
                      <span className="lbl">Employees</span>
                    </div>
                    {totalPending > 0 && (
                      <div className="brm-stat brm-stat--warn">
                        <span className="val">{totalPending}</span>
                        <span className="lbl">Pending</span>
                      </div>
                    )}
                    <div className="brm-expand-icon">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="brm-daily-content">
                    <div className="brm-table-wrap" style={{ border: 'none', background: 'transparent' }}>
                      <table className="brm-table brm-table--nested">
                        <thead>
                          <tr>
                            <th>Batch Name</th>
                            <th>Source</th>
                            <th>Employees</th>
                            <th>Status</th>
                            {!isReadOnly && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {dayBatches.map((b) => (
                            <tr key={b.id}>
                              <td style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColor[b.status] }} />
                                {b.name}
                              </td>
                              <td>
                                <span className="brm-source-badge">
                                  {b.source_type === 'csv' && <FileText size={12} />}
                                  {b.source_type === 'manual' && <Edit3 size={12} />}
                                  {b.source_type === 'live' && <Link size={12} />}
                                  <span style={{ marginLeft: '4px' }}>
                                    {b.source_type === 'csv' ? 'CSV' : b.source_type === 'manual' ? 'Manual' : 'Live'}
                                  </span>
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {b.employee_count}
                                  {b.pending_review.length > 0 && (
                                    <span className="brm-badge brm-badge--warn" title="Needs manual linking" onClick={(e) => { e.stopPropagation(); setMatchingBatch(b); }} style={{ cursor: 'pointer' }}>
                                      <Link size={10} /> {b.pending_review.length}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <span className="brm-badge" style={{ color: statusColor[b.status], borderColor: statusColor[b.status] + '40', fontSize: '0.7rem' }}>
                                  {b.status.toUpperCase()}
                                </span>
                              </td>
                              {!isReadOnly && (
                                  <td>
                                    <div className="brm-action-row">
                                      <button 
                                        className="brm-btn brm-btn--xs brm-btn--ghost" 
                                        title="Manage Data"
                                        onClick={() => setEditingBatch(b)}
                                      >
                                        <Database size={12} /> Manage
                                      </button>
                                      {b.status === 'draft' && (
                                        <button className="brm-btn brm-btn--xs brm-btn--primary" onClick={() => publishBatch(b.id)}>
                                          Publish
                                        </button>
                                      )}
                                      <button
                                        className="brm-btn brm-btn--xs brm-btn--danger"
                                        onClick={() => setDeleteBatchConfirm(b.id)}
                                        disabled={deleting === b.id}
                                      >
                                        {deleting === b.id ? '...' : <Trash2 size={12} />}
                                      </button>
                                    </div>
                                  </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .brm-daily-container { display: flex; flex-direction: column; gap: 0.75rem; }
        .brm-daily-block {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 18px;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .brm-daily-block.active {
          background: rgba(255,255,255,0.05);
          border-color: rgba(59,130,246,0.2);
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
        }
        .brm-daily-header {
          padding: 1.25rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          user-select: none;
        }
        .brm-daily-header:hover { background: rgba(255,255,255,0.02); }
        .brm-daily-title { display: flex; alignItems: center; gap: 1.25rem; }
        .brm-daily-date-badge {
          width: 50px;
          height: 50px;
          border-radius: 12px;
          background: #1e293b;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .brm-daily-date-badge .month { font-size: 0.65rem; text-transform: uppercase; font-weight: 800; color: #3b82f6; line-height: 1; }
        .brm-daily-date-badge .day { font-size: 1.25rem; font-weight: 800; color: white; line-height: 1; margin-top: 2px; }
        
        .brm-daily-stats { display: flex; align-items: center; gap: 2rem; }
        .brm-stat { display: flex; flex-direction: column; align-items: flex-end; }
        .brm-stat .val { font-size: 1.1rem; font-weight: 700; color: white; line-height: 1; }
        .brm-stat .lbl { font-size: 0.65rem; text-transform: uppercase; color: #64748b; margin-top: 2px; }
        .brm-stat--warn .val { color: #f59e0b; }
        
        .brm-expand-icon {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.05);
          color: #94a3b8;
          margin-left: 0.5rem;
        }
        
        .brm-daily-content {
          padding: 0 1.5rem 1.5rem;
          animation: brmSlideDown 0.3s ease-out;
        }
        @keyframes brmSlideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .brm-table--nested { background: transparent !important; }
        .brm-table--nested th { background: transparent !important; border-top: 1px solid rgba(255,255,255,0.04); font-size: 0.7rem; color: #475569; }
        .brm-table--nested td { border-bottom: 1px solid rgba(255,255,255,0.03); padding: 1rem 0.75rem; }
      `}</style>

      {deleteBatchConfirm && (
        <ConfirmDialog
          title="Delete batch"
          body="This will delete the batch and all associated schedules. This cannot be undone."
          confirmLabel="Delete"
          tone="danger"
          busy={deleting === deleteBatchConfirm}
          onConfirm={async () => {
            const id = deleteBatchConfirm;
            setDeleteBatchConfirm(null);
            await doDeleteBatch(id);
          }}
          onCancel={() => setDeleteBatchConfirm(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — VARIANCE REPORT
// ═══════════════════════════════════════════════════════════════════════════════

function ReportsTab({ currentUser: _currentUser }: { currentUser: User }) {
  const [{ dateFrom: initialDateFrom, dateTo: initialDateTo }] = useState(() => {
    const now = Date.now();
    return {
      dateFrom: new Date(now - 7 * 864e5).toISOString().slice(0, 10),
      dateTo: new Date(now).toISOString().slice(0, 10),
    };
  });
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [lob, setLob] = useState('');
  const [exporting, setExporting] = useState(false);

  const LOB_OPTIONS = [
    'NYT Universal Voice',
    'NYT Universal Chat',
    'NYT BOT',
    'NYT SCT',
  ];

  async function downloadExcel() {
    setExporting(true);
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (lob) params.set('lob', lob);
    const res = await fetch(`/api/breaks/report/export?${params}`);
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NYT_Breaks_Report_${dateFrom}_to_${dateTo}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  return (
    <div className="brm-reports-tab">
      <div className="brm-filter-bar">
        <div className="brm-field">
          <label className="brm-label">From</label>
          <input type="date" className="brm-input brm-input--sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="brm-field">
          <label className="brm-label">To</label>
          <input type="date" className="brm-input brm-input--sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="brm-field">
          <label className="brm-label">LOB</label>
          <select className="brm-input brm-input--sm" value={lob} onChange={(e) => setLob(e.target.value)}>
            <option value="">All LOBs</option>
            {LOB_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button
          className="brm-btn brm-btn--primary brm-export-btn"
          onClick={downloadExcel}
          disabled={exporting}
          id="brm-export-excel-btn"
        >
          {exporting ? <Activity size={16} className="spin" /> : <FileSpreadsheet size={16} />}
          {exporting ? 'Generating...' : 'Export Excel'}
        </button>
      </div>

      <div className="brm-report-info">
        <div className="brm-report-info__card">
          <span className="brm-report-info__icon"><FileSpreadsheet size={24} /></span>
          <div>
            <p className="brm-report-info__title">Excel Report with Formulas</p>
            <p className="brm-report-info__sub">
              The exported file contains two sheets: <strong>Variance Report</strong> (per event, color-coded)
              and <strong>Employee Summary</strong> (aggregated stats). Variance cells use Excel number formatting
              <code>+0.00;-0.00</code> — positive = late, negative = early.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function AnalyticsTab({ currentUser }: { currentUser: User }) {
  const [bathLog, setBathLog] = useState<{
    log_id: string;
    employee: { name: string; avatar_url: string | null; employee_id: string | null };
    actual_start: string;
    duration_minutes: number;
  }[]>([]);
  const [loadingBath, setLoadingBath] = useState(true);

  const loadBathTime = useCallback(async () => {
    const res = await fetch('/api/breaks/bath-time/active');
    if (res.ok) {
      const data = await res.json() as { logs: typeof bathLog };
      setBathLog(data.logs ?? []);
    }
    setLoadingBath(false);
  }, []);

  useState(() => { loadBathTime(); });

  async function endBath(logId: string) {
    await fetch('/api/breaks/report-end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log_id: logId }),
    });
    loadBathTime();
  }

  return (
    <div className="brm-analytics-tab">
      {/* Bath Time Live Table */}
      <div className="brm-section">
        <div className="brm-section__header">
          <h3 className="brm-section__title">🔴 Currently Offline (Bath Time)</h3>
          <button className="brm-btn brm-btn--ghost brm-btn--xs" onClick={loadBathTime}>Refresh</button>
        </div>

        {loadingBath ? (
          <div className="brm-shimmer-block" />
        ) : bathLog.length === 0 ? (
          <div className="brm-empty-inline">
            <CheckCircle2 size={16} className="brm-text-ok" />
            All agents are currently online.
          </div>
        ) : (
          <div className="brm-table-wrap">
            <table className="brm-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>OPX ID</th>
                  <th>Started</th>
                  <th>Duration</th>
                  {currentUser.role !== 'moderator_b1' && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {bathLog.map((l) => (
                  <tr key={l.log_id} className="brm-tr--offline">
                    <td>
                      <div className="brm-agent-cell">
                        <Activity size={14} className="brm-text-err" />
                        {l.employee.name}
                      </div>
                    </td>
                    <td className="brm-td-mono">{l.employee.employee_id ?? '—'}</td>
                    <td className="brm-td-mono">
                      {new Date(l.actual_start).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true,
                        timeZone: 'America/Santo_Domingo',
                      })}
                    </td>
                    <td>
                      <span className={`brm-duration ${l.duration_minutes > 15 ? 'brm-duration--alert' : ''}`}>
                        {l.duration_minutes > 15 && <AlertTriangle size={12} />}
                        {l.duration_minutes}m
                      </span>
                    </td>
                    {currentUser.role !== 'moderator_b1' && (
                      <td>
                        <button className="brm-btn brm-btn--xs brm-btn--ghost" onClick={() => endBath(l.log_id)}>
                          Mark Online
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Coming soon placeholder for charts */}
      <div className="brm-section">
        <div className="brm-section__header">
          <h3 className="brm-section__title"><BarChart3 size={18} /> Compliance Charts</h3>
        </div>
        <div className="brm-charts-placeholder">
          <p>Charts (Average Variance by LOB, Delay Reason Breakdown, Break Compliance by Day)</p>
          <p className="brm-charts-placeholder__sub">Will render once break data is collected.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Match Agent Drawer Component
// ═══════════════════════════════════════════════════════════════════════════════

function MatchAgentDrawer({ 
  batch, 
  employees, 
  onClose, 
  onSuccess 
}: { 
  batch: ScheduleUploadBatch; 
  employees: Props['employees']; 
  onClose: () => void; 
  onSuccess: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<PendingReviewAgent | null>(batch.pending_review[0] || null);
  const [search, setSearch] = useState('');
  const [matching, setMatching] = useState(false);
  const [matchingStatus, setMatchingStatus] = useState<string | null>(null);
  const [isAutoMatching, setIsAutoMatching] = useState(false);

  const filteredEmployees = employees.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    (e.employee_id && e.employee_id.toLowerCase().includes(search.toLowerCase()))
  );

  async function autoLinkAll() {
    setIsAutoMatching(true);
    let count = 0;
    try {
      for (const agent of batch.pending_review) {
        const match = findBestUserMatch(agent.rawName, employees, 0.85); // slightly lower threshold for semi-auto
        if (match) {
          await fetch('/api/breaks/match-agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batchId: batch.id, rawName: agent.rawName, userId: match.user.id })
          });
          count++;
        }
      }
      if (count > 0) {
        onSuccess();
      } else {
        setMatchingStatus('No se encontraron sugerencias automáticas seguras.');
      }
    } catch {
      setMatchingStatus('Error durante auto-vinculacion.');
    } finally {
      setIsAutoMatching(false);
    }
  }

  async function handleLink(userId: string) {
    if (!selectedAgent) return;
    setMatching(true);
    setMatchingStatus(null);
    try {
      const res = await fetch('/api/breaks/match-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: batch.id,
          rawName: selectedAgent.rawName,
          userId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      if (batch.pending_review.length <= 1) {
        onSuccess();
      } else {
        // Just refresh the batch state locally or wait for success
        onSuccess(); // Simple way for now
      }
    } catch (err) {
      setMatchingStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setMatching(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer Panel */}
      <div className="relative w-full max-w-[900px] h-full bg-[#0d0d12]/90 backdrop-blur-2xl border-l border-white/10 shadow-[-50px_0_100px_rgba(0,0,0,0.5)] flex flex-col animate-slide-in">
        
        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-[#6d5dfc]/20 rounded-2xl text-[#6d5dfc]">
              <Link size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">Vincular Usuarios</h2>
              <p className="text-slate-400 text-sm font-medium">{batch.name} • Resolver conflictos de nombres</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all">
            <XCircle size={24} />
          </button>
        </div>

        {/* Content Grid */}
        <div className="flex-1 overflow-hidden flex">
          
          {/* Left: Unvalidated List (Glassy Sidebar) */}
          <div className="w-[320px] border-right border-white/5 bg-black/20 flex flex-col p-6">
            <h4 className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-500 mb-6 px-2">Pendientes de revisión</h4>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {batch.pending_review.map((agent, i) => (
                <button 
                  key={i} 
                  className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${selectedAgent?.rawName === agent.rawName ? 'bg-[#6d5dfc]/10 border-[#6d5dfc]/50 text-[#6d5dfc]' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}
                  onClick={() => setSelectedAgent(agent)}
                >
                  <span className="text-xs font-bold line-clamp-1">{agent.rawName}</span>
                  <ChevronRight size={14} className={selectedAgent?.rawName === agent.rawName ? 'opacity-100' : 'opacity-20'} />
                </button>
              ))}
            </div>
          </div>

          {/* Right: Search & Employees (White Canvas) */}
          <div className="flex-1 flex flex-col p-8 gap-6 overflow-hidden">
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 pl-12 text-white font-bold placeholder:text-slate-600 outline-none focus:border-[#6d5dfc] transition-all" 
                  placeholder="Buscar por nombre, ID o correo..." 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <button 
                className="px-6 py-4 bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 text-[#6d5dfc] rounded-2xl font-black text-sm flex items-center gap-2 hover:bg-[#6d5dfc]/20 transition-all active:scale-95 whitespace-nowrap"
                onClick={autoLinkAll}
                disabled={isAutoMatching}
              >
                <Sparkles size={18} className={isAutoMatching ? 'animate-spin' : ''} />
                {isAutoMatching ? 'PROCESANDO...' : 'AUTO-MATCH'}
              </button>
            </div>

            {matchingStatus && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest rounded-lg">
                {matchingStatus}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {filteredEmployees.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30">
                  <span className="font-black italic text-slate-500">No se encontraron empleados</span>
                </div>
              ) : (
                filteredEmployees.map(emp => (
                  <div key={emp.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 group hover:bg-white/10 transition-all">
                    <div className="h-10 w-10 rounded-xl bg-[#6d5dfc]/20 flex items-center justify-center text-[#6d5dfc] font-black">
                      {emp.avatar_url ? (
                        <img src={proxifyMediaUrl(emp.avatar_url)} alt="" className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        emp.name.charAt(0)
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-black text-white">{emp.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{emp.employee_id} • {emp.department}</p>
                    </div>
                    <button 
                      className="px-6 py-2.5 bg-white/5 text-xs font-black text-white rounded-xl hover:bg-[#6d5dfc] hover:shadow-[0_0_20px_rgba(109,93,252,0.4)] transition-all active:scale-90 disabled:opacity-50"
                      onClick={() => handleLink(emp.id)}
                      disabled={matching || !selectedAgent}
                    >
                      {matching ? '...' : 'VINCULAR'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .brm-emp-card__avatar img { width: 100%; height: 100%; object-fit: cover; }
        .brm-emp-card__avatar span { font-weight: 800; color: #94a3b8; }
        .brm-emp-card__info { flex: 1; }
        .brm-emp-card__name { font-weight: 600; font-size: 0.95rem; color: #f8fafc; }
        .brm-emp-card__sub { font-size: 0.8rem; color: #64748b; }

        .brm-matching-error { background: rgba(239,68,68,0.1); color: #ef4444; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; }
        .brm-empty-search { padding: 4rem; text-align: center; color: #64748b; font-style: italic; }

        .brm-pending-review-notice {
          margin-top: 1.5rem;
          padding: 1.25rem;
          background: rgba(245,158,11,0.05);
          border: 1px solid rgba(245,158,11,0.2);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1.5rem;
          animation: brmFadeIn 0.4s ease;
        }
        .brm-pending-review-notice__body {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .brm-pending-review-notice strong {
          display: block;
          color: #f59e0b;
          font-size: 0.95rem;
          margin-bottom: 0.25rem;
        }
        .brm-pending-review-notice p {
          margin: 0;
          font-size: 0.85rem;
          color: #94a3b8;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
