import { arrivalsByHour, isOpenAt, machineSessions, type Camera, type Club, type Machine } from '../../data';
import { rngFor, int } from '../../data/rng';

/*
  Recording profiles for snapshot history. A profile names cameras, machines and a capture interval;
  each capture keeps one frame per camera from that camera's latest analysis. Machine states at a
  capture come from the same sessions every other AI Vision page uses (machineSessions).
*/

export interface Profile {
  id: string;
  nameEn: string;
  nameAr: string;
  cameraIds: string[];
  machineIds: string[];
  everyMin: number;
  /** Capture window in minutes from midnight (inclusive start, exclusive end). */
  from: number;
  to: number;
  background: boolean;
  enabled: boolean;
}

const CARDIO = new Set(['treadmill', 'slat-treadmill', 'incline-treadmill', 'stair-climber', 'indoor-bike', 'recumbent-bike', 'elliptical', 'adaptive-cross-trainer', 'rower', 'upper-body-ergometer']);

export function seedProfiles(club: Club, cams: Camera[], machines: Machine[]): Profile[] {
  const cardioM = machines.filter((m) => CARDIO.has(m.type));
  const strengthM = machines.filter((m) => !CARDIO.has(m.type));
  const camsOf = (ms: Machine[]) => [...new Set(ms.map((m) => m.cameraId))].filter((id) => cams.some((c) => c.id === id && !c.isTest));
  const studio = cams.filter((c) => /^Studio/.test(c.areaEn)).map((c) => c.id);
  const open = club.hours.open * 60;
  const close = Math.min(24, club.hours.close) * 60;
  return [
    { id: 'sp-cardio', nameEn: 'Cardio evening peak', nameAr: 'ذروة الكارديو المسائية', cameraIds: camsOf(cardioM).slice(0, 4), machineIds: cardioM.map((m) => m.id),
      everyMin: 10, from: 17 * 60, to: 22 * 60, background: true, enabled: true },
    { id: 'sp-weights', nameEn: 'Weights all day', nameAr: 'الأوزان طوال اليوم', cameraIds: camsOf(strengthM), machineIds: strengthM.map((m) => m.id),
      everyMin: 30, from: open, to: close, background: true, enabled: true },
    { id: 'sp-studio', nameEn: 'Studio classes', nameAr: 'حصص الاستوديو', cameraIds: studio.length ? studio : cams.slice(0, 1).map((c) => c.id), machineIds: [],
      everyMin: 15, from: open, to: close, background: false, enabled: true },
  ];
}

/** Capture minutes of a profile today, up to now, newest first. */
export function captureTimes(p: Profile, club: Club, date: string, nowMin: number): number[] {
  const out: number[] = [];
  for (let m = p.from; m < p.to && m <= nowMin; m += p.everyMin) if (isOpenAt(club, date, m)) out.push(m);
  return out.reverse();
}

const sessCache = new Map<string, { start: number; end: number }[]>();
function sessions(m: Machine, club: Club, date: string) {
  const k = `${m.id}|${date}|${m.baseSessions}`;
  let v = sessCache.get(k);
  if (!v) { v = machineSessions(m, club, date); sessCache.set(k, v); }
  return v;
}

export function inUseAt(m: Machine, club: Club, date: string, min: number): boolean {
  return sessions(m, club, date).some((s) => s.start <= min && s.end > min);
}

/** People in a studio frame at a minute: a class in the first 45 minutes of the hour. */
export function peopleAt(cam: Camera, club: Club, date: string, min: number): number {
  const arr = arrivalsByHour(club, date);
  const h = Math.floor(min / 60);
  const peak = Math.max(...arr) || 1;
  const r = rngFor(cam.id, date, Math.floor(min / 15));
  const inClass = (min % 60) < 45;
  return Math.max(0, Math.round((arr[h] / peak) * (inClass ? 18 : 3) + int(r, -2, 2)));
}

const KEY = 'gym.snapshotProfiles';

export function loadProfiles(clubId: string, seed: () => Profile[]): Profile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const all = JSON.parse(raw) as Record<string, Profile[]>;
      if (Array.isArray(all?.[clubId])) return all[clubId];
    }
  } catch { /* storage unavailable */ }
  return seed();
}

export function saveProfiles(clubId: string, list: Profile[]) {
  try {
    const raw = localStorage.getItem(KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, Profile[]>) : {};
    all[clubId] = list;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
