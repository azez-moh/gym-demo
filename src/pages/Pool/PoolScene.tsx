import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { StudioLights, sceneColors } from '../../three/Scene';
import { createWaterMaterial, waterColors, RoomEnvironment } from './water';
import { labelTexture, tileTexture } from './textures';

/*
  The pool hall: a 25 m x 12.5 m pool with 5 lanes, lane ropes, starting blocks, deck, loungers and a glazed
  back wall. Swimmers are stylised figures that swim anticlockwise loops in their lane (keep right, turn at the
  walls) at their own pace. The water is one shaded plane (see water.ts). Frames are drawn continuously only
  while the animation plays and the view is visible; otherwise only on camera moves.
*/

export interface PoolSwimmer { id: number; lane: number; speed: number; phase: number; cap: string; side: 1 | -1 }

export interface PoolSceneProps {
  swimmers: PoolSwimmer[];
  lanesInUse: boolean[];
  theme: 'light' | 'dark';
  accent: string;
  view: 'perspective' | 'top';
  playing: boolean;
  /** Draw continuously (playing, tab visible, on screen, motion allowed). */
  active: boolean;
  resetSignal: number;
  reducedMotion: boolean;
  fontFamily: string;
  ariaLabel: string;
}

const POOL_L = 25;
const POOL_W = 12.5;
const LANES = 5;
const LANE_W = POOL_W / LANES;
const DEPTH = 1.6;
const WATER_Y = -0.14;
const COPING = 0.45;
type V3 = [number, number, number];

function palette(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { deck: '#24202f', grout: '#2d2939', coping: '#3a3548', tile: '#8fc9d6', tileGrout: '#76b3c2', line: '#0d3a4e', wall: '#1b1727', glass: '#2a3d55', frame: '#3a3450', lounger: '#c9c4d6', loungerFrame: '#5a5468', block: '#d7d3e0', planter: '#3a3548', leaf: '#4b6b5f', skin: '#efeaf6' }
    : { deck: '#efedf2', grout: '#e1dee7', coping: '#ffffff', tile: '#cdeef3', tileGrout: '#b5e1e9', line: '#1a4d63', wall: '#f6f5f8', glass: '#d9edf3', frame: '#b9b4c4', lounger: '#ffffff', loungerFrame: '#8b8698', block: '#ffffff', planter: '#dcd8e6', leaf: '#7d9b8e', skin: '#3b3546' };
}

// ---------------------------------------------------------------- static hall

const Hall = memo(function Hall({ theme, accent, fontFamily }: { theme: 'light' | 'dark'; accent: string; fontFamily: string }) {
  const p = palette(theme);
  const deckTex = useMemo(() => {
    const t = tileTexture(p.deck, p.grout, 2).clone();
    t.needsUpdate = true;
    t.repeat.set(36 / 1.2, 26 / 1.2);
    return t;
  }, [p.deck, p.grout]);
  const floorTex = useMemo(() => {
    const t = tileTexture(p.tile, p.tileGrout, 4).clone();
    t.needsUpdate = true;
    t.repeat.set(POOL_L / 1, POOL_W / 1);
    return t;
  }, [p.tile, p.tileGrout]);
  const wallTex = useMemo(() => {
    const t = tileTexture(p.tile, p.tileGrout, 4).clone();
    t.needsUpdate = true;
    t.repeat.set(POOL_L, DEPTH);
    return t;
  }, [p.tile, p.tileGrout]);
  const wallTexS = useMemo(() => {
    const t = wallTex.clone();
    t.needsUpdate = true;
    t.repeat.set(POOL_W, DEPTH);
    return t;
  }, [wallTex]);
  useEffect(() => () => { deckTex.dispose(); floorTex.dispose(); wallTex.dispose(); wallTexS.dispose(); }, [deckTex, floorTex, wallTex, wallTexS]);

  const numbers = useMemo(() => Array.from({ length: LANES }, (_, i) => labelTexture(String(i + 1), theme === 'dark' ? '#e9e6f2' : '#241f30', fontFamily, 120)), [theme, fontFamily]);
  const hx = POOL_L / 2;
  const hz = POOL_W / 2;
  const laneZ = (i: number) => -hz + LANE_W * (i + 0.5);

  return (
    <group>
      {/* deck with a cut-out for the pool: four slabs around it */}
      {([
        [[0, -0.05, -(hz + COPING + 4.5)], [36, 0.1, 9]],
        [[0, -0.05, hz + COPING + 2.5], [36, 0.1, 5]],
        [[-(hx + COPING + 2.75), -0.05, 0], [5.5, 0.1, POOL_W + COPING * 2]],
        [[hx + COPING + 2.75, -0.05, 0], [5.5, 0.1, POOL_W + COPING * 2]],
      ] as [V3, V3][]).map(([pos, s], i) => (
        <mesh key={i} position={pos} receiveShadow>
          <boxGeometry args={s} />
          <meshStandardMaterial color={p.deck} map={deckTex} roughness={0.85} />
        </mesh>
      ))}
      {/* coping stones */}
      {([
        [[0, 0.02, -(hz + COPING / 2)], [POOL_L + COPING * 2, 0.08, COPING]],
        [[0, 0.02, hz + COPING / 2], [POOL_L + COPING * 2, 0.08, COPING]],
        [[-(hx + COPING / 2), 0.02, 0], [COPING, 0.08, POOL_W]],
        [[hx + COPING / 2, 0.02, 0], [COPING, 0.08, POOL_W]],
      ] as [V3, V3][]).map(([pos, s], i) => (
        <mesh key={i} position={pos} castShadow receiveShadow>
          <boxGeometry args={s} />
          <meshStandardMaterial color={p.coping} roughness={0.55} />
        </mesh>
      ))}
      {/* basin: floor and walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -DEPTH, 0]} receiveShadow>
        <planeGeometry args={[POOL_L, POOL_W]} />
        <meshStandardMaterial color="#ffffff" map={floorTex} roughness={0.6} />
      </mesh>
      <mesh position={[0, -DEPTH / 2, -hz]} receiveShadow><planeGeometry args={[POOL_L, DEPTH]} /><meshStandardMaterial color="#ffffff" map={wallTex} roughness={0.6} /></mesh>
      <mesh position={[0, -DEPTH / 2, hz]} rotation={[0, Math.PI, 0]} receiveShadow><planeGeometry args={[POOL_L, DEPTH]} /><meshStandardMaterial color="#ffffff" map={wallTex} roughness={0.6} /></mesh>
      <mesh position={[-hx, -DEPTH / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow><planeGeometry args={[POOL_W, DEPTH]} /><meshStandardMaterial color="#ffffff" map={wallTexS} roughness={0.6} /></mesh>
      <mesh position={[hx, -DEPTH / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow><planeGeometry args={[POOL_W, DEPTH]} /><meshStandardMaterial color="#ffffff" map={wallTexS} roughness={0.6} /></mesh>
      {/* lane lines on the pool floor with T ends, and wall targets */}
      {Array.from({ length: LANES }, (_, i) => (
        <group key={i} position={[0, -DEPTH + 0.004, laneZ(i)]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[POOL_L - 4, 0.25]} /><meshBasicMaterial color={p.line} transparent opacity={0.75} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-(POOL_L - 4) / 2, 0, 0]}><planeGeometry args={[0.25, 1.0]} /><meshBasicMaterial color={p.line} transparent opacity={0.75} /></mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(POOL_L - 4) / 2, 0, 0]}><planeGeometry args={[0.25, 1.0]} /><meshBasicMaterial color={p.line} transparent opacity={0.75} /></mesh>
        </group>
      ))}
      {/* starting blocks and lane numbers at the shallow end */}
      {Array.from({ length: LANES }, (_, i) => (
        <group key={i} position={[-hx - COPING - 0.45, 0, laneZ(i)]}>
          <mesh position={[0, 0.33, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.06, 0.55]} />
            <meshStandardMaterial color={p.block} roughness={0.5} />
          </mesh>
          <mesh position={[0.05, 0.15, 0]} castShadow>
            <boxGeometry args={[0.36, 0.3, 0.38]} />
            <meshStandardMaterial color={p.loungerFrame} roughness={0.55} metalness={0.2} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[-0.75, 0.004, 0]}>
            <planeGeometry args={[0.55 * numbers[i].aspect, 0.55]} />
            <meshBasicMaterial map={numbers[i].tex} transparent depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* ladders: two stainless rails at each corner of the deep end */}
      {[-1, 1].map((s) => (
        <group key={s} position={[hx - 1.2, 0, s * (hz + 0.02)]} rotation={[0, s > 0 ? Math.PI : 0, 0]}>
          {[-0.28, 0.28].map((dx) => <Rail key={dx} x={dx} />)}
        </group>
      ))}
      {/* back wall with glazing, left wall plain */}
      <mesh position={[0, 2.2, -(hz + COPING + 9)]} receiveShadow>
        <boxGeometry args={[36, 4.4, 0.2]} />
        <meshStandardMaterial color={p.wall} roughness={0.9} />
      </mesh>
      {[-12, -4, 4, 12].map((x) => (
        <group key={x} position={[x, 2.25, -(hz + COPING + 8.88)]}>
          <mesh><planeGeometry args={[7, 3.2]} /><meshStandardMaterial color={p.glass} roughness={0.15} metalness={0.1} emissive={p.glass} emissiveIntensity={theme === 'dark' ? 0.25 : 0.35} /></mesh>
          <mesh position={[0, 0, 0.01]}><planeGeometry args={[0.06, 3.2]} /><meshBasicMaterial color={p.frame} /></mesh>
        </group>
      ))}
      <mesh position={[-18.1, 2.2, -2]} receiveShadow>
        <boxGeometry args={[0.2, 4.4, 22]} />
        <meshStandardMaterial color={p.wall} roughness={0.9} />
      </mesh>
      {/* loungers along the back deck */}
      {[-9, -6, -3, 3, 6, 9].map((x, i) => <Lounger key={x} x={x} z={-(hz + COPING + 5.6)} p={p} towel={i === 1 || i === 4 ? accent : undefined} />)}
      {/* planters */}
      {[-15.5, 0, 15.5].map((x) => (
        <group key={x} position={[x, 0, -(hz + COPING + 7.6)]}>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow><cylinderGeometry args={[0.45, 0.38, 0.7, 28]} /><meshStandardMaterial color={p.planter} roughness={0.8} /></mesh>
          <mesh position={[0, 1.15, 0]} castShadow><sphereGeometry args={[0.7, 20, 14]} /><meshStandardMaterial color={p.leaf} roughness={0.95} /></mesh>
        </group>
      ))}
    </group>
  );
});

function Rail({ x }: { x: number }) {
  const geo = useMemo(() => {
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.9, 0.18), new THREE.Vector3(0, 0.1, 0.12), new THREE.Vector3(0, 0.75, -0.05),
      new THREE.Vector3(0, 0.8, -0.35), new THREE.Vector3(0, 0.55, -0.6), new THREE.Vector3(0, 0.0, -0.62),
    ]);
    return new THREE.TubeGeometry(c, 40, 0.025, 10, false);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo} position={[x, 0, 0]} castShadow>
      <meshStandardMaterial color="#d8dbe0" metalness={0.95} roughness={0.18} />
    </mesh>
  );
}

function Lounger({ x, z, p, towel }: { x: number; z: number; p: ReturnType<typeof palette>; towel?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.32, 0.25]} castShadow receiveShadow><boxGeometry args={[0.7, 0.08, 1.4]} /><meshStandardMaterial color={p.lounger} roughness={0.7} /></mesh>
      <mesh position={[0, 0.55, -0.62]} rotation={[-0.75, 0, 0]} castShadow receiveShadow><boxGeometry args={[0.7, 0.08, 0.7]} /><meshStandardMaterial color={p.lounger} roughness={0.7} /></mesh>
      {[-0.3, 0.3].map((dx) => [-0.35, 0.8].map((dz) => (
        <mesh key={`${dx}${dz}`} position={[dx, 0.14, dz]} castShadow><boxGeometry args={[0.05, 0.28, 0.05]} /><meshStandardMaterial color={p.loungerFrame} roughness={0.5} metalness={0.3} /></mesh>
      )))}
      {towel && (
        <mesh position={[0, 0.375, 0.45]} castShadow><boxGeometry args={[0.6, 0.02, 0.7]} /><meshStandardMaterial color={towel} roughness={0.95} /></mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------- lane ropes (one instanced mesh)

const LaneRopes = memo(function LaneRopes({ theme, accent }: { theme: 'light' | 'dark'; accent: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const step = 0.24;
  const per = Math.floor(POOL_L / step);
  const count = per * (LANES - 1);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const white = new THREE.Color(theme === 'dark' ? '#d7d3e0' : '#ffffff');
    const cyan = new THREE.Color('#21c3d6');
    const end = new THREE.Color(theme === 'dark' ? '#6a6577' : '#241f30');
    let k = 0;
    for (let r = 1; r < LANES; r++) {
      const z = -POOL_W / 2 + r * LANE_W;
      for (let i = 0; i < per; i++) {
        const x = -POOL_L / 2 + step / 2 + i * step;
        o.position.set(x, WATER_Y + 0.02, z);
        o.rotation.set(0, 0, Math.PI / 2);
        o.updateMatrix();
        m.setMatrixAt(k, o.matrix);
        const fromWall = POOL_L / 2 - Math.abs(x);
        m.setColorAt(k, fromWall < 2 ? end : i % 6 < 2 ? cyan : white);
        k++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [theme, accent, per]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
      <cylinderGeometry args={[0.065, 0.065, step * 0.82, 12]} />
      <meshStandardMaterial roughness={0.45} />
    </instancedMesh>
  );
});

// ---------------------------------------------------------------- swimmers

const STRAIGHT = POOL_L - 2.2;

/** Position and heading on the lane loop (keep to the right, semicircle turns at the walls). */
function loopAt(s: number, laneZ: number, r: number, out: { x: number; z: number; yaw: number; turn: number }) {
  const P = 2 * STRAIGHT + 2 * Math.PI * r;
  let u = ((s % P) + P) % P;
  const x0 = -STRAIGHT / 2;
  if (u < STRAIGHT) { out.x = x0 + u; out.z = laneZ + r; out.yaw = 0; out.turn = 0; return; }
  u -= STRAIGHT;
  const arc = Math.PI * r;
  if (u < arc) {
    const a = u / r;
    out.x = STRAIGHT / 2 + Math.sin(a) * r; out.z = laneZ + Math.cos(a) * r; out.yaw = a; out.turn = Math.sin(a);
    return;
  }
  u -= arc;
  if (u < STRAIGHT) { out.x = STRAIGHT / 2 - u; out.z = laneZ - r; out.yaw = Math.PI; out.turn = 0; return; }
  u -= STRAIGHT;
  const a = u / r;
  out.x = x0 - Math.sin(a) * r; out.z = laneZ - Math.cos(a) * r; out.yaw = Math.PI + a; out.turn = Math.sin(a);
}

function useFigure() {
  return useMemo(() => {
    const body = new THREE.CapsuleGeometry(0.17, 0.95, 6, 12);
    body.rotateZ(Math.PI / 2);
    const head = new THREE.SphereGeometry(0.135, 18, 14);
    const cap = new THREE.SphereGeometry(0.142, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const arm = new THREE.CapsuleGeometry(0.05, 0.55, 4, 8);
    arm.translate(0, -0.3, 0);
    const leg = new THREE.CapsuleGeometry(0.06, 0.6, 4, 8);
    leg.rotateZ(Math.PI / 2);
    return { body, head, cap, arm, leg };
  }, []);
}

const Swimmers = memo(function Swimmers({ swimmers, theme, clock }: { swimmers: PoolSwimmer[]; theme: 'light' | 'dark'; clock: MutableRefObject<number> }) {
  const geo = useFigure();
  useEffect(() => () => { Object.values(geo).forEach((g) => g.dispose()); }, [geo]);
  const p = palette(theme);
  const skin = useMemo(() => new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.75 }), [p.skin]);
  useEffect(() => () => skin.dispose(), [skin]);
  return (
    <group>
      {swimmers.map((s) => <Swimmer key={s.id} s={s} geo={geo} skin={skin} clock={clock} />)}
    </group>
  );
});

function Swimmer({ s, geo, skin, clock }: { s: PoolSwimmer; geo: ReturnType<typeof useFigure>; skin: THREE.Material; clock: MutableRefObject<number> }) {
  const root = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group>(null);
  const scale = useRef(0.001);
  const tmp = useMemo(() => ({ x: 0, z: 0, yaw: 0, turn: 0 }), []);
  const laneZ = -POOL_W / 2 + LANE_W * (s.lane + 0.5);
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: s.cap, roughness: 0.35 }), [s.cap]);
  useEffect(() => () => capMat.dispose(), [capMat]);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    const t = clock.current;
    // keep right; the second swimmer of a lane starts half a loop later
    loopAt(t * s.speed + s.phase, laneZ, LANE_W * 0.2, tmp);
    g.position.set(tmp.x, WATER_Y - 0.06 + Math.sin(t * 2.4 * s.speed + s.phase) * 0.02, tmp.z);
    g.rotation.set(Math.sin(t * 1.2 * s.speed + s.phase) * 0.12, tmp.yaw, 0, 'YXZ');
    const stroke = t * 3.1 * s.speed + s.phase;
    if (armL.current) armL.current.rotation.z = stroke % (Math.PI * 2);
    if (armR.current) armR.current.rotation.z = (stroke + Math.PI) % (Math.PI * 2);
    if (legs.current) legs.current.rotation.x = Math.sin(stroke * 2.4) * 0.12;
    // grow in when a swimmer joins
    scale.current += (1 - scale.current) * Math.min(1, dt * 4);
    g.scale.setScalar(scale.current * 1.25);
  });

  return (
    <group ref={root}>
      <mesh geometry={geo.body} material={skin} castShadow />
      <group position={[0.75, 0.04, 0]}>
        <mesh geometry={geo.head} material={skin} castShadow />
        <mesh geometry={geo.cap} material={capMat} rotation={[0, 0, -Math.PI / 2.6]} />
      </group>
      <group ref={armL} position={[0.42, 0.04, 0.2]}><mesh geometry={geo.arm} material={skin} castShadow /></group>
      <group ref={armR} position={[0.42, 0.04, -0.2]}><mesh geometry={geo.arm} material={skin} castShadow /></group>
      <group ref={legs} position={[-0.75, -0.02, 0]}>
        <mesh geometry={geo.leg} material={skin} position={[-0.25, 0, 0.08]} />
        <mesh geometry={geo.leg} material={skin} position={[-0.25, 0, -0.08]} />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- water

function Water({ theme, accent, lanesInUse, clock }: { theme: 'light' | 'dark'; accent: string; lanesInUse: boolean[]; clock: MutableRefObject<number> }) {
  const mat = useMemo(() => createWaterMaterial(waterColors(theme, accent), { lanes: { z0: -POOL_W / 2, w: LANE_W } }), [theme, accent]);
  useEffect(() => () => mat.dispose(), [mat]);
  const glow = useRef<number[]>([0, 0, 0, 0, 0]);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    mat.uniforms.uTime.value = clock.current;
    const arr = mat.uniforms.uLaneGlow.value as number[];
    let moving = false;
    for (let i = 0; i < LANES; i++) {
      const target = lanesInUse[i] ? 1 : 0;
      const v = glow.current[i] + (target - glow.current[i]) * Math.min(1, dt * 3);
      if (Math.abs(v - target) > 0.005) moving = true;
      glow.current[i] = Math.abs(v - target) <= 0.005 ? target : v;
      arr[i] = glow.current[i];
    }
    if (moving) invalidate();
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, WATER_Y, 0]} material={mat} renderOrder={2}>
      <planeGeometry args={[POOL_L, POOL_W]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- clock, environment, camera

function SimClock({ clock, playing }: { clock: MutableRefObject<number>; playing: boolean }) {
  useFrame((_, dt) => { if (playing) clock.current += Math.min(dt, 0.1); });
  return null;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

interface Pose { pos: THREE.Vector3; target: THREE.Vector3 }

function poseFor(view: 'perspective' | 'top', aspect: number): Pose {
  const k = Math.pow(Math.max(1, 1.6 / Math.max(0.4, aspect)), 0.75);
  if (view === 'top') return { pos: new THREE.Vector3(0, 30 * Math.max(1, k * 0.82), 0.01), target: new THREE.Vector3(0, 0, 0) };
  return { pos: new THREE.Vector3(14 * k, 12.5 * k, 19 * k), target: new THREE.Vector3(-0.5, -0.6, -0.8) };
}

function CameraRig({ view, resetSignal, controls, reduced }: { view: 'perspective' | 'top'; resetSignal: number; controls: MutableRefObject<OrbitControlsImpl | null>; reduced: boolean }) {
  const { camera, size, invalidate } = useThree();
  const anim = useRef<{ from: Pose; to: Pose; t: number } | null>(null);
  const first = useRef(true);
  useEffect(() => {
    const to = poseFor(view, size.width / Math.max(1, size.height));
    const c = controls.current;
    if (first.current || reduced || !c) {
      first.current = false;
      camera.position.copy(to.pos);
      c?.target.copy(to.target);
      c?.update();
      invalidate();
      return;
    }
    anim.current = { from: { pos: camera.position.clone(), target: c.target.clone() }, to, t: 0 };
    invalidate();
    // size is read once per change of view or reset, not on every resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, resetSignal]);
  useFrame((_, dt) => {
    const a = anim.current;
    const c = controls.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + dt / 0.9);
    // critically damped feel: ease out with no overshoot
    const e = 1 - Math.pow(1 - a.t, 4);
    camera.position.lerpVectors(a.from.pos, a.to.pos, e);
    c.target.lerpVectors(a.from.target, a.to.target, e);
    c.update();
    if (a.t >= 1) anim.current = null;
    invalidate();
  });
  return null;
}

export default function PoolScene({ swimmers, lanesInUse, theme, accent, view, playing, active, resetSignal, reducedMotion, fontFamily, ariaLabel }: PoolSceneProps) {
  const c = sceneColors(theme);
  const clock = useRef(7.5);
  const controls = useRef<OrbitControlsImpl | null>(null);
  return (
    <div className="pl-canvas" role="img" aria-label={ariaLabel}>
      <Canvas shadows frameloop={active ? 'always' : 'demand'} dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 300, position: [14, 12.5, 19] }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}>
        <color attach="background" args={[c.bg]} />
        <fog attach="fog" args={[c.bg, 48, 95]} />
        <StudioLights theme={theme} extent={17} />
        <Environment />
        <SimClock clock={clock} playing={playing} />
        <Hall theme={theme} accent={accent} fontFamily={fontFamily} />
        <LaneRopes theme={theme} accent={accent} />
        <Swimmers swimmers={swimmers} theme={theme} clock={clock} />
        <Water theme={theme} accent={accent} lanesInUse={lanesInUse} clock={clock} />
        <CameraRig view={view} resetSignal={resetSignal} controls={controls} reduced={reducedMotion} />
        <OrbitControls ref={controls as unknown as MutableRefObject<OrbitControlsImpl>} makeDefault enableDamping dampingFactor={0.09}
          minDistance={6} maxDistance={70} maxPolarAngle={Math.PI / 2.15} zoomSpeed={0.8} rotateSpeed={0.7} />
      </Canvas>
    </div>
  );
}
