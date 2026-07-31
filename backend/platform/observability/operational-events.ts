import 'server-only';

type OperationalLevel = 'error' | 'info' | 'warn';
type SafeField = boolean | number | string | null;

const SAFE_NAME = /^[a-z][a-z0-9_.-]{0,79}$/;

function normalizeField(value: SafeField): SafeField {
  if (typeof value !== 'string') return value;
  return value.replace(/[\r\n\t]/g, ' ').slice(0, 160);
}

export function writeOperationalEvent(
  level: OperationalLevel,
  event: string,
  fields: Record<string, SafeField> = {},
): void {
  const safeEvent = SAFE_NAME.test(event) ? event : 'invalid_event_name';
  const safeFields = Object.fromEntries(
    Object.entries(fields)
      .filter(([name]) => SAFE_NAME.test(name))
      .slice(0, 20)
      .map(([name, value]) => [name, normalizeField(value)]),
  );
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event: safeEvent,
    ...safeFields,
  });

  if (level === 'error') console.error(payload);
  else if (level === 'warn') console.warn(payload);
  else console.info(payload);
}
