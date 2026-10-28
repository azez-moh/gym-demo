import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { inPoly, polyBox, polyCentroid, type AreaOccupancy, type FloorPlan, type GymPlan, type PlanArea, type Pt } from '../../data/floors';
import { useI18n } from '../../i18n';
import type { ThemeName } from '../../theme/chartTokens';
import { heatColor, inkOn } from './scale';
import { usePeopleText } from './people';

/*
  Floors drawn to scale in one SVG (metres), so two floors side by side always share the same scale.
  The plan is never mirrored in Arabic; only the labels are translated.
  Each counted area is filled by its share of capacity, with a soft glow around the crowded spots on top.
*/

export interface PlanSvgProps {
  plan: GymPlan;
  floors: FloorPlan[];
  /** Occupancy by BMS area id. */
  occ: Map<string, AreaOccupancy>;
  theme: ThemeName;
  /** Small version: no labels on the plan (names on hover), no scale bar. */
  compact?: boolean;
  selected?: string | null;
  onSelect?: (key: string) => void;
  /** Hover tooltip content for an area. */
  tooltip?: (area: PlanArea) => ReactNode;
  className?: string;
  /** Pixels per metre after layout (for an HTML scale bar beside the plan). */
  onScale?: (ppm: number) => void;
  /** Areas too small for a name on the plan, shown as numbered markers; the page lists them as a key. */
  onKey?: (items: PlanKeyItem[]) => void;
}

export interface PlanKeyItem { n: number; key: string; name: string }

const PAD = 0.8;
/** On-screen height of the floor captions (both floors view), px. */
export const CAPTION_PX = 22;
const GAP = 7;
const pts = (p: Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

/** Deterministic pseudo-random points inside an area box, stable over time (crowd clusters). */
function clusterPoints(a: PlanArea, n: number): Pt[] {
  let h = 2166136261;
  for (const c of a.key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15; return ((h >>> 0) % 10000) / 10000; };
  const [x0, y0, x1, y1] = polyBox(a.points);
  const inset = Math.min(x1 - x0, y1 - y0) * 0.18;
  const out: Pt[] = [];
  // keep only points inside the shape (L-shapes and the running track ring)
  for (let tries = 0; out.length < n && tries < n * 30; tries++) {
    const q: Pt = [x0 + inset + rnd() * (x1 - x0 - 2 * inset), y0 + inset + rnd() * (y1 - y0 - 2 * inset)];
    if (inPoly(q, a.points)) out.push(q);
  }
  if (!out.length) out.push(a.labelAt ?? polyCentroid(a.points));
  return out;
}

interface Frame { floor: FloorPlan; dx: number; dy: number }

/** Floors cropped to their outlines and set side by side, bottoms aligned, in metres. */
function layoutFrames(floors: FloorPlan[]): Frame[] {
  const boxes = floors.map((f) => polyBox(f.outline));
  const bottom = Math.max(...boxes.map((b) => b[3]));
  let cursor = 0;
  return floors.map((floor, i) => {
    const [x0, , x1, y1] = boxes[i];
    const fr = { floor, dx: cursor - x0, dy: bottom - y1 };
    cursor += x1 - x0 + GAP;
    return fr;
  });
}

function extentOf(frames: Frame[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) {
    const [a, b, c, d] = polyBox(f.floor.outline);
    x0 = Math.min(x0, a + f.dx); y0 = Math.min(y0, b + f.dy); x1 = Math.max(x1, c + f.dx); y1 = Math.max(y1, d + f.dy);
  }
  return { x0, y0, x1, y1 };
}

/** Width in px the plan needs to fill a box `heightPx` tall (same layout rules as PlanSvg). */
export function planWidthForHeight(floors: FloorPlan[], heightPx: number): number {
  const ext = extentOf(layoutFrames(floors));
  const cap = floors.length > 1 ? CAPTION_PX : 0;
  const ppm = (heightPx - cap) / (ext.y1 - ext.y0 + PAD * 2);
  return ppm * (ext.x1 - ext.x0 + PAD * 2);
}

// ---------- labels: full name, wrapped name, short name, rotated, or a numbered marker ----------

interface Line { text: string; fs: number; display?: boolean }
interface LabelPlan { lines: Line[]; rotate: boolean; marker?: number }

const isArabic = (t: string) => /[\u0600-\u06FF]/.test(t);
const textW = (t: string, fs: number, display?: boolean) => t.length * fs * (display ? 0.6 : isArabic(t) ? 0.5 : 0.56);
const LH = 1.2;

function wrap2(name: string): [string, string] | null {
  const w = name.split(' ');
  if (w.length < 2) return null;
  let best: [string, string] | null = null;
  let score = Infinity;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(' ');
    const b = w.slice(i).join(' ');
    const sc = Math.max(a.length, b.length);
    if (sc < score) { score = sc; best = [a, b]; }
  }
  return best;
}

function planLabel(name: string, short: string, pct: string, people: string, wPx: number, hPx: number): LabelPlan | null {
  const two = wrap2(name);
  const cands: Line[][] = [
    [{ text: name, fs: 13 }, { text: pct, fs: 26, display: true }, { text: people, fs: 12 }],
    [{ text: name, fs: 11 }, { text: pct, fs: 17, display: true }, { text: people, fs: 10 }],
    ...(two ? [[{ text: two[0], fs: 11 }, { text: two[1], fs: 11 }, { text: pct, fs: 17, display: true }, { text: people, fs: 10 }]] : []),
    [{ text: name, fs: 11 }, { text: pct, fs: 15, display: true }],
    ...(two ? [[{ text: two[0], fs: 10 }, { text: two[1], fs: 10 }, { text: pct, fs: 12, display: true }]] : []),
    [{ text: name, fs: 10 }, { text: pct, fs: 12, display: true }],
    [{ text: `${name} ${pct}`, fs: 10 }],
    [{ text: name, fs: 9.5 }],
    ...(two ? [[{ text: two[0], fs: 9.5 }, { text: two[1], fs: 9.5 }]] : []),
    [{ text: short, fs: 10 }, { text: pct, fs: 12, display: true }],
    [{ text: `${short} ${pct}`, fs: 9.5 }],
    [{ text: short, fs: 9.5 }],
  ];
  const fits = (ls: Line[], w: number, h: number) =>
    ls.every((l) => textW(l.text, l.fs, l.display) <= w - 6) && ls.reduce((a, l) => a + l.fs * LH, 0) <= h - 2;
  for (const c of cands) if (fits(c, wPx, hPx)) return { lines: c, rotate: false };
  // tall strips: the same text turned a quarter
  if (hPx > wPx * 1.6) for (const c of cands.slice(3)) if (fits(c, hPx, wPx)) return { lines: c, rotate: true };
  return null;
}

export function PlanSvg({ plan, floors, occ, theme, compact, selected, onSelect, tooltip, className = '', onScale, onKey }: PlanSvgProps) {
  const { pick, fmtNumber, t } = useI18n();
  const ppl = usePeopleText();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // ---------- layout: each floor cropped to its outline, side by side ----------
  const captions = floors.length > 1;
  const frames = useMemo(() => layoutFrames(floors), [floors]);
  const ext = useMemo(() => extentOf(frames), [frames]);

  // captions take a fixed on-screen height; convert with the last measured scale
  const [ppmGuess, setPpmGuess] = useState(10);
  const capM = captions ? CAPTION_PX / ppmGuess : 0;
  const pad = compact ? 1.2 : PAD;
  const vbX = ext.x0 - pad;
  const vbY = ext.y0 - pad - capM;
  const vbW = ext.x1 - ext.x0 + pad * 2;
  const vbH = ext.y1 - ext.y0 + pad * 2 + capM;
  const ppm = size.w && size.h ? Math.min(size.w / vbW, size.h / vbH) : ppmGuess;
  useEffect(() => { if (Math.abs(ppm - ppmGuess) > 0.05) setPpmGuess(ppm); }, [ppm, ppmGuess]);
  useEffect(() => { if (size.w && onScale) onScale(ppm); }, [ppm, size.w, onScale]);
  const px = (n: number) => n / ppm;

  const areaOcc = (a: PlanArea) => occ.get(`${plan.clubId}:${a.key}`);

  // ---------- label plan per area (numbered markers where nothing fits) ----------
  const labels = useMemo(() => {
    const out = new Map<string, LabelPlan>();
    if (compact) return out;
    let n = 0;
    for (const f of frames) {
      for (const a of f.floor.areas) {
        if (!a.monitored) continue;
        const [x0, y0, x1, y1] = polyBox(a.points);
        const [bw, bh] = a.labelBox ?? [x1 - x0, y1 - y0];
        const o = occ.get(`${plan.clubId}:${a.key}`);
        const pct = `${fmtNumber(Math.round((o?.ratio ?? 0) * 100))}%`;
        const lp = planLabel(pick(a.nameEn, a.nameAr), pick(a.shortEn, a.shortAr), pct, ppl(o?.people ?? 0), bw * ppm, bh * ppm);
        out.set(a.key, lp ?? { lines: [], rotate: false, marker: ++n });
      }
    }
    return out;
  }, [compact, frames, occ, plan.clubId, ppm, pick, fmtNumber, ppl]);

  const keyItems = useMemo(() => frames.flatMap((f) => f.floor.areas)
    .filter((a) => labels.get(a.key)?.marker)
    .map((a) => ({ n: labels.get(a.key)!.marker!, key: a.key, name: pick(a.nameEn, a.nameAr) })), [frames, labels, pick]);
  const keySig = keyItems.map((k) => `${k.n}:${k.name}`).join('|');
  useEffect(() => { if (size.w) onKey?.(keyItems); }, [keySig, size.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // glow blobs: seeded clusters inside each area, sized by crowding
  const blobsFor = (floor: FloorPlan) => {
    const out: { key: string; x: number; y: number; r: number; o: number }[] = [];
    for (const a of floor.areas) {
      const o = areaOcc(a);
      if (!a.monitored || !o || o.people <= 0) continue;
      const ratio = Math.min(1.15, o.ratio);
      const [x0, y0, x1, y1] = polyBox(a.points);
      const span = Math.sqrt((x1 - x0) * (y1 - y0));
      const c = a.labelAt ?? polyCentroid(a.points);
      if (ratio > 0.35) out.push({ key: a.key, x: c[0], y: c[1], r: span * (0.35 + ratio * 0.3), o: 0.25 + ratio * 0.45 });
      const n = Math.min(10, Math.max(1, Math.round((o.people / Math.max(1, a.capacity)) * 8)));
      const thin = Math.min(x1 - x0, y1 - y0);
      for (const [x, y] of clusterPoints(a, n)) out.push({ key: a.key, x, y, r: Math.max(1.4, Math.min(5, span / 4.5, thin * 0.9)), o: 0.25 + ratio * 0.5 });
    }
    return out;
  };

  const ink = theme === 'dark' ? '#ffffff' : '#241f30';
  const wall = theme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(2,12,10,0.55)';
  const thin = theme === 'dark' ? 'rgba(2,12,10,0.9)' : 'rgba(255,255,255,0.95)';
  const muted = theme === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(2,12,10,0.55)';
  // rooms members do not use and circulation: plain floor, clearly darker (dark) or whiter (light) than an empty area
  const floorFill = theme === 'dark' ? '#070d0c' : '#ffffff';
  const edge = theme === 'dark' ? 'rgba(255,255,255,0.3)' : 'rgba(2,12,10,0.32)';
  const font = 'var(--font-body)';

  const move = (a: PlanArea) => (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    setHover({ key: a.key, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const hovered = hover ? floors.flatMap((f) => f.areas).find((a) => a.key === hover.key) : undefined;
  // keep the tooltip inside the plan box
  const tipX = hover ? Math.max(130, Math.min(size.w - 130, hover.x)) : 0;
  const tipBelow = hover ? hover.y < 150 : false;

  return (
    <div ref={wrap} className={`hm-svgwrap ${compact ? 'is-compact' : ''} ${className}`.trim()} dir="ltr" onPointerLeave={() => setHover(null)}
      style={{ ['--hm-ar' as string]: `${vbW} / ${vbH}` }}>
      <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" role="img"
        aria-label={floors.map((f) => pick(f.nameEn, f.nameAr)).join(', ')} className="hm-svg">
        <defs>
          {frames.map((f) => (
            <clipPath key={f.floor.id} id={`clip-${uid}-${f.floor.id}`}><polygon points={pts(f.floor.outline)} /></clipPath>
          ))}
          {floors.flatMap((f) => f.areas).filter((a) => a.monitored).map((a) => {
            const c = heatColor(areaOcc(a)?.ratio ?? 0, theme);
            return (
              <radialGradient key={a.key} id={`glow-${uid}-${a.key}`}>
                <stop offset="0%" stopColor={c} stopOpacity={1} />
                <stop offset="45%" stopColor={c} stopOpacity={0.55} />
                <stop offset="100%" stopColor={c} stopOpacity={0} />
              </radialGradient>
            );
          })}
        </defs>

        {frames.map(({ floor, dx, dy }) => {
          const blobs = blobsFor(floor);
          const [fx0, fy0] = polyBox(floor.outline);
          return (
            <g key={floor.id} transform={`translate(${dx} ${dy})`}>
              {captions && (
                <text x={fx0} y={fy0 - pad - px(8)} fontSize={px(12)} fill={muted} fontFamily={font}>{pick(floor.nameEn, floor.nameAr)}</text>
              )}
              <polygon points={pts(floor.outline)} fill={floorFill} />

              {floor.areas.map((a) => {
                const o = areaOcc(a);
                const fill = heatColor(o?.ratio ?? 0, theme);
                return (
                  <polygon key={a.key} points={pts(a.points)} fill={fill} fillOpacity={theme === 'dark' ? 0.85 : 0.92}
                    stroke={edge} strokeWidth={px(1)} className={`hm-area ${a.monitored ? 'is-counted' : 'is-service'}`}
                    style={{ transition: 'fill 0.6s ease' }}
                    onPointerMove={move(a)} onPointerEnter={move(a)}
                    onClick={a.monitored && onSelect ? () => onSelect(a.key) : undefined} />
                );
              })}

              {floor.areas.filter((a) => a.detail).map((a) => (
                <polygon key={`d-${a.key}`} points={pts(a.detail!)} fill="none" stroke={thin} strokeOpacity={0.7} strokeWidth={px(1)}
                  strokeDasharray={`${px(4)} ${px(3)}`} style={{ pointerEvents: 'none' }} />
              ))}

              <g clipPath={`url(#clip-${uid}-${floor.id})`} style={{ mixBlendMode: theme === 'dark' ? 'screen' : 'multiply', pointerEvents: 'none' }}>
                {blobs.map((b, i) => (
                  <circle key={`${b.key}-${i}`} cx={b.x} cy={b.y} r={b.r} fill={`url(#glow-${uid}-${b.key})`} opacity={b.o} />
                ))}
              </g>

              <polygon points={pts(floor.outline)} fill="none" stroke={wall} strokeWidth={px(compact ? 1.5 : 2.5)} style={{ pointerEvents: 'none' }} />
              {floor.entrance && (() => {
                const e = floor.entrance;
                const [ex, ey] = e.at;
                const h = e.width / 2;
                const col = theme === 'dark' ? '#7c3aed' : '#241f30';
                return (
                  <g style={{ pointerEvents: 'none' }}>
                    <line x1={e.vertical ? ex : ex - h} y1={e.vertical ? ey - h : ey} x2={e.vertical ? ex : ex + h} y2={e.vertical ? ey + h : ey}
                      stroke={col} strokeWidth={px(compact ? 3 : 5)} />
                    {!compact && (e.vertical
                      ? <text x={ex} y={ey - h - px(7)} textAnchor="end" fontSize={px(11)} fill={muted} fontFamily={font}>{t('heatmap.legend.entrance')}</text>
                      : <text x={ex} y={ey + px(15)} textAnchor="middle" fontSize={px(11)} fill={muted} fontFamily={font}>{t('heatmap.legend.entrance')}</text>)}
                  </g>
                );
              })()}

              {floor.areas.filter((a) => a.key === selected || (compact && a.key === hover?.key)).map((a) => (
                <polygon key={`sel-${a.key}`} points={pts(a.points)} fill="none" stroke={ink} strokeWidth={px(3)} style={{ pointerEvents: 'none' }} />
              ))}

              {!compact && floor.areas.map((a) => {
                const lp = labels.get(a.key);
                if (!a.monitored || !lp) return null;
                const [cx, cy] = a.labelAt ?? polyCentroid(a.points);
                const ratio = areaOcc(a)?.ratio ?? 0;
                const col = inkOn(ratio, theme);
                const halo = heatColor(ratio, theme);
                const haloProps = { stroke: halo, strokeWidth: px(3), strokeOpacity: 0.9, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
                if (lp.marker) {
                  return (
                    <g key={`l-${a.key}`} style={{ pointerEvents: 'none' }}>
                      <circle cx={cx} cy={cy} r={px(8)} fill={ink} />
                      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={px(10)} fill={theme === 'dark' ? '#241f30' : '#ffffff'} fontFamily="var(--font-num)">
                        {fmtNumber(lp.marker)}
                      </text>
                    </g>
                  );
                }
                const total = lp.lines.reduce((s2, l) => s2 + l.fs * LH, 0);
                let y = -total / 2;
                return (
                  <g key={`l-${a.key}`} style={{ pointerEvents: 'none' }} transform={`translate(${cx} ${cy})${lp.rotate ? ' rotate(-90)' : ''}`}>
                    <g fill={col} {...haloProps}>
                      {lp.lines.map((l, k) => {
                        const yc = y + (l.fs * LH) / 2;
                        y += l.fs * LH;
                        return (
                          <text key={k} x={0} y={px(yc)} textAnchor="middle" dominantBaseline="central" fontSize={px(l.fs)}
                            fontFamily={l.display ? 'var(--font-display)' : font}>{l.text}</text>
                        );
                      })}
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}

      </svg>
      {hover && hovered && tooltip && (
        <div className={`hm-tip ${tipBelow ? 'is-below' : ''}`} style={{ left: tipX, top: hover.y }} dir={document.documentElement.dir || 'ltr'}>{tooltip(hovered)}</div>
      )}
    </div>
  );
}
