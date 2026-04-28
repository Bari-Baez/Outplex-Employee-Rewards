'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronDown, Lock, Star } from 'lucide-react';
import { ModernSelect } from '@/components/ui/Select';
import { ModernDatePicker } from '@/components/ui/DatePicker';
import { validateFormAnswers } from '@/lib/forms/validation';
import type { FormDefinition, FormField } from '@/lib/forms/types';

interface Props {
  pendingForms: FormDefinition[];
  userId: string;
  userName: string;
  userEmail: string;
  userEmployeeId: string | null;
}

function FieldRenderer({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
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

  return (
    <div className={`fhub-field-wrap ${error ? 'fhub-field-error' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <label className="fhub-field-label" style={{ margin: 0 }}>
          {field.label}
          {field.required && <span className="fhub-required">*</span>}
          {locked && <span className="fhub-lock-badge"><Lock size={10} /> Auto</span>}
        </label>
        {field.required && <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '0.25rem 0.5rem', backgroundColor: '#dc2626', color: 'white', borderRadius: '4px' }}>Obligatorio</span>}
      </div>
      {field.helpText && <p className="fhub-field-help">{field.helpText}</p>}

      {(field.type === 'short_text' || field.type === 'email') && (
        <input
          className="input"
          type={field.type === 'email' ? 'email' : 'text'}
          placeholder={field.placeholder ?? ''}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          style={locked ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
        />
      )}

      {field.type === 'long_text' && (
        <textarea
          className="input"
          rows={4}
          placeholder={field.placeholder ?? ''}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          style={{ resize: 'vertical', ...(locked ? { opacity: 0.7, cursor: 'not-allowed' } : {}) }}
        />
      )}

      {field.type === 'number' && (
        <input
          className="input"
          type="number"
          placeholder={field.placeholder ?? ''}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          readOnly={locked}
          min={field.validation?.min}
          max={field.validation?.max}
        />
      )}

      {field.type === 'date' && (
        <ModernDatePicker
          date={String(value ?? '')}
          onDateChange={(v) => onChange(v)}
          className="w-full"
        />
      )}

      {field.type === 'radio' && (
        <div className="fhub-options-list">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className={`fhub-option-row ${value === opt ? 'fhub-option-selected' : ''}`}>
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={locked}
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.type === 'checkbox' && (
        <div className="fhub-options-list">
          {(field.options ?? []).map((opt) => {
            const checked = Array.isArray(value) && (value as string[]).includes(opt);
            return (
              <label key={opt} className={`fhub-option-row ${checked ? 'fhub-option-selected' : ''}`}>
                <input
                  type="checkbox"
                  value={opt}
                  checked={checked}
                  onChange={() => {
                    if (locked) return;
                    const current = Array.isArray(value) ? (value as string[]) : [];
                    onChange(checked ? current.filter((v) => v !== opt) : [...current, opt]);
                  }}
                  disabled={locked}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}

      {field.type === 'select' && (
        <ModernSelect
          value={String(value ?? '')}
          onValueChange={v => onChange(v)}
          options={[
            ...(field.placeholder ? [{ label: field.placeholder, value: '' }] : []),
            ...(field.options ?? []).map(opt => ({ label: opt, value: opt }))
          ]}
        />
      )}

      {field.type === 'rating' && (
        <div className="fhub-rating-row">
          {Array.from({ length: field.validation?.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`fhub-star-btn ${Number(value) >= n ? 'fhub-star-active' : ''}`}
              onClick={() => onChange(n)}
              disabled={locked}
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

export function MandatoryFormGuard({ pendingForms, userId, userName, userEmail, userEmployeeId }: Props) {
  const [pending, setPending] = useState(pendingForms);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const currentForm = pending[0] ?? null;
  const totalForms = pendingForms.length;
  const currentIndex = totalForms - pending.length;

  useEffect(() => {
    if (!currentForm) return;
    const ans: Record<string, unknown> = {};
    for (const field of currentForm.fields) {
      if (field.locked === 'user_name') ans[field.id] = userName;
      else if (field.locked === 'user_email') ans[field.id] = userEmail;
      else if (field.locked === 'user_employee_id') ans[field.id] = userEmployeeId;
    }
    setAnswers(ans);
    setErrors({});
  }, [currentForm, userName, userEmail, userEmployeeId]);

  const handleSubmit = async () => {
    if (!currentForm) return;
    setGlobalError(null);
    const validationErrors = validateFormAnswers(currentForm.fields, answers);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${currentForm.id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const data = (await res.json()) as { data?: unknown; error?: string };
      if (data.error) {
        setGlobalError(data.error);
        return;
      }
      const next = pending.slice(1);
      setPending(next);
      if (next.length === 0) {
        window.location.href = '/';
      }
    } catch (err) {
      setGlobalError((err instanceof Error ? err.message : 'Error al enviar formulario'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentForm) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.preventDefault();
      }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
          {totalForms > 1 && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Formulario {currentIndex + 1} de {totalForms}
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Formulario requerido
          </h2>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Debes completar este formulario para continuar
          </p>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          {globalError && (
            <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', marginBottom: '1rem', color: '#f87171', fontSize: '0.875rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ marginTop: '0.125rem', flexShrink: 0 }} />
              <div>{globalError}</div>
            </div>
          )}

          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {currentForm.fields.map((field) => (
              <FieldRenderer
                key={field.id}
                field={field}
                value={answers[field.id]}
                error={errors[field.id]}
                onChange={(v) => {
                  setAnswers((prev) => ({ ...prev, [field.id]: v }));
                  if (errors[field.id]) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next[field.id];
                      return next;
                    });
                  }
                }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            style={{ minWidth: '140px' }}
          >
            {isSubmitting ? 'Enviando…' : 'Enviar respuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}
