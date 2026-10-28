import * as THREE from 'three';

/*
  Text drawn on a canvas and used as a texture (machine names on the floor, the big floor label, the
  scale bar). The browser shapes Arabic correctly, and no font file is fetched by three.js.
*/

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

export function textTexture(text: string, opts: { color: string; font: string; px?: number; weight?: number | string; pad?: number }): { tex: THREE.CanvasTexture; aspect: number } {
  const px = opts.px ?? 64;
  const key = `${text}|${opts.color}|${opts.font}|${px}|${opts.weight ?? 400}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const font = `${opts.weight ?? 400} ${px}px ${opts.font}`;
  ctx.font = font;
  const pad = opts.pad ?? Math.round(px * 0.2);
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(px * 1.35) + pad;
  c.width = w;
  c.height = h;
  ctx.font = font;
  ctx.fillStyle = opts.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const out = { tex, aspect: w / h };
  cache.set(key, out);
  return out;
}

/** Diagonal hatch texture (out of service, no reading). */
const hatchCache = new Map<string, THREE.CanvasTexture>();
export function hatchTexture(color: string): THREE.CanvasTexture {
  const hit = hatchCache.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  for (let i = -64; i < 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 64, 0);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  hatchCache.set(color, tex);
  return tex;
}
