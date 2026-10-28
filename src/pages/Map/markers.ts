/**
 * Map marker artwork as inline SVG strings (no external images): an isometric gym building for regions,
 * a dumbbell tile for districts and a gym-front pin for clubs. GYM Demo uses the brand yellow on ink
 * (accent = false gives a neutral grey variant). Every icon anchors at the bottom centre of its SVG.
 */

const Y = '#7C3AED';
const Y_SIDE = '#5B24C2';
const Y_TOP = '#A78BFA';
const INK = '#241F30';
const N = '#F1EEF9';
const N_SIDE = '#B9B4C4';
const N_TOP = '#FFFFFF';
const GLASS = '#241F30';

const f = (n: number) => Math.round(n * 100) / 100;

function svg(w: number, h: number, vbW: number, body: string, cls: string) {
  return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${vbW} 56" aria-hidden="true" focusable="false" shape-rendering="geometricPrecision">${body}</svg>`;
}

/** Small dumbbell glyph centred on (cx, cy), `s` = scale (1 = 20 px wide). */
function dumbbell(cx: number, cy: number, s: number, fill: string): string {
  const r = (x: number, y: number, w: number, h: number) =>
    `<rect x="${f(cx + x * s)}" y="${f(cy + y * s)}" width="${f(w * s)}" height="${f(h * s)}" fill="${fill}"/>`;
  return (
    r(-6, -1, 12, 2) +   // bar
    r(-8, -5, 2.6, 10) + // inner plates
    r(5.4, -5, 2.6, 10) +
    r(-10.4, -3.4, 2.2, 6.8) + // outer plates
    r(8.2, -3.4, 2.2, 6.8)
  );
}

/**
 * Region marker: an isometric gym building on a plate. The front face carries a glass band and a door,
 * the side face has louvres, and a dumbbell sign stands on the roof.
 */
export function gymIsoSvg(w = 58, accent = true, cls = 'mk__art'): string {
  const front = accent ? Y : N;
  const side = accent ? Y_SIDE : N_SIDE;
  const top = accent ? Y_TOP : N_TOP;
  const H = 20;
  const lp = (u: number, v: number) => `${f(12 + 20 * u)},${f(36 + 10 * u - v)}`;
  const rp = (u: number, v: number) => `${f(32 + 20 * u)},${f(46 - 10 * u - v)}`;
  const quadL = (u0: number, u1: number, v0: number, v1: number, fill: string, extra = '') =>
    `<polygon points="${lp(u0, v0)} ${lp(u1, v0)} ${lp(u1, v1)} ${lp(u0, v1)}" fill="${fill}"${extra}/>`;
  const quadR = (u0: number, u1: number, v0: number, v1: number, fill: string, extra = '') =>
    `<polygon points="${rp(u0, v0)} ${rp(u1, v0)} ${rp(u1, v1)} ${rp(u0, v1)}" fill="${fill}"${extra}/>`;
  const line = ` stroke="${INK}" stroke-width="1" stroke-linejoin="round"`;

  let louvres = '';
  for (let i = 0; i < 4; i++) louvres += quadR(0.18, 0.86, 4 + i * 3.6, 5 + i * 3.6, INK, ' opacity=".55"');
  let mullions = '';
  for (const u of [0.24, 0.4]) mullions += quadL(u, u + 0.012, 6, 14, front, ' opacity=".9"');

  const body =
    `<ellipse cx="32" cy="52.4" rx="24" ry="3" fill="#000" opacity=".22"/>` +
    `<polygon points="32,50 6,37 6,39 32,52 58,39 58,37" fill="${INK}" opacity=".55"/>` +
    `<polygon points="32,24 58,37 32,50 6,37" fill="${accent ? '#3A3F12' : '#3A3450'}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
    quadL(0, 1, 0, H, front, line) +
    quadR(0, 1, 0, H, side, line) +
    // glass band and door on the front
    quadL(0.08, 0.58, 6, 14, GLASS, line) +
    mullions +
    quadL(0.68, 0.88, 0, 11, INK) +
    quadL(0.7, 0.86, 1.5, 9.5, GLASS) +
    louvres +
    // roof
    `<polygon points="12,16 32,6 52,16 32,26" fill="${top}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
    // dumbbell sign on a post
    `<rect x="31.2" y="9" width="1.6" height="9" fill="${INK}"/>` +
    `<rect x="21" y="1.5" width="22" height="9" fill="${INK}"/>` +
    dumbbell(32, 6, 0.8, accent ? Y : N_TOP);
  return svg(w, Math.round((w * 56) / 64), 64, body, cls);
}

/** District marker: a square tile with a dumbbell and a short pointer. */
export function dumbbellSvg(w = 44, accent = true, cls = 'mk__art'): string {
  const fill = accent ? Y : N;
  const body =
    `<ellipse cx="24" cy="53.4" rx="9" ry="2" fill="#000" opacity=".22"/>` +
    `<path d="M19 42L24 50L29 42Z" fill="${INK}"/>` +
    `<rect x="5" y="4" width="38" height="38" fill="${INK}"/>` +
    `<rect x="8" y="7" width="32" height="32" fill="${fill}"/>` +
    dumbbell(24, 23, 1.15, INK);
  return svg(w, Math.round((w * 56) / 48), 48, body, cls);
}

/**
 * Club marker: a gym front (fascia with a dumbbell, glass and door) on a pin. `connected = false`
 * draws an outlined pin so clubs not yet on Primewave stand apart without relying on colour.
 */
export function gymFrontSvg(w = 44, accent = true, connected = true, cls = 'mk__art'): string {
  const fill = accent ? Y : N;
  const frame = connected
    ? `<rect x="4" y="3" width="40" height="40" fill="${INK}"/><rect x="6.5" y="5.5" width="35" height="35" fill="${fill}"/>`
    : `<rect x="5" y="4" width="38" height="38" fill="${INK}" fill-opacity=".72" stroke="${fill}" stroke-width="2" stroke-dasharray="4 3"/>`;
  const ink = connected ? INK : fill;
  const body =
    `<ellipse cx="24" cy="53.4" rx="9" ry="2" fill="#000" opacity=".22"/>` +
    `<path d="M18.5 42.5L24 51L29.5 42.5Z" fill="${connected ? INK : fill}"/>` +
    frame +
    // fascia with a dumbbell
    `<rect x="10" y="9" width="28" height="9" fill="${ink}"/>` +
    dumbbell(24, 13.5, 0.62, connected ? fill : INK) +
    // glass and door
    `<rect x="10" y="21" width="15" height="15" fill="none" stroke="${ink}" stroke-width="2"/>` +
    `<line x1="17.5" y1="21" x2="17.5" y2="36" stroke="${ink}" stroke-width="1.4"/>` +
    `<rect x="28" y="21" width="10" height="15" fill="${ink}"/>` +
    `<rect x="29.8" y="28" width="1.6" height="1.6" fill="${connected ? fill : INK}"/>`;
  return svg(w, Math.round((w * 56) / 48), 48, body, cls);
}
