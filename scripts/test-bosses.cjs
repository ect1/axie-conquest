const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.json')) {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Object.assign(raw, { default: raw });
  }
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name.endsWith('.json') ? name : `${name}.ts`)) : require(name),
    module,
    module.exports
  );
  return module.exports;
}

const bosses = load('src/game/bosses.ts');
const b = load('src/game/battle.ts');
const world = load('src/game/world.ts');
const save = load('src/game/battle-save.ts');

console.log('--- Testing Boss Config and Lineup ---');
const allBosses = bosses.getAllBosses();
assert.ok(allBosses.length >= 2, 'Boss lineup contains multiple bosses');

const kotaro = bosses.getBossConfig('kotaro');
assert.ok(kotaro, 'Kotaro boss exists in config');
assert.equal(kotaro.name, 'Kotaro');
assert.equal(kotaro.leader.name, 'Kotaro');
assert.equal(kotaro.leader.mascotId, 'kotaro');
assert.equal(kotaro.leader.initialCount, 1);
assert.equal(kotaro.leader.position.row, 1);
assert.equal(kotaro.leader.position.column, 2);
assert.equal(kotaro.leader.stats.health, 1200);
assert.equal(kotaro.leader.stats.attack, 48);
assert.equal(kotaro.military.length, 3, 'Kotaro has 3 escort military squads');
assert.equal(kotaro.military[0].troopKind, 'infantry');
assert.equal(kotaro.military[0].count, 12);
assert.equal(kotaro.military[2].troopKind, 'archer');
assert.equal(kotaro.military[2].count, 8);

console.log('--- Testing World Generation with Boss Config ---');
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const worldObjects = world.generateWorld(world.DEFAULT_GENERATION, seeded(42));
const bossObjects = worldObjects.filter(o => o.kind === 'boss');
assert.equal(bossObjects.length, world.DEFAULT_GENERATION.counts.boss);
for (const bossObj of bossObjects) {
  assert.ok(bossObj.bossId, 'Boss world object has assigned bossId');
  assert.ok(bossObj.bossName, 'Boss world object has assigned bossName');
  assert.ok(['Kotaro', 'Paladill'].includes(bossObj.bossName), `Boss name ${bossObj.bossName} is valid`);
}

// Test world restoration retains bossId and bossName
const restoredWorld = world.restoreWorld(JSON.stringify(worldObjects));
assert.ok(restoredWorld);
const restoredBoss = restoredWorld.find(o => o.kind === 'boss');
assert.ok(restoredBoss);
assert.equal(restoredBoss.bossId, bossObjects[0].bossId);
assert.equal(restoredBoss.bossName, bossObjects[0].bossName);

console.log('--- Testing Battle Generation with Kotaro Boss ---');
const army = b.createSandboxArmy('balanced');
const bossTarget = {
  id: 'world-boss-1',
  kind: 'boss',
  x: 50,
  z: 0,
  state: 'defended',
  loot: { apple: 0 },
  bossId: 'kotaro',
  bossName: 'Kotaro',
};

const battle = b.createBattle(army, bossTarget);
assert.equal(battle.version, 1);

const enemyFighters = battle.fighters.filter(f => f.side === 'enemy');
assert.equal(enemyFighters.length, 4, 'Enemy side has leader + 3 escort squads');

// Leader assertion
const leaderFighter = enemyFighters.find(f => f.isBoss);
assert.ok(leaderFighter, 'Leader fighter is flagged as isBoss');
assert.equal(leaderFighter.id, 'enemy:boss:kotaro');
assert.equal(leaderFighter.name, 'Kotaro');
assert.equal(leaderFighter.mascotId, 'kotaro');
assert.equal(leaderFighter.initialCount, 1);
assert.equal(leaderFighter.maxHp, 1200);
assert.equal(leaderFighter.hp, 1200);
assert.equal(leaderFighter.stats.attack, 48);
assert.equal(leaderFighter.facing, Math.PI, 'Leader faces south toward player');

// Military escort assertions
const escortInfantry = enemyFighters.filter(f => f.troopKind === 'infantry');
assert.equal(escortInfantry.length, 2, '2 vanguard infantry squads');
assert.equal(escortInfantry[0].initialCount, 12);
assert.equal(escortInfantry[1].initialCount, 12);

const escortArchers = enemyFighters.filter(f => f.troopKind === 'archer');
assert.equal(escortArchers.length, 1, '1 bowmen squad');
assert.equal(escortArchers[0].initialCount, 8);

console.log('--- Testing Battle Simulation against Boss ---');
let sim = battle;
for (let i = 0; i < 30; i++) {
  sim = b.stepBattle(sim);
}
assert.ok(sim.tick === 30);
assert.ok(sim.fighters.some(f => f.hp < f.maxHp), 'Units took damage during combat');

console.log('--- Testing Battle Session Save & Validation for Boss ---');
const attackingArmy = {
  ...army,
  position: { x: 50, z: 0 },
  activity: { action: 'attack', targetId: bossTarget.id, targetLabel: 'Kotaro' },
};
const troops = { infantry: 100, archer: 100, scout: 0 };
let session = save.createBattleSession(attackingArmy, bossTarget);
for (let i = 0; i < 20; i++) session = { ...session, battle: b.stepBattle(session.battle) };

const restored = save.restoreBattleSave(JSON.stringify({ active: session, report: null }), troops).active;
assert.ok(restored, 'Boss battle session restored successfully');
assert.equal(restored.battle.fighters.length, battle.fighters.length, 'Restored battle has identical fighter count');
assert.ok(restored.battle.fighters.some(f => f.isBoss && f.mascotId === 'kotaro'), 'Restored battle retains Kotaro boss');

console.log('--- Testing Kotaro 3D Mascot Asset and Mixer Attachment ---');
const { NullEngine, Scene, ArcRotateCamera, Vector3 } = require('@babylonjs/core');
require('@babylonjs/loaders');
const { BabylonMascotMixer } = load('src/game/mascot/mascot-mixer.ts');

assert.ok(fs.existsSync('public/assets/mascot/mascots/kotaro.glb'), 'kotaro.glb exists');
assert.ok(fs.existsSync('public/assets/mascot/equipment/kotaro-sword.glb'), 'kotaro-sword.glb exists');

async function testKotaroMixer() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new ArcRotateCamera('cam', 0, 0, 10, Vector3.Zero(), scene);

  // Mock source method to load local files in Node test environment
  const mixer = new BabylonMascotMixer(scene);
  const oldSource = mixer.source.bind(mixer);
  mixer.source = async (url) => {
    const localPath = path.resolve('public', url.startsWith('/') ? url.slice(1) : url);
    const buf = fs.readFileSync(localPath);
    const base64 = 'data:model/gltf-binary;base64,' + buf.toString('base64');
    return oldSource(base64);
  };

  const avatar = await mixer.create('kotaro');
  assert.equal(avatar.mascotId, 'kotaro');
  assert.ok(avatar.root, 'Kotaro root TransformNode exists');
  assert.ok(avatar.root.getChildMeshes().length >= 2, 'Contains body geometry and attached sword mesh');
  
  // Verify animations
  avatar.update('attacking', 0);
  scene.render();
  avatar.update('marching', 0.5);
  scene.render();
  avatar.update('defeated', 1.0);
  scene.render();

  avatar.dispose();
  mixer.dispose();
  scene.dispose();
  engine.dispose();
  console.log('PASS: Kotaro 3D asset loaded, animated, and sword attached successfully');
}

testKotaroMixer().then(() => {
  console.log('PASS: Boss lineup, leader & escort formation, hex coordinates, world generation, battle validation, and 3D mascot rendering');
}).catch(err => {
  console.error(err);
  process.exitCode = 1;
});
