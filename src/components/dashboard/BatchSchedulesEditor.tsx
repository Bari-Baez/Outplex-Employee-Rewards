'use client';

import { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Search, 
  AlertCircle, 
  Clock, 
  Users, 
  ChevronRight,
  Filter
} from 'lucide-react';
import { DailySchedule, User } from '@/types/database';

interface BatchSchedulesEditorProps {
  batchId: string;
  batchName: string;
  onClose: () => void;
  onSuccess: () => void;
}

type EditableScheduleValue = DailySchedule[keyof DailySchedule];

export function BatchSchedulesEditor({ 
  batchId, 
  batchName, 
  onClose, 
  onSuccess 
}: BatchSchedulesEditorProps) {
  const [schedules, setSchedules] = useState<DailySchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSchedules();
  }, [batchId]);

  async function fetchSchedules() {
    try {
      setLoading(true);
      const res = await fetch(`/api/breaks/batches/${batchId}/schedules`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSchedules(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los horarios.');
    } finally {
      setLoading(false);
    }
  }

  function handleUpdate(id: string, field: keyof DailySchedule, value: EditableScheduleValue) {
    setSchedules(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    setEditedIds(prev => new Set(prev).add(id));
  }

  async function handleSave() {
    if (editedIds.size === 0) return;
    try {
      setSaving(true);
      setError(null);
      const updates = schedules.filter(s => editedIds.has(s.id));
      
      const res = await fetch(`/api/breaks/batches/${batchId}/schedules`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      
      setEditedIds(new Set());
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = schedules.filter(s => 
    s.employee?.name.toLowerCase().includes(search.toLowerCase()) ||
    s.lob?.toLowerCase().includes(search.toLowerCase()) ||
    s.supervisor_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="brm-editor-overlay">
      <div className="brm-editor-container">
        <div className="brm-editor-header">
          <div className="brm-editor-title-group">
            <div className="brm-editor-icon"><Users size={20} /></div>
            <div>
              <h2 className="brm-editor-title">Editor Maestro de Horarios</h2>
              <p className="brm-editor-sub">{batchName} • {schedules.length} Agentes</p>
            </div>
          </div>
          <div className="brm-editor-actions">
            <div className="brm-editor-search">
              <Search size={18} />
              <input 
                type="text" 
                placeholder="Buscar por nombre, LOB o supervisor..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button 
              className={`brm-btn brm-btn--primary ${editedIds.size === 0 ? 'brm-btn--disabled' : ''}`}
              onClick={handleSave}
              disabled={saving || editedIds.size === 0}
            >
              <Save size={18} />
              {saving ? 'Guardando...' : `Guardar Cambios (${editedIds.size})`}
            </button>
            <button className="brm-btn brm-btn--ghost brm-btn--icon" onClick={onClose}><X size={20} /></button>
          </div>
        </div>

        {error && (
          <div className="brm-editor-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="brm-editor-main">
          {loading ? (
            <div className="brm-editor-loading">Cargando datos del lote...</div>
          ) : (
            <div className="brm-table-wrapper">
              <table className="brm-editor-table">
                <thead>
                  <tr>
                    <th>Agente</th>
                    <th>LOB / Campaña</th>
                    <th>Shift</th>
                    <th>1st Break</th>
                    <th>Lunch</th>
                    <th>2nd Break</th>
                    <th>3rd Break</th>
                    <th>Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id} className={editedIds.has(s.id) ? 'row-edited' : ''}>
                      <td>
                        <div className="agent-cell">
                          <div className="agent-avatar">
                            {s.employee?.avatar_url ? (
                              <img src={s.employee.avatar_url} alt="" />
                            ) : (
                              <span>{s.employee?.name.charAt(0)}</span>
                            )}
                          </div>
                          <div>
                            <div className="agent-name">{s.employee?.name}</div>
                            <div className="agent-id text-xs opacity-50">{s.employee?.employee_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input"
                          value={s.lob || ''} 
                          onChange={e => handleUpdate(s.id, 'lob', e.target.value)}
                        />
                      </td>
                      <td>
                        <div className="time-group">
                          <input 
                            type="text" 
                            className="cell-input time-input"
                            value={s.shift_start || ''} 
                            onChange={e => handleUpdate(s.id, 'shift_start', e.target.value)}
                          />
                          <span className="time-sep">-</span>
                          <input 
                            type="text" 
                            className="cell-input time-input"
                            value={s.shift_end || ''} 
                            onChange={e => handleUpdate(s.id, 'shift_end', e.target.value)}
                          />
                        </div>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input time-input"
                          value={s.first_break_start || ''} 
                          onChange={e => handleUpdate(s.id, 'first_break_start', e.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input time-input"
                          value={s.lunch_start || ''} 
                          onChange={e => handleUpdate(s.id, 'lunch_start', e.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input time-input"
                          value={s.second_break_start || ''} 
                          onChange={e => handleUpdate(s.id, 'second_break_start', e.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input time-input"
                          value={s.third_break_start || ''} 
                          placeholder="N/A"
                          onChange={e => handleUpdate(s.id, 'third_break_start', e.target.value)}
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="cell-input"
                          value={s.supervisor_name || ''} 
                          onChange={e => handleUpdate(s.id, 'supervisor_name', e.target.value)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .brm-editor-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(12px);
          z-index: 3000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }
        .brm-editor-container {
          width: 100%;
          max-width: 1400px;
          height: 90vh;
          background: #0f172a;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 1.5rem;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }
        .brm-editor-header {
          padding: 1.5rem;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .brm-editor-title-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .brm-editor-icon {
          width: 40px;
          height: 40px;
          background: rgba(59, 130, 246, 0.1);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #3b82f6;
        }
        .brm-editor-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin: 0;
        }
        .brm-editor-sub {
          font-size: 0.875rem;
          color: #94a3b8;
          margin: 0;
        }
        .brm-editor-actions {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .brm-editor-search {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: #1e293b;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 0.75rem;
          padding: 0.5rem 1rem;
          width: 320px;
          color: #94a3b8;
        }
        .brm-editor-search input {
          background: transparent;
          border: none;
          color: white;
          outline: none;
          width: 100%;
          font-size: 0.875rem;
        }

        .brm-editor-main {
          flex: 1;
          overflow: hidden;
          background: #020617;
        }
        .brm-table-wrapper {
          height: 100%;
          overflow: auto;
        }
        .brm-editor-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 0.875rem;
        }
        .brm-editor-table thead {
          position: sticky;
          top: 0;
          z-index: 10;
          background: #1e293b;
        }
        .brm-editor-table th {
          padding: 1rem;
          font-weight: 500;
          color: #94a3b8;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .brm-editor-table td {
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .brm-editor-table tr:hover {
          background: rgba(255,255,255,0.02);
        }
        .row-edited {
          background: rgba(59, 130, 246, 0.05) !important;
        }

        .agent-cell {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .agent-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: #334155;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          overflow: hidden;
        }
        .agent-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .agent-name { font-weight: 500; }

        .cell-input {
          background: rgba(255,255,255,0.05);
          border: 1px solid transparent;
          border-radius: 0.4rem;
          padding: 0.4rem 0.6rem;
          color: white;
          width: 100%;
          transition: all 0.2s;
        }
        .cell-input:focus {
          background: rgba(255,255,255,0.1);
          border-color: #3b82f6;
          outline: none;
        }
        .time-group {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .time-input {
          width: 70px;
          text-align: center;
        }
        .time-sep { color: #475569; }

        .brm-editor-error {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          padding: 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          border-bottom: 1px solid rgba(239, 68, 68, 0.2);
        }
      `}</style>
    </div>
  );
}
