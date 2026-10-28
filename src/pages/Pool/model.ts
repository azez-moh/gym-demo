import { isOpenAt, peopleInAt } from '../../data/dynamics';
import { msAt, presenceOf, type DemoContextValue } from '../../data';
import type { Club } from '../../data/types';
import { clamp, int, rngFor, uniform } from '../../data/rng';

/*
  Pool figures. People in the pool area follow the shared presence model (people in the gym x the pool
  share, as on the BMS pages), capped at the pool capacity. Lanes fill two swimmers at a time before a
  new lane opens (circle swimming), so lanes in use is about half the swimmers. Water temperature and
  hall humidity are seeded per gym and day, with a small drift per live tick.
*/

export const POOL_CAPACITY = 14;
export const POOL_LANES = 5;
export const HUMIDITY_LIMIT = 65;
const POOL_SHARE = 0.06;

type D = Pick<DemoContextValue, 'clubs' | 'districts' | 'machines' | 'cameras' | 'zones' | 'areas' | 'acUnits' | 'lights' | 'live' | 'agents' | 'agentStates' | 'integrations' | 'boards'>;

export function swimmersNow(d: D, club: Club): number {
  const p = presenceOf(d, club.id).find((x) => x.area.id === `${club.id}:pool`);
  const n = p ? p.people : Math.round((d.live.clubs[club.id]?.peopleIn ?? 0) * POOL_SHARE);
  return clamp(n, 0, POOL_CAPACITY);
}

/** Lane of each swimmer (index = swimmer number): fewest first, an empty lane opens when used lanes hold two. */
export function laneAssignment(clubId: string, date: string, n: number): number[] {
  const r = rngFor(clubId, date, 'pool-lanes');
  const order = [0, 1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) { const j = int(r, 0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const counts = [0, 0, 0, 0, 0];
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const used = order.filter((l) => counts[l] > 0);
    const free = order.filter((l) => counts[l] === 0);
    const minUsed = used.length ? Math.min(...used.map((l) => counts[l])) : Infinity;
    const lane = free.length && (minUsed >= 2 || !used.length) ? free[0] : used.reduce((a, b) => (counts[b] < counts[a] ? b : a), used[0]);
    counts[lane]++;
    out.push(lane);
  }
  return out;
}

export interface Climate { waterC: number; humidity: number }

export function poolClimate(clubId: string, date: string, tick: number, swimmers: number): Climate {
  const r = rngFor(clubId, date, 'pool-climate');
  const base = uniform(r, 28.0, 28.5);
  const hBase = uniform(r, 55, 59);
  const drift = Math.sin(tick * 0.37 + uniform(r, 0, 6)) * 0.08;
  return {
    waterC: Math.round((base + drift) * 10) / 10,
    humidity: Math.round(hBase + swimmers * 0.62 + Math.sin(tick * 0.21) * 0.6),
  };
}

/** Swimmers per hour today (average over the hour; hours after now are null). */
export function swimmersByHour(club: Club, date: string, nowMin: number): { hour: number; swimmers: number | null }[] {
  const out: { hour: number; swimmers: number | null }[] = [];
  for (let h = 6; h <= 24; h++) {
    const min = h * 60;
    if (h < 24 && !isOpenAt(club, date, min + 30)) continue;
    if (min > nowMin) { out.push({ hour: h, swimmers: null }); continue; }
    let sum = 0;
    const until = Math.min(min + 60, nowMin + 1);
    let k = 0;
    for (let m = min; m < until; m += 15) { sum += peopleInAt(club, msAt(date, m)) * POOL_SHARE; k++; }
    out.push({ hour: h, swimmers: Math.min(POOL_CAPACITY, Math.round((sum / Math.max(1, k)) * 10) / 10) });
  }
  return out;
}

/** Stable swim pace per lane (m/s in the illustration): lane 1 is the slow lane, lane 5 the fast one. */
export function lanePace(lane: number): number {
  return 0.85 + lane * 0.18;
}

export function swimmerPhase(clubId: string, k: number): number {
  return rngFor(clubId, 'pool-swimmer', k)() * 60;
}
