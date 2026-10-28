/*
  Data contract for the GYM Demo. Every page reads from useDemo() (src/data/store.tsx) and the pure
  selectors in src/data/selectors.ts. All numbers are generated deterministically from seeds
  (src/data/rng.ts), so the same instant always gives the same values on every page.
  Bilingual text fields come in pairs (xxxEn / xxxAr); render them with i18n pick(en, ar).
*/

export type RegionId = 'riyadh';
export type Gender = 'men' | 'women';
export type Level = 'critical' | 'warning' | 'info';
/** Signed-in role: COO (every gym) or Facility Manager (one gym, building operations). */
export type Role = 'coo' | 'fm';

/** Global scope chosen on the Kingdom map (or the scope pill). */
export type Scope =
  | { level: 'all' }
  | { level: 'region'; region: RegionId }
  | { level: 'district'; district: string }
  | { level: 'club'; clubId: string };

export interface District {
  id: string;
  region: RegionId;
  cityEn: string;
  cityAr: string;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

/** Opening hours in Riyadh local time. close may exceed 24 (25 = 01:00 next day). */
export interface OpeningHours {
  open: number;
  close: number;
  /** Optional different hours on Friday and Saturday. */
  fri?: { open: number; close: number };
  sat?: { open: number; close: number };
  labelEn: string;
  labelAr: string;
}

export interface Club {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  shortEn: string;
  shortAr: string;
  region: RegionId;
  district: string;
  gender: Gender;
  lat: number;
  lng: number;
  /** True when the pin comes from a verified source; false = district centroid (approximate). */
  exactPin: boolean;
  addressEn: string;
  addressAr: string;
  areaM2: number;
  capacity: number;
  hours: OpeningHours;
  openedEn: string;
  openedAr: string;
  staff: number;
  machines: number;
  cameras: number;
  zones: number;
  acUnits: number;
  lightCircuits: number;
  /** The live club: AI Vision figures follow the demo data. */
  live: boolean;
}

export type MachineType =
  | 'treadmill' | 'slat-treadmill' | 'incline-treadmill' | 'stair-climber' | 'indoor-bike' | 'recumbent-bike'
  | 'elliptical' | 'adaptive-cross-trainer' | 'rower' | 'upper-body-ergometer'
  | 'flat-bench' | 'incline-bench' | 'preacher-curl' | 'standing-preacher';

export type MachineState = 'inUse' | 'idle' | 'cooling';

/** Raw floor placement (demo Live Floor layout). */
export interface FloorPlacement {
  id: string;
  num: number;
  type: MachineType;
  nameEn: string;
  nameAr: string;
  x: number;
  z: number;
  rot: number;
  camera: string;
  zones: { code: string; camera: string; n: number }[];
  rule: 'and' | 'or';
  todaySessions: number;
  todayUsedMin: number;
}

export interface Machine {
  id: string;
  clubId: string;
  type: MachineType;
  num: number;
  nameEn: string;
  nameAr: string;
  /** Position on the club floor in metres (x east-west, z depth), rotation in degrees. */
  x: number;
  z: number;
  rot: number;
  cameraId: string;
  zoneIds: string[];
  /** Decision rule across the zones: all enabled zones (and) or any enabled zone (or). */
  rule: 'and' | 'or';
  /** Typical sessions on an average day and typical session length (minutes). */
  baseSessions: number;
  avgSessionMin: number;
  enabled: boolean;
  /** Hours of use since the last preventive service (service log; see SERVICE_INTERVAL_H in fleet.ts). */
  hoursSinceService: number;
}

export interface MachineLive {
  id: string;
  state: MachineState;
  sessionsToday: number;
  usedMinToday: number;
  /** Minutes since the current session started (in use) or since the last one ended. */
  sinceMin: number;
}

/** One usage session (minutes from local midnight of its date). */
export interface Session { start: number; end: number }

export interface Camera {
  id: string;
  clubId: string;
  nameEn: string;
  nameAr: string;
  areaEn: string;
  areaAr: string;
  kind: 'fisheye' | 'nvr';
  /** Stream address. Never a production address. */
  stream: string;
  fps: number;
  online: boolean;
  isTest: boolean;
}

export interface Zone {
  id: string;
  clubId: string;
  cameraId: string;
  machineId: string;
  /** Internal code, e.g. Z_SBTRDML_1_Z1 (kept in data, not shown in the UI). */
  code: string;
  n: number;
  mode: 'motion';
  motionThreshold: number;
  activateSec: number;
  releaseSec: number;
  watching: boolean;
  /** Normalised image polygon (0..1) on its camera frame. */
  polygon: [number, number][];
}

export interface ZoneReading { id: string; motionPct: number; baselinePct: number; active: boolean }

export interface Area {
  id: string;
  clubId: string;
  nameEn: string;
  nameAr: string;
  floorEn: string;
  floorAr: string;
  m2: number;
  /** Share of people in the club usually found here. */
  share: number;
}

export interface AcUnit {
  id: string;
  clubId: string;
  areaId: string;
  nameEn: string;
  nameAr: string;
  ratedKw: number;
}

export interface AcLive {
  id: string;
  on: boolean;
  mode: 'cool' | 'fan' | 'auto';
  fan: 'low' | 'mid' | 'high' | 'auto';
  setpoint: number;
  reading: number;
  powerKw: number;
}

export interface LightCircuit {
  id: string;
  clubId: string;
  areaId: string;
  nameEn: string;
  nameAr: string;
  fittings: number;
  watts: number;
  board: string;
}

export interface LightLive { id: string; on: boolean; lit: number; level: number }

export interface Board { id: string; clubId: string; nameEn: string; nameAr: string; ways: number; ratingA: number }

export interface AgentDef {
  id: string;
  num: string;
  nameEn: string;
  nameAr: string;
  domainEn: string;
  domainAr: string;
  descEn: string;
  descAr: string;
  /** Agents that never send commands (fire alarm, fire fighting). */
  readOnly: boolean;
}

export interface AgentState {
  agentId: string;
  clubId: string;
  connected: boolean;
  running: boolean;
  mode: 'read' | 'control';
  watching: number;
}

export interface ActivityEntry {
  id: string;
  clubId: string;
  agentId: string;
  atMs: number;
  textEn: string;
  textAr: string;
}

export interface Alert {
  id: string;
  clubId: string;
  level: Level;
  source: 'hvac' | 'sensor' | 'power' | 'access' | 'fire' | 'vision' | 'reporting';
  titleEn: string;
  titleAr: string;
  areaEn: string;
  areaAr: string;
  sinceMs: number;
  status: 'open' | 'acknowledged' | 'resolved';
}

export interface Integration {
  id: string;
  clubId: string;
  kind: 'home-assistant' | 'bacnet';
  nameEn: string;
  nameAr: string;
  gateway: string;
  device?: number;
  covers: number;
  coversOf: number;
  subscriptions: number;
  running: boolean;
  uptimeH: number;
  lastReadSec: number;
  pushed: number;
  lastPushSec: number;
}

export interface LibraryModel {
  id: MachineType;
  number: string;
  nameEn: string;
  nameAr: string;
  category: 'cardio' | 'strength';
  subcategoryEn: string;
  subcategoryAr: string;
  descriptionEn: string;
  descriptionAr: string;
  motionZoneEn: string;
  motionZoneAr: string;
  operatorZoneEn: string;
  operatorZoneAr: string;
  /** Approximate shape (true) or photo study (false). */
  approximate: boolean;
  builtin: boolean;
  approved: boolean;
  active: boolean;
  /** Real-world footprint in metres (length along the user, width, height) and service clearance. */
  footprint: { l: number; w: number; h: number; clearance: number };
  watts: number;
}

export interface LibraryModelSeed {
  number: string;
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  motion_zone: string;
  operator_zone: string;
  provisional: boolean;
  instances_on_live_floor: number;
}

/** BMS settings (Agents, Building, Cameras tabs). */
export interface BmsSettings {
  workingHours: { day: number; open: boolean; from: string; to: string }[];
  outside: { summerHigh: number; summerLow: number; winterHigh: number; winterLow: number };
  blurCameras: boolean;
  setbackC: number;
  setbackAfterSec: number;
}

/** Static (time-independent) data, built once. */
export interface StaticData {
  districts: District[];
  clubs: Club[];
  machines: Machine[];
  cameras: Camera[];
  zones: Zone[];
  areas: Area[];
  acUnits: AcUnit[];
  lights: LightCircuit[];
  boards: Board[];
  agents: AgentDef[];
  agentStates: AgentState[];
  integrations: Integration[];
  library: LibraryModel[];
  settings: BmsSettings;
}

export interface ClubLive {
  clubId: string;
  peopleIn: number;
  peopleToday: number;
  occupancyPct: number;
  machinesInUse: number;
  machineUsagePct: number;
  sessionsToday: number;
  energyTodayKwh: number;
  baselineTodayKwh: number;
  powerKw: number;
  comfortPct: number;
  openAlerts: number;
  criticalAlerts: number;
  status: 'ok' | 'warning' | 'critical';
  isOpen: boolean;
}

/** Time-dependent snapshot, rebuilt on every 10 s tick. */
export interface LiveData {
  nowMs: number;
  date: string;
  hour: number;
  minute: number;
  clubs: Record<string, ClubLive>;
  machines: Record<string, MachineLive>;
  zones: Record<string, ZoneReading>;
  ac: Record<string, AcLive>;
  lights: Record<string, LightLive>;
  alerts: Alert[];
  activity: ActivityEntry[];
}

/** Collections that user actions can change (persisted in localStorage). */
export type PatchCollection =
  | 'machines' | 'cameras' | 'zones' | 'acUnits' | 'acLive' | 'lights' | 'lightLive' | 'agentStates'
  | 'integrations' | 'library' | 'alerts' | 'settings';

export interface Patches {
  /** Field overrides by collection and id. */
  set: Partial<Record<PatchCollection, Record<string, Record<string, unknown>>>>;
  /** Removed ids by collection. */
  removed: Partial<Record<PatchCollection, string[]>>;
  /** Added items by collection. */
  added: Partial<Record<PatchCollection, Record<string, unknown>[]>>;
}

export interface DemoContextValue extends StaticData {
  now: Date;
  tick: number;
  live: LiveData;
  /** Merge fields into one item (e.g. patch('acLive', id, { setpoint: 23 })). */
  patch: (coll: PatchCollection, id: string, fields: Record<string, unknown>) => void;
  /** Remove one item (destructive: confirm first; COO only). */
  remove: (coll: PatchCollection, id: string) => void;
  /** Add one item (it must carry a unique id). */
  add: (coll: PatchCollection, item: { id: string } & Record<string, unknown>) => void;
  /** Forget every user change. */
  reset: () => void;
  patches: Patches;
}
