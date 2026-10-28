import type {
  AcLive, ActivityEntry, Alert, Club, ClubLive, Level, LightLive, LiveData, Machine, MachineLive, Session, StaticData, ZoneReading,
} from './types';
import { LIVE_CLUB_ID } from './clubs';
import { chance, clamp, int, lognormal, normal, pick, rngFor, uniform, weightedPick } from './rng';
import { addDays, dowOf, localParts, msAt } from './time';
import { VISIT_FACTOR } from './fleet';

/*
  Time-dependent generators. Every function is pure and seeded by (id, date, stream), so a given
  day always yields the same numbers. Per-day results are cached in module scope.
*/

// ---------- opening hours and busy profile ----------

/** Relative arrivals by hour of day (men's clubs peak in the evening, women's also late morning). */
const PROFILE_MEN = [0.35, 0.12, 0, 0, 0, 0.15, 0.45, 0.55, 0.5, 0.45, 0.42, 0.4, 0.4, 0.42, 0.48, 0.58, 0.72, 0.88, 1, 1, 0.94, 0.8, 0.62, 0.46];
const PROFILE_WOMEN = [0.1, 0, 0, 0, 0, 0.1, 0.4, 0.6, 0.75, 0.85, 0.82, 0.7, 0.55, 0.5, 0.52, 0.6, 0.75, 0.9, 1, 0.92, 0.75, 0.55, 0.35, 0.15];

/** Day-of-week factor (0 = Sunday). Friday is the quiet day. */
const DOW_FACTOR = [1.04, 1.02, 1.03, 1.0, 0.94, 0.78, 0.92];

function hoursFor(club: Club, dow: number) {
  const h = club.hours;
  if (dow === 5 && h.fri) return h.fri;
  if (dow === 6 && h.sat) return h.sat;
  return { open: h.open, close: h.close };
}

/** Is the club open at this local minute of `date`? Handles closing after midnight (close > 24). */
export function isOpenAt(club: Club, date: string, minuteOfDay: number): boolean {
  const today = hoursFor(club, dowOf(date));
  const m = minuteOfDay / 60;
  if (m >= today.open && m < Math.min(24, today.close)) return true;
  const prev = hoursFor(club, dowOf(addDays(date, -1)));
  return prev.close > 24 && m < prev.close - 24;
}

/** Busy weight of an hour for a club on a date (0 when closed). */
export function busyWeight(club: Club, date: string, hour: number): number {
  if (!isOpenAt(club, date, hour * 60 + 30)) return 0;
  return (club.gender === 'women' ? PROFILE_WOMEN : PROFILE_MEN)[hour];
}

export function dowFactor(date: string): number {
  return DOW_FACTOR[dowOf(date)];
}

// ---------- visits and people in ----------

const AVG_STAY_MIN = 90;
const visitCache = new Map<string, number[]>();

/** Arrivals per hour for a club on a date (24 values). Daily visits are about 3.2 x capacity (x VISIT_FACTOR in fleet.ts). */
export function arrivalsByHour(club: Club, date: string): number[] {
  const key = `${club.id}|${date}`;
  const hit = visitCache.get(key);
  if (hit) return hit;
  const r = rngFor(club.id, date, 'visits');
  const daily = club.capacity * 3.2 * (VISIT_FACTOR[club.id] ?? 1) * dowFactor(date) * lognormal(r, 1, 0.08);
  const w = Array.from({ length: 24 }, (_, h) => busyWeight(club, date, h));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const out = w.map((x) => (x > 0 ? Math.max(0, (daily * x) / sum * lognormal(r, 1, 0.12)) : 0));
  visitCache.set(key, out);
  return out;
}

export function peopleTodayAt(club: Club, ms: number): number {
  const p = localParts(ms);
  const a = arrivalsByHour(club, p.date);
  let n = 0;
  for (let h = 0; h < p.hour; h++) n += a[h];
  n += a[p.hour] * (p.minute / 60);
  return Math.round(n);
}

export function peopleInAt(club: Club, ms: number): number {
  const p = localParts(ms);
  if (!isOpenAt(club, p.date, p.minuteOfDay)) return 0;
  // people who arrived within the last AVG_STAY_MIN minutes
  let n = 0;
  for (let back = 0; back < AVG_STAY_MIN; back += 5) {
    const q = localParts(ms - back * 60_000);
    n += (arrivalsByHour(club, q.date)[q.hour] / 60) * 5;
  }
  const r = rngFor(club.id, p.date, p.hour, Math.floor(p.minute / 2), 'jitter');
  return Math.max(0, Math.min(Math.round(club.capacity * 1.05), Math.round(n * (1 + normal(r, 0, 0.03)))));
}

// ---------- machine sessions ----------

const sessionCache = new Map<string, Session[]>();

/** Usage sessions of one machine on one date (minutes from local midnight; may run past 1440 when open after midnight). */
export function machineSessions(machine: Machine, club: Club, date: string): Session[] {
  const key = `${machine.id}|${date}`;
  const hit = sessionCache.get(key);
  if (hit) return hit;
  const r = rngFor(machine.id, date, 'sessions');
  const n = machine.enabled ? Math.max(0, Math.round(machine.baseSessions * dowFactor(date) * lognormal(r, 1, 0.14))) : 0;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const weights = hours.map((h) => busyWeight(club, date, h));
  const starts: number[] = [];
  if (weights.some((w) => w > 0)) {
    for (let i = 0; i < n; i++) starts.push(weightedPick(r, hours, weights) * 60 + Math.floor(r() * 60));
  }
  starts.sort((a, b) => a - b);
  const out: Session[] = [];
  let free = 0;
  for (const s0 of starts) {
    const s = Math.max(s0, free);
    const dur = clamp(lognormal(r, machine.avgSessionMin, 0.45), 2, 75);
    const e = s + dur;
    if (s >= 1440) break;
    out.push({ start: Math.round(s * 10) / 10, end: Math.round(e * 10) / 10 });
    free = e + 1 + r() * 4;
  }
  sessionCache.set(key, out);
  return out;
}

/** Live state of a machine at an instant (from its sessions). Cooling = released within the last minute. */
export function machineLiveAt(machine: Machine, club: Club, ms: number): MachineLive {
  const p = localParts(ms);
  const now = p.minuteOfDay + p.second / 60;
  const ss = machineSessions(machine, club, p.date);
  let sessionsToday = 0;
  let usedMinToday = 0;
  let state: MachineLive['state'] = 'idle';
  let sinceMin = now;
  for (const s of ss) {
    if (s.start > now) break;
    sessionsToday++;
    usedMinToday += Math.min(s.end, now) - s.start;
    if (s.end > now) { state = 'inUse'; sinceMin = now - s.start; }
    else { sinceMin = now - s.end; state = sinceMin < 1 ? 'cooling' : 'idle'; }
  }
  return { id: machine.id, state, sessionsToday, usedMinToday: Math.round(usedMinToday), sinceMin: Math.round(sinceMin) };
}

// ---------- energy ----------

export interface EnergyHour { hour: number; kwh: number; baselineKwh: number }
const energyCache = new Map<string, EnergyHour[]>();

/** 0 in January, 1 in July (outside temperature driver). */
function summerness(date: string): number {
  const m = Number(date.slice(5, 7)) - 1;
  return (1 - Math.cos(((m + 0.5) / 12) * 2 * Math.PI - 0.55)) / 2;
}

/** Share of energy avoided by the agents on a day (vs the same weekday before they were switched on). */
export function savingShare(club: Club, date: string): number {
  const r = rngFor(club.id, date, 'saving');
  return uniform(r, 0.085, 0.15);
}

/** Hourly energy of a club on a date: metered kWh and the baseline it is compared against. */
export function energyHours(club: Club, date: string): EnergyHour[] {
  const key = `${club.id}|${date}`;
  const hit = energyCache.get(key);
  if (hit) return hit;
  const r = rngFor(club.id, date, 'energy');
  const s = summerness(date);
  const save = savingShare(club, date);
  const out: EnergyHour[] = [];
  for (let h = 0; h < 24; h++) {
    const open = isOpenAt(club, date, h * 60 + 30);
    const busy = busyWeight(club, date, h);
    const heat = 0.62 + 0.55 * s * (h >= 11 && h <= 17 ? 1.15 : 0.9);
    const base = club.areaM2 * (0.008 + (open ? 0.016 + 0.012 * busy : 0)) * heat * lognormal(r, 1, 0.05);
    const kwh = base * (1 - save * (open ? 1 : 1.4));
    out.push({ hour: h, kwh: Math.round(kwh * 10) / 10, baselineKwh: Math.round(base * 10) / 10 });
  }
  energyCache.set(key, out);
  return out;
}

export function energyDay(club: Club, date: string, uptoMinute = 1440): { kwh: number; baselineKwh: number } {
  let kwh = 0;
  let baselineKwh = 0;
  for (const e of energyHours(club, date)) {
    const f = clamp((uptoMinute - e.hour * 60) / 60, 0, 1);
    kwh += e.kwh * f;
    baselineKwh += e.baselineKwh * f;
  }
  return { kwh, baselineKwh };
}

// ---------- alerts ----------

interface AlertTpl { level: Level; source: Alert['source']; en: string; ar: string; areaEn: string; areaAr: string }

/** Live gym: the open items shown in the demo. */
const LIVE_ALERTS: (AlertTpl & { agoMin: number })[] = [
  { level: 'critical', source: 'hvac', en: 'Gym area 6.5 °C over its setpoint for 2 h 05 min', ar: 'صالة التمارين أعلى من درجة الضبط بمقدار 6.5 درجة منذ 2 س 5 د', areaEn: 'First floor, gym area', areaAr: 'الطابق الأول، صالة التمارين', agoMin: 125 },
  { level: 'critical', source: 'fire', en: 'Sprinkler zone valve reported closed', ar: 'صمام منطقة الرشاشات مغلق', areaEn: 'Ground floor, zone 1', areaAr: 'الطابق الأرضي، المنطقة 1', agoMin: 37 },
  { level: 'warning', source: 'sensor', en: 'Supply air sensor reads 55 °C, likely a failed probe', ar: 'حساس هواء الإمداد يقرأ 55 درجة، والأرجح أن المجس معطل', areaEn: 'Roof, AHU-02', areaAr: 'السطح، AHU-02', agoMin: 140 },
  { level: 'warning', source: 'power', en: 'Board DB-1 at 88% of its rating during the evening peak', ar: 'اللوحة DB-1 عند 88% من قدرتها وقت ذروة المساء', areaEn: 'First floor, DB-1', areaAr: 'الطابق الأول، DB-1', agoMin: 64 },
  { level: 'warning', source: 'access', en: 'Service door held open for 11 minutes', ar: 'باب الخدمة بقي مفتوحًا 11 دقيقة', areaEn: 'Ground floor, staff area', areaAr: 'الطابق الأرضي، منطقة الموظفين', agoMin: 18 },
  { level: 'info', source: 'sensor', en: 'CO₂ above 1,100 ppm in the functional area', ar: 'ثاني أكسيد الكربون أعلى من 1,100 جزء في المليون في منطقة التمارين الوظيفية', areaEn: 'First floor, functional', areaAr: 'الطابق الأول، منطقة التمارين الوظيفية', agoMin: 29 },
  { level: 'info', source: 'reporting', en: 'Daily energy close has not written any rows yet', ar: 'لم يسجل إقفال الطاقة اليومي أي بيانات بعد', areaEn: 'Network reporting', areaAr: 'تقارير الشبكة', agoMin: 95 },
];

const ALERT_POOL: AlertTpl[] = [
  { level: 'warning', source: 'hvac', en: 'Swimming pool hall humidity above 65%', ar: 'رطوبة صالة المسبح أعلى من 65%', areaEn: 'Ground floor, swimming pool', areaAr: 'الطابق الأرضي، المسبح' },
  { level: 'warning', source: 'hvac', en: 'Chiller 1 short-cycling since 4 PM', ar: 'المبرد 1 يعمل ويتوقف بشكل متكرر منذ 4 م', areaEn: 'Roof, chiller 1', areaAr: 'السطح، المبرد 1' },
  { level: 'critical', source: 'hvac', en: 'Cardio area 4 °C above its comfort band', ar: 'منطقة الكارديو أعلى من نطاق الراحة بأربع درجات', areaEn: 'First floor, cardio area', areaAr: 'الطابق الأول، منطقة الكارديو' },
  { level: 'info', source: 'power', en: 'Lighting left on in the functional area overnight', ar: 'إضاءة منطقة التمارين الوظيفية بقيت مضاءة طوال الليل', areaEn: 'First floor, functional', areaAr: 'الطابق الأول، منطقة التمارين الوظيفية' },
  { level: 'info', source: 'access', en: 'Door contact noisy at the west entrance', ar: 'إشارات متذبذبة من حساس باب المدخل الغربي', areaEn: 'Ground floor, west entrance', areaAr: 'الطابق الأرضي، المدخل الغربي' },
  { level: 'warning', source: 'vision', en: 'Camera offline for 25 minutes', ar: 'كاميرا غير متصلة منذ 25 دقيقة', areaEn: 'Gym area', areaAr: 'صالة التمارين' },
  { level: 'warning', source: 'sensor', en: 'Locker room extract fan not running', ar: 'مروحة شفط غرف الخزائن متوقفة', areaEn: 'Ground floor, locker rooms', areaAr: 'الطابق الأرضي، غرف الخزائن' },
  { level: 'info', source: 'hvac', en: 'Filter change due on AHU-01 this week', ar: 'موعد تغيير فلتر AHU-01 هذا الأسبوع', areaEn: 'Roof, AHU-01', areaAr: 'السطح، AHU-01' },
];

export function alertsFor(club: Club, ms: number): Alert[] {
  const p = localParts(ms);
  if (club.id === LIVE_CLUB_ID) {
    return LIVE_ALERTS.map((a, i) => ({
      id: `${club.id}:a${i}`, clubId: club.id, level: a.level, source: a.source, titleEn: a.en, titleAr: a.ar,
      areaEn: a.areaEn, areaAr: a.areaAr, sinceMs: ms - a.agoMin * 60_000, status: 'open',
    }));
  }
  const r = rngFor(club.id, p.date, 'alerts');
  const n = int(r, 0, 3);
  const used = new Set<number>();
  const out: Alert[] = [];
  for (let i = 0; i < n; i++) {
    let k = int(r, 0, ALERT_POOL.length - 1);
    while (used.has(k)) k = (k + 1) % ALERT_POOL.length;
    used.add(k);
    const a = ALERT_POOL[k];
    out.push({
      id: `${club.id}:${p.date}:a${k}`, clubId: club.id, level: a.level, source: a.source, titleEn: a.en, titleAr: a.ar,
      areaEn: a.areaEn, areaAr: a.areaAr, sinceMs: msAt(p.date, int(r, 6 * 60, Math.max(6 * 60 + 1, p.minuteOfDay))), status: 'open',
    });
  }
  return out.filter((a) => a.sinceMs <= ms);
}

// ---------- agent activity ----------

const ACTIVITY_TPL: Record<string, { en: string; ar: string }[]> = {
  hvac: [
    { en: 'Set back {area} by 2 °C after 20 s with nobody seen', ar: 'خفض تبريد {area} درجتين بعد 20 ث دون رصد أحد' },
    { en: 'Restored {area} to its setpoint as people arrived', ar: 'أعاد {area} إلى درجة الضبط عند وصول الأشخاص' },
  ],
  sensor: [{ en: 'Occupancy in {area} rose to {n} people', ar: 'ارتفع الإشغال في {area} إلى {n} أشخاص' }],
  lighting: [
    { en: 'Dimmed {area} to 40% with low occupancy', ar: 'خفض إضاءة {area} إلى 40% لانخفاض الإشغال' },
    { en: 'Switched on {area} lights for the evening peak', ar: 'شغل إضاءة {area} لذروة المساء' },
  ],
  power: [{ en: 'Delayed the water heater start by 15 minutes at peak', ar: 'أخر تشغيل سخان المياه 15 دقيقة وقت الذروة' }],
  energy: [{ en: 'Avoided {n} kWh in the last hour against the baseline', ar: 'وفر {n} كيلوواط ساعة في الساعة الماضية مقارنة بخط الأساس' }],
  'fire-alarm': [{ en: 'Panel healthy, {n} detectors reporting', ar: 'اللوحة سليمة، و{n} كاشفًا يرسل قراءاته' }],
  'fire-fighting': [{ en: 'Sprinkler pressure normal on every floor', ar: 'ضغط الرشاشات طبيعي في جميع الطوابق' }],
};
const ACT_AREAS = [['the cardio area', 'منطقة الكارديو'], ['the gym area', 'صالة التمارين'], ['the functional area', 'منطقة التمارين الوظيفية'], ['the locker rooms', 'غرف الخزائن'], ['the swimming pool hall', 'صالة المسبح'], ['the boxing area', 'منطقة الملاكمة'], ['the freestyle area', 'منطقة التمارين الحرة']];
/** Training areas held at 22 °C; every other area at 23 °C (same rule as the FM overview normal setpoint). */
export const TRAINING_KEYS = new Set(['gym', 'cardio', 'functional', 'boxing', 'freestyle', 'performance', 'pt']);

/** Agent activity of a club over the last `hours` hours, newest first (one slot every 12 minutes). */
export function activityFor(club: Club, ms: number, hours = 6): ActivityEntry[] {
  const slot = 12 * 60_000;
  const last = Math.floor(ms / slot) * slot;
  const out: ActivityEntry[] = [];
  const agents = Object.keys(ACTIVITY_TPL);
  for (let t = last; t > ms - hours * 3600_000; t -= slot) {
    const r = rngFor(club.id, t, 'activity');
    if (!chance(r, club.id === LIVE_CLUB_ID ? 0.85 : 0.5)) continue;
    const agentId = pick(r, agents);
    const tpl = pick(r, ACTIVITY_TPL[agentId]);
    const area = pick(r, ACT_AREAS);
    const n = String(int(r, 4, 48));
    const at = t + int(r, 0, 11) * 60_000 + int(r, 0, 59) * 1000;
    if (at > ms) continue;
    out.push({
      id: `${club.id}:${t}`, clubId: club.id, agentId, atMs: at,
      textEn: tpl.en.replace('{area}', area[0]).replace('{n}', n),
      textAr: tpl.ar.replace('{area}', area[1]).replace('{n}', n),
    });
  }
  return out;
}

// ---------- full live snapshot ----------

export function buildLive(s: StaticData, ms: number): LiveData {
  const p = localParts(ms);
  const clubById = new Map(s.clubs.map((c) => [c.id, c]));
  const machines: Record<string, MachineLive> = {};
  for (const m of s.machines) machines[m.id] = machineLiveAt(m, clubById.get(m.clubId)!, ms);

  const zones: Record<string, ZoneReading> = {};
  for (const z of s.zones) {
    const st = machines[z.machineId]?.state;
    const r = rngFor(z.id, Math.floor(ms / 10_000));
    const active = st === 'inUse';
    zones[z.id] = {
      id: z.id, active,
      motionPct: Math.round((active ? uniform(r, 6, 38) : uniform(r, 0, 1.4)) * 10) / 10,
      baselinePct: Math.round((active ? uniform(r, 8, 30) : uniform(r, 0, 3)) * 10) / 10,
    };
  }

  const alerts: Alert[] = [];
  const activity: ActivityEntry[] = [];
  const clubs: Record<string, ClubLive> = {};
  const ac: Record<string, AcLive> = {};
  const lights: Record<string, LightLive> = {};

  for (const c of s.clubs) {
    const open = isOpenAt(c, p.date, p.minuteOfDay);
    const peopleIn = peopleInAt(c, ms);
    const occ = c.capacity ? peopleIn / c.capacity : 0;
    const ms_ = s.machines.filter((m) => m.clubId === c.id && m.enabled);
    const inUse = ms_.filter((m) => machines[m.id].state === 'inUse').length;
    const sessionsToday = ms_.reduce((a, m) => a + machines[m.id].sessionsToday, 0);
    const e = energyDay(c, p.date, p.minuteOfDay);
    const eh = energyHours(c, p.date)[p.hour];
    const ca = alertsFor(c, ms);
    alerts.push(...ca);
    activity.push(...activityFor(c, ms));
    const crit = ca.filter((a) => a.level === 'critical').length;
    const rc = rngFor(c.id, p.date, 'comfort');

    for (const u of s.acUnits.filter((x) => x.clubId === c.id)) {
      const r = rngFor(u.id, p.date, p.hour);
      const area = s.areas.find((a) => a.id === u.areaId)!;
      const on = open || (area.share > 0.12 && chance(r, 0.2));
      const setpoint = TRAINING_KEYS.has(area.id.slice(area.id.lastIndexOf(':') + 1)) ? 22 : 23;
      let reading = setpoint + (on ? normal(r, 0.4, 0.6) : uniform(r, 3, 6));
      if (c.id === LIVE_CLUB_ID && area.id.endsWith(':gym') && u.id.endsWith(':ac1')) reading = 31.8;
      ac[u.id] = {
        id: u.id, on, mode: 'cool', fan: on ? (occ > 0.5 ? 'high' : 'auto') : 'low', setpoint,
        reading: Math.round(reading * 10) / 10, powerKw: on ? Math.round(u.ratedKw * uniform(r, 0.45, 0.85) * 10) / 10 : 0,
      };
    }
    for (const l of s.lights.filter((x) => x.clubId === c.id)) {
      const r = rngFor(l.id, p.date, p.hour);
      const on = open;
      const level = on ? (occ < 0.2 ? 40 : 100) : 0;
      lights[l.id] = { id: l.id, on, lit: on ? Math.round(l.fittings * (level / 100) + (chance(r, 0.1) ? -1 : 0)) : 0, level };
    }

    clubs[c.id] = {
      clubId: c.id,
      peopleIn,
      peopleToday: peopleTodayAt(c, ms),
      occupancyPct: Math.round(occ * 100),
      machinesInUse: inUse,
      machineUsagePct: ms_.length ? Math.round((inUse / ms_.length) * 100) : 0,
      sessionsToday,
      energyTodayKwh: Math.round(e.kwh),
      baselineTodayKwh: Math.round(e.baselineKwh),
      powerKw: Math.round(eh.kwh * 10) / 10,
      comfortPct: Math.round(uniform(rc, 90, 99)) - (crit ? 4 : 0),
      openAlerts: ca.length,
      criticalAlerts: crit,
      status: crit ? 'critical' : ca.some((a) => a.level === 'warning') ? 'warning' : 'ok',
      isOpen: open,
    };
  }
  activity.sort((a, b) => b.atMs - a.atMs);
  alerts.sort((a, b) => (a.level === b.level ? b.sinceMs - a.sinceMs : levelRank(a.level) - levelRank(b.level)));
  return { nowMs: ms, date: p.date, hour: p.hour, minute: p.minute, clubs, machines, zones, ac, lights, alerts, activity };
}

function levelRank(l: Level): number {
  return l === 'critical' ? 0 : l === 'warning' ? 1 : 2;
}
