import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StudioLights, sceneColors } from '../../three/Scene';
import { createWaterMaterial, waterColors, RoomEnvironment } from '../Pool/water';
import { tileTexture } from '../Pool/textures';

/*
  One jacuzzi: a round basin sunk into a stone plinth with a stepped inset bench, a stainless handrail,
  seated people (up to six) and jets. Jets drive the water shader's turbulence term and an instanced set of
  bubbles rising from the seat jets and floor. Frames run continuously only while the jets run and the view is
  visible; otherwise the canvas renders on demand (camera moves and the jets winding down).
*/

export interface JacuzziSceneProps {
  people: number;
  jets: boolean;
  theme: 'light' | 'dark';
  accent: string;
  active: boolean;
  resetSignal: number;
  reducedMotion: boolean;
  /** Seed for seat order and skin tones. */
  seed: number;
  ariaLabel: string;
}

const R = 1.25;
const BENCH = 0.42;
const SEAT_Y = -0.5;
const FLOOR_Y = -0.95;
const WATER_Y = -0.1;
const SEATS = 6;

function palette(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { stone: '#4a4656', stoneTop: '#5b5768', deck: '#26222f', grout: '#2f2b3a', basin: '#8fb7c2', basinGrout: '#7aa4b0', skin: '#d9d4e2', towel: '#e9e6f2' }
    : { stone: '#bdbac4', stoneTop: '#d8d6dd', deck: '#eceaf0', grout: '#dedbe4', basin: '#d4eef2', basinGrout: '#bfe2e8', skin: '#3b3546', towel: '#ffffff' };
}

// ---------------------------------------------------------------- basin

const Basin = memo(function Basin({ theme }: { theme: 'light' | 'dark' }) {
  const p = palette(theme);
  const plinth = useMemo(() => {
    const s = 3.6;
    const r = 0.35;
    const shape = new THREE.Shape();
    const h = s / 2;
    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h); shape.quadraticCurveTo(h, -h, h, -h + r);
    shape.lineTo(h, h - r); shape.quadraticCurveTo(h, h, h - r, h);
    shape.lineTo(-h + r, h); shape.quadraticCurveTo(-h, h, -h, h - r);
    shape.lineTo(-h, -h + r); shape.quadraticCurveTo(-h, -h, -h + r, -h);
    const hole = new THREE.Path();
    hole.absarc(0, 0, R, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 3, curveSegments: 64 });
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const lathe = useMemo(() => {
    // inner profile: rim, wall down to the bench, bench top, bench face, floor
    const pts = [
      new THREE.Vector2(R, 0.0), new THREE.Vector2(R, SEAT_Y + 0.02), new THREE.Vector2(R - 0.01, SEAT_Y),
      new THREE.Vector2(R - BENCH + 0.02, SEAT_Y), new THREE.Vector2(R - BENCH, SEAT_Y - 0.02),
      new THREE.Vector2(R - BENCH, FLOOR_Y + 0.04), new THREE.Vector2(R - BENCH - 0.04, FLOOR_Y), new THREE.Vector2(0.001, FLOOR_Y),
    ];
    return new THREE.LatheGeometry(pts, 96);
  }, []);
  const deckTex = useMemo(() => { const t = tileTexture(p.deck, p.grout, 2).clone(); t.needsUpdate = true; t.repeat.set(9, 9); return t; }, [p.deck, p.grout]);
  const basinTex = useMemo(() => { const t = tileTexture(p.basin, p.basinGrout, 4).clone(); t.needsUpdate = true; t.repeat.set(10, 2); return t; }, [p.basin, p.basinGrout]);
  useEffect(() => () => { plinth.dispose(); lathe.dispose(); deckTex.dispose(); basinTex.dispose(); }, [plinth, lathe, deckTex, basinTex]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.552, 0]} receiveShadow>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color={p.deck} map={deckTex} roughness={0.9} />
      </mesh>
      <mesh geometry={plinth} position={[0, -0.55, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={p.stone} roughness={0.78} />
      </mesh>
      {/* a lighter top band on the plinth rim */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, 0]} receiveShadow>
        <ringGeometry args={[R, R + 0.32, 96]} />
        <meshStandardMaterial color={p.stoneTop} roughness={0.55} />
      </mesh>
      <mesh geometry={lathe} receiveShadow>
        <meshStandardMaterial color="#ffffff" map={basinTex} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* folded towels on the rim */}
      <mesh position={[1.45, 0.09, 1.45]} rotation={[0, 0.6, 0]} castShadow><boxGeometry args={[0.42, 0.1, 0.3]} /><meshStandardMaterial color={p.towel} roughness={0.95} /></mesh>
      <mesh position={[1.45, 0.19, 1.45]} rotation={[0, 0.5, 0]} castShadow><boxGeometry args={[0.42, 0.1, 0.3]} /><meshStandardMaterial color={p.towel} roughness={0.95} /></mesh>
    </group>
  );
});

function Handrail() {
  const geo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.15, -0.6, 0), new THREE.Vector3(-0.1, 0.2, 0), new THREE.Vector3(0.05, 0.75, 0),
      new THREE.Vector3(0.35, 0.82, 0), new THREE.Vector3(0.6, 0.6, 0), new THREE.Vector3(0.65, 0.05, 0),
    ], false, 'catmullrom', 0.3);
    return new THREE.TubeGeometry(c, 60, 0.024, 12, false);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  const a = -Math.PI * 0.62;
  return (
    <group position={[Math.cos(a) * (R - 0.08), 0, Math.sin(a) * (R - 0.08)]} rotation={[0, -a + Math.PI, 0]}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color="#e3e6ea" metalness={1} roughness={0.16} />
      </mesh>
      <mesh position={[0.65, 0.03, 0]}><cylinderGeometry args={[0.045, 0.045, 0.02, 20]} /><meshStandardMaterial color="#c9ccd2" metalness={1} roughness={0.25} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- people

/** Seat angles: spread around the bench, leaving the handrail gap free. */
function seatAngle(i: number): number {
  const start = -Math.PI * 0.62 + 0.62;
  return start + (i * (Math.PI * 2 - 1.24)) / (SEATS - 1);
}

function seatOrder(seed: number): number[] {
  const o = [0, 1, 2, 3, 4, 5];
  let s = seed >>> 0;
  for (let i = o.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [o[i], o[j]] = [o[j], o[i]];
  }
  return o;
}

const People = memo(function People({ count, seed, theme, clock }: { count: number; seed: number; theme: 'light' | 'dark'; clock: MutableRefObject<number> }) {
  const p = palette(theme);
  const order = useMemo(() => seatOrder(seed), [seed]);
  const geo = useMemo(() => ({
    torso: new THREE.CapsuleGeometry(0.16, 0.42, 6, 14),
    head: new THREE.SphereGeometry(0.115, 20, 16),
    arm: new THREE.CapsuleGeometry(0.045, 0.36, 4, 10),
  }), []);
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); }, [geo]);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.75 }), [p.skin]);
  useEffect(() => () => mat.dispose(), [mat]);
  return (
    <group>
      {order.map((seat, k) => <Seated key={seat} seat={seat} show={k < count} geo={geo} mat={mat} clock={clock} />)}
    </group>
  );
});

function Seated({ seat, show, geo, mat, clock }: { seat: number; show: boolean; geo: { torso: THREE.BufferGeometry; head: THREE.BufferGeometry; arm: THREE.BufferGeometry }; mat: THREE.Material; clock: MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  const k = useRef(show ? 1 : 0);
  const { invalidate } = useThree();
  const a = seatAngle(seat);
  const rr = R - BENCH / 2 - 0.02;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const target = show ? 1 : 0;
    const v = k.current + (target - k.current) * Math.min(1, dt * 5);
    k.current = Math.abs(v - target) < 0.004 ? target : v;
    if (k.current !== target) invalidate();
    g.visible = k.current > 0.01;
    g.scale.setScalar(0.6 + 0.4 * k.current);
    g.position.y = SEAT_Y - 0.35 * (1 - k.current) + Math.sin(clock.current * 0.9 + seat) * 0.008;
  });
  // face the centre, leaning back against the wall
  return (
    <group ref={ref} position={[Math.cos(a) * rr, SEAT_Y, Math.sin(a) * rr]} rotation={[0, -a - Math.PI / 2, 0]} visible={show}>
      <group rotation={[-0.18, 0, 0]}>
        <mesh geometry={geo.torso} material={mat} position={[0, 0.36, 0]} castShadow />
        <mesh geometry={geo.head} material={mat} position={[0, 0.8, -0.02]} castShadow />
        {/* arms resting on the rim */}
        <mesh geometry={geo.arm} material={mat} position={[0.34, 0.56, -0.1]} rotation={[0, 0, -1.1]} castShadow />
        <mesh geometry={geo.arm} material={mat} position={[-0.34, 0.56, -0.1]} rotation={[0, 0, 1.1]} castShadow />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- water and bubbles

function Water({ theme, accent, jets, clock }: { theme: 'light' | 'dark'; accent: string; jets: boolean; clock: MutableRefObject<number> }) {
  const mat = useMemo(() => createWaterMaterial(waterColors(theme, accent), { center: [0, 0], wave: 0.55 }), [theme, accent]);
  useEffect(() => () => mat.dispose(), [mat]);
  const level = useRef(jets ? 1 : 0);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const target = jets ? 1 : 0;
    const v = level.current + (target - level.current) * Math.min(1, dt * 1.6);
    level.current = Math.abs(v - target) < 0.003 ? target : v;
    if (level.current !== target) invalidate();
    mat.uniforms.uJets.value = level.current * 0.9;
    mat.uniforms.uTime.value = clock.current;
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={mat} renderOrder={2}>
      <circleGeometry args={[R, 96]} />
    </mesh>
  );
}

const BUBBLES = 220;

function Bubbles({ jets, theme, clock }: { jets: boolean; theme: 'light' | 'dark'; clock: MutableRefObject<number> }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => Array.from({ length: BUBBLES }, (_, i) => {
    const r = (n: number) => { const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
    const fromSeat = r(1) < 0.7;
    const a = r(2) * Math.PI * 2;
    const rad = fromSeat ? R - BENCH - 0.02 + r(3) * 0.1 : r(3) * (R - BENCH - 0.1);
    return { a, rad, y0: fromSeat ? SEAT_Y - 0.15 - r(4) * 0.2 : FLOOR_Y + 0.02, speed: 0.35 + r(5) * 0.45, off: r(6), size: 0.012 + r(7) * 0.022, wob: r(8) * 6 };
  }), []);
  const strength = useRef(jets ? 1 : 0);
  const o = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const target = jets ? 1 : 0;
    strength.current += (target - strength.current) * Math.min(1, dt * 2);
    if (Math.abs(strength.current - target) < 0.003) strength.current = target;
    const s = strength.current;
    m.visible = s > 0.01;
    if (!m.visible) return;
    const t = clock.current;
    for (let i = 0; i < BUBBLES; i++) {
      const b = seeds[i];
      const span = WATER_Y - b.y0;
      const u = (t * b.speed / span + b.off) % 1;
      const y = b.y0 + u * span;
      // drift towards the centre as they rise, with a small wobble
      const rad = b.rad * (1 - u * 0.25);
      const ang = b.a + Math.sin(t * 2 + b.wob) * 0.05;
      o.position.set(Math.cos(ang) * rad + Math.sin(t * 3 + b.wob) * 0.015, y, Math.sin(ang) * rad);
      const grow = b.size * (0.6 + u * 0.8) * (i / BUBBLES < s ? 1 : 0);
      o.scale.setScalar(Math.max(0.0001, grow));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BUBBLES]} renderOrder={1} frustumCulled={false}>
      <sphereGeometry args={[1, 10, 8]} />
      <meshStandardMaterial color={theme === 'dark' ? '#e4f6fa' : '#ffffff'} roughness={0.15} metalness={0} transparent opacity={0.75} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------- camera, clock, environment

function SimClock({ clock, run }: { clock: MutableRefObject<number>; run: boolean }) {
  useFrame((_, dt) => { if (run) clock.current += Math.min(dt, 0.1); });
  return null;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.4;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

const HOME = { pos: new THREE.Vector3(3.3, 3.1, 3.9), target: new THREE.Vector3(0, -0.35, 0) };

function CameraRig({ resetSignal, controls, reduced }: { resetSignal: number; controls: MutableRefObject<OrbitControlsImpl | null>; reduced: boolean }) {
  const { camera, size, invalidate } = useThree();
  const anim = useRef<{ from: THREE.Vector3; fromT: THREE.Vector3; to: THREE.Vector3; t: number } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const k = Math.max(1, 1.2 / Math.max(0.5, size.width / Math.max(1, size.height)));
    const to = HOME.pos.clone().multiplyScalar(k);
    const c = controls.current;
    if (first.current || reduced || !c) {
      first.current = false;
      camera.position.copy(to);
      c?.target.copy(HOME.target);
      c?.update();
      invalidate();
      return;
    }
    anim.current = { from: camera.position.clone(), fromT: c.target.clone(), to, t: 0 };
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);
  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + dt / 0.8);
    const e = 1 - Math.pow(1 - a.t, 4);
    camera.position.lerpVectors(a.from, a.to, e);
    c.target.lerpVectors(a.fromT, HOME.target, e);
    c.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });
  return null;
}

export default function JacuzziScene({ people, jets, theme, accent, active, resetSignal, reducedMotion, seed, ariaLabel }: JacuzziSceneProps) {
  const c = sceneColors(theme);
  const clock = useRef(3);
  const controls = useRef<OrbitControlsImpl | null>(null);
  return (
    <div className="jz-canvas" role="img" aria-label={ariaLabel}>
      <Canvas shadows frameloop={active ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ fov: 36, near: 0.05, far: 80, position: HOME.pos.toArray() }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <color attach="background" args={[c.bg]} />
        <fog attach="fog" args={[c.bg, 9, 20]} />
        <StudioLights theme={theme} extent={3.5} />
        <Environment />
        <SimClock clock={clock} run={!reducedMotion} />
        <Basin theme={theme} />
        <Handrail />
        <People count={people} seed={seed} theme={theme} clock={clock} />
        <Bubbles jets={jets && !reducedMotion} theme={theme} clock={clock} />
        <Water theme={theme} accent={accent} jets={jets} clock={clock} />
        <CameraRig resetSignal={resetSignal} controls={controls} reduced={reducedMotion} />
        <OrbitControls ref={controls as unknown as MutableRefObject<OrbitControlsImpl>} makeDefault enableDamping dampingFactor={0.09} enablePan={false}
          minDistance={2.6} maxDistance={10} maxPolarAngle={Math.PI / 2.2} zoomSpeed={0.8} rotateSpeed={0.7} />
      </Canvas>
    </div>
  );
}
