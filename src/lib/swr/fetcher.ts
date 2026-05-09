export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string' && payload.error.trim().length > 0
        ? payload.error
        : `Request failed with status ${response.status}.`,
    );
  }

  return payload;
}
