'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Lock,
  Send,
  Star,
  X,
} from 'lucide-react';
import { validateFormAnswers } from '@/lib/forms/validation';
import type { FormDefinition, FormField, FormResponse, FormSummary } from '@/lib/forms/types';
import { ModernSelect } from '@/components/ui/Select';
import { ModernDatePicker } from '@/components/ui/DatePicker';

interface FormsHubClientProps {
  userId: string;
  userName: string;
  userEmail: string;
  userEmployeeId: string | null;
  autoOpenFormId?: string;
}

type AnswerMap = Record<string, unknown>;

const FIELD_META_LABELS: Record<string, string> = {
  short_text: 'Texto corto',
  long_text: 'Texto largo',
  number: 'Número',
  email: 'Correo',
  date: 'Fecha',
  radio: 'Opción única',
  checkbox: 'Selección múltiple',
  select: 'Lista desplegable',
  rating: 'Calificación',
  image: 'Imagen',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
  readOnly,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
  readOnly?: boolean;
}) {
  if (field.type === 'section') {
    return (
      <div className="fhub-section-header">
        <h3 className="fhub-section-title">{field.label}</h3>
        {field.helpText && <p className="fhub-section-sub">{field.helpText}</p>}
      </div>
    );
  }

  const locked = !!field.locked;
  const isReadOnly = readOnly || locked;
  const normalizedOptions = (field.options ?? []).map((opt) =>
    typeof opt === 'string' ? opt : String(opt ?? ''),
  );

  return (
    <div className={`fhub-field-wrap ${error ? 'fhub-field-error' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <label className="fhub-field-label" style={{ margin: 0 }}>
          {field.label}
          {field.required && <span className="fhub-required">*</span>}
          {locked && <span className="fhub-lock-badge"><Lock size={10} /> Auto</span>}
        </label>
        {field.required && <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.5rem', backgroundColor: '#dc2626', color: 'white', borderRadius: '4px' }}>Obligatorio</span>}
        {field.type !== 'image' && <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: '#e5e7eb', color: '#374151', borderRadius: '4px' }}>{FIELD_META_LABELS[field.type] || field.type}</span>}
      </div>
      {field.helpText && <p className="fhub-field-help">{field.helpText}</p>}

      {(field.type === 'short_text' || field.type === 'email') && (
        <input
          className="input"
          type={field.type === 'email' ? 'email' : 'text'}
          placeholder={field.placeholder ?? ''}
          value={(typeof value === 'string' || typeof value === 'number') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={isReadOnly}
          style={isReadOnly ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
        />
      )}

      {field.type === 'long_text' && (
        <textarea
          className="input"
          rows={4}
          placeholder={field.placeholder ?? ''}
          value={(typeof value === 'string' || typeof value === 'number') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={isReadOnly}
          style={{ resize: 'vertical', ...(isReadOnly ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
        />
      )}

      {field.type === 'number' && (
        <input
          className="input"
          type="number"
          placeholder={field.placeholder ?? ''}
          value={(typeof value === 'string' || typeof value === 'number') ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          readOnly={isReadOnly}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      )}

      {field.type === 'date' && (
        <ModernDatePicker
          date={(typeof value === 'string' || typeof value === 'number') ? String(value) : ''}
          onDateChange={onChange}
        />
      )}

      {field.type === 'radio' && (
        <div className="fhub-options-list">
          {normalizedOptions.map((opt, index) => (
            <label key={`${field.id}-radio-${index}`} className={`fhub-option-row ${value === opt ? 'fhub-option-selected' : ''}`}>
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => !isReadOnly && onChange(opt)}
                disabled={isReadOnly}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.type === 'checkbox' && (
        <div className="fhub-options-list">
          {normalizedOptions.map((opt, index) => {
            const checked = Array.isArray(value) && (value as string[]).includes(opt);
            return (
              <label key={`${field.id}-check-${index}`} className={`fhub-option-row ${checked ? 'fhub-option-selected' : ''}`}>
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  onChange={() => {
                    if (isReadOnly) return;
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    onChange(checked ? current.filter((v) => v !== opt) : [...current, opt]);
                  }}
                  disabled={isReadOnly}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {field.type === 'select' && (
        <ModernSelect
          value={(typeof value === 'string' || typeof value === 'number') ? String(value) : ''}
          onValueChange={onChange}
          disabled={isReadOnly}
          placeholder={field.placeholder ?? 'Selecciona una opción…'}
          options={normalizedOptions.map((opt) => ({ label: opt, value: opt }))}
        />
      )}

      {field.type === 'rating' && (
        <div className="fhub-rating-row">
          {Array.from({ length: field.validation?.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`fhub-star-btn ${Number(value) >= n ? 'fhub-star-active' : ''}`}
              onClick={() => !isReadOnly && onChange(n)}
              disabled={isReadOnly}
            >
              <Star size={22} />
            </button>
          ))}
        </div>
      )}

      {field.type === 'image' && field.imageUrl && (
        <figure style={{ margin: '1rem 0', textAlign: 'center' }}>
          <img
            src={field.imageUrl}
            alt={field.label}
            style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px', objectFit: 'cover' }}
          />
          {field.label && <figcaption style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>{field.label}</figcaption>}
        </figure>
      )}

      {error && (
        <div className="fhub-field-error-msg">
          <AlertCircle size={13} /> {error}
        </div>
      )}
    </div>
  );
}

export function FormsHubClient({ userId, userName, userEmail, userEmployeeId, autoOpenFormId }: FormsHubClientProps) {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [formDetails, setFormDetails] = useState<Record<string, FormDefinition>>({});
  const [myResponses, setMyResponses] = useState<Record<string, FormResponse>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successFormId, setSuccessFormId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const loadForms = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const formsRes = await fetch('/api/forms', { signal });
      const formsData = (await formsRes.json()) as { data?: FormSummary[]; error?: string };
      setForms(formsData.data ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setGlobalError('No se pudieron cargar los formularios.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadForms(controller.signal);
    return () => controller.abort();
  }, [loadForms]);

  useEffect(() => {
    if (autoOpenFormId && forms.length > 0 && !myResponses[autoOpenFormId]) {
      const form = forms.find((f) => f.id === autoOpenFormId);
      if (form) openForm(form);
    }
  }, [autoOpenFormId, forms, myResponses]);

  const openForm = async (form: FormSummary) => {
    if (myResponses[form.id]) return; // already completed

    try {
      const cached = formDetails[form.id];
      const full = cached
        ? cached
        : await fetch(`/api/forms/${form.id}`)
          .then((r) => r.json())
          .then((d: { data?: FormDefinition; error?: string }) => {
            if (!d.data) throw new Error(d.error ?? 'No se pudo abrir el formulario.');
            return d.data;
          });

      if (!cached) setFormDetails((p) => ({ ...p, [form.id]: full }));

      // Pre-fill locked fields
      const initial: AnswerMap = {};
      for (const field of full.fields) {
        if (field.locked === 'user_name') initial[field.id] = userName;
        else if (field.locked === 'user_email') initial[field.id] = userEmail;
        else if (field.locked === 'user_employee_id') initial[field.id] = userEmployeeId ?? '';
      }
      setAnswers(initial);
      setFieldErrors({});
      setOpenFormId(form.id);
      setSuccessFormId(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'No se pudo abrir el formulario.');
    }
  };

  const handleSubmit = async () => {
    const form = openFormId ? formDetails[openFormId] : undefined;
    if (!form) return;

    const errors = validateFormAnswers(form.fields, answers);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${form.id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json()) as { data?: FormResponse; error?: string; fieldErrors?: Record<string, string> };
      if (!res.ok) {
        if (data.fieldErrors) { setFieldErrors(data.fieldErrors); return; }
        throw new Error(data.error ?? 'Error al enviar.');
      }
      setMyResponses((prev) => ({ ...prev, [form.id]: data.data! }));
      setSuccessFormId(form.id);
      setOpenFormId(null);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Error al enviar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openForm_ = openFormId ? formDetails[openFormId] : null;

  return (
    <div className="page-content-inner">
      <div className="fhub-header">
        <div>
          <h1 className="page-title">Formularios</h1>
          <p className="text-muted" style={{ marginTop: '0.25rem' }}>
            Completa los formularios asignados por tu equipo de moderación.
          </p>
        </div>
      </div>

      {globalError && (
        <div className="fhub-notice fhub-notice-danger">
          <AlertCircle size={15} /> {globalError}
          <button onClick={() => setGlobalError(null)}><X size={14} /></button>
        </div>
      )}

      {isLoading ? (
        <div className="text-muted" style={{ marginTop: '2rem' }}>Cargando formularios…</div>
      ) : forms.length === 0 ? (
        <div className="fhub-empty">
          <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
          <p>No hay formularios disponibles en este momento.</p>
        </div>
      ) : (
        <div className="fhub-cards-grid">
          {forms.map((form) => {
            const completed = !!myResponses[form.id] || successFormId === form.id;
            return (
              <button
                key={form.id}
                type="button"
                className={`fhub-form-card ${completed ? 'fhub-form-card-done' : ''}`}
                onClick={() => !completed && openForm(form)}
                disabled={completed}
              >
                <div className="fhub-card-top">
                  <div className="fhub-card-icon">
                    {completed ? <CheckCircle2 size={20} style={{ color: '#34d399' }} /> : <ClipboardList size={20} />}
                  </div>
                  <span className={`fhub-status-pill ${completed ? 'fhub-pill-done' : 'fhub-pill-pending'}`}>
                    {completed ? 'Completado' : 'Pendiente'}
                  </span>
                </div>
                <h3 className="fhub-card-title">{form.title}</h3>
                {form.description && <p className="fhub-card-desc">{form.description}</p>}
                {form.published_at && (
                  <div className="fhub-card-date text-muted">Publicado {fmtDate(form.published_at)}</div>
                )}
                {!completed && (
                  <div className="fhub-card-cta">Completar formulario →</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Fill modal */}
      {openForm_ && (
        <div className="modal-overlay" onClick={() => { setOpenFormId(null); }}>
          <div
            className="fhub-fill-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="fhub-fill-modal-header">
              <div>
                <h2 style={{ margin: 0 }}>{openForm_.title}</h2>
                {openForm_.description && (
                  <p className="text-muted" style={{ margin: '0.3rem 0 0', lineHeight: 1.5 }}>{openForm_.description}</p>
                )}
              </div>
              <button type="button" className="btn btn-ghost" style={{ padding: '0.4rem' }} onClick={() => setOpenFormId(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Progress bar */}
            {(() => {
              const answerableFields = openForm_.fields.filter((f) => f.type !== 'section' && f.type !== 'image');
              const answeredCount = answerableFields.filter((f) => answers[f.id]).length;
              const totalCount = answerableFields.length;
              const progress = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
              return (
                <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                    <span>Progreso</span>
                    <span>{answeredCount} de {totalCount} respondidas</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        backgroundColor: '#7c3aed',
                        width: `${progress}%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            <div className="fhub-fill-modal-body">
              {openForm_.fields.map((field) => (
                <FieldRenderer
                  key={field.id}
                  field={field}
                  value={answers[field.id] ?? ''}
                  error={fieldErrors[field.id]}
                  onChange={(v) => {
                    setAnswers((prev) => ({ ...prev, [field.id]: v }));
                    if (fieldErrors[field.id]) setFieldErrors((prev) => { const n = { ...prev }; delete n[field.id]; return n; });
                  }}
                />
              ))}
            </div>

            <div className="fhub-fill-modal-footer">
              <button type="button" className="btn btn-ghost" onClick={() => setOpenFormId(null)} disabled={isSubmitting}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
              >
                <Send size={15} />
                {isSubmitting ? 'Enviando…' : (openForm_.settings.submitButtonLabel || 'Enviar respuesta')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fhub-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
        .fhub-notice { display: flex; align-items: center; gap: 0.6rem; padding: 0.75rem 1rem; border-radius: 12px; margin-bottom: 1rem; font-size: 0.875rem; }
        .fhub-notice button { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; display: flex; }
        .fhub-notice-danger { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.28); color: #f87171; }
        .fhub-empty { text-align: center; padding: 4rem 1rem; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; }
        .fhub-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .fhub-form-card { text-align: left; border: 1px solid var(--border-subtle); border-radius: 20px; background: var(--bg-elevated); padding: 1.25rem; display: grid; gap: 0.6rem; cursor: pointer; transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
        .fhub-form-card:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(99,102,241,0.38); box-shadow: 0 12px 32px rgba(2,6,23,0.28); }
        .fhub-form-card-done { opacity: 0.7; cursor: default; border-color: rgba(16,185,129,0.24); background: rgba(16,185,129,0.04); }
        .fhub-card-top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .fhub-card-icon { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--border-subtle); background: rgba(255,255,255,0.04); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }
        .fhub-status-pill { display: inline-flex; padding: 0.28rem 0.65rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
        .fhub-pill-done { background: rgba(16,185,129,0.12); color: #34d399; }
        .fhub-pill-pending { background: rgba(234,179,8,0.12); color: #fbbf24; }
        .fhub-card-title { font-size: 1rem; font-weight: 700; color: var(--text-primary); margin: 0; }
        .fhub-card-desc { font-size: 0.8125rem; color: var(--text-secondary); margin: 0; line-height: 1.5; }
        .fhub-card-date { font-size: 0.78rem; }
        .fhub-card-cta { font-size: 0.82rem; font-weight: 700; color: var(--brand-primary-light); margin-top: 0.25rem; }
        .fhub-fill-modal { width: min(640px, calc(100vw - 2rem)); max-height: 90vh; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; }
        .fhub-fill-modal-header { padding: 1.5rem 1.5rem 1rem; border-bottom: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
        .fhub-fill-modal-body { flex: 1; overflow-y: auto; padding: 1.25rem 1.5rem; display: grid; gap: 1.25rem; }
        .fhub-fill-modal-footer { padding: 1rem 1.5rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: flex-end; gap: 0.75rem; }
        .fhub-section-header { padding: 0.5rem 0; border-bottom: 1px solid var(--border-subtle); }
        .fhub-section-title { font-size: 1rem; font-weight: 700; margin: 0 0 0.2rem; color: var(--text-primary); }
        .fhub-section-sub { font-size: 0.82rem; color: var(--text-muted); margin: 0; }
        .fhub-field-wrap { display: grid; gap: 0.4rem; }
        .fhub-field-wrap.fhub-field-error .input { border-color: rgba(239,68,68,0.5); }
        .fhub-field-label { font-size: 0.82rem; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.4rem; }
        .fhub-required { color: #f87171; }
        .fhub-lock-badge { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.68rem; padding: 0.15rem 0.45rem; border-radius: 999px; background: rgba(99,102,241,0.14); color: var(--brand-primary-light); border: 1px solid rgba(99,102,241,0.22); font-weight: 600; }
        .fhub-field-help { font-size: 0.78rem; color: var(--text-muted); margin: 0; }
        .fhub-field-error-msg { display: flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; color: #f87171; }
        .fhub-options-list { display: grid; gap: 0.45rem; }
        .fhub-option-row { display: flex; align-items: center; gap: 0.65rem; padding: 0.6rem 0.85rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); cursor: pointer; font-size: 0.875rem; transition: border-color 0.15s ease, background 0.15s ease; }
        .fhub-option-row input { accent-color: var(--brand-primary); }
        .fhub-option-selected { border-color: rgba(99,102,241,0.38); background: rgba(99,102,241,0.1); }
        .fhub-select-wrap { position: relative; }
        .fhub-select-arrow { position: absolute; right: 0.85rem; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .fhub-rating-row { display: flex; gap: 0.35rem; }
        .fhub-star-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0.2rem; transition: color 0.15s ease, transform 0.15s ease; }
        .fhub-star-btn:hover { transform: scale(1.2); }
        .fhub-star-active { color: #fbbf24; }
      `}</style>
    </div>
  );
}
