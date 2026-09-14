const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name.endsWith('.json') ? name : `${name}.ts`)) : require(name), module, module.exports);
  return module.exports;
}



const { NullEngine, Scene, SceneLoader, Vector3 } = require('@babylonjs/core');
const { buildStarterAxiePlan, buildAxiePlan } = load('src/server/axie-plan.ts');
const { BabylonAxieMixer } = load('src/game/axie/babylon-mixer.ts');
const { createBattleAppearanceResolver } = load('src/game/axie/battle-appearance.ts');
const { createBattle, createSandboxArmy } = load('src/game/battle.ts');
const { beginReplay, replayBattleAt, restoreReplay } = load('src/game/battle-replay.ts');
const { restoreAxieRoster, AXIE_ROSTER_SAVE_KEY } = load('src/game/axie-roster.ts');
const { restoreUnits } = load('src/game/units.ts');
const { createBattleRenderer } = load('src/game/battle-renderer.ts');
const { DEFAULT_BATTLE_OVERLAYS } = load('src/game/battle-debug.ts');
const { createBattleSession, restoreBattleSave } = load('src/game/battle-save.ts');
const { resetGame } = load('src/game/reset.ts');

async function main() {
  const livePlans = [];
  if (process.argv.includes('--live')) {
    const response = await fetch('http://localhost:3000/api/axies?size=2');
    assert.ok(response.ok);
    const payload = await response.json();
    for (const axie of payload.data.axies.results) livePlans.push(await buildAxiePlan(axie.newGenes));
  }
  const genes = '0x' + '1'.repeat(128);
  const roster = restoreAxieRoster(JSON.stringify({ version: 1, syncedAt: 1, axies: [{ id: '12345678', name: 'Roster Axie', class: 'Plant', parts: [], newGenes: genes }] }));
  assert.equal(roster.axies[0].newGenes, genes);
  const short = restoreAxieRoster(JSON.stringify({ ...roster, axies: [{ ...roster.axies[0], newGenes: '0x1234' }] }));
  assert.equal(short.axies[0].newGenes, '0x1234', 'unpadded newGenes from API survive restoration');
  const army = createSandboxArmy('balanced');
  army.members.find(m => m.heroId).heroId = '12345678'; army.leaderId = '12345678';
  assert.equal(restoreUnits(JSON.stringify([army]), { infantry: 100, archer: 100, scout: 0 }, 0).length, 1);
  const target = { id: 'test-garrison', kind: 'garrison', state: 'defended', x: 40, z: 0, loot: { apple: 1 } };
  const attacking = { ...army, position: { x: 40, z: 0 }, activity: { action: 'attack', targetId: target.id, targetLabel: 'Garrison' } };
  const session = createBattleSession(attacking, target, roster.axies);
  const restoredSession = restoreBattleSave(JSON.stringify({ active: session, report: null }), { infantry: 100, archer: 100, scout: 0 }).active;
  assert.ok(restoredSession, 'roster Axie battles resume after reload');
  assert.equal(restoredSession.battle.fighters.find(f => f.heroId).appearance.newGenes, genes);
  const recording = beginReplay(createBattle(army, 18, roster.axies));
  roster.axies[0].newGenes = 'changed';
  const fighter = replayBattleAt(restoreReplay(JSON.parse(JSON.stringify(recording))), 0).fighters.find(f => f.heroId);
  assert.equal(fighter.appearance.newGenes, genes);
  assert.equal(fighter.name, 'Roster Axie');
  const requests = [];
  global.fetch = async url => { requests.push(url); return { ok: true, json: async () => ({ genes }) }; };
  await createBattleAppearanceResolver(new AbortController().signal)(fighter);
  assert.deepEqual(requests, ['/api/axies/decode?genes=' + encodeURIComponent(genes)]);
  requests.length = 0;
  global.fetch = async url => {
    requests.push(url);
    return { ok: true, json: async () => url.startsWith('/api/axies?') ? { data: { axies: { total: 2, results: [{ id: '999', newGenes: '0x999' }, { id: fighter.heroId, newGenes: genes }] } } } : { genes } };
  };
  await createBattleAppearanceResolver(new AbortController().signal)({ ...fighter, appearance: undefined });
  assert.equal(requests[1], '/api/axies/decode?genes=' + encodeURIComponent(genes), 'old replay resolves matching ID, not first roster entry');
  const saved = new Map([[AXIE_ROSTER_SAVE_KEY, JSON.stringify(roster)]]);
  const storage = { get length() { return saved.size; }, key: i => [...saved.keys()][i] ?? null, removeItem: key => saved.delete(key) };
  resetGame(storage);
  assert.equal(restoreAxieRoster(saved.get(AXIE_ROSTER_SAVE_KEY) ?? null), null);

  const engine = new NullEngine();
  const scene = new Scene(engine);
  const realLoad = SceneLoader.LoadAssetContainerAsync;
  SceneLoader.LoadAssetContainerAsync = (root, url, targetScene) => realLoad.call(SceneLoader, '', 'data:base64,' + fs.readFileSync(path.join('public', url)).toString('base64'), targetScene, undefined, '.glb');
  global.fetch = async url => {
    const data = fs.readFileSync(path.join('public', url));
    return { ok: true, json: async () => JSON.parse(data), arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  };
  const plan = await buildStarterAxiePlan('plant');
  assert.equal(plan.parts.length, 6);
  const mixer = new BabylonAxieMixer(scene);
  const first = await mixer.create(plan);
  const second = await mixer.create(plan);
  assert.equal(first.attachedPartCount, plan.parts.reduce((n, part) => n + part.rigs.length, 0));
  first.root.computeWorldMatrix(true);
  for (const mesh of first.root.getChildMeshes()) mesh.computeWorldMatrix(true);
  const bounds = first.root.getHierarchyBoundingVectors();
  console.log('Assembled bounds:', bounds.min.toString(), bounds.max.toString());
  assert.ok(bounds.max.subtract(bounds.min).length() < 5, 'socket-local parts must stay at Axie scale');
  const bone = first.root.getDescendants().find(n => n.name === 'Hip_JNT');
  first.update('approaching', 0);
  first.update('approaching', 0.2);
  const moved = bone.rotationQuaternion.clone();
  first.update('approaching', 0.4);
  assert.ok(!bone.rotationQuaternion.equals(moved), 'run clip moves the skeleton');
  const secondBone = second.root.getDescendants().find(n => n.name === 'Hip_JNT');
  assert.notEqual(secondBone, bone);
  assert.notEqual(first.root.getChildMeshes()[0].material, second.root.getChildMeshes()[0].material, 'palette materials are isolated');
  first.update('attacking', 0.6);
  first.update('attacking', 0.8);
  const attacked = bone.rotationQuaternion.clone();
  first.update('holding', 0);
  assert.ok(!bone.rotationQuaternion.equals(attacked), 'replay restart resets the pose');
  console.log('Front socket:', first.root.getDescendants().find(n => n.name === 'Root_Mouth_M_JNT').getAbsolutePosition().toString());
  first.dispose(); second.dispose();
  for (const [id, body] of Object.entries(require('../public/assets/axie/manifest.json').assets.bodies)) {
    if (id !== 'normal') livePlans.push({ ...plan, body: { id, assetAvailable: true, lod: body.lods[0], animationUrl: body.animations.lite.url } });
  }
  for (const livePlan of livePlans) {
    const avatar = await mixer.create(livePlan);
    assert.ok(avatar.attachedPartCount >= 6);
    avatar.update('approaching', 0); avatar.update('approaching', 0.2);
    avatar.update('attacking', 0.4); avatar.update('attacking', 0.6);
    console.log(`Additional model assembled and animated: ${avatar.bodyId}, ${avatar.attachedPartCount} rigs`);
    avatar.dispose();
  }
  mixer.dispose();
  await Promise.resolve();
  assert.equal(scene.animationGroups.length, 0);
  assert.equal(scene.skeletons.length, 0);
  assert.equal(scene.meshes.length, 0);
  const assetFetch = global.fetch;
  global.fetch = async url => url.startsWith('/api/axies/decode?') ? { ok: true, json: async () => ({ ...plan, genes: new URL(url, 'http://local').searchParams.get('genes') }) } : assetFetch(url);
  const renderer = createBattleRenderer(scene);
  const battle = createBattle(army, 18, [{ ...roster.axies[0], newGenes: genes }]);
  renderer.update(battle, null, DEFAULT_BATTLE_OVERLAYS, false);
  assert.equal(renderer.isReady(), false, 'replay waits for avatar requests');
  const deadline = Date.now() + 10000;
  while (!renderer.isReady() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(renderer.isReady(), true);
  assert.deepEqual(renderer.errors, []);
  const model = renderer.models.get(fighter.id);
  assert.ok(model.avatar, 'numeric roster fighter receives a real model');
  assert.equal(model.avatar.genes, genes);
  assert.equal(model.fallback.isEnabled(), false);
  assert.equal(model.body.position.y + model.avatar.root.position.y, 0, 'model root stands on battlefield');
  renderer.dispose();
  await Promise.resolve();
  global.fetch = async () => ({ ok: false, status: 503 });
  const failed = createBattleRenderer(scene);
  failed.update(battle, null, DEFAULT_BATTLE_OVERLAYS, false);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(failed.isReady(), true, 'failure does not block playback');
  assert.equal(failed.errors.length, 1, 'failed model is reported to replay UI');
  failed.dispose();
  scene.dispose(); engine.dispose();
  console.log('PASS: roster identity, replay snapshots, reset, real GLB sockets, skeletal animation and disposal');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
