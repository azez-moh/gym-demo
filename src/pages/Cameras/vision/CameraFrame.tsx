import { useId, useMemo, type MouseEvent } from 'react';
import { EyeOff, Lock, VideoOff } from 'lucide-react';
import type { Camera, Machine, MachineType } from '../../../data/types';
import { useDemo } from '../../../data/store';
import { useScope } from '../../../layout/filters';
import { useI18n } from '../../../i18n';
import {
  HORIZON, VB_H, VB_W, decorMachines, floorLines, polyAnchor, polyBox, polyPoints, riderFor, walkers,
  type SceneMachine, type ScenePerson,
} from './scene';
import { zoneLabel, type VZone } from './model';

export interface FrameZone extends VZone { active: boolean; motionPct: number }

export interface CameraFrameProps {
  camera: Camera;
  zones: FrameZone[];
  machines: Machine[];
  /** Live machine states by machine id. */
  inUse: Record<string, boolean>;
  phase: number;
  showZones?: boolean;
  labels?: boolean;
  selectedZoneId?: string | null;
  selectedMachineId?: string | null;
  onZoneClick?: (zoneId: string) => void;
  /** Draw mode: clicks on the picture add outline points (normalised 0..1). */
  drawPoints?: [number, number][] | null;
  drawPoints2?: [number, number][] | null;
  onDrawPoint?: (p: [number, number]) => void;
  /** Small tile: no zone labels, compact watermark. */
  compact?: boolean;
  className?: string;
}

/** Silhouette of one machine inside its box, drawn as flat shapes (top-down-ish CCTV view). */
function MachineShape({ m }: { m: SceneMachine }) {
  const { x, y, w, h } = m;
  const t: MachineType = m.type;
  const fill = 'var(--cam-machine)';
  const edge = 'var(--cam-machine-edge)';
  if (t === 'treadmill' || t === 'slat-treadmill' || t === 'incline-treadmill') {
    return (
      <g>
        <rect x={x + w * 0.08} y={y + h * 0.35} width={w * 0.84} height={h * 0.5} fill={fill} stroke={edge} strokeWidth={0.3} />
        <rect x={x + w * 0.14} y={y + h * 0.42} width={w * 0.72} height={h * 0.36} fill="var(--cam-belt)" />
        <rect x={x + w * 0.04} y={y + h * 0.08} width={w * 0.12} height={h * 0.6} fill={edge} />
        <rect x={x + w * 0.02} y={y + h * 0.04} width={w * 0.2} height={h * 0.12} fill={fill} stroke={edge} strokeWidth={0.3} />
      </g>
    );
  }
  if (t === 'indoor-bike' || t === 'recumbent-bike' || t === 'upper-body-ergometer') {
    const r = Math.min(w, h) * 0.22;
    return (
      <g>
        <circle cx={x + w * 0.3} cy={y + h * 0.62} r={r} fill="none" stroke={edge} strokeWidth={0.8} />
        <rect x={x + w * 0.3} y={y + h * 0.5} width={w * 0.45} height={h * 0.12} fill={fill} />
        <rect x={x + w * 0.62} y={y + h * 0.25} width={w * 0.24} height={h * 0.1} fill={edge} />
        <rect x={x + w * 0.2} y={y + h * 0.2} width={w * 0.08} height={h * 0.4} fill={edge} />
      </g>
    );
  }
  if (t === 'rower') {
    return (
      <g>
        <rect x={x + w * 0.04} y={y + h * 0.5} width={w * 0.92} height={h * 0.12} fill={fill} stroke={edge} strokeWidth={0.3} />
        <circle cx={x + w * 0.14} cy={y + h * 0.5} r={Math.min(w, h) * 0.2} fill={edge} />
        <rect x={x + w * 0.5} y={y + h * 0.42} width={w * 0.16} height={h * 0.2} fill={edge} />
      </g>
    );
  }
  if (t === 'stair-climber' || t === 'elliptical' || t === 'adaptive-cross-trainer') {
    return (
      <g>
        <rect x={x + w * 0.18} y={y + h * 0.45} width={w * 0.64} height={h * 0.4} fill={fill} stroke={edge} strokeWidth={0.3} />
        <ellipse cx={x + w * 0.5} cy={y + h * 0.62} rx={w * 0.22} ry={h * 0.12} fill="none" stroke={edge} strokeWidth={0.6} />
        <rect x={x + w * 0.44} y={y + h * 0.06} width={w * 0.12} height={h * 0.5} fill={edge} />
      </g>
    );
  }
  // benches and curl stations
  return (
    <g>
      <rect x={x + w * 0.1} y={y + h * 0.42} width={w * 0.8} height={h * 0.22} fill={fill} stroke={edge} strokeWidth={0.3} />
      <rect x={x + w * 0.2} y={y + h * 0.64} width={w * 0.06} height={h * 0.24} fill={edge} />
      <rect x={x + w * 0.74} y={y + h * 0.64} width={w * 0.06} height={h * 0.24} fill={edge} />
      {(t === 'preacher-curl' || t === 'standing-preacher') && <rect x={x + w * 0.66} y={y + h * 0.18} width={w * 0.2} height={h * 0.26} fill={fill} stroke={edge} strokeWidth={0.3} />}
    </g>
  );
}

function PersonBlob({ p }: { p: ScenePerson }) {
  const s = p.s;
  return (
    <g className="camf__person" style={{ transform: `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px)` }}>
      <ellipse cx={0} cy={0} rx={3.1 * s} ry={4.6 * s} fill="var(--cam-person)" />
      <circle cx={0} cy={-6.2 * s} r={2.1 * s} fill="var(--cam-person-head)" />
      <ellipse cx={0} cy={4.4 * s} rx={3.4 * s} ry={1 * s} fill="rgba(0,0,0,0.25)" />
    </g>
  );
}

/** Watermark text: signed-in role and organisation, then date and time. Never an invented person. */
export function useWatermark(): string {
  const { t, fmtDate, fmtTime } = useI18n();
  const { role } = useScope();
  const { now } = useDemo();
  return t('cameras.frame.watermark', {
    role: t(`role.${role}Short`), org: t('cameras.frame.org'), date: fmtDate(now, 'medium'), time: fmtTime(now),
  });
}

export function CameraFrame({
  camera, zones, machines, inUse, phase, showZones = true, labels = true, selectedZoneId, selectedMachineId,
  onZoneClick, drawPoints, drawPoints2, onDrawPoint, compact, className = '',
}: CameraFrameProps) {
  const { t, pick } = useI18n();
  const { settings } = useDemo();
  const blur = settings.blurCameras;
  const watermark = useWatermark();
  const fid = useId().replace(/:/g, '');

  const sceneMachines = useMemo<SceneMachine[]>(() => {
    const byMachine = new Map<string, FrameZone[]>();
    for (const z of zones) {
      if (!z.polygon.length) continue;
      const l = byMachine.get(z.machineId) ?? [];
      l.push(z);
      byMachine.set(z.machineId, l);
    }
    const list: SceneMachine[] = [];
    for (const [mid, zs] of byMachine) {
      const m = machines.find((x) => x.id === mid);
      if (!m) continue;
      const b = polyBox(zs.map((z) => z.polygon));
      list.push({ id: mid, type: m.type, x: b.x + b.w * 0.06, y: b.y + b.h * 0.06, w: b.w * 0.88, h: b.h * 0.88, inUse: !!inUse[mid] });
    }
    return list.length ? list : decorMachines(camera);
  }, [zones, machines, inUse, camera]);

  const people = useMemo(() => {
    const riders = sceneMachines.filter((m) => m.inUse).map((m) => riderFor(m, phase));
    return [...riders, ...walkers(camera, phase, compact ? 2 : 3)];
  }, [sceneMachines, camera, phase, compact]);

  const lines = useMemo(floorLines, []);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!onDrawPoint) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    onDrawPoint([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
  };

  const name = pick(camera.nameEn, camera.nameAr);

  if (!camera.online) {
    return (
      <div className={`camf camf--offline ${compact ? 'camf--compact' : ''} ${className}`.trim()} role="img" aria-label={t('cameras.noSignal')}>
        <div className="camf__nosignal">
          <VideoOff aria-hidden />
          <strong>{t('cameras.noSignal')}</strong>
          {!compact && <span>{t('cameras.noSignalBody')}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`camf ${compact ? 'camf--compact' : ''} ${onDrawPoint ? 'camf--draw' : ''} ${className}`.trim()} onClick={onClick}>
      <svg className="camf__svg" viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none" role="img" aria-label={t('cameras.frame.imageLabel', { name })}>
        <defs>
          <filter id={`blur-${fid}`} x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation={compact ? 1.1 : 0.85} /></filter>
          <radialGradient id={`vig-${fid}`} cx="50%" cy="50%" r="75%">
            <stop offset="60%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </radialGradient>
          <linearGradient id={`floor-${fid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cam-floor-far)" />
            <stop offset="100%" stopColor="var(--cam-floor-near)" />
          </linearGradient>
        </defs>
        <g filter={blur ? `url(#blur-${fid})` : undefined}>
          <rect x={0} y={0} width={VB_W} height={HORIZON} fill="var(--cam-wall)" />
          {[18, 58, 98, 138].map((x) => <rect key={x} x={x} y={1.5} width={14} height={4} fill="var(--cam-window)" />)}
          <rect x={0} y={HORIZON} width={VB_W} height={VB_H - HORIZON} fill={`url(#floor-${fid})`} />
          {lines.map((l, i) => <line key={i} {...l} stroke="var(--cam-grid)" strokeWidth={0.25} />)}
          {sceneMachines.map((m) => <MachineShape key={m.id} m={m} />)}
          {people.map((p) => <PersonBlob key={p.key} p={p} />)}
        </g>
        <rect x={0} y={0} width={VB_W} height={VB_H} fill={`url(#vig-${fid})`} pointerEvents="none" />

        {/* detection boxes around people (drawn sharp, over the blur) */}
        {!compact && people.map((p) => (
          <rect key={`d:${p.key}`} className="camf__detect" style={{ transform: `translate(${(p.x - 4 * p.s).toFixed(2)}px, ${(p.y - 9 * p.s).toFixed(2)}px)` }}
            width={8 * p.s} height={14.5 * p.s} fill="none" vectorEffect="non-scaling-stroke" />
        ))}

        {showZones && zones.map((z) => {
          if (!z.polygon.length) return null;
          const sel = z.id === selectedZoneId || z.machineId === selectedMachineId;
          return (
            <polygon key={z.id} points={polyPoints(z.polygon)} vectorEffect="non-scaling-stroke"
              className={`camf__zone ${z.active ? 'is-active' : ''} ${sel ? 'is-selected' : ''} ${z.watching ? '' : 'is-off'}`}
              onClick={onZoneClick && !onDrawPoint ? (e) => { e.stopPropagation(); onZoneClick(z.id); } : undefined} />
          );
        })}

        {drawPoints && drawPoints.length > 0 && (
          <g className="camf__drawing">
            <polygon points={polyPoints(drawPoints)} vectorEffect="non-scaling-stroke" />
            {drawPoints.map((p, i) => <circle key={i} cx={p[0] * VB_W} cy={p[1] * VB_H} r={0.9} />)}
          </g>
        )}
        {drawPoints2 && drawPoints2.length > 0 && (
          <g className="camf__drawing camf__drawing--op">
            <polygon points={polyPoints(drawPoints2)} vectorEffect="non-scaling-stroke" />
            {drawPoints2.map((p, i) => <circle key={i} cx={p[0] * VB_W} cy={p[1] * VB_H} r={0.9} />)}
          </g>
        )}
      </svg>

      {showZones && labels && !compact && zones.map((z) => {
        if (!z.polygon.length) return null;
        const [ax, ay] = polyAnchor(z.polygon);
        const sel = z.id === selectedZoneId || z.machineId === selectedMachineId;
        const m = machines.find((x) => x.id === z.machineId);
        return (
          <span key={`l:${z.id}`} className={`camf__label ${sel ? 'is-selected' : ''} ${z.active ? 'is-active' : ''}`}
            style={{ left: `${(Math.min(ax, 0.75) * 100).toFixed(2)}%`, top: `${(ay * 100).toFixed(2)}%` }} data-below={ay < 0.09 || undefined}>
            {zoneLabel(z, m, pick, t)}
          </span>
        );
      })}

      <span className="camf__blurchip">
        {blur ? <Lock aria-hidden /> : <EyeOff aria-hidden />}
        {blur ? t('cameras.frame.blurOn') : t('cameras.frame.blurOff')}
      </span>
      <span className="camf__watermark ltr-safe">{watermark}</span>
    </div>
  );
}
