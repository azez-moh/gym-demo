import type {
  AcLive, AcUnit, ActivityEntry, Alert, Area, Camera, Club, ClubLive, DemoContextValue, LightCircuit, LightLive, Machine,
  MachineLive, MachineType, RegionId, Scope, Session, Zone, ZoneReading,
} from './types';
import { LIVE_CLUB_ID, TARIFF_SAR_PER_KWH } from './clubs';
import { busyWeight, energyDay, energyHours, machineSessions, arrivalsByHour, isOpenAt } from './dynamics';
import { addDays, dateRange, dowOf } from './time';

/*
  Pure selectors: (data, scope or club, ...) => result. Pages call these instead of computing their own
  totals, so every page shows the same number for the same scope. `data` is useDemo().
*/

type D = Pick<DemoContextValue, 'clubs' | 'districts' | 'machines' | 'cameras' | 'zones' | 'areas' | 'acUnits' | 'lights' | 'live' | 'agents' | 'agentStates' | 'integrations' | 'boards'>;

// ---------- scope ----------

export function clubsInScope(d: Pick<D, 'clubs'>, scope: Scope): Club[] {
  switch (scope.level) {
    case 'all': return d.clubs;
    case 'region': return d.clubs.filter((c) => c.region === scope.region);
    case 'district': return d.clubs.filter((c) => c.district === scope.district);
    case 'club': return d.clubs.filter((c) => c.id === scope.clubId);
  }
}

/**
 * The one building that BMS Core and AI Vision pages show. A club scope gives that club; a wider scope
 * gives Hittin Men (the live club) when it is inside the scope, otherwise the first club in scope.
 */
export function focusClub(d: Pick<D, 'clubs'>, scope: Scope): Club {
  const list = clubsInScope(d, scope);
  return list.find((c) => c.id === LIVE_CLUB_ID) ?? list[0] ?? d.clubs[0];
}

export function clubById(d: Pick<D, 'clubs'>, id: string): Club | undefined {
  return d.clubs.find((c) => c.id === id);
}

export function regionsOf(d: Pick<D, 'clubs'>): RegionId[] {
  return [...new Set(d.clubs.map((c) => c.region))];
}

// ---------- network and club KPIs ----------

export interface Totals {
  clubs: number;
  peopleIn: number;
  peopleToday: number;
  capacity: number;
  occupancyPct: number;
  machines: number;
  machinesInUse: number;
  machineUsagePct: number;
  sessionsToday: number;
  energyTodayKwh: number;
  baselineTodayKwh: number;
  savedTodayKwh: number;
  savedTodayPct: number;
  savedTodaySar: number;
  openAlerts: number;
  criticalAlerts: number;
  comfortPct: number;
  clubsOpen: number;
}

export function totals(d: D, clubs: Club[]): Totals {
  const lives = clubs.map((c) => d.live.clubs[c.id]).filter(Boolean) as ClubLive[];
  const sum = (f: (l: ClubLive) => number) => lives.reduce((a, l) => a + f(l), 0);
  const capacity = clubs.reduce((a, c) => a + c.capacity, 0);
  const machines = clubs.reduce((a, c) => a + c.machines, 0);
  const energy = sum((l) => l.energyTodayKwh);
  const baseline = sum((l) => l.baselineTodayKwh);
  const saved = Math.max(0, baseline - energy);
  const peopleIn = sum((l) => l.peopleIn);
  const inUse = sum((l) => l.machinesInUse);
  return {
    clubs: clubs.length,
    peopleIn,
    peopleToday: sum((l) => l.peopleToday),
    capacity,
    occupancyPct: capacity ? Math.round((peopleIn / capacity) * 100) : 0,
    machines,
    machinesInUse: inUse,
    machineUsagePct: machines ? Math.round((inUse / machines) * 100) : 0,
    sessionsToday: sum((l) => l.sessionsToday),
    energyTodayKwh: energy,
    baselineTodayKwh: baseline,
    savedTodayKwh: saved,
    savedTodayPct: baseline ? Math.round((saved / baseline) * 1000) / 10 : 0,
    savedTodaySar: Math.round(saved * TARIFF_SAR_PER_KWH),
    openAlerts: sum((l) => l.openAlerts),
    criticalAlerts: sum((l) => l.criticalAlerts),
    comfortPct: lives.length ? Math.round(sum((l) => l.comfortPct) / lives.length) : 0,
    clubsOpen: lives.filter((l) => l.isOpen).length,
  };
}

export function scopeTotals(d: D, scope: Scope): Totals {
  return totals(d, clubsInScope(d, scope));
}

export function clubLive(d: Pick<D, 'live'>, clubId: string): ClubLive | undefined {
  return d.live.clubs[clubId];
}

// ---------- alerts and activity ----------

export function alertsIn(d: D, clubs: Club[], opts?: { includeResolved?: boolean }): Alert[] {
  const ids = new Set(clubs.map((c) => c.id));
  return d.live.alerts.filter((a) => ids.has(a.clubId) && (opts?.includeResolved || a.status !== 'resolved'));
}

export function activityIn(d: D, clubs: Club[], limit = 50): ActivityEntry[] {
  const ids = new Set(clubs.map((c) => c.id));
  return d.live.activity.filter((a) => ids.has(a.clubId)).slice(0, limit);
}

// ---------- AI Vision ----------

export interface MachineRow extends Machine { live: MachineLive }

export function machinesOf(d: D, clubId: string): MachineRow[] {
  return d.machines.filter((m) => m.clubId === clubId).map((m) => ({
    ...m, live: d.live.machines[m.id] ?? { id: m.id, state: 'idle', sessionsToday: 0, usedMinToday: 0, sinceMin: 0 },
  }));
}

export interface TypeRow { type: MachineType; machines: number; inUse: number; sessionsToday: number; usedMinToday: number }

export function machinesByType(d: D, clubId: string): TypeRow[] {
  const map = new Map<MachineType, TypeRow>();
  for (const m of machinesOf(d, clubId)) {
    const r = map.get(m.type) ?? { type: m.type, machines: 0, inUse: 0, sessionsToday: 0, usedMinToday: 0 };
    r.machines++;
    if (m.live.state === 'inUse') r.inUse++;
    r.sessionsToday += m.live.sessionsToday;
    r.usedMinToday += m.live.usedMinToday;
    map.set(m.type, r);
  }
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type));
}

export function camerasOf(d: D, clubId: string): (Camera & { zones: number })[] {
  return d.cameras.filter((c) => c.clubId === clubId).map((c) => ({ ...c, zones: d.zones.filter((z) => z.cameraId === c.id).length }));
}

export interface ZoneRow extends Zone { reading: ZoneReading; machine?: Machine }

export function zonesOf(d: D, clubId: string, cameraId?: string): ZoneRow[] {
  const mById = new Map(d.machines.map((m) => [m.id, m]));
  return d.zones
    .filter((z) => z.clubId === clubId && (!cameraId || z.cameraId === cameraId))
    .map((z) => ({ ...z, reading: d.live.zones[z.id] ?? { id: z.id, motionPct: 0, baselinePct: 0, active: false }, machine: mById.get(z.machineId) }));
}

// ---------- usage history (4 weeks back, Usage Report) ----------

export const HISTORY_DAYS = 28;

export interface MachineUsage {
  machineId: string;
  sessions: number;
  usedMin: number;
  openMin: number;
  idleMin: number;
  utilisationPct: number;
  avgSessionMin: number;
  firstUse?: number;
  lastUse?: number;
}

/** Minutes the club is open on a date, up to `uptoMinute` (for today). */
export function openMinutes(club: Club, date: string, uptoMinute = 1440): number {
  let n = 0;
  for (let m = 0; m < uptoMinute; m += 5) if (isOpenAt(club, date, m)) n += 5;
  return n;
}

/** Sessions of one machine on a date, truncated at `uptoMinute` when given (today). */
export function sessionsOn(machine: Machine, club: Club, date: string, uptoMinute?: number): Session[] {
  const ss = machineSessions(machine, club, date);
  if (uptoMinute == null) return ss;
  return ss.filter((s) => s.start < uptoMinute).map((s) => ({ start: s.start, end: Math.min(s.end, uptoMinute) }));
}

/** Per-machine usage over [from, to] (inclusive dates). `today` is truncated at the live clock. */
export function usageReport(d: D, clubId: string, from: string, to: string, types?: MachineType[]): MachineUsage[] {
  const club = d.clubs.find((c) => c.id === clubId)!;
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const dates = dateRange(from, to).filter((x) => x <= today);
  return d.machines
    .filter((m) => m.clubId === clubId && m.enabled && (!types || types.includes(m.type)))
    .map((m) => {
      let sessions = 0, usedMin = 0, openMin = 0;
      let firstUse: number | undefined;
      let lastUse: number | undefined;
      for (const date of dates) {
        const upto = date === today ? nowMin : undefined;
        const ss = sessionsOn(m, club, date, upto);
        openMin += openMinutes(club, date, upto ?? 1440);
        for (const s of ss) {
          sessions++;
          usedMin += s.end - s.start;
          if (date === dates[dates.length - 1]) {
            firstUse = firstUse ?? s.start;
            lastUse = s.end;
          }
        }
      }
      const idleMin = Math.max(0, openMin - usedMin);
      return {
        machineId: m.id, sessions, usedMin: Math.round(usedMin), openMin, idleMin: Math.round(idleMin),
        utilisationPct: openMin ? Math.round((usedMin / openMin) * 1000) / 10 : 0,
        avgSessionMin: sessions ? Math.round((usedMin / sessions) * 10) / 10 : 0,
        firstUse, lastUse,
      };
    });
}

/** Summed machine use per hour of day (0..23) over a date range: minutes of use falling in each hour / 60. */
export function peakHours(d: D, clubId: string, from: string, to: string, types?: MachineType[]): number[] {
  const club = d.clubs.find((c) => c.id === clubId)!;
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const out = new Array(24).fill(0);
  for (const date of dateRange(from, to).filter((x) => x <= today)) {
    for (const m of d.machines.filter((x) => x.clubId === clubId && x.enabled && (!types || types.includes(x.type)))) {
      for (const s of sessionsOn(m, club, date, date === today ? nowMin : undefined)) {
        for (let t = Math.floor(s.start); t < s.end; t++) out[Math.floor((t % 1440) / 60)] += 1 / 60;
      }
    }
  }
  return out.map((x) => Math.round(x * 10) / 10);
}

// ---------- usage by machine type (complete days; the recommendations and the gym comparison) ----------

export interface TypeUsage {
  type: MachineType;
  /** Units in service. */
  units: number;
  sessions: number;
  usedMin: number;
  openMin: number;
  /** Share of open time in use, percent (same measure as the Usage Report). */
  utilPct: number;
  /** Share of evening peak minutes (5 PM to 9 PM) with every unit of the type in use, percent. */
  peakFullPct: number;
  /** Hours of use in the window, all units. */
  usedHours: number;
}

/** Evening peak window used for "full at peak" (minutes from midnight). */
export const PEAK_FROM_MIN = 17 * 60;
export const PEAK_TO_MIN = 21 * 60;

const openMinCache = new Map<string, number>();
function openMinCached(club: Club, date: string): number {
  const k = `${club.id}|${date}`;
  let v = openMinCache.get(k);
  if (v === undefined) { v = openMinutes(club, date); openMinCache.set(k, v); }
  return v;
}

const typeUsageCache = new Map<string, TypeUsage[]>();

/**
 * Usage by machine type for one gym over [from, to] (inclusive, complete days only: pass dates before today).
 * Uses the same sessions as the Usage Report, so the numbers agree with it for the same dates.
 */
export function typeUsage(d: Pick<D, 'machines'>, club: Club, from: string, to: string): TypeUsage[] {
  const ms = d.machines.filter((m) => m.clubId === club.id && m.enabled);
  const key = `${club.id}|${from}|${to}|${ms.map((m) => `${m.id}:${m.baseSessions}`).join(',')}`;
  const hit = typeUsageCache.get(key);
  if (hit) return hit;
  const dates = dateRange(from, to);
  const byType = new Map<MachineType, Machine[]>();
  for (const m of ms) byType.set(m.type, [...(byType.get(m.type) ?? []), m]);
  const span = PEAK_TO_MIN - PEAK_FROM_MIN;
  const out: TypeUsage[] = [];
  for (const [type, list] of byType) {
    let sessions = 0, usedMin = 0, openMin = 0, peakFull = 0, peakOpen = 0;
    for (const date of dates) {
      const om = openMinCached(club, date);
      openMin += om * list.length;
      const busy = new Int16Array(span);
      for (const m of list) {
        for (const s of machineSessions(m, club, date)) {
          sessions++;
          usedMin += s.end - s.start;
          const a = Math.max(PEAK_FROM_MIN, Math.floor(s.start));
          const b = Math.min(PEAK_TO_MIN, Math.ceil(s.end));
          for (let t = a; t < b; t++) busy[t - PEAK_FROM_MIN]++;
        }
      }
      if (isOpenAt(club, date, PEAK_FROM_MIN)) {
        peakOpen += span;
        for (let i = 0; i < span; i++) if (busy[i] >= list.length) peakFull++;
      }
    }
    out.push({
      type, units: list.length, sessions, usedMin: Math.round(usedMin), openMin,
      utilPct: openMin ? Math.round((usedMin / openMin) * 1000) / 10 : 0,
      peakFullPct: peakOpen ? Math.round((peakFull / peakOpen) * 1000) / 10 : 0,
      usedHours: Math.round(usedMin / 60),
    });
  }
  out.sort((a, b) => a.type.localeCompare(b.type));
  typeUsageCache.set(key, out);
  return out;
}

// ---------- busy heatmap and people ----------

/** Arrivals by club and hour for one date (heatmap rows). */
export function busyByHour(clubs: Club[], date: string): { clubId: string; values: number[] }[] {
  return clubs.map((c) => ({ clubId: c.id, values: arrivalsByHour(c, date).map((x) => Math.round(x)) }));
}

/** Busiest hour (0..23) across clubs on a date. */
export function busiestHour(clubs: Club[], date: string): number {
  const sum = new Array(24).fill(0);
  for (const c of clubs) arrivalsByHour(c, date).forEach((v, h) => { sum[h] += v; });
  return sum.indexOf(Math.max(...sum));
}

export { busyWeight };

// ---------- energy (SAR at the commercial tariff) ----------

export interface EnergyDayRow { date: string; kwh: number; baselineKwh: number; savedKwh: number; savedSar: number }

export function energyHistory(d: Pick<D, 'live'>, clubs: Club[], days: number): EnergyDayRow[] {
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  return dateRange(addDays(today, -(days - 1)), today).map((date) => {
    let kwh = 0, base = 0;
    for (const c of clubs) {
      const e = energyDay(c, date, date === today ? nowMin : 1440);
      kwh += e.kwh;
      base += e.baselineKwh;
    }
    const saved = Math.max(0, base - kwh);
    return { date, kwh: Math.round(kwh), baselineKwh: Math.round(base), savedKwh: Math.round(saved), savedSar: Math.round(saved * TARIFF_SAR_PER_KWH) };
  });
}

/** Today's hourly energy (consumed and avoided) summed over clubs. */
export function energyToday(d: Pick<D, 'live'>, clubs: Club[]): { hour: number; kwh: number; avoidedKwh: number }[] {
  const today = d.live.date;
  return Array.from({ length: 24 }, (_, h) => {
    let kwh = 0, base = 0;
    if (h <= d.live.hour) for (const c of clubs) { const e = energyHours(c, today)[h]; kwh += e.kwh; base += e.baselineKwh; }
    return { hour: h, kwh: Math.round(kwh * 10) / 10, avoidedKwh: Math.round(Math.max(0, base - kwh) * 10) / 10 };
  });
}

/** Month to date, year to date savings in kWh and SAR. */
export function savingsSummary(d: Pick<D, 'live'>, clubs: Club[]) {
  const today = d.live.date;
  const monthStart = `${today.slice(0, 8)}01`;
  const yearStart = `${today.slice(0, 5)}01-01`;
  const sumRange = (from: string) => {
    let kwh = 0, base = 0;
    const nowMin = d.live.hour * 60 + d.live.minute;
    for (const date of dateRange(from, today)) for (const c of clubs) { const e = energyDay(c, date, date === today ? nowMin : 1440); kwh += e.kwh; base += e.baselineKwh; }
    const saved = Math.max(0, base - kwh);
    return { kwh: Math.round(kwh), baselineKwh: Math.round(base), savedKwh: Math.round(saved), savedPct: base ? Math.round((saved / base) * 1000) / 10 : 0, savedSar: Math.round(saved * TARIFF_SAR_PER_KWH) };
  };
  return { month: sumRange(monthStart), year: sumRange(yearStart), tariffSarPerKwh: TARIFF_SAR_PER_KWH };
}

// ---------- BMS ----------

export interface AcRow extends AcUnit { live: AcLive; area?: Area }
export interface LightRow extends LightCircuit { live: LightLive; area?: Area }

export function acOf(d: D, clubId: string): AcRow[] {
  const aById = new Map(d.areas.map((a) => [a.id, a]));
  return d.acUnits.filter((u) => u.clubId === clubId).map((u) => ({ ...u, live: d.live.ac[u.id], area: aById.get(u.areaId) }));
}

export function lightsOf(d: D, clubId: string): LightRow[] {
  const aById = new Map(d.areas.map((a) => [a.id, a]));
  return d.lights.filter((l) => l.clubId === clubId).map((l) => ({ ...l, live: d.live.lights[l.id], area: aById.get(l.areaId) }));
}

export function areasOf(d: D, clubId: string): Area[] {
  return d.areas.filter((a) => a.clubId === clubId);
}

/** Estimated people per area now (club people in x area share). */
export function presenceOf(d: D, clubId: string): { area: Area; people: number }[] {
  const n = d.live.clubs[clubId]?.peopleIn ?? 0;
  return areasOf(d, clubId).map((area) => ({ area, people: Math.round(n * area.share) }));
}

export function agentsOf(d: D, clubId: string) {
  return d.agents.map((a) => ({ ...a, state: d.agentStates.find((s) => s.clubId === clubId && s.agentId === a.id)! }));
}

export function integrationsOf(d: D, clubId: string) {
  return d.integrations.filter((i) => i.clubId === clubId);
}

export function boardsOf(d: D, clubId: string) {
  return d.boards.filter((b) => b.clubId === clubId);
}

/** Day of week (0 = Sunday) of a date, re-exported for pages. */
export { dowOf, addDays, dateRange };
