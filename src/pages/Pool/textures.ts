import * as THREE from 'three';

/* Text drawn on a canvas and used as a texture (lane numbers). Cached per text and colour. */

const cache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

export function labelTexture(text: string, color: string, font: string, px = 96): { tex: THREE.CanvasTexture; aspect: number } {
  const key = `${text}|${color}|${font}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  const f = `500 ${px}px ${font}`;
  ctx.font = f;
  const pad = Math.round(px * 0.25);
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  const h = Math.ceil(px * 1.3) + pad;
  c.width = w;
  c.height = h;
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + px * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const out = { tex, aspect: w / h };
  cache.set(key, out);
  return out;
}

/** Square-tile texture (grout lines) for decks and basins, repeated by the caller. */
const tileCache = new Map<string, THREE.CanvasTexture>();
export function tileTexture(base: string, grout: string, cells = 4): THREE.CanvasTexture {
  const key = `${base}|${grout}|${cells}`;
  const hit = tileCache.get(key);
  if (hit) return hit;
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = grout;
  ctx.lineWidth = 2;
  const step = s / cells;
  for (let i = 0; i <= cells; i++) {
    ctx.beginPath(); ctx.moveTo(i * step, 0); ctx.lineTo(i * step, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * step); ctx.lineTo(s, i * step); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tileCache.set(key, tex);
  return tex;
}
