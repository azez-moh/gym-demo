import type { Club, DemoContextValue, Machine, MachineType } from '../../data';
import { addDays, arrivalsByHour, dateRange, energyDay, isOpenAt, typeUsage, TARIFF_SAR_PER_KWH, type TypeUsage } from '../../data';
import { MOVE_COST_SAR, PRICE_SAR, RESALE_SHARE, SERVICE_INTERVAL_H } from '../../data/fleet';
import { rngFor } from '../../data/rng';
import { slotFullPct, SLOT_HOURS } from './metrics';
import { branchConfig, branchSignature } from '../../data/branchConfig';

/*
  Recommended actions for the COO (pure functions over the demo store).
  Every number comes from the same generators as the rest of the app: machine use from the sessions behind
  the Usage Report (typeUsage), people from the arrivals behind the busy heatmap, energy from the meters.
  Windows: the last 28 complete days (yesterday back), and 8 weekly windows for confidence.
  Rules (thresholds are stated in the "i" of the section):
  - move     same type under 15% use at gym A and over 45% (or full at the evening peak over 30% of the time) at gym B
  - buy      a type over 45% at most gyms and full at the evening peak, with no gym under 15% to move from
  - retire   a type under 10% across the network and under 15% at every gym for 8 weeks
  - service  machines past their preventive service interval (hours of use)
  - energy   energy per visit over 15% above the best gym, with AC and lights running in empty zones
  - capacity a gym above 85% of capacity at the evening peak on several days
*/

export type InsightKind = 'move' | 'buy' | 'retire' | 'service' | 'energy' | 'capacity';
export const INSIGHT_KINDS: InsightKind[] = ['move', 'buy', 'retire', 'service', 'energy', 'capacity'];

export const LOW_PCT = 15;
export const HIGH_PCT = 45;
export const PEAK_FULL_PCT = 30;
export const IDLE_PCT = 10;
export const TARGET_PCT = 40;
export const CROWD_PCT = 85;
const RETIRE_TARGET = 0.15;
const CLASS_SIZE = 20;

export interface MoveData {
  from: string; to: string; n: number;
  fromUnits: number; toUnits: number; fromUtil: number; toUtil: number; toPeakFull: number;
  fromAfter: number; toAfter: number; fromSessionsDay: number; toSessionsDay: number;
  avoidedSar: number; moveCostSar: number;
}
export interface BuyData {
  total: number; perGym: { clubId: string; n: number; units: number; util: number; peakFull: number; after: number }[];
  highGyms: number; ofGyms: number; costSar: number; unitPrice: number;
}
export interface RetireData {
  total: number; units: number; perGym: { clubId: string; n: number; units: number; util: number }[];
  networkUtil: number; resaleSar: number;
}
export interface ServiceData {
  clubId: string; machines: { id: string; nameEn: string; nameAr: string; type: MachineType; hours: number; interval: number }[];
}
export interface EnergyData {
  clubId: string; kwhPerVisit: number; bestClubId: string; bestKwhPerVisit: number; gapPct: number;
  afterHoursAcH: number; emptyZoneH: number; wasteKwhMonth: number; wasteSarMonth: number;
}
export interface CapacityData {
  clubId: string; days: number; ofDays: number; slotH: number; peakPct: number; quietH: number; quietPct: number;
  classes: number; afterPct: number;
}

export interface Insight {
  id: string;
  kind: InsightKind;
  clubIds: string[];
  type?: MachineType;
  confidence: 'high' | 'medium';
  /** Weeks (of weeksOf) in which the pattern held; 0 / 0 for the service log. */
  weeksHeld: number;
  weeksOf: number;
  /** Ranking value, SAR equivalent per year. */
  score: number;
  move?: MoveData; buy?: BuyData; retire?: RetireData; service?: ServiceData; energy?: EnergyData; capacity?: CapacityData;
}

export interface Window { from: string; to: string }

/** Last 28 complete days (yesterday back) and the 8 weekly windows before today, newest first. */
export function windows(today: string): { w4: Window; w8: Window; weeks: Window[] } {
  const to = addDays(today, -1);
  return {
    w4: { from: addDays(today, -28), to },
    w8: { from: addDays(today, -56), to },
    weeks: Array.from({ length: 8 }, (_, k) => ({ from: addDays(today, -7 * (k + 1)), to: addDays(today, -7 * k - 1) })),
  };
}

type Data = Pick<DemoContextValue, 'clubs' | 'machines' | 'areas' | 'acUnits' | 'lights' | 'live'>;

const r1 = (x: number) => Math.round(x * 10) / 10;

function usageMap(d: Data, w: Window): Map<string, Map<MachineType, TypeUsage>> {
  const out = new Map<string, Map<MachineType, TypeUsage>>();
  for (const c of d.clubs) out.set(c.id, new Map(typeUsage(d, c, w.from, w.to).map((u) => [u.type, u])));
  return out;
}

// Per gym thresholds from Branch settings (defaults LOW_PCT, HIGH_PCT and CROWD_PCT).
const lowOf = (clubId: string) => branchConfig(clubId).idlePct;
const highOf = (clubId: string) => branchConfig(clubId).overusedPct;
const crowdOf = (clubId: string) => branchConfig(clubId).crowdPct;
const isHigh = (u: TypeUsage | undefined, clubId: string) => !!u && (u.utilPct > highOf(clubId) || u.peakFullPct > PEAK_FULL_PCT);
const isLow = (u: TypeUsage | undefined, clubId: string) => !!u && u.utilPct < lowOf(clubId) && u.peakFullPct < 5;

function confidenceOf(held: number, of: number): 'high' | 'medium' {
  return held >= of - 1 ? 'high' : 'medium';
}

// ---------- gym-level metrics shared with the comparison ----------

export interface GymStats {
  club: Club;
  utilPct: number;
  sessionsPerMachineDay: number;
  kwh: number;
  visits: number;
  kwhPerVisit: number;
  sarPerVisit: number;
  kwhPerM2: number;
  peakHour: number;
  byType: TypeUsage[];
}

const statsCache = new Map<string, GymStats>();

/** Machine use, sessions, energy per visit and kWh per m2 over a window (complete days). */
export function gymStats(d: Data, club: Club, w: Window): GymStats {
  const byType = typeUsage(d, club, w.from, w.to);
  const key = `${club.id}|${w.from}|${w.to}|${byType.map((u) => `${u.type}:${u.units}:${u.usedMin}`).join(',')}`;
  const hit = statsCache.get(key);
  if (hit) return hit;
  const dates = dateRange(w.from, w.to);
  let kwh = 0, visits = 0;
  const hourSum = new Array(24).fill(0);
  for (const date of dates) {
    kwh += energyDay(club, date).kwh;
    const a = arrivalsByHour(club, date);
    a.forEach((v, h) => { hourSum[h] += v; visits += v; });
  }
  const used = byType.reduce((a, u) => a + u.usedMin, 0);
  const open = byType.reduce((a, u) => a + u.openMin, 0);
  const units = byType.reduce((a, u) => a + u.units, 0);
  const sessions = byType.reduce((a, u) => a + u.sessions, 0);
  const s: GymStats = {
    club,
    utilPct: open ? r1((used / open) * 100) : 0,
    sessionsPerMachineDay: units ? r1(sessions / units / dates.length) : 0,
    kwh: Math.round(kwh),
    visits: Math.round(visits),
    kwhPerVisit: visits ? Math.round((kwh / visits) * 100) / 100 : 0,
    sarPerVisit: visits ? Math.round((kwh / visits) * TARIFF_SAR_PER_KWH * 100) / 100 : 0,
    kwhPerM2: club.areaM2 ? r1(kwh / club.areaM2) : 0,
    peakHour: hourSum.indexOf(Math.max(...hourSum)),
    byType,
  };
  statsCache.set(key, s);
  return s;
}

// ---------- rules ----------

function moveInsights(d: Data, w4: Map<string, Map<MachineType, TypeUsage>>, weeks: Map<string, Map<MachineType, TypeUsage>>[]): Insight[] {
  const out: Insight[] = [];
  const types = new Set<MachineType>();
  for (const m of w4.values()) for (const t of m.keys()) types.add(t);
  for (const type of types) {
    const rows = d.clubs.map((c) => ({ c, u: w4.get(c.id)?.get(type) })).filter((x) => x.u);
    const highs = rows.filter((x) => isHigh(x.u, x.c.id)).sort((a, b) => b.u!.utilPct - a.u!.utilPct);
    // spare units at low-use gyms: keep enough to stay under 30% use, never fewer than 1
    const spare = new Map(rows.filter((x) => isLow(x.u, x.c.id)).map((x) => [x.c.id, x.u!.units - Math.max(1, Math.ceil((x.u!.units * x.u!.utilPct) / 30))]));
    for (const hi of highs) {
      const u = hi.u!;
      const need = Math.max(1, Math.ceil((u.units * u.utilPct) / TARGET_PCT - u.units));
      const sources = rows.filter((x) => (spare.get(x.c.id) ?? 0) > 0)
        .sort((a, b) => a.u!.utilPct - b.u!.utilPct || (spare.get(b.c.id)! - spare.get(a.c.id)!));
      const src = sources[0];
      if (!src) continue;
      const n = Math.min(need, spare.get(src.c.id)!);
      spare.set(src.c.id, spare.get(src.c.id)! - n);
      const su = src.u!;
      let held = 0;
      for (const wk of weeks) if (isHigh(wk.get(hi.c.id)?.get(type), hi.c.id) && (wk.get(src.c.id)?.get(type)?.utilPct ?? 100) < lowOf(src.c.id)) held++;
      const days = 28;
      const cost = n * MOVE_COST_SAR;
      const avoided = n * PRICE_SAR[type];
      out.push({
        id: `move:${type}:${src.c.id}:${hi.c.id}`, kind: 'move', clubIds: [src.c.id, hi.c.id], type,
        confidence: confidenceOf(held, weeks.length), weeksHeld: held, weeksOf: weeks.length, score: avoided - cost,
        move: {
          from: src.c.id, to: hi.c.id, n, fromUnits: su.units, toUnits: u.units, fromUtil: su.utilPct, toUtil: u.utilPct,
          toPeakFull: u.peakFullPct,
          fromAfter: r1((su.utilPct * su.units) / (su.units - n)), toAfter: r1((u.utilPct * u.units) / (u.units + n)),
          fromSessionsDay: r1(su.sessions / su.units / days), toSessionsDay: r1(u.sessions / u.units / days),
          avoidedSar: avoided, moveCostSar: cost,
        },
      });
    }
  }
  return out;
}

function buyInsights(d: Data, w4: Map<string, Map<MachineType, TypeUsage>>, weeks: Map<string, Map<MachineType, TypeUsage>>[]): Insight[] {
  const out: Insight[] = [];
  const types = new Set<MachineType>();
  for (const m of w4.values()) for (const t of m.keys()) types.add(t);
  for (const type of types) {
    const rows = d.clubs.map((c) => ({ c, u: w4.get(c.id)?.get(type) })).filter((x) => x.u);
    const highs = rows.filter((x) => x.u!.utilPct > highOf(x.c.id) && x.u!.peakFullPct > PEAK_FULL_PCT);
    if (rows.length < 2 || highs.length * 2 <= rows.length) continue;
    if (rows.some((x) => isLow(x.u, x.c.id))) continue; // a low-use gym exists: moving comes first
    const perGym = highs.map((x) => {
      const n = Math.max(1, Math.ceil((x.u!.units * x.u!.utilPct) / TARGET_PCT - x.u!.units));
      return { clubId: x.c.id, n, units: x.u!.units, util: x.u!.utilPct, peakFull: x.u!.peakFullPct, after: r1((x.u!.utilPct * x.u!.units) / (x.u!.units + n)) };
    }).sort((a, b) => b.util - a.util);
    const total = perGym.reduce((a, g) => a + g.n, 0);
    let held = 0;
    for (const wk of weeks) {
      const h = rows.filter((x) => { const u = wk.get(x.c.id)?.get(type); return !!u && u.utilPct > highOf(x.c.id); }).length;
      if (h * 2 > rows.length) held++;
    }
    out.push({
      id: `buy:${type}`, kind: 'buy', clubIds: perGym.map((g) => g.clubId), type,
      confidence: confidenceOf(held, weeks.length), weeksHeld: held, weeksOf: weeks.length,
      score: total * PRICE_SAR[type] * 0.6,
      buy: { total, perGym, highGyms: highs.length, ofGyms: rows.length, costSar: total * PRICE_SAR[type], unitPrice: PRICE_SAR[type] },
    });
  }
  return out;
}

function retireInsights(d: Data, w8: Map<string, Map<MachineType, TypeUsage>>, weeks: Map<string, Map<MachineType, TypeUsage>>[]): Insight[] {
  const out: Insight[] = [];
  const types = new Set<MachineType>();
  for (const m of w8.values()) for (const t of m.keys()) types.add(t);
  for (const type of types) {
    const rows = d.clubs.map((c) => ({ c, u: w8.get(c.id)?.get(type) })).filter((x) => x.u);
    if (rows.length < 2) continue;
    const used = rows.reduce((a, x) => a + x.u!.usedMin, 0);
    const open = rows.reduce((a, x) => a + x.u!.openMin, 0);
    const net = open ? (used / open) * 100 : 0;
    if (net >= IDLE_PCT || rows.some((x) => x.u!.utilPct >= lowOf(x.c.id) || x.u!.peakFullPct >= 5)) continue;
    let held = 0;
    for (const wk of weeks) {
      const ws = rows.map((x) => ({ id: x.c.id, u: wk.get(x.c.id)?.get(type) })).filter((x) => x.u) as { id: string; u: TypeUsage }[];
      const n = ws.reduce((a, x) => a + x.u.usedMin, 0) / Math.max(1, ws.reduce((a, x) => a + x.u.openMin, 0)) * 100;
      if (n < IDLE_PCT && ws.every((x) => x.u.utilPct < lowOf(x.id))) held++;
    }
    if (held < weeks.length) continue; // idle for the full 8 weeks only
    const perGym = rows.map((x) => {
      const keep = Math.max(Math.min(2, x.u!.units), Math.ceil((x.u!.units * x.u!.utilPct) / (RETIRE_TARGET * 100)));
      return { clubId: x.c.id, n: x.u!.units - keep, units: x.u!.units, util: x.u!.utilPct };
    }).filter((g) => g.n > 0).sort((a, b) => b.n - a.n || a.util - b.util);
    const total = perGym.reduce((a, g) => a + g.n, 0);
    if (!total) continue;
    out.push({
      id: `retire:${type}`, kind: 'retire', clubIds: perGym.map((g) => g.clubId), type,
      confidence: 'high', weeksHeld: held, weeksOf: weeks.length, score: total * PRICE_SAR[type] * RESALE_SHARE,
      retire: { total, units: rows.reduce((a, x) => a + x.u!.units, 0), perGym, networkUtil: r1(net), resaleSar: Math.round(total * PRICE_SAR[type] * RESALE_SHARE) },
    });
  }
  return out;
}

/** `skip`: "clubId|type" pairs recommended for retirement (no service spend on units that leave). */
function serviceInsights(d: Data, skip: Set<string>): Insight[] {
  const out: Insight[] = [];
  for (const c of d.clubs) {
    const due = d.machines.filter((m: Machine) => m.clubId === c.id && m.enabled && m.hoursSinceService >= SERVICE_INTERVAL_H[m.type] && !skip.has(`${c.id}|${m.type}`))
      .map((m) => ({ id: m.id, nameEn: m.nameEn, nameAr: m.nameAr, type: m.type, hours: m.hoursSinceService, interval: SERVICE_INTERVAL_H[m.type] }))
      .sort((a, b) => b.hours / b.interval - a.hours / a.interval);
    if (!due.length) continue;
    out.push({
      id: `service:${c.id}`, kind: 'service', clubIds: [c.id], confidence: 'high', weeksHeld: 0, weeksOf: 0,
      score: due.reduce((a, m) => a + PRICE_SAR[m.type] * 0.12, 0), service: { clubId: c.id, machines: due },
    });
  }
  return out;
}

/** AC running in closed hours and the boxing and functional rooms with nobody in them during open hours, over the window. */
function emptyZoneWaste(d: Data, club: Club, w: Window) {
  const areas = d.areas.filter((a) => a.clubId === club.id);
  const big = new Set(areas.filter((a) => a.share > 0.12).map((a) => a.id));
  const studios = areas.filter((a) => /:(boxing|functional)$/.test(a.id));
  const units = d.acUnits.filter((u) => u.clubId === club.id);
  const lights = d.lights.filter((l) => l.clubId === club.id);
  let acH = 0, emptyH = 0, kwh = 0;
  for (const date of dateRange(w.from, w.to)) {
    const a = arrivalsByHour(club, date);
    for (let h = 0; h < 24; h++) {
      const open = isOpenAt(club, date, h * 60 + 30);
      if (!open) {
        // same draw as the live AC state: a big area unit runs after hours on 1 in 5 hours
        for (const u of units) {
          if (!big.has(u.areaId)) continue;
          if (rngFor(u.id, date, h)() < 0.2) { acH++; kwh += u.ratedKw * 0.65; }
        }
        continue;
      }
      const inGym = a[h] + 0.5 * (a[h - 1] ?? 0);
      for (const s of studios) {
        if (inGym * s.share >= 0.5) continue;
        emptyH++;
        for (const u of units) if (u.areaId === s.id) kwh += u.ratedKw * 0.65;
        for (const l of lights) if (l.areaId === s.id) kwh += (l.watts / 1000) * 0.4;
      }
    }
  }
  return { acH, emptyH, kwh };
}

function energyInsights(d: Data, w: Window): Insight[] {
  const stats = d.clubs.map((c) => gymStats(d, c, w));
  if (stats.length < 2) return [];
  const best = stats.reduce((a, s) => (s.kwhPerVisit < a.kwhPerVisit ? s : a));
  const days = dateRange(w.from, w.to).length;
  const out: Insight[] = [];
  // the gym with the highest energy per visit, and the gym wasting most in empty zones (when different)
  const cands = stats.filter((s) => s.club.id !== best.club.id && s.kwhPerVisit >= best.kwhPerVisit * 1.15)
    .map((s) => ({ s, waste: emptyZoneWaste(d, s.club, w) }));
  if (!cands.length) return out;
  const worst = cands.reduce((a, c) => (c.s.kwhPerVisit > a.s.kwhPerVisit ? c : a));
  const wasteful = cands.reduce((a, c) => (c.waste.kwh > a.waste.kwh ? c : a));
  for (const { s, waste } of worst === wasteful ? [worst] : [worst, wasteful]) {
    const wasteKwhMonth = Math.round((waste.kwh / days) * 30);
    const wasteSarMonth = Math.round(wasteKwhMonth * TARIFF_SAR_PER_KWH);
    if (wasteSarMonth < 150) continue;
    out.push({
      id: `energy:${s.club.id}`, kind: 'energy', clubIds: [s.club.id], confidence: 'high', weeksHeld: 4, weeksOf: 4,
      score: wasteSarMonth * 12,
      energy: {
        clubId: s.club.id, kwhPerVisit: s.kwhPerVisit, bestClubId: best.club.id, bestKwhPerVisit: best.kwhPerVisit,
        gapPct: Math.round(((s.kwhPerVisit - best.kwhPerVisit) / best.kwhPerVisit) * 100),
        afterHoursAcH: Math.round((waste.acH / days) * 30), emptyZoneH: Math.round((waste.emptyH / days) * 30), wasteKwhMonth, wasteSarMonth,
      },
    });
  }
  return out;
}

function capacityInsights(d: Data, w: Window, weeks: Window[]): Insight[] {
  const out: Insight[] = [];
  const dates = dateRange(w.from, w.to);
  for (const c of d.clubs) {
    const daysOver = dates.filter((date) => SLOT_HOURS.some((h) => slotFullPct(c, date, h) >= crowdOf(c.id)));
    if (daysOver.length < 3) continue;
    const avg = (h: number) => dates.reduce((a, date) => a + slotFullPct(c, date, h), 0) / dates.length;
    const slotH = SLOT_HOURS.reduce((b, h) => (avg(h) > avg(b) ? h : b), SLOT_HOURS[0]);
    const quietH = [12, 14].reduce((b, h) => (avg(h) < avg(b) ? h : b), 12);
    const peakPct = Math.round(avg(slotH));
    const classes = Math.min(3, Math.max(1, Math.ceil(((peakPct - 75) / 100) * c.capacity / CLASS_SIZE)));
    const shift = (classes * CLASS_SIZE / c.capacity) * 100;
    let held = 0;
    for (const wk of weeks.slice(0, 4)) if (dateRange(wk.from, wk.to).filter((date) => SLOT_HOURS.some((h) => slotFullPct(c, date, h) >= crowdOf(c.id))).length >= 2) held++;
    out.push({
      id: `capacity:${c.id}`, kind: 'capacity', clubIds: [c.id], confidence: confidenceOf(held, 4), weeksHeld: held, weeksOf: 4,
      score: 60_000 + daysOver.length * 1_000,
      capacity: {
        clubId: c.id, days: daysOver.length, ofDays: dates.length, slotH, peakPct, quietH, quietPct: Math.round(avg(quietH)), classes,
        afterPct: Math.round(peakPct - shift),
      },
    });
  }
  return out;
}

const cache = new Map<string, Insight[]>();

/**
 * Every recommendation for the network, ranked: the strongest of each kind first (so the top of the list
 * covers different kinds of action), then the rest by value.
 */
export function buildInsights(d: Data): Insight[] {
  const today = d.live.date;
  const key = `${today}|${branchSignature()}|${d.machines.map((m) => `${m.id}:${m.enabled ? 1 : 0}:${m.hoursSinceService}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { w4, w8, weeks } = windows(today);
  const u4 = usageMap(d, w4);
  const u8 = usageMap(d, w8);
  const uw = weeks.map((w) => usageMap(d, w));
  const retire = retireInsights(d, u8, uw);
  const skip = new Set(retire.flatMap((i) => i.retire!.perGym.map((g) => `${g.clubId}|${i.type}`)));
  const all = [
    ...moveInsights(d, u4, uw), ...buyInsights(d, u4, uw), ...retire,
    ...serviceInsights(d, skip), ...energyInsights(d, w4), ...capacityInsights(d, w4, weeks),
  ];
  const byKind = new Map<InsightKind, Insight[]>();
  for (const i of all) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
  for (const l of byKind.values()) l.sort((a, b) => b.score - a.score);
  const leaders = [...byKind.values()].map((l) => l[0]).sort((a, b) => b.score - a.score);
  const rest = all.filter((i) => !leaders.includes(i)).sort((a, b) => b.score - a.score);
  const out = [...leaders, ...rest];
  cache.set(key, out);
  return out;
}

/** Recommendations for a cell of the equipment matrix (type at a gym). */
export function insightsForCell(list: Insight[], type: MachineType, clubId: string): Insight[] {
  return list.filter((i) => i.type === type && (i.clubIds.includes(clubId)));
}
