import * as THREE from 'three';
import type { MachineType } from '../data/types';
import { MACHINE_FOOTPRINT } from '../data/library';
import { buildMachineObject, type MachineColors } from './machineGeometry';

/*
  Still images of the procedural models, rendered once with a single offscreen WebGL renderer
  (so a page with 14 cards does not open 14 WebGL contexts). Cached per colour set.
*/

const cache = new Map<string, Record<string, string>>();

export function renderMachineThumbnails(types: MachineType[], colors: MachineColors, bg: string, size = 320): Record<string, string> {
  const key = `${JSON.stringify(colors)}|${bg}|${size}`;
  const hit = cache.get(key);
  if (hit && types.every((t) => hit[t])) return hit;
  const out: Record<string, string> = { ...(hit ?? {}) };
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(size, Math.round(size * 0.75), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(bg, 1);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f8d', 1.1));
    const key1 = new THREE.DirectionalLight('#ffffff', 1.4);
    key1.position.set(3, 5, 4);
    scene.add(key1);
    const fill = new THREE.DirectionalLight('#ffffff', 0.4);
    fill.position.set(-4, 2, -3);
    scene.add(fill);
    const cam = new THREE.PerspectiveCamera(30, 4 / 3, 0.05, 50);
    for (const t of types) {
      if (out[t]) continue;
      const fp = MACHINE_FOOTPRINT[t];
      const obj = buildMachineObject(t, colors);
      scene.add(obj);
      const r = Math.max(fp.l, fp.w, fp.h) * 0.62;
      const dist = r / Math.sin((30 * Math.PI) / 360) * 0.95;
      const dir = new THREE.Vector3(-0.95, 0.62, 0.8).normalize();
      cam.position.copy(dir.multiplyScalar(dist)).add(new THREE.Vector3(0, fp.h * 0.45, 0));
      cam.lookAt(0, fp.h * 0.42, 0);
      renderer.render(scene, cam);
      out[t] = renderer.domElement.toDataURL('image/png');
      scene.remove(obj);
      obj.traverse((o) => { if (o instanceof THREE.Mesh) (o.material as THREE.Material).dispose(); });
    }
  } catch {
    /* WebGL unavailable: callers fall back to a plain tile */
  } finally {
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
  }
  cache.set(key, out);
  return out;
}
