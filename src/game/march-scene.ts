import { Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3, LinesMesh } from '@babylonjs/core';
import { WorldUnit, unitPosition, settleUnit } from './units';
import { STARTER_HEROES, AXIE_CLASSES } from './heroes';
import { activeBattleSettings } from './battle-settings';
import { BATTLE_OVERLAYS } from './battle-debug';
import { createBattle } from './battle';

export function showMarches(scene: Scene, orders: WorldUnit[], selectedId: string | null, visible: () => boolean) {
  const root = new TransformNode('armies', scene);
  const materials: StandardMaterial[] = [];
  let lastSettings: typeof activeBattleSettings | null = null;
  function boundary(parent: TransformNode, x: number, z: number, radius: number, color: string) {
    const points = Array.from({ length: 97 }, (_, i) => new Vector3(x + Math.sin(i * Math.PI / 48) * radius, 0.24, z + Math.cos(i * Math.PI / 48) * radius));
    const mesh = MeshBuilder.CreateLines('world battle range', { points }, scene);
    mesh.parent = parent; mesh.color = Color3.FromHexString(color); mesh.isPickable = false;
  }
  const armies = orders.flatMap(order => {
    if (order.status === 'home') return [];
    const army = new TransformNode(order.id, scene); army.parent = root;
    const destination = order.order?.destination ?? order.position, origin = order.order?.origin ?? order.position;
    army.rotation.y = Math.atan2(destination.x - origin.x, destination.z - origin.z);
    const units: TransformNode[] = [];
    order.members.forEach(slot => {
      const hero = STARTER_HEROES.find(hero => hero.id === slot.heroId);
      const mat = new StandardMaterial('unit color', scene);
      mat.diffuseColor = Color3.FromHexString(hero ? AXIE_CLASSES[hero.class].color : slot.troopKind === 'archer' ? '#548851' : '#759ab6'); materials.push(mat);
      const unit = new TransformNode('formation unit', scene); unit.parent = army;
      unit.position.set(slot.offset.x, 0, slot.offset.z);
      units.push(unit);
      const body = MeshBuilder.CreateSphere('unit body', { diameter: hero ? 0.95 : 0.65, segments: 8 }, scene);
      body.parent = unit; body.position.y = 0.65; body.material = mat; body.isPickable = true; body.metadata = { unitId: order.id };
      if (hero) for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder('Axie ears', { height: 0.45, diameterBottom: 0.25, diameterTop: 0, tessellation: 6 }, scene);
        ear.parent = unit; ear.position.set(side * 0.3, 1.15, 0); ear.material = mat; ear.isPickable = true; ear.metadata = { unitId: order.id };
      }
    });
    const ring = MeshBuilder.CreateTorus('unit selection', { diameter: 7, thickness: 0.12, tessellation: 40 }, scene);
    ring.parent = army; ring.position.y = 0.12; ring.isPickable = false;
    const highlight = new StandardMaterial('selection gold', scene);
    highlight.emissiveColor = Color3.FromHexString('#ffe17b'); materials.push(highlight); ring.material = highlight;
    ring.setEnabled(order.id === selectedId);
    const hitArea = MeshBuilder.CreateCylinder('unit touch target', { diameter: 6, height: 1.5, tessellation: 12 }, scene);
    hitArea.parent = army; hitArea.visibility = 0; hitArea.isPickable = true; hitArea.metadata = { unitId: order.id };
    // Preserve a visible connection to home after arrival.
    const line = MeshBuilder.CreateLines('unit home trail', { points: [new Vector3(order.home.x, 0.2, order.home.z), new Vector3(destination.x, 0.2, destination.z)] }, scene);
    line.parent = root; line.color = Color3.FromHexString('#f5d36b'); line.isPickable = false;
    const debug = new TransformNode('world battle overlays', scene); debug.parent = army;
    const targetLine = MeshBuilder.CreateLines('world order target', { points: [Vector3.Zero(), Vector3.Zero()], updatable: true }, scene);
    targetLine.parent = root; targetLine.color = Color3.FromHexString(BATTLE_OVERLAYS.targets.color); targetLine.isPickable = false;
    return [{ order, army, units, line, debug, targetLine }];
  });
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    const changed = lastSettings !== activeBattleSettings;
    lastSettings = activeBattleSettings;
    const focus = armies.find(({ order }) => order.id === selectedId && settleUnit(order, now).status !== 'home')?.order.id
      ?? armies.find(({ order }) => settleUnit(order, now).status !== 'home')?.order.id;
    for (const { order, army, units, line, debug, targetLine } of armies) {
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
      const current = settleUnit(order, now);
      const position = unitPosition(order, now);
      const moving = !!current.order;
      army.setEnabled(visible() && current.status !== 'home');
      army.position.set(position.x, 0, position.z);
      line.setEnabled(visible() && current.status !== 'home');
      const showDebug = visible() && current.status !== 'home' && (activeBattleSettings.showAll || order.id === focus);
      debug.setEnabled(showDebug);
      targetLine.setEnabled(showDebug && activeBattleSettings.overlays.targets && !!current.order);
      if (current.order && activeBattleSettings.overlays.targets) {
        MeshBuilder.CreateLines('world order target', { points: [new Vector3(position.x, 0.25, position.z), new Vector3(current.order.destination.x, 0.25, current.order.destination.z)], instance: targetLine as LinesMesh });
      }
      units.forEach((unit, index) => { unit.position.y = moving ? Math.abs(Math.sin(now / 150 + index)) * 0.15 : 0; });
    }
  });
  return () => { scene.onBeforeRenderObservable.remove(observer); root.dispose(); materials.forEach(mat => mat.dispose()); };
}
