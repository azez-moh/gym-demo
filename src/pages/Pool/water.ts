import * as THREE from 'three';

/*
  Cheap animated water: a single flat plane whose normal comes from a few analytic sine waves in the
  fragment shader (no vertex displacement, no render targets). Fresnel tint, one soft highlight, a faint
  caustic shimmer, optional violet glow per pool lane and an optional turbulence term for jacuzzi jets.
*/

export interface WaterColors { deep: string; shallow: string; sky: string; glow: string; spec: number; alpha: [number, number] }

export function waterColors(theme: 'light' | 'dark', glow: string): WaterColors {
  return theme === 'dark'
    ? { deep: '#0a3c4c', shallow: '#1d7d92', sky: '#2a3550', glow, spec: 0.5, alpha: [0.72, 0.9] }
    : { deep: '#3aa7bf', shallow: '#9fe0ea', sky: '#eef6fa', glow, spec: 0.75, alpha: [0.62, 0.86] };
}

const vert = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const frag = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uGlow;
  uniform float uSpec;
  uniform vec2 uAlpha;
  uniform float uLaneGlow[5];
  uniform float uLaneZ0;
  uniform float uLaneW;
  uniform float uLanes;
  uniform float uJets;
  uniform vec2 uCenter;
  uniform float uWave;
  varying vec3 vWorld;

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    // gentle swell: derivatives of three travelling sine waves
    float dx = 0.0;
    float dz = 0.0;
    dx += 0.050 * 1.10 * cos(p.x * 1.10 + p.y * 0.35 + t * 0.70);
    dz += 0.050 * 0.35 * cos(p.x * 1.10 + p.y * 0.35 + t * 0.70);
    dx += 0.030 * 0.40 * cos(p.x * 0.40 - p.y * 1.70 + t * 0.95);
    dz -= 0.030 * 1.70 * cos(p.x * 0.40 - p.y * 1.70 + t * 0.95);
    dx += 0.012 * 3.10 * cos(p.x * 3.10 + p.y * 2.20 - t * 1.40);
    dz += 0.012 * 2.20 * cos(p.x * 3.10 + p.y * 2.20 - t * 1.40);
    dx *= uWave;
    dz *= uWave;
    // jets: radial chop from the centre, stronger towards the seat wall
    if (uJets > 0.001) {
      vec2 q = p - uCenter;
      float r = length(q) + 1e-4;
      float a = atan(q.y, q.x);
      float k = sin(r * 9.0 - t * 6.0 + sin(a * 6.0 + t * 2.0) * 1.6) * 0.16 + sin(a * 11.0 - t * 4.3 + r * 5.0) * 0.08;
      dx += uJets * k * (q.x / r);
      dz += uJets * k * (q.y / r);
    }
    vec3 n = normalize(vec3(-dx, 1.0, -dz));
    vec3 v = normalize(cameraPosition - vWorld);
    float ndv = max(dot(n, v), 0.0);
    float fres = pow(1.0 - ndv, 3.0);
    vec3 l = normalize(vec3(0.35, 1.0, 0.25));
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 140.0) * uSpec;
    // caustic shimmer
    float c = sin(p.x * 2.6 + sin(p.y * 2.1 + t * 0.8) * 1.4 + t * 0.5) * sin(p.y * 2.9 + sin(p.x * 1.6 - t * 0.7) * 1.4);
    c = smoothstep(0.55, 1.0, c) * 0.09;
    vec3 col = mix(uDeep, uShallow, clamp(0.55 + n.x * 3.0 + n.z * 2.0, 0.0, 1.0));
    // lanes in use glow faintly
    if (uLanes > 0.5) {
      float li = floor((p.y - uLaneZ0) / uLaneW);
      float g = 0.0;
      for (int i = 0; i < 5; i++) { if (abs(li - float(i)) < 0.5) g = uLaneGlow[i]; }
      float lf = fract((p.y - uLaneZ0) / uLaneW);
      float soft = smoothstep(0.0, 0.18, lf) * smoothstep(1.0, 0.82, lf);
      col = mix(col, uGlow, g * soft * 0.22);
    }
    col += c + uJets * 0.06;
    col = mix(col, uSky, fres * 0.55);
    col += spec;
    gl_FragColor = vec4(col, mix(uAlpha.x, uAlpha.y, fres) + spec * 0.5);
    #include <colorspace_fragment>
  }
`;

export function createWaterMaterial(c: WaterColors, opts?: { lanes?: { z0: number; w: number }; center?: [number, number]; wave?: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(c.deep) },
      uShallow: { value: new THREE.Color(c.shallow) },
      uSky: { value: new THREE.Color(c.sky) },
      uGlow: { value: new THREE.Color(c.glow) },
      uSpec: { value: c.spec },
      uAlpha: { value: new THREE.Vector2(c.alpha[0], c.alpha[1]) },
      uLaneGlow: { value: [0, 0, 0, 0, 0] },
      uLaneZ0: { value: opts?.lanes?.z0 ?? 0 },
      uLaneW: { value: opts?.lanes?.w ?? 1 },
      uLanes: { value: opts?.lanes ? 1 : 0 },
      uJets: { value: 0 },
      uCenter: { value: new THREE.Vector2(opts?.center?.[0] ?? 0, opts?.center?.[1] ?? 0) },
      uWave: { value: opts?.wave ?? 1 },
    },
  });
}

/** Neutral reflections for metal and glossy parts, generated locally (no HDR download). */
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
