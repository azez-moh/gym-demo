import { useCallback, useMemo } from 'react';
import { acOf, areasOf, lightsOf, presenceOf, type AcRow, type Area, type DemoContextValue, type LightRow } from '../../data';

/*
  Building controls of the Facility Manager overview. Every change is a patch on the shared demo store
  (acLive and lightLive), so HVAC, Lights, BMS Overview and Control show it at once. The building mode, an
  active cooling boost and the "Recent changes" log are kept under settings `fm:<clubId>`.
*/

export type BuildingMode = 'open' | 'closed' | 'night' | 'cleaning' | 'event';
export const MODES: BuildingMode[] = ['open', 'closed', 'night', 'cleaning', 'event'];

export type Scene = 'full' | 'training' | 'cleaning' | 'off';
export const SCENES: Scene[] = ['full', 'training', 'cleaning', 'off'];
export const SCENE_LEVEL: Record<Scene, number> = { full: 100, training: 80, cleaning: 60, off: 0 };

export const SP_MIN = 18;
export const SP_MAX = 28;
export const BOOST_SP = 20;
export const BOOST_MS = 60 * 60_000;

export type LogKind = 'mode' | 'boost' | 'boostEnd' | 'acOn' | 'acOff' | 'setpoint' | 'scene' | 'emptyOff' | 'ack' | 'clear';

export interface LogEntry {
  at: number;
  kind: LogKind;
  who: string;
  mode?: BuildingMode;
  areaId?: string;
  scene?: Scene;
  value?: number;
  n?: number;
  alarmEn?: string;
  alarmAr?: string;
}

interface AcPrev { on: boolean; setpoint: number; fan: string }
export interface Boost { areaId: string; until: number; prev: Record<string, AcPrev> }

interface FmState { mode?: BuildingMode; modeAt?: number; boost?: Boost | null; log?: LogEntry[] }

const LOG_MAX = 30;

export const areaKey = (a: Pick<Area, 'id'>) => a.id.slice(a.id.lastIndexOf(':') + 1);
/** Normal setpoint of an area (same rule as the live data: 22 °C on the training floors, 23 °C elsewhere). */
export const normalSetpoint = (a: Pick<Area, 'id'>) => (['gym', 'cardio', 'functional', 'boxing', 'freestyle', 'performance', 'pt'].includes(areaKey(a)) ? 22 : 23);
export const clampSp = (v: number) => Math.max(SP_MIN, Math.min(SP_MAX, Math.round(v * 2) / 2));

export interface ZoneRow {
  area: Area;
  units: AcRow[];
  lights: LightRow[];
  people: number;
  /** Mean reading of running units (all units when none run). */
  temp?: number;
  setpoint?: number;
  unitsOn: number;
  lightsOn: number;
  scene: Scene | null;
  /** Largest reading above setpoint among running units. */
  overBy: number;
  /** Highest reading among running units. */
  maxReading?: number;
}

function sceneOf(ls: LightRow[]): Scene | null {
  if (!ls.length) return null;
  if (ls.every((l) => !l.live?.on)) return 'off';
  const lv = ls.map((l) => (l.live?.on ? l.live.level : 0));
  const same = lv.every((x) => x === lv[0]);
  if (!same) return null;
  return (Object.keys(SCENE_LEVEL) as Scene[]).find((s) => SCENE_LEVEL[s] === lv[0]) ?? null;
}

export function useFmControls(data: DemoContextValue, clubId: string, who: string) {
  const key = `fm:${clubId}`;
  const st = (data.patches.set.settings?.[key] ?? {}) as FmState;
  const log = st.log ?? [];

  const zones: ZoneRow[] = useMemo(() => {
    const ac = acOf(data, clubId);
    const ls = lightsOf(data, clubId);
    const pres = new Map(presenceOf(data, clubId).map((p) => [p.area.id, p.people]));
    return areasOf(data, clubId).map((area) => {
      const units = ac.filter((u) => u.areaId === area.id);
      const lights = ls.filter((l) => l.areaId === area.id);
      const on = units.filter((u) => u.live?.on);
      const src = on.length ? on : units;
      const temp = src.length ? Math.round((src.reduce((a, u) => a + (u.live?.reading ?? 0), 0) / src.length) * 10) / 10 : undefined;
      const overBy = on.reduce((m, u) => Math.max(m, (u.live?.reading ?? 0) - (u.live?.setpoint ?? 0)), -99);
      return {
        area, units, lights, people: pres.get(area.id) ?? 0, temp, setpoint: units[0]?.live?.setpoint,
        maxReading: on.length ? Math.max(...on.map((u) => u.live?.reading ?? 0)) : undefined,
        unitsOn: on.length, lightsOn: lights.filter((l) => l.live?.on).length, scene: sceneOf(lights), overBy,
      };
    });
  }, [data, clubId]);

  /** Writes the fm state (mode, boost, log) with one new log entry. */
  const record = useCallback((entry: Omit<LogEntry, 'at' | 'who'>, extra?: Partial<FmState>) => {
    const e: LogEntry = { ...entry, at: data.live.nowMs, who };
    data.patch('settings', key, { ...extra, log: [e, ...log].slice(0, LOG_MAX) });
  }, [data, key, log, who]);

  const acOn = (u: AcRow, fields: Partial<AcPrev> & { on: boolean }) => {
    const powerKw = fields.on ? Math.max(u.live?.powerKw ?? 0, Math.round(u.ratedKw * 0.55 * 10) / 10) : 0;
    data.patch('acLive', u.id, { mode: 'cool', ...fields, powerKw });
  };
  const lightsTo = (l: LightRow, level: number) => {
    data.patch('lightLive', l.id, { on: level > 0, level, lit: Math.round(l.fittings * (level / 100)) });
  };

  const setMode = (mode: BuildingMode) => {
    for (const z of zones) {
      const k = areaKey(z.area);
      for (const u of z.units) {
        if (mode === 'closed') acOn(u, { on: false });
        else if (mode === 'open') acOn(u, { on: true, setpoint: normalSetpoint(z.area), fan: 'auto' });
        else if (mode === 'night') acOn(u, { on: true, setpoint: 26, fan: 'low' });
        else if (mode === 'cleaning') acOn(u, { on: true, setpoint: 25, fan: 'auto' });
        else acOn(u, { on: true, setpoint: 21, fan: 'high' });
      }
      const level = mode === 'closed' ? 0
        : mode === 'night' ? (k === 'reception' ? 40 : 0)
        : mode === 'cleaning' ? SCENE_LEVEL.cleaning
        : 100;
      for (const l of z.lights) lightsTo(l, level);
    }
    record({ kind: 'mode', mode }, { mode, modeAt: data.live.nowMs, boost: null });
  };

  const setZoneAc = (z: ZoneRow, on: boolean) => {
    for (const u of z.units) acOn(u, on ? { on: true, setpoint: u.live?.setpoint ?? normalSetpoint(z.area) } : { on: false });
    record({ kind: on ? 'acOn' : 'acOff', areaId: z.area.id });
  };

  const nudge = (z: ZoneRow, d: number) => {
    const sp = clampSp((z.setpoint ?? normalSetpoint(z.area)) + d);
    if (sp === z.setpoint) return;
    for (const u of z.units) data.patch('acLive', u.id, { setpoint: sp });
    record({ kind: 'setpoint', areaId: z.area.id, value: sp });
  };

  const setScene = (z: ZoneRow, scene: Scene) => {
    for (const l of z.lights) lightsTo(l, SCENE_LEVEL[scene]);
    record({ kind: 'scene', areaId: z.area.id, scene });
  };

  const emptyZones = zones.filter((z) => z.people === 0 && (z.unitsOn > 0 || z.lightsOn > 0));
  const offEmpty = () => {
    for (const z of emptyZones) {
      for (const u of z.units) acOn(u, { on: false });
      for (const l of z.lights) lightsTo(l, 0);
    }
    record({ kind: 'emptyOff', n: emptyZones.length });
  };

  const boost = st.boost ?? null;
  const startBoost = (areaId: string) => {
    const z = zones.find((x) => x.area.id === areaId);
    if (!z) return;
    // a running boost elsewhere goes back first
    if (boost) restore(boost);
    const prev: Record<string, AcPrev> = {};
    for (const u of z.units) {
      prev[u.id] = { on: !!u.live?.on, setpoint: u.live?.setpoint ?? normalSetpoint(z.area), fan: u.live?.fan ?? 'auto' };
      acOn(u, { on: true, setpoint: BOOST_SP, fan: 'high' });
    }
    record({ kind: 'boost', areaId }, { boost: { areaId, until: data.live.nowMs + BOOST_MS, prev } });
  };
  const restore = (b: Boost) => {
    for (const [id, p] of Object.entries(b.prev)) {
      const u = zones.flatMap((z) => z.units).find((x) => x.id === id);
      if (u) acOn(u, { on: p.on, setpoint: p.setpoint, fan: p.fan });
    }
  };
  const endBoost = () => {
    if (!boost) return;
    restore(boost);
    record({ kind: 'boostEnd', areaId: boost.areaId }, { boost: null });
  };

  const logAlarm = (kind: 'ack' | 'clear', titleEn: string, titleAr: string) => record({ kind, alarmEn: titleEn, alarmAr: titleAr });

  return {
    zones, log, mode: st.mode ?? null, modeAt: st.modeAt, boost, emptyZones,
    setMode, setZoneAc, nudge, setScene, offEmpty, startBoost, endBoost, logAlarm,
  };
}

export type FmControls = ReturnType<typeof useFmControls>;
