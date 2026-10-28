/** Seeded PRNG helpers. Every generator derives its seed from (branchId, date, stream) so a given day
 * always yields the same numbers, independent of generation order. */

export type Rng = () => number;

/** mulberry32: fast 32-bit PRNG, returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const GLOBAL_SEED = 'gym-demo-v1';

/** Seed derived from parts, e.g. seedFor('gym-hittin-men', '2026-10-22', 'sessions'). */
export function seedFor(...parts: (string | number)[]): number {
  return hashString(GLOBAL_SEED + '|' + parts.join('|'));
}

export function rngFor(...parts: (string | number)[]): Rng {
  return mulberry32(seedFor(...parts));
}

export function uniform(r: Rng, min: number, max: number): number {
  return min + (max - min) * r();
}

export function int(r: Rng, min: number, maxInclusive: number): number {
  return Math.floor(min + (maxInclusive - min + 1) * r());
}

/** Standard normal via Box-Muller. */
export function normal(r: Rng, mean = 0, sd = 1): number {
  let u = r();
  if (u < 1e-12) u = 1e-12;
  const v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Log-normal parameterised by median and a shape sigma (long right tail). */
export function lognormal(r: Rng, median: number, sigma: number): number {
  return median * Math.exp(normal(r, 0, sigma));
}

/** Poisson sample (Knuth for small lambda, normal approximation for large). */
export function poisson(r: Rng, lambda: number): number {
  if (!(lambda > 0)) return 0;
  if (lambda > 40) return Math.max(0, Math.round(normal(r, lambda, Math.sqrt(lambda))));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

export function exponential(r: Rng, mean: number): number {
  let u = r();
  if (u < 1e-12) u = 1e-12;
  return -Math.log(u) * mean;
}

export function chance(r: Rng, p: number): boolean {
  return r() < p;
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function weightedPick<T>(r: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return items[0];
  let x = r() * total;
  for (let i = 0; i < items.length; i++) {
    x -= Math.max(0, weights[i]);
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}

export function clamp(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

export function round(x: number, dp = 0): number {
  const f = Math.pow(10, dp);
  return Math.round(x * f) / f;
}
