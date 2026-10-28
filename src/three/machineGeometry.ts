import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MachineType } from '../data/types';
import { MACHINE_FOOTPRINT } from '../data/library';

/*
  Procedural geometry for the 14 the reference build library shapes. Built from rounded boxes, cylinders and tubes,
  then merged per material role, so one machine is drawn with at most 6 meshes whatever its detail.
  Geometry is cached per type (built once, shared by every instance on every canvas).

  Local frame: origin on the floor at the footprint centre, y up, length along z, width along x,
  the user's front (console / head end) towards -z. Nothing here comes from a vendor model.
*/

export type Role = 'frame' | 'soft' | 'accent' | 'metal' | 'screen';
export const ROLES: Role[] = ['frame', 'soft', 'accent', 'metal', 'screen'];

export type Pose = 'stand' | 'stride' | 'sit' | 'recline' | 'row' | 'lie' | 'arms';

type V3 = [number, number, number];

class Builder {
  parts: Record<Role, THREE.BufferGeometry[]> = { frame: [], soft: [], accent: [], metal: [], screen: [] };
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];

  private get cur() { return this.stack[this.stack.length - 1]; }

  group(p: V3, r: V3, fn: () => void) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));
    this.stack.push(this.cur.clone().multiply(m));
    fn();
    this.stack.pop();
  }

  add(g: THREE.BufferGeometry, role: Role, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1));
    const geo = (g.index ? g.toNonIndexed() : g).applyMatrix4(this.cur.clone().multiply(m));
    if (g.index) g.dispose();
    this.parts[role].push(geo);
  }

  /** Rounded box (subtle bevel). */
  box(s: V3, p: V3, role: Role, r: V3 = [0, 0, 0], radius?: number) {
    const rad = radius ?? Math.min(0.025, Math.min(...s) * 0.3);
    const g = rad > 0.002 ? new RoundedBoxGeometry(s[0], s[1], s[2], 2, rad) : new THREE.BoxGeometry(...s);
    this.add(g, role, p, r);
  }

  /** Cylinder along an axis. */
  cyl(rad: number, len: number, p: V3, role: Role, axis: 'x' | 'y' | 'z' = 'x', seg = 20, rad2?: number) {
    const g = new THREE.CylinderGeometry(rad, rad2 ?? rad, len, seg);
    const r: V3 = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    this.add(g, role, p, r);
  }

  torus(R: number, t: number, p: V3, role: Role, axis: 'x' | 'y' | 'z' = 'x', arc = Math.PI * 2) {
    const g = new THREE.TorusGeometry(R, t, 8, 28, arc);
    const r: V3 = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    this.add(g, role, p, r);
  }

  sphere(rad: number, p: V3, role: Role) {
    this.add(new THREE.SphereGeometry(rad, 16, 12), role, p);
  }

  /** Smooth tube through points (handrails, frames). */
  tube(pts: V3[], rad: number, role: Role, seg = 24) {
    const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(...q)));
    this.add(new THREE.TubeGeometry(curve, seg, rad, 8, false), role);
    // rounded caps
    this.sphere(rad, pts[0], role);
    this.sphere(rad, pts[pts.length - 1], role);
  }

  /** Same tube mirrored on both sides (x and -x). */
  tubes2(pts: V3[], rad: number, role: Role, seg = 24) {
    this.tube(pts, rad, role, seg);
    this.tube(pts.map(([x, y, z]) => [-x, y, z] as V3), rad, role, seg);
  }

  build(): Partial<Record<Role, THREE.BufferGeometry>> {
    const out: Partial<Record<Role, THREE.BufferGeometry>> = {};
    for (const role of ROLES) {
      const list = this.parts[role];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (merged) {
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        out[role] = merged;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- shared pieces

function consoleHead(b: Builder, w: number, y: number, z: number, tilt = -0.42, depth = 0.09, hgt = 0.3) {
  b.group([0, y, z], [tilt, 0, 0], () => {
    b.box([w, hgt, depth], [0, 0, 0], 'frame', [0, 0, 0], 0.03);
    b.box([w * 0.72, hgt * 0.66, 0.012], [0, 0.01, depth / 2 + 0.002], 'screen', [0, 0, 0], 0.004);
  });
}

// ---------------------------------------------------------------- models

function treadmill(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  const beltW = w * 0.6;
  // deck and motor hood
  b.box([w * 0.84, 0.16, l - 0.42], [0, 0.11, 0.17], 'frame', [0, 0, 0], 0.04);
  b.box([w * 0.92, 0.3, 0.46], [0, 0.17, front + 0.25], 'frame', [0, 0, 0], 0.07);
  b.box([beltW, 0.02, l - 0.62], [0, 0.2, 0.2], 'accent', [0, 0, 0], 0.008);
  for (const s of [1, -1]) b.box([0.13, 0.035, l - 0.55], [s * (beltW / 2 + 0.07), 0.205, 0.18], 'metal', [0, 0, 0], 0.012);
  b.cyl(0.055, w * 0.8, [0, 0.11, l / 2 - 0.06], 'frame', 'x');
  // uprights, console, handles
  b.tubes2([[w * 0.42, 0.28, front + 0.34], [w * 0.43, 0.8, front + 0.24], [w * 0.4, h - 0.22, front + 0.16]], 0.035, 'frame');
  consoleHead(b, w * 0.88, h - 0.14, front + 0.16, -0.45, 0.1, 0.32);
  b.tubes2([[w * 0.44, h - 0.42, front + 0.2], [w * 0.47, h - 0.4, front + 0.48], [w * 0.45, h - 0.46, front + 0.72]], 0.02, 'metal');
  b.cyl(0.018, w * 0.66, [0, h - 0.36, front + 0.3], 'metal', 'x');
}

function slatTreadmill(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  const curveY = (z: number) => 0.24 + 0.09 * Math.pow((z / (l / 2 - 0.15)), 2);
  // curved side frames
  const side: V3[] = [];
  for (let i = 0; i <= 8; i++) { const z = -l / 2 + 0.18 + (i / 8) * (l - 0.3); side.push([w / 2 - 0.06, curveY(z) - 0.02, z]); }
  b.tubes2(side, 0.05, 'frame', 32);
  b.box([w - 0.06, 0.08, l - 0.1], [0, 0.04, 0], 'frame', [0, 0, 0], 0.03);
  for (const s of [1, -1]) b.box([0.08, 0.2, l - 0.4], [s * (w / 2 - 0.06), 0.15, 0.05], 'frame', [0, 0, 0], 0.03);
  // slats on the curve
  const n = 22;
  for (let i = 0; i < n; i++) {
    const z = -l / 2 + 0.3 + (i + 0.5) * ((l - 0.5) / n);
    const slope = Math.atan(0.18 * z / Math.pow(l / 2 - 0.15, 2));
    b.box([w * 0.66, 0.025, (l - 0.5) / n - 0.012], [0, curveY(z), z], 'accent', [slope, 0, 0], 0.006);
  }
  // front frame and console
  b.tubes2([[w * 0.42, 0.35, front + 0.2], [w * 0.42, h - 0.35, front + 0.12], [w * 0.38, h - 0.2, front + 0.1]], 0.035, 'frame');
  b.cyl(0.022, w * 0.82, [0, h - 0.36, front + 0.14], 'metal', 'x');
  consoleHead(b, w * 0.5, h - 0.12, front + 0.12, -0.5, 0.08, 0.24);
  b.tubes2([[w * 0.43, h - 0.36, front + 0.14], [w * 0.47, h - 0.48, front + 0.6], [w * 0.46, h - 0.6, front + 0.9]], 0.02, 'metal');
}

function inclineTreadmill(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  const ang = 0.16; // deck rises towards the front
  b.box([w * 0.9, 0.1, l - 0.1], [0, 0.05, 0], 'frame', [0, 0, 0], 0.03);
  b.box([w * 0.9, 0.5, 0.5], [0, 0.3, front + 0.27], 'frame', [0, 0, 0], 0.08);
  b.group([0, 0.32, 0.12], [ang, 0, 0], () => {
    b.box([w * 0.84, 0.16, l - 0.5], [0, 0, 0], 'frame', [0, 0, 0], 0.04);
    b.box([w * 0.6, 0.02, l - 0.7], [0, 0.09, 0], 'accent', [0, 0, 0], 0.008);
    for (const s of [1, -1]) b.box([0.12, 0.035, l - 0.62], [s * (w * 0.3 + 0.07), 0.095, 0], 'metal', [0, 0, 0], 0.012);
  });
  // lift column under the front
  b.box([0.3, 0.3, 0.22], [0, 0.2, front + 0.62], 'frame', [0, 0, 0], 0.04);
  b.tubes2([[w * 0.42, 0.5, front + 0.32], [w * 0.43, 1.0, front + 0.22], [w * 0.4, h - 0.22, front + 0.16]], 0.04, 'frame');
  consoleHead(b, w * 0.92, h - 0.14, front + 0.16, -0.45, 0.1, 0.34);
  b.tubes2([[w * 0.44, h - 0.42, front + 0.2], [w * 0.47, h - 0.36, front + 0.56], [w * 0.45, h - 0.4, front + 0.86]], 0.022, 'metal');
}

function stairClimber(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([w, 0.1, l], [0, 0.05, 0], 'frame', [0, 0, 0], 0.03);
  // sculpted side housings rising to the front
  for (const s of [1, -1]) {
    b.box([0.12, 0.5, l - 0.15], [s * (w / 2 - 0.07), 0.33, 0.02], 'frame', [0, 0, 0], 0.05);
    b.box([0.12, 0.55, 0.45], [s * (w / 2 - 0.07), 0.82, front + 0.32], 'frame', [0, 0, 0], 0.05);
  }
  b.box([w - 0.14, 1.0, 0.24], [0, 0.58, front + 0.13], 'frame', [0, 0, 0], 0.06);
  // revolving steps
  for (let i = 0; i < 5; i++) {
    const y = 0.16 + i * 0.19;
    const z = l / 2 - 0.2 - i * 0.18;
    b.box([w - 0.3, 0.05, 0.25], [0, y, z], 'accent', [0, 0, 0], 0.012);
    b.box([w - 0.32, 0.17, 0.02], [0, y - 0.1, z - 0.12], 'soft', [0, 0, 0], 0.006);
  }
  // console column and wraparound handrails
  b.box([0.2, 0.55, 0.16], [0, h - 0.5, front + 0.12], 'frame', [0, 0, 0], 0.04);
  consoleHead(b, w * 0.62, h - 0.16, front + 0.14, -0.4, 0.09, 0.32);
  b.tubes2([[w / 2 - 0.05, 0.9, l / 2 - 0.12], [w / 2 + 0.01, 1.08, 0.1], [w / 2 - 0.04, 1.2, front + 0.35], [w * 0.22, 1.28, front + 0.25]], 0.026, 'metal', 36);
}

function indoorBike(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  // feet
  b.cyl(0.035, w, [0, 0.04, front + 0.12], 'frame', 'x');
  b.cyl(0.035, w, [0, 0.04, l / 2 - 0.12], 'frame', 'x');
  // main beam and flywheel
  b.tube([[0, 0.06, l / 2 - 0.12], [0, 0.22, 0.15], [0, 0.42, -0.12], [0, 0.75, front + 0.32]], 0.04, 'frame');
  b.tube([[0, 0.06, front + 0.12], [0, 0.3, front + 0.2]], 0.035, 'frame');
  b.cyl(0.24, 0.05, [0, 0.33, front + 0.27], 'metal', 'x', 32);
  b.cyl(0.26, 0.09, [0.075, 0.33, front + 0.27], 'frame', 'x', 32, 0.26);
  // seat post, saddle
  b.tube([[0, 0.3, 0.12], [0, 0.66, 0.24], [0, 0.86, 0.3]], 0.03, 'frame');
  b.box([0.16, 0.06, 0.26], [0, 0.9, 0.32], 'soft', [0, 0, 0], 0.03);
  // crank and pedals
  b.cyl(0.08, 0.06, [0, 0.33, -0.02], 'frame', 'x');
  b.box([0.03, 0.03, 0.17], [0.07, 0.33, -0.02], 'metal', [0.6, 0, 0]);
  b.box([0.03, 0.03, 0.17], [-0.07, 0.33, -0.02], 'metal', [0.6 + Math.PI, 0, 0]);
  b.box([0.1, 0.025, 0.06], [0.12, 0.4, -0.09], 'accent');
  b.box([0.1, 0.025, 0.06], [-0.12, 0.26, 0.05], 'accent');
  // handlebar post and bars
  b.tube([[0, 0.75, front + 0.32], [0, h - 0.18, front + 0.28]], 0.03, 'frame');
  b.tube([[0.2, h - 0.15, front + 0.12], [0.2, h - 0.12, front + 0.3], [0, h - 0.14, front + 0.28], [-0.2, h - 0.12, front + 0.3], [-0.2, h - 0.15, front + 0.12]], 0.018, 'metal');
  consoleHead(b, 0.16, h - 0.08, front + 0.24, -0.6, 0.03, 0.1);
}

function recumbentBike(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.cyl(0.035, w, [0, 0.04, front + 0.1], 'frame', 'x');
  b.cyl(0.035, w * 0.9, [0, 0.04, l / 2 - 0.12], 'frame', 'x');
  b.box([0.14, 0.1, l - 0.3], [0, 0.12, 0.05], 'frame', [0, 0, 0], 0.03);
  // front drive housing
  b.box([0.3, 0.55, 0.45], [0, 0.38, front + 0.3], 'frame', [0.15, 0, 0], 0.1);
  b.cyl(0.07, 0.36, [0, 0.42, front + 0.56], 'frame', 'x');
  b.box([0.1, 0.03, 0.18], [0.21, 0.5, front + 0.5], 'accent', [0.4, 0, 0]);
  b.box([0.1, 0.03, 0.18], [-0.21, 0.36, front + 0.62], 'accent', [0.4, 0, 0]);
  // seat and backrest
  b.box([0.22, 0.35, 0.22], [0, 0.32, 0.35], 'frame', [0, 0, 0], 0.03);
  b.box([0.5, 0.09, 0.42], [0, 0.53, 0.35], 'soft', [0, 0, 0], 0.04);
  b.box([0.48, 0.58, 0.08], [0, 0.88, 0.62], 'soft', [-0.28, 0, 0], 0.04);
  b.tubes2([[0.29, 0.5, 0.2], [0.33, 0.58, 0.34], [0.33, 0.58, 0.52]], 0.018, 'metal');
  // console column
  b.tube([[0, 0.6, front + 0.25], [0, h - 0.2, front + 0.32]], 0.035, 'frame');
  consoleHead(b, 0.42, h - 0.12, front + 0.32, -0.55, 0.06, 0.22);
  b.tube([[0.22, h - 0.32, front + 0.42], [0.18, h - 0.26, front + 0.32], [-0.18, h - 0.26, front + 0.32], [-0.22, h - 0.32, front + 0.42]], 0.018, 'metal');
}

function elliptical(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([0.18, 0.08, l - 0.1], [0, 0.06, 0.02], 'frame', [0, 0, 0], 0.03);
  b.cyl(0.035, w, [0, 0.05, l / 2 - 0.1], 'frame', 'x');
  // drive housing at the front
  b.box([0.32, 0.6, 0.52], [0, 0.36, front + 0.3], 'frame', [0, 0, 0], 0.12);
  b.cyl(0.25, 0.36, [0, 0.42, front + 0.32], 'frame', 'x', 32);
  // pedal links and pedals
  for (const [s, dz, dy] of [[1, 0.05, 0.02], [-1, 0.28, -0.03]] as [number, number, number][]) {
    b.tube([[s * 0.13, 0.42, front + 0.4], [s * 0.15, 0.28 + dy, 0.0 + dz], [s * 0.15, 0.2 + dy, 0.35 + dz]], 0.025, 'frame');
    b.box([0.13, 0.035, 0.36], [s * 0.16, 0.24 + dy, 0.16 + dz], 'accent', [0, 0, 0], 0.012);
  }
  // moving arms
  b.tube([[0.2, 0.32, 0.1], [0.24, 0.9, -0.12], [0.26, 1.42, -0.2]], 0.022, 'accent');
  b.tube([[-0.2, 0.3, 0.02], [-0.24, 0.9, -0.2], [-0.26, 1.42, -0.32]], 0.022, 'accent');
  // console column
  b.tube([[0, 0.6, front + 0.36], [0, h - 0.22, front + 0.42]], 0.04, 'frame');
  consoleHead(b, 0.42, h - 0.12, front + 0.42, -0.5, 0.07, 0.26);
  b.tube([[0.15, h - 0.42, front + 0.5], [0.12, h - 0.38, front + 0.44], [-0.12, h - 0.38, front + 0.44], [-0.15, h - 0.42, front + 0.5]], 0.018, 'metal');
}

function adaptiveCrossTrainer(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([w * 0.9, 0.08, l - 0.1], [0, 0.04, 0], 'frame', [0, 0, 0], 0.03);
  // large rear housing (adaptive stride mechanism)
  b.box([w * 0.78, 0.7, 0.55], [0, 0.42, l / 2 - 0.32], 'frame', [0, 0, 0], 0.16);
  b.box([w * 0.5, 0.06, 0.5], [0, 0.78, l / 2 - 0.32], 'soft', [0, 0, 0], 0.03);
  // pedals on swing links
  for (const [s, dz] of [[1, 0], [-1, 0.18]] as [number, number][]) {
    b.tube([[s * 0.2, 0.5, l / 2 - 0.4], [s * 0.2, 0.3, 0.05 + dz], [s * 0.2, 0.25, -0.1 + dz]], 0.025, 'frame');
    b.box([0.15, 0.035, 0.38], [s * 0.2, 0.25, -0.02 + dz], 'accent', [0, 0, 0], 0.012);
  }
  // front frame with moving arms and console
  b.box([0.22, 1.0, 0.18], [0, 0.55, front + 0.14], 'frame', [0, 0, 0], 0.05);
  b.tube([[0.18, 0.5, front + 0.24], [0.27, 1.05, front + 0.34], [0.3, 1.5, front + 0.3]], 0.022, 'accent');
  b.tube([[-0.18, 0.5, front + 0.24], [-0.27, 1.05, front + 0.42], [-0.3, 1.5, front + 0.4]], 0.022, 'accent');
  b.tube([[0, 1.0, front + 0.12], [0, h - 0.2, front + 0.18]], 0.04, 'frame');
  consoleHead(b, 0.5, h - 0.12, front + 0.18, -0.45, 0.07, 0.28);
}

function rower(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  // rail from the front frame to the rear foot
  b.box([0.1, 0.05, l - 0.5], [0, 0.28, 0.2], 'metal', [-0.03, 0, 0], 0.015);
  b.box([w * 0.9, 0.05, 0.08], [0, 0.04, l / 2 - 0.06], 'frame', [0, 0, 0], 0.02);
  b.tube([[0, 0.05, l / 2 - 0.06], [0, 0.22, l / 2 - 0.12]], 0.025, 'frame');
  b.box([w, 0.05, 0.08], [0, 0.04, front + 0.1], 'frame', [0, 0, 0], 0.02);
  // flywheel housing
  b.cyl(0.27, 0.26, [0, 0.38, front + 0.32], 'frame', 'x', 36);
  b.cyl(0.2, 0.27, [0, 0.38, front + 0.32], 'soft', 'x', 36);
  b.box([0.2, 0.32, 0.4], [0, 0.22, front + 0.42], 'frame', [0, 0, 0], 0.05);
  // footplates
  b.box([0.13, 0.025, 0.28], [0.1, 0.3, front + 0.72], 'soft', [-0.9, 0.12, 0], 0.01);
  b.box([0.13, 0.025, 0.28], [-0.1, 0.3, front + 0.72], 'soft', [-0.9, -0.12, 0], 0.01);
  // sliding seat
  b.box([0.3, 0.07, 0.3], [0, 0.35, 0.25], 'accent', [0, 0, 0], 0.03);
  // handle and monitor arm
  b.cyl(0.018, 0.5, [0, 0.55, front + 0.56], 'accent', 'x');
  b.tube([[0, 0.55, front + 0.4], [0, 0.78, front + 0.55], [0, h - 0.12, front + 0.74]], 0.022, 'frame');
  consoleHead(b, 0.22, h - 0.08, front + 0.76, -0.5, 0.05, 0.16);
}

function upperBodyErgometer(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([w * 0.8, 0.06, l - 0.1], [0, 0.03, 0], 'frame', [0, 0, 0], 0.02);
  // column with crank head
  b.box([0.22, 1.05, 0.22], [0, 0.56, front + 0.22], 'frame', [0, 0, 0], 0.05);
  b.cyl(0.13, 0.28, [0, 1.08, front + 0.36], 'frame', 'z', 28);
  b.box([0.34, 0.03, 0.03], [0, 1.08, front + 0.5], 'metal');
  b.tube([[0.17, 1.08, front + 0.5], [0.17, 1.22, front + 0.58]], 0.02, 'accent');
  b.tube([[-0.17, 1.08, front + 0.5], [-0.17, 0.94, front + 0.58]], 0.02, 'accent');
  b.cyl(0.024, 0.1, [0.17, 1.22, front + 0.63], 'accent', 'z');
  b.cyl(0.024, 0.1, [-0.17, 0.94, front + 0.63], 'accent', 'z');
  consoleHead(b, 0.3, h - 0.08, front + 0.24, -0.4, 0.06, 0.2);
  // swivel seat
  b.cyl(0.04, 0.45, [0, 0.25, l / 2 - 0.3], 'frame', 'y');
  b.box([0.42, 0.08, 0.38], [0, 0.5, l / 2 - 0.3], 'soft', [0, 0, 0], 0.04);
  b.box([0.4, 0.35, 0.07], [0, 0.72, l / 2 - 0.1], 'soft', [-0.15, 0, 0], 0.03);
}

function rackUprights(b: Builder, w: number, h: number, z: number, barY: number) {
  for (const s of [1, -1]) {
    b.box([0.07, h, 0.07], [s * (w / 2 - 0.28), h / 2, z], 'frame', [0, 0, 0], 0.012);
    b.box([0.07, 0.07, 0.42], [s * (w / 2 - 0.28), 0.035, z + 0.1], 'frame', [0, 0, 0], 0.012);
    b.box([0.06, 0.1, 0.07], [s * (w / 2 - 0.28), barY - 0.05, z + 0.06], 'metal', [0, 0, 0], 0.01);
  }
  // barbell with plates
  b.cyl(0.014, w - 0.04, [0, barY, z + 0.08], 'metal', 'x');
  for (const s of [1, -1]) {
    b.cyl(0.22, 0.045, [s * (w / 2 - 0.12), barY, z + 0.08], 'frame', 'x', 32);
    b.cyl(0.17, 0.035, [s * (w / 2 - 0.17), barY, z + 0.08], 'frame', 'x', 32);
    b.cyl(0.03, 0.05, [s * (w / 2 - 0.21), barY, z + 0.08], 'accent', 'x');
  }
}

function flatBench(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([0.1, 0.32, l * 0.72], [0, 0.2, 0.18], 'frame', [0, 0, 0], 0.02);
  b.box([0.55, 0.06, 0.08], [0, 0.03, l / 2 - 0.1], 'frame', [0, 0, 0], 0.02);
  b.box([0.3, 0.09, 1.22], [0, 0.42, 0.12], 'soft', [0, 0, 0], 0.04);
  rackUprights(b, w, h, front + 0.16, h - 0.22);
}

function inclineBench(b: Builder, l: number, w: number, h: number) {
  const front = -l / 2;
  b.box([0.1, 0.25, l * 0.68], [0, 0.17, 0.2], 'frame', [0, 0, 0], 0.02);
  b.box([0.55, 0.06, 0.08], [0, 0.03, l / 2 - 0.1], 'frame', [0, 0, 0], 0.02);
  b.box([0.3, 0.09, 0.36], [0, 0.45, 0.5], 'soft', [0, 0, 0], 0.04);
  b.box([0.3, 0.09, 0.85], [0, 0.72, 0.0], 'soft', [0.62, 0, 0], 0.04);
  b.box([0.07, 0.6, 0.07], [0, 0.4, -0.1], 'frame', [0.62, 0, 0], 0.012);
  b.box([0.3, 0.2, 0.06], [0, 0.18, 0.78], 'soft', [0, 0, 0], 0.02);
  rackUprights(b, w, h, front + 0.2, h - 0.25);
}

function preacherCurl(b: Builder, l: number, w: number, standing: boolean) {
  const front = -l / 2;
  b.box([w * 0.7, 0.06, l - 0.1], [0, 0.03, 0], 'frame', [0, 0, 0], 0.02);
  const padY = standing ? 1.12 : 0.92;
  // arm pad column
  b.box([0.09, padY - 0.15, 0.09], [0, (padY - 0.15) / 2 + 0.05, front + 0.38], 'frame', [0, 0, 0], 0.015);
  b.box([0.55, 0.08, 0.36], [0, padY, front + 0.34], 'soft', [0.8, 0, 0], 0.035);
  // curl bar with plates
  const barY = padY - 0.12;
  b.cyl(0.014, w - 0.06, [0, barY, front + 0.1], 'metal', 'x');
  for (const s of [1, -1]) {
    b.cyl(0.16, 0.04, [s * (w / 2 - 0.1), barY, front + 0.1], 'frame', 'x', 28);
    b.cyl(0.026, 0.05, [s * (w / 2 - 0.14), barY, front + 0.1], 'accent', 'x');
    b.box([0.05, 0.1, 0.05], [s * 0.33, barY - 0.08, front + 0.14], 'metal', [0, 0, 0], 0.01);
  }
  if (standing) {
    b.box([0.6, 0.1, 0.42], [0, 0.11, l / 2 - 0.3], 'soft', [0, 0, 0], 0.03);
    b.box([0.6, 0.03, 0.42], [0, 0.175, l / 2 - 0.3], 'accent', [0, 0, 0], 0.01);
  } else {
    b.box([0.08, 0.5, 0.08], [0, 0.29, l / 2 - 0.35], 'frame', [0, 0, 0], 0.015);
    b.box([0.4, 0.09, 0.34], [0, 0.58, l / 2 - 0.35], 'soft', [0, 0, 0], 0.04);
    b.box([0.4, 0.03, 0.34], [0, 0.635, l / 2 - 0.35], 'accent', [0, 0, 0], 0.01);
  }
}

// ---------------------------------------------------------------- figure (person on a machine in use)

function figure(b: Builder, pose: Pose) {
  const r = 'soft' as Role; // single role; coloured by the caller
  const limb = (pts: V3[], rad: number) => b.tube(pts, rad, r, 10);
  switch (pose) {
    case 'stand':
    case 'stride': {
      const s = pose === 'stride' ? 0.18 : 0.04;
      limb([[0.1, 0.02, -s], [0.1, 0.45, 0], [0.1, 0.9, 0]], 0.065);
      limb([[-0.1, 0.02, s], [-0.1, 0.45, 0.02], [-0.1, 0.9, 0]], 0.065);
      b.add(new THREE.CapsuleGeometry(0.17, 0.4, 4, 12), r, [0, 1.2, 0]);
      b.sphere(0.12, [0, 1.62, -0.02], r);
      limb([[0.22, 1.38, 0], [0.26, 1.15, -0.18], [0.22, 1.12, -0.38]], 0.045);
      limb([[-0.22, 1.38, 0], [-0.26, 1.15, -0.18], [-0.22, 1.12, -0.38]], 0.045);
      break;
    }
    case 'sit': {
      b.add(new THREE.CapsuleGeometry(0.16, 0.36, 4, 12), r, [0, 1.18, -0.08], [-0.45, 0, 0]);
      b.sphere(0.115, [0, 1.52, -0.3], r);
      limb([[0.1, 0.95, 0], [0.12, 0.72, -0.25], [0.12, 0.4, -0.2]], 0.06);
      limb([[-0.1, 0.95, 0], [-0.12, 0.62, -0.15], [-0.12, 0.3, -0.12]], 0.06);
      limb([[0.2, 1.32, -0.2], [0.22, 1.12, -0.42], [0.2, 1.05, -0.55]], 0.043);
      limb([[-0.2, 1.32, -0.2], [-0.22, 1.12, -0.42], [-0.2, 1.05, -0.55]], 0.043);
      break;
    }
    case 'recline': {
      b.add(new THREE.CapsuleGeometry(0.16, 0.36, 4, 12), r, [0, 0.82, 0.48], [-0.28, 0, 0]);
      b.sphere(0.115, [0, 1.18, 0.58], r);
      limb([[0.1, 0.6, 0.3], [0.12, 0.68, -0.05], [0.14, 0.45, -0.35]], 0.06);
      limb([[-0.1, 0.6, 0.3], [-0.12, 0.6, 0.0], [-0.14, 0.42, -0.28]], 0.06);
      limb([[0.22, 0.95, 0.45], [0.3, 0.7, 0.4], [0.32, 0.62, 0.3]], 0.043);
      limb([[-0.22, 0.95, 0.45], [-0.3, 0.7, 0.4], [-0.32, 0.62, 0.3]], 0.043);
      break;
    }
    case 'row': {
      b.add(new THREE.CapsuleGeometry(0.16, 0.34, 4, 12), r, [0, 0.72, 0.28], [0.25, 0, 0]);
      b.sphere(0.115, [0, 1.05, 0.38], r);
      limb([[0.1, 0.42, 0.22], [0.12, 0.62, -0.05], [0.1, 0.35, -0.38]], 0.06);
      limb([[-0.1, 0.42, 0.22], [-0.12, 0.62, -0.05], [-0.1, 0.35, -0.38]], 0.06);
      limb([[0.22, 0.88, 0.25], [0.24, 0.72, 0.05], [0.2, 0.58, -0.08]], 0.043);
      limb([[-0.22, 0.88, 0.25], [-0.24, 0.72, 0.05], [-0.2, 0.58, -0.08]], 0.043);
      break;
    }
    case 'lie': {
      b.add(new THREE.CapsuleGeometry(0.16, 0.5, 4, 12), r, [0, 0.62, -0.05], [Math.PI / 2, 0, 0]);
      b.sphere(0.115, [0, 0.62, -0.5], r);
      limb([[0.1, 0.55, 0.3], [0.13, 0.62, 0.55], [0.18, 0.05, 0.72]], 0.06);
      limb([[-0.1, 0.55, 0.3], [-0.13, 0.62, 0.55], [-0.18, 0.05, 0.72]], 0.06);
      limb([[0.24, 0.66, -0.3], [0.3, 0.85, -0.32], [0.32, 1.02, -0.35]], 0.043);
      limb([[-0.24, 0.66, -0.3], [-0.3, 0.85, -0.32], [-0.32, 1.02, -0.35]], 0.043);
      break;
    }
    case 'arms': {
      limb([[0.1, 0.02, 0.05], [0.1, 0.45, 0], [0.1, 0.9, 0]], 0.065);
      limb([[-0.1, 0.02, 0.05], [-0.1, 0.45, 0], [-0.1, 0.9, 0]], 0.065);
      b.add(new THREE.CapsuleGeometry(0.17, 0.4, 4, 12), r, [0, 1.2, -0.06], [-0.2, 0, 0]);
      b.sphere(0.12, [0, 1.6, -0.16], r);
      limb([[0.22, 1.36, -0.08], [0.24, 1.12, -0.3], [0.22, 1.3, -0.45]], 0.045);
      limb([[-0.22, 1.36, -0.08], [-0.24, 1.12, -0.3], [-0.22, 1.3, -0.45]], 0.045);
      break;
    }
  }
}

/** Where and how the person stands or sits on each machine type (local frame). */
export const FIGURE_SPOT: Record<MachineType, { p: V3; pose: Pose; seatedLow?: boolean }> = {
  'treadmill': { p: [0, 0.22, 0.15], pose: 'stride' },
  'slat-treadmill': { p: [0, 0.26, 0.1], pose: 'stride' },
  'incline-treadmill': { p: [0, 0.4, 0.15], pose: 'stride' },
  'stair-climber': { p: [0, 0.5, 0.15], pose: 'stand' },
  'indoor-bike': { p: [0, -0.02, 0.32], pose: 'sit' },
  'recumbent-bike': { p: [0, 0, 0], pose: 'recline' },
  'elliptical': { p: [0, 0.24, 0.2], pose: 'stand' },
  'adaptive-cross-trainer': { p: [0, 0.26, 0.05], pose: 'stand' },
  'rower': { p: [0, 0, 0], pose: 'row' },
  'upper-body-ergometer': { p: [0, -0.35, 0.3], pose: 'sit' },
  'flat-bench': { p: [0, 0, 0.1], pose: 'lie' },
  'incline-bench': { p: [0, 0.05, 0.25], pose: 'recline' },
  'preacher-curl': { p: [0, -0.32, 0.25], pose: 'sit' },
  'standing-preacher': { p: [0, 0.17, 0.25], pose: 'arms' },
};

// ---------------------------------------------------------------- caches

const machineCache = new Map<MachineType, Partial<Record<Role, THREE.BufferGeometry>>>();
const figureCache = new Map<Pose, THREE.BufferGeometry>();

export function machineGeometry(type: MachineType): Partial<Record<Role, THREE.BufferGeometry>> {
  const hit = machineCache.get(type);
  if (hit) return hit;
  const fp = MACHINE_FOOTPRINT[type];
  const b = new Builder();
  if (!fp) {
    b.box([1, 1, 1], [0, 0.5, 0], 'frame');
  } else {
    const { l, w, h } = fp;
    switch (type) {
      case 'treadmill': treadmill(b, l, w, h); break;
      case 'slat-treadmill': slatTreadmill(b, l, w, h); break;
      case 'incline-treadmill': inclineTreadmill(b, l, w, h); break;
      case 'stair-climber': stairClimber(b, l, w, h); break;
      case 'indoor-bike': indoorBike(b, l, w, h); break;
      case 'recumbent-bike': recumbentBike(b, l, w, h); break;
      case 'elliptical': elliptical(b, l, w, h); break;
      case 'adaptive-cross-trainer': adaptiveCrossTrainer(b, l, w, h); break;
      case 'rower': rower(b, l, w, h); break;
      case 'upper-body-ergometer': upperBodyErgometer(b, l, w, h); break;
      case 'flat-bench': flatBench(b, l, w, h); break;
      case 'incline-bench': inclineBench(b, l, w, h); break;
      case 'preacher-curl': preacherCurl(b, l, w, false); break;
      case 'standing-preacher': preacherCurl(b, l, w, true); break;
      default: b.box([w, h, l], [0, h / 2, 0], 'frame');
    }
  }
  const g = b.build();
  machineCache.set(type, g);
  return g;
}

export function figureGeometry(pose: Pose): THREE.BufferGeometry {
  const hit = figureCache.get(pose);
  if (hit) return hit;
  const b = new Builder();
  figure(b, pose);
  const g = b.build().soft!;
  figureCache.set(pose, g);
  return g;
}

/** Closed rectangle outline on the floor (LineLoop positions). */
const rectCache = new Map<string, THREE.BufferGeometry>();
export function rectGeometry(l: number, w: number, y = 0.006): THREE.BufferGeometry {
  const key = `${l}|${w}|${y}`;
  const hit = rectCache.get(key);
  if (hit) return hit;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, y, -l / 2, w / 2, y, -l / 2, w / 2, y, l / 2, -w / 2, y, l / 2], 3));
  rectCache.set(key, g);
  return g;
}

/** Dashed rectangle as line segments (no line-distance pass needed). */
export function dashedRectGeometry(l: number, w: number, y = 0.006, dash = 0.14, gap = 0.1): THREE.BufferGeometry {
  const key = `d${l}|${w}|${y}|${dash}|${gap}`;
  const hit = rectCache.get(key);
  if (hit) return hit;
  const pts: number[] = [];
  const corners: [number, number][] = [[-w / 2, -l / 2], [w / 2, -l / 2], [w / 2, l / 2], [-w / 2, l / 2], [-w / 2, -l / 2]];
  for (let i = 0; i < 4; i++) {
    const [x0, z0] = corners[i];
    const [x1, z1] = corners[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    for (let t = 0; t < len; t += dash + gap) {
      const t1 = Math.min(len, t + dash);
      pts.push(x0 + ((x1 - x0) * t) / len, y, z0 + ((z1 - z0) * t) / len, x0 + ((x1 - x0) * t1) / len, y, z0 + ((z1 - z0) * t1) / len);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  rectCache.set(key, g);
  return g;
}

/** Soft radial glow texture (shared). */
let glowTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

// ---------------------------------------------------------------- materials

const matCache = new Map<string, THREE.Material>();

export function matteMaterial(color: string, opts?: { emissive?: string; emissiveIntensity?: number; roughness?: number; metalness?: number }): THREE.MeshStandardMaterial {
  const key = `${color}|${opts?.emissive ?? ''}|${opts?.emissiveIntensity ?? 0}|${opts?.roughness ?? ''}|${opts?.metalness ?? ''}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshStandardMaterial;
  const m = new THREE.MeshStandardMaterial({
    color, roughness: opts?.roughness ?? 0.78, metalness: opts?.metalness ?? 0.08,
    emissive: opts?.emissive ?? '#000000', emissiveIntensity: opts?.emissiveIntensity ?? 0,
  });
  matCache.set(key, m);
  return m;
}

export function lineMaterial(color: string, opacity = 1): THREE.LineBasicMaterial {
  const key = `line|${color}|${opacity}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.LineBasicMaterial;
  const m = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
  matCache.set(key, m);
  return m;
}

export function flatMaterial(color: string, opacity: number, glow = false): THREE.MeshBasicMaterial {
  const key = `flat|${color}|${opacity}|${glow}`;
  const hit = matCache.get(key);
  if (hit) return hit as THREE.MeshBasicMaterial;
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false,
    map: glow ? glowTexture() : null,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  matCache.set(key, m);
  return m;
}

export interface MachineColors { frame: string; soft: string; accent: string; metal: string; screen: string }

/**
 * Builds a stand-alone three.js group of one machine (fresh materials, shared geometry), for export
 * (GLTFExporter) or for use outside React.
 */
export function buildMachineObject(type: MachineType, c: MachineColors): THREE.Group {
  const group = new THREE.Group();
  group.name = type;
  const geo = machineGeometry(type);
  for (const role of ROLES) {
    const g = geo[role];
    if (!g) continue;
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      name: role, color: c[role], roughness: role === 'metal' ? 0.45 : 0.78, metalness: role === 'metal' ? 0.5 : 0.08,
    }));
    mesh.name = `${type}-${role}`;
    group.add(mesh);
  }
  return group;
}
