import 'server-only';

import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';

const SUPABASE_DNS_SERVERS = ['8.8.8.8', '8.8.4.4'];
const resolver = new dns.promises.Resolver();
resolver.setServers(SUPABASE_DNS_SERVERS);
const httpKeepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsKeepAliveAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

function isSupabaseHostname(hostname: string) {
  return hostname.endsWith('.supabase.co');
}

function resolveAddress(hostname: string, family: 4 | 6): Promise<string[]> {
  return family === 6 ? resolver.resolve6(hostname) : resolver.resolve4(hostname);
}

function dnsLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
) {
  const preferredFamily = options.family === 6 ? 6 : 4;

  resolveAddress(hostname, preferredFamily)
    .catch(() => resolveAddress(hostname, 4))
    .then((addresses) => {
      if (!addresses.length) {
        throw new Error(`No DNS records returned for ${hostname}`);
      }

      if ('all' in options && options.all) {
        callback(
          null,
          addresses.map((address) => ({
            address,
            family: preferredFamily === 6 ? 6 : 4,
          })),
        );
        return;
      }

      callback(null, addresses[0], preferredFamily === 6 ? 6 : 4);
    })
    .catch((error) => {
      callback(error as NodeJS.ErrnoException, '');
    });
}

function createAbortError() {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function appendNodeHeaders(headers: Headers, source: http.IncomingHttpHeaders) {
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => headers.append(key, entry));
      continue;
    }

    if (typeof value === 'string') {
      headers.set(key, value);
    }
  }
}

async function buildRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) {
    return init ? new Request(input, init) : input.clone();
  }

  return new Request(String(input), init);
}

export async function fetchWithSupabaseDns(input: RequestInfo | URL, init?: RequestInit) {
  const request = await buildRequest(input, init);
  const targetUrl = new URL(request.url);

  if (!isSupabaseHostname(targetUrl.hostname)) {
    return fetch(input, init);
  }

  const headers = new Headers(request.headers);
  headers.delete('host');

  const method = request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const bodyBuffer = hasBody ? Buffer.from(await request.arrayBuffer()) : undefined;

  if (bodyBuffer && !headers.has('content-length')) {
    headers.set('content-length', String(bodyBuffer.length));
  }

  return new Promise<Response>((resolve, reject) => {
    const transport = targetUrl.protocol === 'http:' ? http : https;
    const nodeRequest = transport.request(
      targetUrl,
      {
        method,
        headers: Object.fromEntries(headers.entries()),
        lookup: dnsLookup,
        agent: targetUrl.protocol === 'http:' ? httpKeepAliveAgent : httpsKeepAliveAgent,
      },
      (nodeResponse) => {
        const chunks: Buffer[] = [];

        nodeResponse.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        nodeResponse.on('end', () => {
          const responseHeaders = new Headers();
          appendNodeHeaders(responseHeaders, nodeResponse.headers);
          const status = nodeResponse.statusCode ?? 500;
          const canHaveBody =
            method !== 'HEAD' && ![204, 205, 304].includes(status);

          if (!canHaveBody) {
            responseHeaders.delete('content-length');
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('transfer-encoding');
          }

          resolve(
            new Response(canHaveBody ? Buffer.concat(chunks) : null, {
              status,
              statusText: nodeResponse.statusMessage ?? '',
              headers: responseHeaders,
            }),
          );
        });
      },
    );

    nodeRequest.on('error', reject);
    nodeRequest.setTimeout(15000, () => {
      nodeRequest.destroy(new Error(`Supabase request timed out for ${targetUrl.hostname}`));
    });

    if (request.signal) {
      const abort = () => nodeRequest.destroy(createAbortError());

      if (request.signal.aborted) {
        abort();
        return;
      }

      request.signal.addEventListener('abort', abort, { once: true });
    }

    if (bodyBuffer) {
      nodeRequest.write(bodyBuffer);
    }

    nodeRequest.end();
  });
}
