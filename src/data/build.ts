import type {
  AcUnit, AgentDef, Area, BmsSettings, Board, Camera, Club, Integration, LightCircuit, Machine, StaticData, Zone,
} from './types';
import { buildClubs, DISTRICTS, LIVE_CLUB_ID } from './clubs';
import { DEMO_PLACEMENTS } from './floorData';
import { buildLibrary } from './library';
import { clamp, int, rngFor, uniform } from './rng';
import { demandShare, LIVE_SESSION_MIN, REQUIRED_TYPES, SERVICE_INTERVAL_H, SESSION_MIN } from './fleet';

/*
  Static inventory of the 2 demo gyms. The live gym has the full demo floor (40 machines, 12 cameras).
  The other gym reuses the same floor template, scaled to its size.
*/

/** Cameras of the live gym, in Camera List order, with human names. */
const DEMO_CAMERAS: { key: string; en: string; ar: string; areaEn: string; areaAr: string; kind: Camera['kind']; test?: boolean; online?: boolean }[] = [
  { key: 'cam-1', en: 'Cardio hall, front west', ar: 'صالة الكارديو، الأمامية الغربية', areaEn: 'Cardio area', areaAr: 'منطقة الكارديو', kind: 'fisheye' },
  { key: 'cam-2', en: 'Cardio hall, front east', ar: 'صالة الكارديو، الأمامية الشرقية', areaEn: 'Cardio area', areaAr: 'منطقة الكارديو', kind: 'fisheye' },
  { key: 'cam-3', en: 'Cardio hall, back west', ar: 'صالة الكارديو، الخلفية الغربية', areaEn: 'Cardio area', areaAr: 'منطقة الكارديو', kind: 'fisheye' },
  { key: 'cam-4', en: 'Cardio hall, back east', ar: 'صالة الكارديو، الخلفية الشرقية', areaEn: 'Cardio area', areaAr: 'منطقة الكارديو', kind: 'fisheye' },
  { key: 'cam-5', en: 'Bench area', ar: 'منطقة المقاعد', areaEn: 'Cardio area', areaAr: 'منطقة الكارديو', kind: 'nvr' },
  { key: 'cam-6', en: 'Gym area, north', ar: 'صالة التمارين، الشمالية', areaEn: 'Gym area', areaAr: 'صالة التمارين', kind: 'nvr' },
  { key: 'cam-7', en: 'Gym area, south', ar: 'صالة التمارين، الجنوبية', areaEn: 'Gym area', areaAr: 'صالة التمارين', kind: 'nvr' },
  { key: 'cam-8', en: 'Functional area', ar: 'منطقة التمارين الوظيفية', areaEn: 'Functional', areaAr: 'منطقة التمارين الوظيفية', kind: 'nvr' },
  { key: 'cam-9', en: 'Boxing area', ar: 'منطقة الملاكمة', areaEn: 'Boxing', areaAr: 'منطقة الملاكمة', kind: 'nvr' },
  { key: 'cam-10', en: 'Reception', ar: 'الاستقبال', areaEn: 'Reception and entrance', areaAr: 'الاستقبال والمدخل', kind: 'nvr' },
  { key: 'cam-11', en: 'Pool hall', ar: 'صالة المسبح', areaEn: 'Swimming pool', areaAr: 'المسبح', kind: 'nvr' },
  { key: 'test', en: 'Test camera', ar: 'كاميرا الاختبار', areaEn: 'Workshop', areaAr: 'الورشة', kind: 'nvr', test: true, online: false },
];

/**
 * BMS areas of every gym, from the demo floor plan (floors.ts): the rooms members use plus the staff area (it has its
 * own AC and lights). m2 is the demo floor area of each room (scaled to the other gym's size); share is the usual
 * share of the people in the gym found in the area.
 */
const AREA_TEMPLATE: { key: string; en: string; ar: string; floorEn: string; floorAr: string; share: number; m2: number }[] = [
  { key: 'gym', en: 'Gym area', ar: 'صالة التمارين', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.29, m2: 375 },
  { key: 'cardio', en: 'Cardio area', ar: 'منطقة الكارديو', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.15, m2: 216 },
  { key: 'functional', en: 'Functional', ar: 'منطقة التمارين الوظيفية', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.06, m2: 165 },
  { key: 'pt', en: 'PT zones', ar: 'مناطق التدريب الشخصي', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.04, m2: 60 },
  { key: 'track', en: 'Running track', ar: 'مضمار الجري', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.03, m2: 210 },
  { key: 'boxing', en: 'Boxing', ar: 'منطقة الملاكمة', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.04, m2: 135 },
  { key: 'performance', en: 'Performance zone', ar: 'منطقة الأداء', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.02, m2: 35 },
  { key: 'relaxing', en: 'Relaxing room', ar: 'غرفة الاسترخاء', floorEn: 'First floor', floorAr: 'الطابق الأول', share: 0.02, m2: 35 },
  { key: 'freestyle', en: 'Freestyle', ar: 'منطقة التمارين الحرة', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.07, m2: 140 },
  { key: 'pool', en: 'Swimming pool', ar: 'المسبح', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.06, m2: 352 },
  { key: 'spa', en: 'Spa', ar: 'السبا', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.04, m2: 99 },
  { key: 'massage', en: 'Massage area', ar: 'منطقة المساج', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.005, m2: 18 },
  { key: 'lockers', en: 'Locker rooms', ar: 'غرف الخزائن', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.08, m2: 171 },
  { key: 'reception', en: 'Reception and entrance', ar: 'الاستقبال والمدخل', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.025, m2: 72 },
  { key: 'retail', en: 'Retail area', ar: 'منطقة البيع', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.005, m2: 45 },
  { key: 'lounge', en: 'Lounge area', ar: 'منطقة الاستراحة', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.02, m2: 45 },
  { key: 'atrium', en: 'Atrium lounge', ar: 'استراحة البهو', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.01, m2: 72 },
  { key: 'smoothie', en: 'Smoothie bar', ar: 'ركن العصائر', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.01, m2: 27 },
  { key: 'prayer', en: 'Prayer room', ar: 'المصلى', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.015, m2: 56 },
  { key: 'staff', en: 'Staff area', ar: 'منطقة الموظفين', floorEn: 'Ground floor', floorAr: 'الطابق الأرضي', share: 0.01, m2: 14 },
];

export const AGENTS: AgentDef[] = [
  { id: 'hvac', num: '01', nameEn: 'HVAC agent', nameAr: 'وكيل التكييف', domainEn: 'Climate', domainAr: 'المناخ', readOnly: false,
    descEn: 'Keeps each area in its comfort band and sets back cooling in empty areas.', descAr: 'يحافظ على كل منطقة ضمن نطاق الراحة ويخفض التبريد في المناطق الخالية.' },
  { id: 'sensor', num: '02', nameEn: 'Sensor agent', nameAr: 'وكيل الحساسات', domainEn: 'Occupancy', domainAr: 'الإشغال', readOnly: false,
    descEn: 'Reads presence and air quality and tells the other agents where people are.', descAr: 'يقرأ الحضور وجودة الهواء ويبلغ الوكلاء الآخرين بمواقع الأشخاص.' },
  { id: 'water', num: '03', nameEn: 'Water supply', nameAr: 'إمداد المياه', domainEn: 'Supply', domainAr: 'الإمداد', readOnly: false,
    descEn: 'Watches tanks, pumps and flow for leaks and dry running.', descAr: 'يراقب الخزانات والمضخات والتدفق لاكتشاف التسربات والتشغيل الجاف.' },
  { id: 'drainage', num: '04', nameEn: 'Drainage', nameAr: 'الصرف', domainEn: 'Drainage', domainAr: 'الصرف', readOnly: false,
    descEn: 'Watches sump levels and drainage pumps.', descAr: 'يراقب مستويات البيارات ومضخات الصرف.' },
  { id: 'fire-alarm', num: '05', nameEn: 'Fire alarm', nameAr: 'إنذار الحريق', domainEn: 'Detection', domainAr: 'الكشف', readOnly: true,
    descEn: 'Reports detector and panel state. It never sends commands.', descAr: 'يبلغ عن حالة الكواشف واللوحة ولا يرسل أي أوامر.' },
  { id: 'fire-fighting', num: '06', nameEn: 'Fire fighting', nameAr: 'مكافحة الحريق', domainEn: 'Suppression', domainAr: 'الإطفاء', readOnly: true,
    descEn: 'Watches valves, sprinkler heads and contacts. It never sends commands.', descAr: 'يراقب الصمامات ورؤوس الرشاشات والملامسات ولا يرسل أي أوامر.' },
  { id: 'lighting', num: '07', nameEn: 'Lighting', nameAr: 'الإضاءة', domainEn: 'Lighting', domainAr: 'الإضاءة', readOnly: false,
    descEn: 'Switches and dims circuits on occupancy and opening hours.', descAr: 'يشغل الدوائر ويخفتها حسب الإشغال وساعات العمل.' },
  { id: 'power', num: '08', nameEn: 'Power', nameAr: 'الطاقة', domainEn: 'Boards', domainAr: 'اللوحات', readOnly: false,
    descEn: 'Watches distribution boards and delays heavy loads at peak.', descAr: 'يراقب لوحات التوزيع ويؤخر الأحمال الكبيرة وقت الذروة.' },
  { id: 'access', num: '09', nameEn: 'Access', nameAr: 'الدخول', domainEn: 'Doors', domainAr: 'الأبواب', readOnly: false,
    descEn: 'Watches doors and barriers and flags any held open.', descAr: 'يراقب الأبواب والحواجز وينبه عند بقاء أي منها مفتوحًا.' },
  { id: 'energy', num: '10', nameEn: 'Energy', nameAr: 'الطاقة الذكية', domainEn: 'Savings', domainAr: 'التوفير', readOnly: false,
    descEn: 'Measures energy against the baseline and reports what was avoided.', descAr: 'يقيس الاستهلاك مقارنة بخط الأساس ويبلغ عن الطاقة الموفرة.' },
];

const CONNECTED = new Set(['hvac', 'sensor', 'fire-alarm', 'fire-fighting', 'lighting', 'power', 'energy']);

function squarePoly(i: number, n: number, r: () => number): [number, number][] {
  const cols = Math.max(2, Math.ceil(Math.sqrt(n)));
  const cx = ((i % cols) + 0.5) / cols;
  const cy = (Math.floor(i / cols) + 0.5) / Math.ceil(n / cols);
  const w = 0.32 / cols + r() * 0.05;
  const h = 0.3 / Math.ceil(n / cols) + r() * 0.05;
  const sk = (r() - 0.5) * 0.04;
  return [[cx - w + sk, cy - h], [cx + w + sk, cy - h], [cx + w - sk, cy + h], [cx - w - sk, cy + h]].map(
    ([x, y]) => [clamp(+x.toFixed(3), 0.02, 0.98), clamp(+y.toFixed(3), 0.04, 0.96)] as [number, number],
  );
}

function clubMachines(club: Club): { machines: Machine[]; cameras: Camera[]; zones: Zone[] } {
  const live = club.id === LIVE_CLUB_ID;
  const r = rngFor(club.id, 'inventory');
  const scale = club.areaM2 / 3600;
  let placements = DEMO_PLACEMENTS;
  let camKeys = DEMO_CAMERAS.map((c) => c.key);
  if (!live) {
    const target = clamp(Math.round(40 * scale), 16, 38);
    // keep a mix: rank every placement by a seeded score, keep the best `target`
    // required types (fleet.ts) first, in template order, then the best seeded scores
    const need = { ...(REQUIRED_TYPES[club.id] ?? {}) } as Record<string, number>;
    placements = [...DEMO_PLACEMENTS]
      .map((p) => {
        const base = r() + (p.type === 'treadmill' ? 0.25 : 0);
        if ((need[p.type] ?? 0) > 0) { need[p.type]--; return { p, s: 10 + base }; }
        return { p, s: base };
      })
      .sort((a, b) => b.s - a.s)
      .slice(0, target)
      .map((x) => x.p);
    const nCam = clamp(Math.round(target / 3), 5, 12);
    camKeys = DEMO_CAMERAS.slice(0, nCam).map((c) => c.key);
  }
  const usedCam = new Map<string, string>();
  const camFor = (key: string) => {
    if (live) return `${club.id}:${key}`;
    if (!usedCam.has(key)) usedCam.set(key, camKeys[usedCam.size % camKeys.length]);
    return `${club.id}:${usedCam.get(key)}`;
  };
  const cameras: Camera[] = DEMO_CAMERAS.filter((c) => camKeys.includes(c.key)).map((c, i) => ({
    id: `${club.id}:${c.key}`,
    clubId: club.id,
    nameEn: c.en,
    nameAr: c.ar,
    areaEn: c.areaEn,
    areaAr: c.areaAr,
    kind: c.kind,
    stream: c.kind === 'fisheye' ? `rtsp://nvr-${club.code.toLowerCase()}.local:8554/${c.key}` : `http://nvr-${club.code.toLowerCase()}.local:5000/api/${c.key}`,
    fps: c.kind === 'fisheye' ? 5 : int(r, 8, 15),
    online: c.online ?? !(live ? false : i === camKeys.length - 1 && r() < 0.3),
    isTest: !!c.test,
  }));
  const machines: Machine[] = [];
  const zones: Zone[] = [];
  const zonesPerCam = new Map<string, number>();
  for (const p of placements) {
    const id = `${club.id}:${p.id}`;
    const zoneIds: string[] = [];
    for (const z of p.zones) {
      const cameraId = camFor(z.camera);
      const zid = `${id}:z${z.n}`;
      zoneIds.push(zid);
      const k = zonesPerCam.get(cameraId) ?? 0;
      zonesPerCam.set(cameraId, k + 1);
      zones.push({
        id: zid, clubId: club.id, cameraId, machineId: id, code: z.code, n: z.n, mode: 'motion',
        motionThreshold: int(r, 1, 3), activateSec: int(r, 2, 5), releaseSec: 15, watching: true, polygon: [],
      });
    }
    // Live gym: the demo floor figures. Other gyms: the demand profile in fleet.ts (share of open time in use).
    const openMinDay = (club.hours.close - club.hours.open) * 60;
    const avg = live ? (LIVE_SESSION_MIN[p.type] ?? (p.todaySessions > 0 ? Math.max(3, p.todayUsedMin / p.todaySessions) : 6)) : SESSION_MIN[p.type];
    const sessions = live ? Math.max(2, p.todaySessions)
      : Math.max(1, Math.round((demandShare(club.id, p.type) * openMinDay * uniform(r, 0.85, 1.15)) / avg));
    // hours of use since the last preventive service (from the service log sync); about 1 in 9 is past due
    const rs = rngFor(club.id, p.id, 'service');
    const interval = SERVICE_INTERVAL_H[p.type];
    const hoursSinceService = Math.round(interval * (rs() < 0.11 ? uniform(rs, 1.03, 1.3) : uniform(rs, 0.08, 0.93)));
    machines.push({
      id, clubId: club.id, type: p.type, num: p.num, nameEn: p.nameEn, nameAr: p.nameAr,
      x: p.x, z: p.z, rot: p.rot, cameraId: camFor(p.camera), zoneIds, rule: p.rule,
      baseSessions: sessions, avgSessionMin: Math.round(avg * 10) / 10, enabled: true, hoursSinceService,
    });
  }
  // polygons laid out per camera frame
  for (const cam of cameras) {
    const list = zones.filter((z) => z.cameraId === cam.id);
    list.forEach((z, i) => { z.polygon = squarePoly(i, list.length, r); });
  }
  return { machines, cameras, zones };
}

function clubBms(club: Club) {
  const r = rngFor(club.id, 'bms');
  const areas: Area[] = AREA_TEMPLATE.map((a) => ({
    id: `${club.id}:${a.key}`, clubId: club.id, nameEn: a.en, nameAr: a.ar, floorEn: a.floorEn, floorAr: a.floorAr,
    m2: Math.round((club.areaM2 / 3600) * a.m2), share: a.share,
  }));
  const acUnits: AcUnit[] = [];
  const lights: LightCircuit[] = [];
  const boards: Board[] = [1, 2, 3].map((n) => ({
    id: `${club.id}:db${n}`, clubId: club.id, nameEn: `Board DB-${n}`, nameAr: `اللوحة DB-${n}`, ways: int(r, 18, 36), ratingA: [250, 160, 125][n - 1],
  }));
  for (const a of areas) {
    const nAc = Math.max(1, Math.round(a.m2 / 120));
    for (let i = 1; i <= nAc; i++) {
      acUnits.push({
        id: `${a.id}:ac${i}`, clubId: club.id, areaId: a.id,
        nameEn: `${a.nameEn}, AC unit ${i}`, nameAr: `${a.nameAr}، وحدة التكييف ${i}`, ratedKw: [7.1, 10.6, 14.1][int(r, 0, 2)],
      });
    }
    const nL = Math.max(1, Math.round(a.m2 / 160));
    for (let i = 1; i <= nL; i++) {
      const fittings = int(r, 6, 18);
      lights.push({
        id: `${a.id}:lc${i}`, clubId: club.id, areaId: a.id,
        nameEn: `${a.nameEn}, lights ${i}`, nameAr: `${a.nameAr}، الإضاءة ${i}`,
        fittings, watts: fittings * 36, board: boards[(i - 1) % boards.length].id,
      });
    }
  }
  return { areas, acUnits, lights, boards };
}

function clubIntegrations(club: Club, acCount: number): Integration[] {
  const r = rngFor(club.id, 'integrations');
  const net = 20 + DISTRICTS.findIndex((d) => d.id === club.district);
  const bacnetCount = club.id === LIVE_CLUB_ID ? 3 : 2;
  const out: Integration[] = [{
    id: `${club.id}:ha`, clubId: club.id, kind: 'home-assistant', nameEn: 'Home Assistant', nameAr: 'Home Assistant',
    gateway: `10.${net}.1.10`, covers: 0, coversOf: 0, subscriptions: 0, running: true, uptimeH: Math.round(uniform(r, 20, 400) * 10) / 10,
    lastReadSec: int(r, 2, 40), pushed: 0, lastPushSec: 0,
  }];
  const per = Math.ceil(acCount / bacnetCount);
  for (let i = 1; i <= bacnetCount; i++) {
    const covers = Math.min(per, acCount - per * (i - 1));
    out.push({
      id: `${club.id}:bacnet${i}`, clubId: club.id, kind: 'bacnet',
      nameEn: `BACnet COV, AC controller ${i}`, nameAr: `BACnet COV، وحدة التحكم بالتكييف ${i}`,
      gateway: `10.${net}.210.${i + 1}`, device: 29 + i, covers, coversOf: 90, subscriptions: covers * 8,
      running: true, uptimeH: Math.round(uniform(r, 20, 400) * 10) / 10, lastReadSec: int(r, 5, 40),
      pushed: int(r, 3000, 9800), lastPushSec: int(r, 4, 600),
    });
  }
  return out;
}

const SETTINGS: BmsSettings = {
  workingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '06:00', to: '01:00' })),
  outside: { summerHigh: 46, summerLow: 37, winterHigh: 21, winterLow: 9 },
  blurCameras: true,
  setbackC: 2,
  setbackAfterSec: 20,
};

export function buildStatic(): StaticData {
  const clubs = buildClubs();
  const out: StaticData = {
    districts: DISTRICTS, clubs, machines: [], cameras: [], zones: [], areas: [], acUnits: [], lights: [], boards: [],
    agents: AGENTS, agentStates: [], integrations: [], library: buildLibrary(), settings: SETTINGS,
  };
  for (const c of clubs) {
    const m = clubMachines(c);
    const b = clubBms(c);
    out.machines.push(...m.machines);
    out.cameras.push(...m.cameras);
    out.zones.push(...m.zones);
    out.areas.push(...b.areas);
    out.acUnits.push(...b.acUnits);
    out.lights.push(...b.lights);
    out.boards.push(...b.boards);
    out.integrations.push(...clubIntegrations(c, b.acUnits.length));
    c.machines = m.machines.length;
    c.cameras = m.cameras.length;
    c.zones = m.zones.length;
    c.acUnits = b.acUnits.length;
    c.lightCircuits = b.lights.length;
    for (const a of AGENTS) {
      const connected = CONNECTED.has(a.id);
      const watching = !connected ? 0
        : a.id === 'hvac' ? b.acUnits.length
        : a.id === 'lighting' ? b.lights.length
        : a.id === 'power' ? b.boards.length
        : a.id === 'sensor' ? b.areas.length
        : a.id === 'fire-alarm' ? b.areas.length * 3
        : a.id === 'fire-fighting' ? b.areas.length * 2
        : 1;
      out.agentStates.push({ agentId: a.id, clubId: c.id, connected, running: connected, mode: a.readOnly || a.id === 'energy' ? 'read' : 'control', watching });
    }
  }
  return out;
}
