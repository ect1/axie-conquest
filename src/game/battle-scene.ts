import { ArcRotateCamera, Color3, Color4, Engine, HemisphericLight, Matrix, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { Battle, formationCenter } from './battle';
import { activeBattleSettings } from './battle-settings';
import { AXIE_CLASSES, STARTER_HEROES } from './heroes';

import { BATTLE_OVERLAYS, BattleOverlays } from './battle-debug';

export function createBattleScene(canvas: HTMLCanvasElement, read: () => { battle: Battle; selected: string | null; overlays: BattleOverlays; all: boolean }, select: (id: string) => void, onReady: () => void = () => {}) {
  const engine = new Engine(canvas, true);
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5));
  const scene = new Scene(engine); scene.clearColor = Color4.FromHexString('#233d37ff');
  const camera = new ArcRotateCamera('battle camera', -Math.PI / 2, 0.65, 32, new Vector3(0, 0, 0), scene);
  camera.lowerAlphaLimit = camera.upperAlphaLimit = -Math.PI / 2;
  camera.lowerBetaLimit = camera.upperBetaLimit = 0.65;
  camera.lowerRadiusLimit = 16; camera.upperRadiusLimit = 80; camera.minZ = 0.1;
  camera.attachControl(false, false, 0); camera.panningSensibility = 80;
  // Left-drag pans; camera orientation is fixed. Pinch and wheel control zoom.
  new HemisphericLight('battle sky', new Vector3(0, 1, 0), scene).intensity = 0.95;
  const mat = (name: string, color: string) => { const m = new StandardMaterial(name, scene); m.diffuseColor = Color3.FromHexString(color); m.specularColor = Color3.Black(); return m; };
  const ground = MeshBuilder.CreateGround('Lunacian battlefield', { width: 90, height: 90 }, scene); ground.material = mat('grass', '#66855a'); ground.isPickable = false;
  const healthMat = mat('healthy', '#b8f184'), emptyMat = mat('injured', '#4b3232');
  const models = new Map<string, { body: Mesh; bar: Mesh; back: Mesh; nose: Mesh }>();
  const rings: Mesh[] = [];
  let ready = false;
  let lastBattle: Battle | null = null, lastOptions = '';
  const pointers = new Map<number, { x: number; y: number }>();
  let gestureMoved = false;
  function ring(x: number, z: number, radius: number, color: string) {
    const points = Array.from({ length: 65 }, (_, i) => new Vector3(x + Math.sin(i * Math.PI / 32) * radius, 0.08, z + Math.cos(i * Math.PI / 32) * radius));
    const mesh = MeshBuilder.CreateLines('range boundary', { points }, scene); mesh.color = Color3.FromHexString(color); mesh.isPickable = false; rings.push(mesh);
  }
  function line(a: Vector3, b: Vector3, color: string) { const mesh = MeshBuilder.CreateLines('battle feedback', { points: [a, b] }, scene); mesh.color = Color3.FromHexString(color); mesh.isPickable = false; rings.push(mesh); }
  function render() {
    const { battle, selected, overlays, all } = read();
    const options = JSON.stringify([selected, overlays, all]);
    if (battle !== lastBattle || options !== lastOptions) {
      lastBattle = battle; lastOptions = options; rings.splice(0).forEach(mesh => mesh.dispose());
      for (const fighter of battle.fighters) {
        let model = models.get(fighter.id);
        if (!model) {
          const hero = STARTER_HEROES.find(h => h.id === fighter.heroId);
          const body = MeshBuilder.CreateSphere(fighter.name, { diameter: fighter.stats.radius * 2, segments: 12 }, scene);
          body.material = mat(fighter.id, hero ? AXIE_CLASSES[hero.class].color : fighter.side === 'enemy' ? '#bc685c' : fighter.troopKind === 'archer' ? '#a6ce7d' : '#85b8dd'); body.metadata = { fighterId: fighter.id };
          const nose = MeshBuilder.CreateBox('facing marker', { width: 0.15, height: 0.16, depth: 0.35 }, scene); nose.parent = body; nose.position.set(0, 0.1, 0.4); nose.isPickable = false; nose.material = body.material;
          if (hero) for (const side of [-1, 1]) { const ear = MeshBuilder.CreateCylinder('Axie ear', { height: 0.4, diameterBottom: 0.22, diameterTop: 0, tessellation: 6 }, scene); ear.parent = body; ear.position.set(side * 0.25, 0.55, 0); ear.material = body.material; ear.isPickable = false; }
          const bar = MeshBuilder.CreateBox('health', { width: 1.3, height: 0.1, depth: 0.12 }, scene); bar.material = healthMat; bar.isPickable = false;
          const back = MeshBuilder.CreateBox('health background', { width: 1.3, height: 0.12, depth: 0.14 }, scene); back.material = emptyMat; back.isPickable = false;
          model = { body, bar, back, nose }; models.set(fighter.id, model);
        }
        model.body.position.set(fighter.x, fighter.hp > 0 ? 0.55 : 0.15, fighter.z); model.body.rotation.y = fighter.facing;
        model.body.scaling.y = fighter.hp > 0 ? 1 : 0.3; model.body.visibility = fighter.hp > 0 ? 1 : 0.35;
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
    scene.render();
    if (!ready && scene.isReady()) { ready = true; canvas.dataset.battleReady = 'true'; onReady(); }
  }
  const pointerDown = (e: PointerEvent) => { if (!pointers.size) gestureMoved = false; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pointers.size > 1) gestureMoved = true; };
  const pointerMove = (e: PointerEvent) => { const start = pointers.get(e.pointerId); if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 7) gestureMoved = true; };
  const pointerUp = (e: PointerEvent) => {
    const start = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (!start || pointers.size || gestureMoved || e.type === 'pointercancel') return;
    const rect = canvas.getBoundingClientRect();
    // Screen-space hit targets stay at least 44px across, independent of camera zoom.
    const candidates = Array.from(models.entries()).map(([id, model]) => {
      const point = Vector3.Project(model.body.position, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight()));
      return { id, distance: Math.hypot(point.x * rect.width / engine.getRenderWidth() - (e.clientX - rect.left), point.y * rect.height / engine.getRenderHeight() - (e.clientY - rect.top)) };
    }).sort((a, b) => a.distance - b.distance);
    if (candidates[0]?.distance <= 22) select(candidates[0].id);
  };
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp);
  const resize = () => engine.resize(); window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  engine.runRenderLoop(render);
  return { zoom: (factor: number) => { camera.radius = Math.max(16, Math.min(80, camera.radius * factor)); }, home: () => { camera.target.set(0, 0, 0); camera.radius = 32; }, dispose: () => { observer.disconnect(); window.removeEventListener('resize', resize); canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); scene.dispose(); engine.dispose(); } };
}
