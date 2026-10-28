import type { Alert, Club, ClubLive, DemoContextValue, Level } from '../../data';
import { addDays, alertsIn, arrivalsByHour, dateRange, energyDay, machineSessions, openMinutes, TARIFF_SAR_PER_KWH, localParts } from '../../data';
import { machineLiveAt, peopleInAt, peopleTodayAt } from '../../data/dynamics';

/*
  Local, page-only derivations for the network-wide view (Overview) and the club cards (Branches).
  Everything is computed from the shared generators, so the numbers match the other pages for the same scope.
*/

export type Period = 'now' | 'today' | 'week';
export const PERIODS: Period[] = ['now', 'today', 'week'];

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export const LEVEL_RANK: Record<Level, number> = { critical: 0, warning: 1, info: 2 };

/** Alerts sorted by severity, then by how long they have been open (longest first). */
export function sortAlerts(list: Alert[]): Alert[] {
  return [...list].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || a.sinceMs - b.sinceMs);
}

/** Visits (arrivals) of a club on a date, up to a minute of the day. */
export function visitsUpTo(club: Club, date: string, uptoMin = 1440): number {
  const a = arrivalsByHour(club, date);
  let n = 0;
  for (let h = 0; h < 24; h++) {
    const f = Math.max(0, Math.min(1, (uptoMin - h * 60) / 60));
    n += a[h] * f;
  }
  return n;
}

/** Share of machine time in use over a set of dates (today truncated at nowMin). Returns used and available minutes. */
export function machineUseOver(d: DemoContextValue, club: Club, dates: string[], today: string, nowMin: number): { used: number; open: number } {
  const ms = d.machines.filter((m) => m.clubId === club.id && m.enabled);
  let used = 0;
  let open = 0;
  for (const date of dates) {
    const upto = date === today ? nowMin : 1440;
    open += openMinutes(club, date, upto) * ms.length;
    for (const m of ms) {
      for (const s of machineSessions(m, club, date)) {
        if (s.start >= upto) break;
        used += Math.min(s.end, upto) - s.start;
      }
    }
  }
  return { used, open };
}

/** Hour (0..23) with the most arrivals for a club on a date. */
export function peakHourOf(club: Club, date: string): number {
  const a = arrivalsByHour(club, date);
  return a.indexOf(Math.max(...a));
}

/** Estimated share of capacity in the club during a two-hour slot starting at `h` (average stay 90 min). */
export function slotFullPct(club: Club, date: string, h: number): number {
  const a = arrivalsByHour(club, date);
  const at = (x: number) => (a[x] ?? 0) + 0.5 * (a[x - 1] ?? 0);
  const people = (at(h) + at(h + 1)) / 2;
  return Math.min(100, Math.round((people / club.capacity) * 100));
}

export const SLOT_HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];

export interface ClubRow {
  club: Club;
  live: ClubLive;
  pctFull: number;
  peopleIn: number;
  peopleToday: number;
  visits7: number;
  /** Machine use for the selected period, in percent. */
  machinePct: number;
  energyTodayKwh: number;
  savedTodayPct: number;
  energyMonthKwh: number;
  savedMonthKwh: number;
  savedMonthPct: number;
  savedMonthSar: number;
  energyWeekKwh: number;
  savedWeekPct: number;
  alerts: Alert[];
  critical: number;
  peakHour: number;
}

const monthCache = new Map<string, { kwh: number; base: number }>();

/** This month's energy for a club up to now. Past days are cached by date. */
function monthEnergy(club: Club, today: string, nowMin: number) {
  const start = `${today.slice(0, 8)}01`;
  const key = `${club.id}|${today}`;
  let past = monthCache.get(key);
  if (!past) {
    let kwh = 0, base = 0;
    for (const date of dateRange(start, addDays(today, -1)).filter((x) => x < today)) {
      const e = energyDay(club, date);
      kwh += e.kwh; base += e.baselineKwh;
    }
    past = { kwh, base };
    monthCache.set(key, past);
  }
  const t = energyDay(club, today, nowMin);
  return { kwh: past.kwh + t.kwh, base: past.base + t.baselineKwh };
}

function weekEnergy(club: Club, today: string, nowMin: number) {
  let kwh = 0, base = 0;
  for (const date of dateRange(addDays(today, -6), today)) {
    const e = energyDay(club, date, date === today ? nowMin : 1440);
    kwh += e.kwh; base += e.baselineKwh;
  }
  return { kwh, base };
}

const pct1 = (saved: number, base: number) => (base > 0 ? Math.round((Math.max(0, saved) / base) * 1000) / 10 : 0);

export function clubRows(d: DemoContextValue, clubs: Club[], period: Period): ClubRow[] {
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const weekDates = dateRange(addDays(today, -6), today);
  const all = alertsIn(d, clubs);
  return clubs.map((club) => {
    const live = d.live.clubs[club.id];
    let machinePct = live?.machineUsagePct ?? 0;
    if (period !== 'now') {
      const u = machineUseOver(d, club, period === 'today' ? [today] : weekDates, today, nowMin);
      machinePct = u.open ? Math.round((u.used / u.open) * 100) : 0;
    }
    const m = monthEnergy(club, today, nowMin);
    const w = weekEnergy(club, today, nowMin);
    const alerts = all.filter((a) => a.clubId === club.id);
    const savedMonthKwh = Math.max(0, m.base - m.kwh);
    return {
      club,
      live,
      peopleIn: live?.peopleIn ?? 0,
      pctFull: club.capacity ? Math.round(((live?.peopleIn ?? 0) / club.capacity) * 100) : 0,
      peopleToday: live?.peopleToday ?? 0,
      visits7: Math.round(weekDates.reduce((a, date) => a + visitsUpTo(club, date, date === today ? nowMin : 1440), 0)),
      machinePct,
      energyTodayKwh: live?.energyTodayKwh ?? 0,
      savedTodayPct: pct1((live?.baselineTodayKwh ?? 0) - (live?.energyTodayKwh ?? 0), live?.baselineTodayKwh ?? 0),
      energyMonthKwh: m.kwh,
      savedMonthKwh,
      savedMonthPct: pct1(savedMonthKwh, m.base),
      savedMonthSar: Math.round(savedMonthKwh * TARIFF_SAR_PER_KWH),
      energyWeekKwh: w.kwh,
      savedWeekPct: pct1(w.base - w.kwh, w.base),
      alerts: sortAlerts(alerts),
      critical: alerts.filter((a) => a.level === 'critical').length,
      peakHour: peakHourOf(club, today),
    };
  });
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export { mean };

/** People comparison base: same hour (or same part of the day) one week earlier. */
export function peopleLastWeek(d: DemoContextValue, clubs: Club[], period: Period): { now: number; before: number } {
  const ms = d.live.nowMs;
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  if (period === 'now') {
    return { now: clubs.reduce((a, c) => a + (d.live.clubs[c.id]?.peopleIn ?? 0), 0), before: clubs.reduce((a, c) => a + peopleInAt(c, ms - WEEK), 0) };
  }
  if (period === 'today') {
    return { now: clubs.reduce((a, c) => a + (d.live.clubs[c.id]?.peopleToday ?? 0), 0), before: clubs.reduce((a, c) => a + peopleTodayAt(c, ms - WEEK), 0) };
  }
  const sumWeek = (end: string) => clubs.reduce((a, c) => a + dateRange(addDays(end, -6), end)
    .reduce((x, date) => x + visitsUpTo(c, date, date === end ? nowMin : 1440), 0), 0);
  return { now: sumWeek(today), before: sumWeek(addDays(today, -7)) };
}

const baseCache = new Map<string, number>();

/** Machine use over the last four weeks for comparison (percent, mean across clubs). */
export function machineBaseline(d: DemoContextValue, clubs: Club[], period: Period): number {
  const ms = d.live.nowMs;
  const today = d.live.date;
  const key = `${period}|${today}|${period === 'now' ? `${d.live.hour}:${Math.floor(d.live.minute / 10)}` : ''}|${clubs.map((c) => c.id).join(',')}`;
  const hit = baseCache.get(key);
  if (hit !== undefined) return hit;
  let out: number;
  if (period === 'now') {
    out = mean(clubs.map((c) => {
      const machines = d.machines.filter((m) => m.clubId === c.id && m.enabled);
      if (!machines.length) return 0;
      let inUse = 0;
      for (let k = 1; k <= 4; k++) for (const m of machines) if (machineLiveAt(m, c, ms - k * WEEK).state === 'inUse') inUse++;
      return (inUse / (machines.length * 4)) * 100;
    }));
  } else {
    const start = period === 'today' ? addDays(today, -28) : addDays(today, -34);
    const dates = dateRange(start, addDays(start, 27));
    out = mean(clubs.map((c) => { const u = machineUseOver(d, c, dates, today, 1440); return u.open ? (u.used / u.open) * 100 : 0; }));
  }
  baseCache.set(key, out);
  return out;
}

/** Daily SAR saved over the last `days` days for a set of clubs (for the savings sparkline). */
export function dailySavingsSar(clubs: Club[], today: string, nowMin: number, days: number): number[] {
  return dateRange(addDays(today, -(days - 1)), today).map((date) => {
    let saved = 0;
    for (const c of clubs) { const e = energyDay(c, date, date === today ? nowMin : 1440); saved += Math.max(0, e.baselineKwh - e.kwh); }
    return Math.round(saved * TARIFF_SAR_PER_KWH);
  });
}

/** Year-to-date SAR saved (past days cached). */
const ytdCache = new Map<string, number>();
export function ytdSavingsSar(clubs: Club[], today: string, nowMin: number): number {
  const key = `${today}|${clubs.map((c) => c.id).join(',')}`;
  let past = ytdCache.get(key);
  if (past === undefined) {
    past = 0;
    for (const date of dateRange(`${today.slice(0, 5)}01-01`, addDays(today, -1))) {
      for (const c of clubs) { const e = energyDay(c, date); past += Math.max(0, e.baselineKwh - e.kwh); }
    }
    ytdCache.set(key, past);
  }
  let t = 0;
  for (const c of clubs) { const e = energyDay(c, today, nowMin); t += Math.max(0, e.baselineKwh - e.kwh); }
  return Math.round((past + t) * TARIFF_SAR_PER_KWH);
}

export { localParts };
