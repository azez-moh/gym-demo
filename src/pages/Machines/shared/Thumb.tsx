import { useEffect, useLayoutEffect, useState } from 'react';
import * as THREE from 'three';
import { createRoot, extend, useThree } from '@react-three/fiber';
import { Dumbbell } from 'lucide-react';
import { MachineModel } from '../../../three/machines';
import { MACHINE_FOOTPRINT, type MachineType } from '../../../data';

/*
  Machine thumbnails. One hidden WebGL canvas renders each procedural model once and keeps the image,
  so a grid of 14 cards never opens 14 WebGL contexts. Falls back to an icon when WebGL is unavailable.
*/

const W = 240;
const H = 168;
extend(THREE as unknown as Record<string, new (...args: unknown[]) => unknown>);

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();
let root: ReturnType<typeof createRoot<HTMLCanvasElement>> | null = null;
let canvas: HTMLCanvasElement | null = null;
let failed = false;

function Framer({ type, onReady }: { type: MachineType; onReady: () => void }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    const fp = MACHINE_FOOTPRINT[type];
    const size = Math.max(fp.l, fp.h * 1.1, fp.w * 1.6);
    const dist = size * 1.85;
    camera.position.set(dist * 0.72, size * 0.78, -dist * 0.62);
    camera.lookAt(0, fp.h * 0.42, 0);
    camera.updateProjectionMatrix();
    onReady();
  }, [type, camera, onReady]);
  return null;
}

function snap(type: MachineType, dark: boolean): Promise<string | null> {
  if (failed) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = W * 2;
        canvas.height = H * 2;
        root = createRoot(canvas);
      }
      root!.configure({
        gl: { preserveDrawingBuffer: true, antialias: true, alpha: true },
        frameloop: 'never', dpr: 2, size: { width: W, height: H, top: 0, left: 0 },
        camera: { fov: 32, position: [3, 2, -3] },
      });
      const frame = dark ? '#8b9593' : '#59615f';
      const soft = dark ? '#3f4a48' : '#c3c7c5';
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.setTimeout(() => {
          try {
            const st = store.getState();
            st.gl.setClearColor(0x000000, 0);
            st.gl.render(st.scene, st.camera);
            resolve(canvas!.toDataURL('image/png'));
          } catch { failed = true; resolve(null); }
        }, 30);
      };
      const store = root!.render(
        <>
          <hemisphereLight args={['#ffffff', dark ? '#2a2536' : '#d9d9d6', dark ? 0.9 : 1.1]} />
          <directionalLight position={[4, 8, -5]} intensity={dark ? 1.6 : 1.8} />
          <MachineModel key={type} type={type} frame={frame} soft={soft} accent="#7c3aed" />
          <Framer type={type} onReady={finish} />
        </>,
      );
      window.setTimeout(() => { if (!done) finish(); }, 400);
    } catch {
      failed = true;
      resolve(null);
    }
  });
}

function thumbnail(type: MachineType, dark: boolean): Promise<string | null> {
  const key = `${type}|${dark ? 'd' : 'l'}`;
  const hit = cache.get(key);
  if (hit) return Promise.resolve(hit);
  const p = pending.get(key);
  if (p) return p;
  const job = queue.then(() => snap(type, dark)).then((url) => {
    if (url) cache.set(key, url);
    pending.delete(key);
    return url;
  });
  queue = job;
  pending.set(key, job);
  return job;
}

function isDark() {
  return document.documentElement.getAttribute('data-theme') !== 'light';
}

/** Static picture of a library shape. `photo` (a data URL) wins when a draft carries one. */
export function MachineThumb({ type, photo, alt, theme }: { type?: string; photo?: string; alt: string; theme: string }) {
  const known = !!type && type in MACHINE_FOOTPRINT;
  const [url, setUrl] = useState<string | null>(() => (known ? cache.get(`${type}|${isDark() ? 'd' : 'l'}`) ?? null : null));
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (!known || photo) return;
    let alive = true;
    thumbnail(type as MachineType, theme !== 'light').then((u) => { if (!alive) return; if (u) setUrl(u); else setGaveUp(true); });
    return () => { alive = false; };
  }, [type, known, photo, theme]);
  if (photo) return <img className="mr-thumb" src={photo} alt={alt} />;
  if (url) return <img className="mr-thumb" src={url} alt={alt} />;
  return <span className="mr-thumb mr-thumb--icon" role="img" aria-label={alt}>{(gaveUp || !known) && <Dumbbell aria-hidden />}</span>;
}
