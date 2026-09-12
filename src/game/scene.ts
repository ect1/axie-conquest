import { generateWorld, GenerationSettings, WorldObject, WORLD_DEFINITIONS, WORLD_SAVE_KEY, WORLD_WIDTH, WORLD_DEPTH } from './world';
import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { BUILDING_DEFINITIONS, BuildableKind, BuildingKind, Building, Cell, FOOTPRINT, GRID_DEPTH, GRID_WIDTH, MAIN_HALL, canPlace, getBuildingDimensions, getBuildingFootprint, restoreBuildings, canMoveBuilding, moveBuilding, removeBuilding, rotateBuilding, Troops, TroopKind } from './base';
import { createMilitaryService, getTrainingMessage } from './military-service';
import { CAPITAL_CITY_ID } from './cities';

type Events = { troops: (troops: Troops) => void; change: (b: Building[]) => void; preview: (c: Cell | null) => void; select: (b: Building | null) => void; message: (s: string) => void; viewMode: (mode: 'base' | 'world') => void };
export type BaseView = { regenerateWorld: (settings: GenerationSettings) => WorldObject[]; loadWorld: (objects: WorldObject[]) => void; removeWorld: () => void; train: (kind: TroopKind) => boolean; rotate: (id: string) => boolean; move: (id: string) => boolean; remove: (id: string) => boolean; begin: (kind: BuildableKind) => void; cancel: () => void; confirm: () => boolean; setGridVisible: (visible: boolean) => void; setWorldView: (enabled: boolean) => void; zoom: (factor: number) => void; home: () => void; dispose: () => void };
const SAVE_KEY = 'axie-conquest-base-v2';
const HALF_WIDTH = GRID_WIDTH / 2;
const HALF_DEPTH = GRID_DEPTH / 2;

export function createBase(canvas: HTMLCanvasElement, events: Events): BaseView {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#91aaa2ff');
  // Keep building fronts pointing southeast on screen.
  const camera = new ArcRotateCamera('isometric', -5 * Math.PI / 6, 0.66, 43, new Vector3(0, 0, 0), scene);
  camera.minZ = 0.1;
  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene);
  // Keep combined daylight near 1 so grass and pale building materials retain their color.
  sky.intensity = 0.65; sky.groundColor = Color3.FromHexString('#799478');
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.3), scene); sun.intensity = 0.45;
  const material = (name: string, hex: string, alpha = 1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex); m.specularColor = Color3.Black(); m.alpha = alpha;
    return m;
  };
  const grass = material('meadow', '#78965f');
  const earth = material('island edges', '#677d59');
  const stone = material('sandstone', '#dfd5b6');
  const wall = material('warm plaster', '#f1dcb3');
  const wood = material('cedar', '#79543b');
  const roof = material('jade roof', '#397e72');
  const dark = material('doorways', '#344f44');
  const gold = material('gold', '#ecc763');
  const soil = material('soil', '#916344');
  const crop = material('crops', '#b3c354');
  const rockMat = material('quarried stone', '#8e9b9d');
  const medical = material('healing cross', '#d95c60');
  const oilPaint = material('oil barrel blue', '#537887');
  const accents = { lumber: material('lumber canopy', '#997244'), stone: material('slate roof', '#647c91'), quarry: rockMat, barracks: material('barracks red', '#b35f51'), tavern: material('tavern amber', '#c18a45'), scout: material('scout blue', '#588caa'), archery: material('archery green', '#567c48'), road: material('road paving', '#8e9993'), hospital: material('hospital blue', '#75a9b5') };
  const validMat = material('valid footprint', '#42f099', 0.7);
  const invalidMat = material('invalid footprint', '#ff5056', 0.8);
  validMat.emissiveColor = Color3.FromHexString('#1e7946');
  invalidMat.emissiveColor = Color3.FromHexString('#92222a');
  const freeMat = material('free cells', '#80d5a0', 0.18);
  const usedMat = material('occupied cells', '#ee625f', 0.5);
  function box(name: string, w: number, h: number, d: number, x: number, y: number, z: number, mat: StandardMaterial, parent?: TransformNode) {
    const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    mesh.position.set(x, y, z); mesh.material = mat; mesh.isPickable = false;
    if (parent) mesh.parent = parent;
    return mesh;
  }
  box('floating land', GRID_WIDTH + 5, 1.4, GRID_DEPTH + 5, 0, -0.85, 0, earth);
  // The settlement is the first safe district in a much larger explorable region.
  // Keep the buildable island distinct so placement remains constrained to the base.
  const world = MeshBuilder.CreateGround('Lunacia exploration field', { width: WORLD_WIDTH, height: WORLD_DEPTH }, scene);
  world.position.y = -0.08; world.material = grass; world.isPickable = false;
  const land = MeshBuilder.CreateGround('buildable land', { width: GRID_WIDTH, height: GRID_DEPTH }, scene);
  land.material = grass;
  // A wider invisible picking surface lets previews cross the boundary and turn red.
  const picker = MeshBuilder.CreateGround('placement plane', { width: WORLD_WIDTH, height: WORLD_DEPTH }, scene);
  picker.visibility = 0; picker.isPickable = true;
  // Default fortifications sit outside the settlement grid and never consume build cells.
  const perimeter = new TransformNode('base perimeter', scene);
  const perimeterX = HALF_WIDTH + 1.2;
  const perimeterZ = HALF_DEPTH + 1.2;
  function rampart(length: number, x: number, z: number, alongX: boolean) {
    box('base wall', alongX ? length : 0.8, 1.3, alongX ? 0.8 : length, x, 0.6, z, rockMat, perimeter);
    box('wall coping', alongX ? length : 0.95, 0.16, alongX ? 0.95 : length, x, 1.33, z, stone, perimeter);
    const count = Math.ceil(length / 1.2);
    for (let i = 0; i < count; i++) {
      const offset = -length / 2 + (i + 0.5) * length / count;
      box('perimeter battlement', 0.5, 0.35, 0.5, x + (alongX ? offset : 0), 1.57, z + (alongX ? 0 : offset), stone, perimeter);
    }
  }
  rampart(perimeterX * 2, 0, perimeterZ, true);
  for (const x of [-perimeterX, perimeterX]) rampart(perimeterZ * 2, x, 0, false);
  // Leave a central entrance on the front side.
  const frontLength = perimeterX - 2;
  for (const sign of [-1, 1]) {
    rampart(frontLength, sign * (2 + frontLength / 2), -perimeterZ, true);
    box('gate pillar', 0.8, 2.1, 1, sign * 2, 1, -perimeterZ, stone, perimeter);
  }
  box('gate lintel', 4.8, 0.35, 1.1, 0, 2.15, -perimeterZ, stone, perimeter);
  box('jade gate roof', 5, 0.2, 1.35, 0, 2.42, -perimeterZ, roof, perimeter);
  box('entrance path', 3.2, 0.08, 2.4, 0, 0.02, -perimeterZ, stone, perimeter);
  for (const x of [-perimeterX, perimeterX]) for (const z of [-perimeterZ, perimeterZ]) {
    box('corner watchtower', 2.2, 2.7, 2.2, x, 1.3, z, rockMat, perimeter);
    box('watch platform', 2.4, 0.2, 2.4, x, 2.75, z, stone, perimeter);
    for (const edge of [-0.95, 0.95]) for (const offset of [-0.95, 0, 0.95]) {
      box('tower battlement', 0.5, 0.45, 0.5, x + edge, 3.05, z + offset, stone, perimeter);
      if (offset === 0) box('tower battlement', 0.5, 0.45, 0.5, x, 3.05, z + edge, stone, perimeter);
    }
    box('tower arrow slit', 0.18, 0.6, 0.05, x, 1.9, z - 1.12, dark, perimeter);
    box('tower side slit', 0.05, 0.6, 0.18, x - 1.12, 1.9, z, dark, perimeter);
    box('watchtower mast', 0.08, 1.1, 0.08, x, 3.25, z, wood, perimeter);
    box('jade pennant', 0.65, 0.35, 0.06, x + 0.3, 3.65, z, roof, perimeter);
  }
  const buildingRoots = new Map<string, TransformNode>();
  // At world scale the detailed 4x4 building footprints become visual noise.
  // Use one compact settlement silhouette instead, then restore the detailed
  // base as soon as the player zooms back in.
  const overviewRoot = new TransformNode('settlement world marker', scene);
  const overviewIsland = box('settlement overview island', 24, 0.45, 13, 0, 0.12, 0, earth, overviewRoot);
  overviewIsland.isPickable = true;
  overviewIsland.metadata = { mapObject: 'Everleaf Haven' };
  box('settlement overview keep', 11, 2.8, 7, 0, 1.55, 0, wall, overviewRoot);
  box('settlement overview roof', 12.5, 0.55, 8.3, 0, 3.15, 0, roof, overviewRoot);
  const overviewCap = MeshBuilder.CreateCylinder('settlement overview roof cap', { diameterBottom: 9, diameterTop: 2.6, height: 2.6, tessellation: 4 }, scene);
  overviewCap.parent = overviewRoot; overviewCap.position.y = 4.65; overviewCap.rotation.y = Math.PI / 4; overviewCap.material = roof;
  box('settlement overview gate', 3.2, 1.8, 0.25, 0, 1.15, -3.65, dark, overviewRoot);
  box('settlement overview banner', 0.35, 3.8, 0.35, 0, 4.8, 0, gold, overviewRoot);
  overviewRoot.setEnabled(false);
  const WORLD_OVERVIEW_RADIUS = 58;
  let overviewActive = false;
  function updateOverview() {
    const overview = camera.radius >= WORLD_OVERVIEW_RADIUS || Math.hypot(camera.target.x, camera.target.z) > 24;
    overviewRoot.setEnabled(overview);
    perimeter.setEnabled(!overview);
    buildingRoots.forEach(root => root.setEnabled(!overview));
    gridRoot?.setEnabled(!overview && (placing));
    previewRoot?.setEnabled(!overview && placing && candidate !== null);
    if (overview !== overviewActive) {
      overviewActive = overview;
      events.viewMode(overview ? 'world' : 'base');
    }
  }
  function makeBuilding(b: Building) {
    const root = new TransformNode(b.id, scene);
    buildingRoots.set(b.id, root);
    root.rotation.y = (b.rotation ?? 0) * Math.PI / 2;
    const size = getBuildingDimensions(b.kind, b.rotation);
    root.position.set(b.x - HALF_WIDTH + size.width / 2, 0, b.z - HALF_DEPTH + size.depth / 2);
    box('foundation', size.width * 0.96, 0.18, size.depth * 0.96, 0, 0.1, 0, stone, root);
    if (b.kind === 'hall') {
      box('hall walls', 2.8, 1.7, 2.6, 0, 1, 0, wall, root);
      box('hall lower roof', 3.5, 0.3, 3.3, 0, 1.93, 0, roof, root);
      const cap = MeshBuilder.CreateCylinder('pyramid roof', { diameterBottom: 4.6, diameterTop: 1.15, height: 1.25, tessellation: 4 }, scene);
      cap.parent = root; cap.position.y = 2.65; cap.rotation.y = Math.PI / 4; cap.material = roof; cap.isPickable = false;
      box('gold roof ridge', 0.95, 0.16, 0.95, 0, 3.31, 0, gold, root);
      box('front door', 0.68, 1.08, 0.08, 0, 0.75, -1.33, dark, root);
      for (const x of [-1.05, 1.05]) {
        box('columns', 0.19, 1.65, 0.19, x, 1, -1.4, wood, root);
        box('windows', 0.42, 0.55, 0.08, x * 0.85, 1.25, -1.33, gold, root);
      }
      box('steps', 1.2, 0.15, 0.45, 0, 0.18, -1.6, stone, root);
      box('banner pole', 0.08, 1.2, 0.08, 0, 3.6, 0, wood, root);
      box('banner', 0.65, 0.36, 0.04, 0.3, 4, 0, gold, root);
    } else if (b.kind === 'farm') {
      box('tilled patch', 3.5, 0.13, 3.5, 0, 0.24, 0, soil, root);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) {
        box('growing crops', 0.22, 0.28 + row % 2 * 0.12, 0.22, -1.35 + col * 0.52, 0.49, -1.3 + row * 0.51, crop, root);
      }
      for (const x of [-1.7, 1.7]) {
        for (const z of [-1.7, 0, 1.7]) box('fence post', 0.1, 0.65, 0.1, x, 0.5, z, wood, root);
        box('fence rail', 0.07, 0.08, 3.5, x, 0.66, 0, wall, root);
      }
      box('supply crate', 0.6, 0.5, 0.5, 1.1, 0.5, 1.35, wood, root);
    } else if (b.kind === 'oil') {
      for (const x of [-1.2, -0.6, 0, 0.6, 1.2]) box('oil platform plank', 0.55, 0.2, 3, x, 0.3, 0, wood, root);
      const barrel = MeshBuilder.CreateCylinder('oil barrel', { diameter: 1.9, height: 2.1, tessellation: 24 }, scene);
      barrel.parent = root; barrel.position.y = 1.45; barrel.material = oilPaint;
      for (const y of [0.48, 1, 1.9, 2.44]) {
        const band = MeshBuilder.CreateCylinder('barrel metal band', { diameter: 1.96, height: 0.09, tessellation: 24 }, scene);
        band.parent = root; band.position.y = y; band.material = rockMat;
      }
      const cap = MeshBuilder.CreateCylinder('oil barrel cap', { diameter: 0.22, height: 0.09, tessellation: 12 }, scene);
      cap.parent = root; cap.position.set(0.5, 2.54, 0); cap.material = dark;
      box('oil barrel label', 0.6, 0.6, 0.05, 0, 1.45, -0.96, gold, root);
    } else if (b.kind === 'training') {
      box('drill yard', 3.5, 0.1, 3.5, 0, 0.23, 0, soil, root);
      for (const x of [-1.1, 0, 1.1]) {
        box('practice dummy post', 0.15, 1.4, 0.15, x, 0.98, 0.7, wood, root);
        box('practice dummy body', 0.45, 0.65, 0.35, x, 1.15, 0.7, wall, root);
        box('practice dummy arms', 0.85, 0.12, 0.12, x, 1.35, 0.7, wood, root);
        box('drill lane', 0.05, 0.02, 1.5, x, 0.3, -0.65, stone, root);
      }
      for (const x of [-1.65, 1.65]) {
        box('yard standard pole', 0.08, 2, 0.08, x, 1.2, 1.5, wood, root);
        box('yard standard', 0.45, 0.55, 0.05, x, 1.85, 1.5, gold, root);
      }
    } else if (b.kind === 'road') {
      box('road bed', 3.7, 0.12, 0.9, 0, 0.22, 0, accents.road, root);
      for (const x of [-1.3, 0, 1.3]) box('road center stone', 0.72, 0.08, 0.5, x, 0.34, 0, stone, root);
    } else if (b.kind === 'hospital') {
      box('healing lodge walls', 2.9, 1.7, 2.45, 0, 1.05, 0.15, wall, root);
      box('healing lodge roof', 3.35, 0.3, 2.85, 0, 2.05, 0.15, accents.hospital, root);
      box('healing lodge ridge', 2.5, 0.28, 0.5, 0, 2.35, 0.15, roof, root);
      box('lodge door', 0.65, 1.05, 0.08, 0, 0.75, -1.1, dark, root);
      for (const x of [-0.85, 0.85]) box('lodge window', 0.45, 0.45, 0.08, x, 1.25, -1.1, gold, root);
      box('healing cross vertical', 0.25, 0.95, 0.12, 0, 2.8, -1.28, medical, root);
      box('healing cross horizontal', 0.75, 0.25, 0.12, 0, 2.8, -1.28, medical, root);
      box('lodge awning', 1.7, 0.12, 0.65, 0, 1.83, -1.35, accents.hospital, root);
    }
    if (b.kind !== 'hall' && b.kind !== 'farm' && b.kind !== 'road' && b.kind !== 'hospital' && b.kind !== 'training' && b.kind !== 'oil') {
      const accent = accents[b.kind];
      if (b.kind === 'lumber') {
        box('timber yard', 3.4, 0.12, 3.4, 0, 0.23, 0, soil, root);
        for (const x of [-1.3, 1.3]) for (const z of [0, 1.3]) {
          box('sawmill post', 0.15, 1.7, 0.15, x, 1.1, z, wood, root);
        }
        box('sawmill canopy', 3.1, 0.25, 1.8, 0, 2, 0.65, accent, root);
        box('cutting table', 2.2, 0.2, 0.7, 0, 0.8, 0.5, wood, root);
        for (let i = 0; i < 5; i++) {
          const log = MeshBuilder.CreateCylinder('stacked timber', { diameter: 0.4, height: 2.5, tessellation: 8 }, scene);
          log.parent = root; log.material = wood; log.rotation.z = Math.PI / 2;
          log.position.set(0, i < 3 ? 0.5 : 0.85, -1.35 + (i < 3 ? i : i - 2.5) * 0.42);
        }
        box('fresh planks', 1.8, 0.12, 0.45, 0, 0.97, 0.5, wall, root);
      } else if (b.kind === 'quarry') {
        box('quarry pit', 3.4, 0.12, 3.4, 0, 0.23, 0, soil, root);
        for (let i = 0; i < 5; i++) {
          const rock = MeshBuilder.CreateSphere('cut stone', { diameter: 1, segments: 4 }, scene);
          rock.parent = root; rock.material = rockMat;
          rock.position.set(-1.1 + (i % 3) * 1.05, 0.6, -0.9 + Math.floor(i / 3) * 1.3);
          rock.scaling.set(0.85, 0.7 + (i % 2) * 0.5, 0.9);
        }
        box('crane post', 0.18, 2.5, 0.18, 1.3, 1.4, 1.2, wood, root);
        box('crane beam', 2, 0.18, 0.18, 0.5, 2.55, 1.2, wood, root);
        box('crane rope', 0.04, 1.1, 0.04, -0.35, 2, 1.2, dark, root);
      } else if (b.kind === 'archery') {
        box('practice ground', 3.4, 0.08, 3.4, 0, 0.23, 0, soil, root);
        for (const x of [-1.1, 0, 1.1]) {
          box('target post', 0.12, 1.4, 0.12, x, 0.9, 0.9, wood, root);
          for (const [diameter, depth, mat] of [[0.8, 0.12, wall], [0.52, 0.15, accent], [0.2, 0.18, gold]] as const) {
            const target = MeshBuilder.CreateCylinder('archery target', { diameter, height: depth, tessellation: 16 }, scene);
            target.parent = root; target.position.set(x, 1.4, 0.8); target.rotation.x = Math.PI / 2; target.material = mat;
          }
        }
        box('equipment rack', 2.8, 0.15, 0.3, 0, 0.7, -1.3, wood, root);
        for (const x of [-1, 1]) box('rack legs', 0.15, 0.65, 0.2, x, 0.5, -1.3, wood, root);
      } else {
        const tower = b.kind === 'scout';
        const height = tower ? 2.4 : 1.35;
        const width = tower ? 1.6 : 2.7;
        box('building walls', width, height, 2.2, 0, 0.25 + height / 2, 0.35, b.kind === 'stone' ? rockMat : wall, root);
        box('colored roof', width + 0.4, 0.25, 2.6, 0, height + 0.4, 0.35, accent, root);
        box('roof ridge', width - 0.25, 0.35, 1.3, 0, height + 0.65, 0.35, accent, root);
        box('entrance', 0.65, 0.95, 0.08, 0, 0.75, -0.79, dark, root);
        for (const x of [-0.58, 0.58]) box('window', 0.28, 0.35, 0.09, x, tower ? 2.1 : 1.1, -0.8, gold, root);
        if (b.kind === 'stone') {
          for (let i = 0; i < 4; i++) box('stacked stone', 0.6, 0.35, 0.5, -1.1 + (i % 2) * 0.65, 0.43 + Math.floor(i / 2) * 0.35, -1.35, rockMat, root);
        } else if (b.kind === 'barracks') {
          for (const x of [-1.4, 1.4]) {
            box('standard pole', 0.08, 2, 0.08, x, 1.2, -1.2, wood, root);
            box('red standard', 0.5, 0.65, 0.06, x, 1.85, -1.2, accent, root);
          }
        } else if (b.kind === 'tavern') {
          box('chimney', 0.4, 1, 0.45, 0.85, 2.1, 0.9, rockMat, root);
          box('tavern sign', 0.65, 0.45, 0.12, 0.9, 1.15, -0.95, accent, root);
          box('outdoor table', 1.1, 0.15, 0.55, -0.7, 0.7, -1.35, wood, root);
          box('table support', 0.2, 0.5, 0.25, -0.7, 0.43, -1.35, wood, root);
        } else if (tower) {
          box('lookout mast', 0.08, 1.1, 0.08, 0, 3.35, 0.35, wood, root);
          box('scout pennant', 0.6, 0.35, 0.06, 0.25, 3.7, 0.35, accent, root);
        }
      }
    }
    root.getChildMeshes().forEach(mesh => { mesh.isPickable = true; mesh.metadata = { buildingId: b.id }; });
  }
  const generatedRoots: TransformNode[] = [];
  function saveWorld(objects: WorldObject[]) {
    try { localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(objects)); }
    catch { events.message('World saved for this session only; browser storage unavailable.'); }
  }
  function removeWorld() {
    generatedRoots.forEach(root => root.dispose());
    generatedRoots.length = 0;
  }
  function loadWorld(objects: WorldObject[]) {
    removeWorld(); objects.forEach(makeWorldObject); saveWorld(objects);
  }
  function makeWorldObject(object: WorldObject) {
    const root = new TransformNode(object.id, scene);
    root.position.set(object.x, 0, object.z);
    generatedRoots.push(root);
    box('world site', 4.2, 0.18, 4.2, 0, 0.02, 0, soil, root);
    if (object.kind === 'farm') {
      for (const x of [-1.3, 0, 1.3]) box('crop row', 0.65, 0.55, 3.4, x, 0.35, 0, crop, root);
    } else if (object.kind === 'lumber') {
      for (const x of [-1.1, 1.1]) {
        box('tree trunk', 0.4, 1.7, 0.4, x, 0.9, 0, wood, root);
        const tree = MeshBuilder.CreateCylinder('tree crown', { diameterBottom: 2, diameterTop: 0, height: 2.8, tessellation: 6 }, scene);
        tree.parent = root; tree.position.set(x, 2.4, 0); tree.material = roof;
      }
    } else if (object.kind === 'stone' || object.kind === 'boss') {
      const boss = object.kind === 'boss';
      const body = MeshBuilder.CreateSphere(boss ? 'chimera boss' : 'stone deposit', { diameter: 3, segments: 6 }, scene);
      body.parent = root; body.position.y = 1.3; body.material = boss ? accents.barracks : rockMat;
      if (boss) {
        for (const x of [-0.7, 0.7]) {
          box('boss eyes', 0.35, 0.35, 0.2, x, 1.6, -1.3, gold, root);
          const horn = MeshBuilder.CreateCylinder('boss horn', { diameterBottom: 0.6, diameterTop: 0, height: 1.2, tessellation: 5 }, scene);
          horn.parent = root; horn.position.set(x, 2.9, 0); horn.material = stone;
        }
      } else box('stone outcrop', 1.3, 0.85, 1.2, 1, 0.5, -1, rockMat, root);
    } else if (object.kind === 'oil') {
      const barrel = MeshBuilder.CreateCylinder('world oil barrel', { diameter: 2.5, height: 2.6, tessellation: 12 }, scene);
      barrel.parent = root; barrel.position.y = 1.35; barrel.material = oilPaint;
      box('oil marking', 0.75, 0.75, 0.1, 0, 1.4, -1.25, gold, root);
    } else {
      const garrison = object.kind === 'garrison';
      box('site building', 3, garrison ? 2.8 : 1.8, 2.6, 0, garrison ? 1.4 : 0.9, 0, garrison ? rockMat : wall, root);
      box('site roof', 3.7, 0.4, 3.3, 0, garrison ? 3 : 2, 0, garrison ? accents.barracks : roof, root);
      box('site door', 0.7, 1, 0.1, 0, 0.55, -1.35, dark, root);
      box('loot crate', 0.6, 0.6, 0.6, 1.5, 0.4, -1.5, gold, root);
    }
    const description = `${WORLD_DEFINITIONS[object.kind].name} ? Structure only${object.loot.apple ? ' ? Loot: 1 apple (unavailable)' : ' ? Gathering and combat unavailable'}`;
    root.getChildMeshes().forEach(mesh => { mesh.isPickable = true; mesh.metadata = { mapObject: description }; });
  }
  let buildings: Building[];
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    buildings = saved === null
      ? restoreBuildings(localStorage.getItem('axie-conquest-base-v1'), true)
      : restoreBuildings(saved);
  }
  catch { buildings = restoreBuildings(null); }
  const military = createMilitaryService(localStorage, CAPITAL_CITY_ID);
  events.troops(military.getTroops());
  buildings.forEach(makeBuilding); events.change([...buildings]);
  const gridRoot = new TransformNode('construction grid', scene);
  const tiles: ReturnType<typeof box>[] = [];
  for (let z = 0; z < GRID_DEPTH; z++) for (let x = 0; x < GRID_WIDTH; x++) {
    tiles.push(box('grid cell', 0.95, 0.012, 0.95, x - HALF_WIDTH + 0.5, 0.025, z - HALF_DEPTH + 0.5, freeMat, gridRoot));
  }
  const lines: Vector3[][] = [];
  for (let x = 0; x <= GRID_WIDTH; x++) lines.push([new Vector3(x - HALF_WIDTH, 0.04, -HALF_DEPTH), new Vector3(x - HALF_WIDTH, 0.04, HALF_DEPTH)]);
  for (let z = 0; z <= GRID_DEPTH; z++) lines.push([new Vector3(-HALF_WIDTH, 0.04, z - HALF_DEPTH), new Vector3(HALF_WIDTH, 0.04, z - HALF_DEPTH)]);
  const gridLines = MeshBuilder.CreateLineSystem('grid lines', { lines }, scene);
  gridLines.color = Color3.FromHexString('#c3dec0'); gridLines.alpha = 0.65; gridLines.isPickable = false;
  gridLines.parent = gridRoot; gridRoot.setEnabled(false);
  const previewRoot = new TransformNode('building preview', scene);
  const previewTiles: ReturnType<typeof box>[] = [];
  for (let z = 0; z < FOOTPRINT; z++) for (let x = 0; x < FOOTPRINT; x++) previewTiles.push(box('preview cell', 0.93, 0.07, 0.93, x + 0.5, 0.3, z + 0.5, validMat, previewRoot));
  previewRoot.setEnabled(false);
  // Draw the footprint over roofs as well as land so blocked placements remain visible.
  previewTiles.forEach(tile => { tile.renderingGroupId = 1; });
  let placing = false;
  let buildingKind: BuildingKind = 'farm';
  let candidate: Cell | null = null;
  let movingId: string | null = null;
  const validCandidate = (cell: Cell) => {
    if (movingId) return canMoveBuilding(movingId, cell, buildings);
    const size = getBuildingDimensions(buildingKind);
    return canPlace(cell, buildings, size.width, size.depth);
  };
  function refreshGrid() {
    tiles.forEach((tile, i) => {
      const x = i % GRID_WIDTH, z = Math.floor(i / GRID_WIDTH);
      tile.material = buildings.some(b => b.id !== movingId && x >= b.x && x < b.x + getBuildingFootprint(b.kind) && z >= b.z && z < b.z + getBuildingFootprint(b.kind)) ? usedMat : freeMat;
    });
  }
  function preview(cell: Cell) {
    candidate = cell; previewRoot.setEnabled(true); previewRoot.position.set(cell.x - HALF_WIDTH, 0, cell.z - HALF_DEPTH);
    const size = getBuildingDimensions(buildingKind, movingId ? buildings.find(b => b.id === movingId)?.rotation : 0);
    previewTiles.forEach((tile, index) => { const x = index % FOOTPRINT, z = Math.floor(index / FOOTPRINT); tile.setEnabled(x < size.width && z < size.depth); tile.material = validCandidate(cell) ? validMat : invalidMat; });
    events.preview({ ...cell });
  }
  function worldPoint(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    return scene.pick(clientX - rect.left, clientY - rect.top, mesh => mesh === picker)?.pickedPoint;
  }
  const pointers = new Map<number, { x: number; y: number; startX: number; startY: number }>();
  let moved = false;
  function zoom(factor: number) { camera.radius = Math.max(12, Math.min(85, camera.radius * factor)); updateOverview(); }
  function home() {
    const hall = buildings.find(b => b.kind === 'hall')!;
    camera.target.set(hall.x - HALF_WIDTH + FOOTPRINT / 2, 0, hall.z - HALF_DEPTH + FOOTPRINT / 2);
    camera.radius = 43;
    updateOverview();
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    if (!pointers.size) moved = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (pointers.size > 1) moved = true;
  }
  function move(e: PointerEvent) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const other = Array.from(pointers.entries()).find(([id]) => id !== e.pointerId)![1];
      const before = Math.hypot(p.x - other.x, p.y - other.y), after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (after > 0 && before > 0) zoom(before / after);
    } else {
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 7) moved = true;
      if (moved) {
        const previous = worldPoint(p.x, p.y), next = worldPoint(e.clientX, e.clientY);
        if (previous && next) {
          camera.target.addInPlace(previous.subtract(next));
          camera.target.x = Math.max(-WORLD_WIDTH / 2, Math.min(WORLD_WIDTH / 2, camera.target.x));
          camera.target.z = Math.max(-WORLD_DEPTH / 2, Math.min(WORLD_DEPTH / 2, camera.target.z));
        }
      }
    }
    p.x = e.clientX; p.y = e.clientY;
  }
  function up(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (e.type === 'pointercancel' || moved || pointers.size) return;
    const point = worldPoint(e.clientX, e.clientY);
    if (placing && point) {
      const size = getBuildingDimensions(buildingKind, movingId ? buildings.find(b => b.id === movingId)?.rotation : 0);
      preview({ x: Math.floor(point.x + HALF_WIDTH - size.width / 2), z: Math.floor(point.z + HALF_DEPTH - size.depth / 2) });
    }
    else {
      const rect = canvas.getBoundingClientRect();
      const hit = scene.pick(e.clientX - rect.left, e.clientY - rect.top, mesh => !!mesh.metadata?.buildingId || !!mesh.metadata?.mapObject);
      if (hit?.pickedMesh?.metadata?.mapObject === 'Everleaf Haven') {
        home();
        return;
      }
      const building = buildings.find(b => b.id === hit?.pickedMesh?.metadata?.buildingId);
      events.select(building || null);
      if (!building && hit?.pickedMesh?.metadata?.mapObject) events.message(hit.pickedMesh.metadata.mapObject);
    }
  }
  function wheel(e: WheelEvent) { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }
  function cancel() { movingId = null; placing = false; candidate = null; gridRoot.setEnabled(false); previewRoot.setEnabled(false); events.preview(null); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  const resize = () => engine.resize(); window.addEventListener('resize', resize);
  engine.runRenderLoop(() => { updateOverview(); scene.render(); });
  function persist(message: string) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(buildings)); events.message(message); }
    catch { events.message(`${message} Browser storage unavailable; progress lasts this session.`); }
  }
  return {
    regenerateWorld(settings) {
      const objects = generateWorld(settings);
      loadWorld(objects);
      return objects;
    },
    loadWorld,
    removeWorld,
    train(kind) {
      if (placing) return false;
      const result = military.train(kind, buildings);
      if (!result) return false;
      events.troops(result.troops);
      const message = getTrainingMessage(kind);
      events.message(result.persisted ? message : `${message} Browser storage unavailable; troops last this session.`);
      return true;
    },
    setGridVisible(visible) { refreshGrid(); gridRoot.setEnabled(!camera.radius || camera.radius < WORLD_OVERVIEW_RADIUS ? (visible || placing) : false); },
    setWorldView(enabled) {
      if (enabled) { cancel(); camera.target.set(0, 0, 0); camera.radius = 72; }
      else home();
      updateOverview();
    },
    begin(kind) { cancel(); buildingKind = kind; placing = true; gridRoot.setEnabled(true); refreshGrid(); const hall = buildings.find(b => b.kind === 'hall')!; preview({ x: hall.x + FOOTPRINT, z: hall.z }); },
    cancel,
    move(id) {
      const building = buildings.find(b => b.id === id);
      if (!building) return false;
      cancel(); movingId = id; buildingKind = building.kind; placing = true;
      gridRoot.setEnabled(true); refreshGrid(); preview({ x: building.x, z: building.z });
      events.select(null); return true;
    },
    rotate(id) {
      if (placing) return false;
      const next = rotateBuilding(id, buildings);
      if (!next) return false;
      buildings = next;
      const building = buildings.find(b => b.id === id)!;
      const root = buildingRoots.get(id);
      if (root) root.rotation.y = (building.rotation ?? 0) * Math.PI / 2;
      events.change([...buildings]); events.select(building);
      persist(`${BUILDING_DEFINITIONS[building.kind].name} rotated.`); return true;
    },
    remove(id) {
      if (placing) return false;
      const next = removeBuilding(id, buildings);
      if (!next) return false;
      const name = BUILDING_DEFINITIONS[buildings.find(b => b.id === id)!.kind].name;
      buildingRoots.get(id)?.dispose(); buildingRoots.delete(id);
      buildings = next; refreshGrid(); events.select(null); events.change([...buildings]);
      persist(`${name} removed.`); return true;
    },
    confirm() {
      if (!placing || !candidate || !validCandidate(candidate)) return false;
      const wasMoving = movingId !== null;
      let building: Building;
      if (movingId) {
        const next = moveBuilding(movingId, candidate, buildings);
        if (!next) return false;
        buildings = next; building = buildings.find(b => b.id === movingId)!;
        const size = getBuildingDimensions(building.kind, building.rotation);
        buildingRoots.get(movingId)?.position.set(building.x - HALF_WIDTH + size.width / 2, 0, building.z - HALF_DEPTH + size.depth / 2);
      } else {
        building = { ...candidate, kind: buildingKind, id: crypto.randomUUID() };
        buildings = [...buildings, building]; makeBuilding(building);
      }
      events.change([...buildings]);
      persist(`${BUILDING_DEFINITIONS[buildingKind].name} ${wasMoving ? 'moved' : 'established'}.`);
      cancel(); refreshGrid();
      if (wasMoving) events.select(building);
      return true;
    },
    zoom,
    home,
    dispose() {
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel); window.removeEventListener('resize', resize);
      scene.dispose(); engine.dispose();
    },
  };
}
