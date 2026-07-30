/**
 * UTC date helpers for the date-parameterised providers.
 *
 * NASA GIBS names its daily composites by UTC date, and "today" is unsafe to request:
 * the global composite for the current UTC day may not be published yet, so the default
 * is always yesterday. Every function takes the clock as a parameter rather than calling
 * `Date.now()` so the resolution logic stays deterministic under test.
 */

/** `YYYY-MM-DD` in UTC. */
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The most recent UTC date a daily global composite can be expected to exist for. */
export function yesterdayUTC(now: Date): string {
  return utcDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** Parses `YYYY-MM-DD` as UTC midnight; returns undefined for anything else.
 *  Rejects calendar-invalid dates that `Date` would silently roll over (2025-02-30). */
export function parseUtcDate(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return utcDateString(d) === s ? d : undefined;
}

/** Clamps a `YYYY-MM-DD` string into [start, end]. Invalid input falls back to `end`. */
export function clampDate(s: string, start: string, end: string): string {
  const d = parseUtcDate(s);
  if (!d) return end;
  if (s < start) return start;
  if (s > end) return end;
  return s;
}
