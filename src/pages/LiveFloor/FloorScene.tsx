import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MachineType } from '../../data/types';
import { MACHINE_FOOTPRINT } from '../../data/library';
import { MachineModel, machinePalette } from '../../three/machines';
import { StudioLights, sceneColors } from '../../three/Scene';
import { flatMaterial } from '../../three/machineGeometry';
import { hatchTexture, textTexture } from './textures';

/*
  The Live Floor stage: slab with low walls and a 1 m grid, the big floor label, a scale bar, the machines
  at their stored positions, an animated camera (intro fly-in, Fit view, focus on a machine), 3D / plan
  modes, labels projected to the screen without overlaps, hover tooltip and drag-to-move in edit mode.
  Rendering is on demand: frames are drawn only when something changes or moves.
*/

export interface FloorMachine {
  id: string;
  type: MachineType;
  name: string;
  x: number;
  z: number;
  rot: number;
  accent: string;
  person: boolean;
  accentGlow: number;
  glow?: string;
  plate?: string;
  plateOpacity?: number;
  /** Hatched plate colour (out of service, no reading). */
  hatch?: string;
  /** Outline colour of the footprint (cooling, edit). */
  ring?: string;
  /** Short line in the hover tooltip. */
  tip: string;
}

export interface FloorBounds { x: [number, number]; z: [number, number] }

export interface FloorLabel { text: string; x: number; z: number; size: number }

export interface FloorSceneProps {
  machines: FloorMachine[];
  bounds: FloorBounds;
  label: FloorLabel;
  theme: 'light' | 'dark';
  mode: '3d' | '2d';
  showLabels: boolean;
  showFootprints: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  editing: boolean;
  onMove: (id: string, x: number, z: number) => void;
  /** Increment to frame the whole floor. */
  fitSignal: number;
  /** Increment (with focusId) to centre the camera on a machine. */
  focusSignal: number;
  focusId: string | null;
  ariaLabel: string;
  fontFamily: string;
  scaleLabels: { m1: string; m5: string };
  /** Shown in the drag readout: formats metres. */
  fmtPos: (x: number, z: number) => string;
  reducedMotion: boolean;
}

type V3 = [number, number, number];

const FOV = 40;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------- floor shell

const FloorShell = memo(function FloorShell({ bounds, theme, label, fontFamily, scaleLabels }: {
  bounds: FloorBounds; theme: 'light' | 'dark'; label: FloorLabel; fontFamily: string; scaleLabels: { m1: string; m5: string };
}) {
  const c = sceneColors(theme);
  const W = bounds.x[1] - bounds.x[0];
  const D = bounds.z[1] - bounds.z[0];
  const cx = (bounds.x[0] + bounds.x[1]) / 2;
  const cz = (bounds.z[0] + bounds.z[1]) / 2;
  const wallH = 0.45;
  const wallT = 0.14;

  const grid = useMemo(() => {
    const minor: number[] = [];
    const major: number[] = [];
    const y = 0.002;
    for (let x = Math.ceil(bounds.x[0]); x <= Math.floor(bounds.x[1]); x++) (x % 5 === 0 ? major : minor).push(x, y, bounds.z[0], x, y, bounds.z[1]);
    for (let z = Math.ceil(bounds.z[0]); z <= Math.floor(bounds.z[1]); z++) (z % 5 === 0 ? major : minor).push(bounds.x[0], y, z, bounds.x[1], y, z);
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(minor, 3));
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(major, 3));
    return { minor: g1, major: g2 };
  }, [bounds]);
  useEffect(() => () => { grid.minor.dispose(); grid.major.dispose(); }, [grid]);

  const floorText = useMemo(() => (label.text ? textTexture(label.text, { color: theme === 'dark' ? '#3b4845' : '#d6d7d4', font: fontFamily, px: 160 }) : null), [label.text, theme, fontFamily]);
  const textH = 1.6 * label.size;
  const sb = useMemo(() => ({
    m0: textTexture('0', { color: c.outline, font: fontFamily, px: 48 }),
    m1: textTexture(scaleLabels.m1, { color: c.outline, font: fontFamily, px: 48 }),
    m5: textTexture(scaleLabels.m5, { color: c.outline, font: fontFamily, px: 48 }),
  }), [c.outline, fontFamily, scaleLabels.m1, scaleLabels.m5]);
  const sx = bounds.x[0] + 0.7;
  const sz = bounds.z[1] - 0.55;

  const floorColor = theme === 'dark' ? '#141f1d' : '#fbfbfa';
  const slabSide = theme === 'dark' ? '#1f2a28' : '#dededb';
  return (
    <group>
      {/* slab */}
      <mesh position={[cx, -0.08, cz]} receiveShadow>
        <boxGeometry args={[W + wallT * 2, 0.16, D + wallT * 2]} />
        <meshStandardMaterial color={slabSide} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.0005, cz]} receiveShadow>
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={floorColor} roughness={0.92} metalness={0} />
      </mesh>
      <lineSegments geometry={grid.minor}><lineBasicMaterial color={theme === 'dark' ? '#24302e' : c.grid} /></lineSegments>
      <lineSegments geometry={grid.major}><lineBasicMaterial color={theme === 'dark' ? '#35423f' : c.gridStrong} /></lineSegments>
      {/* low perimeter walls */}
      {([
        [[cx, wallH / 2, bounds.z[0] - wallT / 2], [W + wallT * 2, wallH, wallT]],
        [[cx, wallH / 2, bounds.z[1] + wallT / 2], [W + wallT * 2, wallH, wallT]],
        [[bounds.x[0] - wallT / 2, wallH / 2, cz], [wallT, wallH, D]],
        [[bounds.x[1] + wallT / 2, wallH / 2, cz], [wallT, wallH, D]],
      ] as [V3, V3][]).map(([p, s], i) => (
        <mesh key={i} position={p} castShadow receiveShadow>
          <boxGeometry args={s} />
          <meshStandardMaterial color={theme === 'dark' ? '#2a3533' : '#e4e4e1'} roughness={0.9} />
        </mesh>
      ))}
      {/* big floor label */}
      {floorText && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[label.x, 0.003, label.z]} renderOrder={0}>
          <planeGeometry args={[textH * floorText.aspect, textH]} />
          <meshBasicMaterial map={floorText.tex} transparent depthWrite={false} opacity={0.9} />
        </mesh>
      )}
      {/* scale bar: 0, 1 m, 5 m */}
      <group position={[sx, 0.004, sz]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.5, 0, 0]}>
          <planeGeometry args={[5, 0.06]} />
          <meshBasicMaterial color={c.outline} />
        </mesh>
        {[0, 1, 5].map((x) => (
          <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, -0.08]}>
            <planeGeometry args={[0.05, 0.22]} />
            <meshBasicMaterial color={c.outline} />
          </mesh>
        ))}
        {([[0, sb.m0], [1, sb.m1], [5, sb.m5]] as const).map(([x, t]) => (
          <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0, -0.42]}>
            <planeGeometry args={[0.36 * t.aspect, 0.36]} />
            <meshBasicMaterial map={t.tex} transparent depthWrite={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
});

// ---------------------------------------------------------------- one machine

interface MachineNodeProps {
  m: FloorMachine;
  selected: boolean;
  hovered: boolean;
  showFootprints: boolean;
  editing: boolean;
  dragging: boolean;
  theme: 'light' | 'dark';
  onDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onClick: (id: string, e: ThreeEvent<MouseEvent>) => void;
  onOver: (id: string, e: ThreeEvent<PointerEvent>) => void;
  onOut: (id: string) => void;
}

const MachineNode = memo(function MachineNode({ m, selected, hovered, showFootprints, editing, dragging, theme, onDown, onClick, onOver, onOut }: MachineNodeProps) {
  const pal = machinePalette(theme);
  const c = sceneColors(theme);
  const fp = MACHINE_FOOTPRINT[m.type] ?? { l: 1, w: 1, h: 1 };
  const hatchMat = useMemo(() => {
    if (!m.hatch) return null;
    const tex = hatchTexture(m.hatch);
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  }, [m.hatch]);
  useEffect(() => () => hatchMat?.dispose(), [hatchMat]);
  return (
    <group position={[m.x, dragging ? 0.06 : 0, m.z]} rotation={[0, (m.rot * Math.PI) / 180, 0]}>
      <MachineModel type={m.type} accent={m.accent} frame={pal.frame} soft={pal.soft} metal={pal.metal} screen={pal.screen}
        person={m.person} personColor={theme === 'dark' ? '#e9ecea' : '#4a5250'} glow={m.glow} plate={m.plate} plateOpacity={m.plateOpacity}
        accentGlow={m.accentGlow} animate selected={selected} outline={m.ring ?? (hovered ? c.label : c.outline)} showFootprint={showFootprints || !!m.ring || hovered || editing}
        showClearance={showFootprints} castShadow
        onPointerDown={(e) => onDown(m.id, e)} onClick={(e) => onClick(m.id, e)}
        onPointerOver={(e) => onOver(m.id, e)} onPointerOut={() => onOut(m.id)} />
      {hatchMat && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} material={hatchMat} renderOrder={2}>
          <planeGeometry args={[fp.w, fp.l]} />
        </mesh>
      )}
    </group>
  );
});

// ---------------------------------------------------------------- camera rig

interface Pose { target: THREE.Vector3; r: number; theta: number; phi: number }

function fitPose(bounds: FloorBounds, aspect: number): Pose {
  const phi = 0.8; // polar angle from straight up
  const theta = -0.32; // slight three-quarter view
  const target = new THREE.Vector3((bounds.x[0] + bounds.x[1]) / 2, 0, (bounds.z[0] + bounds.z[1]) / 2);
  const cam = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 400);
  const corners: THREE.Vector3[] = [];
  for (const x of bounds.x) for (const z of bounds.z) for (const y of [0, 1.4]) corners.push(new THREE.Vector3(x, y, z));
  const v = new THREE.Vector3();
  const box = (r: number) => {
    placeCamera(cam, { target, r, theta, phi });
    cam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const c of corners) { v.copy(c).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x0, x1, y0, y1 };
  };
  let r = 30;
  for (let pass = 0; pass < 4; pass++) {
    let lo = 4, hi = 60;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      const b = box(mid);
      if (b.x0 > -0.98 && b.x1 < 0.98 && b.y0 > -0.86 && b.y1 < 0.96) hi = mid; else lo = mid;
    }
    r = hi;
    // re-centre: move the target along the view's screen axes so the projected box is centred
    const b = box(r);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).setY(0).normalize();
    const span = Math.tan((FOV * Math.PI) / 360) * r;
    target.addScaledVector(right, cx * span * aspect * 0.9).addScaledVector(fwd, cy * span * 1.2);
  }
  return { target, r, theta, phi };
}

function placeCamera(cam: THREE.Camera, p: Pose) {
  const s = new THREE.Spherical(p.r, p.phi, p.theta);
  const off = new THREE.Vector3().setFromSpherical(s);
  cam.position.copy(p.target).add(off);
  cam.lookAt(p.target);
}

function currentPose(cam: THREE.Camera, target: THREE.Vector3): Pose {
  const off = cam.position.clone().sub(target);
  const s = new THREE.Spherical().setFromVector3(off);
  return { target: target.clone(), r: s.radius, theta: s.theta, phi: s.phi };
}

function CameraRig({ mode, bounds, fitSignal, focusSignal, focusPos, reducedMotion, controlsRef, introRef }: {
  mode: '3d' | '2d'; bounds: FloorBounds; fitSignal: number; focusSignal: number; focusPos: V3 | null; reducedMotion: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>; introRef: MutableRefObject<boolean>;
}) {
  const { camera, size, invalidate } = useThree();
  const anim = useRef<{ from: Pose; to: Pose; t0: number; dur: number } | null>(null);
  const intro = introRef;

  const start = useCallback((to: Pose, dur: number, from?: Pose) => {
    const ctl = controlsRef.current;
    const tgt = ctl ? ctl.target : new THREE.Vector3();
    const f = from ?? currentPose(camera, tgt);
    // shortest way round in azimuth
    let dt = to.theta - f.theta;
    while (dt > Math.PI) dt -= Math.PI * 2;
    while (dt < -Math.PI) dt += Math.PI * 2;
    anim.current = { from: f, to: { ...to, theta: f.theta + dt }, t0: performance.now(), dur: reducedMotion ? 1 : dur };
    invalidate();
  }, [camera, controlsRef, invalidate, reducedMotion]);

  // 3D: intro fly-in on first mount, then Fit view on request
  useEffect(() => {
    if (mode !== '3d') return;
    const to = fitPose(bounds, size.width / Math.max(1, size.height));
    if (intro.current) {
      intro.current = false;
      const from: Pose = { target: to.target.clone().add(new THREE.Vector3(-4, 0, -3)), r: 64, theta: -1.05, phi: 0.18 };
      placeCamera(camera, from);
      if (controlsRef.current) controlsRef.current.target.copy(from.target);
      start(to, 2600, from);
    } else {
      start(to, fitSignal ? 900 : 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fitSignal]);

  // 2D: frame the slab with the orthographic camera
  useEffect(() => {
    if (mode !== '2d') return;
    const cam = camera as THREE.OrthographicCamera;
    if (!cam.isOrthographicCamera) return;
    const W = bounds.x[1] - bounds.x[0] + 1.2;
    const D = bounds.z[1] - bounds.z[0] + 1.2;
    const cx = (bounds.x[0] + bounds.x[1]) / 2;
    const cz = (bounds.z[0] + bounds.z[1]) / 2;
    cam.zoom = Math.min(size.width / W, size.height / D);
    cam.position.set(cx, 60, cz + 0.0001);
    cam.lookAt(cx, 0, cz);
    cam.updateProjectionMatrix();
    if (controlsRef.current) { controlsRef.current.target.set(cx, 0, cz); controlsRef.current.update(); }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, fitSignal, camera, size.width, size.height]);

  // focus on a machine (deep link, list pick in 3D)
  useEffect(() => {
    if (!focusSignal || !focusPos) return;
    const ctl = controlsRef.current;
    if (mode === '2d') {
      if (ctl) { ctl.target.set(focusPos[0], 0, focusPos[2]); camera.position.set(focusPos[0], 60, focusPos[2] + 0.0001); ctl.update(); invalidate(); }
      return;
    }
    const cur = currentPose(camera, ctl ? ctl.target : new THREE.Vector3());
    start({ target: new THREE.Vector3(focusPos[0], 0, focusPos[2]), r: Math.min(cur.r, 13), theta: cur.theta, phi: Math.min(cur.phi, 0.95) }, 900);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  useFrame(() => {
    const a = anim.current;
    if (!a) return;
    const t = Math.min(1, (performance.now() - a.t0) / a.dur);
    const k = ease(t);
    const p: Pose = {
      target: a.from.target.clone().lerp(a.to.target, k),
      r: a.from.r + (a.to.r - a.from.r) * k,
      theta: a.from.theta + (a.to.theta - a.from.theta) * k,
      phi: a.from.phi + (a.to.phi - a.from.phi) * k,
    };
    placeCamera(camera, p);
    const ctl = controlsRef.current;
    if (ctl) { ctl.target.copy(p.target); ctl.update(); }
    if (t >= 1) anim.current = null;
    invalidate();
  });
  return null;
}

// ---------------------------------------------------------------- labels (DOM, projected, no overlaps)

interface LabelRefs { els: Map<string, HTMLDivElement>; tip: HTMLDivElement | null; readout: HTMLDivElement | null }

function LabelProjector({ machines, refs, show, selectedId, hoverId, priority }: {
  machines: FloorMachine[]; refs: MutableRefObject<LabelRefs>; show: boolean; selectedId: string | null; hoverId: string | null; priority: Set<string>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const els = refs.current.els;
    if (!show) { els.forEach((el) => { el.style.visibility = 'hidden'; }); return; }
    const order = [...machines].sort((a, b) => {
      const pa = a.id === selectedId ? 0 : a.id === hoverId ? 1 : priority.has(a.id) ? 2 : 3;
      const pb = b.id === selectedId ? 0 : b.id === hoverId ? 1 : priority.has(b.id) ? 2 : 3;
      return pa - pb || b.z - a.z;
    });
    const placed: [number, number, number, number][] = [];
    const hit = (r: [number, number, number, number]) => r[0] < 0 || r[1] < 0 || r[2] > size.width || r[3] > size.height
      || placed.some((q) => r[0] < q[2] + 2 && r[2] + 2 > q[0] && r[1] < q[3] + 2 && r[3] + 2 > q[1]);
    for (const m of order) {
      const el = els.get(m.id);
      if (!el) continue;
      const fp = MACHINE_FOOTPRINT[m.type] ?? { l: 1, w: 1, h: 1 };
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const rad = (m.rot * Math.PI) / 180;
      const cands: V3[] = [
        [m.x, fp.h + 0.12, m.z],
        [m.x - Math.sin(rad) * (fp.l / 2 + 0.25), 0, m.z + Math.cos(rad) * (fp.l / 2 + 0.25)],
        [m.x + Math.sin(rad) * (fp.l / 2 + 0.25), 0, m.z - Math.cos(rad) * (fp.l / 2 + 0.25)],
      ];
      let done = false;
      for (let i = 0; i < cands.length && !done; i++) {
        v.set(...cands[i]).project(camera);
        if (v.z > 1) continue;
        const sx = ((v.x + 1) / 2) * size.width;
        const sy = ((1 - v.y) / 2) * size.height;
        const r: [number, number, number, number] = i === 0 ? [sx - w / 2, sy - h - 2, sx + w / 2, sy - 2] : [sx - w / 2, sy - h / 2, sx + w / 2, sy + h / 2];
        if (m.id === selectedId || !hit(r)) {
          placed.push(r);
          el.style.transform = `translate3d(${Math.round(r[0])}px, ${Math.round(r[1])}px, 0)`;
          el.style.visibility = 'visible';
          done = true;
        }
      }
      if (!done) el.style.visibility = 'hidden';
    }
  });
  return null;
}

// ---------------------------------------------------------------- drag plane (edit layout)

function DragPlane({ active, onDrag }: { active: boolean; onDrag: (p: THREE.Vector3, e: ThreeEvent<PointerEvent>) => void }) {
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  if (!active) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 6]} visible={false}
      onPointerMove={(e) => { if (e.ray.intersectPlane(plane, p)) onDrag(p, e); }}>
      <planeGeometry args={[200, 200]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- stage

export default function FloorScene(props: FloorSceneProps) {
  const {
    machines, bounds, label, theme, mode, showLabels, showFootprints, selectedId, onSelect, editing, onMove, fitSignal, focusSignal, focusId,
    ariaLabel, fontFamily, scaleLabels, fmtPos, reducedMotion,
  } = props;
  const c = sceneColors(theme);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const introRef = useRef(true);
  const refs = useRef<LabelRefs>({ els: new Map(), tip: null, readout: null });
  const hoverRef = useRef<string | null>(null);
  const [hoverId, setHoverIdState] = useState<string | null>(null);
  const drag = useRef<{ id: string; dx: number; dz: number } | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const priority = useMemo(() => new Set(machines.filter((m) => m.person).map((m) => m.id)), [machines]);
  const focusPos = useMemo<V3 | null>(() => {
    const m = focusId ? byId.get(focusId) : null;
    return m ? [m.x, 0, m.z] : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, focusSignal]);

  const setTip = (m: FloorMachine | null, e?: { clientX: number; clientY: number }) => {
    const tip = refs.current.tip;
    const wrap = wrapRef.current;
    if (!tip || !wrap) return;
    if (!m || !e) { tip.style.visibility = 'hidden'; return; }
    const r = wrap.getBoundingClientRect();
    tip.firstElementChild!.textContent = m.name;
    tip.lastElementChild!.textContent = m.tip;
    const x = Math.min(r.width - tip.offsetWidth - 8, Math.max(8, e.clientX - r.left + 14));
    const y = Math.max(8, e.clientY - r.top - tip.offsetHeight - 10);
    tip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    tip.style.visibility = 'visible';
  };

  const onOver = useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hoverRef.current = id;
    setHoverIdState(id);
    document.body.style.cursor = 'pointer';
    setTip(byId.get(id) ?? null, e.nativeEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId]);
  const onOut = useCallback((id: string) => {
    if (hoverRef.current === id) { hoverRef.current = null; setHoverIdState(null); setTip(null); }
    document.body.style.cursor = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onClick = useCallback((id: string, e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 4) return; // a drag, not a click
    onSelect(id);
  }, [onSelect]);
  const onDown = useCallback((id: string, e: ThreeEvent<PointerEvent>) => {
    if (!editing) return;
    e.stopPropagation();
    const m = byId.get(id);
    if (!m) return;
    const p = new THREE.Vector3();
    e.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
    drag.current = { id, dx: m.x - p.x, dz: m.z - p.z };
    draggingIdRef.current = id;
    setDraggingId(id);
    onSelect(id);
    if (controlsRef.current) controlsRef.current.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, byId, onSelect]);

  useEffect(() => {
    const up = () => {
      if (!drag.current) return;
      drag.current = null;
      draggingIdRef.current = null;
      setDraggingId(null);
      if (controlsRef.current) controlsRef.current.enabled = true;
      if (refs.current.readout) refs.current.readout.style.visibility = 'hidden';
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  const onDrag = useCallback((p: THREE.Vector3, e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d) return;
    const snap = (n: number) => Math.round(n * 20) / 20;
    const x = Math.min(bounds.x[1] - 0.3, Math.max(bounds.x[0] + 0.3, snap(p.x + d.dx)));
    const z = Math.min(bounds.z[1] - 0.3, Math.max(bounds.z[0] + 0.3, snap(p.z + d.dz)));
    onMove(d.id, x, z);
    const ro = refs.current.readout;
    const wrap = wrapRef.current;
    if (ro && wrap) {
      const r = wrap.getBoundingClientRect();
      ro.textContent = fmtPos(x, z);
      ro.style.transform = `translate3d(${Math.round(e.nativeEvent.clientX - r.left + 16)}px, ${Math.round(e.nativeEvent.clientY - r.top + 16)}px, 0)`;
      ro.style.visibility = 'visible';
    }
  }, [bounds, onMove, fmtPos]);

  // keyboard: arrows orbit, +/- zoom (canvas focused)
  const onKey = (e: ReactKeyboardEvent) => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    const cam = ctl.object as THREE.Camera & { zoom?: number; updateProjectionMatrix?: () => void };
    const k = e.key;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(k)) return;
    e.preventDefault();
    if ((cam as THREE.OrthographicCamera).isOrthographicCamera) {
      const oc = cam as THREE.OrthographicCamera;
      if (k === '+' || k === '=') oc.zoom *= 1.15;
      else if (k === '-' || k === '_') oc.zoom /= 1.15;
      else {
        const step = 1.2 / Math.max(0.2, oc.zoom / 30);
        const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
        const dz = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
        ctl.target.x += dx; ctl.target.z += dz; oc.position.x += dx; oc.position.z += dz;
      }
      oc.updateProjectionMatrix();
      ctl.update();
      return;
    }
    const pose = currentPose(cam, ctl.target);
    if (k === 'ArrowLeft') pose.theta -= 0.12;
    if (k === 'ArrowRight') pose.theta += 0.12;
    if (k === 'ArrowUp') pose.phi = Math.max(0.05, pose.phi - 0.08);
    if (k === 'ArrowDown') pose.phi = Math.min(Math.PI / 2.1, pose.phi + 0.08);
    if (k === '+' || k === '=') pose.r = Math.max(3, pose.r / 1.15);
    if (k === '-' || k === '_') pose.r = Math.min(60, pose.r * 1.15);
    placeCamera(cam, pose);
    ctl.update();
  };

  // keep the pan target over the slab
  const clampTarget = useCallback(() => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    const t = ctl.target;
    const cx = Math.min(bounds.x[1], Math.max(bounds.x[0], t.x));
    const cz = Math.min(bounds.z[1], Math.max(bounds.z[0], t.z));
    if (cx !== t.x || cz !== t.z || t.y !== 0) {
      const dx = cx - t.x, dz = cz - t.z, dy = -t.y;
      t.set(cx, 0, cz);
      ctl.object.position.x += dx; ctl.object.position.z += dz; ctl.object.position.y += dy;
    }
  }, [bounds]);

  const extent = Math.max(bounds.x[1] - bounds.x[0], bounds.z[1] - bounds.z[0]) / 2 + 2;
  const center: V3 = [(bounds.x[0] + bounds.x[1]) / 2, 0, (bounds.z[0] + bounds.z[1]) / 2];

  return (
    <div ref={wrapRef} className="lf-stage" tabIndex={0} onKeyDown={onKey} role="application" aria-label={ariaLabel}
      style={{ background: c.bg }}>
      <Canvas key={mode} orthographic={mode === '2d'}
        camera={mode === '2d' ? { position: [center[0], 60, center[2] + 0.0001], zoom: 30, near: 0.1, far: 400 } : { fov: FOV, near: 0.1, far: 400, position: [0, 40, 40] }}
        shadows frameloop="demand" dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => { if (!editing) onSelect(null); }}>
        <color attach="background" args={[c.bg]} />
        <group position={center}>
          <StudioLights theme={theme} extent={extent} />
        </group>
        <FloorShell bounds={bounds} theme={theme} label={label} fontFamily={fontFamily} scaleLabels={scaleLabels} />
        {machines.map((m) => (
          <MachineNode key={m.id} m={m} selected={m.id === selectedId} hovered={m.id === hoverId} showFootprints={showFootprints}
            editing={editing} dragging={m.id === draggingId} theme={theme} onDown={onDown} onClick={onClick} onOver={onOver} onOut={onOut} />
        ))}
        {/* selection beacon */}
        {selectedId && byId.get(selectedId) && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[byId.get(selectedId)!.x, 0.006, byId.get(selectedId)!.z]}
            material={flatMaterial(theme === 'dark' ? '#ffffff' : '#241f30', 0.22, true)} renderOrder={1}>
            <circleGeometry args={[1.6, 40]} />
          </mesh>
        )}
        <DragPlane active={editing && !!draggingId} onDrag={onDrag} />
        <CameraRig mode={mode} bounds={bounds} fitSignal={fitSignal} focusSignal={focusSignal} focusPos={focusPos}
          reducedMotion={reducedMotion} controlsRef={controlsRef} introRef={introRef} />
        <OrbitControls ref={controlsRef as unknown as MutableRefObject<OrbitControlsImpl>} makeDefault enableDamping dampingFactor={0.09}
          enableRotate={mode === '3d'} screenSpacePanning={mode === '2d'}
          minDistance={3} maxDistance={60} minZoom={8} maxZoom={260} maxPolarAngle={Math.PI / 2.15}
          minPolarAngle={0} zoomSpeed={0.8} rotateSpeed={0.7}
          mouseButtons={mode === '2d' ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN } : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
          touches={mode === '2d' ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN } : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
          onChange={clampTarget} />
        <LabelProjector machines={machines} refs={refs} show={showLabels} selectedId={selectedId} hoverId={hoverId} priority={priority} />
      </Canvas>
      <div className="lf-labels" aria-hidden>
        {machines.map((m) => (
          <div key={m.id} ref={(el) => { if (el) refs.current.els.set(m.id, el); else refs.current.els.delete(m.id); }}
            className={`lf-label${m.id === selectedId ? ' is-selected' : ''}${m.person ? ' is-busy' : ''}`}>{m.name}</div>
        ))}
      </div>
      <div className="lf-tip" ref={(el) => { refs.current.tip = el; }} aria-hidden><strong /><span /></div>
      <div className="lf-readout num" ref={(el) => { refs.current.readout = el; }} aria-hidden />
    </div>
  );
}
