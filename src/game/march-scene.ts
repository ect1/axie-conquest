import { Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3, LinesMesh, Mesh, DynamicTexture, Sprite, SpriteManager } from '@babylonjs/core';
import { WorldUnit, unitPosition, settleUnit } from './units';
import { STARTER_HEROES, AXIE_CLASSES } from './heroes';
import { activeBattleSettings } from './battle-settings';
import { BATTLE_OVERLAYS } from './battle-debug';
import { createBattle } from './battle';
import type { BattleSession } from './battle-save';
import { fighterWorldPosition } from './battle-world';
import { createBattleAppearanceResolver } from './axie/battle-appearance';
import { BabylonAxieMixer, type BabylonAxieInstance } from './axie/babylon-mixer';
import type { Fighter } from './battle';
import { drawUnitNameLabel, UNIT_LABEL_STYLE, UNIT_LABEL_TEXTURE_SIZE } from './unit-label-style';

export function showMarches(
  scene: Scene,
  orders: WorldUnit[] | (() => WorldUnit[]),
  selection: string | null | (() => string | null),
  visible: () => boolean,
  battles: () => readonly BattleSession[] = () => []
) {
  const getOrders = typeof orders === 'function' ? orders : () => orders;
  const initialOrders = getOrders();
  const root = new TransformNode('armies', scene);
  const modelAbort = new AbortController();
  const axieMixer = new BabylonAxieMixer(scene);
  const resolveAppearance = createBattleAppearanceResolver(modelAbort.signal);
  const avatarsForCleanup = new Set<BabylonAxieInstance>();
  let disposed = false;
  const materials: StandardMaterial[] = [];
  const textures: DynamicTexture[] = [];
  const spriteManagers: SpriteManager[] = [];
  const selectionSprites = new SpriteManager('world selected unit sprites', '', Math.max(1, initialOrders.length), 256, scene);
  const selectionTexture = new DynamicTexture('world selected unit texture', { width: 256, height: 256 }, scene, true);
  selectionTexture.hasAlpha = true;
  selectionSprites.texture = selectionTexture;
  spriteManagers.push(selectionSprites);
  textures.push(selectionTexture);
  const selectionContext = selectionTexture.getContext() as unknown as CanvasRenderingContext2D;
  selectionContext.clearRect(0, 0, 256, 256);
  selectionContext.strokeStyle = UNIT_LABEL_STYLE.markerColor;
  selectionContext.lineWidth = 10;
  selectionContext.shadowColor = 'rgba(255, 227, 108, 0.65)';
  selectionContext.shadowBlur = 8;
  selectionContext.beginPath();
  selectionContext.arc(128, 128, 82, 0, Math.PI * 2);
  selectionContext.stroke();
  selectionTexture.update();
  let lastSettings: typeof activeBattleSettings | null = null;
  function boundary(parent: TransformNode, x: number, z: number, radius: number, color: string) {
    const points = Array.from({ length: 97 }, (_, i) => new Vector3(x + Math.sin(i * Math.PI / 48) * radius, 0.24, z + Math.cos(i * Math.PI / 48) * radius));
    const mesh = MeshBuilder.CreateLines('world battle range', { points }, scene);
    mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
  }
  const armies = initialOrders.flatMap(order => {
    if (order.status === 'home') return [];
    const army = new TransformNode(order.id, scene); army.parent = root;
    const destination = order.order?.destination ?? order.position, origin = order.order?.origin ?? order.position;
    army.rotation.y = Math.atan2(destination.x - origin.x, destination.z - origin.z);
    const units: TransformNode[] = [];
    const avatars = new Map<number, BabylonAxieInstance>();
    order.members.forEach(slot => {
      const hero = STARTER_HEROES.find(hero => hero.id === slot.heroId);
      const mat = new StandardMaterial('unit color', scene);
      mat.diffuseColor = Color3.FromHexString(hero ? AXIE_CLASSES[hero.class].color : slot.troopKind === 'archer' ? '#548851' : '#759ab6'); materials.push(mat);
      const unit = new TransformNode('formation unit', scene); unit.parent = army;
      unit.position.set(slot.offset.x, 0, slot.offset.z);
      units.push(unit);
      const fallback = new TransformNode('unit fallback', scene); fallback.parent = unit;
      const body = MeshBuilder.CreateSphere('unit body', { diameter: hero ? 0.95 : 0.65, segments: 8 }, scene);
      body.parent = fallback; body.position.y = 0.65; body.material = mat; body.isPickable = true; body.metadata = { unitId: order.id };
      if (hero) for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder('Axie ears', { height: 0.45, diameterBottom: 0.25, diameterTop: 0, tessellation: 6 }, scene);
        ear.parent = fallback; ear.position.set(side * 0.3, 1.15, 0); ear.material = mat; ear.isPickable = true; ear.metadata = { unitId: order.id };
      }
      if (slot.heroId) {
        // Use the same assembled body + body-part model as the Axie inspector.
        const fighter = {
          id: `${order.id}:${slot.id}`,
          memberId: slot.id,
          side: 'player' as const,
          name: hero?.name ?? `Axie #${slot.heroId}`,
          heroId: slot.heroId,
        } as Fighter;
        void (async () => {
          try {
            const avatar = await axieMixer.create(await resolveAppearance(fighter));
            if (disposed) { avatar.dispose(); return; }
            avatar.root.parent = unit;
            // The inspector model is authored at its full presentation size.
            // Keep the same model and animation, but make marching Axies compact.
            // March units are already grounded at y=0; the inspector's -0.55
            // offset is only there to place the model on its pedestal.
            avatar.root.position.y = 0;
            avatar.root.scaling.setAll(0.55);
            avatars.set(order.members.indexOf(slot), avatar);
            avatarsForCleanup.add(avatar);
            avatar.update('idle', performance.now() / 1000);
            fallback.setEnabled(false);
          } catch (error) {
            if (!disposed) console.warn('[axie-babylon] march avatar kept fallback', { heroId: slot.heroId, error });
          }
        })();
      }
    });
    const selectionSprite = new Sprite(`world selection sprite ${order.id}`, selectionSprites);
    selectionSprite.width = 2.35;
    selectionSprite.height = 2.35;
    selectionSprite.isPickable = false;
    selectionSprite.isVisible = false;

    const nameManager = new SpriteManager(`world unit name sprites ${order.id}`, '', 1, UNIT_LABEL_TEXTURE_SIZE, scene);
    const nameTexture = new DynamicTexture(`world unit name texture ${order.id}`, UNIT_LABEL_TEXTURE_SIZE, scene, true);
    nameTexture.hasAlpha = true;
    nameManager.texture = nameTexture;
    spriteManagers.push(nameManager);
    textures.push(nameTexture);
    const nameSprite = new Sprite(`world unit name ${order.id}`, nameManager);
    nameSprite.invertV = true;
    nameSprite.width = 3.2;
    nameSprite.height = 1.05;
    nameSprite.isPickable = false;
    const nameContext = nameTexture.getContext() as unknown as CanvasRenderingContext2D;
    const textWidth = drawUnitNameLabel(nameContext, order.name);
    nameTexture.update();
    nameSprite.width = Math.max(3.6, Math.min(6.4, textWidth / 80));
    const hitArea = MeshBuilder.CreateCylinder('unit touch target', { diameter: 6, height: 1.5, tessellation: 12 }, scene);
    hitArea.parent = army; hitArea.visibility = 0; hitArea.isPickable = true; hitArea.metadata = { unitId: order.id };
    // Preserve a visible connection to home after arrival.
    const line = MeshBuilder.CreateLines('unit home trail', { points: [new Vector3(order.home.x, 0.2, order.home.z), new Vector3(destination.x, 0.2, destination.z)] }, scene);
    line.parent = root; line.color = Color3.FromHexString('#f5d36b'); line.isPickable = false;
    const debug = new TransformNode('world battle overlays', scene); debug.parent = army;
    const targetLine = MeshBuilder.CreateLines('world order target', { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, scene);
    targetLine.parent = root; targetLine.color = Color3.FromHexString(BATTLE_OVERLAYS.targets.color); targetLine.isPickable = false;

    // Live Gathering Sprite Healthbar & Badge
    const gatherBarRoot = new TransformNode(`gather bar ${order.id}`, scene);
    gatherBarRoot.parent = army;
    gatherBarRoot.position.set(0, 3.2, 0);

    const gatherBg = MeshBuilder.CreatePlane(`gather bar bg ${order.id}`, { width: 3.4, height: 0.52 }, scene);
    gatherBg.parent = gatherBarRoot;
    gatherBg.billboardMode = Mesh.BILLBOARDMODE_ALL;
    gatherBg.isPickable = false;

    const bgMat = new StandardMaterial(`gather bg mat ${order.id}`, scene);
    bgMat.diffuseColor = Color3.FromHexString('#0e1814');
    bgMat.emissiveColor = Color3.FromHexString('#0a120e');
    bgMat.specularColor = Color3.Black();
    materials.push(bgMat);
    gatherBg.material = bgMat;

    const gatherFill = MeshBuilder.CreatePlane(`gather bar fill ${order.id}`, { width: 3.2, height: 0.36 }, scene);
    gatherFill.parent = gatherBg;
    gatherFill.position.set(0, 0, -0.02);
    gatherFill.isPickable = false;

    const fillMat = new StandardMaterial(`gather fill mat ${order.id}`, scene);
    fillMat.diffuseColor = Color3.FromHexString('#10b981');
    fillMat.emissiveColor = Color3.FromHexString('#059669');
    fillMat.specularColor = Color3.Black();
    materials.push(fillMat);
    gatherFill.material = fillMat;

    // Sprite badge above the bar
    const badgePlane = MeshBuilder.CreatePlane(`gather badge ${order.id}`, { width: 3.2, height: 0.8 }, scene);
    badgePlane.parent = gatherBarRoot;
    badgePlane.position.set(0, 0.72, 0);
    badgePlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    badgePlane.isPickable = false;

    let hasBadge = false;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const badgeTexture = new DynamicTexture(`gather-badge-tex-${order.id}`, { width: 256, height: 64 }, scene, false);
        badgeTexture.hasAlpha = true;
        const ctx = badgeTexture.getContext() as unknown as CanvasRenderingContext2D;
        if (ctx && typeof ctx.fillText === 'function') {
          ctx.clearRect(0, 0, 256, 64);
          if (typeof ctx.roundRect === 'function') ctx.roundRect(4, 4, 248, 56, 28);
          else ctx.rect(4, 4, 248, 56);
          ctx.fillStyle = 'rgba(10, 18, 14, 0.92)';
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#34d399';
          ctx.stroke();

          ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = '#6ee7b7';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⛏️ Gathering', 128, 32);
          badgeTexture.update();
          textures.push(badgeTexture);

          const badgeMat = new StandardMaterial(`gather-badge-mat-${order.id}`, scene);
          badgeMat.diffuseTexture = badgeTexture;
          badgeMat.opacityTexture = badgeTexture;
          badgeMat.emissiveColor = Color3.White();
          badgeMat.disableLighting = true;
          badgeMat.backFaceCulling = false;
          materials.push(badgeMat);
          badgePlane.material = badgeMat;
          hasBadge = true;
        }
      } catch {
        hasBadge = false;
      }
    }
    if (!hasBadge) {
      badgePlane.setEnabled(false);
    }

    gatherBarRoot.setEnabled(false);

    // Returning Cargo Sprite Billboard (Distinct sprite per resource)
    const cargoRoot = new TransformNode(`cargo root ${order.id}`, scene);
    cargoRoot.parent = army;
    cargoRoot.position.set(0, 3.2, 0);

    const cargoPlane = MeshBuilder.CreatePlane(`cargo plane ${order.id}`, { width: 3.4, height: 1.4 }, scene);
    cargoPlane.parent = cargoRoot;
    cargoPlane.billboardMode = Mesh.BILLBOARDMODE_ALL;
    cargoPlane.isPickable = false;

    let cargoTexture: DynamicTexture | null = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        cargoTexture = new DynamicTexture(`cargo-tex-${order.id}`, { width: 320, height: 128 }, scene, false);
        cargoTexture.hasAlpha = true;
        textures.push(cargoTexture);

        const cargoMat = new StandardMaterial(`cargo-mat-${order.id}`, scene);
        cargoMat.diffuseTexture = cargoTexture;
        cargoMat.opacityTexture = cargoTexture;
        cargoMat.emissiveColor = Color3.White();
        cargoMat.disableLighting = true;
        cargoMat.backFaceCulling = false;
        materials.push(cargoMat);
        cargoPlane.material = cargoMat;
      } catch {
        cargoTexture = null;
      }
    }
    if (!cargoTexture) {
      const fallbackMat = new StandardMaterial(`cargo-fallback-mat-${order.id}`, scene);
      fallbackMat.diffuseColor = Color3.FromHexString('#f59e0b');
      materials.push(fallbackMat);
      cargoPlane.material = fallbackMat;
    }

    cargoRoot.setEnabled(false);

    return [{
      order,
      army,
      units,
      avatars,
      line,
      debug,
      targetLine,
      gatherBar: { root: gatherBarRoot, fill: gatherFill, fillMat, badge: badgePlane },
      cargoSprite: { root: cargoRoot, plane: cargoPlane, texture: cargoTexture, lastKey: '' },
      selectionSprite,
      nameSprite
    }];
  });

  function drawResourceCargoSprite(texture: DynamicTexture, resource: string, amount: number) {
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    if (!ctx || typeof ctx.fillText !== 'function') return;

    ctx.clearRect(0, 0, 320, 128);

    const configs: Record<string, { bg: string; border: string; emblemBg: string; accent: string; icon: string; name: string }> = {
      food: { bg: 'rgba(28, 20, 8, 0.94)', border: '#f59e0b', emblemBg: '#451a03', accent: '#fcd34d', icon: '🌾', name: 'FOOD' },
      wood: { bg: 'rgba(10, 28, 18, 0.94)', border: '#10b981', emblemBg: '#064e3b', accent: '#6ee7b7', icon: '🪵', name: 'LUMBER' },
      stone: { bg: 'rgba(12, 22, 36, 0.94)', border: '#38bdf8', emblemBg: '#0c4a6e', accent: '#7dd3fc', icon: '🪨', name: 'STONE' },
    };
    const cfg = configs[resource] ?? configs.food;

    // Outer card container
    ctx.save();
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(8, 8, 304, 112, 22);
    else ctx.rect(8, 8, 304, 112);
    ctx.fillStyle = cfg.bg;
    ctx.fill();
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = cfg.border;
    ctx.stroke();
    ctx.restore();

    // Left Circular Emblem
    ctx.beginPath();
    ctx.arc(64, 64, 40, 0, Math.PI * 2);
    ctx.fillStyle = cfg.emblemBg;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cfg.border;
    ctx.stroke();

    // Resource Icon
    ctx.font = '38px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.icon, 64, 65);

    // Right: Quantity & Name
    ctx.font = '900 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = cfg.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`+${amount}`, 120, 60);

    ctx.font = 'bold 18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`🚚 ${cfg.name}`, 122, 92);

    texture.update();
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    const selectedId = typeof selection === 'function' ? selection() : selection;
    const changed = lastSettings !== activeBattleSettings;
    lastSettings = activeBattleSettings;
    const currentOrders = getOrders();
    const focus = armies.find(({ order }) => order.id === selectedId && settleUnit(order, now).status !== 'home')?.order.id
      ?? armies.find(({ order }) => settleUnit(order, now).status !== 'home')?.order.id;
    for (const { order, army, units, avatars, line, debug, targetLine, gatherBar, cargoSprite, selectionSprite, nameSprite } of armies) {
      const latest = currentOrders.find(u => u.id === order.id) ?? order;
      if (changed) {
        debug.getChildren().forEach(child => child.dispose());
        const { overlays, awarenessRadius, engagementRadius } = activeBattleSettings;
        const center = order.members.reduce((sum, member) => ({ x: sum.x + member.offset.x / order.members.length, z: sum.z + member.offset.z / order.members.length }), { x: 0, z: 0 });
        if (overlays.awareness) boundary(debug, center.x, center.z, awarenessRadius, BATTLE_OVERLAYS.awareness.color);
        if (overlays.engagement) boundary(debug, center.x, center.z, engagementRadius, BATTLE_OVERLAYS.engagement.color);
        // Reuse combat stat construction so hero classes and troop ranges stay in sync.
        const fighters = createBattle(order).fighters.filter(fighter => fighter.side === 'player');
        order.members.forEach((member, index) => {
          const stats = fighters[index].stats;
          if (overlays.attack) boundary(debug, member.offset.x, member.offset.z, stats.radius + stats.range, BATTLE_OVERLAYS.attack.color);
          if (overlays.body) boundary(debug, member.offset.x, member.offset.z, stats.radius, BATTLE_OVERLAYS.body.color);
          if (overlays.facing) {
            const facing = MeshBuilder.CreateLines('world unit facing', { points: [new Vector3(member.offset.x, 0.25, member.offset.z), new Vector3(member.offset.x, 0.25, member.offset.z + 2)] }, scene);
            facing.parent = debug; facing.color = Color3.FromHexString(BATTLE_OVERLAYS.facing.color); facing.isPickable = false;
          }
        });
      }
      const current = settleUnit(latest, now);
      const position = unitPosition(latest, now);
      const moving = !!current.order;
      const battleSession = battles().find(session => !session.battle.result && (session.armies ?? [session.army]).some(participant => participant.id === latest.id));
      const isAlive = visible() && current.status !== 'home';
      army.setEnabled(isAlive);
      army.position.set(position.x, 0, position.z);
      line.setEnabled(isAlive);
      selectionSprite.position.set(position.x, 0.16, position.z);
      selectionSprite.isVisible = isAlive && order.id === selectedId;
      nameSprite.position.set(position.x, 2.72, position.z);
      nameSprite.isVisible = isAlive;
      const showDebug = isAlive && (activeBattleSettings.showAll || order.id === focus);
      debug.setEnabled(showDebug);
      targetLine.setEnabled(showDebug && activeBattleSettings.overlays.targets && !!current.order);
      if (current.order && activeBattleSettings.overlays.targets) {
        MeshBuilder.CreateLines('world order target', { points: [new Vector3(position.x, 0.25, position.z), new Vector3(current.order.destination.x, 0.25, current.order.destination.z)], instance: targetLine as LinesMesh });
      }
      units.forEach((unit, index) => {
        const member = order.members[index];
        const avatar = avatars.get(index);
        avatar?.update(current.order ? 'approaching' : current.status === 'retreating' ? 'retreating' : 'idle', now / 1000);
        const fighter = battleSession?.battle.fighters.find(candidate => candidate.side === 'player' && candidate.memberId === member.id && (candidate.armyId === latest.id || (!candidate.armyId && battleSession.army.id === latest.id)));
        if (fighter && battleSession) {
          unit.setEnabled(fighter.hp > 0);
          const world = fighterWorldPosition(battleSession, fighter);
          const running = ['approaching', 'charging', 'retreating'].includes(fighter.state);
          unit.setAbsolutePosition(new Vector3(world.x, running ? Math.abs(Math.sin(now / 150 + index)) * 0.15 : 0, world.z));
        } else {
          unit.setEnabled(true);
          unit.position.set(member.offset.x, moving ? Math.abs(Math.sin(now / 150 + index)) * 0.15 : 0, member.offset.z);
        }
      });

      // Live gathering sprite healthbar
      const isGathering = isAlive && current.status === 'gathering';
      gatherBar.root.setEnabled(isGathering);
      if (isGathering) {
        const cargo = latest.cargo ?? current.cargo;
        const maxLoad = cargo?.maxLoad && cargo.maxLoad > 0 ? cargo.maxLoad : 100;
        const amount = cargo?.amount ?? 0;
        const ratio = Math.max(0.02, Math.min(1, amount / maxLoad));
        gatherBar.fill.scaling.x = ratio;
        gatherBar.fill.position.x = -1.6 * (1 - ratio);

        if (ratio >= 0.95) {
          gatherBar.fillMat.diffuseColor = Color3.FromHexString('#f59e0b');
          gatherBar.fillMat.emissiveColor = Color3.FromHexString('#d97706');
        } else {
          gatherBar.fillMat.diffuseColor = Color3.FromHexString('#10b981');
          gatherBar.fillMat.emissiveColor = Color3.FromHexString('#059669');
        }

        const pulse = 1 + Math.sin(now / 180) * 0.03;
        gatherBar.root.scaling.set(pulse, pulse, pulse);
      }

      // Returning Cargo Sprite (shown while returning with cargo)
      const isReturningWithCargo = isAlive && current.status === 'returning' && !!(latest.cargo && latest.cargo.amount > 0);
      cargoSprite.root.setEnabled(isReturningWithCargo);
      if (isReturningWithCargo) {
        const cargo = latest.cargo!;
        const amt = Math.round(cargo.amount);
        const cargoKey = `${cargo.resource}-${amt}`;
        if (cargoKey !== cargoSprite.lastKey) {
          cargoSprite.lastKey = cargoKey;
          if (cargoSprite.texture) {
            drawResourceCargoSprite(cargoSprite.texture, cargo.resource, amt);
          } else if (cargoSprite.plane.material) {
            const colors: Record<string, string> = { food: '#f59e0b', wood: '#10b981', stone: '#38bdf8' };
            (cargoSprite.plane.material as StandardMaterial).diffuseColor = Color3.FromHexString(colors[cargo.resource] ?? '#f59e0b');
          }
        }
        cargoSprite.root.position.y = 3.3 + Math.sin(now / 150) * 0.15;
      }
    }
  });
  return () => {
    disposed = true;
    modelAbort.abort();
    avatarsForCleanup.forEach(avatar => avatar.dispose());
    axieMixer.dispose();
    scene.onBeforeRenderObservable.remove(observer);
    root.dispose();
    materials.forEach(mat => mat.dispose());
    textures.forEach(tex => tex.dispose());
    spriteManagers.forEach(manager => manager.dispose());
  };
}
