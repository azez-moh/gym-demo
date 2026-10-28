import type { MachineType } from './types';

/*
  Fleet assumptions for the generated data and the COO recommendations (src/pages/Overview/insights.ts).
  Everything here is a documented demo assumption, not a measured value:
  - DEMAND: target share of open time in use (4-week average) per gym and machine type. It drives the
    generated sessions of Al Sahafa Gym (Men); Hittin Gym (Men) keeps the demo data.
  - VISIT_FACTOR: daily visits per gym as a multiple of the network norm (3.2 x capacity).
  - PRICE_SAR: purchase price of one new commercial unit, Saudi market, incl. VAT and delivery (rounded).
  - SERVICE_INTERVAL_H: preventive service interval in hours of use (manufacturer-style schedules, rounded).
*/

/** Gyms that must carry at least `min` units of a type (keeps the demand profile meaningful). */
export const REQUIRED_TYPES: Record<string, Partial<Record<MachineType, number>>> = {
  'gym-sahafa-men': { 'indoor-bike': 6, rower: 3, 'recumbent-bike': 2 },
};

/** Typical share of open time in use per type, before the gym profile. */
const TYPE_DEFAULT: Partial<Record<MachineType, number>> = {
  'treadmill': 0.19, 'slat-treadmill': 0.5, 'incline-treadmill': 0.2, 'stair-climber': 0.12, 'indoor-bike': 0.1,
  'recumbent-bike': 0.11, 'elliptical': 0.06, 'adaptive-cross-trainer': 0.08, 'rower': 0.06, 'upper-body-ergometer': 0.06,
  'flat-bench': 0.11, 'incline-bench': 0.11, 'preacher-curl': 0.08, 'standing-preacher': 0.08,
};

/**
 * Gym profile (overrides of TYPE_DEFAULT) for Al Sahafa Gym (Men). Against Hittin (the live gym) it gives:
 * rowers busy at Al Sahafa and idle at Hittin (move), recumbent bikes busy at both (buy), indoor bikes idle at
 * both (retire). Ellipticals sit above 15% at Al Sahafa so they are not a second retire.
 */
const PROFILE: Record<string, Partial<Record<MachineType, number>>> = {
  'gym-sahafa-men': { 'indoor-bike': 0.035, rower: 0.5, 'recumbent-bike': 0.55, elliptical: 0.17, 'slat-treadmill': 0.56 },
};

/**
 * Session length override for the live gym, minutes. The demo data logs recumbent bike sessions of about
 * 2.5 minutes (camera hand-offs); real rides run longer, so use time is taken at 14 minutes per session.
 * Session counts (550 a day) stay as in the demo data; overall machine use stays within 12 to 15%.
 */
export const LIVE_SESSION_MIN: Partial<Record<MachineType, number>> = { 'recumbent-bike': 14 };

export function demandShare(clubId: string, type: MachineType): number {
  return PROFILE[clubId]?.[type] ?? TYPE_DEFAULT[type] ?? 0.1;
}

/** Typical session length in minutes per type (gyms other than the live one). */
export const SESSION_MIN: Record<MachineType, number> = {
  'treadmill': 24, 'slat-treadmill': 14, 'incline-treadmill': 20, 'stair-climber': 12, 'indoor-bike': 26, 'recumbent-bike': 22,
  'elliptical': 20, 'adaptive-cross-trainer': 18, 'rower': 12, 'upper-body-ergometer': 10, 'flat-bench': 9, 'incline-bench': 9,
  'preacher-curl': 6, 'standing-preacher': 6,
};

/** Daily visits multiple per gym (1 = 3.2 x capacity). Al Sahafa draws fewer visits for its floor area. */
export const VISIT_FACTOR: Record<string, number> = { 'gym-sahafa-men': 0.85 };

/** Purchase price of one new unit, SAR (assumption, rounded). */
export const PRICE_SAR: Record<MachineType, number> = {
  'treadmill': 38_000, 'slat-treadmill': 52_000, 'incline-treadmill': 60_000, 'stair-climber': 34_000, 'indoor-bike': 9_500,
  'recumbent-bike': 16_000, 'elliptical': 26_000, 'adaptive-cross-trainer': 32_000, 'rower': 7_500, 'upper-body-ergometer': 18_000,
  'flat-bench': 4_500, 'incline-bench': 5_500, 'preacher-curl': 9_000, 'standing-preacher': 8_000,
};

/** Resale value of a used unit as a share of the new price (assumption). */
export const RESALE_SHARE = 0.35;

/** Cost to move one unit between the two Riyadh gyms, SAR (assumption). */
export const MOVE_COST_SAR = 600;

/** Preventive service interval in hours of use (assumption). */
export const SERVICE_INTERVAL_H: Record<MachineType, number> = {
  'treadmill': 2_000, 'slat-treadmill': 3_000, 'incline-treadmill': 2_000, 'stair-climber': 1_500, 'indoor-bike': 3_000,
  'recumbent-bike': 3_000, 'elliptical': 2_500, 'adaptive-cross-trainer': 2_500, 'rower': 2_500, 'upper-body-ergometer': 3_000,
  'flat-bench': 4_000, 'incline-bench': 4_000, 'preacher-curl': 4_000, 'standing-preacher': 4_000,
};

/** Machine families for the compare view. */
export const FAMILIES: { key: string; types: MachineType[] }[] = [
  { key: 'run', types: ['treadmill', 'slat-treadmill', 'incline-treadmill'] },
  { key: 'bike', types: ['indoor-bike', 'recumbent-bike'] },
  { key: 'cross', types: ['elliptical', 'adaptive-cross-trainer'] },
  { key: 'stair', types: ['stair-climber'] },
  { key: 'row', types: ['rower', 'upper-body-ergometer'] },
  { key: 'strength', types: ['flat-bench', 'incline-bench', 'preacher-curl', 'standing-preacher'] },
];
