import { createBattleRenderer } from './battle-renderer';
import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, Matrix, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { Battle } from './battle';

import { BattleOverlays } from './battle-debug';

export function createBattleScene(canvas: HTMLCanvasElement, read: () => { battle: Battle; selected: string | null; overlays: BattleOverlays; all: boolean }, select: (id: string) => void, onReady: () => void = () => {}, passive = false, onModelError: (message: string) => void = () => {}) {
  const engine = new Engine(canvas, true);
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine); scene.clearColor = Color4.FromHexString('#233d37ff');
  const camera = new ArcRotateCamera('battle camera', -Math.PI / 2, 0.65, 32, new Vector3(0, 0, 0), scene);
  camera.lowerAlphaLimit = camera.upperAlphaLimit = -Math.PI / 2;
  camera.lowerBetaLimit = camera.upperBetaLimit = 0.65;
  camera.lowerRadiusLimit = 16; camera.upperRadiusLimit = 80; camera.minZ = 0.1;
  if (!passive) camera.attachControl(false, false, 0); camera.panningSensibility = 80;
  // Left-drag pans; camera orientation is fixed. Pinch and wheel control zoom.
  new HemisphericLight('battle sky', new Vector3(0, 1, 0), scene).intensity = 0.95;
  const ground = MeshBuilder.CreateGround('Lunacian battlefield', { width: 90, height: 90 }, scene);
  const grass = new StandardMaterial('battle grass', scene); grass.diffuseColor = Color3.FromHexString('#66855a'); ground.material = grass; ground.isPickable = false;
  const presentation = createBattleRenderer(scene);
  const models = presentation.models;
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureMoved = false, ready = false;
  function render() {
    const { battle, selected, overlays, all } = read();
    presentation.update(battle, selected, overlays, all);
    scene.render();
    if (!ready && presentation.isReady() && scene.isReady()) { ready = true; if (presentation.errors.length) onModelError(presentation.errors.join(' ')); canvas.dataset.battleReady = 'true'; onReady(); }
  }
  const pointerDown = (e: PointerEvent) => { if (!pointers.size) gestureMoved = false; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size > 1) gestureMoved = true; };
  const pointerMove = (e: PointerEvent) => { const start = pointers.get(e.pointerId); if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) gestureMoved = true; };
  const pointerUp = (e: PointerEvent) => {
    if (passive) return;
    const start = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (!start || pointers.size || gestureMoved || e.type === 'pointercancel') return;
    const rect = canvas.getBoundingClientRect();
    // Screen-space hit targets stay at least 44px across, independent of camera zoom.
    const candidates = Array.from(models.entries()).map(([id, model]) => {
      const point = Vector3.Project(model.body.position, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      return { id, distance: Math.hypot(point.x * rect.width / engine.getRenderWidth() - (e.clientX - rect.left), point.y * rect.height / engine.getRenderHeight() - (e.clientY - rect.top)) };
    }).sort((a, b) => a.distance - b.distance);
    if (candidates[0]?.distance <= 22) select(candidates[0].id);
  };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
  const resize = () => engine.resize(); window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  engine.runRenderLoop(render);
  return { zoom: (factor: number) => { camera.radius = Math.max(16, Math.min(80, camera.radius * factor)); }, home: () => { camera.target.set(0, 0, 0); camera.radius = 32; }, dispose: () => { observer.disconnect(); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); presentation.dispose(); scene.dispose(); engine.dispose(); } };
}
