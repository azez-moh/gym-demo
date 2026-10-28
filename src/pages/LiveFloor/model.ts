import type { Club, Machine, MachineState, MachineType } from '../../data/types';
import { machineSessions, isOpenAt } from '../../data/dynamics';

/*
  Page-local helpers for the Live Floor: states at any minute of today (time slider replay),
  floor canvases ("canvas" select with name and big floor label, kept in this browser),
  and small colour helpers. All derive from the shared data store; nothing here is shared.
*/

export type ShownState = MachineState | 'out';

/** State of a machine at a minute of a date (replay), from its sessions. Out of service when disabled. */
export function stateAt(m: Machine, club: Club, date: string, minute: number): { state: ShownState; sinceMin: number } {
  if (!m.enabled) return { state: 'out', sinceMin: 0 };
  const ss = machineSessions(m, club, date);
  let state: ShownState = 'idle';
  let since = minute;
  for (const s of ss) {
    if (s.start > minute) break;
    if (s.end > minute) { state = 'inUse'; since = minute - s.start; }
    else { since = minute - s.end; state = since < 1 ? 'cooling' : 'idle'; }
  }
  return { state, sinceMin: Math.round(since) };
}

/** Sessions started on a date before a minute (replay). */
export function sessionsUpTo(m: Machine, club: Club, date: string, minute: number): number {
  let n = 0;
  for (const s of machineSessions(m, club, date)) { if (s.start >= minute) break; n++; }
  return n;
}

/** Minutes one machine has been in use on a date, from opening up to a minute (replay). */
export function usedUpTo(m: Machine, club: Club, date: string, minute: number): number {
  let used = 0;
  for (const s of machineSessions(m, club, date)) {
    if (s.start >= minute) break;
    used += Math.min(s.end, minute) - s.start;
  }
  return used;
}

/** Minutes of use of one machine per hour of a date, up to a minute. */
export function hourlyUse(m: Machine, club: Club, date: string, upto: number): number[] {
  const out = new Array(24).fill(0);
  for (const s of machineSessions(m, club, date)) {
    if (s.start >= upto) break;
    const e = Math.min(s.end, upto);
    for (let t = s.start; t < e; t += 1) out[Math.floor((t % 1440) / 60)] += Math.min(1, e - t);
  }
  return out.map((x) => Math.round(x));
}

/** First open minute of the day (for the replay slider start). */
export function openingMinute(club: Club, date: string): number {
  // start of the day's own opening (ignores late hours carried over from the night before)
  for (let m = 240; m < 1440; m += 15) if (isOpenAt(club, date, m)) return m;
  return 0;
}

// ---------- floor canvases (canvas select, + New, Name, Floor label, Label X / Z, Label size, Save, Delete) ----------

export interface Placement { x: number; z: number; rot: number }

export interface FloorCanvasDef {
  id: string;
  name: string;
  label: string;
  labelX: number;
  labelZ: number;
  labelSize: number;
  /** Placements for canvases other than the main one; the main floor uses the machines' own positions. */
  placements?: Record<string, Placement>;
}

const LS_KEY = 'opt.liveFloor.canvases.v1';

export const MAIN_CANVAS: FloorCanvasDef = { id: 'cardio', name: 'Cardio', label: 'CARDIO', labelX: 0, labelZ: 0, labelSize: 1 };

export function readCanvases(clubId: string): FloorCanvasDef[] {
  try {
    const raw = localStorage.getItem(`${LS_KEY}:${clubId}`);
    if (raw) {
      const list = JSON.parse(raw) as FloorCanvasDef[];
      if (Array.isArray(list) && list.length) return list;
    }
  } catch { /* storage unavailable */ }
  return [MAIN_CANVAS];
}

export function writeCanvases(clubId: string, list: FloorCanvasDef[]) {
  try { localStorage.setItem(`${LS_KEY}:${clubId}`, JSON.stringify(list)); } catch { /* keep in memory */ }
}

// ---------- colour helpers ----------

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p: number, s: number) => (p >> s) & 255;
  const m = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t);
  return `#${[m(16), m(8), m(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Colour of a 0..1 value on a sequential palette. */
export function seqColor(seq: string[], v: number): string {
  const x = Math.max(0, Math.min(1, v)) * (seq.length - 1);
  const i = Math.min(seq.length - 2, Math.floor(x));
  return mixHex(seq[i], seq[i + 1], x - i);
}

export const FAMILY_ORDER: MachineType[] = [
  'treadmill', 'slat-treadmill', 'incline-treadmill', 'elliptical', 'adaptive-cross-trainer', 'stair-climber',
  'indoor-bike', 'recumbent-bike', 'rower', 'upper-body-ergometer', 'flat-bench', 'incline-bench', 'preacher-curl', 'standing-preacher',
];

/** Human location on the floor from the position: row from the front (z) and side (x). Keys under liveFloor.loc. */
export function locationOf(x: number, z: number): { row: number; side: 'west' | 'centre' | 'east' } {
  const row = z < 2 ? 1 : z < 5.5 ? 2 : z < 7.6 ? 3 : z < 10.5 ? 4 : 5;
  const side = x < -3.5 ? 'west' : x > 3.5 ? 'east' : 'centre';
  return { row, side };
}
