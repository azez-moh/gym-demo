import * as THREE from 'three';
import type { MachineType } from '../data/types';
import { buildMachineObject, type MachineColors } from './machineGeometry';

/**
 * Exports the procedural model of a machine type as a binary glTF (.glb) and saves it in the browser.
 * Nothing is fetched from a server. Throws when the export fails, so callers can show an inline message;
 * no file is saved in that case.
 */
export async function downloadMachineGlb(type: MachineType, colors: MachineColors, fileName = `${type}.glb`): Promise<number> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const root = new THREE.Scene();
  root.name = type;
  root.add(buildMachineObject(type, colors));
  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(root, { binary: true, onlyVisible: true });
  if (!(result instanceof ArrayBuffer) || result.byteLength < 64) throw new Error('Empty export');
  const blob = new Blob([result], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  return result.byteLength;
}
