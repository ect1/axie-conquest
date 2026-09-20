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

console.log('Testing portal configuration loading & destroyable / maxSubportal / initialMoveSpeed...');
const config = portal.restorePortalConfig(null);
assert.equal(config.enabled, true);
assert.equal(config.initialPortalCoordinate.x, 79.7);
assert.equal(config.initialPortalCoordinate.y, -16.5);
assert.equal(config.initialAttackInSeconds, 30);
assert.equal(config.attackIntervalSeconds, 5);
assert.equal(config.exhaustedEveryMobLevel, 5);
assert.equal(config.exhaustedSeconds, 30);
assert.equal(config.starterMobCount, 6);
assert.equal(config.initialMoveSpeed, 0.5, 'initialMoveSpeed must be 0.5');
assert.equal(config.maxMoveSpeed, 20, 'maxMoveSpeed must be 20');
assert.equal(config.portalLevelScaling.statsMultiplierPerLevel, 1.15);
assert.equal(config.portalLevelScaling.mobsCountMultiplierPerLevel, 1.15);
assert.equal(config.portalLevelScaling.summonNewPortalEveryLevel, 10);
assert.equal(config.portalLevelScaling.newPortalIndependentLevel, true);
assert.equal(config.portalLevelScaling.subPortal?.destroyable, true, 'subPortal.destroyable must be true');
assert.equal(config.portalLevelScaling.subPortal?.maxSubportal, 10, 'subPortal.maxSubportal must be 10');
assert.equal(config.mobTypes.mascot.baseStats.health, 150);
assert.equal(config.mobTypes.soldier.baseStats.health, 220);
assert.equal(config.mobTypes.archer.baseStats.health, 110);

console.log('Testing computeOutsideCityDestination...');
const outsideDest = portal.computeOutsideCityDestination(config.initialPortalCoordinate, { x: 0, z: 0 });
assert.notEqual(outsideDest.x, 0);
const distFromCenter = Math.hypot(outsideDest.x, outsideDest.z);
assert.ok(distFromCenter >= 21.0, `Destination must stop outside city perimeter, got dist: ${distFromCenter}`);

console.log('Testing level scaling calculations & initialMoveSpeed in stats...');
const lvl1Count = portal.calculateLevelMobCount(1, config);
assert.equal(lvl1Count, 6);
const lvl2Count = portal.calculateLevelMobCount(2, config);
assert.equal(lvl2Count, Math.round(6 * 1.15));

const lvl1MascotStats = portal.calculateLevelStats(config.mobTypes.mascot.baseStats, 1, config);
assert.equal(lvl1MascotStats.health, 150);
assert.equal(lvl1MascotStats.attack, 20);
assert.equal(lvl1MascotStats.moveSpeed, 0.5, 'Mascot moveSpeed at level 1 must start at initialMoveSpeed (0.5)');

const lvl5MascotStats = portal.calculateLevelStats(config.mobTypes.mascot.baseStats, 5, config);
assert.ok(lvl5MascotStats.health > 150);
assert.ok(lvl5MascotStats.attack > 20);
assert.ok(lvl5MascotStats.moveSpeed > 0.5);
assert.ok(lvl5MascotStats.moveSpeed <= config.maxMoveSpeed);

console.log('Testing initial portal state & defender formation...');
let now = 1000000;
let state = portal.createInitialPortalState(config, now);
assert.equal(state.portals.length, 1);
assert.equal(state.portals[0].level, 1);
assert.equal(state.portals[0].cycleState, 'initial_countdown');
assert.equal(state.portals[0].nextAttackTime, now + 30000);
assert.ok(state.portals[0].defenderFormation, 'Defender formation must exist when destroyable is true');
assert.equal(
  state.portals[0].defenderFormation.totalMobs,
  state.portals[0].upcomingFormation.totalMobs,
  'Defender formation must match initial upcoming formation'
);

console.log('Testing sequential respawn, speed scaling, and stopping outside city...');
// Advance past countdown -> wave 1 spawns
now += 30001;
let step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 1);
const wave1 = step.newMarchesSpawned[0];
assert.equal(wave1.level, 1);
assert.equal(wave1.speed, 0.5, 'Starting march speed must be initialMoveSpeed (0.5)');
assert.equal(wave1.destination.x, outsideDest.x);
assert.equal(wave1.destination.z, outsideDest.z);
assert.equal(step.state.portals[0].cycleState, 'active_wave');
state = step.state;

// Advance time while wave 1 marches
now += 5000;
step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 0, 'No wave spawns while wave is active');
state = step.state;

// Advance time past arrival: MOBS MUST NOT DISAPPEAR!
now = wave1.arrivesAt + 10;
step = portal.stepPortalSystem(now, state, config, { x: 0, z: 0 });
assert.equal(step.arrivedMarchesCount, 1, 'Arrival detected');
assert.equal(step.state.activeEnemyMarches.length, 1, 'March must NOT disappear; must stay in activeEnemyMarches');
assert.equal(step.state.activeEnemyMarches[0].status, 'arrived', 'March status must be arrived');
assert.equal(step.state.portals[0].cycleState, 'active_wave', 'Portal must wait in active_wave while hostiles are outside city');
state = step.state;

// Position after arrival must be stationary outside the city
const pos = portal.enemyMarchPosition(state.activeEnemyMarches[0], now);
assert.equal(pos.x, outsideDest.x);
assert.equal(pos.z, outsideDest.z);

console.log('Testing defeatEnemyMarch action...');
const defeatRes = portal.defeatEnemyMarch(wave1.id, state, config, now);
assert.equal(defeatRes.state.activeEnemyMarches.length, 0, 'March removed on defeat');
assert.equal(defeatRes.state.portals[0].level, 2, 'Portal level advanced to 2');
assert.equal(defeatRes.state.portals[0].cycleState, 'interval_countdown');
assert.equal(defeatRes.state.portals[0].nextAttackTime, now + 5000);
assert.ok(defeatRes.state.portals[0].defenderFormation, 'Defender formation present on respawn');
assert.equal(
  defeatRes.state.portals[0].defenderFormation.totalMobs,
  defeatRes.state.portals[0].upcomingFormation.totalMobs,
  'Defender formation matches respawned upcoming formation'
);
state = defeatRes.state;

console.log('Testing pause respawn functionality...');
const pausedConfig = { ...config, paused: true };
now = state.portals[0].nextAttackTime + 1000;
step = portal.stepPortalSystem(now, state, pausedConfig, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 0, 'Must NOT spawn when respawn is paused');
state = step.state;

const unpausedConfig = { ...config, paused: false };
step = portal.stepPortalSystem(now, state, unpausedConfig, { x: 0, z: 0 });
assert.equal(step.newMarchesSpawned.length, 1, 'Spawns wave after unpausing');
assert.equal(step.newMarchesSpawned[0].level, 2);
state = step.state;

console.log('Testing multi-wave progression, exhaustion, and maxSubportal cap...');
function completeCurrentWave(curState, curNow) {
  const march = curState.activeEnemyMarches[0];
  assert.ok(march, 'Expected active march to complete');
  curNow = march.arrivesAt + 10;
  // Step once to register arrival outside city
  let s = portal.stepPortalSystem(curNow, curState, config, { x: 0, z: 0 });
  assert.equal(s.state.activeEnemyMarches.length, 1);
  // Defeat march
  const def = portal.defeatEnemyMarch(march.id, s.state, config, curNow);
  assert.equal(def.state.activeEnemyMarches.length, 0);
  return { state: def.state, now: curNow };
}

function spawnNextWave(curState, curNow) {
  assert.ok(!curState.activeEnemyMarches.length, 'Must have no active marches before spawning next wave');
  curNow = curState.portals[0].nextAttackTime + 10;
  const s = portal.stepPortalSystem(curNow, curState, config, { x: 0, z: 0 });
  assert.ok(s.newMarchesSpawned.length >= 1, 'Expected wave to spawn');
  return { state: s.state, now: curNow };
}

// Complete wave 2
let res = completeCurrentWave(state, now);
state = res.state;
now = res.now;

// Progress through waves 3, 4, 5
for (let lvl = 3; lvl <= 5; lvl++) {
  res = spawnNextWave(state, now);
  res = completeCurrentWave(res.state, res.now);
  state = res.state;
  now = res.now;
}

// After wave 5 finishes, portal level is 6 and cycleState is exhausted (5 % 5 === 0)
assert.equal(state.portals[0].level, 6);
assert.equal(state.portals[0].cycleState, 'exhausted');
assert.equal(state.portals[0].nextAttackTime, now + 30000);

// Advance through to level 10
for (let lvl = 6; lvl <= 10; lvl++) {
  res = spawnNextWave(state, now);
  res = completeCurrentWave(res.state, res.now);
  state = res.state;
  now = res.now;
}

// After level 10 finishes, sub-portal must be summoned
assert.ok(state.portals.length >= 2, `Expected at least 2 portals after level 10, got ${state.portals.length}`);
const subPortal = state.portals[1];
assert.equal(subPortal.level, 1, 'New portal must start at level 1');
assert.ok(subPortal.defenderFormation, 'Sub-portal must have defenderFormation when destroyable is true');

// Test maxSubportal cap: set cap to 1
const cappedConfig = {
  ...config,
  portalLevelScaling: {
    ...config.portalLevelScaling,
    summonNewPortalEveryLevel: 1, // summon every level
    subPortal: {
      destroyable: true,
      maxSubportal: 1, // already reached (1 prime + 1 subportal = 1 subportal)
    },
  },
};
const portalCountBefore = state.portals.length;
res = spawnNextWave(state, now);
// Complete wave with cappedConfig
const curMarch = res.state.activeEnemyMarches[0];
now = curMarch.arrivesAt + 10;
const capDefeat = portal.defeatEnemyMarch(curMarch.id, res.state, cappedConfig, now);
const subPortalsCount = capDefeat.state.portals.filter(p => p.id !== 'portal-prime').length;
assert.equal(subPortalsCount, 1, 'Sub-portals must NOT exceed maxSubportal (1)');

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

console.log('Testing portalFormationToBossConfig & dynamic boss registration...');
const bossesModule = load('src/game/bosses.ts');
const worldModule = load('src/game/world.ts');
const battleModule = load('src/game/battle.ts');

const sampleMarch = {
  id: 'portal-march-test-1',
  portalId: 'portal-1',
  portalName: 'Rift Portal 1',
  level: 3,
  name: 'Rift Portal 1 · Wave 3',
  ownerId: 'portal',
  origin: { x: 50, z: 50 },
  destination: { x: 10, z: 10 },
  startedAt: 1000,
  arrivesAt: 5000,
  speed: 1.0,
  formation: portal.generateWaveFormation(3, config),
  status: 'marching',
};

const bossConfig = portal.portalFormationToBossConfig(sampleMarch);
assert.equal(bossConfig.id, 'portal-boss-portal-march-test-1');
assert.equal(bossConfig.name, sampleMarch.name);
assert.equal(bossConfig.leader.modelKind, 'mascot');
assert.ok(bossConfig.leader.stats.health > 150, 'Leader stats scaled with level');
assert.ok(Array.isArray(bossConfig.military));

// Register dynamic boss
bossesModule.registerDynamicBoss(bossConfig);
const fetchedBoss = bossesModule.getBossConfig('portal-boss-portal-march-test-1');
assert.equal(fetchedBoss?.id, bossConfig.id);
assert.equal(fetchedBoss?.name, sampleMarch.name);

// Create virtual target
const virtualTarget = {
  id: sampleMarch.id,
  kind: 'boss',
  x: 10,
  z: 10,
  state: 'defended',
  loot: { apple: 0 },
  bossId: `portal-boss-${sampleMarch.id}`,
  bossName: sampleMarch.name,
};

const actions = worldModule.getWorldObjectActions(virtualTarget);
const attackAction = actions.find(a => a.action === 'attack');
assert.ok(attackAction?.enabled, 'Attack action must be enabled on hostile march target');

// Verify battle creation against this dynamic boss
const mockArmy = {
  id: 'player-army-1',
  name: 'Vanguard Army',
  kind: 'army',
  cityId: 'city-1',
  cityName: 'Everleaf Haven',
  speed: 1.2,
  position: { x: 10, z: 10 },
  status: 'holding',
  members: [
    { id: 'm-1', troopKind: 'infantry', count: 20, offset: { x: 0, z: 0 } },
    { id: 'm-2', troopKind: 'archer', count: 15, offset: { x: 1, z: 0 } },
  ],
};

const battle = battleModule.createBattle(mockArmy, virtualTarget, []);
assert.ok(battle, 'Battle must be created against dynamic portal boss');
assert.ok(battle.fighters.some(f => f.side === 'enemy' && f.isBoss), 'Enemy boss fighter present in battle');
assert.ok(battle.fighters.some(f => f.side === 'enemy' && f.troopKind === 'soldier'), 'Enemy soldier fighters present');
assert.ok(battle.fighters.some(f => f.side === 'enemy' && f.troopKind === 'archer'), 'Enemy archer fighters present');
assert.ok(battle.fighters.some(f => f.side === 'player'), 'Player fighters present');

// Stepping battle
let stepped = battleModule.stepBattle(battle);
assert.equal(stepped.tick, 1);

// Test clearDynamicBosses
bossesModule.clearDynamicBosses();
assert.equal(bossesModule.getBossConfig('portal-boss-portal-march-test-1'), undefined, 'Dynamic bosses cleared');

console.log('Testing fighting status position freeze & resume on battle...');
const fightingMarch = {
  ...sampleMarch,
  id: 'portal-march-fighting-test',
  status: 'fighting',
  fightingPosition: { x: 33.3, z: 22.2 },
};

// Even if now advances far past arrivesAt, position must remain frozen at fightingPosition
const frozenPos = portal.enemyMarchPosition(fightingMarch, 9999999);
assert.equal(frozenPos.x, 33.3, 'Fighting march position must freeze at fightingPosition');
assert.equal(frozenPos.y, undefined);
assert.equal(frozenPos.z, 22.2);

// stepPortalSystem must NOT mark fighting march as arrived
const fightingState = {
  portals: [state.portals[0]],
  activeEnemyMarches: [fightingMarch],
};
const stepFighting = portal.stepPortalSystem(9999999, fightingState, config, { x: 0, z: 0 });
assert.equal(stepFighting.state.activeEnemyMarches[0].status, 'fighting', 'Fighting march stays fighting');
assert.equal(stepFighting.arrivedMarchesCount, 0, 'Fighting march does not trigger arrived count');

console.log('Testing subportal attack, defense garrison, and destruction...');
// Take subportal generated earlier
assert.ok(subPortal, 'Subportal must exist from previous test phase');
assert.equal(subPortal.id, 'portal-2');

const subPortalBossCfg = portal.subPortalDefenderToBossConfig(subPortal);
assert.equal(subPortalBossCfg.id, 'subportal-boss-portal-2');
assert.ok(subPortalBossCfg.name.includes('Defenders'));
assert.equal(subPortalBossCfg.leader.modelKind, 'mascot');
assert.ok(subPortalBossCfg.military.length > 0, 'Subportal garrison must have military squads');

bossesModule.registerDynamicBoss(subPortalBossCfg);
const fetchedSubportalBoss = bossesModule.getBossConfig('subportal-boss-portal-2');
assert.equal(fetchedSubportalBoss?.id, subPortalBossCfg.id);

// Target subportal virtual world object
const subPortalTarget = {
  id: subPortal.id,
  kind: 'boss',
  x: subPortal.coordinate.x,
  z: subPortal.coordinate.z,
  state: 'defended',
  loot: { apple: 50 },
  bossId: `subportal-boss-${subPortal.id}`,
  bossName: `${subPortal.name} Defenders`,
};

const subActions = worldModule.getWorldObjectActions(subPortalTarget);
assert.ok(subActions.find(a => a.action === 'attack')?.enabled, 'Subportal must be attackable');

// Create battle against subportal defenders
const subBattle = battleModule.createBattle(mockArmy, subPortalTarget, []);
assert.ok(subBattle, 'Battle against subportal created');
assert.ok(subBattle.fighters.some(f => f.side === 'enemy' && f.isBoss), 'Subportal guardian boss present');
assert.ok(subBattle.fighters.some(f => f.side === 'enemy' && (f.troopKind === 'soldier' || f.troopKind === 'archer')), 'Subportal defenders present');

// Destroy subportal - remaining spawned mobs must remain until killed in battle
const stateWithSubportal = {
  portals: [state.portals[0], subPortal],
  activeEnemyMarches: [
    { ...sampleMarch, id: 'sub-march-1', portalId: subPortal.id },
    { ...sampleMarch, id: 'prime-march-1', portalId: state.portals[0].id },
  ],
};

const destroyNow = 100000;
const destroyRes = portal.destroySubPortal(subPortal.id, stateWithSubportal, config, destroyNow);
assert.equal(destroyRes.state.portals.length, 1, 'Subportal removed from active portals list');
assert.equal(destroyRes.state.portals[0].id, state.portals[0].id, 'Prime portal remains intact');
assert.equal(destroyRes.destroyedPortal?.id, subPortal.id);
assert.equal(destroyRes.state.activeEnemyMarches.length, 2, 'Spawned marches from destroyed subportal MUST REMAIN in world until killed');
assert.ok(destroyRes.state.activeEnemyMarches.some(m => m.id === 'sub-march-1'), 'Active subportal march preserved on map');

// Verify timed respawn record (lastDestroyedRespwanOnTimer)
assert.ok(destroyRes.state.lastDestroyedSubportal, 'lastDestroyedSubportal record must be created');
assert.equal(destroyRes.state.lastDestroyedSubportal.id, subPortal.id);
assert.equal(destroyRes.state.lastDestroyedSubportal.level, 1, 'lastDestroyedBackToLevel1: true resets level to 1');
assert.ok(destroyRes.state.lastDestroyedSubportal.respawnAt > destroyNow, 'respawnAt scheduled on timer');

console.log('Testing timed respawn execution in stepPortalSystem...');
// Before timer expires, subportal should not respawn
const stepBefore = portal.stepPortalSystem(destroyNow + 1000, destroyRes.state, config, { x: 0, z: 0 });
assert.equal(stepBefore.state.portals.length, 1, 'Subportal has not respawned yet');
assert.ok(stepBefore.state.lastDestroyedSubportal, 'Pending respawn still tracked');

// After timer expires, subportal must respawn back into portals as Level 1
const respawnTime = destroyRes.state.lastDestroyedSubportal.respawnAt;
const stepAfter = portal.stepPortalSystem(respawnTime, destroyRes.state, config, { x: 0, z: 0 });
assert.equal(stepAfter.state.portals.length, 2, 'Subportal has respawned back into portals list');
const respawned = stepAfter.state.portals.find(p => p.id === subPortal.id);
assert.ok(respawned, 'Respawned subportal found by id');
assert.equal(respawned.level, 1, 'Respawned subportal is Level 1');
assert.equal(respawned.cycleState, 'initial_countdown', 'Respawned subportal enters initial countdown');
assert.equal(stepAfter.state.lastDestroyedSubportal, null, 'Pending respawn cleared once executed');

// Verify dynamic boss was automatically registered for the respawned subportal
const respawnedBoss = bossesModule.getBossConfig(`subportal-boss-${subPortal.id}`);
assert.ok(respawnedBoss, 'Dynamic boss registered for respawned subportal');
assert.ok(respawnedBoss.name.includes('Defenders'));

// Verify lastDestroyedBackToLevel1: false preserves destroyed level
const configKeepLevel = {
  ...config,
  portalLevelScaling: {
    ...config.portalLevelScaling,
    subPortal: {
      ...config.portalLevelScaling.subPortal,
      lastDestroyedBackToLevel1: false,
    },
  },
};
const highLevelSubportal = { ...subPortal, id: 'portal-high', level: 7 };
const highState = {
  portals: [state.portals[0], highLevelSubportal],
  activeEnemyMarches: [],
};
const highDestroyRes = portal.destroySubPortal('portal-high', highState, configKeepLevel, destroyNow);
assert.equal(highDestroyRes.state.lastDestroyedSubportal.level, 7, 'Preserves level 7 when lastDestroyedBackToLevel1 is false');

console.log('All portal tests passed successfully!');
