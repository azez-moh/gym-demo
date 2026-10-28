import type { Camera, MachineType, ZoneReading } from '../../../data/types';
import { rngFor } from '../../../data/rng';

/*
  Stylised CCTV scene for one camera. No real footage: a gym floor in perspective, machine silhouettes
  drawn where the camera's zones sit, anonymised person blobs on machines in use and a few walking.
  Coordinates are in a 160 x 90 view box (16:9). Zone polygons are normalised 0..1 and scaled here.
*/

export const VB_W = 160;
export const VB_H = 90;
/** Wall / floor line. Zones never sit above it in practice (their polygons start at y >= 0.04). */
export const HORIZON = 9;

export interface SceneMachine {
  id: string;
  type: MachineType;
  /** Bounding box in view-box units. */
  x: number; y: number; w: number; h: number;
  inUse: boolean;
}

export interface ScenePerson {
  key: string;
  x: number;
  y: number;
  /** Scale with depth (people further back are smaller). */
  s: number;
  walking: boolean;
}

export type Pt = [number, number];

export const toVb = (p: [number, number]): Pt => [p[0] * VB_W, p[1] * VB_H];

export function polyPoints(poly: [number, number][]): string {
  return poly.map((p) => toVb(p).map((v) => v.toFixed(2)).join(',')).join(' ');
}

export function polyBox(polys: [number, number][][]) {
  const pts = polys.flat();
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map((p) => p[0] * VB_W);
  const ys = pts.map((p) => p[1] * VB_H);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Top-left anchor of a polygon (normalised), used for HTML labels positioned in percent. */
export function polyAnchor(poly: [number, number][]): Pt {
  if (!poly.length) return [0, 0];
  const minY = Math.min(...poly.map((p) => p[1]));
  const minX = Math.min(...poly.map((p) => p[0]));
  return [minX, minY];
}

const DECOR_TYPES: MachineType[] = ['flat-bench', 'incline-bench', 'preacher-curl', 'treadmill', 'indoor-bike', 'elliptical'];

/** Background machines for cameras without zones (so the picture is never an empty room). */
export function decorMachines(camera: Camera): SceneMachine[] {
  const r = rngFor(camera.id, 'decor');
  const n = 5 + Math.floor(r() * 3);
  const out: SceneMachine[] = [];
  for (let i = 0; i < n; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const depth = row === 0 ? 0.5 : 0.9;
    out.push({
      id: `${camera.id}:decor${i}`,
      type: DECOR_TYPES[Math.floor(r() * DECOR_TYPES.length)],
      x: 6 + col * 38 + row * 12 + r() * 5,
      y: 22 + row * 30 + r() * 4,
      w: 16 + 12 * depth, h: 12 + 10 * depth,
      inUse: false,
    });
  }
  return out;
}

/** Walking people: a seeded few that drift across the floor with the frame phase. */
export function walkers(camera: Camera, phase: number, count: number): ScenePerson[] {
  const r = rngFor(camera.id, 'walkers');
  const out: ScenePerson[] = [];
  for (let i = 0; i < count; i++) {
    const start = r() * VB_W;
    const speed = 0.8 + r() * 1.2;
    const dir = r() < 0.5 ? 1 : -1;
    const y = HORIZON + 30 + r() * 44;
    const span = VB_W + 24;
    let x = (start + dir * speed * phase) % span;
    if (x < 0) x += span;
    out.push({ key: `w${i}`, x: x - 12, y, s: 0.8 + ((y - HORIZON) / (VB_H - HORIZON)) * 0.5, walking: true });
  }
  return out;
}

/** Person on a machine in use: stands at the machine with a small sway. */
export function riderFor(m: SceneMachine, phase: number): ScenePerson {
  const r = rngFor(m.id, 'rider');
  const sway = Math.sin(phase * 1.7 + r() * 6) * 0.5;
  const cy = m.y + m.h * 0.5;
  return {
    key: `r:${m.id}`,
    x: m.x + m.w * (0.42 + r() * 0.16) + sway,
    y: cy,
    s: 0.8 + ((cy - HORIZON) / (VB_H - HORIZON)) * 0.45,
    walking: false,
  };
}

/** Floor grid lines converging to a vanishing point above the frame. */
export function floorLines(): { x1: number; y1: number; x2: number; y2: number }[] {
  const vx = VB_W / 2, vy = -80;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const t = (HORIZON - vy) / (VB_H - vy);
  for (let i = -8; i <= 18; i++) {
    const bx = i * 12;
    lines.push({ x1: bx, y1: VB_H, x2: vx + (bx - vx) * t, y2: HORIZON });
  }
  for (let k = 1; k <= 8; k++) {
    const y = HORIZON + (VB_H - HORIZON) * (k / 8) ** 1.5;
    lines.push({ x1: 0, y1: y, x2: VB_W, y2: y });
  }
  return lines;
}

/**
 * Zone reading at a 2-second slot. The store refreshes readings every 10 s; between ticks the watcher
 * still reports every 2 s, so motion moves a little around the stored reading (state never flips).
 * Monitor and Zones Live Readings both use this, so they show the same number at the same moment.
 */
export function readingAt(r: ZoneReading, slot: number): ZoneReading {
  const g = rngFor(r.id, 'slot', slot);
  const k = 0.82 + g() * 0.36;
  const motion = Math.round(r.motionPct * k * 10) / 10;
  const base = Math.round(r.baselinePct * (0.9 + g() * 0.2) * 10) / 10;
  return { ...r, motionPct: motion, baselinePct: base };
}

/** Mask the host part of a stream address: rtsp://host:port/path -> rtsp://••••••/path. */
export function maskAddress(url: string): string {
  const m = /^([a-z]+:\/\/)([^/]+)(\/.*)?$/i.exec(url.trim());
  if (!m) return '••••••';
  const path = m[3] ?? '';
  const tail = path.split('/').filter(Boolean).pop() ?? '';
  return `${m[1]}••••••${tail ? `/${tail.replace(/\?.*$/, '')}` : ''}`;
}
