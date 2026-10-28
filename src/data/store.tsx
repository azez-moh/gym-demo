import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DemoContextValue, PatchCollection, Patches, StaticData } from './types';
import { buildStatic } from './build';
import { buildLive } from './dynamics';
import { syncBranchConfigs } from './branchConfig';

/**
 * Data provider. Static inventory is built once; a 10 s tick moves `now` forward and rebuilds the live
 * snapshot (people in, machine states, zone readings, AC and lights, alerts, agent activity).
 * Only user actions persist (localStorage `opt.data.v1`), applied as patches over the generated data.
 * Live AC / light changes are patched with patch('acLive' | 'lightLive', id, fields).
 */

const LS_KEY = 'opt.data.v1';
const TICK_MS = 10_000;
const EMPTY: Patches = { set: {}, removed: {}, added: {} };

function readPatches(): Patches {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Patches>;
    return { set: p.set ?? {}, removed: p.removed ?? {}, added: p.added ?? {} };
  } catch {
    return EMPTY;
  }
}

function writePatches(p: Patches | null) {
  try {
    if (!p) window.localStorage.removeItem(LS_KEY);
    else window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch { /* storage unavailable: keep in memory */ }
}

const BASE: StaticData = buildStatic();

/** Static collections that patches can touch, by collection name. */
const STATIC_KEYS: Partial<Record<PatchCollection, keyof StaticData>> = {
  machines: 'machines', cameras: 'cameras', zones: 'zones', acUnits: 'acUnits', lights: 'lights',
  agentStates: 'agentStates', integrations: 'integrations', library: 'library',
};

function idOf(item: unknown, coll: PatchCollection): string {
  const o = item as Record<string, unknown>;
  if (coll === 'agentStates') return `${o.clubId}:${o.agentId}`;
  return String(o.id);
}

function applyList<T>(list: T[], coll: PatchCollection, p: Patches): T[] {
  const set = p.set[coll] ?? {};
  const removed = new Set(p.removed[coll] ?? []);
  const added = (p.added[coll] ?? []) as T[];
  const out: T[] = [];
  for (const item of [...list, ...added]) {
    const id = idOf(item, coll);
    if (removed.has(id)) continue;
    out.push(set[id] ? { ...item, ...set[id] } : item);
  }
  return out;
}

function applyStatic(p: Patches): StaticData {
  const s: StaticData = { ...BASE };
  for (const [coll, key] of Object.entries(STATIC_KEYS) as [PatchCollection, keyof StaticData][]) {
    (s as unknown as Record<string, unknown>)[key] = applyList(BASE[key] as unknown[], coll, p);
  }
  // Branch settings (per gym capacity and thresholds) live in a registry read by floor plans, crowd colours and insights
  syncBranchConfigs(p.set.settings);
  if (p.set.settings?.bms) s.settings = { ...BASE.settings, ...(p.set.settings.bms as object) };
  // keep the per-club counts in step with removals and additions
  s.clubs = BASE.clubs.map((c) => ({
    ...c,
    machines: s.machines.filter((m) => m.clubId === c.id).length,
    cameras: s.cameras.filter((x) => x.clubId === c.id).length,
    zones: s.zones.filter((z) => z.clubId === c.id).length,
  }));
  return s;
}

const Ctx = createContext<DemoContextValue | null>(null);

export interface DemoDataProviderProps {
  children: ReactNode;
  /** Fixed start time (ms) for screenshots; the tick still advances from it. Also read from ?now=<ms> in the URL. */
  initialNowMs?: number;
  paused?: boolean;
}

function urlNow(): number | undefined {
  try {
    const m = /[?&]now=(\d{10,})/.exec(window.location.href);
    return m ? Number(m[1]) : undefined;
  } catch { return undefined; }
}

export function DemoDataProvider({ children, initialNowMs, paused }: DemoDataProviderProps) {
  const [offset] = useState(() => {
    const start = initialNowMs ?? urlNow();
    return start != null ? start - Date.now() : 0;
  });
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  const [tick, setTick] = useState(0);
  const [patches, setPatches] = useState<Patches>(readPatches);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => { setNowMs(Date.now() + offset); setTick((t) => t + 1); }, TICK_MS);
    return () => window.clearInterval(id);
  }, [offset, paused]);

  const stat = useMemo(() => applyStatic(patches), [patches]);

  const live = useMemo(() => {
    const l = buildLive(stat, nowMs);
    const acSet = patches.set.acLive ?? {};
    for (const [id, f] of Object.entries(acSet)) if (l.ac[id]) l.ac[id] = { ...l.ac[id], ...(f as object) };
    const lSet = patches.set.lightLive ?? {};
    for (const [id, f] of Object.entries(lSet)) if (l.lights[id]) l.lights[id] = { ...l.lights[id], ...(f as object) };
    const aSet = patches.set.alerts ?? {};
    const removedAlerts = new Set(patches.removed.alerts ?? []);
    l.alerts = l.alerts.filter((a) => !removedAlerts.has(a.id)).map((a) => (aSet[a.id] ? { ...a, ...(aSet[a.id] as object) } : a));
    return l;
  }, [stat, nowMs, patches]);

  const update = useCallback((fn: (p: Patches) => Patches) => {
    setPatches((prev) => { const next = fn(prev); writePatches(next); return next; });
  }, []);

  const patch = useCallback<DemoContextValue['patch']>((coll, id, fields) => {
    update((p) => ({ ...p, set: { ...p.set, [coll]: { ...(p.set[coll] ?? {}), [id]: { ...(p.set[coll]?.[id] ?? {}), ...fields } } } }));
  }, [update]);

  const remove = useCallback<DemoContextValue['remove']>((coll, id) => {
    update((p) => ({ ...p, removed: { ...p.removed, [coll]: [...(p.removed[coll] ?? []), id] } }));
  }, [update]);

  const add = useCallback<DemoContextValue['add']>((coll, item) => {
    update((p) => ({ ...p, added: { ...p.added, [coll]: [...(p.added[coll] ?? []), item] } }));
  }, [update]);

  const reset = useCallback(() => { writePatches(null); setPatches(EMPTY); }, []);

  const value = useMemo<DemoContextValue>(() => ({
    ...stat, now: new Date(nowMs), tick, live, patch, remove, add, reset, patches,
  }), [stat, nowMs, tick, live, patch, remove, add, reset, patches]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemo(): DemoContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDemo() must be used inside <DemoDataProvider>');
  return c;
}
