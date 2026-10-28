import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { InfoTip } from '../../components';
import { useI18n } from '../../i18n';
import { useWatermark } from '../Cameras/vision/CameraFrame';
import type { Camera, Zone } from '../../data/types';

/**
 * Camera pop-up over the Live Floor canvas (the reference build). Anchored at the top end corner of the stage
 * (top right in English, top left in Arabic) and resized from the opposite bottom corner. Keeps 16:9.
 * On phone width it docks full width under the toolbar and cannot be resized.
 */

const SIZE_KEY = 'opt.liveFloor.camWin.v1';
const MIN_W = 240;
const STEP = 24;
const DEFAULT_W = 320;
const HEAD_H = 46;
const GAP = 12;

interface Stored { w: number; large: boolean }
function readSize(): Stored {
  try {
    const v = JSON.parse(localStorage.getItem(SIZE_KEY) || '{}') as Partial<Stored>;
    return { w: typeof v.w === 'number' && v.w > 0 ? v.w : DEFAULT_W, large: v.large === true };
  } catch { return { w: DEFAULT_W, large: false }; }
}
function writeSize(s: Stored) {
  try { localStorage.setItem(SIZE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface CamWindowProps {
  cam: Camera | undefined;
  machineName: string;
  /** Zones of this machine on this camera: drawn as the highlighted detection box. */
  zones: Zone[];
  /** Other zones on the same camera, drawn faint. */
  otherZones: Zone[];
  blur: boolean;
  docked: boolean;
  /** Stage size in px, used for the 70% / 60% limits. */
  stage: { w: number; h: number };
  onClose: () => void;
}

export function CamWindow({ cam, machineName, zones, otherZones, blur, docked, stage, onClose }: CamWindowProps) {
  const { t, pick, isRtl } = useI18n();
  const watermark = useWatermark();
  const [size, setSize] = useState<Stored>(readSize);
  const drag = useRef<{ x: number; y: number; w: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // limits: min 240, max 70% of the canvas width, and the window must fit the stage height
  const maxByH = Math.max(MIN_W, ((stage.h - GAP * 2 - HEAD_H) * 16) / 9);
  const maxW = Math.max(MIN_W, Math.min(stage.w * 0.7, maxByH));
  const clampW = useCallback((w: number) => Math.round(Math.min(maxW, Math.max(MIN_W, w))), [maxW]);
  const width = clampW(size.large ? stage.w * 0.6 : size.w);

  const update = useCallback((next: Stored) => { setSize(next); writeSize(next); }, []);
  const setWidth = (w: number) => update({ w: clampW(w), large: false });
  const toggleLarge = () => update(size.large ? { ...size, large: false } : { w: width, large: true });

  // Escape closes the window (handled here so it wins over the page's "clear selection")
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.overlay')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onDown = (e: PointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, w: width, id: e.pointerId };
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const s = drag.current;
    if (!s || s.id !== e.pointerId) return;
    // the grip sits on the corner opposite the anchor: outward is left (LTR) or right (RTL), and down
    const dxOut = isRtl ? e.clientX - s.x : s.x - e.clientX;
    const dyOut = ((e.clientY - s.y) * 16) / 9;
    const delta = Math.abs(dxOut) >= Math.abs(dyOut) ? dxOut : dyOut;
    setWidth(s.w + delta);
  };
  const onUp = (e: PointerEvent<HTMLSpanElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onGripKey = (e: KeyboardEvent<HTMLSpanElement>) => {
    const grow = isRtl ? 'ArrowRight' : 'ArrowLeft';
    const shrink = isRtl ? 'ArrowLeft' : 'ArrowRight';
    let w: number | null = null;
    if (e.key === grow || e.key === 'ArrowDown') w = width + STEP;
    else if (e.key === shrink || e.key === 'ArrowUp') w = width - STEP;
    else if (e.key === 'Home') w = MIN_W;
    else if (e.key === 'End') w = maxW;
    if (w == null) return;
    e.preventDefault();
    setWidth(w);
  };
  const onHeadDbl = (e: MouseEvent<HTMLDivElement>) => {
    if (docked || (e.target as HTMLElement).closest('button')) return;
    toggleLarge();
  };

  const camName = cam ? pick(cam.nameEn, cam.nameAr) : t('liveFloor.cam.title');
  const large = size.large;
  return (
    <section className={`lf-pip${docked ? ' lf-pip--docked' : ''}${dragging ? ' is-dragging' : ''}`}
      style={docked ? undefined : { width }} aria-label={t('liveFloor.cam.window', { name: machineName || camName })}>
      <div className="lf-pip__head" onDoubleClick={onHeadDbl} title={docked ? undefined : (large ? t('liveFloor.cam.restore') : t('liveFloor.cam.enlarge'))}>
        <div className="lf-pip__titles">
          <span className="lf-pip__name">
            {cam && <i className={`lf-pip__dot${cam.online ? ' is-on' : ''}`} aria-hidden />}
            <span className="lf-pip__cam">{camName}</span>
            {cam && <span className={`lf-pip__state${cam.online ? ' is-on' : ''}`}>{cam.online ? t('liveFloor.cam.online') : t('liveFloor.cam.offline')}</span>}
          </span>
          {machineName && <span className="lf-pip__machine">{t('liveFloor.cam.machine', { name: machineName })}</span>}
        </div>
        <div className="lf-pip__actions">
          {!docked && <InfoTip text={t('liveFloor.cam.resizeInfo')} label={t('liveFloor.cam.resizeHint')} placement="bottom" />}
          {!docked && (
            <button type="button" className="btn btn--icon btn--ghost btn--sm" onClick={toggleLarge}
              aria-label={large ? t('liveFloor.cam.restore') : t('liveFloor.cam.enlarge')} title={large ? t('liveFloor.cam.restore') : t('liveFloor.cam.enlarge')}
              aria-pressed={large}>
              {large ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </button>
          )}
          <button type="button" className="btn btn--icon btn--ghost btn--sm" aria-label={t('common.close')} title={t('common.close')} onClick={onClose}><X aria-hidden /></button>
        </div>
      </div>
      {cam ? (
        <div className={`lf-pip__frame${blur ? ' is-blurred' : ''}`}>
          <CameraArt seed={cam.id} offline={!cam.online} zones={zones} otherZones={otherZones} />
          {!cam.online && <span className="lf-pip__off">{t('liveFloor.cam.offline')}</span>}
          <span className="lf-pip__wm">{watermark}</span>
          {blur && cam.online && <span className="lf-pip__blur">{t('liveFloor.cam.blurred')}</span>}
        </div>
      ) : <p className="lf-pip__none">{t('liveFloor.cam.none')}</p>}
      {!docked && (
        <span className="lf-pip__grip" role="separator" tabIndex={0} aria-orientation="vertical"
          aria-label={t('liveFloor.cam.resize')} title={t('liveFloor.cam.resizeHint')}
          aria-valuemin={MIN_W} aria-valuemax={Math.round(maxW)} aria-valuenow={width}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onGripKey}>
          <svg viewBox="0 0 12 12" aria-hidden><path d="M1 3 L9 11 M1 7 L5 11" /></svg>
        </span>
      )}
    </section>
  );
}

/** Stylised camera frame (no real image exists in the demo) with the machine's detection box highlighted. */
function CameraArt({ seed, offline, zones, otherZones }: { seed: string; offline: boolean; zones: Zone[]; otherZones: Zone[] }) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rows = 3 + (h % 2);
  const pts = (z: Zone) => z.polygon.map(([x, y]) => `${(x * 160).toFixed(1)},${(y * 90).toFixed(1)}`).join(' ');
  const hi = zones.filter((z) => z.polygon.length > 2);
  const box = (() => {
    if (!hi.length) return null;
    const xs = hi.flatMap((z) => z.polygon.map(([x]) => x * 160));
    const ys = hi.flatMap((z) => z.polygon.map(([, y]) => y * 90));
    const x0 = Math.min(...xs) - 3, y0 = Math.min(...ys) - 3;
    return { x: x0, y: y0, w: Math.max(...xs) + 3 - x0, h: Math.max(...ys) + 3 - y0 };
  })();
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" aria-hidden className={offline ? 'is-off' : ''}>
      <defs>
        <radialGradient id={`v${h}`} cx="50%" cy="50%" r="70%"><stop offset="0%" stopColor="#3e4846" /><stop offset="100%" stopColor="#0d1513" /></radialGradient>
      </defs>
      <g className="lf-pip__scene">
        <rect width="160" height="90" fill={`url(#v${h})`} />
        <path d="M0 90 L40 30 L120 30 L160 90 Z" fill="#26302e" />
        {Array.from({ length: rows }, (_, r) => Array.from({ length: 5 }, (_, i) => (
          <rect key={`${r}-${i}`} x={30 + i * 21 + r * 2} y={36 + r * 15} width={12} height={8} fill={(h >> (r * 5 + i)) & 1 ? '#c7c3a0' : '#5d6664'} opacity={0.9} />
        )))}
        <circle cx={80} cy={45} r={44} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={10} />
      </g>
      {!offline && (
        <g className="lf-pip__zones">
          {otherZones.filter((z) => z.polygon.length > 2).map((z) => <polygon key={z.id} points={pts(z)} className="lf-pip__zone" />)}
          {hi.map((z) => <polygon key={z.id} points={pts(z)} className="lf-pip__zone is-hi" />)}
          {box && <rect x={box.x} y={box.y} width={box.w} height={box.h} className="lf-pip__box" />}
        </g>
      )}
    </svg>
  );
}
