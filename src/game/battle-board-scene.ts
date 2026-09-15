import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { createHexGridSlots, HEX_GRID_RADIUS } from './hex-grid';

export type BattleBoardLayout = { hexGap: number; teamGap: number; columns: number; rowsPerTeam: number };


/** A fixed-isometric 3D terrain board. The formation slots are thin meshes resting over the ground. */
export function createBattleBoardScene(canvas: HTMLCanvasElement, initial: BattleBoardLayout, onReady: () => void = () => {}) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#18382fff');
  const homeAlpha = -Math.PI / 2, homeBeta = .72, homeRadius = 38;
  const camera = new ArcRotateCamera('battle board camera', homeAlpha, homeBeta, homeRadius, new Vector3(0, 0, 0), scene);
  camera.lowerAlphaLimit = camera.upperAlphaLimit = homeAlpha;
  camera.lowerBetaLimit = camera.upperBetaLimit = homeBeta;
  camera.lowerRadiusLimit = 18; camera.upperRadiusLimit = 65; camera.panningSensibility = 80; camera.wheelDeltaPercentage = .02; camera.minZ = .1;
  camera.attachControl(canvas, false, false);
  new HemisphericLight('lunacia sky', new Vector3(-.3, 1, -.2), scene).intensity = .95;
  const sun = new DirectionalLight('lunacia sun', new Vector3(.35, -1, .25), scene); sun.position = new Vector3(-12, 22, -10); sun.intensity = 1.15;

  const ground = MeshBuilder.CreateGround('battlefield terrain', { width: 44, height: 46, subdivisions: 2 }, scene);
  const turf = new StandardMaterial('battlefield turf', scene); turf.diffuseColor = Color3.FromHexString('#527a48'); turf.specularColor = Color3.Black(); ground.material = turf; ground.isPickable = false;
  const playerFill = new StandardMaterial('player hex fill', scene); playerFill.diffuseColor = Color3.FromHexString('#397f72'); playerFill.emissiveColor = Color3.FromHexString('#075d55'); playerFill.alpha = .45;
  const enemyFill = new StandardMaterial('enemy hex fill', scene); enemyFill.diffuseColor = Color3.FromHexString('#985949'); enemyFill.emissiveColor = Color3.FromHexString('#703227'); enemyFill.alpha = .45;
  const neutralFill = new StandardMaterial('neutral hex fill', scene); neutralFill.diffuseColor = Color3.FromHexString('#727b79'); neutralFill.emissiveColor = Color3.FromHexString('#35413f'); neutralFill.alpha = .52;
  let board: TransformNode | null = null;
  function rebuild(layout: BattleBoardLayout) {
    board?.dispose(); board = new TransformNode('hex formation board', scene);
    const neutralRows = Math.round(layout.teamGap);
    const slots = createHexGridSlots({ columns: layout.columns, hexGap: layout.hexGap * .22, bands: [{ id: 'enemy', rows: layout.rowsPerTeam }, { id: 'neutral', rows: neutralRows }, { id: 'player', rows: layout.rowsPerTeam }] });
    for (const slot of slots) {
      const fill = MeshBuilder.CreateCylinder('hex slot', { diameter: HEX_GRID_RADIUS * 1.93, height: .055, tessellation: 6 }, scene);
      fill.parent = board; fill.position.set(slot.x, .07, slot.z); fill.rotation.y = Math.PI / 6; fill.material = slot.band === 'player' ? playerFill : slot.band === 'enemy' ? enemyFill : neutralFill; fill.isPickable = false;
      const points = Array.from({ length: 7 }, (_, corner) => { const angle = Math.PI / 6 + corner * Math.PI / 3; return new Vector3(slot.x + Math.cos(angle) * HEX_GRID_RADIUS, .15, slot.z + Math.sin(angle) * HEX_GRID_RADIUS); });
      const edge = MeshBuilder.CreateLines('hex slot edge', { points }, scene);
      edge.parent = board; edge.color = Color3.FromHexString(slot.band === 'player' ? '#36f0d8' : slot.band === 'enemy' ? '#ff907d' : '#a7b0ae'); edge.isPickable = false;
    }
  }
  rebuild(initial);
  const resize = () => engine.resize(); window.addEventListener('resize', resize); const observer = new ResizeObserver(resize); observer.observe(canvas);
  let ready = false;
  engine.runRenderLoop(() => { scene.render(); if (!ready && scene.isReady()) { ready = true; canvas.dataset.battleBoardReady = 'true'; onReady(); } });
  return {
    update: rebuild,
    zoom: (factor: number) => { camera.radius = Math.max(camera.lowerRadiusLimit!, Math.min(camera.upperRadiusLimit!, camera.radius * factor)); },
    home: () => { camera.alpha = homeAlpha; camera.beta = homeBeta; camera.radius = homeRadius; camera.target.set(0, 0, 0); },
    dispose: () => { observer.disconnect(); window.removeEventListener('resize', resize); board?.dispose(); scene.dispose(); engine.dispose(); },
  };
}
