import 'server-only';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { CORE_OT_COLUMNS } from '@/lib/ot';
import { authorizeCapability } from '@/platform/auth/capabilities';
import { getAppOrigin, getOptionalServerEnv } from '@/platform/config/server-env';
import { validateFile, type SafeFileKind } from '@/platform/http/file-validation';
import { isSameOriginRequest } from '@/platform/http/redirects';
import { readMultipartFormData, RequestBodyError } from '@/platform/http/request-body';
import { errorResponse, jsonResponse, rateLimitedResponse } from '@/platform/http/responses';
import { getRequestId, logServerError } from '@/platform/observability/request-context';
import { consumeRateLimit } from '@/platform/security/rate-limit';

export const maxDuration = 30;
export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 512 * 1024;
const MAX_ROWS = 500;
const MAX_CELL_LENGTH = 500;
const IMAGE_KINDS = ['gif', 'jpeg', 'png', 'webp'] as const satisfies readonly SafeFileKind[];
const STANDARD_COLUMN_ALIASES = new Set(['total', 'duration', 'hours', 'total_hrs', 'duration_hrs']);

const OCR_PROMPT = `You are an overtime (OT) schedule data extractor. Read this table image and return a JSON object.

Output format:
{
  "headers": ["spot_id","lob","date","start_time","end_time","total"],
  "rows": [
    {"spot_id":"17823","lob":"","date":"02/05/2026","start_time":"8:30 AM","end_time":"1:00 PM","total":"4.5"}
  ]
}

Rules:
- ALWAYS include AM or PM after every time.
- "spot_id" is the 4-8 digit employee/spot ID.
- "lob" is the line of business; use "" when absent.
- Preserve the displayed date.
- Use H:MM AM/PM for start_time and end_time.
- "total" is a numeric hour string.
- Include extra columns with snake_case keys.
- Use "" for empty cells and omit the header row.
- Return ONLY valid JSON.`;

function parseModelObject(text: string): Record<string, unknown> | null {
  const candidates = [text, text.match(/\{[\s\S]*\}/)?.[0]].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next bounded candidate.
    }
  }
  return null;
}

function normalizeRows(value: unknown): Record<string, string>[] {
  if (!Array.isArray(value)) return [];

  const rows: Record<string, string>[] = [];
  for (const candidate of value.slice(0, MAX_ROWS)) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const row: Record<string, string> = Object.create(null) as Record<string, string>;

    for (const [key, cell] of Object.entries(candidate as Record<string, unknown>).slice(0, 64)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) continue;
      if (typeof cell !== 'string' && typeof cell !== 'number') continue;
      row[key] = String(cell).trim().slice(0, MAX_CELL_LENGTH);
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }
  return rows;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (!isSameOriginRequest(request, getAppOrigin())) {
      return errorResponse(requestId, 403, 'Forbidden');
    }

    const auth = await authorizeCapability('ocr:ot');
    if (!auth.ok) return errorResponse(requestId, auth.status, auth.error);

    const rateLimit = await consumeRateLimit({
      scope: 'ocr:ot',
      subject: auth.profile.id,
      limit: 8,
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
        { text: OCR_PROMPT },
        { inlineData: { mimeType: image.contentType, data: Buffer.from(image.bytes).toString('base64') } },
      ]);
      text = result.response.text().trim().slice(0, 256_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const isQuotaError = /quota|429|RESOURCE_EXHAUSTED/i.test(message);
      logServerError('ocr.provider', requestId, new Error(isQuotaError ? 'Provider quota exceeded' : 'Provider request failed'));
      return errorResponse(
        requestId,
        503,
        isQuotaError
          ? 'Daily OCR limit reached. Try again later.'
          : 'Vision service temporarily unavailable. The browser OCR fallback will be used instead.',
        { fallback: true },
      );
    }

    const parsed = parseModelObject(text);
    const rows = normalizeRows(parsed?.rows);
    const headers = Array.isArray(parsed?.headers)
      ? parsed.headers
        .filter((header): header is string => typeof header === 'string')
        .map((header) => header.trim())
        .filter((header) => /^[a-z][a-z0-9_]{0,63}$/.test(header))
        .slice(0, 64)
      : Object.keys(rows[0] ?? {});
    const coreSet = new Set<string>([...CORE_OT_COLUMNS, ...STANDARD_COLUMN_ALIASES]);
    const extraColumns = headers.filter((header) => !coreSet.has(header));

    return jsonResponse(requestId, {
      attempts: [{
        label: 'gemini vision',
        text,
        tsv: null,
        confidence: 95,
        rows: rows.length > 0 ? rows : null,
        extraColumns,
      }],
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return errorResponse(requestId, error.status, error.publicMessage);
    }
    logServerError('ocr', requestId, error);
    return errorResponse(requestId, 500, 'Unable to process OCR request', { fallback: true });
  }
}
