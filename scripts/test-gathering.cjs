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

const g = load('src/game/gathering.ts');
const u = load('src/game/units.ts');
const w = load('src/game/world.ts');
const f = load('src/game/offense-formations.ts');
const { STARTER_HEROES } = load('src/game/heroes.ts');
const r = load('src/game/resource-spawn-config.ts');

console.log('Running resource gathering test suite...');

// 1. Army Load Capacity Calculations
const testMembers = [
  { id: 'hero-1', heroId: 'ember', count: 1, offset: { x: 0, z: 0 } },
  { id: 'inf-1', troopKind: 'infantry', count: 10, offset: { x: 1, z: 0 } },
  { id: 'arc-1', troopKind: 'archer', count: 5, offset: { x: 2, z: 0 } },
];
// Hero (50) + 10*15 (150) + 5*10 (50) = 250
const standardLoad = g.calculateArmyLoadCapacity(testMembers);
assert.equal(standardLoad, 250, 'Standard army load capacity matches formula');

// Beast commander gives +30% load: 250 * 1.3 = 325
const beastLoad = g.calculateArmyLoadCapacity(testMembers, 'beast');
assert.equal(beastLoad, 325, 'Beast commander passive increases load capacity by 30%');

// 2. Gather Rate Calculations with Axie Passives
const baseFarmRate = 5;
const plantFarmRate = g.calculateGatherRate('farm', baseFarmRate, 'plant');
assert.equal(plantFarmRate, 6.25, 'Plant commander receives +25% gather rate on Farm');

const plantStoneRate = g.calculateGatherRate('stone', 4, 'plant');
assert.equal(plantStoneRate, 4, 'Plant commander has normal gather rate on Stone');

const bugStoneRate = g.calculateGatherRate('stone', 4, 'bug');
assert.equal(bugStoneRate, 5, 'Bug commander receives +25% gather rate on Stone');

const bugOilRate = g.calculateGatherRate('oil', 2, 'bug');
assert.equal(bugOilRate, 2.5, 'Bug commander receives +25% gather rate on Oil');

// 3. Resource Mapping
assert.equal(g.nodeKindToCityResource('farm'), 'food');
assert.equal(g.nodeKindToCityResource('lumber'), 'wood');
assert.equal(g.nodeKindToCityResource('stone'), 'stone');
assert.equal(g.nodeKindToCityResource('oil'), 'warSupplies');
assert.equal(g.nodeKindToCityResource('boss'), null);

// 4. Gathering Step Execution
const node = {
  id: 'test-farm',
  kind: 'farm',
  x: 50,
  z: 50,
  state: 'available',
  loot: { apple: 0 },
  currentCapacity: 100,
  maxCapacity: 100,
};

const gatheringUnit = {
  id: 'gatherer-1',
  kind: 'army',
  ownerId: 'player',
  cityId: 'home',
  name: 'Gathering Unit',
  home: { x: 0, z: 0 },
  position: { x: 50, z: 50 },
  speed: 10,
  members: testMembers,
  order: null,
  status: 'gathering',
  cargo: { resource: 'food', amount: 0, maxLoad: 50 },
};

// Step 2 seconds of gathering at base 5/s = 10 resources
const step1 = g.stepUnitGathering(gatheringUnit, node, 2000, 1000);
assert.equal(step1.gatheredAmount, 10);
assert.equal(step1.updatedUnit.cargo.amount, 10);
assert.equal(step1.updatedNode.currentCapacity, 90);
assert.equal(step1.isFull, false);
assert.equal(step1.isDepleted, false);

// Gather until capacity full (needs 40 more, 8 seconds at 5/s)
const step2 = g.stepUnitGathering(step1.updatedUnit, step1.updatedNode, 8000, 9000);
assert.equal(step2.gatheredAmount, 40);
assert.equal(step2.updatedUnit.cargo.amount, 50);
assert.equal(step2.updatedNode.currentCapacity, 50);
assert.equal(step2.isFull, true, 'Unit flags isFull when load capacity is reached');

// Test node depletion
const lowNode = { ...node, currentCapacity: 15 };
const smallLoadUnit = { ...gatheringUnit, cargo: { resource: 'food', amount: 0, maxLoad: 500 } };
const stepDeplete = g.stepUnitGathering(smallLoadUnit, lowNode, 4000, 15000);
assert.equal(stepDeplete.gatheredAmount, 15);
assert.equal(stepDeplete.updatedUnit.cargo.amount, 15);
assert.equal(stepDeplete.updatedNode.currentCapacity, 0);
assert.equal(stepDeplete.isDepleted, true, 'Node flags isDepleted when capacity hits 0');
assert.ok(stepDeplete.updatedNode.respawnAt > 15000, 'Respawn timer initialized');

// 5. Depleted Node Actions
const depletedActions = w.getWorldObjectActions(stepDeplete.updatedNode);
const gatherAction = depletedActions.find(a => a.action === 'gather');
assert.equal(gatherAction.enabled, false, 'Gather action disabled when node is depleted');

// 6. World Resource Respawn Step
const now = 20000;
const respawnResultBefore = w.stepWorldResourceRespawn([stepDeplete.updatedNode], now);
assert.equal(respawnResultBefore.changed, false, 'Node does not respawn prematurely');

const respawnResultAfter = w.stepWorldResourceRespawn([stepDeplete.updatedNode], stepDeplete.updatedNode.respawnAt + 1000);
assert.equal(respawnResultAfter.changed, true, 'Node respawns when respawnAt time reached');
assert.equal(respawnResultAfter.objects[0].currentCapacity, stepDeplete.updatedNode.maxCapacity, 'Node restored to max capacity');
assert.equal(respawnResultAfter.objects[0].respawnAt, undefined, 'Respawn timer cleared');

// 7. Unit Settle to Gathering Transition
const dispatchedMarch = {
  ...gatheringUnit,
  status: 'moving',
  order: {
    kind: 'move',
    origin: { x: 0, z: 0 },
    destination: { x: 50, z: 50 },
    startedAt: 0,
    arrivesAt: 5000,
    activity: { action: 'gather', targetId: node.id, targetLabel: 'Wild Farm' },
  },
};
const settledArrival = u.settleUnit(dispatchedMarch, 5000);
assert.equal(settledArrival.status, 'gathering', 'Arriving at gather destination transitions status to gathering');

// 8. Manual Early Return preserves cargo
const earlyReturn = u.commandUnit(step1.updatedUnit, 'return', 6000);
assert.equal(earlyReturn.status, 'returning');
assert.deepEqual(earlyReturn.cargo, step1.updatedUnit.cargo, 'Cargo preserved on early return order');
assert.deepEqual(earlyReturn.order.destination, earlyReturn.home, 'Heads home to base');

const settledHome = u.settleUnit(earlyReturn, earlyReturn.order.arrivesAt);
assert.equal(settledHome.status, 'home', 'Arrived home settles unit');
assert.deepEqual(settledHome.cargo, step1.updatedUnit.cargo, 'Cargo available at home for deposition');

// 9. Serialization and Restoration
const restoredUnits = u.restoreUnits(JSON.stringify([step1.updatedUnit]), { infantry: 100, archer: 100, scout: 10 }, 1000);
assert.equal(restoredUnits.length, 1);
assert.equal(restoredUnits[0].status, 'gathering');
assert.deepEqual(restoredUnits[0].cargo, step1.updatedUnit.cargo);

const restoredWorld = w.restoreWorld(JSON.stringify([step1.updatedNode]));
assert.equal(restoredWorld.length, 1);
assert.equal(restoredWorld[0].currentCapacity, 90);
assert.equal(restoredWorld[0].maxCapacity, 100);

// 10. Multi-formation simultaneous gathering (2+ formations gathering concurrently)
const formationNode = {
  id: 'shared-node-1',
  kind: 'lumber',
  x: 30,
  z: 30,
  state: 'available',
  loot: { apple: 0 },
  currentCapacity: 300,
  maxCapacity: 300,
};

const unitFormation1 = {
  id: 'formation-1',
  kind: 'army',
  ownerId: 'player',
  cityId: 'home',
  name: 'Everleaf Haven · Formation 1',
  home: { x: 0, z: 0 },
  position: { x: 30, z: 30 },
  speed: 10,
  formationIndex: 0,
  leaderId: 'ember',
  members: [{ id: 'hero-ember', heroId: 'ember', count: 1, offset: { x: 0, z: 0 } }, { id: 'inf-f1', troopKind: 'infantry', count: 10, offset: { x: 1, z: 0 } }],
  order: null,
  status: 'gathering',
  cargo: { resource: 'wood', amount: 0, maxLoad: 100 },
};

const unitFormation2 = {
  id: 'formation-2',
  kind: 'army',
  ownerId: 'player',
  cityId: 'home',
  name: 'Everleaf Haven · Formation 2',
  home: { x: 0, z: 0 },
  position: { x: 30, z: 30 },
  speed: 10,
  formationIndex: 1,
  leaderId: 'bubba',
  members: [{ id: 'hero-bubba', heroId: 'bubba', count: 1, offset: { x: 0, z: 0 } }, { id: 'arc-f2', troopKind: 'archer', count: 10, offset: { x: 1, z: 0 } }],
  order: null,
  status: 'gathering',
  cargo: { resource: 'wood', amount: 0, maxLoad: 100 },
};

const unitFormation3 = {
  id: 'formation-3',
  kind: 'army',
  ownerId: 'player',
  cityId: 'home',
  name: 'Everleaf Haven · Formation 3',
  home: { x: 0, z: 0 },
  position: { x: 30, z: 30 },
  speed: 10,
  formationIndex: 2,
  leaderId: 'sparky',
  members: [{ id: 'hero-sparky', heroId: 'sparky', count: 1, offset: { x: 0, z: 0 } }, { id: 'sct-f3', troopKind: 'scout', count: 10, offset: { x: 1, z: 0 } }],
  order: null,
  status: 'gathering',
  cargo: { resource: 'wood', amount: 0, maxLoad: 100 },
};

// Simulate simultaneous gathering step for all 3 formations on the shared node
let currentSharedNode = { ...formationNode };
const activeUnits = [unitFormation1, unitFormation2, unitFormation3];
const gatheredUnits = [];

for (const activeUnit of activeUnits) {
  const simStep = g.stepUnitGathering(activeUnit, currentSharedNode, 2000, 1000);
  currentSharedNode = simStep.updatedNode;
  gatheredUnits.push(simStep.updatedUnit);
}

assert.equal(gatheredUnits.length, 3, '3 formations gathered simultaneously');
assert.ok(gatheredUnits[0].cargo.amount > 0, 'Formation 1 gathered wood');
assert.ok(gatheredUnits[1].cargo.amount > 0, 'Formation 2 gathered wood');
assert.ok(gatheredUnits[2].cargo.amount > 0, 'Formation 3 gathered wood');
assert.equal(currentSharedNode.currentCapacity, 300 - (gatheredUnits[0].cargo.amount + gatheredUnits[1].cargo.amount + gatheredUnits[2].cargo.amount), 'Shared node capacity reduced by total gathered across all formations');

// 11. Continuous Gathering Loop and Auto-Redeployment Round-Trip
// Command gather initializes repeatGather and gatherTargetId
const orderedMarch = u.commandWorldAction(
  { ...unitFormation1, position: { x: 0, z: 0 }, status: 'holding' },
  'gather',
  formationNode,
  0
);
assert.equal(orderedMarch.repeatGather, true, 'Repeat gathering initialized on gather order');
assert.equal(orderedMarch.gatherTargetId, formationNode.id, 'Gather target ID stored on unit');

// Settle arrival at node -> transitions to gathering, keeping repeatGather and gatherTargetId
const arrivedGatherer = u.settleUnit(orderedMarch, orderedMarch.order.arrivesAt);
assert.equal(arrivedGatherer.status, 'gathering');
assert.equal(arrivedGatherer.repeatGather, true);
assert.equal(arrivedGatherer.gatherTargetId, formationNode.id);

// When cargo fills up, commandUnit return preserves repeatGather and gatherTargetId
const fullGatherer = { ...arrivedGatherer, cargo: { resource: 'wood', amount: 100, maxLoad: 100 } };
const returnWithRepeat = u.commandUnit(fullGatherer, 'return', 5000);
assert.equal(returnWithRepeat.status, 'returning');
assert.equal(returnWithRepeat.repeatGather, true, 'Return trip preserves repeatGather flag');
assert.equal(returnWithRepeat.gatherTargetId, formationNode.id, 'Return trip preserves gatherTargetId');

// 12. Manual Stop Loop and Override Controls
// Calling commandUnit with cancelRepeat = true disables repeat
const cancelledReturn = u.commandUnit(fullGatherer, 'return', 5000, undefined, true);
assert.equal(cancelledReturn.repeatGather, false, 'Explicit cancelRepeat disables repeat on return');
assert.equal(cancelledReturn.gatherTargetId, undefined, 'Explicit cancelRepeat clears gatherTargetId');

// Manual Move command cancels repeatGather
const manualMove = u.commandUnit(fullGatherer, 'move', 5000, { x: 10, z: 10 });
assert.equal(manualMove.repeatGather, false, 'Manual move cancels repeat gathering');
assert.equal(manualMove.gatherTargetId, undefined, 'Manual move clears gatherTargetId');

// Manual Hold command cancels repeatGather
const manualHold = u.commandUnit(fullGatherer, 'hold', 5000);
assert.equal(manualHold.repeatGather, false, 'Manual hold cancels repeat gathering');
assert.equal(manualHold.gatherTargetId, undefined, 'Manual hold clears gatherTargetId');

// 13. Resource Nodes & POIs Enabled / Disabled Settings
// In resource-spawn-config.yml: oil has enabled: false
assert.equal(r.isResourceNodeEnabled('oil'), false, 'Oil resource node is disabled in config');
assert.equal(r.isResourceNodeEnabled('farm'), true, 'Farm resource node is enabled in config');
assert.equal(r.isResourceNodeEnabled('lumber'), true, 'Lumber node defaults to enabled');
assert.equal(r.isWorldKindEnabled('oil'), false, 'Oil world kind is disabled');

// Active generation settings count for oil should be 0
const activeGenSettings = r.getActiveGenerationSettings();
assert.equal(activeGenSettings.counts.oil, 0, 'Active generation spawns 0 oil when disabled');
assert.ok(activeGenSettings.counts.farm > 0, 'Active generation spawns farms when enabled');

// restoreWorld drops disabled kinds
const mockSavedWorld = JSON.stringify([
  { id: 'farm-1', kind: 'farm', x: 10, z: 10, state: 'available', loot: { apple: 0 }, currentCapacity: 500, maxCapacity: 500 },
  { id: 'oil-1', kind: 'oil', x: 20, z: 20, state: 'available', loot: { apple: 0 }, currentCapacity: 250, maxCapacity: 250 },
]);
const restoredFilteredWorld = w.restoreWorld(mockSavedWorld);
assert.equal(restoredFilteredWorld.length, 1, 'Disabled oil node is filtered out during restoreWorld');
assert.equal(restoredFilteredWorld[0].kind, 'farm', 'Only enabled farm node is restored');

// 14. Depleted Node Removal and Simultaneous Multi-Node Harvesting
const nodeA = { id: 'node-A', kind: 'farm', x: 10, z: 10, state: 'available', loot: { apple: 0 }, currentCapacity: 10, maxCapacity: 500 };
const nodeB = { id: 'node-B', kind: 'lumber', x: 20, z: 20, state: 'available', loot: { apple: 0 }, currentCapacity: 200, maxCapacity: 500 };

let worldTest = [nodeA, nodeB];

const team1 = { ...unitFormation1, position: { x: 10, z: 10 }, activity: { action: 'gather', targetId: 'node-A' }, cargo: { resource: 'food', amount: 0, maxLoad: 50 } };
const team2 = { ...unitFormation2, position: { x: 20, z: 20 }, activity: { action: 'gather', targetId: 'node-B' }, cargo: { resource: 'wood', amount: 0, maxLoad: 50 } };

// Both teams step gathering simultaneously
const stepTeam1 = g.stepUnitGathering(team1, worldTest.find(o => o.id === 'node-A'), 2000, 1000);
const stepTeam2 = g.stepUnitGathering(team2, worldTest.find(o => o.id === 'node-B'), 2000, 1000);

assert.equal(stepTeam1.gatheredAmount, 10, 'Team 1 gathered all 10 remaining food');
assert.equal(stepTeam1.isDepleted, true, 'Node A depleted by Team 1');
assert.equal(stepTeam2.gatheredAmount, 10, 'Team 2 gathered 10 wood simultaneously');
assert.equal(stepTeam2.isDepleted, false, 'Node B still active');

// Depleted node is removed from world
if (stepTeam1.isDepleted) {
  worldTest = worldTest.filter(o => o.id !== 'node-A');
}
assert.equal(worldTest.length, 1, 'Depleted node A removed from world');
assert.equal(worldTest[0].id, 'node-B', 'Only active node B remains in world');

// 15. World Gathering Exceeds City Passive Capacity (No Clamping)
const c = load('src/game/cities.ts');
const mockCitySave = JSON.stringify([{
  id: 'everleaf-capital',
  name: 'Everleaf Haven',
  kind: 'capital',
  resources: {
    food: { amount: 1200, capacity: 500 },
    wood: { amount: 850, capacity: 500 },
    stone: { amount: 300, capacity: 500 },
    warSupplies: { amount: 100, capacity: 500 },
  },
}]);
const restoredCities = c.restoreCities(mockCitySave);
assert.equal(restoredCities[0].resources.food.amount, 1200, 'Gathered food exceeding passive capacity is preserved on restore');
assert.equal(restoredCities[0].resources.wood.amount, 850, 'Gathered wood exceeding passive capacity is preserved on restore');

// Passive production only produces if amount < capacity, never reduces existing gathered amount
const afterProd = c.applyResourceProduction(restoredCities[0].resources, [{ id: 'farm-1', kind: 'farm', level: 1, x: 0, z: 0 }], 10, 'capital');
assert.equal(afterProd.food.amount, 1200, 'Passive city production does not reduce resources exceeding capacity');

// 16. Live Billboard Gathering Sprite Healthbar & Progress Scale in 3D Scene
(async () => {
  const babylon = await import('@babylonjs/core');
  function loadBabylonModule(file) {
    const fPath = path.resolve(file);
    const source = ts.transpileModule(fs.readFileSync(fPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', source)(
      name => name === '@babylonjs/core' ? babylon : load(path.resolve(path.dirname(fPath), name.endsWith('.json') ? name : `${name}.ts`)),
      mod,
      mod.exports
    );
    return mod.exports;
  }
  const { NullEngine, Scene, FreeCamera, Vector3 } = babylon;
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new FreeCamera('testCam', new Vector3(0, 40, -40), scene).setTarget(Vector3.Zero());

  const marchModule = loadBabylonModule('src/game/march-scene.ts');
  const testArmyGathering = {
    ...team1,
    id: 'gatherer-sprite-test',
    status: 'gathering',
    cargo: { resource: 'food', amount: 25, maxLoad: 50 },
  };

  const disposeMarches = marchModule.showMarches(scene, () => [testArmyGathering], null, () => true);
  scene.render();

  const gatherBg = scene.meshes.find(m => m.name.includes('gather bar bg gatherer-sprite-test'));
  const gatherFill = scene.meshes.find(m => m.name.includes('gather bar fill gatherer-sprite-test'));
  const gatherRoot = scene.transformNodes.find(t => t.name.includes('gather bar gatherer-sprite-test'));

  assert.ok(gatherBg, 'Gather bar background plane created');
  assert.ok(gatherFill, 'Gather bar fill plane created');
  assert.ok(gatherRoot, 'Gather bar root transform node created');
  assert.equal(gatherRoot.isEnabled(), true, 'Gather bar is enabled while unit status is gathering');

  // 25 / 50 load = 0.5 ratio
  assert.ok(Math.abs(gatherFill.scaling.x - 0.5) < 0.01, 'Gather fill bar scaling reflects 50% cargo load');

  // When unit returns home with cargo, gather bar is disabled, and returning cargo sprite is enabled
  testArmyGathering.status = 'returning';
  scene.render();
  assert.equal(gatherRoot.isEnabled(), false, 'Gather bar is disabled when unit is not actively gathering');

  // 17. Returning Cargo Sprite Billboard (Distinct per resource)
  const cargoPlane = scene.meshes.find(m => m.name.includes('cargo plane gatherer-sprite-test'));
  const cargoRoot = scene.transformNodes.find(t => t.name.includes('cargo root gatherer-sprite-test'));
  assert.ok(cargoPlane, 'Cargo plane mesh created');
  assert.ok(cargoRoot, 'Cargo root transform node created');
  assert.equal(cargoRoot.isEnabled(), true, 'Cargo sprite is enabled while returning with cargo');

  // Verify each resource updates the cargo sprite
  for (const res of ['food', 'wood', 'stone', 'warSupplies']) {
    testArmyGathering.cargo = { resource: res, amount: 40, maxLoad: 50 };
    scene.render();
    assert.equal(cargoRoot.isEnabled(), true, `Cargo sprite enabled for ${res}`);
  }

  // When cargo is emptied upon deposit, cargo sprite is disabled
  testArmyGathering.cargo = { resource: 'food', amount: 0, maxLoad: 50 };
  scene.render();
  assert.equal(cargoRoot.isEnabled(), false, 'Cargo sprite is disabled when cargo is empty');

  // 18. Refusing Gather Order While Carrying Cargo Back to Base
  const returningWithFood = {
    ...team1,
    id: 'returning-cargo-carrier',
    status: 'returning',
    cargo: { resource: 'food', amount: 35, maxLoad: 50 },
  };
  assert.throws(
    () => u.commandWorldAction(returningWithFood, 'gather', nodeB, 0),
    /carrying 35 food.*Return to base/i,
    'Commanding unit to gather other resource while holding cargo is refused'
  );

  disposeMarches();
  scene.dispose();
  engine.dispose();

  console.log('PASS: all resource gathering unit tests, refusal checks & cargo sprites completed successfully!');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
