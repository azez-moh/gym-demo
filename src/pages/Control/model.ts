import { useCallback, useMemo } from 'react';
import { useDemo, focusClub, presenceOf, localParts, type Area, type Club, type PatchCollection } from '../../data';
import { useScope } from '../../layout/filters';

/*
  Control room model. The scaffold provides AC units, light circuits, boards and areas per club; the other
  things a BMS control room switches (fans, wall switches, socket circuits, sensors, detectors, sprinkler heads,
  doors, windows, barriers) are derived here from the club's areas, deterministically.
  Their state is kept as patches on the shared store (collection 'settings', id `ctl:<clubId>`), so it survives
  reloads and can be undone. AC and light switching uses the store's live collections (acLive, lightLive).
*/

export type Kind = 'ac' | 'light' | 'fan' | 'circuit' | 'switch' | 'sensor' | 'detector' | 'head' | 'door' | 'window' | 'barrier';
export type CircuitLevel = 'off' | 'half' | 'full';

export interface Thing {
  id: string;
  kind: Kind;
  nameEn: string;
  nameAr: string;
  areaId: string;
  areaEn: string;
  areaAr: string;
  floorEn: string;
  floorAr: string;
  watts: number;
  /** Board id and way number when the thing is on a way. */
  board?: string;
  way?: number;
  /** True for kinds that would be on a board (mains powered). */
  mains: boolean;
}

export interface DaySpan { on: boolean; from: string; to: string }
export interface Source { entity?: string; sim?: boolean; pattern?: 'hours' | 'occupancy' | 'always' | 'random' }

export interface Op { coll: PatchCollection; id: string; before: Record<string, unknown>; after: Record<string, unknown> }
export interface HistoryEntry { label: string; ops: Op[] }

const AREA_FANS: Record<string, number> = { lockers: 2, spa: 1, pool: 2, staff: 1, boxing: 1, functional: 1 };
const AREA_SOCKETS: Record<string, number> = { cardio: 3, gym: 2, functional: 1, boxing: 1, freestyle: 1, lockers: 1, reception: 1, smoothie: 1, staff: 1 };

const keyOf = (a: Area) => a.id.split(':').pop() ?? a.id;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

function base(a: Area) {
  return { areaId: a.id, areaEn: a.nameEn, areaAr: a.nameAr, floorEn: a.floorEn, floorAr: a.floorAr };
}

export const WIRED_KINDS: Kind[] = ['ac', 'light', 'fan', 'circuit'];
export const SWITCHABLE: Kind[] = ['ac', 'light', 'fan', 'switch', 'circuit', 'door', 'window', 'barrier'];

/** Weekly times from the club's opening hours (Sunday first). */
export function timesFromHours(club: Club): DaySpan[] {
  const h = club.hours;
  const f = (x: number) => `${String(Math.floor(x) % 24).padStart(2, '0')}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const span = d === 5 && h.fri ? h.fri : d === 6 && h.sat ? h.sat : { open: h.open, close: h.close };
    return { on: true, from: f(span.open), to: f(span.close) };
  });
}

export const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Hours a day span covers (an end earlier than the start runs past midnight). */
export function spanHours(s: DaySpan): number {
  if (!s.on) return 0;
  let d = toMin(s.to) - toMin(s.from);
  if (d <= 0) d += 1440;
  return d / 60;
}

export function weekHours(t: DaySpan[]): number {
  return Math.round(t.reduce((a, s) => a + spanHours(s), 0) * 10) / 10;
}

/** Whether a weekly time set calls for "on" at a weekday and minute of day. */
export function onAt(t: DaySpan[], dow: number, minute: number): boolean {
  const today = t[dow];
  const yday = t[(dow + 6) % 7];
  if (today?.on) {
    const a = toMin(today.from), b = toMin(today.to);
    if (b > a ? minute >= a && minute < b : minute >= a) return true;
  }
  if (yday?.on) {
    const a = toMin(yday.from), b = toMin(yday.to);
    if (b <= a && minute < b) return true;
  }
  return false;
}

export function buildThings(areas: Area[], acs: { id: string; nameEn: string; nameAr: string; areaId: string; ratedKw: number }[],
  lights: { id: string; nameEn: string; nameAr: string; areaId: string; watts: number; board: string }[],
  boards: { id: string; ways: number }[]): Thing[] {
  const aById = new Map(areas.map((a) => [a.id, a]));
  const out: Thing[] = [];
  for (const u of acs) {
    const a = aById.get(u.areaId); if (!a) continue;
    out.push({ id: u.id, kind: 'ac', nameEn: u.nameEn, nameAr: u.nameAr, ...base(a), watts: Math.round((u.ratedKw * 1000) / 3.2), mains: true });
  }
  for (const l of lights) {
    const a = aById.get(l.areaId); if (!a) continue;
    out.push({ id: l.id, kind: 'light', nameEn: l.nameEn, nameAr: l.nameAr, ...base(a), watts: l.watts, board: l.board, mains: true });
  }
  for (const a of areas) {
    const k = keyOf(a);
    for (let i = 1; i <= (AREA_FANS[k] ?? 0); i++) {
      out.push({ id: `${a.id}:fan${i}`, kind: 'fan', nameEn: `${a.nameEn}, extract fan ${i}`, nameAr: `${a.nameAr}، مروحة الشفط ${i}`, ...base(a), watts: 180, mains: true });
    }
    for (let i = 1; i <= (AREA_SOCKETS[k] ?? 1); i++) {
      out.push({ id: `${a.id}:sk${i}`, kind: 'circuit', nameEn: `${a.nameEn}, sockets ${i}`, nameAr: `${a.nameAr}، المقابس ${i}`, ...base(a), watts: k === 'cardio' ? 3600 : 1800, mains: true });
    }
  }
  for (const l of lights) {
    const a = aById.get(l.areaId); if (!a) continue;
    const n = l.nameEn.split(' ').pop();
    out.push({ id: `${l.id}:sw`, kind: 'switch', nameEn: `${a.nameEn}, switch ${n}`, nameAr: `${a.nameAr}، المفتاح ${n}`, ...base(a), watts: 0, mains: false });
  }
  for (const a of areas) {
    out.push({ id: `${a.id}:pir`, kind: 'sensor', nameEn: `${a.nameEn}, presence sensor`, nameAr: `${a.nameAr}، حساس الحضور`, ...base(a), watts: 0, mains: false });
  }
  for (const a of areas) for (let i = 1; i <= 3; i++) {
    out.push({ id: `${a.id}:det${i}`, kind: 'detector', nameEn: `${a.nameEn}, detector ${i}`, nameAr: `${a.nameAr}، الكاشف ${i}`, ...base(a), watts: 0, mains: false });
  }
  for (const a of areas) for (let i = 1; i <= 2; i++) {
    out.push({ id: `${a.id}:head${i}`, kind: 'head', nameEn: `${a.nameEn}, sprinkler ${i}`, nameAr: `${a.nameAr}، الرشاش ${i}`, ...base(a), watts: 0, mains: false });
  }
  for (const a of areas) {
    const k = keyOf(a);
    if (k === 'reception') out.push({ id: `${a.id}:door-main`, kind: 'door', nameEn: 'Main entrance door', nameAr: 'باب المدخل الرئيسي', ...base(a), watts: 0, mains: false });
    else if (k === 'staff') out.push({ id: `${a.id}:door-service`, kind: 'door', nameEn: 'Service door', nameAr: 'باب الخدمة', ...base(a), watts: 0, mains: false });
    else out.push({ id: `${a.id}:door`, kind: 'door', nameEn: `${a.nameEn} door`, nameAr: `باب ${a.nameAr}`, ...base(a), watts: 0, mains: false });
  }
  const rec = areas.find((a) => keyOf(a) === 'reception') ?? areas[0];
  if (rec) for (let i = 1; i <= 2; i++) {
    out.push({ id: `${rec.id}:gate${i}`, kind: 'barrier', nameEn: `Entry turnstile ${i}`, nameAr: `البوابة الدوارة ${i}`, ...base(rec), watts: 0, mains: false });
  }
  // ways: lights keep their board, other mains things go round-robin; a board that is full leaves things off a way
  const used = new Map(boards.map((b) => [b.id, 0]));
  const cap = new Map(boards.map((b) => [b.id, b.ways]));
  let rr = 0;
  for (const t of out) {
    if (!t.mains || !boards.length) continue;
    let b = t.board ?? boards[rr++ % boards.length].id;
    if ((used.get(b) ?? 0) >= (cap.get(b) ?? 0)) {
      const free = boards.find((x) => (used.get(x.id) ?? 0) < x.ways);
      if (!free) { t.board = undefined; continue; }
      b = free.id;
    }
    used.set(b, (used.get(b) ?? 0) + 1);
    t.board = b;
    t.way = used.get(b);
  }
  return out;
}

/** The Control room data for the club in context, with state accessors and an op-based writer. */
export function useControl() {
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const areas = useMemo(() => data.areas.filter((a) => a.clubId === club.id), [data.areas, club.id]);
  const boards = useMemo(() => data.boards.filter((b) => b.clubId === club.id), [data.boards, club.id]);
  const acs = useMemo(() => data.acUnits.filter((u) => u.clubId === club.id), [data.acUnits, club.id]);
  const lights = useMemo(() => data.lights.filter((l) => l.clubId === club.id), [data.lights, club.id]);
  const things = useMemo(() => buildThings(areas, acs, lights, boards), [areas, acs, lights, boards]);
  const ctlId = `ctl:${club.id}`;
  const st = (data.patches.set.settings?.[ctlId] ?? {}) as Record<string, unknown>;
  const live = data.live;
  const clubLive = live.clubs[club.id];
  const isOpen = clubLive?.isOpen ?? true;
  const presence = useMemo(() => new Map(presenceOf(data, club.id).map((p) => [p.area.id, p.people])), [data, club.id]);
  const defTimes = useMemo(() => timesFromHours(club), [club]);
  const intCovers = data.integrations.filter((i) => i.clubId === club.id && i.kind === 'bacnet').reduce((a, i) => a + i.covers, 0);

  /** On/open state of a switchable thing (circuits: not 'off'). */
  const stateOf = useCallback((t: Thing): boolean | CircuitLevel => {
    const v = st[`s:${t.id}`];
    switch (t.kind) {
      case 'ac': return live.ac[t.id]?.on ?? false;
      case 'light': return live.lights[t.id]?.on ?? false;
      case 'switch': return v != null ? Boolean(v) : (live.lights[t.id.replace(/:sw$/, '')]?.on ?? false);
      case 'circuit': return (v as CircuitLevel) ?? (isOpen ? 'full' : 'off');
      case 'fan': return v != null ? Boolean(v) : isOpen;
      case 'door': return v != null ? Boolean(v) : t.id.endsWith(':door-service');
      case 'window':
      case 'barrier': return v != null ? Boolean(v) : false;
      default: return false;
    }
  }, [st, live, isOpen]);

  const isOn = useCallback((t: Thing) => { const s = stateOf(t); return s === true || s === 'half' || s === 'full'; }, [stateOf]);

  const alarm = (st.alarm as 'clear' | 'alarm') ?? 'clear';
  const heads = (st.heads as 'ready' | 'released') ?? 'ready';

  const sourceOf = useCallback((t: Thing): Source => {
    const v = st[`src:${t.id}`] as Source | undefined;
    if (v) return v;
    const area = slug(t.areaEn);
    if (t.kind === 'ac') {
      const idx = things.filter((x) => x.kind === 'ac').indexOf(t);
      return idx < intCovers ? { entity: `climate.${area}_ac_${t.id.split('ac').pop()}` } : {};
    }
    if (t.kind === 'light') return { entity: `light.${area}_${t.id.split('lc').pop()}` };
    if (t.kind === 'sensor') return { sim: true, pattern: 'occupancy' };
    if (t.kind === 'fan') return { sim: true, pattern: 'hours' };
    return {};
  }, [st, things, intCovers]);

  const timesOf = useCallback((t: Thing): DaySpan[] | null => {
    const k = `t:${t.id}`;
    if (k in st) return (st[k] as DaySpan[] | null) ?? null;
    return t.kind === 'ac' || t.kind === 'light' || t.kind === 'fan' ? defTimes : null;
  }, [st, defTimes]);

  /** Patch op that sets one switchable thing to a value (and remembers the previous value). */
  const opFor = useCallback((t: Thing, value: boolean | CircuitLevel): Op | null => {
    const cur = stateOf(t);
    if (cur === value) return null;
    if (t.kind === 'ac') return { coll: 'acLive', id: t.id, before: { on: cur }, after: { on: value } };
    if (t.kind === 'light') {
      const l = live.lights[t.id];
      const circuit = lights.find((x) => x.id === t.id);
      const on = Boolean(value);
      return { coll: 'lightLive', id: t.id, before: { on: cur, lit: l?.lit ?? 0, level: l?.level ?? 0 },
        after: { on, lit: on ? circuit?.fittings ?? 0 : 0, level: on ? 100 : 0 } };
    }
    return { coll: 'settings', id: ctlId, before: { [`s:${t.id}`]: st[`s:${t.id}`] ?? null }, after: { [`s:${t.id}`]: value } };
  }, [stateOf, live.lights, lights, ctlId, st]);

  const ctlOp = useCallback((key: string, value: unknown): Op => (
    { coll: 'settings', id: ctlId, before: { [key]: st[key] ?? null }, after: { [key]: value } }
  ), [ctlId, st]);

  /** Applies a set of ops (side 'after' or 'before'), merging ops on the same item. */
  const applyOps = useCallback((ops: Op[], side: 'after' | 'before') => {
    const merged = new Map<string, { coll: PatchCollection; id: string; f: Record<string, unknown> }>();
    for (const o of ops) {
      const k = `${o.coll}|${o.id}`;
      const m = merged.get(k) ?? { coll: o.coll, id: o.id, f: {} };
      Object.assign(m.f, o[side]);
      merged.set(k, m);
    }
    for (const m of merged.values()) data.patch(m.coll, m.id, m.f);
  }, [data]);

  const nowParts = localParts(live.nowMs);

  return {
    data, club, areas, boards, things, stateOf, isOn, alarm, heads, sourceOf, timesOf, opFor, ctlOp, applyOps, presence,
    nowParts, defTimes, savedAt: st.savedAt as number | undefined, savedBy: st.savedBy as string | undefined, savedRole: st.savedRole as string | undefined, ctlId,
  };
}

export type ControlModel = ReturnType<typeof useControl>;

export const FLOORS = [
  { en: 'Ground floor', ar: 'الطابق الأرضي' },
  { en: 'First floor', ar: 'الطابق الأول' },
];
