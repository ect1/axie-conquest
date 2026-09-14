import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { Battle, formationCenter } from './battle';
import { activeBattleSettings } from './battle-settings';
import { AXIE_CLASSES, STARTER_HEROES } from './heroes';
import { BATTLE_OVERLAYS, BattleOverlays } from './battle-debug';
import { BabylonAxieMixer, type BabylonAxieInstance, type BabylonAxiePlan } from './axie/babylon-mixer';

type AxieLookupPayload = {
  readonly data?: { readonly axies?: { readonly results?: readonly { readonly newGenes?: string; readonly genes?: string }[] } };
};

async function loadBattleAxiePlan(): Promise<BabylonAxiePlan> {
  const lookupResponse = await fetch('/api/axies?size=1');
  if (!lookupResponse.ok) throw new Error(`Axie lookup failed with HTTP ${lookupResponse.status}.`);
  const lookup = await lookupResponse.json() as AxieLookupPayload;
  const result = lookup.data?.axies?.results?.[0];
  const genes = result?.newGenes ?? result?.genes;
  if (!genes) throw new Error('The Axie lookup did not return genes.');
  const planResponse = await fetch(`/api/axies/decode?genes=${encodeURIComponent(genes)}`);
  if (!planResponse.ok) throw new Error(`Axie plan lookup failed with HTTP ${planResponse.status}.`);
  return planResponse.json() as Promise<BabylonAxiePlan>;
}

/** Shared fighter presentation for the practice arena and the world map. */
export function createBattleRenderer(scene: Scene) {
  const root = new TransformNode('live battle', scene);
  const axieMixer = new BabylonAxieMixer(scene);
  const materials: StandardMaterial[] = [];
  const mat = (name: string, color: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); materials.push(m); return m; };
  const healthMat = mat('healthy', '#b8f184'), emptyMat = mat('injured', '#4b3232');
  const models = new Map<string, { body: TransformNode; fallback: Mesh; bar: Mesh; back: Mesh; nose: Mesh; avatar?: BabylonAxieInstance }>();
  const rings: Mesh[] = [];
  let lastBattle: Battle | null = null, lastOptions = '';
  let battleAxiePlan: Promise<BabylonAxiePlan> | undefined;
  let disposed = false;
  const plan = () => {
    battleAxiePlan ??= loadBattleAxiePlan();
    return battleAxiePlan;
  };
  const loadAvatar = async (fighterId: string, model: { body: TransformNode; fallback: Mesh; nose: Mesh; avatar?: BabylonAxieInstance }) => {
    try {
      const avatar = await axieMixer.create(await plan());
      if (disposed || models.get(fighterId) !== model) { avatar.dispose(); return; }
      avatar.root.parent = model.body;
      model.avatar = avatar;
      model.fallback.setEnabled(false);
      model.nose.setEnabled(false);
      console.info('[axie-babylon] battle avatar attached', { fighterId, body: avatar.bodyId, parts: avatar.attachedPartCount });
    } catch (error) {
      console.warn('[axie-babylon] battle avatar kept fallback', { fighterId, error });
    }
  };
  function ring(x: number, z: number, radius: number, color: string) {
    const points = Array.from({ length: 65 }, (_, i) => new Vector3(x + Math.sin(i * Math.PI / 32) * radius, 0.08, z + Math.cos(i * Math.PI / 32) * radius));
    const mesh = MeshBuilder.CreateLines('range boundary', { points }, scene); mesh.color = Color3.FromHexString(color); mesh.isPickable = false; mesh.parent = root; rings.push(mesh);
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
          fallback.material = mat(fighter.id, hero ? AXIE_CLASSES[hero.class].color : fighter.side === 'enemy' ? '#bc685c' : fighter.troopKind === 'archer' ? '#a6ce7d' : '#85b8dd'); fallback.parent = body;
          const nose = MeshBuilder.CreateBox('facing marker', { width: 0.15, height: 0.16, depth: 0.35 }, scene); nose.parent = body; nose.position.set(0, 0.1, 0.4); nose.isPickable = false; nose.material = fallback.material;
          if (hero) for (const side of [-1, 1]) { const ear = MeshBuilder.CreateCylinder('Axie ear', { height: 0.4, diameterBottom: 0.22, diameterTop: 0, tessellation: 6 }, scene); ear.parent = fallback; ear.position.set(side * 0.25, 0.55, 0); ear.material = fallback.material; ear.isPickable = false; }
          const bar = MeshBuilder.CreateBox('health', { width: 1.3, height: 0.1, depth: 0.12 }, scene); bar.parent = root; bar.material = healthMat; bar.isPickable = false;
          const back = MeshBuilder.CreateBox('health background', { width: 1.3, height: 0.12, depth: 0.14 }, scene); back.parent = root; back.material = emptyMat; back.isPickable = false;
          model = { body, fallback, bar, back, nose }; models.set(fighter.id, model);
          if (hero) void loadAvatar(fighter.id, model);
        }
        model.body.position.set(fighter.x, fighter.hp > 0 ? 0.55 : 0.15, fighter.z); model.body.rotation.y = fighter.facing;
        model.body.scaling.y = fighter.hp > 0 ? 1 : 0.3; model.body.setEnabled(fighter.hp > 0);
        model.back.position.set(fighter.x, 1.4, fighter.z);
        model.bar.position.set(fighter.x - (1 - fighter.hp / fighter.maxHp) * 0.65, 1.48, fighter.z);
        model.bar.scaling.x = Math.max(0.001, fighter.hp / fighter.maxHp);
        model.bar.setEnabled(fighter.hp > 0); model.back.setEnabled(fighter.hp > 0);
        if (fighter.id === selected) ring(fighter.x, fighter.z, fighter.stats.radius + 0.2, '#ffe36c');
        if (!all && selected !== fighter.id || fighter.hp <= 0) continue;
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
  return { root, models, update, dispose: () => { disposed = true; axieMixer.dispose(); root.dispose(); materials.forEach(material => material.dispose()); } };
}
