import { fighterWorldPosition } from './battle-world';
import { createWorldFight } from './world-fight';
import type { BattleSession } from './battle-save';
import { WorldUnit } from './units';
import { showMarches } from './march-scene';
import { activeBattleSettings } from './battle-settings';
import { BATTLE_OVERLAYS } from './battle-debug';
import { TROOP_COMBAT_STATS } from './battle';
import { generateWorld, GenerationSettings, WorldObject, WORLD_DEFINITIONS, WORLD_SAVE_KEY, WORLD_WIDTH, WORLD_DEPTH } from './world';
import { ArcRotateCamera, Color3, Color4, DirectionalLight, DynamicTexture, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3, Viewport } from '@babylonjs/core';
import { BUILDING_DEFINITIONS, BuildableKind, BuildingKind, Building, Cell, FOOTPRINT, GRID_DEPTH, GRID_WIDTH, MAIN_HALL, canPlace, getBuildingDimensions, getBuildingFootprint, restoreBuildings, canMoveBuilding, moveBuilding, removeBuilding, rotateBuilding, Troops, TroopKind } from './base';
import { createMilitaryService, getTrainingMessage } from './military-service';
import { isBuildingMovable } from './building-config';
import { CAPITAL_CITY_ID } from './cities';
import { Coordinate, WorldTarget } from './routes';
import { getBossConfig } from './bosses';
import { BabylonMascotMixer, type BabylonMascotInstance, MASCOT_CONFIGS } from './mascot/mascot-mixer';
import { PortalSceneManager } from './portal-scene';
import type { PortalRuntimeState } from './portal';
import { TrainingQueue, secondsRemaining, jobProgress } from './training-queue';

type Events = { fighterSelect?: (id: string) => void; watchBattle?: (sessionId?: string) => void; troops: (troops: Troops) => void; change: (b: Building[]) => void; preview: (c: Cell | null) => void; select: (b: Building | null) => void; unitSelect: (id: string) => void; portalSelect?: (portalId: string) => void; target: (target: WorldTarget | null) => void; message: (s: string) => void; viewMode: (mode: 'base' | 'world') => void };
export type BaseView = { focusBattle: (targetSession?: BattleSession) => void; setBattle: (session: BattleSession | null, selectedId?: string | null) => void; setBattles: (sessions: readonly BattleSession[]) => void; setPortalState: (state: PortalRuntimeState | null, selectedId?: string | null) => void; refreshMilitary: () => void; setUnits: (orders: WorldUnit[], selectedId: string | null) => void; setSelectedTarget: (id: string | null) => void; focusCoordinate: (coordinate: Coordinate) => void; regenerateWorld: (settings: GenerationSettings) => WorldObject[]; loadWorld: (objects: WorldObject[]) => void; removeWorld: () => void; train: (kind: TroopKind) => boolean; rotate: (id: string) => boolean; move: (id: string) => boolean; remove: (id: string) => boolean; upgrade: (id: string, nextLevel: number) => boolean; begin: (kind: BuildableKind) => void; cancel: () => void; confirm: () => boolean; setGridVisible: (visible: boolean) => void; setWorldView: (enabled: boolean) => void; setRoute: (route: { origin: Coordinate; destination: Coordinate } | null) => void; zoom: (factor: number) => void; home: () => void; dispose: () => void;
  setTrainingQueue: (queue: TrainingQueue) => void;
  /** Project a building's world-space top-centre to canvas pixel coordinates. Returns null if the building or canvas is not available. */
  getScreenPosition: (buildingId: string) => { x: number; y: number } | null;
};
const SAVE_KEY = 'axie-conquest-base-v2';
const HALF_WIDTH = GRID_WIDTH / 2;
const HALF_DEPTH = GRID_DEPTH / 2;

export function createBase(canvas: HTMLCanvasElement, events: Events): BaseView {
  const engine = new Engine(canvas, true, { stencil: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  let clearMarches = () => {};
  let liveBattles: readonly BattleSession[] = [];
  const worldFight = createWorldFight(scene);
  let worldPinned = false;
  let marchOrders: WorldUnit[] | null = null, marchSelection: string | null = null;
  const mascotMixer = new BabylonMascotMixer(scene);
  const worldMascotAvatars = new Map<string, BabylonMascotInstance>();
  const portalScene = new PortalSceneManager(scene, {
    onSelectPortal: events.portalSelect,
    onSelectMarch: events.unitSelect,
  });
  let activePortalState: PortalRuntimeState | null = null;
  function setUnits(orders: WorldUnit[], selectedId: string | null) {
    marchSelection = selectedId;
    if (marchOrders === orders) return;
    const prev = marchOrders;
    marchOrders = orders;
    const sameStructure = prev && prev.length === orders.length && prev.every((u, i) => {
      const next = orders[i];
      return u.id === next.id && u.status === next.status &&
        u.order?.kind === next.order?.kind &&
        u.order?.destination?.x === next.order?.destination?.x &&
        u.order?.destination?.z === next.order?.destination?.z &&
        u.order?.arrivesAt === next.order?.arrivesAt &&
        u.members.length === next.members.length;
    });
    if (sameStructure) return;
    clearMarches(); clearMarches = showMarches(scene, () => marchOrders ?? orders, () => marchSelection, () => overviewActive);
  }
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
  const routeRoot = new TransformNode('march route', scene);
  let routeLine: ReturnType<typeof MeshBuilder.CreateLines> | null = null;
  const routeMarker = MeshBuilder.CreateCylinder('route destination', { diameter: 1.6, height: 0.12, tessellation: 24 }, scene);
  routeMarker.position.y = 0.12; routeMarker.isPickable = false; routeMarker.setEnabled(false);
  const routeMaterial = material('route glow', '#f5d36b');
  function setRoute(route: { origin: Coordinate; destination: Coordinate } | null) {
    routeLine?.dispose(); routeLine = null; routeMarker.setEnabled(!!route);
    if (!route) return;
    routeMarker.position.x = route.destination.x; routeMarker.position.z = route.destination.z;
    routeLine = MeshBuilder.CreateLines('march route line', { points: [new Vector3(route.origin.x, 0.16, route.origin.z), new Vector3(route.destination.x, 0.16, route.destination.z)] }, scene);
    routeLine.color = Color3.FromHexString('#f5d36b'); routeLine.alpha = 0.9; routeLine.parent = routeRoot;
  }
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
    const overview = worldPinned || camera.radius >= WORLD_OVERVIEW_RADIUS || Math.hypot(camera.target.x, camera.target.z) > 24;
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
  const worldObjectsById = new Map<string, WorldObject>();
  const worldCombatDebugs = new Map<string, TransformNode>();
  let selectedTargetId: string | null = null;
  let lastWorldBattleSettings: typeof activeBattleSettings | null = null;
  const targetRings = new Map<string, ReturnType<typeof MeshBuilder.CreateTorus>>();
  function worldBoundary(parent: TransformNode, x: number, z: number, radius: number, color: string) {
    const points = Array.from({ length: 97 }, (_, i) => new Vector3(x + Math.sin(i * Math.PI / 48) * radius, 0.24, z + Math.cos(i * Math.PI / 48) * radius));
    const mesh = MeshBuilder.CreateLines('world battle range', { points }, scene);
    mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
  }
  function refreshWorldCombatDebugs() {
    worldCombatDebugs.forEach(debug => debug.dispose()); worldCombatDebugs.clear();
    const { overlays, awarenessRadius, engagementRadius, attackRangeMultiplier, bodyRadiusMultiplier, showAll } = activeBattleSettings;
    if (!Object.values(overlays).some(Boolean)) return;
    worldObjectsById.forEach(object => {
      if (object.state !== 'defended' || !['boss', 'garrison', 'village'].includes(object.kind)) return;
      const root = generatedRoots.find(candidate => candidate.name === object.id);
      if (!root) return;
      const debug = new TransformNode('world enemy battle overlays', scene); debug.parent = root;
      if (overlays.awareness) worldBoundary(debug, 0, 0, awarenessRadius, BATTLE_OVERLAYS.awareness.color);
      if (overlays.engagement) worldBoundary(debug, 0, 0, engagementRadius, BATTLE_OVERLAYS.engagement.color);
      const positions = [{ x: -2, z: -1, kind: 'infantry' as const }, { x: 0, z: -1, kind: 'infantry' as const }, { x: 2, z: 2, kind: 'archer' as const }];
      positions.forEach(member => {
        const stats = TROOP_COMBAT_STATS[member.kind];
        const radius = stats.radius * bodyRadiusMultiplier;
        if (overlays.attack) worldBoundary(debug, member.x, member.z, radius + stats.range * attackRangeMultiplier, BATTLE_OVERLAYS.attack.color);
        if (overlays.body) worldBoundary(debug, member.x, member.z, radius, BATTLE_OVERLAYS.body.color);
        if (overlays.facing) {
          const facing = MeshBuilder.CreateLines('world enemy facing', { points: [new Vector3(member.x, 0.25, member.z), new Vector3(member.x, 0.25, member.z - 2)] }, scene);
          facing.parent = debug; facing.color = Color3.FromHexString(BATTLE_OVERLAYS.facing.color); facing.isPickable = false;
        }
      });
      debug.setEnabled(showAll || object.id === selectedTargetId);
      worldCombatDebugs.set(object.id, debug);
    });
  }
  function setSelectedTarget(id: string | null) { selectedTargetId = id; targetRings.forEach((ring, objectId) => ring.setEnabled(objectId === id)); worldCombatDebugs.forEach((debug, objectId) => debug.setEnabled(activeBattleSettings.showAll || objectId === id)); }
  function saveWorld(objects: WorldObject[]) {
    try { localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(objects)); }
    catch { events.message('World saved for this session only; browser storage unavailable.'); }
  }
  function removeWorld() {
    worldMascotAvatars.forEach(avatar => avatar.dispose());
    worldMascotAvatars.clear();
    generatedRoots.forEach(root => root.dispose());
    generatedRoots.length = 0;
    targetRings.clear(); worldObjectsById.clear(); worldCombatDebugs.clear();
  }
  function loadWorld(objects: WorldObject[]) {
    removeWorld(); objects.forEach(makeWorldObject); saveWorld(objects);
    refreshWorldCombatDebugs();
  }
  function makeWorldObject(object: WorldObject) {
    const root = new TransformNode(object.id, scene);
    root.position.set(object.x, 0, object.z);
    generatedRoots.push(root);
    worldObjectsById.set(object.id, object);
    box('world site', 4.2, 0.18, 4.2, 0, 0.02, 0, soil, root);
    const selection = MeshBuilder.CreateTorus('world object selection', { diameter: 5.5, thickness: 0.16, tessellation: 32 }, scene);
    selection.parent = root; selection.position.y = 0.25; selection.material = gold; selection.isPickable = false; selection.setEnabled(false); targetRings.set(object.id, selection);
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
      if (boss && object.bossId) {
        const bossConfig = getBossConfig(object.bossId);
        const mascotId = bossConfig?.leader.mascotId ?? (MASCOT_CONFIGS[object.bossId] ? object.bossId : 'kotaro');
        const fallback = MeshBuilder.CreateSphere('chimera boss fallback', { diameter: 2.6, segments: 6 }, scene);
        fallback.parent = root; fallback.position.y = 1.3; fallback.material = accents.barracks;
        const horns: TransformNode[] = [];
        for (const x of [-0.6, 0.6]) {
          horns.push(box('boss eyes', 0.3, 0.3, 0.2, x, 1.5, -1.1, gold, root));
          const horn = MeshBuilder.CreateCylinder('boss horn', { diameterBottom: 0.5, diameterTop: 0, height: 1.0, tessellation: 5 }, scene);
          horn.parent = root; horn.position.set(x, 2.7, 0); horn.material = stone;
          horns.push(horn);
        }

        mascotMixer.create(mascotId).then(avatar => {
          if (root.isDisposed()) { avatar.dispose(); return; }
          avatar.root.parent = root;
          avatar.root.position.y = 0.08;
          avatar.root.rotation.y = Math.PI / 4;
          avatar.root.scaling.setAll(1.4);
          avatar.update('holding', 0);
          worldMascotAvatars.set(object.id, avatar);

          fallback.dispose();
          horns.forEach(h => h.dispose());

          const targetLabel = object.bossName ?? WORLD_DEFINITIONS[object.kind].name;
          const mapObjectDesc = `${targetLabel}: ${object.state}${object.state === 'defended' ? ' - Attack to battle the defenders' : ' - Gathering and loot collection unavailable'}`;
          avatar.root.getChildMeshes().forEach(mesh => {
            mesh.isPickable = true;
            mesh.metadata = {
              mapObject: mapObjectDesc,
              worldTarget: { x: object.x, z: object.z, id: object.id, label: targetLabel }
            };
          });
        }).catch(err => {
          console.warn('[scene] Failed to load boss mascot model:', err);
        });
      } else {
        const body = MeshBuilder.CreateSphere(boss ? 'chimera boss' : 'stone deposit', { diameter: 3, segments: 6 }, scene);
        body.parent = root; body.position.y = 1.3; body.material = boss ? accents.barracks : rockMat;
        if (boss) {
          for (const x of [-0.7, 0.7]) {
            box('boss eyes', 0.35, 0.35, 0.2, x, 1.6, -1.3, gold, root);
            const horn = MeshBuilder.CreateCylinder('boss horn', { diameterBottom: 0.6, diameterTop: 0, height: 1.2, tessellation: 5 }, scene);
            horn.parent = root; horn.position.set(x, 2.9, 0); horn.material = stone;
          }
        } else box('stone outcrop', 1.3, 0.85, 1.2, 1, 0.5, -1, rockMat, root);
      }
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
    const label = object.bossName ?? WORLD_DEFINITIONS[object.kind].name;
    const isResource = ['farm', 'lumber', 'stone', 'oil'].includes(object.kind);
    let description: string;
    if (isResource) {
      if (object.currentCapacity !== undefined && object.currentCapacity <= 0) {
        description = `${label}: Depleted · Respawns soon`;
      } else {
        const cap = object.currentCapacity !== undefined ? Math.round(object.currentCapacity) : (object.maxCapacity ?? 500);
        const max = object.maxCapacity ?? 500;
        description = `${label}: ${cap} / ${max} available to gather`;
      }
    } else {
      description = `${label}: ${object.state}${object.state === 'defended' ? ' - Attack to battle the defenders' : ''}`;
    }
    root.getChildMeshes().forEach(mesh => { mesh.isPickable = true; mesh.metadata = { mapObject: description, worldTarget: { x: object.x, z: object.z, id: object.id, label } }; });
  }
  let buildings: Building[];
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    buildings = saved === null
      ? restoreBuildings(localStorage.getItem('axie-conquest-base-v1'), true)
      : restoreBuildings(saved);
  }
  catch { buildings = restoreBuildings(null); }
  let military = createMilitaryService(localStorage, CAPITAL_CITY_ID);
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
    worldPinned = false;
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
      const hit = scene.pick(e.clientX - rect.left, e.clientY - rect.top, mesh => mesh.isEnabled(true) && mesh.isVisible && mesh.isPickable && (!!mesh.metadata?.fighterId || !!mesh.metadata?.buildingId || !!mesh.metadata?.mapObject || !!mesh.metadata?.unitId || !!mesh.metadata?.portalId || (mesh.metadata?.action === 'watchBattle' && liveBattles.length > 0)));
      if (hit?.pickedMesh?.metadata?.action === 'watchBattle' && liveBattles.length > 0) {
        events.watchBattle?.(hit.pickedMesh.metadata.sessionId);
        return;
      }
      if (typeof hit?.pickedMesh?.metadata?.portalId === 'string') {
        events.portalSelect?.(hit.pickedMesh.metadata.portalId);
        return;
      }
      if (typeof hit?.pickedMesh?.metadata?.fighterId === 'string') { events.fighterSelect?.(hit.pickedMesh.metadata.fighterId); return; }
      if (typeof hit?.pickedMesh?.metadata?.unitId === 'string') {
        events.unitSelect(hit.pickedMesh.metadata.unitId);
        return;
      }
      if (hit?.pickedMesh?.metadata?.mapObject === 'Everleaf Haven') {
        home();
        return;
      }
      if (overviewActive && point) {
        const target = hit?.pickedMesh?.metadata?.worldTarget ?? { x: point.x, z: point.z };
        events.target(target);
        return;
      }
      const building = buildings.find(b => b.id === hit?.pickedMesh?.metadata?.buildingId);
      events.select(building || null);
      if (!building && hit?.pickedMesh?.metadata?.mapObject) events.message(hit.pickedMesh.metadata.mapObject);
    }
  }
  function wheel(e: WheelEvent) { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }
  function cancel() { movingId = null; placing = false; candidate = null; gridRoot.setEnabled(false); previewRoot.setEnabled(false); setRoute(null); events.preview(null); events.target(null); }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  type TrainingBillboard = {
    buildingId: string;
    plane: Mesh;
    texture: DynamicTexture;
    material: StandardMaterial;
    lastSecs: number;
    lastProgress: number;
  };
  const trainingBillboards = new Map<string, TrainingBillboard>();
  let activeTrainingQueue: TrainingQueue = new Map();

  function updateTrainingBillboards(queue: TrainingQueue) {
    if (typeof document === 'undefined') return;
    const now = Date.now();

    // Clean up billboards for buildings that are no longer training or whose roots are gone
    Array.from(trainingBillboards.entries()).forEach(([bId, bb]) => {
      if (!queue.has(bId) || !buildingRoots.has(bId)) {
        bb.plane.dispose();
        bb.texture.dispose();
        bb.material.dispose();
        trainingBillboards.delete(bId);
      }
    });

    // Update or create billboards for active jobs
    Array.from(queue.entries()).forEach(([bId, job]) => {
      const root = buildingRoots.get(bId);
      if (!root) return;

      let bb = trainingBillboards.get(bId);
      if (!bb) {
        const plane = MeshBuilder.CreatePlane(`training-bb-${bId}`, { width: 2.2, height: 2.2 }, scene);
        plane.parent = root;
        plane.position.set(0, 3.8, 0);
        plane.billboardMode = Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = true;
        plane.metadata = { buildingId: bId, kind: 'training-billboard' };

        const texture = new DynamicTexture(`training-tex-${bId}`, { width: 128, height: 128 }, scene, false);
        texture.hasAlpha = true;

        const mat = new StandardMaterial(`training-mat-${bId}`, scene);
        mat.diffuseTexture = texture;
        mat.emissiveColor = Color3.White();
        mat.specularColor = Color3.Black();
        mat.useAlphaFromDiffuseTexture = true;
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        plane.material = mat;

        bb = {
          buildingId: bId,
          plane,
          texture,
          material: mat,
          lastSecs: -1,
          lastProgress: -1,
        };
        trainingBillboards.set(bId, bb);
      }

      const secs = secondsRemaining(job, now);
      const progress = jobProgress(job, now);

      if (secs !== bb.lastSecs || Math.abs(progress - bb.lastProgress) > 0.02) {
        bb.lastSecs = secs;
        bb.lastProgress = progress;

        const ctx = bb.texture.getContext() as unknown as CanvasRenderingContext2D;
        if (ctx && typeof ctx.clearRect === 'function') {
          ctx.clearRect(0, 0, 128, 128);

          const cx = 64;
          const cy = 64;
          const r = 50;

          // Shadow / dark disc
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 26, 20, 0.90)';
          ctx.fill();

          // Outer thin ring
          ctx.lineWidth = 3;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
          ctx.stroke();

          // Progress Arc
          const startAngle = -Math.PI / 2;
          const endAngle = startAngle + (Math.PI * 2 * Math.min(1, Math.max(0, progress)));
          ctx.beginPath();
          ctx.arc(cx, cy, r, startAngle, endAngle, false);
          ctx.lineWidth = 7;
          ctx.strokeStyle = '#4cf09a';
          ctx.lineCap = 'round';
          ctx.stroke();

          // Icon
          const icon = job.kind === 'archer' ? '🏹' : '⚔️';
          ctx.font = '28px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(icon, cx, cy - 14);

          // Timer label
          const label = secs >= 60 ? `${Math.ceil(secs / 60)}m` : `${secs}s`;
          ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
          ctx.fillStyle = '#d6ffe2';
          ctx.fillText(label, cx, cy + 22);

          bb.texture.update();
        }
      }
    });
  }

  const resize = () => engine.resize(); window.addEventListener('resize', resize);
  engine.runRenderLoop(() => {
    if (lastWorldBattleSettings !== activeBattleSettings) {
      lastWorldBattleSettings = activeBattleSettings;
      refreshWorldCombatDebugs();
    }
    updateOverview();
    worldFight.update(liveBattles, overviewActive);
    if (activePortalState) {
      portalScene.update(activePortalState);
    }
    if (activeTrainingQueue.size > 0 && !overviewActive) {
      updateTrainingBillboards(activeTrainingQueue);
    }
    scene.render();
  });
  function persist(message: string) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(buildings)); events.message(message); }
    catch { events.message(`${message} Browser storage unavailable; progress lasts this session.`); }
  }
  return {
    refreshMilitary() { military = createMilitaryService(localStorage, CAPITAL_CITY_ID); events.troops(military.getTroops()); },
    setTrainingQueue(queue: TrainingQueue) {
      activeTrainingQueue = queue;
      updateTrainingBillboards(activeTrainingQueue);
    },
    getScreenPosition(buildingId: string) {
      const root = buildingRoots.get(buildingId);
      if (!root) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      // Project the top-centre of the building (y = 3.5 to clear the tallest roofline)
      const worldPos = root.getAbsolutePosition().add(new Vector3(0, 3.5, 0));
      const viewport = new Viewport(0, 0, rect.width, rect.height);
      const screenPos = Vector3.Project(worldPos, Matrix.Identity(), scene.getTransformMatrix(), viewport);
      if (screenPos.z < 0 || screenPos.z > 1) return null; // behind camera
      return { x: rect.left + screenPos.x, y: rect.top + screenPos.y };
    },
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
      worldPinned = enabled;
      if (enabled) { cancel(); camera.target.set(0, 0, 0); camera.radius = 72; }
      else home();
      updateOverview();
    },
    setRoute,
    focusBattle(targetSession?: BattleSession) {
      const active = targetSession || liveBattles[0];
      if (!active) return;
      worldPinned = true;
      const center = fighterWorldPosition(active, { x: 0, z: 0 });
      camera.target.set(center.x, -5, center.z);
      camera.radius = Math.min(85, Math.max(48, 40 / engine.getAspectRatio(camera)));
      updateOverview();
    },
    setBattle(session) {
      liveBattles = session ? [session] : [];
      worldFight.update(liveBattles, overviewActive);
    },
    setBattles(sessions) {
      liveBattles = sessions;
      worldFight.update(liveBattles, overviewActive);
    },
    setPortalState(state, selectedId) {
      activePortalState = state;
      if (selectedId !== undefined) {
        portalScene.setSelectedId(selectedId);
      }
      if (state) {
        portalScene.update(state);
      }
    },
    setUnits,
    setSelectedTarget,
    focusCoordinate(coordinate) {
      camera.target.set(coordinate.x, 0, coordinate.z);
      camera.radius = Math.min(camera.radius, 48);
      updateOverview();
    },
    begin(kind) { cancel(); buildingKind = kind; placing = true; gridRoot.setEnabled(true); refreshGrid(); const hall = buildings.find(b => b.kind === 'hall')!; preview({ x: hall.x + FOOTPRINT, z: hall.z }); },
    cancel,
    move(id) {
      const building = buildings.find(b => b.id === id);
      if (!building || !isBuildingMovable(building.kind)) return false;
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
    upgrade(id, nextLevel) {
      const target = buildings.find(b => b.id === id);
      if (!target) return false;
      target.level = nextLevel;
      events.change([...buildings]);
      events.select({ ...target });
      persist(`${BUILDING_DEFINITIONS[target.kind]?.name || 'Building'} upgraded to Level ${nextLevel}.`);
      return true;
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
      worldMascotAvatars.forEach(avatar => avatar.dispose());
      worldMascotAvatars.clear();
      trainingBillboards.forEach(bb => {
        bb.plane.dispose();
        bb.texture.dispose();
        bb.material.dispose();
      });
      trainingBillboards.clear();
      worldFight.dispose(); portalScene.dispose(); clearMarches(); scene.dispose(); engine.dispose();
    },
  };
}
