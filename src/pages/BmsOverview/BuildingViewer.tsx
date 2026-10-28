import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Html, OrbitControls } from '@react-three/drei';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useTheme } from '../../theme/theme';
import { useI18n } from '../../i18n';
import type { Area } from '../../data/types';
import type { AcRow, LightRow } from '../../data/selectors';
type OrbitImpl = { target: { set: (x: number, y: number, z: number) => void }; update: () => void };
import { BUILDING, acStatus, areaRect, areaStatus, areaTemperature, floorIndex, type UnitStatus } from './bms';

/*
  Procedural isometric gym building for the focus club: one slab per floor, outer walls, columns, each area as a
  coloured zone, AC units as small boxes, light circuits as flat discs and presence as small markers.
  Colour by state (running, off, watch, alarm), temperature (against setpoint) or occupancy (people per area).
*/

export type ColorBy = 'state' | 'temperature' | 'occupancy';
export type ViewMode = 'iso' | 'top' | 'front';
export type LayerId = 'slab' | 'walls' | 'columns' | 'zones' | 'labels' | 'ac' | 'lights' | 'presence';
export const LAYERS: LayerId[] = ['slab', 'walls', 'columns', 'zones', 'labels', 'ac', 'lights', 'presence'];

export interface ZoneInfo {
  area: Area;
  units: AcRow[];
  lights: LightRow[];
  people: number;
  status: UnitStatus;
  temp?: number;
  setpoint?: number;
}

export interface BuildingViewerProps {
  zones: ZoneInfo[];
  floors: number[];
  layers: Set<LayerId>;
  spread: number;
  view: ViewMode;
  colorBy: ColorBy;
  selected?: string;
  onSelect?: (areaId: string | undefined) => void;
  height: number | string;
  ariaLabel: string;
  compact?: boolean;
}

function palette(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? {
      bg: '#0b0913', slab: '#16211f', slabEdge: '#3a4644', wall: '#24302e', column: '#3a4644', label: '#ffffff',
      on: '#3d9a6a', off: '#4a4657', watch: '#d9962b', alarm: '#c2453d', select: '#7c3aed',
      seq: ['#2a2536', '#352470', '#5a39bb', '#9b7af2', '#7c3aed'], cool: '#21c3d6', unit: '#e7e3f2', light: '#7c3aed', person: '#ffffff',
    }
    : {
      bg: '#ecebf0', slab: '#ffffff', slabEdge: '#8b8794', wall: '#dcd8e6', column: '#b9b4c4', label: '#241f30',
      on: '#4f9b74', off: '#b9b4c4', watch: '#d99a3a', alarm: '#c4544c', select: '#241f30',
      seq: ['#f1eef9', '#e2d8fc', '#cbb8f9', '#ae92f5', '#7c3aed'], cool: '#0e8fae', unit: '#3a3450', light: '#7c3aed', person: '#241f30',
    };
}

type Pal = ReturnType<typeof palette>;

function zoneColor(z: ZoneInfo, colorBy: ColorBy, pal: Pal, maxPeople: number): string {
  if (colorBy === 'state') return pal[z.status];
  if (colorBy === 'occupancy') {
    if (!z.people) return pal.seq[0];
    const i = Math.min(pal.seq.length - 1, 1 + Math.floor((z.people / Math.max(1, maxPeople)) * (pal.seq.length - 1.01)));
    return pal.seq[i];
  }
  if (z.temp == null || z.setpoint == null) return pal.off;
  const over = z.temp - z.setpoint;
  if (over >= 3) return pal.alarm;
  if (over >= 1.5) return pal.watch;
  if (over <= -1) return pal.cool;
  return pal.on;
}

const CENTER = { x: BUILDING.w / 2, z: BUILDING.d / 2 };
/** Structural grid, about 7.8 m bays across the building. */
const COL_X = Array.from({ length: 7 }, (_, i) => (i * BUILDING.w) / 6);
const COL_Z = Array.from({ length: 6 }, (_, i) => (i * BUILDING.d) / 5);
/** On-screen size relative to the 30 m procedural block the zoom was tuned for. */
const SIZE_K = (Math.max(BUILDING.w, BUILDING.d) / 30) * 1.2;
const VIEW_POS: Record<ViewMode, [number, number, number]> = {
  iso: [34, 34, 34],
  top: [0.001, 60, 0.01],
  front: [0, 8, 60],
};

function CameraRig({ view, zoomSignal, baseZoom }: { view: ViewMode; zoomSignal: { n: number; dir: number }; baseZoom: number }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const [x, y, z] = VIEW_POS[view];
    camera.position.set(x, y, z);
    camera.zoom = baseZoom;
    camera.updateProjectionMatrix();
    const c = controls as unknown as OrbitImpl | null;
    if (c) { c.target.set(0, 2, 0); c.update(); }
  }, [view, camera, controls, baseZoom]);
  useEffect(() => {
    if (!zoomSignal.n) return;
    if (zoomSignal.dir === 0) {
      const [x, y, z] = VIEW_POS[view];
      camera.position.set(x, y, z);
      camera.zoom = baseZoom;
      const c = controls as unknown as OrbitImpl | null;
      if (c) { c.target.set(0, 2, 0); c.update(); }
    } else {
      camera.zoom = Math.max(baseZoom * 0.5, Math.min(baseZoom * 3, camera.zoom * (zoomSignal.dir > 0 ? 1.2 : 1 / 1.2)));
    }
    camera.updateProjectionMatrix();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomSignal]);
  return null;
}

function Building({ zones, floors, layers, spread, colorBy, selected, onSelect, pal, compact }: Omit<BuildingViewerProps, 'height' | 'ariaLabel' | 'view'> & { pal: Pal }) {
  const { pick, fmtNumber } = useI18n();
  const maxPeople = Math.max(1, ...zones.map((z) => z.people));
  const allFloors = [...new Set(zones.map((z) => floorIndex(z.area)))].sort((a, b) => a - b);
  const gap = BUILDING.floorH + spread * 7;
  const [hover, setHover] = useState<string | undefined>();
  const levelY = (fi: number) => (allFloors.indexOf(fi) - (allFloors.length - 1) / 2) * gap;

  return (
    <group position={[-CENTER.x, 0, -CENTER.z]}>
      {allFloors.filter((f) => floors.includes(f)).map((fi) => {
        const y = levelY(fi);
        const onFloor = zones.filter((z) => floorIndex(z.area) === fi);
        return (
          <group key={fi} position={[0, y, 0]}>
            {layers.has('slab') && (
              <mesh position={[CENTER.x, -0.15, CENTER.z]} receiveShadow>
                <boxGeometry args={[BUILDING.w + 0.6, 0.3, BUILDING.d + 0.6]} />
                <meshStandardMaterial color={pal.slab} />
                <Edges color={pal.slabEdge} />
              </mesh>
            )}
            {layers.has('walls') && (
              <group>
                {[
                  [CENTER.x, BUILDING.d, BUILDING.w, 0.2],
                  [0, CENTER.z, 0.2, BUILDING.d],
                ].map(([x, z, w, d], i) => (
                  <mesh key={i} position={[x, 1.1, z]}>
                    <boxGeometry args={[w, 2.2, d]} />
                    <meshStandardMaterial color={pal.wall} transparent opacity={0.55} />
                  </mesh>
                ))}
                {[
                  [CENTER.x, 0, BUILDING.w, 0.12],
                  [BUILDING.w, CENTER.z, 0.12, BUILDING.d],
                ].map(([x, z, w, d], i) => (
                  <mesh key={`l${i}`} position={[x, 0.3, z]}>
                    <boxGeometry args={[w, 0.6, d]} />
                    <meshStandardMaterial color={pal.wall} transparent opacity={0.5} />
                  </mesh>
                ))}
              </group>
            )}
            {layers.has('columns') && COL_X.flatMap((x) => COL_Z.map((z) => (
              <mesh key={`${x}:${z}`} position={[x, 1.2, z]}>
                <boxGeometry args={[0.35, 2.4, 0.35]} />
                <meshStandardMaterial color={pal.column} />
              </mesh>
            )))}
            {onFloor.map((z, i) => {
              const [x0, z0, w, d] = areaRect(z.area, i);
              const id = z.area.id;
              const isSel = selected === id;
              const isHover = hover === id;
              const col = zoneColor(z, colorBy, pal, maxPeople);
              return (
                <group key={id}>
                  {layers.has('zones') && (
                    <mesh position={[x0 + w / 2, 0.06, z0 + d / 2]}
                      onClick={(e) => { e.stopPropagation(); onSelect?.(isSel ? undefined : id); }}
                      onPointerOver={(e) => { e.stopPropagation(); setHover(id); document.body.style.cursor = 'pointer'; }}
                      onPointerOut={() => { setHover(undefined); document.body.style.cursor = ''; }}>
                      <boxGeometry args={[w - 0.25, 0.12, d - 0.25]} />
                      <meshStandardMaterial color={col} transparent opacity={isSel || isHover ? 0.95 : 0.78} />
                      {(isSel || isHover) && <Edges color={pal.select} lineWidth={2} />}
                    </mesh>
                  )}
                  {layers.has('ac') && z.units.map((u, k) => {
                    const st = acStatus(u.live);
                    const ux = x0 + ((k + 1) / (z.units.length + 1)) * w;
                    return (
                      <mesh key={u.id} position={[ux, 0.55, z0 + d * 0.3]} castShadow>
                        <boxGeometry args={[0.9, 0.9, 0.9]} />
                        <meshStandardMaterial color={st === 'off' ? pal.off : pal[st]} />
                        <Edges color={pal.slabEdge} />
                      </mesh>
                    );
                  })}
                  {layers.has('lights') && z.lights.map((l, k) => (
                    <mesh key={l.id} position={[x0 + ((k + 1) / (z.lights.length + 1)) * w, 0.2, z0 + d * 0.72]}>
                      <cylinderGeometry args={[0.45, 0.45, 0.12, 20]} />
                      <meshStandardMaterial color={l.live?.on ? pal.light : pal.off} emissive={l.live?.on ? pal.light : '#000000'} emissiveIntensity={l.live?.on ? 0.35 : 0} />
                    </mesh>
                  ))}
                  {layers.has('presence') && Array.from({ length: Math.min(12, Math.ceil(z.people / 3)) }, (_, k) => (
                    <mesh key={k} position={[x0 + 1 + ((k * 2.3) % Math.max(1, w - 2)), 0.45, z0 + d * 0.5 + ((k % 3) - 1) * 0.9]}>
                      <cylinderGeometry args={[0.18, 0.18, 0.7, 10]} />
                      <meshStandardMaterial color={pal.person} />
                    </mesh>
                  ))}
                  {layers.has('labels') && !compact && (
                    <Html position={[x0 + w / 2, 0.3, z0 + d / 2]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
                      <div className="bv-tag">
                        <span>{pick(z.area.nameEn, z.area.nameAr)}</span>
                        {colorBy === 'occupancy' ? <b className="num">{fmtNumber(z.people)}</b>
                          : z.temp != null ? <b className="num ltr">{fmtNumber(z.temp, 1)}°C</b> : null}
                      </div>
                    </Html>
                  )}
                </group>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

export function BuildingViewer(props: BuildingViewerProps) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const pal = palette(theme);
  const [zoomSignal, setZoomSignal] = useState({ n: 0, dir: 0 });
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const baseZoom = useMemo(() => Math.max(4, Math.min(22, w / ((props.compact ? 40 : 38) * SIZE_K))), [w, props.compact]);

  return (
    <div ref={wrap} className={`bv ${props.compact ? 'bv--compact' : ''}`} style={{ height: props.height, background: pal.bg }} role="img" aria-label={props.ariaLabel}>
      <Canvas orthographic shadows dpr={[1, 2]} camera={{ position: VIEW_POS.iso, zoom: baseZoom, near: -200, far: 400 }}
        onPointerMissed={() => props.onSelect?.(undefined)}>
        <color attach="background" args={[pal.bg]} />
        <hemisphereLight args={[theme === 'dark' ? '#cfd8d6' : '#ffffff', theme === 'dark' ? '#151024' : '#d9d9d6', theme === 'dark' ? 0.7 : 1]} />
        <directionalLight position={[20, 40, 25]} intensity={theme === 'dark' ? 1.1 : 1.3} castShadow />
        <Suspense fallback={null}>
          <Building {...props} compact={props.compact || w < 560} pal={pal} />
        </Suspense>
        <OrbitControls makeDefault enableZoom={false} enablePan={!props.compact} enableRotate={props.view !== 'top'} maxPolarAngle={Math.PI / 2.1} />
        <CameraRig view={props.view} zoomSignal={zoomSignal} baseZoom={baseZoom} />
      </Canvas>
      {!props.compact && (
        <div className="bv-zoom">
          <button type="button" className="btn btn--sm btn--icon" aria-label={t('bmsOverview.zoomIn')} title={t('bmsOverview.zoomIn')} onClick={() => setZoomSignal((s) => ({ n: s.n + 1, dir: 1 }))}><Plus aria-hidden /></button>
          <button type="button" className="btn btn--sm btn--icon" aria-label={t('bmsOverview.zoomOut')} title={t('bmsOverview.zoomOut')} onClick={() => setZoomSignal((s) => ({ n: s.n + 1, dir: -1 }))}><Minus aria-hidden /></button>
          <button type="button" className="btn btn--sm btn--icon" aria-label={t('bmsOverview.resetView')} title={t('bmsOverview.resetView')} onClick={() => setZoomSignal((s) => ({ n: s.n + 1, dir: 0 }))}><RotateCcw aria-hidden /></button>
        </div>
      )}
    </div>
  );
}

/** Builds the zone list for the viewer and the tables from the selectors' rows. */
export function buildZones(areas: Area[], ac: AcRow[], lights: LightRow[], presence: { area: Area; people: number }[]): ZoneInfo[] {
  return areas.map((area) => {
    const units = ac.filter((u) => u.areaId === area.id);
    const ls = lights.filter((l) => l.areaId === area.id);
    const people = presence.find((p) => p.area.id === area.id)?.people ?? 0;
    const sp = units.length ? units[0].live?.setpoint : undefined;
    return { area, units, lights: ls, people, status: areaStatus(units, ls), temp: areaTemperature(units), setpoint: sp };
  });
}
