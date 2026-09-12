import { Scene, TransformNode, MeshBuilder, StandardMaterial, Color3, Vector3 } from '@babylonjs/core';
import { RouteOrder, marchProgress } from './routes';
import { FORMATION_ROWS } from './offense-formations';
import { STARTER_HEROES, AXIE_CLASSES } from './heroes';

export function showMarches(scene: Scene, orders: RouteOrder[]) {
  const root = new TransformNode('armies', scene);
  const materials: StandardMaterial[] = [];
  const armies = orders.flatMap(order => {
    if (order.kind !== 'march' || !order.formation) return [];
    const army = new TransformNode(order.id, scene); army.parent = root;
    const destination = order.route.destination, origin = order.route.origin;
    army.rotation.y = Math.atan2(destination.x - origin.x, destination.z - origin.z);
    const units: TransformNode[] = [];
    FORMATION_ROWS.forEach((row, rowIndex) => order.formation![row].forEach((slot, column) => {
      if (!slot.heroId && (!slot.military || !slot.militaryCount)) return;
      const hero = STARTER_HEROES.find(hero => hero.id === slot.heroId);
      const mat = new StandardMaterial('unit color', scene);
      mat.diffuseColor = Color3.FromHexString(hero ? AXIE_CLASSES[hero.class].color : slot.military === 'archer' ? '#548851' : '#759ab6'); materials.push(mat);
      const unit = new TransformNode('formation unit', scene); unit.parent = army;
      unit.position.set((column - (order.formation![row].length - 1) / 2) * 1.15, 0, (1.5 - rowIndex) * 1.25);
      units.push(unit);
      const body = MeshBuilder.CreateSphere('unit body', { diameter: hero ? 0.95 : 0.65, segments: 8 }, scene);
      body.parent = unit; body.position.y = 0.65; body.material = mat; body.isPickable = false;
      if (hero) for (const side of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder('Axie ears', { height: 0.45, diameterBottom: 0.25, diameterTop: 0, tessellation: 6 }, scene);
        ear.parent = unit; ear.position.set(side * 0.3, 1.15, 0); ear.material = mat; ear.isPickable = false;
      }
    }));
    const line = MeshBuilder.CreateLines('active march route', { points: [new Vector3(origin.x, 0.2, origin.z), new Vector3(destination.x, 0.2, destination.z)] }, scene);
    line.parent = root; line.color = Color3.FromHexString('#f5d36b'); line.isPickable = false;
    return [{ order, army, units, line }];
  });
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = Date.now();
    for (const { order, army, units, line } of armies) {
      const progress = marchProgress(order, now);
      army.position.set(order.route.origin.x + (order.target.x - order.route.origin.x) * progress, 0, order.route.origin.z + (order.target.z - order.route.origin.z) * progress);
      line.setEnabled(progress < 1);
      units.forEach((unit, index) => { unit.position.y = progress < 1 ? Math.abs(Math.sin(now / 150 + index)) * 0.15 : 0; });
    }
  });
  return () => { scene.onBeforeRenderObservable.remove(observer); root.dispose(); materials.forEach(mat => mat.dispose()); };
}
