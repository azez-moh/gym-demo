import { useEffect, useMemo, useState } from 'react';
import type { Camera, Machine, Zone } from '../../../data/types';
import { useDemo } from '../../../data/store';
import { useScope } from '../../../layout/filters';
import { focusClub } from '../../../data/selectors';

/*
  Shared AI Vision model for Monitor, Cameras, Camera List, Zones and Zones Live Readings.
  Zones and cameras carry a few editor fields that the scaffold types do not list (the reference build zone editor:
  custom name, operator polygon, pixel threshold, gap seconds, baseline). They are stored as patches
  on the same collections, so every page reads the same values.
*/

export type BaselineMode = 'none' | 'auto' | 'captured';

export interface VZone extends Zone {
  nameEn?: string;
  nameAr?: string;
  operatorPolygon?: [number, number][];
  pixelThreshold?: number;
  gapSec?: number;
  baseline?: BaselineMode;
  baselineAtMs?: number;
  baselineMinutes?: number;
}

export const ZONE_DEFAULTS = { motionThreshold: 3, pixelThreshold: 22, activateSec: 3, releaseSec: 15, gapSec: 5, baselineMinutes: 10 };

type Pick2 = (en: string, ar: string) => string;
type T = (k: string, v?: Record<string, string | number>) => string;

/** Display name: custom name, otherwise "<machine> · Area <n>". The internal code is never the main label. */
export function zoneLabel(z: VZone, m: Pick<Machine, 'nameEn' | 'nameAr'> | undefined, pick: Pick2, t: T): string {
  const custom = pick(z.nameEn ?? '', z.nameAr ?? '');
  if (custom) return custom;
  const mn = m ? pick(m.nameEn, m.nameAr) : '';
  const area = t('cameras.frame.area', { n: z.n });
  return mn ? `${mn} · ${area}` : area;
}

export function feedOf(c: Pick<Camera, 'stream'>): 'rtsp' | 'mjpeg' {
  return /^rtsp:/i.test(c.stream) ? 'rtsp' : 'mjpeg';
}

/** The focus club's AI Vision inventory with live machine states. */
export function useVision() {
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  return useMemo(() => {
    const cameras = d.cameras.filter((c) => c.clubId === club.id);
    const zones = d.zones.filter((z) => z.clubId === club.id) as VZone[];
    const machines = d.machines.filter((m) => m.clubId === club.id);
    const inUse: Record<string, boolean> = {};
    for (const m of machines) inUse[m.id] = d.live.machines[m.id]?.state === 'inUse';
    const zonesByCam = new Map<string, VZone[]>();
    for (const z of zones) {
      const l = zonesByCam.get(z.cameraId) ?? [];
      l.push(z);
      zonesByCam.set(z.cameraId, l);
    }
    for (const l of zonesByCam.values()) l.sort((a, b) => (a.machineId === b.machineId ? a.n - b.n : a.machineId.localeCompare(b.machineId, undefined, { numeric: true })));
    return { club, cameras, zones, machines, inUse, zonesByCam, live: d.live };
  }, [d.cameras, d.zones, d.machines, d.live, club]);
}

/** A counter that moves every `ms` (animation phase and 2 s watcher slots). Paused when `run` is false. */
export function usePhase(ms: number, run = true): number {
  const [n, setN] = useState(() => Math.floor(Date.now() / ms));
  useEffect(() => {
    if (!run) return;
    const id = window.setInterval(() => setN(Math.floor(Date.now() / ms)), ms);
    return () => window.clearInterval(id);
  }, [ms, run]);
  return n;
}

/**
 * Polygons for zones that have none (added cameras, or zones created without an outline): spread along a
 * row so the picture always shows where each machine is watched.
 */
export function ensurePolygons<Z extends VZone>(list: Z[]): Z[] {
  const missing = list.filter((z) => !z.polygon || z.polygon.length < 3);
  if (!missing.length) return list;
  return list.map((z) => {
    if (z.polygon && z.polygon.length >= 3) return z;
    const i = missing.indexOf(z);
    const n = missing.length;
    const w = 0.8 / Math.max(n, 1);
    const x0 = 0.1 + i * w;
    return { ...z, polygon: [[x0, 0.45], [x0 + w * 0.85, 0.45], [x0 + w * 0.85, 0.75], [x0, 0.75]] as [number, number][] };
  });
}
