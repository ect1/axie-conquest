import { createBattleAppearanceResolver } from './axie/battle-appearance';
import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { Battle, Fighter, formationCenter } from './battle';
import { activeBattleSettings } from './battle-settings';
import { AXIE_CLASSES, STARTER_HEROES } from './heroes';
import { BATTLE_OVERLAYS, BattleOverlays } from './battle-debug';
import { BabylonAxieMixer, type BabylonAxieInstance } from './axie/babylon-mixer';
import { BabylonMascotMixer, type BabylonMascotInstance } from './mascot/mascot-mixer';

type FighterAvatarInstance = BabylonAxieInstance | BabylonMascotInstance;

/** Shared fighter presentation for the practice arena and the world map. */
export function createBattleRenderer(scene: Scene) {
  const root = new TransformNode('live battle', scene);
  const axieMixer = new BabylonAxieMixer(scene);
  const mascotMixer = new BabylonMascotMixer(scene);
  const materials: StandardMaterial[] = [];
  const mat = (name: string, color: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); materials.push(m); return m; };
  const healthMat = mat('healthy', '#b8f184'), emptyMat = mat('injured', '#4b3232');
  const rangeMaterials = new Map<string, StandardMaterial>();
  const models = new Map<string, { body: TransformNode; fallback: Mesh; bar: Mesh; back: Mesh; nose: Mesh; avatar?: FighterAvatarInstance }>();
  const rings: Mesh[] = [];
  let lastBattle: Battle | null = null, lastOptions = '';
  const controller = new AbortController();
  const plan = createBattleAppearanceResolver(controller.signal);
  let loading = 0;
  const errors: string[] = [];
  let disposed = false;
  const loadAvatar = async (fighter: Fighter, model: { body: TransformNode; fallback: Mesh; nose: Mesh; avatar?: FighterAvatarInstance }) => {
    loading++;
    const fighterId = fighter.id;
    try {
      const avatar = await axieMixer.create(await plan(fighter));
      if (disposed || models.get(fighterId) !== model) { avatar.dispose(); return; }
      avatar.root.parent = model.body;
      // GLB import converts authored -Z forward to battle +Z. Body feet are already at y=0.
      avatar.root.position.y = -0.55;
      const current = lastBattle?.fighters.find(f => f.id === fighter.id) ?? fighter;
      avatar.update(current.state, (lastBattle?.tick ?? 0) / 10);
      model.avatar = avatar;
      model.fallback.setEnabled(false);
      model.nose.setEnabled(false);
      console.info('[axie-babylon] battle avatar attached', { fighterId, body: avatar.bodyId, parts: avatar.attachedPartCount });
    } catch (error) {
      if (!disposed) errors.push(`Axie #${fighter.heroId}: ${error instanceof Error ? error.message : 'Model failed to load.'}`);
      console.warn('[axie-babylon] battle avatar kept fallback', { fighterId, error });
    } finally {
      loading--;
    }
  };
  const loadMascotAvatar = async (fighter: Fighter, kind: string, model: { body: TransformNode; fallback: Mesh; nose: Mesh; avatar?: FighterAvatarInstance }) => {
    loading++;
    const fighterId = fighter.id;
    try {
      const avatar = await mascotMixer.create(kind);
      if (disposed || models.get(fighterId) !== model) { avatar.dispose(); return; }
      avatar.root.parent = model.body;
      avatar.root.position.y = -0.55;
      const current = lastBattle?.fighters.find(f => f.id === fighter.id) ?? fighter;
      avatar.update(current.state, (lastBattle?.tick ?? 0) / 10);
      model.avatar = avatar;
      model.fallback.setEnabled(false);
      model.nose.setEnabled(false);
      console.info('[mascot-babylon] mascot avatar attached', { fighterId, kind, mascot: avatar.mascotId });
    } catch (error) {
      if (!disposed) errors.push(`${kind}: ${error instanceof Error ? error.message : 'Model failed to load.'}`);
      console.warn('[mascot-babylon] mascot avatar kept fallback', { fighterId, error });
    } finally {
      loading--;
    }
  };
  function ring(x: number, z: number, radius: number, color: string) {
    // A thin line was easily lost against the grass at common mobile zoom.
    // The emissive torus stays readable while keeping the circle unobtrusive.
    let material = rangeMaterials.get(color);
    if (!material) {
      material = mat(`range ${color}`, color);
      material.emissiveColor = Color3.FromHexString(color).scale(0.45);
      rangeMaterials.set(color, material);
    }
    const mesh = MeshBuilder.CreateTorus('range boundary', { diameter: radius * 2, thickness: 0.075, tessellation: 64 }, scene);
    mesh.position.set(x, 0.12, z); mesh.material = material; mesh.isPickable = false; mesh.parent = root; rings.push(mesh);
  }
  function line(a: Vector3, b: Vector3, color: string) { const mesh = MeshBuilder.CreateLines('battle feedback', { points: [a, b] }, scene); mesh.color = Color3.FromHexString(color); mesh.isPickable = false; mesh.parent = root; rings.push(mesh); }
  function update(battle: Battle, selected: string | null, overlays: BattleOverlays, all: boolean) {
    const options = JSON.stringify([selected, overlays, all]);
    if (battle !== lastBattle || options !== lastOptions) {
      lastBattle = battle; lastOptions = options; rings.splice(0).forEach(mesh => mesh.dispose());
      for (const fighter of battle.fighters) {
        let model = models.get(fighter.id);
        if (!model) {
          const hero = STARTER_HEROES.find(h => h.id === fighter.heroId);
          const body = new TransformNode(fighter.name, scene); body.parent = root; body.metadata = { fighterId: fighter.id };
          const fallback = MeshBuilder.CreateSphere(`${fighter.name} placeholder`, { diameter: fighter.stats.radius * 2, segments: 12 }, scene);
          fallback.material = mat(fighter.id, hero ? AXIE_CLASSES[hero.class].color : fighter.isBoss ? '#f59e0b' : fighter.side === 'enemy' ? '#bc685c' : fighter.troopKind === 'archer' ? '#a6ce7d' : '#85b8dd'); fallback.parent = body;
          const nose = MeshBuilder.CreateBox('facing marker', { width: 0.15, height: 0.16, depth: 0.35 }, scene); nose.parent = body; nose.position.set(0, 0.1, 0.4); nose.isPickable = false; nose.material = fallback.material;
          if (hero) for (const side of [-1, 1]) { const ear = MeshBuilder.CreateCylinder('Axie ear', { height: 0.4, diameterBottom: 0.22, diameterTop: 0, tessellation: 6 }, scene); ear.parent = fallback; ear.position.set(side * 0.25, 0.55, 0); ear.material = fallback.material; ear.isPickable = false; }
          const bar = MeshBuilder.CreateBox('health', { width: 1.3, height: 0.1, depth: 0.12 }, scene); bar.parent = root; bar.material = healthMat; bar.isPickable = false;
          const back = MeshBuilder.CreateBox('health background', { width: 1.3, height: 0.12, depth: 0.14 }, scene); back.parent = root; back.material = emptyMat; back.isPickable = false;
          model = { body, fallback, bar, back, nose }; models.set(fighter.id, model);
          if (fighter.heroId) {
            void loadAvatar(fighter, model);
          } else if (fighter.mascotId) {
            void loadMascotAvatar(fighter, fighter.mascotId, model);
          } else if (fighter.troopKind === 'soldier' || fighter.troopKind === 'infantry' || fighter.troopKind === 'archer') {
            void loadMascotAvatar(fighter, fighter.troopKind, model);
          }
        }
        model.avatar?.update(fighter.state, battle.tick / 10);
        model.body.position.set(fighter.x, fighter.hp > 0 ? 0.55 : 0.15, fighter.z); model.body.rotation.y = fighter.facing;
        model.body.scaling.y = fighter.hp > 0 ? 1 : 0.3; model.body.setEnabled(fighter.hp > 0);
        model.back.position.set(fighter.x, 1.4, fighter.z);
        model.bar.position.set(fighter.x - (1 - fighter.hp / fighter.maxHp) * 0.65, 1.48, fighter.z);
        model.bar.scaling.x = Math.max(0.001, fighter.hp / fighter.maxHp);
        model.bar.setEnabled(fighter.hp > 0); model.back.setEnabled(fighter.hp > 0);
        if (fighter.id === selected) ring(fighter.x, fighter.z, fighter.stats.radius + 0.2, '#ffe36c');
        // Once a range overlay is enabled, show it for every living combatant.
        // This makes a paused battle immediately inspectable; `all` still
        // controls the formation-level awareness and engagement boundaries.
        if (fighter.hp <= 0) continue;
        if (overlays.attack) ring(fighter.x, fighter.z, fighter.stats.radius + fighter.stats.range, BATTLE_OVERLAYS.attack.color);
        if (overlays.body) ring(fighter.x, fighter.z, fighter.stats.radius, BATTLE_OVERLAYS.body.color);
        if (overlays.facing) line(new Vector3(fighter.x, 0.1, fighter.z), new Vector3(fighter.x + Math.sin(fighter.facing) * 2, 0.1, fighter.z + Math.cos(fighter.facing) * 2), BATTLE_OVERLAYS.facing.color);
        const target = battle.fighters.find(f => f.id === fighter.targetId);
        if (overlays.targets && target) line(new Vector3(fighter.x, 0.2, fighter.z), new Vector3(target.x, 0.2, target.z), BATTLE_OVERLAYS.targets.color);
      }
      const side = battle.fighters.find(f => f.id === selected)?.side ?? 'player';
      for (const team of (all ? ['player', 'enemy'] : [side]) as ('player' | 'enemy')[]) {
        const center = formationCenter(battle, team);
        if (overlays.awareness) ring(center.x, center.z, activeBattleSettings.awarenessRadius, BATTLE_OVERLAYS.awareness.color);
        if (overlays.engagement) ring(center.x, center.z, activeBattleSettings.engagementRadius, BATTLE_OVERLAYS.engagement.color);
      }
      for (const event of battle.events) {
        const from = battle.fighters.find(f => f.id === event.from), to = battle.fighters.find(f => f.id === event.to);
        if (from && to) line(new Vector3(from.x, 0.7, from.z), new Vector3(to.x, 0.7, to.z), event.kind === 'heal' ? '#bbff88' : event.kind === 'skill' ? '#fff17a' : '#fff5df');
      }
    }
  }
  return { root, models, update, isReady: () => loading === 0, errors, dispose: () => { disposed = true; controller.abort(); models.forEach(model => model.avatar?.dispose()); axieMixer.dispose(); mascotMixer.dispose(); root.dispose(); materials.forEach(material => material.dispose()); } };
}
