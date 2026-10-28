import { isOpenAt, peopleInAt } from '../../data/dynamics';
import { msAt, presenceOf, type DemoContextValue } from '../../data';
import type { Club } from '../../data/types';
import { clamp, rngFor, uniform } from '../../data/rng';

/*
  Jacuzzi figures. People in the wellness area (the "Sauna" BMS area, which holds the jacuzzis) follow the
  shared presence model; the jacuzzis take part of it, the larger share in Jacuzzi 1. Each seats six.
  Water temperatures are seeded per gym and day with a small drift per live tick.
*/

export const JACUZZI_SEATS = 6;
const WELLNESS_SHARE = 0.04;
const SPLIT = [0.36, 0.26];

type D = Pick<DemoContextValue, 'clubs' | 'districts' | 'machines' | 'cameras' | 'zones' | 'areas' | 'acUnits' | 'lights' | 'live' | 'agents' | 'agentStates' | 'integrations' | 'boards'>;

export function jacuzziPeople(d: D, club: Club): [number, number] {
  const p = presenceOf(d, club.id).find((x) => x.area.id === `${club.id}:spa`);
  const n = p ? p.people : (d.live.clubs[club.id]?.peopleIn ?? 0) * WELLNESS_SHARE;
  const r = rngFor(club.id, d.live.date, d.live.hour, Math.floor(d.live.minute / 10), 'jacuzzi');
  const a = clamp(Math.round(n * SPLIT[0] + uniform(r, -0.4, 0.4)), 0, JACUZZI_SEATS);
  const b = clamp(Math.round(n * SPLIT[1] + uniform(r, -0.4, 0.4)), 0, JACUZZI_SEATS);
  return [a, b];
}

export function jacuzziTemps(clubId: string, date: string, tick: number): [number, number] {
  const r = rngFor(clubId, date, 'jacuzzi-temp');
  const a = uniform(r, 37.6, 38.2) + Math.sin(tick * 0.31) * 0.1;
  const b = uniform(r, 36.8, 37.4) + Math.sin(tick * 0.27 + 2) * 0.1;
  return [Math.round(a * 10) / 10, Math.round(b * 10) / 10];
}

/** Average people in each jacuzzi per hour today (hours after now are null). */
export function jacuzzisByHour(club: Club, date: string, nowMin: number): { hour: number; j1: number | null; j2: number | null }[] {
  const out: { hour: number; j1: number | null; j2: number | null }[] = [];
  for (let h = 6; h <= 24; h++) {
    const min = h * 60;
    if (h < 24 && !isOpenAt(club, date, min + 30)) continue;
    if (min > nowMin) { out.push({ hour: h, j1: null, j2: null }); continue; }
    let sum = 0;
    let k = 0;
    const until = Math.min(min + 60, nowMin + 1);
    for (let m = min; m < until; m += 15) { sum += peopleInAt(club, msAt(date, m)) * WELLNESS_SHARE; k++; }
    const avg = sum / Math.max(1, k);
    const r = rngFor(club.id, date, h, 'jacuzzi-hour');
    out.push({
      hour: h,
      j1: Math.round(clamp(avg * SPLIT[0] * uniform(r, 0.85, 1.15), 0, JACUZZI_SEATS) * 10) / 10,
      j2: Math.round(clamp(avg * SPLIT[1] * uniform(r, 0.85, 1.15), 0, JACUZZI_SEATS) * 10) / 10,
    });
  }
  return out;
}

/** Jets start on where people are seated (a demo control the operator can switch). */
export function defaultJets(people: [number, number]): [boolean, boolean] {
  return [people[0] > 0, people[1] > 0];
}
