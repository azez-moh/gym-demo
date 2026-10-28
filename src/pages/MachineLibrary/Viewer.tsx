import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { MachineType } from '../../data/types';
import { MACHINE_FOOTPRINT } from '../../data/library';
import { MachineModel, machinePalette } from '../../three/machines';
import { StudioLights } from '../../three/Scene';

/** Large inspect viewer: one machine, drag to rotate, wheel or pinch to zoom, soft contact shadow. */

function Frame({ type, resetSignal, controls }: { type: MachineType; resetSignal: number; controls: React.MutableRefObject<OrbitControlsImpl | null> }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const fp = MACHINE_FOOTPRINT[type];
    const r = Math.max(fp.l, fp.w, fp.h);
    camera.position.set(-r * 1.55, fp.h * 0.55 + r * 0.75, r * 1.5);
    const c = controls.current;
    if (c) { c.target.set(0, fp.h * 0.42, 0); c.update(); }
    camera.lookAt(0, fp.h * 0.42, 0);
    invalidate();
  }, [type, resetSignal, camera, controls, invalidate]);
  return null;
}

export default function Viewer({ type, theme, accent, autoRotate, resetSignal, ariaLabel }: {
  type: MachineType; theme: 'light' | 'dark'; accent: string; autoRotate: boolean; resetSignal: number; ariaLabel: string;
}) {
  const pal = machinePalette(theme);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const fp = MACHINE_FOOTPRINT[type];
  const bg = theme === 'dark' ? '#151024' : '#ecebf0';
  return (
    <div className="ml-viewer__canvas" role="img" aria-label={ariaLabel}>
      <Canvas shadows dpr={[1, 2]} camera={{ fov: 32, near: 0.05, far: 60, position: [-3, 2, -3] }} gl={{ antialias: true }}>
        <color attach="background" args={[bg]} />
        <StudioLights theme={theme} extent={2.4} />
        <MachineModel type={type} accent={accent} frame={pal.frame} soft={pal.soft} metal={pal.metal} screen={pal.screen} castShadow />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
          <circleGeometry args={[Math.max(fp.l, fp.w) * 1.1, 48]} />
          <shadowMaterial opacity={theme === 'dark' ? 0.45 : 0.18} />
        </mesh>
        <ContactShadows position={[0, 0.002, 0]} opacity={theme === 'dark' ? 0.6 : 0.35} scale={Math.max(fp.l, fp.w) * 2.4} blur={2.2} far={2} resolution={512} />
        <OrbitControls ref={controls as unknown as React.MutableRefObject<OrbitControlsImpl>} makeDefault enableDamping enablePan={false}
          minDistance={1} maxDistance={9} maxPolarAngle={Math.PI / 2.05} autoRotate={autoRotate} autoRotateSpeed={0.8} />
        <Frame type={type} resetSignal={resetSignal} controls={controls} />
      </Canvas>
    </div>
  );
}
