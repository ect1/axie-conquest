import { Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import { WorldUnit, unitPosition, settleUnit } from './units';
import { STARTER_HEROES, AXIE_CLASSES } from './heroes';

export function showMarches(scene: Scene, orders: WorldUnit[], selectedId: string | null, visible: () => boolean) {
  const root = new TransformNode('armies', scene);
  const materials: StandardMaterial[] = [];
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
    return [{ order, army, units, line }];
  });
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const { order, army, units, line } of armies) {
      const current = settleUnit(order, now);
      const position = unitPosition(order, now);
      const moving = !!current.order;
      army.setEnabled(visible() && current.status !== 'home');
      army.position.set(position.x, 0, position.z);
      line.setEnabled(visible() && current.status !== 'home');
      units.forEach((unit, index) => { unit.position.y = moving ? Math.abs(Math.sin(now / 150 + index)) * 0.15 : 0; });
    }
  });
  return () => { scene.onBeforeRenderObservable.remove(observer); root.dispose(); materials.forEach(mat => mat.dispose()); };
}
