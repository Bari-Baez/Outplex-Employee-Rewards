import 'server-only';

import { lookup } from 'node:dns/promises';
import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import https from 'node:https';
import net from 'node:net';

export type SafeFetchFailure = 'blocked' | 'invalid' | 'network' | 'size' | 'timeout';

export class SafeFetchError extends Error {
  constructor(public readonly failure: SafeFetchFailure) {
    super(failure);
    this.name = 'SafeFetchError';
  }
}

type SafeFetchResult = {
  bytes: Uint8Array;
  headers: Headers;
  status: number;
};

type ResolvedTarget = {
  address: string;
  family: 4 | 6;
  tlsServername: string;
};

function isPublicIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first, second, third] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) return false;
  if (first === 100 && second >= 64 && second <= 127) return false;
  if (first === 169 && second === 254) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 192 && second === 0 && third === 0) return false;
  if (first === 192 && second === 0 && third === 2) return false;
  if (first === 198 && second >= 18 && second <= 19) return false;
  if (first === 198 && second === 51 && third === 100) return false;
  if (first === 203 && second === 0 && third === 113) return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const firstHextet = Number.parseInt(normalized.split(':', 1)[0] || '0', 16);

  // Only globally routable 2000::/3 addresses are accepted.
  if (!Number.isFinite(firstHextet) || firstHextet < 0x2000 || firstHextet > 0x3fff) return false;
  if (normalized.startsWith('2001:db8:')) return false;
  return true;
}

function isPublicIp(address: string): boolean {
  const version = net.isIP(address.replace(/^\[|\]$/g, ''));
  if (version === 4) return isPublicIpv4(address);
  if (version === 6) return isPublicIpv6(address);
  return false;
}

function isAllowedHostname(hostname: string, allowedHosts: ReadonlySet<string>): boolean {
  for (const rule of allowedHosts) {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1);
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) return true;
    } else if (hostname === rule) {
      return true;
    }
  }
  return false;
}

async function resolveSafeTarget(target: URL, allowedHosts: ReadonlySet<string>): Promise<ResolvedTarget> {
  if (!['http:', 'https:'].includes(target.protocol)) throw new SafeFetchError('invalid');
  if (target.username || target.password) throw new SafeFetchError('blocked');
  if ((target.protocol === 'http:' && target.port && target.port !== '80')
    || (target.protocol === 'https:' && target.port && target.port !== '443')) {
    throw new SafeFetchError('blocked');
  }

  const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new SafeFetchError('blocked');
  }
  if (!isAllowedHostname(hostname, allowedHosts)) throw new SafeFetchError('blocked');

  if (net.isIP(hostname)) {
    if (!isPublicIp(hostname)) throw new SafeFetchError('blocked');
    return {
      address: hostname,
      family: net.isIP(hostname) as 4 | 6,
      tlsServername: hostname,
    };
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
      throw new SafeFetchError('blocked');
    }
    const selected = addresses[0];
    return {
      address: selected.address,
      family: selected.family as 4 | 6,
      tlsServername: hostname,
    };
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    throw new SafeFetchError('network');
  }
}

function toWebHeaders(source: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, String(value));
    }
  }
  return headers;
}

function toNodeHeaders(source?: HeadersInit): Record<string, string> {
  const headers = new Headers(source);
  return Object.fromEntries(headers.entries());
}

function requestPinned(
  target: URL,
  resolved: ResolvedTarget,
  headers: HeadersInit | undefined,
  signal: AbortSignal,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const commonOptions = {
      family: resolved.family,
      headers: {
        ...toNodeHeaders(headers),
        host: target.host,
      },
      hostname: resolved.address,
      method: 'GET',
      path: `${target.pathname}${target.search}`,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      protocol: target.protocol,
      signal,
    };

    const request = target.protocol === 'https:'
      ? https.request({ ...commonOptions, servername: resolved.tlsServername }, resolve)
      : http.request(commonOptions, resolve);

    request.once('error', reject);
    request.end();
  });
}

async function readResponseBody(response: IncomingMessage, maxBytes: number): Promise<Uint8Array> {
  const contentLength = response.headers['content-length'];
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) throw new SafeFetchError('size');
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  for await (const rawChunk of response) {
    const chunk = typeof rawChunk === 'string' ? Buffer.from(rawChunk) : new Uint8Array(rawChunk);
    total += chunk.byteLength;
    if (total > maxBytes) {
      response.destroy();
      throw new SafeFetchError('size');
    }
    chunks.push(chunk);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchSafeBytes(
  initialUrl: URL,
  options: {
    headers?: HeadersInit;
    maxBytes: number;
    maxRedirects: number;
    timeoutMs: number;
    allowedHosts: ReadonlySet<string>;
  },
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let target = initialUrl;

  try {
    for (let redirectCount = 0; redirectCount <= options.maxRedirects; redirectCount += 1) {
      const resolved = await resolveSafeTarget(target, options.allowedHosts);

      let response: IncomingMessage;
      try {
        response = await requestPinned(target, resolved, options.headers, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) throw new SafeFetchError('timeout');
        throw error;
      }

      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location || redirectCount === options.maxRedirects) throw new SafeFetchError('blocked');
        try {
          target = new URL(location, target);
        } catch {
          throw new SafeFetchError('invalid');
        }
        continue;
      }

      const bytes = await readResponseBody(response, options.maxBytes);
      return { bytes, headers: toWebHeaders(response.headers), status };
    }

    throw new SafeFetchError('blocked');
  } catch (error) {
    if (error instanceof SafeFetchError) throw error;
    if (controller.signal.aborted) throw new SafeFetchError('timeout');
    throw new SafeFetchError('network');
  } finally {
    clearTimeout(timeout);
  }
}
