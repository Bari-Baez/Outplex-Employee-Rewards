import type { FormField } from './types';

export function validateFieldValue(field: FormField, value: unknown): string | null {
  if (field.type === 'section') return null;

  const isEmpty =
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);

  if (field.required && isEmpty) {
    return `"${field.label}" es un campo requerido.`;
  }

  if (isEmpty) return null;

  const v = field.validation ?? {};

  switch (field.type) {
    case 'short_text':
    case 'long_text': {
      const str = String(value);
      if (v.minLength !== undefined && str.length < v.minLength)
        return `"${field.label}" debe tener al menos ${v.minLength} caracteres.`;
      if (v.maxLength !== undefined && str.length > v.maxLength)
        return `"${field.label}" no puede superar ${v.maxLength} caracteres.`;
      return null;
    }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
        return `"${field.label}" debe ser un correo electrónico válido.`;
      return null;
    }
    case 'number': {
      const num = Number(value);
      if (!Number.isFinite(num)) return `"${field.label}" debe ser un número válido.`;
      if (v.min !== undefined && num < v.min)
        return `"${field.label}" debe ser al menos ${v.min}.`;
      if (v.max !== undefined && num > v.max)
        return `"${field.label}" no puede superar ${v.max}.`;
      return null;
    }
    case 'radio':
    case 'select': {
      if (field.options && !field.options.includes(String(value)))
        return `"${field.label}": opción no válida.`;
      return null;
    }
    case 'checkbox': {
      if (!Array.isArray(value)) return `"${field.label}": selección no válida.`;
      if (field.options) {
        for (const item of value as unknown[]) {
          if (!field.options.includes(String(item)))
            return `"${field.label}": opción "${String(item)}" no válida.`;
        }
      }
      return null;
    }
    case 'rating': {
      const num = Number(value);
      const max = v.max ?? 5;
      if (!Number.isInteger(num) || num < 1 || num > max)
        return `"${field.label}" debe ser una calificación entre 1 y ${max}.`;
      return null;
    }
    default:
      return null;
  }
}

export function validateFormAnswers(
  fields: FormField[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.type === 'section') continue;
    if (field.locked) continue; // auto-filled, always valid
    const error = validateFieldValue(field, answers[field.id]);
    if (error) errors[field.id] = error;
  }
  return errors;
}
