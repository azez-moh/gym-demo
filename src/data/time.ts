/** Riyadh local time helpers (UTC+3 all year, no daylight saving). Dates are 'YYYY-MM-DD'. Weeks start Sunday. */
export const RIYADH_OFFSET_MS = 3 * 3600_000;
export const DAY_MS = 86_400_000;

export interface LocalParts { date: string; hour: number; minute: number; second: number; dow: number; minuteOfDay: number }

const pad = (n: number) => String(n).padStart(2, '0');

export function localParts(ms: number): LocalParts {
  const d = new Date(ms + RIYADH_OFFSET_MS);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    hour, minute, second: d.getUTCSeconds(), dow: d.getUTCDay(), minuteOfDay: hour * 60 + minute,
  };
}

/** Epoch ms of a local date plus minutes from its midnight. */
export function msAt(date: string, minutes = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) - RIYADH_OFFSET_MS + minutes * 60_000;
}

export function addDays(date: string, n: number): string {
  return localParts(msAt(date, 12 * 60) + n * DAY_MS).date;
}

export function dowOf(date: string): number {
  return localParts(msAt(date, 12 * 60)).dow;
}

/** Inclusive list of dates from `from` to `to`. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "HH:MM" from minutes of day (wraps past midnight). */
export function hhmm(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}
