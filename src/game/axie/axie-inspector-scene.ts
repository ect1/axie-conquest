import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { BabylonAxieMixer, type BabylonAxiePlan, type BabylonAxieInstance } from './babylon-mixer';

export type AxieInspectorAnimation = 'idle' | 'run' | 'attack';

/** A single-Axie preview with an orbit camera, kept independent from battle presentation. */
export async function createAxieInspectorScene(canvas: HTMLCanvasElement, plan: BabylonAxiePlan, onReady: (avatar: BabylonAxieInstance) => void) {
  const engine = new Engine(canvas, true);
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#dcebd9ff');
  // Axie meshes face +Z; place the orbit camera at +Z for the default front view.
  const camera = new ArcRotateCamera('Axie inspector camera', Math.PI / 2, 1.08, 4.2, new Vector3(0, 0.45, 0), scene);
  camera.lowerBetaLimit = 0.58; camera.upperBetaLimit = 1.42;
  camera.lowerRadiusLimit = 2; camera.upperRadiusLimit = 7;
  camera.wheelDeltaPercentage = 0.02; camera.panningSensibility = 0;
  camera.attachControl(canvas, false, false);
  new HemisphericLight('Axie inspector sky', new Vector3(0, 1, -0.25), scene).intensity = 1.15;
  const pedestal = MeshBuilder.CreateCylinder('Axie preview pedestal', { diameter: 2.5, height: 0.14, tessellation: 48 }, scene);
  pedestal.position.y = -0.63; pedestal.isPickable = false;
  const pedestalMaterial = new StandardMaterial('Axie preview pedestal material', scene);
  pedestalMaterial.diffuseColor = Color3.FromHexString('#8cb587'); pedestalMaterial.specularColor = Color3.Black(); pedestal.material = pedestalMaterial;
  const mixer = new BabylonAxieMixer(scene);
  let avatar: BabylonAxieInstance | null = null, animation: AxieInspectorAnimation = 'idle', startedAt = performance.now() / 1000, disposed = false;
  try {
    avatar = await mixer.create(plan);
    if (disposed) { avatar.dispose(); throw new Error('Axie preview closed.'); }
    avatar.root.position.y = -0.55;
    onReady(avatar);
  } catch (error) {
    mixer.dispose(); pedestalMaterial.dispose(); pedestal.dispose(); scene.dispose(); engine.dispose(); throw error;
  }
  engine.runRenderLoop(() => { avatar?.update(animation === 'attack' ? 'attacking' : animation === 'run' ? 'approaching' : 'idle', performance.now() / 1000 - startedAt); scene.render(); });
  const resize = () => engine.resize(); window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  return {
    setAnimation: (next: AxieInspectorAnimation) => { animation = next; startedAt = performance.now() / 1000; },
    home: () => { camera.alpha = Math.PI / 2; camera.beta = 1.08; camera.radius = 4.2; camera.target.set(0, 0.45, 0); },
    dispose: () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); avatar?.dispose(); mixer.dispose(); pedestalMaterial.dispose(); pedestal.dispose(); scene.dispose(); engine.dispose(); },
  };
}
