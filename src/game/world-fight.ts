import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { BattleSession } from './battle-save';
import { fighterWorldPosition } from './battle-world';

/** A fixed pool created with the world: combat updates transforms and bar fill only. */
export function createWorldFight(scene: Scene) {
  const root = new TransformNode('world fight effects', scene);
  const material = (name: string, color: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); return m; };
  const red = material('defender red', '#bc685c'), dark = material('enemy health empty', '#44352e'), gold = material('fight flash', '#fff3ad');
  gold.emissiveColor = Color3.FromHexString('#fff3ad');
  const models = Array.from({ length: 3 }, (_, i) => {
    const body = MeshBuilder.CreateSphere(`world defender ${i}`, { diameter: 0.8, segments: 8 }, scene);
    body.material = red; body.parent = root; body.isPickable = false; return body;
  });
  const back = MeshBuilder.CreateBox('enemy formation health background', { width: 4.1, height: 0.22, depth: 0.2 }, scene);
  const bar = MeshBuilder.CreateBox('enemy formation health', { width: 4, height: 0.18, depth: 0.18 }, scene);
  back.material = dark; bar.material = red;
  const sparks = Array.from({ length: 6 }, () => { const mesh = MeshBuilder.CreateSphere('fight projectile', { diameter: 0.2, segments: 4 }, scene); mesh.material = gold; return mesh; });
  for (const mesh of [back, bar, ...sparks]) { mesh.parent = root; mesh.isPickable = false; }
  root.setEnabled(false);
  let lastSession = '', lastTick = -1, eventTime = 0;
  let events: { from: Vector3; to: Vector3 }[] = [];
  return {
    update(session: BattleSession | null, visible: boolean) {
      root.setEnabled(!!session && visible);
      if (!session || !visible) return;
      const battle = session.battle, enemies = battle.fighters.filter(f => f.side === 'enemy');
      const fresh = lastSession !== `${session.army.id}:${session.startedAt}`;
      lastSession = `${session.army.id}:${session.startedAt}`;
      models.forEach((mesh, i) => {
        const f = enemies[i]; mesh.setEnabled(!!f && f.hp > 0);
        if (!f) return;
        const position = fighterWorldPosition(session, f), desired = new Vector3(position.x, 0.65, position.z);
        mesh.position = fresh ? desired : Vector3.Lerp(mesh.position, desired, Math.min(1, scene.getEngine().getDeltaTime() / 90));
        mesh.scaling.y = f.state === 'attacking' ? 1 + Math.sin(performance.now() / 90 + i) * 0.1 : 1;
      });
      const alive = enemies.filter(f => f.hp > 0), group = alive.length ? alive : enemies;
      const center = fighterWorldPosition(session, { x: group.reduce((sum, f) => sum + f.x, 0) / group.length, z: group.reduce((sum, f) => sum + f.z, 0) / group.length });
      const ratio = enemies.reduce((sum, f) => sum + f.hp, 0) / enemies.reduce((sum, f) => sum + f.maxHp, 0);
      back.position.set(center.x, 2.35, center.z); bar.position.set(center.x - 2 * (1 - ratio), 2.4, center.z); bar.scaling.x = Math.max(0.001, ratio);
      if (fresh || lastTick !== battle.tick) {
        lastTick = battle.tick;
        if (battle.events.length) {
          eventTime = performance.now();
          events = battle.events.slice(0, sparks.length).flatMap(e => {
            const a = battle.fighters.find(f => f.id === e.from), b = battle.fighters.find(f => f.id === e.to);
            if (!a || !b) return [];
            const from = fighterWorldPosition(session, a), to = fighterWorldPosition(session, b);
            return [{ from: new Vector3(from.x, 0.9, from.z), to: new Vector3(to.x, 0.9, to.z) }];
          });
        }
      }
      const progress = (performance.now() - eventTime) / 250;
      sparks.forEach((spark, i) => { spark.setEnabled(!!events[i] && progress < 1); if (events[i]) spark.position = Vector3.Lerp(events[i].from, events[i].to, Math.min(1, progress)); });
    },
    dispose() { root.dispose(); red.dispose(); dark.dispose(); gold.dispose(); },
  };
}
