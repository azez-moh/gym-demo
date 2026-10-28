import type { Camera, Club, DemoContextValue, LibraryModel, Machine, MachineType, Session } from '../../../data';
import { dateRange, isOpenAt, openMinutes, sessionsOn } from '../../../data';

/*
  Usage maths shared by Machines and Devices, Reports and Usage Report. Everything derives from the
  shared selectors (sessionsOn, openMinutes) so the three pages show the same figure for the same machine.
*/

export type D = DemoContextValue;

/** Family display order used when nothing else orders the list. */
export const TYPE_ORDER: MachineType[] = [
  'slat-treadmill', 'treadmill', 'incline-treadmill', 'elliptical', 'adaptive-cross-trainer', 'indoor-bike', 'recumbent-bike',
  'stair-climber', 'rower', 'upper-body-ergometer', 'flat-bench', 'incline-bench', 'preacher-curl', 'standing-preacher',
];

export const nowMinute = (d: Pick<D, 'live'>) => d.live.hour * 60 + d.live.minute;

/** Share of open time a machine's camera actually reported (1 = observed, 0 = no reading). */
export function coverageOf(m: Machine, cams: Map<string, Camera>): number {
  const cam = cams.get(m.cameraId);
  if (!cam || !cam.online) return 0;
  if (cam.kind === 'fisheye') return 1;
  // NVR channels drop frames now and then: a stable, machine-specific partial coverage.
  let h = 0;
  for (const ch of m.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.78 + (h % 90) / 1000;
}

export type CoverageKind = 'observed' | 'partial' | 'none';
export const coverageKind = (c: number): CoverageKind => (c >= 0.999 ? 'observed' : c <= 0.001 ? 'none' : 'partial');

export interface TodayUsage {
  sessions: number;
  usedMin: number;
  idleMin: number;
  openMin: number;
  utilPct: number;
  /** Minutes of use in each hour 0..23 today. */
  hourly: number[];
  /** Hours the club is open today. */
  openHours: boolean[];
}

/** Today's usage of one machine up to the live clock (same source as the live state). */
export function todayUsage(d: D, m: Machine, club: Club): TodayUsage {
  const today = d.live.date;
  const now = nowMinute(d);
  const live = d.live.machines[m.id];
  const ss = sessionsOn(m, club, today, now);
  const hourly = minutesPerHour(ss);
  const openMin = openMinutes(club, today, now);
  const usedMin = live?.usedMinToday ?? Math.round(ss.reduce((a, s) => a + s.end - s.start, 0));
  const idleMin = Math.max(0, openMin - usedMin);
  return {
    sessions: live?.sessionsToday ?? ss.length,
    usedMin, idleMin, openMin,
    utilPct: usedMin + idleMin > 0 ? (usedMin / (usedMin + idleMin)) * 100 : 0,
    hourly,
    openHours: openHoursOf(club, today),
  };
}

export function minutesPerHour(ss: Session[]): number[] {
  const out = new Array(24).fill(0);
  for (const s of ss) {
    for (let t = s.start; t < s.end;) {
      const h = Math.floor(t / 60);
      const end = Math.min(s.end, (h + 1) * 60);
      out[h % 24] += end - t;
      t = end;
    }
  }
  return out;
}

export function openHoursOf(club: Club, date: string): boolean[] {
  return Array.from({ length: 24 }, (_, h) => isOpenAt(club, date, h * 60 + 30) || isOpenAt(club, date, h * 60));
}

/** Library models the detector may use: approved and active. */
export function usableTypes(lib: LibraryModel[]): Set<string> {
  return new Set(lib.filter((l) => l.approved && l.active).map((l) => l.id));
}

// ---------- Usage Report ----------

export interface ReportFilter {
  from: string;
  to: string;
  type: MachineType | 'all';
  mergeSec: number;
  includeTest: boolean;
}

export interface ResetRecord { from: string; to: string; atMs: number; byName: string; byRole: string; machines: number }

export interface MachineReport {
  machine: Machine;
  sessions: number;
  usedMin: number;
  idleMin: number;
  unknownMin: number;
  openMin: number;
  utilPct: number;
  avgSessionMin: number;
  avgGapMin: number;
  coverage: number;
  coverageKind: CoverageKind;
  first?: { date: string; min: number };
  last?: { date: string; min: number };
  /** Idle minutes from opening to the first use on the first day with use. */
  gapBeforeMin?: number;
  /** Used minutes per bucket (per day, or per hour for a one-day period). */
  buckets: number[];
}

export interface FamilyReport {
  type: MachineType;
  machines: number;
  sessions: number;
  usedMin: number;
  idleMin: number;
  unknownMin: number;
  utilPct: number;
  avgInUse: number;
  capacityPct: number;
  coveragePct: number;
  buckets: number[];
}

export interface Report {
  dates: string[];
  hourlyBuckets: boolean;
  bucketLabels: string[];
  /** Open minutes of one machine slot per bucket (the denominator for bucket shares). */
  bucketOpen: number[];
  rows: MachineReport[];
  families: FamilyReport[];
  peak: number[];
  closedHours: boolean[];
  totals: { sessions: number; usedMin: number; idleMin: number; unknownMin: number; utilPct: number; carriedIn: number };
  openMin: number;
  excludedInactive: number;
  resetDates: number;
}

function mergeSessions(ss: Session[], gapMin: number): Session[] {
  const out: Session[] = [];
  for (const s of ss) {
    const prev = out[out.length - 1];
    if (prev && s.start - prev.end <= gapMin) prev.end = Math.max(prev.end, s.end);
    else out.push({ ...s });
  }
  return out;
}

export function buildReport(d: D, club: Club, f: ReportFilter, resets: ResetRecord[]): Report {
  const today = d.live.date;
  const now = nowMinute(d);
  const resetSet = new Set<string>();
  for (const r of resets) for (const x of dateRange(r.from, r.to)) resetSet.add(x);
  const all = dateRange(f.from, f.to).filter((x) => x <= today);
  const dates = all.filter((x) => !resetSet.has(x));
  const cams = new Map(d.cameras.map((c) => [c.id, c]));
  const usable = usableTypes(d.library);
  const clubMachines = d.machines.filter((m) => m.clubId === club.id && m.enabled && (f.type === 'all' || m.type === f.type));
  const machines = clubMachines.filter((m) => usable.has(m.type) && (f.includeTest || !cams.get(m.cameraId)?.isTest));
  const hourlyBuckets = all.length === 1;
  const openPerDate = new Map(dates.map((x) => [x, openMinutes(club, x, x === today ? now : 1440)]));
  const openMin = dates.reduce((a, x) => a + (openPerDate.get(x) ?? 0), 0);
  const closedHours = new Array(24).fill(true);
  for (const x of all) openHoursOf(club, x).forEach((o, h) => { if (o) closedHours[h] = false; });

  const bucketLabels = hourlyBuckets ? Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')) : all;
  const bucketOpen = hourlyBuckets
    ? Array.from({ length: 24 }, (_, h) => {
      if (!dates.length) return 0;
      let n = 0;
      const limit = dates[0] === today ? now : 1440;
      for (let m = h * 60; m < (h + 1) * 60 && m < limit; m += 5) if (isOpenAt(club, dates[0], m)) n += 5;
      return n;
    })
    : all.map((x) => openPerDate.get(x) ?? 0);

  const peak = new Array(24).fill(0);
  const gap = Math.max(0, f.mergeSec) / 60;
  const rows: MachineReport[] = machines.map((m) => {
    const coverage = coverageOf(m, cams);
    let sessions = 0, usedMin = 0, gapSum = 0, gapN = 0;
    let first: MachineReport['first'];
    let last: MachineReport['last'];
    let gapBeforeMin: number | undefined;
    const buckets = new Array(bucketLabels.length).fill(0);
    for (const x of dates) {
      const ss = coverage > 0 ? mergeSessions(sessionsOn(m, club, x, x === today ? now : undefined), gap) : [];
      const hours = minutesPerHour(ss);
      hours.forEach((v, h) => { peak[h] += v; });
      if (hourlyBuckets) hours.forEach((v, h) => { buckets[h] += v; });
      else buckets[all.indexOf(x)] += ss.reduce((a, s) => a + s.end - s.start, 0);
      ss.forEach((s, i) => {
        sessions++;
        usedMin += s.end - s.start;
        if (i > 0) { gapSum += s.start - ss[i - 1].end; gapN++; }
        if (!first) {
          first = { date: x, min: s.start };
          let openAt = 0;
          while (openAt < 1440 && !isOpenAt(club, x, openAt)) openAt += 5;
          gapBeforeMin = Math.max(0, s.start - openAt);
        }
        last = { date: x, min: s.end };
      });
    }
    const unknownMin = openMin * (1 - coverage);
    const idleMin = Math.max(0, openMin - usedMin - unknownMin);
    return {
      machine: m, sessions, usedMin, idleMin, unknownMin, openMin,
      utilPct: usedMin + idleMin > 0 ? (usedMin / (usedMin + idleMin)) * 100 : 0,
      avgSessionMin: sessions ? usedMin / sessions : 0,
      avgGapMin: gapN ? gapSum / gapN : 0,
      coverage, coverageKind: coverageKind(coverage), first, last, gapBeforeMin, buckets,
    };
  });

  const famMap = new Map<MachineType, FamilyReport>();
  for (const r of rows) {
    const t = r.machine.type;
    const fr = famMap.get(t) ?? { type: t, machines: 0, sessions: 0, usedMin: 0, idleMin: 0, unknownMin: 0, utilPct: 0, avgInUse: 0, capacityPct: 0, coveragePct: 0, buckets: new Array(bucketLabels.length).fill(0) };
    fr.machines++;
    fr.sessions += r.sessions;
    fr.usedMin += r.usedMin;
    fr.idleMin += r.idleMin;
    fr.unknownMin += r.unknownMin;
    r.buckets.forEach((v, i) => { fr.buckets[i] += v; });
    famMap.set(t, fr);
  }
  const families = [...famMap.values()].map((fr) => {
    const denom = fr.usedMin + fr.idleMin;
    const avgInUse = openMin ? fr.usedMin / openMin : 0;
    return {
      ...fr,
      utilPct: denom ? (fr.usedMin / denom) * 100 : 0,
      avgInUse,
      capacityPct: fr.machines ? (avgInUse / fr.machines) * 100 : 0,
      coveragePct: openMin && fr.machines ? (1 - fr.unknownMin / (openMin * fr.machines)) * 100 : 100,
    };
  });

  const sum = (k: 'sessions' | 'usedMin' | 'idleMin' | 'unknownMin') => rows.reduce((a, r) => a + r[k], 0);
  const used = sum('usedMin'), idle = sum('idleMin');
  return {
    dates, hourlyBuckets, bucketLabels, bucketOpen, rows, families,
    peak: peak.map((v) => Math.round((v / 60) * 10) / 10),
    closedHours,
    totals: { sessions: sum('sessions'), usedMin: used, idleMin: idle, unknownMin: sum('unknownMin'), utilPct: used + idle ? (used / (used + idle)) * 100 : 0, carriedIn: 0 },
    openMin,
    excludedInactive: clubMachines.length - clubMachines.filter((m) => usable.has(m.type)).length,
    resetDates: all.length - dates.length,
  };
}

/** Reset records kept in the store (patched under settings.usageResets). */
export function resetsOf(d: D): ResetRecord[] {
  const s = d.patches.set.settings?.usageResets as { list?: ResetRecord[] } | undefined;
  return s?.list ?? [];
}
