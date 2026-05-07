'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Download,
  FormInput,
  GripVertical,
  Lock,
  Minus,
  MoreVertical,
  Plus,
  Send,
  Settings,
  Share2,
  Star,
  Trash2,
  Type,
  Users,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  Tooltip,
} from 'recharts';
import { ModernSelect } from '@/components/ui/Select';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { ModernTimePicker } from '@/components/ui/TimePicker';
import {
  DEFAULT_FORM_SETTINGS,
  FIELD_TYPE_LABELS,
  LOCKED_LABELS,
  type FormCompletionStatus,
  type FormDefinition,
  type FormField,
  type FormFieldType,
  type FormResponse,
  type FormStatus,
  type FormSummaryWithStats,
  type LockedFieldSource,
} from '@/lib/forms/types';
import { proxifyMediaUrl } from '@/lib/media-proxy';

// ─── Types ───────────────────────────────────────────────────────────────────
type AppView = 'list' | 'builder';
type BuilderTab = 'questions' | 'responses' | 'settings';
type ResponseSubTab = 'summary' | 'question' | 'individual';

interface Props { moderatorName: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<FormStatus, { bg: string; color: string; label: string }> = {
  draft:     { bg: 'rgba(99,102,241,0.14)',  color: 'var(--brand-primary-light)', label: 'Borrador' },
  published: { bg: 'rgba(16,185,129,0.14)',  color: '#34d399',                   label: 'Publicado' },
  closed:    { bg: 'rgba(156,163,175,0.14)', color: '#9ca3af',                   label: 'Cerrado' },
};

const CHART_COLORS = ['#6366f1', '#34d399', '#f87171', '#fbbf24', '#60a5fa', '#a78bfa', '#fb923c'];

const FIELD_TOOLBAR: { type: FormFieldType; icon: string; label: string }[] = [
  { type: 'short_text', icon: 'Aa', label: 'Respuesta corta' },
  { type: 'long_text',  icon: '¶',  label: 'Párrafo' },
  { type: 'radio',      icon: '◉',  label: 'Opción múltiple' },
  { type: 'checkbox',   icon: '☑',  label: 'Casillas' },
  { type: 'select',     icon: '▾',  label: 'Desplegable' },
  { type: 'number',     icon: '#',  label: 'Número' },
  { type: 'email',      icon: '@',  label: 'Correo' },
  { type: 'date',       icon: '📅', label: 'Fecha' },
  { type: 'rating',     icon: '★',  label: 'Calificación' },
  { type: 'image',      icon: '🖼',  label: 'Imagen' },
  { type: 'section',    icon: '§',  label: 'Sección' },
];

// ─── Templates ────────────────────────────────────────────────────────────────
function makeId() { return crypto.randomUUID(); }

const TEMPLATES: { id: string; title: string; description: string; icon: string; fields: () => FormField[] }[] = [
  {
    id: 'blank', title: 'En blanco', description: 'Empieza desde cero', icon: '📄',
    fields: () => [],
  },
  {
    id: 'job', title: 'Solicitud de puesto', description: 'Candidatos internos', icon: '💼',
    fields: () => [
      { id: makeId(), type: 'short_text', label: 'Nombre completo', required: true, locked: 'user_name' },
      { id: makeId(), type: 'email',      label: 'Correo electrónico', required: true, locked: 'user_email' },
      { id: makeId(), type: 'short_text', label: 'ID de empleado', required: true, locked: 'user_employee_id' },
      { id: makeId(), type: 'section',    label: 'Información del puesto', required: false, helpText: 'Completa los datos del puesto al que aplicas.' },
      { id: makeId(), type: 'short_text', label: '¿A qué puesto aplicas?', required: true, placeholder: 'Nombre del puesto…' },
      { id: makeId(), type: 'short_text', label: '¿Cuánto tiempo llevas en la empresa?', required: true, placeholder: 'Ej: 2 años 3 meses' },
      { id: makeId(), type: 'radio',      label: '¿Tienes experiencia previa en esa área?', required: true, options: ['Sí', 'No', 'Algo de experiencia'] },
      { id: makeId(), type: 'long_text',  label: '¿Por qué crees que eres el candidato ideal?', required: true, placeholder: 'Escribe aquí…', validation: { minLength: 80 } },
      { id: makeId(), type: 'radio',      label: 'Disponibilidad para el puesto', required: true, options: ['Inmediata', 'En 2 semanas', 'En 1 mes', 'Más de 1 mes'] },
    ],
  },
  {
    id: 'satisfaction', title: 'Encuesta de satisfacción', description: 'Clima laboral y bienestar', icon: '😊',
    fields: () => [
      { id: makeId(), type: 'short_text', label: 'Nombre', required: false, locked: 'user_name' },
      { id: makeId(), type: 'section',    label: 'Ambiente laboral', required: false },
      { id: makeId(), type: 'rating',     label: '¿Qué tan satisfecho estás con tu ambiente de trabajo?', required: true, validation: { max: 5 } },
      { id: makeId(), type: 'rating',     label: '¿Cómo calificarías la comunicación con tu equipo?', required: true, validation: { max: 5 } },
      { id: makeId(), type: 'radio',      label: '¿Te sientes reconocido por tu trabajo?', required: true, options: ['Siempre', 'Con frecuencia', 'A veces', 'Rara vez', 'Nunca'] },
      { id: makeId(), type: 'section',    label: 'Desarrollo profesional', required: false },
      { id: makeId(), type: 'rating',     label: '¿Sientes que tienes oportunidades de crecimiento?', required: true, validation: { max: 5 } },
      { id: makeId(), type: 'checkbox',   label: '¿Qué beneficios te gustaría que la empresa implementara?', required: false, options: ['Más capacitaciones', 'Bonos de desempeño', 'Horario flexible', 'Trabajo remoto', 'Seguro médico ampliado'] },
      { id: makeId(), type: 'long_text',  label: 'Comentarios adicionales (opcional)', required: false, placeholder: 'Escribe aquí tus sugerencias…' },
    ],
  },
  {
    id: 'schedule', title: 'Solicitud de horario', description: 'Solicita tu turno preferido', icon: '🗓️',
    fields: () => [
      { id: makeId(), type: 'short_text', label: 'Nombre', required: true, locked: 'user_name' },
      { id: makeId(), type: 'short_text', label: 'ID de empleado', required: true, locked: 'user_employee_id' },
      { id: makeId(), type: 'date',       label: 'Fecha de inicio solicitada', required: true },
      { id: makeId(), type: 'radio',      label: 'Turno preferido', required: true, options: ['Mañana (6am – 2pm)', 'Tarde (2pm – 10pm)', 'Noche (10pm – 6am)', 'Sin preferencia'] },
      { id: makeId(), type: 'checkbox',   label: 'Días disponibles', required: true, options: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] },
      { id: makeId(), type: 'radio',      label: '¿Tienes alguna restricción de horario?', required: true, options: ['No', 'Sí — especifica abajo'] },
      { id: makeId(), type: 'long_text',  label: 'Detalla cualquier restricción o preferencia', required: false, placeholder: 'Ej: No puedo trabajar los miércoles después de las 6pm…' },
    ],
  },
  {
    id: 'evaluation', title: 'Evaluación de desempeño', description: 'Autoevaluación del empleado', icon: '📊',
    fields: () => [
      { id: makeId(), type: 'short_text', label: 'Nombre completo', required: true, locked: 'user_name' },
      { id: makeId(), type: 'short_text', label: 'Correo', required: true, locked: 'user_email' },
      { id: makeId(), type: 'section',    label: 'Desempeño general', required: false },
      { id: makeId(), type: 'rating',     label: '¿Cómo evalúas tu desempeño este período?', required: true, validation: { max: 5 } },
      { id: makeId(), type: 'long_text',  label: '¿Cuáles fueron tus logros más importantes?', required: true, placeholder: 'Lista tus principales logros…', validation: { minLength: 50 } },
      { id: makeId(), type: 'long_text',  label: '¿En qué áreas puedes mejorar?', required: true, placeholder: 'Sé honesto y específico…', validation: { minLength: 40 } },
      { id: makeId(), type: 'radio',      label: '¿Cumpliste tus objetivos del período?', required: true, options: ['Superé los objetivos', 'Cumplí todos los objetivos', 'Cumplí la mayoría', 'No cumplí los objetivos'] },
      { id: makeId(), type: 'long_text',  label: '¿Qué metas te propones para el siguiente período?', required: true, placeholder: 'Escribe tus metas…' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function newField(type: FormFieldType): FormField {
  const f: FormField = { id: makeId(), type, label: FIELD_TYPE_LABELS[type], required: false };
  if (type === 'radio' || type === 'checkbox' || type === 'select') f.options = ['Opción 1', 'Opción 2', 'Opción 3'];
  if (type === 'rating') f.validation = { max: 5 };
  return f;
}
function duplicateField(f: FormField): FormField {
  return { ...f, id: makeId() };
}

// ─── Question Card Component ──────────────────────────────────────────────────
function QuestionCard({
  field,
  index,
  total,
  isActive,
  onActivate,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  field: FormField;
  index: number;
  total: number;
  isActive: boolean;
  onActivate: () => void;
  onChange: (f: FormField) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const update = (patch: Partial<FormField>) => onChange({ ...field, ...patch });
  const updateVal = (patch: Partial<NonNullable<FormField['validation']>>) =>
    onChange({ ...field, validation: { ...(field.validation ?? {}), ...patch } });

  const isSection = field.type === 'section';
  const hasOpts = ['radio', 'checkbox', 'select'].includes(field.type);
  const canLock = ['short_text', 'email', 'number', 'date'].includes(field.type);

  return (
    <div
      className={`gf-question-card ${isActive ? 'gf-question-active' : ''} ${isSection ? 'gf-section-card' : ''}`}
      onClick={!isActive ? onActivate : undefined}
    >
      {/* Collapsed view */}
      {!isActive && (
        <div className="gf-q-collapsed">
          {isSection ? (
            <>
              <div className="gf-section-title-preview">{field.label || 'Sección sin título'}</div>
              {field.helpText && <div className="gf-section-desc-preview">{field.helpText}</div>}
            </>
          ) : (
            <>
              <div className="gf-q-label-preview">
                {field.label || 'Pregunta sin título'}
                {field.required && <span className="gf-required-dot">*</span>}
                {field.locked && <span className="gf-lock-chip"><Lock size={9} /></span>}
              </div>
              <div className="gf-q-type-preview">{FIELD_TYPE_LABELS[field.type]}</div>
            </>
          )}
        </div>
      )}

      {/* Expanded (active) editing view */}
      {isActive && (
        <div className="gf-q-expanded">
          {/* Header: label + type selector */}
          <div className="gf-q-header-row">
            <input
              className="gf-label-input"
              value={field.label}
              onChange={(e) => update({ label: e.target.value })}
              placeholder={isSection ? 'Título de sección…' : 'Pregunta sin título'}
              autoFocus
            />
            {!isSection && (
              <div className="gf-type-selector">
                <ModernSelect
                  value={field.type}
                  onValueChange={v => {
                    const t = v as FormFieldType;
                    const updated = newField(t);
                    onChange({ ...updated, id: field.id, label: field.label, helpText: field.helpText, required: field.required });
                  }}
                  options={FIELD_TOOLBAR.filter((ft) => ft.type !== 'section').map((ft) => ({
                    label: ft.label,
                    value: ft.type
                  }))}
                />
              </div>
            )}
          </div>

          {/* Description / help text */}
          <input
            className="gf-help-input"
            value={field.helpText ?? ''}
            onChange={(e) => update({ helpText: e.target.value })}
            placeholder={isSection ? 'Descripción (opcional)…' : 'Texto de ayuda (opcional)…'}
          />

          {/* Field-specific editing */}
          {!isSection && (
            <div className="gf-q-body">
              {/* Placeholder for text-like types */}
              {(field.type === 'short_text' || field.type === 'email' || field.type === 'number') && (
                <input
                  className="input gf-placeholder-input"
                  placeholder="Placeholder del campo (opcional)"
                  value={field.placeholder ?? ''}
                  onChange={(e) => update({ placeholder: e.target.value })}
                />
              )}
              {field.type === 'long_text' && (
                <input
                  className="input gf-placeholder-input"
                  placeholder="Placeholder del área de texto"
                  value={field.placeholder ?? ''}
                  onChange={(e) => update({ placeholder: e.target.value })}
                />
              )}

              {/* Options editor */}
              {hasOpts && (
                <div className="gf-options-editor">
                  {(field.options ?? []).map((opt, i) => (
                    <div key={i} className="gf-option-edit-row">
                      <div className="gf-option-bullet">
                        {field.type === 'radio'    ? <div className="gf-radio-dot" /> : null}
                        {field.type === 'checkbox' ? <div className="gf-check-box" /> : null}
                        {field.type === 'select'   ? <span className="gf-select-num">{i + 1}</span> : null}
                      </div>
                      <input
                        className="gf-option-input"
                        value={opt}
                        onChange={(e) => {
                          const next = [...(field.options ?? [])];
                          next[i] = e.target.value;
                          update({ options: next });
                        }}
                      />
                      <button type="button" className="gf-icon-btn" onClick={() => update({ options: (field.options ?? []).filter((_, j) => j !== i) })}>
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="gf-add-option-btn" onClick={() => update({ options: [...(field.options ?? []), `Opción ${(field.options?.length ?? 0) + 1}`] })}>
                    <Plus size={13} /> Agregar opción
                  </button>
                </div>
              )}

              {/* Rating scale */}
              {field.type === 'rating' && (
                <div className="gf-rating-config">
                  <label className="gf-setting-label">Escala:</label>
                  <ModernSelect
                    value={String(field.validation?.max ?? 5)}
                    onValueChange={v => updateVal({ max: Number(v) })}
                    options={[3, 4, 5, 7, 10].map(n => ({
                      label: `${n} estrellas`,
                      value: String(n)
                    }))}
                  />
                </div>
              )}

              {/* Image field */}
              {field.type === 'image' && (
                <div className="gf-q-body">
                  <div className="gf-setting-label">URL de la Imagen</div>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <input
                      className="input gf-placeholder-input"
                      style={{ flex: 1 }}
                      placeholder="https://ejemplo.com/imagen.jpg"
                      value={field.imageUrl ?? ''}
                      onChange={(e) => update({ imageUrl: e.target.value })}
                    />
                    {field.imageUrl && (
                      <div style={{ width: 80, height: 60, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proxifyMediaUrl(field.imageUrl)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: '0.75rem' }}>
                    <label className="gf-setting-label">Texto bajo imagen (opcional):</label>
                    <input
                      className="input"
                      placeholder="Ej: Foto de referencia"
                      value={field.label}
                      onChange={(e) => update({ label: e.target.value })}
                    />
                  </div>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <label className="gf-setting-label">URL de imagen:</label>
                    <input
                      className="input"
                      placeholder="https://ejemplo.com/imagen.jpg"
                      value={field.imageUrl ?? ''}
                      onChange={(e) => update({ imageUrl: e.target.value })}
                    />
                  </div>
                  {field.imageUrl && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(15,23,42,0.2))', borderRadius: 12, border: '1px solid rgba(99,102,241,0.2)' }}>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vista previa:</div>
                      <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.15)', background: 'rgba(0,0,0,0.2)' }}>
                        <img src={proxifyMediaUrl(field.imageUrl)} alt="preview" style={{ width: '100%', height: 'auto', maxHeight: '280px', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.5'; }} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Validation */}
              {(field.type === 'short_text' || field.type === 'long_text') && (
                <div className="gf-validation-row">
                  <label className="gf-setting-label">Longitud:</label>
                  <input className="input" type="number" min="0" placeholder="Mín." style={{ width: 70, height: 32 }} value={field.validation?.minLength ?? ''} onChange={(e) => updateVal({ minLength: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className="gf-setting-label">–</span>
                  <input className="input" type="number" min="0" placeholder="Máx." style={{ width: 70, height: 32 }} value={field.validation?.maxLength ?? ''} onChange={(e) => updateVal({ maxLength: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className="gf-setting-label">caracteres</span>
                </div>
              )}
              {field.type === 'number' && (
                <div className="gf-validation-row">
                  <label className="gf-setting-label">Rango:</label>
                  <input className="input" type="number" placeholder="Mín." style={{ width: 80, height: 32 }} value={field.validation?.min ?? ''} onChange={(e) => updateVal({ min: e.target.value ? Number(e.target.value) : undefined })} />
                  <span className="gf-setting-label">–</span>
                  <input className="input" type="number" placeholder="Máx." style={{ width: 80, height: 32 }} value={field.validation?.max ?? ''} onChange={(e) => updateVal({ max: e.target.value ? Number(e.target.value) : undefined })} />
                </div>
              )}

              {/* Auto-fill lock */}
              {canLock && (
                <div className="gf-lock-row">
                  <label className="gf-toggle-label">
                    <input type="checkbox" checked={!!field.locked} onChange={(e) => update({ locked: e.target.checked ? 'user_name' : null })} />
                    <Lock size={13} /> Auto-completar desde perfil
                  </label>
                  {field.locked && (
                    <ModernSelect
                      value={field.locked}
                      onValueChange={v => update({ locked: v as LockedFieldSource })}
                      options={[
                        { label: 'Nombre del empleado', value: 'user_name' },
                        { label: 'Correo del empleado', value: 'user_email' },
                        { label: 'ID de empleado', value: 'user_employee_id' }
                      ]}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Footer: required + actions */}
          <div className="gf-q-footer">
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" className="gf-icon-btn" title="Mover arriba" disabled={index === 0} onClick={() => onMove(-1)}><GripVertical size={14} style={{ rotate: '90deg' }} /></button>
              <button type="button" className="gf-icon-btn" title="Duplicar" onClick={onDuplicate}><Copy size={14} /></button>
              <button type="button" className="gf-icon-btn gf-icon-danger" title="Eliminar" onClick={onRemove}><Trash2 size={14} /></button>
            </div>
            <div className="gf-q-footer-divider" />
            {!isSection && (
              <label className="gf-toggle-label">
                <input type="checkbox" checked={field.required} onChange={(e) => update({ required: e.target.checked })} />
                Obligatorio
              </label>
            )}
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {index > 0 && <button type="button" className="gf-icon-btn" onClick={() => onMove(-1)}>↑</button>}
              {index < total - 1 && <button type="button" className="gf-icon-btn" onClick={() => onMove(1)}>↓</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Response analytics helpers ───────────────────────────────────────────────
function aggregateField(field: FormField, responses: FormResponse[]) {
  const counts: Record<string, number> = {};
  const texts: string[] = [];
  for (const r of responses) {
    const val = (r.answers as Record<string, unknown>)[field.id];
    if (val === undefined || val === null || val === '') continue;
    if (field.type === 'checkbox' && Array.isArray(val)) {
      for (const v of val as string[]) counts[v] = (counts[v] ?? 0) + 1;
    } else {
      const s = String(val);
      if (field.type === 'radio' || field.type === 'select' || field.type === 'rating') {
        counts[s] = (counts[s] ?? 0) + 1;
      } else {
        texts.push(s);
      }
    }
  }
  const chartData = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  return { chartData, texts };
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ModeratorFormsClient({ moderatorName: _mod }: Props) {
  const [view, setView]                   = useState<AppView>('list');
  const [forms, setForms]                 = useState<FormSummaryWithStats[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [showTemplates, setShowTemplates] = useState(false);

  // Builder state
  const [draft, setDraft]                 = useState<FormDefinition | null>(null);
  const [builderTab, setBuilderTab]       = useState<BuilderTab>('questions');
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [isSaving, setIsSaving]           = useState(false);
  const [isPublishing, setIsPublishing]   = useState(false);

  // Response data
  const [responses, setResponses]         = useState<FormResponse[]>([]);
  const [completion, setCompletion]       = useState<FormCompletionStatus | null>(null);
  const [loadingResp, setLoadingResp]     = useState(false);
  const [respSubTab, setRespSubTab]       = useState<ResponseSubTab>('summary');
  const [respIndex, setRespIndex]         = useState(0);
  const [respQuestionId, setRespQuestionId] = useState<string>('');
  const [respRoleFilter, setRespRoleFilter] = useState<'all' | 'employee' | 'moderator' | 'ti' | 'other'>('all');

  // Google integration
  const [googleConnected, setGoogleConnected]       = useState<boolean | null>(null);
  const [showGoogleImport, setShowGoogleImport]     = useState(false);
  const [googleForms, setGoogleForms]               = useState<{ id: string; name: string; modifiedTime: string }[]>([]);
  const [googleFormsLoading, setGoogleFormsLoading] = useState(false);
  const [importingId, setImportingId]               = useState<string | null>(null);
  const [sheetsExporting, setSheetsExporting]       = useState(false);
  const [deleteConfirm, setDeleteConfirm]           = useState<{ id: string; title: string } | null>(null);

  // Notice
  const [notice, setNotice] = useState<{ msg: string; tone: 'success' | 'danger' } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = (msg: string, tone: 'success' | 'danger' = 'success') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ msg, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  // ─── Load forms ─────────────────────────────────────────────────────────────
  const loadForms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/forms');
      const d = (await res.json()) as { data?: FormSummaryWithStats[] };
      setForms(d.data ?? []);
    } catch { showNotice('Error al cargar formularios.', 'danger'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => { void loadForms(); }, [loadForms]);

  useEffect(() => {
    fetch('/api/google/status')
      .then((r) => r.json())
      .then((d: { connected: boolean }) => setGoogleConnected(d.connected))
      .catch(() => setGoogleConnected(false));
  }, []);

  // ─── Load responses + completion when switching to Responses tab ─────────────
  useEffect(() => {
    if (builderTab !== 'responses' || !draft?.id) return;
    setLoadingResp(true);
    Promise.all([
      fetch(`/api/forms/${draft.id}/responses`).then((r) => r.json()) as Promise<{ data?: FormResponse[] }>,
      fetch(`/api/forms/${draft.id}/completion`).then((r) => r.json()) as Promise<{ data?: FormCompletionStatus }>,
    ]).then(([rData, cData]) => {
      setResponses(rData.data ?? []);
      setCompletion(cData.data ?? null);
      setRespIndex(0);
      const firstChoiceField = draft.fields.find((f) => ['radio', 'checkbox', 'select', 'rating'].includes(f.type));
      if (firstChoiceField) setRespQuestionId(firstChoiceField.id);
    }).catch(() => showNotice('Error al cargar respuestas.', 'danger'))
      .finally(() => setLoadingResp(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builderTab, draft?.id]);

  // ─── Open builder ────────────────────────────────────────────────────────────
  const openBuilder = (form?: FormSummaryWithStats, templateFields?: FormField[]) => {
    if (form) {
      setIsLoading(true);
      setActiveFieldId(null);
      setBuilderTab('questions');
      setResponses([]);
      setCompletion(null);
      setShowTemplates(false);

      fetch(`/api/forms/${form.id}`)
        .then((r) => r.json())
        .then((d: { data?: FormDefinition; error?: string }) => {
          if (d.data) {
            setDraft(d.data);
            setView('builder');
          } else {
            showNotice(d.error ?? 'Error al abrir el formulario.', 'danger');
          }
        })
        .catch(() => showNotice('Error al abrir el formulario.', 'danger'))
        .finally(() => setIsLoading(false));
      return;
    } else {
      setDraft({
        id: '', title: 'Formulario sin título', description: '',
        fields: templateFields ?? [],
        settings: { ...DEFAULT_FORM_SETTINGS },
        status: 'draft', created_by: '',
        published_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_mandatory: false,
      });
    }
    setActiveFieldId(null);
    setBuilderTab('questions');
    setResponses([]);
    setCompletion(null);
    setView('builder');
    setShowTemplates(false);
  };

  // ─── Save ───────────────────────────────────────────────────────────────────
  const saveDraft = async (): Promise<string | null> => {
    if (!draft) return null;
    if (!draft.title.trim()) { showNotice('El título es requerido.', 'danger'); return null; }
    setIsSaving(true);
    try {
      if (draft.id) {
        const res = await fetch(`/api/forms/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: draft.title, description: draft.description, fields: draft.fields, settings: draft.settings, is_mandatory: draft.is_mandatory }),
        });
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) { showNotice(d.error ?? 'Error al guardar.', 'danger'); return null; }
        showNotice('Guardado.');
        await loadForms();
        return draft.id;
      }

      const createRes = await fetch('/api/forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, description: draft.description }),
      });
      const created = (await createRes.json().catch(() => ({}))) as { data?: FormDefinition; error?: string };
      if (!createRes.ok || !created.data) { showNotice(created.error ?? 'Error al crear el formulario.', 'danger'); return null; }

      const patchRes = await fetch(`/api/forms/${created.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: draft.fields, settings: draft.settings, is_mandatory: draft.is_mandatory }),
      });
      const patchD = (await patchRes.json().catch(() => ({}))) as { error?: string };
      if (!patchRes.ok) { showNotice(patchD.error ?? 'Error al guardar.', 'danger'); return null; }

      setDraft((p) => p ? { ...p, id: created.data!.id } : p);
      showNotice('Formulario creado y guardado.');
      await loadForms();
      return created.data.id;
    } catch {
      showNotice('Error al guardar.', 'danger');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Publish / close ────────────────────────────────────────────────────────
  const togglePublish = async () => {
    setIsPublishing(true);
    try {
      let formId = draft?.id ?? null;
      if (!formId) formId = await saveDraft();
      if (!formId) { showNotice('No se pudo guardar antes de publicar.', 'danger'); return; }

      const res = await fetch(`/api/forms/${formId}/publish`, { method: 'POST' });
      const d = (await res.json().catch(() => ({}))) as { data?: FormDefinition; error?: string };
      if (!res.ok || !d.data) { showNotice(d.error ?? 'Error al publicar.', 'danger'); return; }

      setDraft((p) => p ? { ...p, status: d.data!.status, published_at: d.data!.published_at } : p);
      setForms((prev) => prev.map((f) => f.id === d.data!.id ? { ...f, status: d.data!.status } : f));
      showNotice(d.data.status === 'published' ? '¡Formulario publicado!' : 'Formulario cerrado.');
    } catch {
      showNotice('Error al publicar.', 'danger');
    } finally {
      setIsPublishing(false);
    }
  };

  const deleteForm = async (id: string) => {
    const res = await fetch(`/api/forms/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json() as { error?: string };
      showNotice(d.error ?? 'Error al eliminar.', 'danger');
      return;
    }
    setForms((p) => p.filter((f) => f.id !== id));
    showNotice('Formulario eliminado.');
  };

  // ─── Field operations ────────────────────────────────────────────────────────
  const addField = (type: FormFieldType) => {
    const f = newField(type);
    setDraft((p) => {
      if (!p) return p;
      const activeIdx = p.fields.findIndex((field) => field.id === activeFieldId);
      const insertAt = activeIdx >= 0 ? activeIdx + 1 : p.fields.length;
      const next = [...p.fields];
      next.splice(insertAt, 0, f);
      return { ...p, fields: next };
    });
    setActiveFieldId(f.id);
  };

  const updateField = (updated: FormField) =>
    setDraft((p) => p ? { ...p, fields: p.fields.map((f) => f.id === updated.id ? updated : f) } : p);

  const removeField = (id: string) => {
    setDraft((p) => p ? { ...p, fields: p.fields.filter((f) => f.id !== id) } : p);
    setActiveFieldId(null);
  };

  const dupField = (id: string) => {
    setDraft((p) => {
      if (!p) return p;
      const idx = p.fields.findIndex((f) => f.id === id);
      const copy = duplicateField(p.fields[idx]!);
      const next = [...p.fields];
      next.splice(idx + 1, 0, copy);
      return { ...p, fields: next };
    });
  };

  const moveField = (id: string, dir: -1 | 1) => {
    setDraft((p) => {
      if (!p) return p;
      const idx = p.fields.findIndex((f) => f.id === id);
      const next = [...p.fields];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return p;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...p, fields: next };
    });
  };

  // ─── Memos ───────────────────────────────────────────────────────────────────
  const completionRate = useMemo(() => completion
    ? Math.round((completion.completed.length / Math.max(1, completion.completed.length + completion.pending.length)) * 100)
    : null, [completion]);

  const filteredResponses = useMemo(() =>
    respRoleFilter === 'all' ? responses : responses.filter((r) => r.user?.role === respRoleFilter),
    [responses, respRoleFilter]);

  const currentResponse = filteredResponses[respIndex] ?? null;

  const respQuestionField = useMemo(() =>
    draft?.fields.find((f) => f.id === respQuestionId) ?? null,
    [draft, respQuestionId]);

  const respQuestionAgg = useMemo(() =>
    respQuestionField ? aggregateField(respQuestionField, filteredResponses) : null,
    [respQuestionField, filteredResponses]);

  // ─── Google helpers ───────────────────────────────────────────────────────────
  const openGoogleImport = async () => {
    setShowGoogleImport(true);
    if (googleForms.length > 0) return;
    setGoogleFormsLoading(true);
    try {
      const res = await fetch('/api/google/forms');
      const d = await res.json() as { forms?: { id: string; name: string; modifiedTime: string }[]; error?: string };
      if (d.error) { showNotice(d.error, 'danger'); setShowGoogleImport(false); return; }
      setGoogleForms(d.forms ?? []);
    } catch { showNotice('Error al cargar Google Forms.', 'danger'); setShowGoogleImport(false); }
    finally { setGoogleFormsLoading(false); }
  };

  const importGoogleForm = async (googleFormId: string) => {
    setImportingId(googleFormId);
    try {
      const res = await fetch('/api/google/forms/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleFormId }),
      });
      const d = await res.json() as { formId?: string; fieldCount?: number; error?: string };
      if (d.error) { showNotice(d.error, 'danger'); return; }
      setShowGoogleImport(false);
      setGoogleForms([]);
      await loadForms();
      showNotice(`Formulario importado con ${d.fieldCount} campos. Revísalo antes de publicar.`);
    } catch { showNotice('Error al importar.', 'danger'); }
    finally { setImportingId(null); }
  };

  const exportToSheets = async () => {
    if (!draft?.id) return;
    setSheetsExporting(true);
    try {
      const res = await fetch('/api/google/sheets/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formId: draft.id }),
      });
      const d = await res.json() as { spreadsheetUrl?: string; rowsWritten?: number; error?: string };
      if (d.error) { showNotice(d.error, 'danger'); return; }
      showNotice(`Exportado a Google Sheets (${d.rowsWritten} filas).`);
      if (d.spreadsheetUrl) window.open(d.spreadsheetUrl, '_blank');
    } catch { showNotice('Error al exportar a Sheets.', 'danger'); }
    finally { setSheetsExporting(false); }
  };

  // ─── LIST VIEW ────────────────────────────────────────────────────────────────
  if (view === 'list') {
    return (
      <div className="page-content-inner">
        <div className="gf-list-header">
          <div>
            <h1 className="page-title">Form Builder</h1>
            <p className="text-muted" style={{ marginTop: '0.3rem' }}>Crea encuestas, solicitudes y evaluaciones internas.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
            {googleConnected && (
              <button className="btn btn-ghost" style={{ fontSize: '0.83rem', gap: '0.4rem' }} onClick={() => void openGoogleImport()}>
                {/* Google G */}
                <svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.1 33.5 29.5 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20.7-8 20.7-21 0-1.4-.1-2.7-.2-4z" fill="#FFC107"/><path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.2-17.7 10.7z" fill="#FF3D00"/><path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.6C29.5 36 26.9 37 24 37c-5.5 0-10.1-3.5-11.8-8.3l-7 5.4C8.6 41 15.8 45 24 45z" fill="#4CAF50"/><path d="M44.5 20H24v8.5h11.8c-.9 2.6-2.6 4.8-4.8 6.4l6.6 5.6c-.4.3 6.9-5 6.9-16.5 0-1.4-.1-2.7-.2-4z" fill="#1976D2"/></svg>
                Importar de Google
              </button>
            )}
            {googleConnected === false && (
              <a href="/settings" className="btn btn-ghost" style={{ fontSize: '0.83rem' }}>
                Conectar Google
              </a>
            )}
            <button className="btn btn-primary" onClick={() => setShowTemplates(true)}>
              <Plus size={16} /> Nuevo formulario
            </button>
          </div>
        </div>

        {notice && (
          <div className={`gf-notice gf-notice-${notice.tone}`}>
            <AlertCircle size={14} /> {notice.msg}
            <button onClick={() => setNotice(null)}><X size={12} /></button>
          </div>
        )}

        {/* Google Forms import modal */}
        {showGoogleImport && (
          <div className="modal-overlay" onClick={() => setShowGoogleImport(false)}>
            <div className="gf-template-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                  <svg width="20" height="20" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.1 33.5 29.5 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20.7-8 20.7-21 0-1.4-.1-2.7-.2-4z" fill="#FFC107"/><path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.2-17.7 10.7z" fill="#FF3D00"/><path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.6C29.5 36 26.9 37 24 37c-5.5 0-10.1-3.5-11.8-8.3l-7 5.4C8.6 41 15.8 45 24 45z" fill="#4CAF50"/><path d="M44.5 20H24v8.5h11.8c-.9 2.6-2.6 4.8-4.8 6.4l6.6 5.6c-.4.3 6.9-5 6.9-16.5 0-1.4-.1-2.7-.2-4z" fill="#1976D2"/></svg>
                  <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Importar Google Form</h2>
                </div>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem' }} onClick={() => setShowGoogleImport(false)}><X size={16} /></button>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem', marginTop: 0 }}>
                Selecciona un formulario de Google para convertirlo al editor interno. Se guardará como borrador.
              </p>
              {googleFormsLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Cargando tus Google Forms…</div>
              ) : googleForms.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No se encontraron Google Forms en tu cuenta.</div>
              ) : (
                <div style={{ display: 'grid', gap: '0.5rem', maxHeight: 360, overflowY: 'auto' }}>
                  {googleForms.map((gf) => (
                    <div key={gf.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.75rem 1rem', border: '1px solid var(--border-subtle)',
                      borderRadius: 10, background: 'var(--bg-elevated)', gap: '0.75rem',
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gf.name}</div>
                        <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          Modificado: {new Date(gf.modifiedTime).toLocaleDateString('es-MX')}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem', flexShrink: 0 }}
                        disabled={importingId === gf.id}
                        onClick={() => void importGoogleForm(gf.id)}
                      >
                        {importingId === gf.id ? 'Importando…' : 'Importar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Template picker modal */}
        {showTemplates && (
          <div className="modal-overlay" onClick={() => setShowTemplates(false)}>
            <div className="gf-template-modal" onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Elige una plantilla</h2>
                <button type="button" className="btn btn-ghost" style={{ padding: '0.35rem' }} onClick={() => setShowTemplates(false)}><X size={16} /></button>
              </div>
              <div className="gf-template-grid">
                {TEMPLATES.map((t) => (
                  <button key={t.id} type="button" className="gf-template-card" onClick={() => openBuilder(undefined, t.fields())}>
                    <span className="gf-template-icon">{t.icon}</span>
                    <span className="gf-template-title">{t.title}</span>
                    <span className="gf-template-desc">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Delete confirm modal */}
        {deleteConfirm && (
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="gf-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Eliminar formulario</h2>
              <p className="text-muted" style={{ margin: '0.5rem 0 0.9rem 0' }}>
                ¿Seguro que deseas eliminar <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{deleteConfirm.title || 'este formulario'}</span>?
                <br />
                Se perderán todas las respuestas.
              </p>
              <div className="gf-confirm-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: 'rgba(239,68,68,0.16)', borderColor: 'rgba(239,68,68,0.28)', color: '#f87171' }}
                  onClick={async () => {
                    const id = deleteConfirm.id;
                    setDeleteConfirm(null);
                    await deleteForm(id);
                  }}
                >
                  <Trash2 size={14} /> Eliminar
                </button>
              </div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="text-muted" style={{ padding: '2rem' }}>Cargando formularios…</div>
        ) : forms.length === 0 ? (
          <div className="gf-list-empty">
            <FormInput size={48} style={{ opacity: 0.18 }} />
            <p>Aún no hay formularios. Crea el primero.</p>
            <button className="btn btn-primary" onClick={() => setShowTemplates(true)}>
              <Plus size={15} /> Crear formulario
            </button>
          </div>
        ) : (
          <div className="gf-forms-grid">
            {forms.map((form) => {
              const sc = STATUS_STYLE[form.status as FormStatus];
              return (
                <div key={form.id} className="gf-form-card-list">
                  <div className="gf-form-card-accent" />
                  <div className="gf-form-card-body">
                    <div className="gf-form-card-top">
                      <span className="gf-status-chip" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                      <span className="text-muted" style={{ fontSize: '0.73rem', marginLeft: 'auto' }}>{form.responseCount} respuesta{form.responseCount !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="gf-form-card-title">{form.title}</div>
                    {form.description && <div className="gf-form-card-desc">{form.description}</div>}
                    <div className="gf-form-card-date text-muted">{fmtDate(form.updated_at)}</div>
                    <div className="gf-form-card-actions">
                      <button className="btn btn-primary" style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }} onClick={() => openBuilder(form)}>
                        <Pencil size={13} /> Abrir
                      </button>
                      {form.status === 'published' && (
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: '0.78rem' }}
                          title="Copiar enlace de compartir"
                          onClick={async () => {
                            try {
                              const url = `${window.location.origin}/forms?open=${form.id}`;
                              await navigator.clipboard.writeText(url);
                              showNotice('Enlace copiado al portapapeles');
                            } catch {
                              showNotice('Error al copiar', 'danger');
                            }
                          }}
                        >
                          <Share2 size={13} />
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: '0.78rem', color: '#f87171' }}
                        title="Eliminar"
                        onClick={() => setDeleteConfirm({ id: form.id, title: form.title })}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <GfStyles />
      </div>
    );
  }

  // ─── BUILDER VIEW ─────────────────────────────────────────────────────────────
  if (!draft) return null;
  const sc = STATUS_STYLE[draft.status as FormStatus];

  return (
    <div className="gf-builder-root">
      {/* Top bar */}
      <div className="gf-builder-dock-container">
        <div className="gf-builder-dock">
          <button type="button" className="gf-back-btn" onClick={() => { setView('list'); void loadForms(); }}>
            <ArrowLeft size={16} />
          </button>
          <div className="gf-builder-title-area">
            <input
              className="gf-builder-title-input"
              value={draft.title}
              onChange={(e) => setDraft((p) => p ? { ...p, title: e.target.value } : p)}
              placeholder="Formulario sin título"
            />
            <span className="gf-status-chip gf-status-chip-sm" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
          </div>

          {/* Tabs */}
          <div className="gf-builder-tabs">
            {(['questions', 'responses', 'settings'] as BuilderTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`gf-builder-tab ${builderTab === tab ? 'gf-builder-tab-active' : ''}`}
                onClick={() => setBuilderTab(tab)}
              >
                {tab === 'questions'  && 'Preguntas'}
                {tab === 'responses'  && `Respuestas${responses.length > 0 ? ` (${responses.length})` : ''}`}
                {tab === 'settings'   && 'Configuración'}
              </button>
            ))}
          </div>

          <div className="gf-builder-actions">
            <button className="btn btn-ghost gf-save-btn" onClick={() => void saveDraft()} disabled={isSaving}>
              {isSaving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              className="gf-publish-btn"
              style={draft.status === 'published'
                ? { background: 'rgba(239,68,68,0.18)', color: '#f87171', borderColor: 'rgba(239,68,68,0.3)' }
                : {}}
              onClick={() => void togglePublish()}
              disabled={isPublishing}
            >
              {isPublishing ? '…' : draft.status === 'published' ? 'Cerrar formulario' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <div className={`gf-notice gf-notice-${notice.tone}`} style={{ margin: '0 auto', maxWidth: 740, marginTop: '0.5rem' }}>
          <AlertCircle size={14} /> {notice.msg}
        </div>
      )}

      {/* ── TAB: PREGUNTAS ──────────────────────────────────────────────────── */}
      {builderTab === 'questions' && (
        <div className="gf-questions-layout">
          {/* Center column */}
          <div className="gf-questions-center" onClick={() => setActiveFieldId(null)}>
            {/* Title card */}
            <div className="gf-title-card" onClick={(e) => e.stopPropagation()}>
              <div className="gf-title-card-accent" />
              <div className="gf-title-card-body">
                <input
                  className="gf-form-title-edit"
                  value={draft.title}
                  onChange={(e) => setDraft((p) => p ? { ...p, title: e.target.value } : p)}
                  placeholder="Título del formulario"
                />
                <input
                  className="gf-form-desc-edit"
                  value={draft.description}
                  onChange={(e) => setDraft((p) => p ? { ...p, description: e.target.value } : p)}
                  placeholder="Descripción del formulario (opcional)"
                />
              </div>
            </div>

            {/* Question cards */}
            {draft.fields.map((field, idx) => (
              <div key={field.id} onClick={(e) => e.stopPropagation()}>
                <QuestionCard
                  field={field}
                  index={idx}
                  total={draft.fields.length}
                  isActive={activeFieldId === field.id}
                  onActivate={() => setActiveFieldId(field.id)}
                  onChange={updateField}
                  onRemove={() => removeField(field.id)}
                  onDuplicate={() => dupField(field.id)}
                  onMove={(dir) => moveField(field.id, dir)}
                />
              </div>
            ))}

            {draft.fields.length === 0 && (
              <div className="gf-empty-builder">
                <ClipboardList size={36} style={{ opacity: 0.2 }} />
                <p>Usa la barra derecha para añadir campos</p>
              </div>
            )}
          </div>

          {/* Right floating toolbar */}
          <div className="gf-toolbar">
            <div className="gf-toolbar-card">
              {FIELD_TOOLBAR.map((ft) => (
                <button
                  key={ft.type}
                  type="button"
                  className="gf-toolbar-btn"
                  title={ft.label}
                  onClick={() => addField(ft.type)}
                >
                  <span className="gf-toolbar-icon">{ft.icon}</span>
                  <span className="gf-toolbar-tooltip">{ft.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: RESPUESTAS ─────────────────────────────────────────────────── */}
      {builderTab === 'responses' && (
        <div className="gf-responses-layout">
          {loadingResp ? (
            <div className="text-muted" style={{ padding: '2rem', textAlign: 'center' }}>Cargando respuestas…</div>
          ) : (
            <div className="gf-responses-card">
              <div className="gf-resp-header">
                <div>
                  <div className="gf-resp-count">{responses.length} respuesta{responses.length !== 1 ? 's' : ''}</div>
                  {completion && (
                    <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {completionRate}% de empleados completaron · {completion.pending.length} pendiente{completion.pending.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost" style={{ fontSize: '0.8rem' }} onClick={() => window.location.href = `/api/forms/${draft.id}/export`}>
                    <Download size={14} /> Exportar CSV
                  </button>
                  {googleConnected && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: '0.8rem', gap: '0.4rem' }}
                      disabled={sheetsExporting}
                      onClick={() => void exportToSheets()}
                    >
                      <svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M44.5 20H24v8.5h11.8C34.1 33.5 29.5 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c11 0 20.7-8 20.7-21 0-1.4-.1-2.7-.2-4z" fill="#FFC107"/><path d="M6.3 14.7l7 5.1C15.1 16.1 19.2 13 24 13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.2-17.7 10.7z" fill="#FF3D00"/><path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.6C29.5 36 26.9 37 24 37c-5.5 0-10.1-3.5-11.8-8.3l-7 5.4C8.6 41 15.8 45 24 45z" fill="#4CAF50"/><path d="M44.5 20H24v8.5h11.8c-.9 2.6-2.6 4.8-4.8 6.4l6.6 5.6c-.4.3 6.9-5 6.9-16.5 0-1.4-.1-2.7-.2-4z" fill="#1976D2"/></svg>
                      {sheetsExporting ? 'Exportando…' : 'Exportar a Sheets'}
                    </button>
                  )}
                </div>
              </div>

              {/* Role filter */}
              {responses.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1rem' }}>
                  {(['all', 'employee', 'moderator', 'ti', 'other'] as const).map((role) => {
                    const labels: Record<typeof role, string> = { all: 'Todos', employee: 'Empleados', moderator: 'Moderadores', ti: 'TI', other: 'Otros' };
                    const filtered = responses.filter((r) => role === 'all' || r.user?.role === role);
                    return (
                      <button
                        key={role}
                        type="button"
                        className={`btn ${respRoleFilter === role ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
                        onClick={() => setRespRoleFilter(role)}
                      >
                        {labels[role]} <span style={{ marginLeft: '0.3rem', opacity: 0.7 }}>({filtered.length})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sub-tabs */}
              <div className="gf-resp-tabs">
                {(['summary', 'question', 'individual'] as ResponseSubTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`gf-resp-tab ${respSubTab === tab ? 'gf-resp-tab-active' : ''}`}
                    onClick={() => setRespSubTab(tab)}
                  >
                    {tab === 'summary'    && 'Resumen'}
                    {tab === 'question'   && 'Pregunta'}
                    {tab === 'individual' && 'Individual'}
                  </button>
                ))}
              </div>

              {filteredResponses.length === 0 && (
                <div className="gf-resp-empty">
                  <BarChart3 size={32} style={{ opacity: 0.2 }} />
                  <p>Aún no hay respuestas para este formulario{respRoleFilter !== 'all' ? ' en este rol' : ''}.</p>
                </div>
              )}

              {/* RESUMEN */}
              {respSubTab === 'summary' && filteredResponses.length > 0 && (
                <div className="gf-summary-list">
                  {/* Completion donut */}
                  {completion && (
                    <div className="gf-summary-field-card">
                      <div className="gf-summary-q-label">Estado de completado</div>
                      <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <ResponsiveContainer width={180} height={180}>
                          <PieChart>
                            <Pie data={[
                              { name: 'Completado', value: completion.completed.length },
                              { name: 'Pendiente', value: completion.pending.length },
                            ]} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                              <Cell fill="#34d399" />
                              <Cell fill="rgba(255,255,255,0.08)" />
                            </Pie>
                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '0.78rem' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
                            Completado: <strong>{completion.completed.length}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                            <span style={{ width: 12, height: 12, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'inline-block' }} />
                            Pendiente: <strong>{completion.pending.length}</strong>
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>{completionRate}%</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-field summaries */}
                  {draft.fields.filter((f) => f.type !== 'section').map((field) => {
                    const { chartData, texts } = aggregateField(field, filteredResponses);
                    const hasAnswered = chartData.length > 0 || texts.length > 0;
                    if (!hasAnswered) return null;
                    return (
                      <div key={field.id} className="gf-summary-field-card">
                        <div className="gf-summary-q-label">{field.label}</div>
                        <div className="gf-summary-resp-count">{chartData.reduce((s, d) => s + d.value, 0) + texts.length} respuestas</div>
                        {chartData.length > 0 && (
                          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                            <ResponsiveContainer width={180} height={180}>
                              <PieChart>
                                <Pie data={chartData} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                                </Pie>
                                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '0.78rem' }} />
                              </PieChart>
                            </ResponsiveContainer>
                            <div style={{ display: 'grid', gap: '0.35rem' }}>
                              {chartData.map((d, i) => (
                                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
                                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0, display: 'inline-block' }} />
                                  {d.name}: <strong>{d.value}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {texts.length > 0 && (
                          <div className="gf-text-answers">
                            {texts.slice(0, 5).map((t, i) => (
                              <div key={i} className="gf-text-answer-chip">&quot;{t}&quot;</div>
                            ))}
                            {texts.length > 5 && <div className="text-muted" style={{ fontSize: '0.75rem' }}>+{texts.length - 5} más…</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* PREGUNTA */}
              {respSubTab === 'question' && filteredResponses.length > 0 && (
                <div className="gf-question-tab">
                  <ModernSelect
                    value={respQuestionId}
                    onValueChange={setRespQuestionId}
                    options={draft.fields.filter((f) => f.type !== 'section').map((f) => ({
                      label: f.label,
                      value: f.id
                    }))}
                  />
                  {respQuestionField && respQuestionAgg && (
                    <div className="gf-summary-field-card">
                      <div className="gf-summary-q-label">{respQuestionField.label}</div>
                      {respQuestionAgg.chartData.length > 0 && (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={respQuestionAgg.chartData} layout="vertical" margin={{ left: 20, right: 40 }}>
                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                              {respQuestionAgg.chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Bar>
                            <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: '0.78rem' }} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                      {respQuestionAgg.texts.map((t, i) => (
                        <div key={i} className="gf-text-answer-chip">&quot;{t}&quot;</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* INDIVIDUAL */}
              {respSubTab === 'individual' && filteredResponses.length > 0 && currentResponse && (
                <div className="gf-individual-tab">
                  <div className="gf-individual-nav">
                    <button className="btn btn-ghost" disabled={respIndex === 0} onClick={() => setRespIndex((i) => i - 1)}>
                      <ArrowLeft size={15} />
                    </button>
                    <span className="text-muted" style={{ fontSize: '0.82rem' }}>{respIndex + 1} de {filteredResponses.length}</span>
                    <button className="btn btn-ghost" disabled={respIndex === filteredResponses.length - 1} onClick={() => setRespIndex((i) => i + 1)}>
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="gf-individual-header">
                    <div style={{ fontWeight: 700 }}>{currentResponse.user?.name ?? 'Empleado'}</div>
                    <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                      {currentResponse.user?.employee_id && `ID: ${currentResponse.user.employee_id} · `}
                      {fmtDateTime(currentResponse.submitted_at)}
                    </div>
                  </div>
                  <div className="gf-individual-answers">
                    {draft.fields.filter((f) => f.type !== 'section').map((field) => {
                      const val = (currentResponse.answers as Record<string, unknown>)[field.id];
                      return (
                        <div key={field.id} className="gf-individual-answer-card">
                          <div className="gf-individual-q">{field.label}</div>
                          <div className="gf-individual-a">
                            {val === undefined || val === null || val === ''
                              ? <span className="text-muted" style={{ fontStyle: 'italic' }}>Sin respuesta</span>
                              : field.type === 'rating'
                                ? <span style={{ color: '#fbbf24', fontSize: '1rem' }}>{'★'.repeat(Number(val))}{'☆'.repeat((field.validation?.max ?? 5) - Number(val))}</span>
                                : Array.isArray(val) ? (val as string[]).join(', ')
                                : String(val)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Completion tables */}
              {respSubTab === 'summary' && completion && (
                <div className="gf-completion-section">
                  <div className="gf-comp-label" style={{ color: '#34d399' }}><CheckCircle2 size={14} /> Completaron ({completion.completed.length})</div>
                  <div className="gf-comp-table">
                    {completion.completed.map((e) => (
                      <div key={e.id} className="gf-comp-row gf-comp-done">
                        <span style={{ fontWeight: 600 }}>{e.name}</span>
                        <span className="text-muted">{e.employee_id ?? e.email}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.73rem', color: '#34d399' }}>{fmtDate(e.submitted_at)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="gf-comp-label" style={{ marginTop: '1rem', color: '#fbbf24' }}><AlertCircle size={14} /> Pendientes ({completion.pending.length})</div>
                  <div className="gf-comp-table">
                    {completion.pending.map((e) => (
                      <div key={e.id} className="gf-comp-row gf-comp-pending">
                        <span style={{ fontWeight: 600 }}>{e.name}</span>
                        <span className="text-muted">{e.employee_id ?? e.email}</span>
                      </div>
                    ))}
                    {completion.pending.length === 0 && <div className="text-muted" style={{ fontSize: '0.8rem', padding: '0.5rem' }}>¡Todos completaron el formulario! 🎉</div>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: CONFIGURACIÓN ──────────────────────────────────────────────── */}
      {builderTab === 'settings' && (
        <div className="gf-settings-layout">
          <div className="gf-settings-card">
            <div className="gf-settings-section">
              <div className="gf-settings-section-title">Respuestas</div>
              <label className="gf-settings-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Permitir múltiples respuestas</div>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>Un empleado puede enviar el formulario más de una vez</div>
                </div>
                <div className={`gf-toggle ${draft.settings.allowMultipleSubmissions ? 'gf-toggle-on' : ''}`}
                  onClick={() => setDraft((p) => p ? { ...p, settings: { ...p.settings, allowMultipleSubmissions: !p.settings.allowMultipleSubmissions } } : p)}>
                  <div className="gf-toggle-knob" />
                </div>
              </label>
              <label className="gf-settings-row">
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Formulario obligatorio</div>
                  <div className="text-muted" style={{ fontSize: '0.78rem' }}>Los empleados deben completar este formulario para acceder</div>
                </div>
                <div className={`gf-toggle ${draft.is_mandatory ? 'gf-toggle-on' : ''}`}
                  onClick={() => setDraft((p) => p ? { ...p, is_mandatory: !p.is_mandatory } : p)}>
                  <div className="gf-toggle-knob" />
                </div>
              </label>
            </div>

            <div className="gf-settings-section">
              <div className="gf-settings-section-title">Presentación</div>
              <div className="gf-settings-field">
                <label className="field-label">Texto del botón de envío</label>
                <input
                  className="input"
                  value={draft.settings.submitButtonLabel}
                  onChange={(e) => setDraft((p) => p ? { ...p, settings: { ...p.settings, submitButtonLabel: e.target.value } } : p)}
                  placeholder="Enviar respuesta"
                />
              </div>
              <div className="gf-settings-field">
                <label className="field-label">Mensaje de confirmación</label>
                <textarea
                  className="input"
                  rows={3}
                  value={draft.settings.successMessage}
                  onChange={(e) => setDraft((p) => p ? { ...p, settings: { ...p.settings, successMessage: e.target.value } } : p)}
                  placeholder="¡Gracias! Tu respuesta fue registrada."
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>

            <div className="gf-settings-section">
              <div className="gf-settings-section-title">Campos auto-completados</div>
              <p className="text-muted" style={{ fontSize: '0.82rem', marginTop: '0.25rem', lineHeight: 1.55 }}>
                Puedes agregar campos de texto/correo en el editor de preguntas y activar &quot;Auto-completar desde perfil&quot; para que se rellenen automáticamente con el nombre, correo o ID del empleado al abrir el formulario. Estos campos son de solo lectura para el empleado.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                {Object.entries(LOCKED_LABELS).map(([key, label]) => (
                  <span key={key} className="gf-lock-info-chip"><Lock size={11} /> {label}</span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => void saveDraft()} disabled={isSaving}>
                {isSaving ? 'Guardando…' : 'Guardar configuración'}
              </button>
            </div>
          </div>
        </div>
      )}

      <GfStyles />
    </div>
  );
}

// ─── Extracted styles component (keeps JSX clean) ────────────────────────────
// Using a named import for Pencil that works
const Pencil = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

function GfStyles() {
  return (
    <style>{`
      /* List */
      .gf-list-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
      .gf-list-empty { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 4rem 1rem; color: var(--text-muted); text-align: center; }
      .gf-forms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
      .gf-form-card-list { border: 1px solid var(--border-subtle); border-radius: 18px; background: var(--bg-elevated); overflow: hidden; display: flex; transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease; }
      .gf-form-card-list:hover { transform: translateY(-2px); box-shadow: 0 14px 36px rgba(2,6,23,0.32); border-color: rgba(99,102,241,0.3); }
      .gf-form-card-accent { width: 6px; background: linear-gradient(180deg, #6366f1, #8b5cf6); flex-shrink: 0; }
      .gf-form-card-body { flex: 1; padding: 1rem 1.1rem; display: grid; gap: 0.35rem; }
      .gf-form-card-top { display: flex; align-items: center; gap: 0.5rem; }
      .gf-form-card-title { font-weight: 700; font-size: 0.95rem; color: var(--text-primary); }
      .gf-form-card-desc { font-size: 0.78rem; color: var(--text-secondary); line-height: 1.4; }
      .gf-form-card-date { font-size: 0.72rem; }
      .gf-form-card-actions { display: flex; gap: 0.4rem; margin-top: 0.35rem; }

      .gf-confirm-modal { width: min(420px, 92vw); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; background: rgba(15,23,42,0.92); backdrop-filter: blur(14px); padding: 1.25rem; box-shadow: 0 20px 60px rgba(0,0,0,0.55); }
      .gf-confirm-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 0.9rem; }
      .gf-status-chip { display: inline-flex; padding: 0.22rem 0.58rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
      .gf-status-chip-sm { font-size: 0.63rem; }
      .gf-notice { display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.9rem; border-radius: 10px; font-size: 0.82rem; margin-bottom: 0.75rem; }
      .gf-notice button { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; }
      .gf-notice-success { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); color: #34d399; }
      .gf-notice-danger  { background: rgba(239,68,68,0.12);  border: 1px solid rgba(239,68,68,0.25);  color: #f87171; }

      /* Template modal */
      .gf-template-modal { width: min(640px, calc(100vw - 2rem)); background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 24px; padding: 1.75rem; }
      .gf-template-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.75rem; }
      .gf-template-card { border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-elevated); padding: 1.1rem 0.9rem; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; cursor: pointer; text-align: center; transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease; }
      .gf-template-card:hover { border-color: rgba(99,102,241,0.38); background: rgba(99,102,241,0.08); transform: translateY(-2px); }
      .gf-template-icon { font-size: 1.75rem; }
      .gf-template-title { font-weight: 700; font-size: 0.85rem; color: var(--text-primary); }
      .gf-template-desc { font-size: 0.72rem; color: var(--text-muted); }

      /* Builder Dock */
      .gf-builder-root { display: flex; flex-direction: column; height: calc(100vh - 64px); overflow: hidden; background: #020617; }
      .gf-builder-dock-container { 
        padding: 1.25rem; 
        display: flex; 
        justify-content: center; 
        z-index: 100;
        pointer-events: none;
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
      }
      .gf-builder-dock { 
        display: flex; 
        align-items: center; 
        gap: 1rem; 
        padding: 0.6rem 1.25rem; 
        border: 1px solid rgba(255,255,255,0.1); 
        background: rgba(15, 23, 42, 0.7); 
        backdrop-filter: blur(16px);
        border-radius: 24px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1);
        pointer-events: auto;
        min-width: min(900px, 95vw);
      }
      .gf-back-btn { width: 38px; height: 38px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03); display: inline-flex; align-items: center; justify-content: center; color: var(--text-secondary); cursor: pointer; flex-shrink: 0; transition: all 0.2s ease; }
      .gf-back-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); transform: translateX(-2px); }
      .gf-builder-title-area { display: flex; align-items: center; gap: 0.6rem; min-width: 0; flex: 1; padding: 0 0.5rem; }
      .gf-builder-title-input { background: transparent; border: none; font-size: 0.95rem; font-weight: 700; color: var(--text-primary); outline: none; min-width: 0; flex: 1; border-radius: 6px; padding: 0.4rem; transition: background 0.15s; }
      .gf-builder-title-input:hover, .gf-builder-title-input:focus { background: rgba(255,255,255,0.05); }
      .gf-builder-tabs { display: flex; gap: 0.25rem; background: rgba(0,0,0,0.2); padding: 0.25rem; border-radius: 16px; margin: 0 1rem; }
      .gf-builder-tab { padding: 0.45rem 1rem; font-size: 0.8rem; font-weight: 700; color: rgba(255,255,255,0.5); background: none; border: none; cursor: pointer; border-radius: 12px; transition: all 0.2s ease; }
      .gf-builder-tab:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.04); }
      .gf-builder-tab-active { color: white; background: rgba(99,102,241,0.5); box-shadow: 0 4px 12px rgba(99,102,241,0.3); }
      .gf-builder-actions { display: flex; gap: 0.75rem; align-items: center; margin-left: auto; }
      .gf-save-btn { font-size: 0.8rem; height: 38px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1); }
      .gf-publish-btn { 
        height: 38px;
        padding: 0 1.25rem; 
        border-radius: 12px; 
        font-size: 0.82rem; 
        font-weight: 700; 
        background: linear-gradient(135deg, #6366f1, #8b5cf6); 
        color: white; 
        border: none;
        cursor: pointer; 
        transition: all 0.2s ease; 
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
      }
      .gf-publish-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(79, 70, 229, 0.5); filter: brightness(1.1); }
      .gf-publish-btn:disabled { opacity: 0.6; cursor: not-allowed; }

      /* Questions layout */
      .gf-questions-layout { display: flex; flex: 1; overflow: hidden; justify-content: center; gap: 1rem; padding: 5.5rem 1rem 1.5rem 1rem; position: relative; }
      .gf-questions-center { flex: 0 1 680px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.65rem; padding-bottom: 3rem; }
      .gf-empty-builder { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem 1rem; color: var(--text-muted); text-align: center; border: 1px dashed rgba(255,255,255,0.1); border-radius: 16px; }

      /* Title card */
      .gf-title-card { border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-elevated); overflow: hidden; display: flex; }
      .gf-title-card-accent { width: 8px; background: linear-gradient(180deg, #6366f1, #8b5cf6); flex-shrink: 0; }
      .gf-title-card-body { flex: 1; padding: 1.5rem 1.25rem; display: grid; gap: 0.5rem; }
      .gf-form-title-edit { background: transparent; border: none; border-bottom: 2px solid rgba(99,102,241,0.3); font-size: 1.5rem; font-weight: 800; color: var(--text-primary); outline: none; width: 100%; padding-bottom: 0.3rem; }
      .gf-form-title-edit:focus { border-bottom-color: #6366f1; }
      .gf-form-desc-edit { background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 0.875rem; color: var(--text-secondary); outline: none; width: 100%; padding-bottom: 0.2rem; }
      .gf-form-desc-edit:focus { border-bottom-color: rgba(99,102,241,0.4); }

      /* Question cards */
      .gf-question-card { border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--bg-elevated); cursor: pointer; transition: border-color 0.18s ease, box-shadow 0.18s ease; }
      .gf-question-card:hover { border-color: rgba(99,102,241,0.25); }
      .gf-question-active { border-color: rgba(99,102,241,0.5); box-shadow: 4px 0 0 #6366f1 inset; cursor: default; }
      .gf-section-card { background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(15,23,42,0.06)); }
      .gf-q-collapsed { padding: 1rem 1.25rem; display: grid; gap: 0.2rem; }
      .gf-q-label-preview { font-size: 0.9rem; color: var(--text-primary); display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
      .gf-required-dot { color: #f87171; font-size: 1rem; }
      .gf-lock-chip { width: 18px; height: 18px; border-radius: 50%; background: rgba(99,102,241,0.14); display: inline-flex; align-items: center; justify-content: center; color: var(--brand-primary-light); }
      .gf-q-type-preview { font-size: 0.72rem; color: var(--text-muted); font-weight: 600; }
      .gf-section-title-preview { font-size: 1rem; font-weight: 700; color: var(--text-primary); }
      .gf-section-desc-preview { font-size: 0.78rem; color: var(--text-muted); }
      .gf-q-expanded { padding: 1.25rem; display: grid; gap: 0.85rem; }
      .gf-q-header-row { display: grid; grid-template-columns: 1fr auto; gap: 0.75rem; align-items: start; }
      .gf-label-input { background: transparent; border: none; border-bottom: 2px solid rgba(99,102,241,0.3); font-size: 1rem; font-weight: 600; color: var(--text-primary); outline: none; width: 100%; padding-bottom: 0.25rem; }
      .gf-label-input:focus { border-bottom-color: #6366f1; }
      .gf-help-input { background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.07); font-size: 0.8rem; color: var(--text-muted); outline: none; width: 100%; padding-bottom: 0.15rem; }
      .gf-type-selector { position: relative; min-width: 160px; }
      .gf-type-selector select { width: 100%; height: 38px; padding: 0 2rem 0 0.75rem; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.04); color: var(--text-primary); font-size: 0.82rem; font-weight: 600; appearance: none; cursor: pointer; outline: none; }
      .gf-type-select-arrow { position: absolute; right: 0.6rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
      .gf-q-body { display: grid; gap: 0.65rem; }
      .gf-placeholder-input { font-size: 0.82rem; }
      .gf-options-editor { display: grid; gap: 0.35rem; }
      .gf-option-edit-row { display: flex; align-items: center; gap: 0.5rem; }
      .gf-radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0; }
      .gf-check-box { width: 16px; height: 16px; border-radius: 3px; border: 2px solid rgba(255,255,255,0.2); flex-shrink: 0; }
      .gf-select-num { width: 20px; font-size: 0.75rem; color: var(--text-muted); flex-shrink: 0; }
      .gf-option-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-primary); font-size: 0.875rem; outline: none; padding: 0.2rem 0; }
      .gf-option-input:focus { border-bottom-color: rgba(99,102,241,0.5); }
      .gf-add-option-btn { display: flex; align-items: center; gap: 0.35rem; background: none; border: none; color: var(--brand-primary-light); font-size: 0.82rem; font-weight: 700; cursor: pointer; padding: 0.25rem 0; }
      .gf-rating-config, .gf-validation-row, .gf-lock-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
      .gf-setting-label { font-size: 0.78rem; color: var(--text-muted); font-weight: 600; }
      .gf-toggle-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; }
      .gf-toggle-label input[type="checkbox"] { accent-color: #6366f1; width: 14px; height: 14px; }
      .gf-icon-btn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); background: transparent; color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s ease, color 0.15s ease; font-size: 0.82rem; }
      .gf-icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: var(--text-primary); }
      .gf-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      .gf-icon-danger:hover:not(:disabled) { background: rgba(239,68,68,0.12); color: #f87171; }
      .gf-q-footer { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); flex-wrap: wrap; }
      .gf-q-footer-divider { flex: 1; }

      /* Toolbar */
      .gf-toolbar { position: sticky; top: 0; align-self: flex-start; z-index: 50; }
      .gf-toolbar-card { border: 1px solid rgba(99,102,241,0.3); border-radius: 18px; background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(15,23,42,0.4)); backdrop-filter: blur(12px); padding: 0.75rem; display: flex; flex-direction: column; gap: 0.35rem; box-shadow: 0 12px 36px rgba(0,0,0,0.4), 0 0 1px rgba(99,102,241,0.5); }
      .gf-toolbar-btn { width: 52px; height: 52px; border-radius: 12px; border: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.06); color: var(--text-secondary); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; transition: all 0.18s ease; gap: 0px; }
      .gf-toolbar-btn:hover { background: rgba(99,102,241,0.18); color: #6366f1; border-color: rgba(99,102,241,0.4); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,0.2); }
      .gf-toolbar-btn:active { transform: translateY(0px); }
      .gf-toolbar-icon { font-size: 1.25rem; line-height: 1; font-weight: 600; }
      .gf-toolbar-tooltip { font-size: 0.65rem; font-weight: 700; color: var(--text-secondary); white-space: nowrap; opacity: 0; transition: opacity 0.15s ease; position: absolute; bottom: -24px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); padding: 0.3rem 0.6rem; border-radius: 6px; pointer-events: none; }
      .gf-toolbar-btn:hover .gf-toolbar-tooltip { opacity: 1; }

      /* Responses */
      .gf-responses-layout { flex: 1; overflow-y: auto; display: flex; justify-content: center; padding: 5.5rem 1rem 1.5rem 1rem; }
      .gf-responses-card { width: 100%; max-width: 740px; }
      .gf-resp-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1.25rem; border: 1px solid var(--border-subtle); border-radius: 16px 16px 0 0; background: var(--bg-elevated); }
      .gf-resp-count { font-size: 1.4rem; font-weight: 800; color: var(--text-primary); }
      .gf-resp-tabs { display: flex; border-bottom: 2px solid var(--border-subtle); padding: 0 1.25rem; background: var(--bg-elevated); border-left: 1px solid var(--border-subtle); border-right: 1px solid var(--border-subtle); }
      .gf-resp-tab { padding: 0.65rem 1rem; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: color 0.15s ease, border-color 0.15s ease; }
      .gf-resp-tab:hover { color: var(--text-primary); }
      .gf-resp-tab-active { color: #6366f1; border-bottom-color: #6366f1; }
      .gf-resp-empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 3rem; color: var(--text-muted); text-align: center; border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 16px 16px; background: var(--bg-elevated); }
      .gf-summary-list { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 16px 16px; background: var(--bg-elevated); padding: 1.25rem; display: grid; gap: 1rem; }
      .gf-summary-field-card { border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1.1rem 1.25rem; background: var(--bg-card); }
      .gf-summary-q-label { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; }
      .gf-summary-resp-count { font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.5rem; }
      .gf-text-answers { display: grid; gap: 0.35rem; margin-top: 0.75rem; }
      .gf-text-answer-chip { font-size: 0.8rem; color: var(--text-secondary); padding: 0.45rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.02); }
      .gf-question-tab { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 16px 16px; background: var(--bg-elevated); padding: 1.25rem; }
      .gf-individual-tab { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 16px 16px; background: var(--bg-elevated); padding: 1.25rem; display: grid; gap: 0.75rem; }
      .gf-individual-nav { display: flex; align-items: center; gap: 0.75rem; }
      .gf-individual-header { padding: 0.85rem 1rem; border-radius: 10px; border: 1px solid rgba(99,102,241,0.2); background: rgba(99,102,241,0.06); }
      .gf-individual-answers { display: grid; gap: 0.5rem; }
      .gf-individual-answer-card { padding: 0.75rem 1rem; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-card); }
      .gf-individual-q { font-size: 0.78rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.25rem; }
      .gf-individual-a { font-size: 0.875rem; color: var(--text-primary); }
      .gf-completion-section { border: 1px solid var(--border-subtle); border-top: none; border-radius: 0 0 16px 16px; background: var(--bg-elevated); padding: 1.25rem; display: grid; gap: 0.5rem; }
      .gf-comp-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.73rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
      .gf-comp-table { display: grid; gap: 0.3rem; }
      .gf-comp-row { display: flex; align-items: center; gap: 0.65rem; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid; font-size: 0.82rem; }
      .gf-comp-done    { border-color: rgba(16,185,129,0.18); background: rgba(16,185,129,0.05); }
      .gf-comp-pending { border-color: rgba(234,179,8,0.16);  background: rgba(234,179,8,0.04); }

      /* Settings */
      .gf-settings-layout { flex: 1; overflow-y: auto; display: flex; justify-content: center; padding: 5.5rem 1rem 1.5rem 1rem; }
      .gf-settings-card { width: 100%; max-width: 640px; border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-elevated); padding: 1.5rem; display: grid; gap: 0; }
      .gf-settings-section { padding: 1.25rem 0; border-bottom: 1px solid var(--border-subtle); display: grid; gap: 0.75rem; }
      .gf-settings-section:last-child { border-bottom: none; }
      .gf-settings-section-title { font-size: 0.82rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
      .gf-settings-row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; cursor: pointer; }
      .gf-settings-field { display: grid; gap: 0.35rem; }
      .gf-toggle { width: 44px; height: 24px; border-radius: 999px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.12); cursor: pointer; position: relative; flex-shrink: 0; transition: background 0.2s ease; }
      .gf-toggle-on { background: rgba(99,102,241,0.8); border-color: rgba(99,102,241,0.6); }
      .gf-toggle-knob { width: 18px; height: 18px; border-radius: 50%; background: white; position: absolute; top: 2px; left: 2px; transition: transform 0.2s ease; box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
      .gf-toggle-on .gf-toggle-knob { transform: translateX(20px); }
      .gf-lock-info-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: rgba(99,102,241,0.1); border: 1px solid rgba(99,102,241,0.22); color: var(--brand-primary-light); }

      @media (max-width: 760px) {
        .gf-builder-tabs { order: 3; width: 100%; justify-content: center; }
        .gf-toolbar { display: none; }
        .gf-questions-layout { padding: 1rem 0.5rem; }
      }
    `}</style>
  );
}
