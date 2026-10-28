import { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { useTheme } from '../theme/theme';

/*
  Shared 3D stage: canvas, soft studio lights, optional grid, orbit controls.
  Usage: <Scene camera={[8, 10, 14]} target={[0, 0, 6]}><MachineModel type="treadmill" /></Scene>
  `mode="2d"` gives a top-down plan view (camera straight above, rotation locked).
  `controls={false}` leaves the camera to the caller (custom controls or animated camera).
*/

export interface SceneProps {
  children: ReactNode;
  camera?: [number, number, number];
  target?: [number, number, number];
  fov?: number;
  height?: number | string;
  grid?: boolean;
  gridSize?: [number, number];
  mode?: '3d' | '2d';
  autoRotate?: boolean;
  /** Allow zoom with the mouse wheel (off by default so the page scrolls). */
  wheelZoom?: boolean;
  minDistance?: number;
  maxDistance?: number;
  className?: string;
  ariaLabel: string;
  /** Built-in OrbitControls (default true). */
  controls?: boolean;
  /** Half size of the area that receives sharp shadows, in metres (default 6). */
  shadowExtent?: number;
  /** Called on a click that hits no object. */
  onPointerMissed?: (e: MouseEvent) => void;
  /** Keep the drawing buffer (needed for canvas snapshots). */
  preserveDrawingBuffer?: boolean;
}

export function sceneColors(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? { bg: '#0b0913', floor: '#151024', grid: '#2a2536', gridStrong: '#2a3634', wall: '#1c1830', frame: '#3a3450', soft: '#2a2536', outline: '#8f9a97', label: '#ffffff' }
    : { bg: '#ecebf0', floor: '#ffffff', grid: '#e7e3f2', gridStrong: '#dcd8e6', wall: '#e7e3f2', frame: '#6a6577', soft: '#dcd8e6', outline: '#6a6577', label: '#241f30' };
}

/** Soft studio light rig shared by every 3D view. */
export function StudioLights({ theme, extent = 6 }: { theme: 'light' | 'dark'; extent?: number }) {
  const dark = theme === 'dark';
  return (
    <>
      <hemisphereLight args={[dark ? '#dfe7e5' : '#ffffff', dark ? '#151024' : '#d9d9d6', dark ? 0.75 : 1.0]} />
      <ambientLight intensity={dark ? 0.18 : 0.25} />
      <directionalLight position={[extent * 0.6, extent * 1.6, extent * 0.9]} intensity={dark ? 1.25 : 1.45} castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02}
        shadow-camera-left={-extent} shadow-camera-right={extent} shadow-camera-top={extent} shadow-camera-bottom={-extent}
        shadow-camera-near={0.5} shadow-camera-far={extent * 6} />
      <directionalLight position={[-extent, extent * 0.8, -extent]} intensity={dark ? 0.35 : 0.4} />
    </>
  );
}

export function Scene({
  children, camera = [8, 9, 12], target = [0, 0, 0], fov = 40, height = 420, grid = true, gridSize = [50, 50], mode = '3d',
  autoRotate, wheelZoom = false, minDistance = 2, maxDistance = 60, className = '', ariaLabel, controls = true, shadowExtent = 6,
  onPointerMissed, preserveDrawingBuffer,
}: SceneProps) {
  const { theme } = useTheme();
  const c = sceneColors(theme);
  const cam: [number, number, number] = mode === '2d' ? [target[0], Math.max(18, camera[1] * 1.6), target[2] + 0.001] : camera;
  return (
    <div className={`scene ${className}`.trim()} style={{ height, background: c.bg, position: 'relative' }} role="img" aria-label={ariaLabel}>
      <Canvas shadows dpr={[1, 2]} camera={{ position: cam, fov }} key={mode} onPointerMissed={onPointerMissed}
        gl={{ antialias: true, preserveDrawingBuffer }}>
        <color attach="background" args={[c.bg]} />
        <StudioLights theme={theme} extent={shadowExtent} />
        <Suspense fallback={null}>
          {grid && (
            <Grid args={gridSize} position={[target[0], 0, target[2]]} cellSize={1} sectionSize={5} cellColor={c.grid} sectionColor={c.gridStrong}
              cellThickness={0.6} sectionThickness={1} fadeDistance={80} infiniteGrid={false} />
          )}
          {children}
        </Suspense>
        {controls && (
          <OrbitControls makeDefault target={target} enableRotate={mode === '3d'} enableZoom={wheelZoom} enablePan enableDamping
            autoRotate={autoRotate} autoRotateSpeed={0.6} minDistance={minDistance} maxDistance={maxDistance} maxPolarAngle={Math.PI / 2.05} />
        )}
      </Canvas>
    </div>
  );
}
