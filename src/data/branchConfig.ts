/**
 * Per-gym settings edited on Branch settings (/branch-settings): comfortable capacity per floor area and the alert
 * thresholds. They are stored as demo store patches (collection 'settings', id `branch:<clubId>`) and mirrored into
 * this registry by the store (src/data/store.tsx) every time the patches change, so plain functions that have no
 * access to the store (floor plans, crowd colours, recommended actions) read the same values.
 */

export interface BranchThresholds {
  /** An area (or the gym at its evening peak) counts as crowded above this share of comfortable capacity, %. */
  crowdPct: number;
  /** Comfort band: an area is "warm" this many °C over its setpoint and "hot" from `hotC`. */
  warmC: number;
  hotC: number;
  /** A machine family is idle (spare units to move) under this use over 4 weeks, %. */
  idlePct: number;
  /** A machine family is overused (needs more units) above this use over 4 weeks, %. */
  overusedPct: number;
}

export interface BranchConfig extends BranchThresholds {
  /** Comfortable capacity per floor-plan area key, overriding src/data/floors.ts. */
  capacity: Record<string, number>;
  /** Contacts (free text). */
  manager: string;
  phone: string;
  email: string;
  savedBy?: string;
  savedRole?: string;
  savedAt?: number;
}

export const DEFAULT_THRESHOLDS: BranchThresholds = { crowdPct: 85, warmC: 1.5, hotC: 3, idlePct: 15, overusedPct: 45 };

const DEFAULTS: BranchConfig = { ...DEFAULT_THRESHOLDS, capacity: {}, manager: '', phone: '', email: '' };

/** Bounds for the editable thresholds (inputs and validation). */
export const THRESHOLD_LIMITS: Record<keyof BranchThresholds, [number, number, number]> = {
  crowdPct: [30, 120, 5],
  warmC: [0.5, 5, 0.5],
  hotC: [1, 8, 0.5],
  idlePct: [5, 30, 1],
  overusedPct: [30, 80, 1],
};

export const branchKey = (clubId: string) => `branch:${clubId}`;

const REG = new Map<string, BranchConfig>();
let SIG = '';

/** Called by the store with patches.set.settings (all ids); keeps the registry in step. */
export function syncBranchConfigs(settings: Record<string, Record<string, unknown>> | undefined): void {
  REG.clear();
  for (const [id, fields] of Object.entries(settings ?? {})) {
    if (!id.startsWith('branch:')) continue;
    const f = fields as Partial<BranchConfig>;
    REG.set(id.slice(7), { ...DEFAULTS, ...f, capacity: { ...(f.capacity ?? {}) } });
  }
  SIG = JSON.stringify([...REG.entries()].map(([k, v]) => [k, v.capacity, v.crowdPct, v.warmC, v.hotC, v.idlePct, v.overusedPct]));
}

/** Settings of one gym (defaults when never saved). */
export function branchConfig(clubId: string): BranchConfig {
  return REG.get(clubId) ?? DEFAULTS;
}

/** Changes whenever a saved capacity or threshold changes (for caches and memo keys). */
export function branchSignature(): string {
  return SIG;
}

/** Crowding threshold of a gym as a ratio (0.85 by default). */
export function crowdRatio(clubId: string): number {
  return branchConfig(clubId).crowdPct / 100;
}
