import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, MeshBuilder, Scene, Sprite, SpriteManager, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { createHexGridSlots, HEX_GRID_RADIUS } from './hex-grid';
import type { ApiAxie } from './axie-roster';
import { createBattleAppearanceResolver } from './axie/battle-appearance';
import { BabylonAxieMixer } from './axie/babylon-mixer';
import type { Fighter } from './battle';
import { BattleRangeSettings } from './battle-range';
import type { SandboxBattleEvent, SandboxBattleUnit } from './sandbox-battle';

export type BattleBoardLayout = { hexGap: number; teamGap: number; columns: number; rowsPerTeam: number };
export type SandboxTroopKind = 'soldier' | 'archer';
export type BattleBoardAssignment = { slotId: string; side: 'player' | 'enemy'; name: string; axie?: ApiAxie; mob?: 'chimera-pack'; troopKind?: SandboxTroopKind; quantity?: number };


/** A fixed-isometric 3D terrain board. The formation slots are thin meshes resting over the ground. */
export function createBattleBoardScene(canvas: HTMLCanvasElement, initial: BattleBoardLayout, onReady: () => void = () => {}) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#18382fff');
  // View the fixed north/south board from the player's south edge, without
  // changing its shared coordinates or team-band semantics.
  const homeAlpha = Math.PI / 2, homeBeta = .72, homeRadius = 38;
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
  const modelAbort = new AbortController();
  const axieMixer = new BabylonAxieMixer(scene);
  const resolveAppearance = createBattleAppearanceResolver(modelAbort.signal);
  let board: TransformNode | null = null;
  const units = new Map<string, TransformNode>();
  const healthBars = new Map<string, { background: Sprite; fill: Sprite }>();
  const healthSpritePath = '/assets/ui/health-bar-sprite.svg';
  const healthBackgrounds = new SpriteManager('sandbox health backgrounds', healthSpritePath, 128, 8, scene);
  const playerHealths = new SpriteManager('sandbox player health', healthSpritePath, 64, 8, scene);
  const enemyHealths = new SpriteManager('sandbox enemy health', healthSpritePath, 64, 8, scene);
  const projectileMaterial = new StandardMaterial('sandbox archer projectile', scene); projectileMaterial.diffuseColor = Color3.FromHexString('#ffd166'); projectileMaterial.emissiveColor = Color3.FromHexString('#a86416'); projectileMaterial.specularColor = Color3.Black();
  const projectiles: { mesh: ReturnType<typeof MeshBuilder.CreateSphere>; target: Vector3; speed: number }[] = [];
  function healthSprite(name: string, manager: SpriteManager, color: Color4) { const sprite = new Sprite(name, manager); sprite.color = color; sprite.width = 1.9; sprite.height = .22; sprite.isPickable = false; return sprite; }
  function rangeCone(parent: TransformNode, x: number, z: number, facing: number, radius: number, angle: number, color: string, name: string) {
    const half = angle * Math.PI / 360;
    const points = [new Vector3(x, .2, z), ...Array.from({ length: 25 }, (_, index) => { const theta = facing - half + half * 2 * index / 24; return new Vector3(x + Math.sin(theta) * radius, .2, z + Math.cos(theta) * radius); }), new Vector3(x, .2, z)];
    const mesh = MeshBuilder.CreateLines(name, { points }, scene); mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
  }
  function bodyRing(parent: TransformNode, x: number, z: number, radius: number, color = '#ffffff', name = 'body range') {
    const points = Array.from({ length: 33 }, (_, index) => { const theta = index * Math.PI * 2 / 32; return new Vector3(x + Math.sin(theta) * radius, .21, z + Math.cos(theta) * radius); });
    const mesh = MeshBuilder.CreateLines(name, { points }, scene); mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
  }
  function rebuild(layout: BattleBoardLayout, assignments: readonly BattleBoardAssignment[] = [], range?: BattleRangeSettings, showRange = false) {
    board?.dispose(); board = new TransformNode('hex formation board', scene); units.clear(); healthBars.forEach(bar => { bar.background.dispose(); bar.fill.dispose(); }); healthBars.clear();
    const neutralRows = Math.round(layout.teamGap);
    const slots = createHexGridSlots({ columns: layout.columns, hexGap: layout.hexGap * .22, bands: [{ id: 'enemy', rows: layout.rowsPerTeam }, { id: 'neutral', rows: neutralRows }, { id: 'player', rows: layout.rowsPerTeam }] });
    for (const slot of slots) {
      const fill = MeshBuilder.CreateCylinder('hex slot', { diameter: HEX_GRID_RADIUS * 1.93, height: .055, tessellation: 6 }, scene);
      fill.parent = board; fill.position.set(slot.x, .07, slot.z); fill.rotation.y = Math.PI / 6; fill.material = slot.band === 'player' ? playerFill : slot.band === 'enemy' ? enemyFill : neutralFill; fill.isPickable = false;
      const points = Array.from({ length: 7 }, (_, corner) => { const angle = Math.PI / 6 + corner * Math.PI / 3; return new Vector3(slot.x + Math.cos(angle) * HEX_GRID_RADIUS, .15, slot.z + Math.sin(angle) * HEX_GRID_RADIUS); });
      const edge = MeshBuilder.CreateLines('hex slot edge', { points }, scene);
      edge.parent = board; edge.color = Color3.FromHexString(slot.band === 'player' ? '#36f0d8' : slot.band === 'enemy' ? '#ff907d' : '#a7b0ae'); edge.isPickable = false;
      const assignment = assignments.find(item => item.slotId === slot.id && item.side === slot.band);
      if (!assignment) continue;
      const unit = new TransformNode(`${assignment.side} ${assignment.name}`, scene); unit.parent = board; unit.position.set(slot.x, .18, slot.z);
      units.set(slot.id, unit);
      const healthBackground = healthSprite('sandbox health background', healthBackgrounds, Color4.FromHexString('#26332fff'));
      const healthFill = healthSprite('sandbox health fill', assignment.side === 'player' ? playerHealths : enemyHealths, Color4.FromHexString(assignment.side === 'player' ? '#6be08bff' : '#e16d61ff'));
      healthBackground.position.set(slot.x, 2.15, slot.z); healthFill.position.set(slot.x, 2.15, slot.z); healthBars.set(slot.id, { background: healthBackground, fill: healthFill });
      // Sandbox rows grow from enemy (-Z) to player (+Z); both sides face the
      // opposing formation while the camera remains a presentation concern.
      const facing = assignment.side === 'player' ? Math.PI : 0;
      unit.rotation.y = facing;
      if (showRange && range) { const isArcher = assignment.troopKind === 'archer'; bodyRing(unit, 0, 0, range.bodyRadius); bodyRing(unit, 0, 0, isArcher ? range.rangedAttackRange : range.meleeAttackRange, isArcher ? '#bd8cff' : '#6ee7ff', isArcher ? 'ranged attack range' : 'melee attack range'); rangeCone(unit, 0, 0, 0, range.level0Range, range.level0Angle, '#ff6262', 'level 1 rush cone'); rangeCone(unit, 0, 0, 0, range.level1DetectionRange, range.level1DetectionAngle, '#ffac46', 'level 0 detection cone'); }
      const color = assignment.side === 'player' ? '#83cbe0' : '#bb685b';
      const material = new StandardMaterial(`sandbox unit ${slot.id}`, scene); material.diffuseColor = Color3.FromHexString(color); material.emissiveColor = Color3.FromHexString(color).scale(.18); material.specularColor = Color3.Black();
      const body = MeshBuilder.CreateSphere('sandbox unit body', { diameter: assignment.side === 'player' ? 1.35 : 1.5, segments: 12 }, scene); body.parent = unit; body.position.y = .62; body.material = material; body.isPickable = false;
      const fallback: TransformNode[] = [body];
      if (assignment.axie) {
        for (const side of [-1, 1]) { const ear = MeshBuilder.CreateCylinder('sandbox Axie ear', { height: .52, diameterBottom: .28, diameterTop: 0, tessellation: 6 }, scene); ear.parent = unit; ear.position.set(side * .32, 1.34, 0); ear.material = material; ear.isPickable = false; fallback.push(ear); }
        const horn = MeshBuilder.CreateCylinder('sandbox Axie horn', { height: .38, diameterBottom: .2, diameterTop: 0, tessellation: 6 }, scene); horn.parent = unit; horn.position.set(0, 1.42, .2); horn.rotation.x = Math.PI / 5; horn.material = material; horn.isPickable = false; fallback.push(horn);
        void resolveAppearance({ id: `sandbox:${assignment.axie.id}`, memberId: assignment.axie.id, side: assignment.side, name: assignment.axie.name, heroId: assignment.axie.id, appearance: assignment.axie, initialCount: 1, hp: 1, maxHp: 1, stats: { health: 1, attack: 1, defense: 1, speed: 1, range: 1, interval: 1, radius: .5 }, x: slot.x, z: slot.z, facing, cooldown: 0, targetId: null, state: 'holding' } satisfies Fighter).then(plan => axieMixer.create(plan)).then(avatar => {
          if (unit.isDisposed()) { avatar.dispose(); return; }
          avatar.root.parent = unit; avatar.root.position.y = -.55; avatar.update('holding', 0); fallback.forEach(mesh => mesh.setEnabled(false));
        }).catch(() => { /* Keep the readable local fallback if assets are unavailable. */ });
      } else if (assignment.troopKind) {
        const cap = MeshBuilder.CreateCylinder('sandbox troop cap', { height: .18, diameter: .78, tessellation: 12 }, scene); cap.parent = unit; cap.position.y = 1.22; cap.material = material; cap.isPickable = false;
        if (assignment.troopKind === 'archer') { const bow = MeshBuilder.CreateTorus('sandbox archer bow', { diameter: .92, thickness: .07, tessellation: 16 }, scene); bow.parent = unit; bow.position.set(.48, .72, 0); bow.rotation.x = Math.PI / 2; bow.material = material; bow.isPickable = false; }
        else { const shield = MeshBuilder.CreateCylinder('sandbox soldier shield', { height: .12, diameter: .58, tessellation: 12 }, scene); shield.parent = unit; shield.position.set(0, .7, .62); shield.rotation.x = Math.PI / 2; shield.material = material; shield.isPickable = false; }
      } else {
        for (const side of [-1, 1]) { const horn = MeshBuilder.CreateCylinder('sandbox Chimera horn', { height: .65, diameterBottom: .22, diameterTop: 0, tessellation: 6 }, scene); horn.parent = unit; horn.position.set(side * .38, 1.26, .05); horn.rotation.z = side * .55; horn.material = material; horn.isPickable = false; }
      }
    }
  }
  rebuild(initial);
  const resize = () => engine.resize(); window.addEventListener('resize', resize); const observer = new ResizeObserver(resize); observer.observe(canvas);
  let ready = false;
  engine.runRenderLoop(() => { const elapsed = engine.getDeltaTime() / 1000; for (let index = projectiles.length - 1; index >= 0; index--) { const projectile = projectiles[index], delta = projectile.target.subtract(projectile.mesh.position), distance = delta.length(), step = projectile.speed * elapsed; if (distance <= step) { projectile.mesh.dispose(); projectiles.splice(index, 1); } else projectile.mesh.position.addInPlace(delta.scale(step / distance)); } scene.render(); if (!ready && scene.isReady()) { ready = true; canvas.dataset.battleBoardReady = 'true'; onReady(); } });
  return {
    update: rebuild,
    updateUnitPositions: (battleUnits: readonly SandboxBattleUnit[], events: readonly SandboxBattleEvent[] = []) => { battleUnits.forEach(battleUnit => { const unit = units.get(battleUnit.id), health = healthBars.get(battleUnit.id); if (unit) { unit.position.x = battleUnit.x; unit.position.z = battleUnit.z; unit.rotation.y = battleUnit.facing; const ratio = Math.max(0, Math.min(1, battleUnit.hp / battleUnit.maxHp)); if (health) { health.background.position.set(battleUnit.x, 2.15, battleUnit.z); health.fill.position.set(battleUnit.x - .95 * (1 - ratio), 2.15, battleUnit.z); health.fill.width = 1.9 * ratio; health.background.isVisible = health.fill.isVisible = battleUnit.hp > 0; } unit.setEnabled(battleUnit.hp > 0); } }); events.forEach(event => { if (!event.projectileSpeed) return; const from = battleUnits.find(unit => unit.id === event.from), to = battleUnits.find(unit => unit.id === event.to); if (!from || !to) return; const mesh = MeshBuilder.CreateSphere('sandbox archer arrow', { diameter: .18, segments: 6 }, scene); mesh.position.set(from.x, .95, from.z); mesh.material = projectileMaterial; mesh.isPickable = false; projectiles.push({ mesh, target: new Vector3(to.x, .95, to.z), speed: event.projectileSpeed }); }); },
    zoom: (factor: number) => { camera.radius = Math.max(camera.lowerRadiusLimit!, Math.min(camera.upperRadiusLimit!, camera.radius * factor)); },
    home: () => { camera.alpha = homeAlpha; camera.beta = homeBeta; camera.radius = homeRadius; camera.target.set(0, 0, 0); },
    dispose: () => { observer.disconnect(); window.removeEventListener('resize', resize); modelAbort.abort(); axieMixer.dispose(); projectiles.forEach(projectile => projectile.mesh.dispose()); healthBackgrounds.dispose(); playerHealths.dispose(); enemyHealths.dispose(); board?.dispose(); scene.dispose(); engine.dispose(); },
  };
}
