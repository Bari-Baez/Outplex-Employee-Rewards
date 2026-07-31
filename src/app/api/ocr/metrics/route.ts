import 'server-only';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { authorizeCapability } from '@backend/platform/auth/capabilities';
import { getAppOrigin, getOptionalServerEnv } from '@backend/platform/config/server-env';
import { validateFile, type SafeFileKind } from '@backend/platform/http/file-validation';
import { isSameOriginRequest } from '@backend/platform/http/redirects';
import { readMultipartFormData, RequestBodyError } from '@backend/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse } from '@backend/platform/http/responses';
import { getRequestId, logServerError } from '@backend/platform/observability/request-context';
import { consumeRateLimit } from '@backend/platform/security/rate-limit';

export const maxDuration = 30;
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 512 * 1024;
const IMAGE_KINDS = ['gif', 'jpeg', 'png', 'webp'] as const satisfies readonly SafeFileKind[];

const METRICS_PROMPT = `You are reading a call-center performance / bonus metrics table image.
Extract every agent row and return a JSON object with a "rows" array.
Each row must contain string fields: name, opx_id, attendance, and total_bonus.
Use plain numbers without percent or currency signs. Skip header and Grand Total rows.
Skip rows with an empty agent name. Return ONLY valid JSON.`;

export interface MetricsOcrRow {
  name: string;
  opx_id: string;
  attendance: string;
  total_bonus: string;
}

function parseMetricsRows(text: string): MetricsOcrRow[] {
  const rawObject = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawObject);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

  const rows = (parsed as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return [];

  const normalized: MetricsOcrRow[] = [];
  for (const row of rows.slice(0, 500)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const value = row as Record<string, unknown>;
    const name = typeof value.name === 'string' ? value.name.trim().slice(0, 160) : '';
    const opxId = typeof value.opx_id === 'string' || typeof value.opx_id === 'number'
      ? String(value.opx_id).trim().slice(0, 32)
      : '';
    const attendance = typeof value.attendance === 'string' || typeof value.attendance === 'number'
      ? String(value.attendance).replace(/[%,$]/g, '').trim().slice(0, 32)
      : '';
    const totalBonus = typeof value.total_bonus === 'string' || typeof value.total_bonus === 'number'
      ? String(value.total_bonus).replace(/[$,]/g, '').trim().slice(0, 32)
      : '';

    if (name.length < 2) continue;
    if (opxId && !/^\d{1,16}$/.test(opxId)) continue;
    if (attendance && !/^\d{1,3}(?:\.\d{1,4})?$/.test(attendance)) continue;
    if (totalBonus && ! /^\d{1,8}(?:\.\d{1,4})?$/.test(totalBonus)) continue;

    normalized.push({ name, opx_id: opxId, attendance, total_bonus: totalBonus || '0' });
  }
  return normalized;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (!isSameOriginRequest(request, getAppOrigin())) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const auth = await authorizeCapability('ocr:metrics');
    if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);

    const rateLimit = await consumeRateLimit({
      scope: 'ocr:metrics',
      subject: auth.profile.id,
      limit: 6,
      windowSeconds: 60,
      requestId,
    });
    if (!rateLimit.allowed) return rateLimitedResponse(requestId, rateLimit.retryAfterSeconds);

    const apiKey = getOptionalServerEnv('GEMINI_API_KEY');
    if (!apiKey) {
      return errorResponse(requestId, 503, 'OCR service not configured.', { fallback: true });
    }

    const formData = await readMultipartFormData(request, MAX_MULTIPART_BYTES);
    const imageFile = formData.get('image');
    if (!(imageFile instanceof File)) {
      return errorResponse(requestId, 400, 'No image file provided');
    }
    if (imageFile.size > MAX_IMAGE_BYTES) {
      return errorResponse(requestId, 413, 'Image is too large (max 8MB)');
    }

    const image = await validateFile(imageFile, { maxBytes: MAX_IMAGE_BYTES, allowedKinds: IMAGE_KINDS });
    if (!image) {
      return errorResponse(requestId, 400, 'Unsupported or invalid image. Use PNG, JPEG, WebP, or GIF.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      {
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8_192 },
      },
      { timeout: 25_000 },
    );

    let text: string;
    try {
      const result = await model.generateContent([
        { text: METRICS_PROMPT },
        { inlineData: { mimeType: image.contentType, data: Buffer.from(image.bytes).toString('base64') } },
      ]);
      text = result.response.text().trim().slice(0, 256_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isQuotaError = /quota|429|RESOURCE_EXHAUSTED/i.test(message);
      logServerError('ocr.metrics.provider', requestId, new Error(isQuotaError ? 'Provider quota exceeded' : 'Provider request failed'));
      return errorResponse(
        requestId,
        503,
        isQuotaError ? 'Daily OCR limit reached. Try again later.' : 'Vision service temporarily unavailable.',
        { fallback: true },
      );
    }

    return jsonResponse(requestId, { rows: parseMetricsRows(text), rawText: text });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('ocr.metrics', requestId, error);
    return errorResponse(requestId, 500, 'Unable to process OCR request', { fallback: true });
  }
}
