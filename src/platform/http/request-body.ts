import 'server-only';

export class RequestBodyError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
  ) {
    super(publicMessage);
    this.name = 'RequestBodyError';
  }
}

function parseContentLength(request: Request, maxBytes: number): void {
  const raw = request.headers.get('content-length');
  if (!raw) return;

  const contentLength = Number(raw);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new RequestBodyError(400, 'Invalid Content-Length header.');
  }
  if (contentLength > maxBytes) {
    throw new RequestBodyError(413, 'Request body is too large.');
  }
}

export async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  parseContentLength(request, maxBytes);

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('Request body exceeded the configured limit.');
        throw new RequestBodyError(413, 'Request body is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function readMultipartFormData(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new RequestBodyError(415, 'Expected multipart form data.');
  }

  const bytes = await readBodyBytes(request, maxBytes);
  try {
    const clone = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: toArrayBuffer(bytes),
    });
    return await clone.formData();
  } catch {
    throw new RequestBodyError(400, 'Invalid multipart request body.');
  }
}

export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestBodyError(415, 'Expected an application/json request body.');
  }

  const bytes = await readBodyBytes(request, maxBytes);
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new RequestBodyError(400, 'Invalid JSON request body.');
  }
}
