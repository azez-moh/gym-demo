import type { Club, DemoContextValue, LiveData, StaticData } from './types';
import { LIVE_CLUB_ID } from './clubs';
import { buildLive, isOpenAt, peopleInAt } from './dynamics';
import { acOf, areasOf, presenceOf } from './selectors';
import { msAt } from './time';
import { branchConfig, branchSignature } from './branchConfig';

/*
  Floor plans and crowd occupancy per area (Crowd heatmap page and the compact Overview card).

  DEMO LAYOUT: a generic two-floor gym of 44 x 38 m per floor, drawn as rectangles. It is not any real building.
  Units are metres, x to the east, y to the south, origin at the north-west corner of each floor.
  Only the rooms a member can use are drawn and counted; back-of-house rooms and circulation are left as plain floor.

  Occupancy uses the same model as every other page: people in the gym (data.live.clubs[id].peopleIn, the KPI on
  the Overview) x the area share (presenceOf in selectors.ts, used by BMS Overview, the FM overview, Control).
  The 15-minute replay applies the same formula to peopleInAt() at each step, so the last step equals the live value.
*/

export type FloorId = 'ground' | 'first';
export const FLOOR_IDS: FloorId[] = ['ground', 'first'];

/** Plan rectangles are [x, y, width, depth]; polygons are lists of [x, y] points. */
export type Pt = [number, number];

export interface PlanArea {
  /** Area key: monitored spaces match `${clubId}:${key}` in data.areas (build.ts AREA_TEMPLATE). */
  key: string;
  floor: FloorId;
  nameEn: string;
  nameAr: string;
  /** Short label used on the plan when the full name does not fit. */
  shortEn: string;
  shortAr: string;
  points: Pt[];
  /** Floor area from the plan, m². */
  m2: number;
  /** Comfortable capacity in people (most people the area holds without queues or crowding). Monitored areas only. */
  capacity: number;
  /** False for circulation and service spaces, which are not counted. */
  monitored: boolean;
  /** Label position when the centroid falls outside an L-shaped or ring-shaped space. */
  labelAt?: Pt;
  /** Room for the label [width, depth] in metres when the bounding box overstates it (L-shapes, rings). */
  labelBox?: Pt;
  /** Thin outline drawn inside the area for orientation (the pool water). */
  detail?: Pt[];
}

export interface FloorPlan {
  id: FloorId;
  nameEn: string;
  nameAr: string;
  /** Outline of the floor slab. */
  outline: Pt[];
  /** Outline of the floor below or the building footprint, drawn dashed for orientation (first floor only). */
  ghost?: Pt[];
  areas: PlanArea[];
  /** Entrance door on the outline: centre point and width along the wall (m); vertical for an east or west wall. */
  entrance?: { at: Pt; width: number; vertical?: boolean };
}

export interface GymPlan {
  clubId: string;
  /** Drawing extent shared by both floors so they print at the same scale. */
  width: number;
  depth: number;
  floors: FloorPlan[];
}

const rect = (x: number, y: number, w: number, d: number): Pt[] => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]];
const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => rect(x0, y0, x1 - x0, y1 - y0);

/** Shoelace area of a polygon, m² (a ring traced outer then inner gives the ring area). */
export function polyArea(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** Area-weighted centroid of a polygon. */
export function polyCentroid(p: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  a /= 2;
  return a ? [cx / (6 * a), cy / (6 * a)] : p[0];
}

/** Bounding box [minX, minY, maxX, maxY]. */
export function polyBox(p: Pt[]): [number, number, number, number] {
  const xs = p.map((q) => q[0]);
  const ys = p.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Even-odd point in polygon test (rings count their hole as outside). */
export function inPoly([x, y]: Pt, p: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Comfortable capacity per area type (assumptions, replace with the operator's own figures): m² per person at
 * the crowd level where members start to wait for equipment or space, circulation and clearances included.
 * - Gym area 12, Functional 12, Boxing 12, Cardio area 8 (one machine and its clearance), Performance zone 8,
 *   PT zones 7 (trainer and member per bay), Running track 25 (runners keep their distance), Relaxing room 15.
 * - Freestyle 16, Spa (steam, sauna, jacuzzi and showers) 12, Locker rooms 20, Reception and entrance 14,
 *   Retail area 20, Lounge area 10, Atrium lounge 20, Smoothie bar 5.
 * - Fixed: Swimming pool 14 (5 lanes of 2.25 m with 2 swimmers each, plus 4 on the deck), Massage area 2 (two
 *   chairs), Prayer room 24 (the places shown on the drawing).
 */
const M2_PER_PERSON: Record<string, number> = {
  gym: 12, functional: 12, boxing: 12, cardio: 8, performance: 8, pt: 7, track: 25, relaxing: 15,
  freestyle: 16, spa: 12, lockers: 20, reception: 14, retail: 20, lounge: 10, atrium: 20, smoothie: 5,
};
const FIXED_CAPACITY: Record<string, number> = { pool: 14, massage: 2, prayer: 24 };

type Seed = Omit<PlanArea, 'm2' | 'capacity' | 'monitored' | 'floor'>;

function finish(floor: FloorId) {
  return (a: Seed): PlanArea => {
    const m2 = Math.round(polyArea(a.points) * 10) / 10;
    const capacity = FIXED_CAPACITY[a.key] ?? Math.max(2, Math.round(m2 / (M2_PER_PERSON[a.key] ?? 15)));
    return { ...a, floor, m2, capacity, monitored: true };
  };
}

/** Ground floor: lounges along the east side, reception by the south-east entrance, locker rooms and spa to the north, the pool hall in the middle. */
const GROUND: Seed[] = [
  { key: 'lockers', nameEn: 'Locker rooms', nameAr: 'غرف الخزائن', shortEn: 'Lockers', shortAr: 'الخزائن', points: box(1, 1, 20, 10) },
  { key: 'spa', nameEn: 'Spa', nameAr: 'السبا', shortEn: 'Spa', shortAr: 'السبا', points: box(21, 1, 32, 10) },
  { key: 'massage', nameEn: 'Massage area', nameAr: 'منطقة المساج', shortEn: 'Massage', shortAr: 'المساج', points: box(26, 12, 32, 15) },
  { key: 'pool', nameEn: 'Swimming pool', nameAr: 'المسبح', shortEn: 'Pool', shortAr: 'المسبح', points: box(2, 12, 24, 28), detail: box(4, 14, 22, 26) },
  { key: 'freestyle', nameEn: 'Freestyle', nameAr: 'منطقة التمارين الحرة', shortEn: 'Freestyle', shortAr: 'الحرة', points: box(2, 30, 22, 37) },
  { key: 'prayer', nameEn: 'Prayer room', nameAr: 'المصلى', shortEn: 'Prayer', shortAr: 'المصلى', points: box(24, 30, 32, 37) },
  { key: 'reception', nameEn: 'Reception and entrance', nameAr: 'الاستقبال والمدخل', shortEn: 'Reception', shortAr: 'الاستقبال', points: box(34, 22, 43, 30) },
  { key: 'retail', nameEn: 'Retail area', nameAr: 'منطقة البيع', shortEn: 'Retail', shortAr: 'البيع', points: box(34, 9, 43, 14) },
  { key: 'lounge', nameEn: 'Lounge area', nameAr: 'منطقة الاستراحة', shortEn: 'Lounge', shortAr: 'الاستراحة', points: box(34, 14, 43, 19) },
  { key: 'smoothie', nameEn: 'Smoothie bar', nameAr: 'ركن العصائر', shortEn: 'Smoothie', shortAr: 'العصائر', points: box(34, 19, 43, 22) },
  { key: 'atrium', nameEn: 'Atrium lounge', nameAr: 'استراحة البهو', shortEn: 'Atrium', shortAr: 'البهو', points: box(34, 1, 43, 9) },
];

/** First floor: training floors to the north, cardio and studios in the middle, a straight sprint track along the south wall. */
const FIRST: Seed[] = [
  { key: 'gym', nameEn: 'Gym area', nameAr: 'صالة التمارين', shortEn: 'Gym', shortAr: 'التمارين', points: box(1, 1, 26, 16) },
  { key: 'functional', nameEn: 'Functional', nameAr: 'منطقة التمارين الوظيفية', shortEn: 'Functional', shortAr: 'الوظيفية', points: box(28, 1, 43, 12) },
  { key: 'boxing', nameEn: 'Boxing', nameAr: 'منطقة الملاكمة', shortEn: 'Boxing', shortAr: 'الملاكمة', points: box(28, 14, 43, 23) },
  { key: 'cardio', nameEn: 'Cardio area', nameAr: 'منطقة الكارديو', shortEn: 'Cardio', shortAr: 'الكارديو', points: box(1, 18, 19, 30) },
  { key: 'pt', nameEn: 'PT zones', nameAr: 'مناطق التدريب الشخصي', shortEn: 'PT', shortAr: 'تدريب شخصي', points: box(21, 18, 26, 30) },
  { key: 'performance', nameEn: 'Performance zone', nameAr: 'منطقة الأداء', shortEn: 'Perf.', shortAr: 'الأداء', points: box(28, 25, 35, 30) },
  { key: 'relaxing', nameEn: 'Relaxing room', nameAr: 'غرفة الاسترخاء', shortEn: 'Relaxing', shortAr: 'الاسترخاء', points: box(36, 25, 43, 30) },
  { key: 'track', nameEn: 'Running track', nameAr: 'مضمار الجري', shortEn: 'Track', shortAr: 'المضمار', points: box(1, 32, 43, 37) },
];

const DEMO_PLAN: GymPlan = {
  clubId: LIVE_CLUB_ID,
  width: 44,
  depth: 38,
  floors: [
    {
      id: 'ground', nameEn: 'Ground floor', nameAr: 'الطابق الأرضي',
      outline: rect(0, 0, 44, 38),
      areas: GROUND.map(finish('ground')),
      entrance: { at: [44, 34], width: 2.4, vertical: true },
    },
    {
      id: 'first', nameEn: 'First floor', nameAr: 'الطابق الأول',
      outline: rect(0, 0, 44, 38),
      areas: FIRST.map(finish('first')),
    },
  ],
};

const PLANS: Record<string, GymPlan> = { [LIVE_CLUB_ID]: DEMO_PLAN };

const withCaps = new Map<string, GymPlan>();

/**
 * The floor plan of a gym, or undefined when it has not been loaded yet (only the live gym has one).
 * Comfortable capacities saved on Branch settings replace the defaults (same object while they do not change).
 */
export function floorPlanOf(clubId: string): GymPlan | undefined {
  const base = PLANS[clubId];
  if (!base) return undefined;
  const caps = branchConfig(clubId).capacity;
  if (!Object.keys(caps).length) return base;
  const key = `${clubId}|${branchSignature()}`;
  let p = withCaps.get(key);
  if (!p) {
    p = { ...base, floors: base.floors.map((f) => ({ ...f, areas: f.areas.map((a) => (a.monitored && caps[a.key] > 0 ? { ...a, capacity: caps[a.key] } : a)) })) };
    if (withCaps.size > 20) withCaps.clear();
    withCaps.set(key, p);
  }
  return p;
}

/** The floor plan with the default capacities (before Branch settings). */
export function defaultPlanOf(clubId: string): GymPlan | undefined {
  return PLANS[clubId];
}

/**
 * Bounding box [x, y, width, depth] of an area key on the demo plan (BMS 3D building template; the other gym
 * reuses the same areas), or undefined for an area that is not drawn (staff area).
 */
export function templateRectOf(key: string): { floor: FloorId; rect: [number, number, number, number] } | undefined {
  for (const f of DEMO_PLAN.floors) {
    const a = f.areas.find((x) => x.key === key);
    if (a) {
      const [x0, y0, x1, y1] = polyBox(a.points);
      return { floor: f.id, rect: [x0, y0, x1 - x0, y1 - y0] };
    }
  }
  return undefined;
}

/** Total floor area of a plan (all floors), m². */
export function planM2(plan: GymPlan): number {
  return Math.round(plan.floors.reduce((a, f) => a + polyArea(f.outline), 0));
}

// ---------- occupancy ----------

type D = Pick<DemoContextValue, 'clubs' | 'districts' | 'machines' | 'cameras' | 'zones' | 'areas' | 'acUnits' | 'lights' | 'live' | 'agents' | 'agentStates' | 'integrations' | 'boards'>;

export interface AreaOccupancy {
  area: PlanArea;
  /** BMS area id (`${clubId}:${key}`). */
  areaId: string;
  people: number;
  /** people / capacity (0..1+). */
  ratio: number;
}

/** Share of the gym's people found in each monitored area (data.areas share, the presenceOf model). */
function shareMap(d: Pick<D, 'areas'>, clubId: string): Map<string, number> {
  return new Map(d.areas.filter((a) => a.clubId === clubId).map((a) => [a.id, a.share]));
}

function occupancyFrom(plan: GymPlan, people: (areaId: string) => number): AreaOccupancy[] {
  const out: AreaOccupancy[] = [];
  for (const f of plan.floors) {
    for (const area of f.areas) {
      if (!area.monitored) continue;
      const areaId = `${plan.clubId}:${area.key}`;
      const n = people(areaId);
      out.push({ area, areaId, people: n, ratio: area.capacity ? n / area.capacity : 0 });
    }
  }
  return out;
}

/** Live people per area: exactly presenceOf(), so BMS Overview, the FM overview and Control show the same numbers. */
export function liveOccupancy(d: D, clubId: string): AreaOccupancy[] {
  const plan = floorPlanOf(clubId);
  if (!plan) return [];
  const pres = new Map(presenceOf(d, clubId).map((p) => [p.area.id, p.people]));
  return occupancyFrom(plan, (id) => pres.get(id) ?? 0);
}

export interface OccupancyStep {
  /** Minutes from local midnight (today). */
  minute: number;
  ms: number;
  open: boolean;
  /** People in the gym (the Overview KPI model). */
  peopleIn: number;
  areas: AreaOccupancy[];
  live: boolean;
}

/**
 * Today in 15-minute steps from opening (or midnight when the clock is before opening) up to the live clock,
 * ending with the live snapshot itself. Deterministic: the same instant always gives the same values.
 */
export function occupancyToday(d: D, club: Club): OccupancyStep[] {
  const plan = floorPlanOf(club.id);
  if (!plan) return [];
  const nowMs = d.live.nowMs;
  const { date } = d.live;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const shares = shareMap(d, club.id);
  const startMin = nowMin >= club.hours.open * 60 ? club.hours.open * 60 : 0;
  const steps: OccupancyStep[] = [];
  for (let m = startMin; m < nowMin; m += 15) {
    const ms = msAt(date, m);
    const n = peopleInAt(club, ms);
    steps.push({
      minute: m, ms, open: isOpenAt(club, date, m), peopleIn: n, live: false,
      areas: occupancyFrom(plan, (id) => Math.round(n * (shares.get(id) ?? 0))),
    });
  }
  const liveN = d.live.clubs[club.id]?.peopleIn ?? 0;
  steps.push({
    minute: nowMin, ms: nowMs, open: d.live.clubs[club.id]?.isOpen ?? true, peopleIn: liveN, live: true,
    areas: liveOccupancy(d, club.id),
  });
  return steps;
}

export interface AreaPeak { people: number; ratio: number; minute: number }

/** Highest people count per area over the steps (first time it was reached). */
export function areaPeaks(steps: OccupancyStep[]): Map<string, AreaPeak> {
  const out = new Map<string, AreaPeak>();
  for (const s of steps) {
    for (const a of s.areas) {
      const p = out.get(a.areaId);
      if (!p || a.people > p.people) out.set(a.areaId, { people: a.people, ratio: a.ratio, minute: s.minute });
    }
  }
  return out;
}

// ---------- climate per area ----------

export interface AreaClimate {
  /** Average reading of the running AC units (all units when none runs), °C. */
  temp?: number;
  setpoint?: number;
  /** Largest reading above setpoint among running units, °C. */
  overBy: number;
  unitsOn: number;
  units: number;
  comfort: 'ok' | 'warm' | 'hot' | 'off' | 'none';
}

function climateFrom(units: { on: boolean; reading: number; setpoint: number }[], clubId: string): AreaClimate {
  if (!units.length) return { overBy: 0, unitsOn: 0, units: 0, comfort: 'none' };
  const on = units.filter((u) => u.on);
  const src = on.length ? on : units;
  const temp = Math.round((src.reduce((a, u) => a + u.reading, 0) / src.length) * 10) / 10;
  const overBy = on.reduce((m, u) => Math.max(m, u.reading - u.setpoint), -99);
  // comfort band from Branch settings (warm 1.5 °C and hot 3 °C over setpoint by default)
  const { warmC, hotC } = branchConfig(clubId);
  const comfort = !on.length ? 'off' : overBy >= hotC ? 'hot' : overBy >= warmC ? 'warm' : 'ok';
  return { temp, setpoint: units[0].setpoint, overBy, unitsOn: on.length, units: units.length, comfort };
}

/** Live climate per BMS area id (same reading as the FM overview zone list, user changes included). */
export function liveClimate(d: D, clubId: string): Map<string, AreaClimate> {
  const ac = acOf(d, clubId);
  return new Map(areasOf(d, clubId).map((a) => [
    a.id,
    climateFrom(ac.filter((u) => u.areaId === a.id && u.live).map((u) => ({ on: u.live.on, reading: u.live.reading, setpoint: u.live.setpoint })), clubId),
  ]));
}

const pastLive = new Map<string, LiveData>();

/** Climate per area at a past instant of today (generated readings, without later user changes). */
export function climateAt(s: StaticData, clubId: string, ms: number): Map<string, AreaClimate> {
  const key = `${clubId}|${ms}`;
  let live = pastLive.get(key);
  if (!live) {
    // only this gym's inventory is needed for its AC readings
    const one: StaticData = {
      ...s,
      clubs: s.clubs.filter((c) => c.id === clubId),
      machines: [], zones: [],
      acUnits: s.acUnits.filter((u) => u.clubId === clubId),
      lights: [],
    };
    live = buildLive(one, ms);
    if (pastLive.size > 200) pastLive.clear();
    pastLive.set(key, live);
  }
  const areas = s.areas.filter((a) => a.clubId === clubId);
  return new Map(areas.map((a) => [
    a.id,
    climateFrom(s.acUnits.filter((u) => u.areaId === a.id).map((u) => live!.ac[u.id]).filter(Boolean).map((x) => ({ on: x.on, reading: x.reading, setpoint: x.setpoint })), clubId),
  ]));
}
