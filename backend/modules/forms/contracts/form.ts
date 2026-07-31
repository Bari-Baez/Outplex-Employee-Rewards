export type FormFieldType =
  | 'section'
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'email'
  | 'date'
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'rating'
  | 'image';

export type LockedFieldSource = 'user_name' | 'user_email' | 'user_employee_id';

export type FormStatus = 'draft' | 'published' | 'closed';

export interface FormFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  locked?: LockedFieldSource | null;
  options?: string[];
  validation?: FormFieldValidation;
  imageUrl?: string;
}

export interface FormSettings {
  submitButtonLabel: string;
  successMessage: string;
  allowMultipleSubmissions: boolean;
}

export const DEFAULT_FORM_SETTINGS: FormSettings = {
  submitButtonLabel: 'Enviar respuesta',
  successMessage: '¡Gracias! Tu respuesta fue registrada exitosamente.',
  allowMultipleSubmissions: false,
};

export interface FormDefinition {
  id: string;
  title: string;
  description: string;
  fields: FormField[];
  settings: FormSettings;
  status: FormStatus;
  created_by: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  is_mandatory: boolean;
}

export interface FormResponse {
  id: string;
  form_id: string;
  user_id: string;
  answers: Record<string, unknown>;
  submitted_at: string;
  user?: {
    id: string;
    name: string;
    email: string;
    employee_id: string | null;
    role?: string;
  };
}

export interface FormWithStats extends FormDefinition {
  responseCount: number;
}

export interface FormSummary {
  id: string;
  title: string;
  description: string;
  status: FormStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  is_mandatory: boolean;
}

export interface FormSummaryWithStats extends FormSummary {
  responseCount: number;
}

export interface FormCompletionStatus {
  completed: Array<{ id: string; name: string; email: string; employee_id: string | null; submitted_at: string }>;
  pending: Array<{ id: string; name: string; email: string; employee_id: string | null }>;
}

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  section: 'Sección',
  short_text: 'Texto corto',
  long_text: 'Texto largo',
  number: 'Número',
  email: 'Correo',
  date: 'Fecha',
  radio: 'Opción única',
  checkbox: 'Opción múltiple',
  select: 'Desplegable',
  rating: 'Calificación',
  image: 'Imagen',
};

export const LOCKED_LABELS: Record<LockedFieldSource, string> = {
  user_name: 'Nombre del empleado',
  user_email: 'Correo del empleado',
  user_employee_id: 'ID de empleado',
};
