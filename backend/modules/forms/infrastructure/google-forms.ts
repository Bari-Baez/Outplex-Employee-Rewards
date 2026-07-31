import { SupabaseClient } from '@supabase/supabase-js';
import type { FormField, FormFieldType } from '@backend/modules/forms/contracts/form';
import { DEFAULT_FORM_SETTINGS } from '@backend/modules/forms/contracts/form';

// Google Forms API types
interface GfItem {
  itemId: string;
  title?: string;
  description?: string;
  questionItem?: {
    question: {
      questionId: string;
      required?: boolean;
      choiceQuestion?: { type: 'RADIO' | 'CHECKBOX' | 'DROP_DOWN'; options: Array<{ value: string }> };
      textQuestion?: { paragraph?: boolean };
      scaleQuestion?: { low: number; high: number };
      dateQuestion?: object;
      ratingQuestion?: object;
    };
  };
  textItem?: object;
  imageItem?: {
    image?: {
      sourceUri?: string;
      contentUri?: string;
    };
  };
}

interface GfForm {
  info: { title?: string | null; documentTitle?: string | null; description?: string };
  items?: GfItem[];
}

function mapGfItem(item: GfItem): FormField | null {
  const baseId = item.questionItem?.question.questionId ?? item.itemId;

  if (!item.questionItem && item.textItem) {
    return { id: baseId, type: 'section', label: item.title ?? '', required: false };
  }

  if (!item.questionItem) return null;

  const q = item.questionItem.question;
  const required = q.required ?? false;
  const label = item.title ?? 'Pregunta';
  const helpText = item.description;

  let type: FormFieldType = 'short_text';
  let options: string[] | undefined;

  if (q.choiceQuestion) {
    const ct = q.choiceQuestion.type;
    if (ct === 'RADIO') type = 'radio';
    else if (ct === 'CHECKBOX') type = 'checkbox';
    else if (ct === 'DROP_DOWN') type = 'select';
    options = q.choiceQuestion.options.map((o) => o.value);
  } else if (q.textQuestion) {
    type = q.textQuestion.paragraph ? 'long_text' : 'short_text';
  } else if (q.scaleQuestion || q.ratingQuestion) {
    type = 'rating';
  } else if (q.dateQuestion) {
    type = 'date';
  }

  if (type === 'short_text' && /correo|email/i.test(label)) type = 'email';

  return { id: baseId, type, label, helpText, required, options };
}

function mapGfImageItem(item: GfItem): { field: FormField; candidates: string[] } {
  const baseId = item.questionItem?.question.questionId ?? item.itemId;
  const candidates = [
    item.imageItem?.image?.contentUri,
    item.imageItem?.image?.sourceUri,
  ].filter((u): u is string => Boolean(u));

  return {
    field: {
      id: baseId,
      type: 'image',
      label: item.title ?? 'Imagen',
      imageUrl: candidates[0] ?? '',
      required: false,
    },
    candidates,
  };
}

function isGoogleHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === 'google.com' ||
    h.endsWith('.google.com') ||
    h === 'googleapis.com' ||
    h.endsWith('.googleapis.com') ||
    h === 'googleusercontent.com' ||
    h.endsWith('.googleusercontent.com') ||
    h === 'gstatic.com' ||
    h.endsWith('.gstatic.com')
  );
}

function sanitizeExt(ext: string | null | undefined): string {
  const safe = (ext ?? '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return safe || 'jpg';
}

function inferExtFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return m?.[1] ? sanitizeExt(m[1]) : null;
  } catch {
    return null;
  }
}

function extractDriveFileId(url: string): string | null {
  try {
    const u = new URL(url);
    // https://drive.google.com/open?id=FILEID
    const idParam = u.searchParams.get('id');
    if (idParam) return idParam;

    // https://drive.google.com/file/d/FILEID/view
    const m = u.pathname.match(/\/file\/d\/([^/]+)/);
    if (m?.[1]) return m[1];

    return null;
  } catch {
    return null;
  }
}

async function fetchImageBytes(url: string, accessToken: string): Promise<{ arrayBuffer: ArrayBuffer; contentType: string; ext: string } | null> {
  const headers: Record<string, string> = {};
  try {
    const u = new URL(url);
    if (isGoogleHostname(u.hostname)) headers['Authorization'] = `Bearer ${accessToken}`;
  } catch {
    if (url.includes('googleapis.com') || url.includes('google.com') || url.includes('googleusercontent.com') || url.includes('gstatic.com')) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) return null;

  let contentType = res.headers.get('content-type') ?? '';
  const lowerCt = contentType.toLowerCase();

  const extFromCt = lowerCt.startsWith('image/') ? lowerCt.split('/')[1] : null;
  const ext = extFromCt ? sanitizeExt(extFromCt) : (inferExtFromUrl(url) ?? 'jpg');

  const isImageLike =
    lowerCt.startsWith('image/') ||
    lowerCt.includes('application/octet-stream') ||
    lowerCt === '';

  if (!isImageLike) return null;

  const mimeByExt: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  if (!lowerCt.startsWith('image/')) {
    contentType = mimeByExt[ext] ?? 'application/octet-stream';
  }

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength === 0) return null;
  return { arrayBuffer, contentType, ext };
}

async function uploadFormImage(
  serviceClient: SupabaseClient,
  imageUrls: string[],
  accessToken: string,
  googleFormId: string,
  index: number,
): Promise<string> {
  const original = imageUrls[0] ?? '';
  if (!original) return original;
  try {
    const unique = Array.from(new Set(imageUrls.filter(Boolean)));

    let downloaded: { arrayBuffer: ArrayBuffer; contentType: string; ext: string } | null = null;
    for (const candidate of unique) {
      downloaded = await fetchImageBytes(candidate, accessToken);
      if (downloaded) break;

      const driveId = extractDriveFileId(candidate);
      if (driveId) {
        downloaded = await fetchImageBytes(`https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`, accessToken);
        if (downloaded) break;
      }
    }

    if (!downloaded) return original;

    const path = `forms/${googleFormId}/${index}.${downloaded.ext}`;

    const { error } = await serviceClient.storage
      .from('form-images')
      .upload(path, downloaded.arrayBuffer, { contentType: downloaded.contentType, upsert: true });

    if (error) {
      console.warn('[forms] image upload failed:', error.message);
      return original;
    }

    const { data: { publicUrl } } = serviceClient.storage
      .from('form-images')
      .getPublicUrl(path);

    return publicUrl;
  } catch (err) {
    console.warn('[forms] image download/upload error:', err);
    return original;
  }
}

export async function importGoogleForm(
  serviceClient: SupabaseClient,
  userId: string,
  googleFormId: string,
  accessToken: string,
): Promise<{ id: string; alreadyExists: boolean; fieldCount: number }> {
  // Check if already imported
  const { data: existing } = await serviceClient
    .from('forms')
    .select('id, fields')
    .eq('google_form_id', googleFormId)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id as string,
      alreadyExists: true,
      fieldCount: (existing.fields as unknown[]).length,
    };
  }

  const res = await fetch(`https://forms.googleapis.com/v1/forms/${googleFormId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) throw new Error(`Google Forms API error: ${await res.text()}`);

  const gfForm = await res.json() as GfForm;

  const rawFields: Array<{ field: FormField; imageCandidates?: string[] }> = [];
  for (const item of gfForm.items ?? []) {
    if (item.imageItem) {
      const { field, candidates } = mapGfImageItem(item);
      rawFields.push({ field, imageCandidates: candidates });
      continue;
    }

    const mapped = mapGfItem(item);
    if (mapped) rawFields.push({ field: mapped });
  }

  // Download images from Google and store in Supabase Storage
  let imageIndex = 0;
  const fields: FormField[] = [];
  for (const entry of rawFields) {
    const field = entry.field;
    if (field.type === 'image' && (entry.imageCandidates?.length ?? 0) > 0) {
      const storedUrl = await uploadFormImage(
        serviceClient,
        entry.imageCandidates!,
        accessToken,
        googleFormId,
        imageIndex++,
      );
      fields.push({ ...field, imageUrl: storedUrl });
    } else {
      fields.push(field);
    }
  }

  const resolvedTitle =
    gfForm.info.title?.trim() ||
    gfForm.info.documentTitle?.trim() ||
    'Formulario sin título';

  const { data: newForm, error } = await serviceClient.from('forms').insert({
    title: resolvedTitle,
    description: gfForm.info.description ?? '',
    fields,
    settings: DEFAULT_FORM_SETTINGS,
    status: 'draft',
    created_by: userId,
    google_form_id: googleFormId,
  }).select('id').single();

  if (error) throw new Error(error.message);
  return { id: newForm?.id as string, alreadyExists: false, fieldCount: fields.length };
}

export async function syncUserGoogleForms(
  serviceClient: SupabaseClient,
  userId: string,
  accessToken: string,
  limit = 5,
) {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.form'",
    fields: 'files(id,name)',
    orderBy: 'modifiedTime desc',
    pageSize: limit.toString(),
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return { imported: 0, error: 'Failed to list forms' };

  const { files } = await res.json() as { files: Array<{ id: string }> };
  if (!files || files.length === 0) return { imported: 0 };

  let imported = 0;
  for (const file of files) {
    try {
      const result = await importGoogleForm(serviceClient, userId, file.id, accessToken);
      if (!result.alreadyExists) imported++;
    } catch (e) {
      console.error(`Failed to auto-import form ${file.id}:`, e);
    }
  }

  return { imported };
}
