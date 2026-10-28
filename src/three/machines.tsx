import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { MachineType } from '../data/types';
import { MACHINE_FOOTPRINT } from '../data/library';
import {
  FIGURE_SPOT, ROLES, dashedRectGeometry, figureGeometry, flatMaterial, lineMaterial, machineGeometry, matteMaterial, rectGeometry,
  type MachineColors,
} from './machineGeometry';

/*
  Procedural machine kit: the 14 the reference build library shapes as recognisable, matte models with subtle
  bevels at real footprints (metres, from src/data/library.ts). Never vendor assets, never
  downloaded models. Geometry is merged per material and cached per type (see machineGeometry.ts), so
  40 machines cost about 200 draw calls with shared buffers.

  Local frame of every model: origin on the floor at the footprint centre, y up, length along z,
  width along x, the user's front (console / head end) towards -z. Callers place with
  position [x, 0, z] and rotation [0, rot * PI / 180, 0] from the floor data.
  `accent` colours the parts that show state (belt, pedals, seat): pass chartTokens.state.* .
*/

export interface MachineModelProps {
  type: MachineType;
  /** State colour for the moving parts (in use / idle / cooling). */
  accent?: string;
  /** Frame colour. */
  frame?: string;
  /** Soft parts colour (seats, pads). */
  soft?: string;
  /** Bright metal (rails, bars). Defaults from the frame. */
  metal?: string;
  /** Console screen colour. */
  screen?: string;
  /** Draw the footprint rectangle on the floor. */
  showFootprint?: boolean;
  /** Draw the service clearance outline (footprint + clearance on every side). */
  showClearance?: boolean;
  /** Clearance on every side in metres. Default 0.6. */
  clearance?: number;
  selected?: boolean;
  /** Line colour of footprint and clearance outlines. */
  outline?: string;
  /** Draws a simple person using the machine (as the reference build does for machines in use). */
  person?: boolean;
  personColor?: string;
  /** Soft glow on the floor under the machine (state highlight), with its colour. */
  glow?: string;
  /** Tint of the footprint plate (filled rectangle); omit for none. */
  plate?: string;
  plateOpacity?: number;
  /** Emissive strength on accent parts (in-use glow). */
  accentGlow?: number;
  /** Animate the person, glow and plate between states (springs). Only inside a live Canvas. */
  animate?: boolean;
  castShadow?: boolean;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

/** Default matte palette per theme (GYM Demo: near-black frames on light, graphite on dark). */
export function machinePalette(theme: 'light' | 'dark'): Omit<MachineColors, 'accent'> {
  return theme === 'dark'
    ? { frame: '#7b8582', soft: '#3f4846', metal: '#c3c9c7', screen: '#0e0b18' }
    : { frame: '#3b4240', soft: '#1f2523', metal: '#9aa19f', screen: '#0e0b18' };
}

function MachineModelImpl({
  type, accent = '#7c3aed', frame = '#3a3450', soft = '#2a2536', metal, screen = '#0e0b18', showFootprint, showClearance, clearance = 0.6,
  selected, outline = '#8f9a97', person, personColor = '#e6e9e8', glow, plate, plateOpacity = 0.14, accentGlow = 0, castShadow = true, animate = false,
  onClick, onPointerOver, onPointerOut, onPointerDown,
}: MachineModelProps) {
  const fp = MACHINE_FOOTPRINT[type] ?? { l: 1, w: 1, h: 1 };
  const { l, w } = fp;
  const geo = machineGeometry(type);
  const colors: MachineColors = { frame, soft, accent, metal: metal ?? frame, screen };
  const spot = FIGURE_SPOT[type];
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onPointerDown={onPointerDown}>
      {ROLES.map((role) => {
        const g = geo[role];
        if (!g) return null;
        const mat = role === 'accent'
          ? matteMaterial(colors.accent, { emissive: accentGlow ? colors.accent : undefined, emissiveIntensity: accentGlow, roughness: 0.6 })
          : role === 'metal'
            ? matteMaterial(colors.metal, { roughness: 0.45, metalness: 0.45 })
            : role === 'screen'
              ? matteMaterial(colors.screen, { roughness: 0.3, metalness: 0.1, emissive: accentGlow ? colors.accent : undefined, emissiveIntensity: accentGlow * 0.25 })
              : matteMaterial(colors[role]);
        return <mesh key={role} geometry={g} material={mat} castShadow={castShadow} receiveShadow />;
      })}
      {animate ? (
        <>
          {spot && <SpringPerson show={!!person} geometry={figureGeometry(spot.pose)} color={personColor} position={spot.p} castShadow={castShadow} />}
          <FadePlane color={glow} opacity={0.55} glow size={[w + 1.4, l + 1.4]} y={0.004} />
          <FadePlane color={plate} opacity={plateOpacity} size={[w, l]} y={0.003} />
        </>
      ) : (
        <>
          {person && spot && (
            <mesh geometry={figureGeometry(spot.pose)} material={matteMaterial(personColor, { roughness: 0.9 })} position={spot.p} castShadow={castShadow} />
          )}
          {glow && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} material={flatMaterial(glow, 0.55, true)} renderOrder={1}>
              <planeGeometry args={[w + 1.4, l + 1.4]} />
            </mesh>
          )}
          {plate && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]} material={flatMaterial(plate, plateOpacity)} renderOrder={1}>
              <planeGeometry args={[w, l]} />
            </mesh>
          )}
        </>
      )}
      {(showFootprint || selected) && (
        <lineLoop geometry={rectGeometry(l, w)} material={lineMaterial(selected ? accent : outline)} />
      )}
      {selected && <lineLoop geometry={rectGeometry(l + 0.08, w + 0.08)} material={lineMaterial(accent)} />}
      {showClearance && (
        <lineSegments geometry={dashedRectGeometry(l + 2 * clearance, w + 2 * clearance)} material={lineMaterial(outline, 0.75)} />
      )}
    </group>
  );
}

// ---------- state transitions (Live Floor) ----------
// A damped spring (stiffness 210, damping ratio 0.68): a member steps on with a small settle, steps off quickly.
const K = 210;
const C = 2 * 0.68 * Math.sqrt(K);

/** The figure on a machine grows in from the floor on a spring and sinks away when the session ends. */
function SpringPerson({ show, geometry, color, position, castShadow }: {
  show: boolean; geometry: THREE.BufferGeometry; color: string; position: [number, number, number]; castShadow: boolean;
}) {
  const ref = useRef<THREE.Group>(null);
  const st = useRef({ x: show ? 1 : 0, v: 0 });
  const { invalidate } = useThree();
  const material = useMemo(() => matteMaterial(color, { roughness: 0.9 }), [color]);
  useEffect(() => { invalidate(); }, [show, invalidate]);
  useFrame((_, delta) => {
    const g = ref.current;
    if (!g) return;
    const s = st.current;
    const target = show ? 1 : 0;
    const dt = Math.min(delta, 1 / 30);
    const a = -K * (s.x - target) - C * s.v;
    s.v += a * dt;
    s.x += s.v * dt;
    const settled = Math.abs(s.x - target) < 0.002 && Math.abs(s.v) < 0.01;
    if (settled) { s.x = target; s.v = 0; }
    const k = Math.max(0, s.x);
    g.visible = k > 0.01;
    g.scale.set(0.85 + 0.15 * k, k, 0.85 + 0.15 * k);
    if (!settled) invalidate();
  });
  return (
    <group ref={ref} position={position} visible={show}>
      <mesh geometry={geometry} material={material} castShadow={castShadow} />
    </group>
  );
}

/** Floor tint that cross-fades its colour and opacity when the state or the reading changes. */
function FadePlane({ color, opacity, glow = false, size, y }: {
  color?: string; opacity: number; glow?: boolean; size: [number, number]; y: number;
}) {
  const { invalidate } = useThree();
  const material = useMemo(() => {
    const m = flatMaterial(color ?? '#ffffff', 1, glow).clone();
    m.opacity = color ? opacity : 0;
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glow]);
  useEffect(() => () => material.dispose(), [material]);
  const target = useRef(new THREE.Color(color ?? '#ffffff'));
  useEffect(() => { if (color) target.current.set(color); invalidate(); }, [color, opacity, invalidate]);
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 1 / 30) * 9);
    const goal = color ? opacity : 0;
    material.color.lerp(target.current, k);
    material.opacity += (goal - material.opacity) * k;
    const c = material.color, t = target.current;
    const done = Math.abs(material.opacity - goal) < 0.003 && Math.abs(c.r - t.r) + Math.abs(c.g - t.g) + Math.abs(c.b - t.b) < 0.004;
    if (done) { material.opacity = goal; c.copy(t); } else invalidate();
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} material={material} renderOrder={1}>
      <planeGeometry args={size} />
    </mesh>
  );
}

/** One machine at its real footprint. */
export const MachineModel = memo(MachineModelImpl);

/** Footprint in metres for a type (length along the user, width, height). */
export function footprintOf(type: MachineType) {
  return MACHINE_FOOTPRINT[type];
}

export const MACHINE_TYPES = Object.keys(MACHINE_FOOTPRINT) as MachineType[];

export { buildMachineObject } from './machineGeometry';
