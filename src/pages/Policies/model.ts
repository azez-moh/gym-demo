import { arrivalsByHour, busyWeight, isOpenAt, type Club } from '../../data';
import { rngFor, normal, chance } from '../../data/rng';

/*
  Camera rules (policies) for one gym. Every figure is derived deterministically from the gym's
  busy profile (busyWeight, arrivalsByHour) and a seed per policy and 5 minute slot, so the same
  minute always shows the same count.
*/

export type Op = 'atLeast' | 'atMost' | 'equals';
export type Kind = 'count' | 'doorway';
export type Detection = 'local' | 'cloud';
export type LogStat = 'latest' | 'min' | 'peak' | 'average';
export type ZoneKey = 'weights' | 'cardio' | 'studio1' | 'studio2' | 'pool' | 'reception' | 'changing' | 'openFloor' | 'track';

export interface Policy {
  id: string;
  nameEn: string;
  nameAr: string;
  kind: Kind;
  zone: ZoneKey;
  /** Camera key (the part of the camera id after the gym id), e.g. "cam-8". */
  cameraKey: string;
  op: Op;
  n: number;
  confirmSec: number;
  detection: Detection;
  logOn: boolean;
  logWindowSec: number;
  logStat: LogStat;
  enabled: boolean;
  /** Only watched while the gym is closed. */
  afterHours?: boolean;
  /** Crossing line position, percent of the image height (doorway rules). */
  lineY?: number;
  /** Line angle in degrees (doorway rules). */
  lineTilt?: number;
}

export const ZONES: { key: ZoneKey; cams: string[]; scale: number; classes?: boolean }[] = [
  { key: 'weights', cams: ['cam-6', 'cam-7', 'cam-5'], scale: 40 },
  { key: 'cardio', cams: ['cam-1', 'cam-2', 'cam-3', 'cam-4'], scale: 22 },
  { key: 'studio1', cams: ['cam-8'], scale: 25, classes: true },
  { key: 'studio2', cams: ['cam-9'], scale: 16, classes: true },
  { key: 'pool', cams: ['cam-11'], scale: 10 },
  { key: 'reception', cams: ['cam-10'], scale: 6.5 },
  { key: 'changing', cams: ['cam-10'], scale: 8 },
  { key: 'openFloor', cams: ['cam-5'], scale: 10 },
  { key: 'track', cams: ['cam-3'], scale: 6 },
];

export const zoneDef = (k: ZoneKey) => ZONES.find((z) => z.key === k) ?? ZONES[0];

export const SEED: Policy[] = [
  { id: 'p-studio1', nameEn: 'Studio 1 over 20 people', nameAr: 'استوديو 1 فوق 20 شخصًا', kind: 'count', zone: 'studio1', cameraKey: 'cam-8',
    op: 'atLeast', n: 21, confirmSec: 30, detection: 'local', logOn: true, logWindowSec: 60, logStat: 'peak', enabled: true },
  { id: 'p-queue', nameEn: 'Reception queue more than 6', nameAr: 'طابور الاستقبال أكثر من 6', kind: 'count', zone: 'reception', cameraKey: 'cam-10',
    op: 'atLeast', n: 7, confirmSec: 60, detection: 'local', logOn: true, logWindowSec: 120, logStat: 'average', enabled: true },
  { id: 'p-lifeguard', nameEn: 'Pool lifeguard post left empty', nameAr: 'خلو نقطة المنقذ في المسبح', kind: 'count', zone: 'pool', cameraKey: 'cam-11',
    op: 'equals', n: 0, confirmSec: 20, detection: 'cloud', logOn: true, logWindowSec: 60, logStat: 'min', enabled: true },
  { id: 'p-entrance', nameEn: 'Main entrance doorway count', nameAr: 'عدّ الدخول من البوابة الرئيسية', kind: 'doorway', zone: 'reception', cameraKey: 'cam-10',
    op: 'atLeast', n: 30, confirmSec: 0, detection: 'local', logOn: true, logWindowSec: 600, logStat: 'latest', enabled: true, lineY: 58, lineTilt: 0 },
  { id: 'p-changing', nameEn: 'Changing rooms corridor after closing', nameAr: 'ممر غرف الملابس بعد الإغلاق', kind: 'count', zone: 'changing', cameraKey: 'cam-10',
    op: 'atLeast', n: 1, confirmSec: 45, detection: 'cloud', logOn: false, logWindowSec: 60, logStat: 'latest', enabled: true, afterHours: true },
  { id: 'p-weights', nameEn: 'Weights crowding', nameAr: 'ازدحام منطقة الأوزان', kind: 'count', zone: 'weights', cameraKey: 'cam-6',
    op: 'atLeast', n: 36, confirmSec: 120, detection: 'local', logOn: true, logWindowSec: 300, logStat: 'average', enabled: false },
];

export function matches(op: Op, v: number, n: number): boolean {
  return op === 'atLeast' ? v >= n : op === 'atMost' ? v <= n : v === n;
}

const loadCache = new Map<string, number[]>();
/** Busy share of each hour of a date, 0..1 (1 = busiest hour of that day). */
function loadOf(club: Club, date: string): number[] {
  const k = `${club.id}|${date}`;
  let v = loadCache.get(k);
  if (!v) {
    const w = Array.from({ length: 24 }, (_, h) => busyWeight(club, date, h));
    const max = Math.max(...w) || 1;
    v = w.map((x) => x / max);
    loadCache.set(k, v);
  }
  return v;
}

function loadAt(club: Club, date: string, min: number): number {
  const l = loadOf(club, date);
  const h = Math.floor(min / 60) % 24;
  const f = (min % 60) / 60;
  const a = l[h], b = l[(h + 1) % 24];
  return a + (b - a) * f;
}

/** Whether the rule is watched at this minute. */
export function isWatched(p: Policy, club: Club, date: string, min: number): boolean {
  const open = isOpenAt(club, date, min);
  return p.afterHours ? !open : open;
}

/** Entries through the doorway in the 10 minutes up to `min`. */
function entriesLast10(p: Policy, club: Club, date: string, min: number): number {
  const arr = arrivalsByHour(club, date);
  const rate = arr[Math.floor(min / 60) % 24] / 60;
  const r = rngFor(club.id, date, p.id, Math.floor(min / 5));
  return Math.max(0, Math.round(rate * 10 * 0.92 * (1 + normal(r, 0, 0.18))));
}

/** People counted in the rule's zone (or doorway entries in 10 minutes) at a minute of the day. */
export function valueAt(p: Policy, club: Club, date: string, min: number): number {
  if (p.kind === 'doorway') return entriesLast10(p, club, date, min);
  const z = zoneDef(p.zone);
  const r = rngFor(club.id, date, p.id, Math.floor(min / 5));
  const open = isOpenAt(club, date, min);
  if (p.zone === 'pool' && p.op === 'equals' && p.n === 0) {
    // lifeguard post: one person almost always, a short gap now and then
    if (!open) return 0;
    return chance(r, 0.035) ? 0 : chance(r, 0.15) ? 2 : 1;
  }
  if (!open) {
    // after hours: cleaning staff now and then
    return p.zone === 'changing' && chance(r, 0.06) ? 1 : 0;
  }
  let exp = z.scale * loadAt(club, date, min);
  if (z.classes) exp *= (min % 60) < 45 ? 1 : 0.18;
  const v = exp + normal(r, 0, Math.max(0.6, Math.sqrt(exp) * 0.55));
  return Math.max(0, Math.round(v));
}

/** Doorway crossings since midnight up to `min`: in and out. */
export function doorwayToday(club: Club, date: string, min: number, peopleIn: number): { inN: number; outN: number } {
  const arr = arrivalsByHour(club, date);
  let total = 0;
  const h = Math.floor(min / 60);
  for (let i = 0; i < h; i++) total += arr[i];
  total += arr[h % 24] * ((min % 60) / 60);
  const inN = Math.round(total * 0.92);
  return { inN, outN: Math.max(0, inN - peopleIn) };
}

export interface PolicyEval { value: number; watched: boolean; triggered: boolean; alerts: number; lastAt?: number }

/** Evaluate a rule over today in 5 minute steps up to now. */
export function evaluate(p: Policy, club: Club, date: string, nowMin: number): PolicyEval {
  let prev = false, alerts = 0;
  let lastAt: number | undefined;
  if (p.enabled) {
    for (let m = 0; m <= nowMin; m += 5) {
      const on = isWatched(p, club, date, m) && matches(p.op, valueAt(p, club, date, m), p.n);
      if (on && !prev) { alerts++; lastAt = m; }
      prev = on;
    }
  }
  const watched = isWatched(p, club, date, nowMin);
  const value = valueAt(p, club, date, nowMin);
  return { value, watched, triggered: p.enabled && watched && matches(p.op, value, p.n), alerts, lastAt };
}

/** Count over the last two hours, every 5 minutes. */
export function history(p: Policy, club: Club, date: string, nowMin: number): { min: number; v: number }[] {
  const out: { min: number; v: number }[] = [];
  const start = Math.max(0, nowMin - 120);
  for (let m = start - (start % 5); m <= nowMin; m += 5) out.push({ min: m, v: valueAt(p, club, date, m) });
  return out;
}

const KEY = 'gym.policies';

export function loadPolicies(clubId: string): Policy[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, Policy[]>;
      if (Array.isArray(all?.[clubId])) return all[clubId];
    }
  } catch { /* storage unavailable */ }
  return SEED.map((p) => ({ ...p }));
}

export function savePolicies(clubId: string, list: Policy[]) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Policy[]>) : {};
    all[clubId] = list;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
