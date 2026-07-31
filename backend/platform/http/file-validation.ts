import 'server-only';

export type SafeFileKind = 'gif' | 'jpeg' | 'pdf' | 'png' | 'webp' | 'csv' | 'xls' | 'xlsx';

type FileRule = {
  extensions: readonly string[];
  mimeTypes: readonly string[];
  canonicalMime: string;
  matchesSignature: (bytes: Uint8Array) => boolean;
};

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  signature.every((byte, index) => bytes[index] === byte);

const RULES: Record<SafeFileKind, FileRule> = {
  jpeg: {
    extensions: ['jpg', 'jpeg'],
    mimeTypes: ['image/jpeg'],
    canonicalMime: 'image/jpeg',
    matchesSignature: (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  },
  png: {
    extensions: ['png'],
    mimeTypes: ['image/png'],
    canonicalMime: 'image/png',
    matchesSignature: (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  gif: {
    extensions: ['gif'],
    mimeTypes: ['image/gif'],
    canonicalMime: 'image/gif',
    matchesSignature: (bytes) => startsWith(bytes, [0x47, 0x49, 0x46, 0x38])
      && (bytes[4] === 0x37 || bytes[4] === 0x39)
      && bytes[5] === 0x61,
  },
  webp: {
    extensions: ['webp'],
    mimeTypes: ['image/webp'],
    canonicalMime: 'image/webp',
    matchesSignature: (bytes) => startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50]),
  },
  pdf: {
    extensions: ['pdf'],
    mimeTypes: ['application/pdf'],
    canonicalMime: 'application/pdf',
    matchesSignature: (bytes) => startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  },
  csv: {
    extensions: ['csv'],
    mimeTypes: ['text/csv', 'application/csv', 'text/plain'],
    canonicalMime: 'text/csv',
    matchesSignature: (bytes) => {
      const sample = bytes.slice(0, Math.min(bytes.byteLength, 4_096));
      if (sample.some((byte) => byte === 0)) return false;
      const text = new TextDecoder('utf-8', { fatal: false }).decode(sample);
      return /[,;\t]/.test(text) && /\r?\n/.test(text);
    },
  },
  xls: {
    extensions: ['xls'],
    mimeTypes: ['application/vnd.ms-excel'],
    canonicalMime: 'application/vnd.ms-excel',
    matchesSignature: (bytes) => startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  xlsx: {
    extensions: ['xlsx'],
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    canonicalMime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    matchesSignature: (bytes) => {
      if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return false;
      const archiveNames = new TextDecoder('latin1').decode(bytes);
      return archiveNames.includes('[Content_Types].xml') && archiveNames.includes('xl/');
    },
  },
};

export type ValidatedFile = {
  bytes: Uint8Array;
  extension: string;
  contentType: string;
  kind: SafeFileKind;
};

export async function validateFile(
  file: File,
  options: { maxBytes: number; allowedKinds: readonly SafeFileKind[] },
): Promise<ValidatedFile | null> {
  if (file.size <= 0 || file.size > options.maxBytes) return null;

  const extension = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  const declaredMime = file.type.trim().toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > options.maxBytes) return null;

  for (const kind of options.allowedKinds) {
    const rule = RULES[kind];
    if (
      rule.extensions.includes(extension)
      && rule.mimeTypes.includes(declaredMime)
      && rule.matchesSignature(bytes)
    ) {
      return { bytes, extension, contentType: rule.canonicalMime, kind };
    }
  }

  return null;
}
