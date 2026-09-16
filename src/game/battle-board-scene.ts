import { ArcRotateCamera, Color3, Color4, DirectionalLight, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, Scene, Sprite, SpriteManager, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { createHexGridSlots, HEX_GRID_RADIUS } from './hex-grid';
import type { ApiAxie } from './axie-roster';
import { createBattleAppearanceResolver } from './axie/battle-appearance';
import { BabylonAxieInstance, BabylonAxieMixer } from './axie/babylon-mixer';
import type { Battle, Fighter } from './battle';
import { BattleRangeSettings } from './battle-range';
import { BATTLE_OVERLAYS, BattleOverlays } from './battle-debug';
import { AXIE_CLASSES, STARTER_HEROES } from './heroes';
import type { SandboxBattleEvent, SandboxBattleUnit } from './sandbox-battle';

export type BattleBoardLayout = { hexGap: number; teamGap: number; columns: number; rowsPerTeam: number };
export type SandboxTroopKind = 'soldier' | 'archer';
export type BattleBoardAssignment = { slotId: string; side: 'player' | 'enemy'; name: string; axie?: ApiAxie; mob?: 'chimera-pack'; troopKind?: SandboxTroopKind; quantity?: number };

type UnitRecord = {
  root: TransformNode;
  side: 'player' | 'enemy';
  avatar?: BabylonAxieInstance;
  fallbackMeshes: TransformNode[];
};

/** A fixed-isometric 3D hex-grid board scene used for Sandbox, live BattleArena skirmishes, and Mail replays. */
export function createBattleBoardScene(
  canvas: HTMLCanvasElement,
  initial: BattleBoardLayout,
  onReady: () => void = () => {},
  onSelect?: (id: string) => void,
  passive = false,
  onModelError: (message: string) => void = () => {}
) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine);
  scene.clearColor = Color4.FromHexString('#18382fff');

  const homeAlpha = Math.PI / 2, homeBeta = 0.72, homeRadius = 38;
  const camera = new ArcRotateCamera('battle board camera', homeAlpha, homeBeta, homeRadius, new Vector3(0, 0, 0), scene);
  camera.lowerAlphaLimit = camera.upperAlphaLimit = homeAlpha;
  camera.lowerBetaLimit = camera.upperBetaLimit = homeBeta;
  camera.lowerRadiusLimit = 15; camera.upperRadiusLimit = 75; camera.panningSensibility = 80; camera.wheelDeltaPercentage = 0.02; camera.minZ = 0.1;
  if (!passive) camera.attachControl(canvas, false, false);

  new HemisphericLight('lunacia sky', new Vector3(-0.3, 1, -0.2), scene).intensity = 0.95;
  const sun = new DirectionalLight('lunacia sun', new Vector3(0.35, -1, 0.25), scene); sun.position = new Vector3(-12, 22, -10); sun.intensity = 1.15;

  const ground = MeshBuilder.CreateGround('battlefield terrain', { width: 50, height: 54, subdivisions: 2 }, scene);
  const turf = new StandardMaterial('battlefield turf', scene); turf.diffuseColor = Color3.FromHexString('#527a48'); turf.specularColor = Color3.Black(); ground.material = turf; ground.isPickable = false;

  const playerFill = new StandardMaterial('player hex fill', scene); playerFill.diffuseColor = Color3.FromHexString('#397f72'); playerFill.emissiveColor = Color3.FromHexString('#075d55'); playerFill.alpha = 0.45;
  const enemyFill = new StandardMaterial('enemy hex fill', scene); enemyFill.diffuseColor = Color3.FromHexString('#985949'); enemyFill.emissiveColor = Color3.FromHexString('#703227'); enemyFill.alpha = 0.45;
  const neutralFill = new StandardMaterial('neutral hex fill', scene); neutralFill.diffuseColor = Color3.FromHexString('#727b79'); neutralFill.emissiveColor = Color3.FromHexString('#35413f'); neutralFill.alpha = 0.52;

  const modelAbort = new AbortController();
  const axieMixer = new BabylonAxieMixer(scene);
  const resolveAppearance = createBattleAppearanceResolver(modelAbort.signal);
  const errors: string[] = [];

  let board: TransformNode | null = null;
  const unitNodes = new Map<string, UnitRecord>();
  const healthBars = new Map<string, { background: Sprite; fill: Sprite }>();
  const healthSpritePath = '/assets/ui/health-bar-sprite.svg';
  const healthBackgrounds = new SpriteManager('sandbox health backgrounds', healthSpritePath, 128, 8, scene);
  const playerHealths = new SpriteManager('sandbox player health', healthSpritePath, 64, 8, scene);
  const enemyHealths = new SpriteManager('sandbox enemy health', healthSpritePath, 64, 8, scene);

  const projectileMaterial = new StandardMaterial('archer projectile', scene);
  projectileMaterial.diffuseColor = Color3.FromHexString('#ffd166');
  projectileMaterial.emissiveColor = Color3.FromHexString('#a86416');
  projectileMaterial.specularColor = Color3.Black();
  const projectiles: { mesh: ReturnType<typeof MeshBuilder.CreateSphere>; target: Vector3; speed: number }[] = [];

  const selectionMaterial = new StandardMaterial('selection ring mat', scene);
  selectionMaterial.diffuseColor = Color3.FromHexString('#ffe36c');
  selectionMaterial.emissiveColor = Color3.FromHexString('#ffe36c').scale(0.6);
  let selectionRingMesh: Mesh | null = null;
  const overlayMeshes: Mesh[] = [];

  let lastProcessedTick = -1;
  let battleReader: (() => { battle: Battle; selected: string | null; overlays?: BattleOverlays; all?: boolean }) | null = null;

  function healthSprite(name: string, manager: SpriteManager, color: Color4) {
    const sprite = new Sprite(name, manager);
    sprite.color = color; sprite.width = 1.9; sprite.height = 0.22; sprite.isPickable = false;
    return sprite;
  }

  function rangeCone(parent: TransformNode, x: number, z: number, facing: number, radius: number, angle: number, color: string, name: string) {
    const half = angle * Math.PI / 360;
    const points = [new Vector3(x, 0.2, z), ...Array.from({ length: 25 }, (_, index) => { const theta = facing - half + half * 2 * index / 24; return new Vector3(x + Math.sin(theta) * radius, 0.2, z + Math.cos(theta) * radius); }), new Vector3(x, 0.2, z)];
    const mesh = MeshBuilder.CreateLines(name, { points }, scene); mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
    return mesh;
  }

  function bodyRing(parent: TransformNode, x: number, z: number, radius: number, color = '#ffffff', name = 'body range') {
    const points = Array.from({ length: 33 }, (_, index) => { const theta = index * Math.PI * 2 / 32; return new Vector3(x + Math.sin(theta) * radius, 0.21, z + Math.cos(theta) * radius); });
    const mesh = MeshBuilder.CreateLines(name, { points }, scene); mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
    return mesh;
  }

  function ensureUnitNode(spec: {
    id: string;
    side: 'player' | 'enemy';
    name: string;
    x: number;
    z: number;
    facing: number;
    axie?: ApiAxie;
    heroId?: string;
    appearance?: ApiAxie;
    troopKind?: string;
    mob?: string;
  }): UnitRecord {
    const existing = unitNodes.get(spec.id);
    if (existing) return existing;

    const unit = new TransformNode(`${spec.side} ${spec.name}`, scene);
    if (board) unit.parent = board;
    unit.position.set(spec.x, 0.18, spec.z);
    unit.rotation.y = spec.facing;

    const healthBackground = healthSprite('board health bg', healthBackgrounds, Color4.FromHexString('#26332fff'));
    const healthFill = healthSprite('board health fill', spec.side === 'player' ? playerHealths : enemyHealths, Color4.FromHexString(spec.side === 'player' ? '#6be08bff' : '#e16d61ff'));
    healthBackground.position.set(spec.x, 2.15, spec.z);
    healthFill.position.set(spec.x, 2.15, spec.z);
    healthBars.set(spec.id, { background: healthBackground, fill: healthFill });

    const hero = STARTER_HEROES.find(h => h.id === spec.heroId);
    const color = hero ? AXIE_CLASSES[hero.class]?.color ?? '#83cbe0' : spec.side === 'player' ? '#83cbe0' : '#bb685b';
    const material = new StandardMaterial(`unit mat ${spec.id}`, scene);
    material.diffuseColor = Color3.FromHexString(color);
    material.emissiveColor = Color3.FromHexString(color).scale(0.18);
    material.specularColor = Color3.Black();

    const body = MeshBuilder.CreateSphere('unit body', { diameter: spec.side === 'player' ? 1.35 : 1.5, segments: 12 }, scene);
    body.parent = unit; body.position.y = 0.62; body.material = material; body.isPickable = false;
    const fallback: TransformNode[] = [body];

    const record: UnitRecord = { root: unit, side: spec.side, fallbackMeshes: fallback };
    unitNodes.set(spec.id, record);

    const axieAppearance = spec.appearance ?? spec.axie;
    if (axieAppearance || spec.heroId) {
      for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder('Axie ear', { height: 0.52, diameterBottom: 0.28, diameterTop: 0, tessellation: 6 }, scene);
        ear.parent = unit; ear.position.set(side * 0.32, 1.34, 0); ear.material = material; ear.isPickable = false;
        fallback.push(ear);
      }
      const horn = MeshBuilder.CreateCylinder('Axie horn', { height: 0.38, diameterBottom: 0.2, diameterTop: 0, tessellation: 6 }, scene);
      horn.parent = unit; horn.position.set(0, 1.42, 0.2); horn.rotation.x = Math.PI / 5; horn.material = material; horn.isPickable = false;
      fallback.push(horn);

      const resolvedFighter: Fighter = {
        id: spec.id, memberId: spec.id, side: spec.side, name: spec.name,
        heroId: spec.heroId ?? axieAppearance?.id, appearance: axieAppearance,
        initialCount: 1, hp: 1, maxHp: 1,
        stats: { health: 1, attack: 1, defense: 1, speed: 1, range: 1, interval: 1, radius: 0.5 },
        x: spec.x, z: spec.z, facing: spec.facing, cooldown: 0, targetId: null, state: 'holding',
      };

      void resolveAppearance(resolvedFighter).then(plan => axieMixer.create(plan)).then(avatar => {
        if (unit.isDisposed()) { avatar.dispose(); return; }
        avatar.root.parent = unit; avatar.root.position.y = -0.55; avatar.update('holding', 0);
        record.avatar = avatar;
        fallback.forEach(mesh => mesh.setEnabled(false));
      }).catch(err => {
        errors.push(`Axie #${spec.heroId ?? axieAppearance?.id}: ${err instanceof Error ? err.message : 'Model failed to load'}`);
      });
    } else if (spec.troopKind === 'archer') {
      const cap = MeshBuilder.CreateCylinder('archer cap', { height: 0.18, diameter: 0.78, tessellation: 12 }, scene); cap.parent = unit; cap.position.y = 1.22; cap.material = material; cap.isPickable = false;
      const bow = MeshBuilder.CreateTorus('archer bow', { diameter: 0.92, thickness: 0.07, tessellation: 16 }, scene); bow.parent = unit; bow.position.set(0.48, 0.72, 0); bow.rotation.x = Math.PI / 2; bow.material = material; bow.isPickable = false;
      fallback.push(cap, bow);
    } else if (spec.troopKind === 'soldier' || spec.troopKind === 'infantry') {
      const cap = MeshBuilder.CreateCylinder('soldier cap', { height: 0.18, diameter: 0.78, tessellation: 12 }, scene); cap.parent = unit; cap.position.y = 1.22; cap.material = material; cap.isPickable = false;
      const shield = MeshBuilder.CreateCylinder('soldier shield', { height: 0.12, diameter: 0.58, tessellation: 12 }, scene); shield.parent = unit; shield.position.set(0, 0.7, 0.62); shield.rotation.x = Math.PI / 2; shield.material = material; shield.isPickable = false;
      fallback.push(cap, shield);
    } else {
      for (const side of [-1, 1]) {
        const horn = MeshBuilder.CreateCylinder('Chimera horn', { height: 0.65, diameterBottom: 0.22, diameterTop: 0, tessellation: 6 }, scene);
        horn.parent = unit; horn.position.set(side * 0.38, 1.26, 0.05); horn.rotation.z = side * 0.55; horn.material = material; horn.isPickable = false;
        fallback.push(horn);
      }
    }

    return record;
  }

  function rebuild(layout: BattleBoardLayout, assignments: readonly BattleBoardAssignment[] = [], range?: BattleRangeSettings, showRange = false) {
    board?.dispose();
    board = new TransformNode('hex formation board', scene);
    unitNodes.clear();
    healthBars.forEach(bar => { bar.background.dispose(); bar.fill.dispose(); });
    healthBars.clear();

    const neutralRows = Math.round(layout.teamGap);
    const slots = createHexGridSlots({
      columns: layout.columns,
      hexGap: layout.hexGap * 0.22,
      bands: [
        { id: 'enemy', rows: layout.rowsPerTeam },
        { id: 'neutral', rows: neutralRows },
        { id: 'player', rows: layout.rowsPerTeam },
      ],
    });

    for (const slot of slots) {
      const fill = MeshBuilder.CreateCylinder('hex slot', { diameter: HEX_GRID_RADIUS * 1.93, height: 0.055, tessellation: 6 }, scene);
      fill.parent = board; fill.position.set(slot.x, 0.07, slot.z); fill.rotation.y = Math.PI / 6;
      fill.material = slot.band === 'player' ? playerFill : slot.band === 'enemy' ? enemyFill : neutralFill;
      fill.isPickable = false;

      const points = Array.from({ length: 7 }, (_, corner) => {
        const angle = Math.PI / 6 + corner * Math.PI / 3;
        return new Vector3(slot.x + Math.cos(angle) * HEX_GRID_RADIUS, 0.15, slot.z + Math.sin(angle) * HEX_GRID_RADIUS);
      });
      const edge = MeshBuilder.CreateLines('hex slot edge', { points }, scene);
      edge.parent = board;
      edge.color = Color3.FromHexString(slot.band === 'player' ? '#36f0d8' : slot.band === 'enemy' ? '#ff907d' : '#a7b0ae');
      edge.isPickable = false;

      const assignment = assignments.find(item => item.slotId === slot.id && item.side === slot.band);
      if (!assignment) continue;

      const facing = assignment.side === 'player' ? Math.PI : 0;
      const record = ensureUnitNode({
        id: slot.id,
        side: assignment.side,
        name: assignment.name,
        x: slot.x,
        z: slot.z,
        facing,
        axie: assignment.axie,
        mob: assignment.mob,
        troopKind: assignment.troopKind,
      });

      if (showRange && range) {
        const isArcher = assignment.troopKind === 'archer';
        bodyRing(record.root, 0, 0, range.bodyRadius);
        bodyRing(record.root, 0, 0, isArcher ? range.rangedAttackRange : range.meleeAttackRange, isArcher ? '#bd8cff' : '#6ee7ff', isArcher ? 'ranged attack range' : 'melee attack range');
        rangeCone(record.root, 0, 0, 0, range.level0Range, range.level0Angle, '#ff6262', 'level 1 rush cone');
        rangeCone(record.root, 0, 0, 0, range.level1DetectionRange, range.level1DetectionAngle, '#ffac46', 'level 0 detection cone');
      }
    }
  }

  rebuild(initial);

  function updateBattle(battle: Battle, selectedId?: string | null, overlays?: BattleOverlays, all = false) {
    overlayMeshes.forEach(mesh => mesh.dispose());
    overlayMeshes.length = 0;

    for (const fighter of battle.fighters) {
      // Align Battle coordinate convention (player: -Z, enemy: +Z) with
      // the Sandbox hex board convention (player: +Z south/bottom, enemy: -Z north/top).
      const bx = -fighter.x;
      const bz = -fighter.z;
      const bFacing = fighter.facing + Math.PI;

      const record = ensureUnitNode({
        id: fighter.id,
        side: fighter.side,
        name: fighter.name,
        x: bx,
        z: bz,
        facing: bFacing,
        heroId: fighter.heroId,
        appearance: fighter.appearance,
        troopKind: fighter.troopKind,
      });

      record.root.position.x = bx;
      record.root.position.z = bz;
      record.root.rotation.y = bFacing;
      record.avatar?.update(fighter.state, battle.tick / 10);

      const health = healthBars.get(fighter.id);
      const ratio = Math.max(0, Math.min(1, fighter.hp / fighter.maxHp));
      if (health) {
        health.background.position.set(bx, 2.15, bz);
        health.fill.position.set(bx - 0.95 * (1 - ratio), 2.15, bz);
        health.fill.width = 1.9 * ratio;
        health.background.isVisible = health.fill.isVisible = fighter.hp > 0;
      }
      record.root.setEnabled(fighter.hp > 0);

      if (fighter.id === selectedId && fighter.hp > 0) {
        if (!selectionRingMesh) {
          selectionRingMesh = MeshBuilder.CreateTorus('selected unit ring', { diameter: 2.2, thickness: 0.08, tessellation: 32 }, scene);
          selectionRingMesh.material = selectionMaterial;
          selectionRingMesh.isPickable = false;
        }
        selectionRingMesh.position.set(bx, 0.14, bz);
        selectionRingMesh.setEnabled(true);
      }

      if (overlays && fighter.hp > 0) {
        if (overlays.attack) {
          const ring = bodyRing(scene.activeCamera ? board ?? scene.rootNodes[0] as TransformNode : record.root, bx, bz, fighter.stats.radius + fighter.stats.range, BATTLE_OVERLAYS.attack.color);
          overlayMeshes.push(ring);
        }
        if (overlays.body) {
          const ring = bodyRing(scene.activeCamera ? board ?? scene.rootNodes[0] as TransformNode : record.root, bx, bz, fighter.stats.radius, BATTLE_OVERLAYS.body.color);
          overlayMeshes.push(ring);
        }
        if (overlays.facing) {
          const line = MeshBuilder.CreateLines('facing line', { points: [new Vector3(bx, 0.2, bz), new Vector3(bx + Math.sin(bFacing) * 2, 0.2, bz + Math.cos(bFacing) * 2)] }, scene);
          line.color = Color3.FromHexString(BATTLE_OVERLAYS.facing.color);
          overlayMeshes.push(line);
        }
        if (overlays.targets && fighter.targetId) {
          const target = battle.fighters.find(f => f.id === fighter.targetId);
          if (target && target.hp > 0) {
            const line = MeshBuilder.CreateLines('target line', { points: [new Vector3(bx, 0.25, bz), new Vector3(-target.x, 0.25, -target.z)] }, scene);
            line.color = Color3.FromHexString(BATTLE_OVERLAYS.targets.color);
            overlayMeshes.push(line);
          }
        }
      }
    }

    if (!selectedId && selectionRingMesh) selectionRingMesh.setEnabled(false);

    if (battle.tick !== lastProcessedTick) {
      lastProcessedTick = battle.tick;
      if (battle.events && battle.events.length) {
        for (const event of battle.events) {
          if (!event.projectileSpeed) continue;
          const from = battle.fighters.find(f => f.id === event.from);
          const to = battle.fighters.find(f => f.id === event.to);
          if (!from || !to) continue;
          const mesh = MeshBuilder.CreateSphere('archer arrow', { diameter: 0.18, segments: 6 }, scene);
          mesh.position.set(-from.x, 0.95, -from.z);
          mesh.material = projectileMaterial;
          mesh.isPickable = false;
          projectiles.push({ mesh, target: new Vector3(-to.x, 0.95, -to.z), speed: event.projectileSpeed });
        }
      }
    }
  }

  // Pointer selection
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureMoved = false;
  const pointerDown = (e: PointerEvent) => {
    if (!pointers.size) gestureMoved = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) gestureMoved = true;
  };
  const pointerMove = (e: PointerEvent) => {
    const start = pointers.get(e.pointerId);
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) gestureMoved = true;
  };
  const pointerUp = (e: PointerEvent) => {
    if (passive) return;
    const start = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (!start || pointers.size || gestureMoved || e.type === 'pointercancel') return;
    const rect = canvas.getBoundingClientRect();
    const candidates = Array.from(unitNodes.entries()).map(([id, record]) => {
      const point = Vector3.Project(
        record.root.position,
        Matrix.Identity(),
        scene.getTransformMatrix(),
        camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      );
      return {
        id,
        distance: Math.hypot(
          point.x * rect.width / engine.getRenderWidth() - (e.clientX - rect.left),
          point.y * rect.height / engine.getRenderHeight() - (e.clientY - rect.top)
        ),
      };
    }).sort((a, b) => a.distance - b.distance);

    if (candidates[0]?.distance <= 30 && onSelect) onSelect(candidates[0].id);
  };

  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  canvas.addEventListener('pointerup', pointerUp);
  canvas.addEventListener('pointercancel', pointerUp);

  const resize = () => engine.resize();
  window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  let ready = false;
  engine.runRenderLoop(() => {
    const elapsed = engine.getDeltaTime() / 1000;
    for (let index = projectiles.length - 1; index >= 0; index--) {
      const projectile = projectiles[index];
      const delta = projectile.target.subtract(projectile.mesh.position);
      const distance = delta.length();
      const step = projectile.speed * elapsed;
      if (distance <= step) {
        projectile.mesh.dispose();
        projectiles.splice(index, 1);
      } else {
        projectile.mesh.position.addInPlace(delta.scale(step / distance));
      }
    }

    if (battleReader) {
      const { battle, selected, overlays, all } = battleReader();
      if (battle) updateBattle(battle, selected, overlays, all);
    }

    scene.render();
    if (!ready && scene.isReady()) {
      ready = true;
      canvas.dataset.battleBoardReady = 'true';
      if (errors.length) onModelError(errors.join(' '));
      onReady();
    }
  });

  return {
    update: rebuild,
    updateBattle,
    bindBattleReader: (reader: () => { battle: Battle; selected: string | null; overlays?: BattleOverlays; all?: boolean }) => {
      battleReader = reader;
    },
    updateUnitPositions: (battleUnits: readonly SandboxBattleUnit[], events: readonly SandboxBattleEvent[] = []) => {
      battleUnits.forEach(battleUnit => {
        const record = unitNodes.get(battleUnit.id), health = healthBars.get(battleUnit.id);
        if (record) {
          record.root.position.x = battleUnit.x;
          record.root.position.z = battleUnit.z;
          record.root.rotation.y = battleUnit.facing;
          const ratio = Math.max(0, Math.min(1, battleUnit.hp / battleUnit.maxHp));
          if (health) {
            health.background.position.set(battleUnit.x, 2.15, battleUnit.z);
            health.fill.position.set(battleUnit.x - 0.95 * (1 - ratio), 2.15, battleUnit.z);
            health.fill.width = 1.9 * ratio;
            health.background.isVisible = health.fill.isVisible = battleUnit.hp > 0;
          }
          record.root.setEnabled(battleUnit.hp > 0);
        }
      });
      events.forEach(event => {
        if (!event.projectileSpeed) return;
        const from = battleUnits.find(unit => unit.id === event.from);
        const to = battleUnits.find(unit => unit.id === event.to);
        if (!from || !to) return;
        const mesh = MeshBuilder.CreateSphere('sandbox archer arrow', { diameter: 0.18, segments: 6 }, scene);
        mesh.position.set(from.x, 0.95, from.z);
        mesh.material = projectileMaterial;
        mesh.isPickable = false;
        projectiles.push({ mesh, target: new Vector3(to.x, 0.95, to.z), speed: event.projectileSpeed });
      });
    },
    zoom: (factor: number) => {
      camera.radius = Math.max(camera.lowerRadiusLimit!, Math.min(camera.upperRadiusLimit!, camera.radius * factor));
    },
    rotate: () => {},
    home: () => {
      camera.alpha = homeAlpha; camera.beta = homeBeta; camera.radius = homeRadius; camera.target.set(0, 0, 0);
    },
    isReady: () => ready && scene.isReady(),
    errors,
    dispose: () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', pointerDown);
      canvas.removeEventListener('pointermove', pointerMove);
      canvas.removeEventListener('pointerup', pointerUp);
      canvas.removeEventListener('pointercancel', pointerUp);
      modelAbort.abort();
      axieMixer.dispose();
      projectiles.forEach(p => p.mesh.dispose());
      selectionRingMesh?.dispose();
      overlayMeshes.forEach(mesh => mesh.dispose());
      healthBackgrounds.dispose();
      playerHealths.dispose();
      enemyHealths.dispose();
      board?.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
