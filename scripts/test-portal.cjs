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
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name => load(path.resolve(path.dirname(file), name.endsWith('.json') ? name : `${name}.ts`)),
    module,
    module.exports
  );
  return module.exports;
}

const portal = load('src/game/portal.ts');
const { resetGame, RESETTABLE_MODULES } = load('src/game/reset.ts');

console.log('Testing portal configuration loading...');
const config = portal.restorePortalConfig(null);
assert.equal(config.enabled, true);
assert.equal(config.initialPortalCoordinate.x, 79.7);
assert.equal(config.initialPortalCoordinate.y, -16.5);
assert.equal(config.initialAttackInSeconds, 30);
assert.equal(config.attackIntervalSeconds, 5);
assert.equal(config.exhaustedEveryMobLevel, 5);
assert.equal(config.exhaustedSeconds, 30);
assert.equal(config.starterMobCount, 6);
assert.equal(config.maxMoveSpeed, 5.0);
assert.equal(config.portalLevelScaling.statsMultiplierPerLevel, 1.15);
assert.equal(config.portalLevelScaling.mobsCountMultiplierPerLevel, 1.15);
assert.equal(config.portalLevelScaling.summonNewPortalEveryLevel, 10);
assert.equal(config.portalLevelScaling.newPortalIndependentLevel, true);
assert.equal(config.mobTypes.mascot.baseStats.health, 150);
assert.equal(config.mobTypes.soldier.baseStats.health, 220);
assert.equal(config.mobTypes.archer.baseStats.health, 110);

console.log('Testing level scaling calculations...');
const lvl1Count = portal.calculateLevelMobCount(1, config);
assert.equal(lvl1Count, 6);
const lvl2Count = portal.calculateLevelMobCount(2, config);
assert.equal(lvl2Count, Math.round(6 * 1.15)); // 7
const lvl5Count = portal.calculateLevelMobCount(5, config);
assert.equal(lvl5Count, Math.round(6 * Math.pow(1.15, 4))); // 10 or 11

const lvl1MascotStats = portal.calculateLevelStats(config.mobTypes.mascot.baseStats, 1, config);
assert.equal(lvl1MascotStats.health, 150);
assert.equal(lvl1MascotStats.attack, 20);

const lvl5MascotStats = portal.calculateLevelStats(config.mobTypes.mascot.baseStats, 5, config);
assert.ok(lvl5MascotStats.health > 150);
assert.ok(lvl5MascotStats.attack > 20);
assert.ok(lvl5MascotStats.moveSpeed <= config.maxMoveSpeed);

console.log('Testing randomized formation generation...');
for (let lvl = 1; lvl <= 12; lvl++) {
  const formation = portal.generateWaveFormation(lvl, config);
  assert.equal(formation.level, lvl);
  assert.equal(formation.totalMobs, portal.calculateLevelMobCount(lvl, config));
  assert.equal(formation.totalMascot + formation.totalSoldier + formation.totalArcher, formation.totalMobs);
  assert.ok(formation.totalMascot >= 1);

  // Check that slots quantities match totals
  const mascotSlotCount = formation.slots.filter(s => s.kind === 'mascot').reduce((sum, s) => sum + s.count, 0);
  const soldierSlotCount = formation.slots.filter(s => s.kind === 'soldier').reduce((sum, s) => sum + s.count, 0);
  const archerSlotCount = formation.slots.filter(s => s.kind === 'archer').reduce((sum, s) => sum + s.count, 0);

  assert.equal(mascotSlotCount, formation.totalMascot);
  assert.equal(soldierSlotCount, formation.totalSoldier);
  assert.equal(archerSlotCount, formation.totalArcher);

  // Check positioning
  formation.slots.forEach(slot => {
    if (slot.kind === 'mascot') assert.equal(slot.row, 1);
    if (slot.kind === 'soldier') assert.equal(slot.row, 2);
    if (slot.kind === 'archer') assert.equal(slot.row, 0);
  });
}

console.log('Testing portal state cycle & step logic...');
let now = 1000000;
let state = portal.createInitialPortalState(config, now);
assert.equal(state.portals.length, 1);
assert.equal(state.portals[0].level, 1);
assert.equal(state.portals[0].cycleState, 'initial_countdown');
assert.equal(state.portals[0].nextAttackTime, now + 30000);

// Advance before countdown expires -> no spawn
let step = portal.stepPortalSystem(now + 10000, state, config, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 0);
assert.equal(step.state.portals[0].level, 1);

// Advance past countdown -> wave 1 spawns!
now += 30001;
step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 1);
assert.equal(step.newMarchesSpawned[0].level, 1);
assert.equal(step.state.portals[0].level, 2);
// Since level 1 just finished and 1 % 5 !== 0, cycleState should be interval_countdown
assert.equal(step.state.portals[0].cycleState, 'interval_countdown');
assert.equal(step.state.portals[0].nextAttackTime, now + 5000);
state = step.state;

// Advance through waves until level 5 exhaustion
for (let lvl = 2; lvl <= 5; lvl++) {
  now = state.portals[0].nextAttackTime + 1;
  step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
  state = step.state;
}
assert.equal(state.portals[0].level, 6);
assert.equal(state.portals[0].cycleState, 'exhausted');
assert.equal(state.portals[0].nextAttackTime, now + 30000);

console.log('Testing level 10 multi-portal summoning...');
// Advance up to level 10 finish
while (state.portals[0].level <= 10) {
  now = state.portals[0].nextAttackTime + 1;
  step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
  state = step.state;
}
// Now portal 1 finished level 10, so a second portal must be summoned!
assert.ok(state.portals.length >= 2, `Expected at least 2 portals, got ${state.portals.length}`);
const secondPortal = state.portals[1];
assert.equal(secondPortal.level, 1, 'New portal must start at level 1 when newPortalIndependentLevel is true');
assert.notEqual(secondPortal.coordinate.x, config.initialPortalCoordinate.x);

console.log('Testing march arrival & disappearance...');
const march = state.activeEnemyMarches[0];
assert.ok(march, 'Expected active march');
// Before arrivesAt
const midPos = portal.enemyMarchPosition(march, march.startedAt + 1000);
assert.ok(Number.isFinite(midPos.x) && Number.isFinite(midPos.z));

// After arrivesAt -> march must DISAPPEAR!
const afterArrival = portal.stepPortalSystem(march.arrivesAt + 10, state, config, { x: 0, z: 0 });
assert.ok(!afterArrival.state.activeEnemyMarches.some(m => m.id === march.id), 'March should disappear upon arrival');
assert.ok(afterArrival.arrivedMarchesCount >= 1);

console.log('Testing resetGame compliance...');
const storageData = new Map();
storageData.set(portal.PORTAL_CONFIG_SAVE_KEY, JSON.stringify({ ...config, starterMobCount: 99 }));
storageData.set(portal.PORTAL_STATE_SAVE_KEY, JSON.stringify(state));
storageData.set('other-app-data', 'keep');

const mockStorage = {
  get length() { return storageData.size; },
  key: i => [...storageData.keys()][i] ?? null,
  removeItem: k => storageData.delete(k),
};

const portalModule = RESETTABLE_MODULES.find(m => m.id === 'portal');
assert.ok(portalModule, 'Portal module must be registered in RESETTABLE_MODULES');
assert.ok(portalModule.storageKeys.includes(portal.PORTAL_CONFIG_SAVE_KEY));
assert.ok(portalModule.storageKeys.includes(portal.PORTAL_STATE_SAVE_KEY));

resetGame(mockStorage);
assert.equal(storageData.has(portal.PORTAL_CONFIG_SAVE_KEY), false);
assert.equal(storageData.has(portal.PORTAL_STATE_SAVE_KEY), false);
assert.equal(storageData.has('other-app-data'), true);

console.log('All portal tests passed successfully!');
