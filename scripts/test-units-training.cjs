const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const yaml = require('yaml');

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return fs.readFileSync(file, 'utf8');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name => (name.startsWith('.') ? load(path.resolve(path.dirname(file), /\.(json|ya?ml)$/.test(name) ? name : `${name}.ts`)) : require(name)),
    module,
    module.exports
  );
  return module.exports;
}

console.log('Running unit training configuration and queue test suite...');

// 1. YAML structure validation
const ymlPath = path.resolve('src/game/config/units-training-config.yml');
assert.ok(fs.existsSync(ymlPath), 'units-training-config.yml must exist');
const rawYaml = fs.readFileSync(ymlPath, 'utf8');
const cfg = yaml.parse(rawYaml);

assert.ok(cfg.settings, 'settings section exists');
assert.equal(cfg.settings.batchSize, 10, 'batchSize is 10');
assert.ok(cfg.units, 'units section exists');

// Unit level configs & toggle placement
for (const [id, unit] of Object.entries(cfg.units)) {
  assert.equal(typeof unit.id, 'string', `${id} has id`);
  assert.equal(typeof unit.name, 'string', `${id} has name`);
  assert.equal(typeof unit.enabled, 'boolean', `${id} has enabled boolean at unit level`);
  assert.equal(typeof unit.requiredBuilding, 'string', `${id} specifies requiredBuilding`);
  assert.ok(unit.levels, `${id} has levels object`);
  for (const [lvlKey, lvl] of Object.entries(unit.levels)) {
    assert.equal(typeof lvl.trainingTimeSeconds, 'number', `${id}.${lvlKey} has trainingTimeSeconds`);
    assert.ok(lvl.cost, `${id}.${lvlKey} has cost`);
    assert.equal(lvl.cost.warSupplies, undefined, `${id}.${lvlKey} must NOT contain warSupplies (food/wood only)`);
    assert.ok(lvl.statBonuses, `${id}.${lvlKey} has statBonuses`);
  }
}

assert.equal(cfg.units.infantry.enabled, true, 'infantry is enabled');
assert.equal(cfg.units.archer.enabled, true, 'archer is enabled');
assert.equal(cfg.units.scout.enabled, false, 'scout is disabled (locked until scout lodge ships)');
assert.equal(cfg.units.infantry.requiredBuilding, 'barracks');
assert.equal(cfg.units.archer.requiredBuilding, 'archery');
assert.equal(cfg.units.scout.requiredBuilding, 'scout');

// 2. units-training-config.ts module tests
const trainingConfig = load('src/game/units-training-config.ts');
assert.equal(trainingConfig.isTrainingEnabled('infantry'), true);
assert.equal(trainingConfig.isTrainingEnabled('archer'), true);
assert.equal(trainingConfig.isTrainingEnabled('scout'), false);
assert.equal(trainingConfig.getTrainingBatchSize(), 10);

const infL1 = trainingConfig.getUnitTrainingLevelConfig('infantry', 1);
assert.equal(infL1.trainingTimeSeconds, 30);
assert.equal(infL1.cost.food, 80);
assert.equal(infL1.cost.wood, 20);
assert.equal(infL1.statBonuses.health, 0);

const infL2 = trainingConfig.getUnitTrainingLevelConfig('infantry', 2);
assert.equal(infL2.trainingTimeSeconds, 20);
assert.equal(infL2.cost.food, 60);
assert.equal(infL2.cost.wood, 15);
assert.equal(infL2.statBonuses.health, 10);

const infL3 = trainingConfig.getUnitTrainingLevelConfig('infantry', 3);
assert.equal(infL3.trainingTimeSeconds, 12);
assert.equal(infL3.cost.food, 40);
assert.equal(infL3.cost.wood, 10);
assert.equal(infL3.statBonuses.health, 25);

// Clamping checks
assert.deepEqual(trainingConfig.getUnitTrainingLevelConfig('infantry', 0), infL1, 'clamped to level1');
assert.deepEqual(trainingConfig.getUnitTrainingLevelConfig('infantry', 99), infL3, 'clamped to level3');

// Affordability and deduction checks
const mockResources = {
  food: { amount: 100, capacity: 500, productionRate: 1 },
  wood: { amount: 50, capacity: 500, productionRate: 1 },
  stone: { amount: 0, capacity: 500, productionRate: 1 },
};

assert.equal(trainingConfig.canAffordTraining(mockResources, { food: 80, wood: 20 }), true);
assert.equal(trainingConfig.canAffordTraining(mockResources, { food: 120, wood: 20 }), false);
assert.equal(trainingConfig.canAffordTraining(mockResources, { food: 80, wood: 60 }), false);

const afterDeduct = trainingConfig.deductTrainingCost(mockResources, { food: 80, wood: 20 });
assert.equal(afterDeduct.food.amount, 20);
assert.equal(afterDeduct.wood.amount, 30);
assert.equal(mockResources.food.amount, 100, 'deductTrainingCost must not mutate original resources');

// Format stat bonuses
assert.equal(trainingConfig.formatStatBonuses({ health: 10, attack: 2, defense: 5, speed: 0 }), '+10 HP · +2 ATK · +5 DEF');
assert.equal(trainingConfig.formatStatBonuses({ health: 0, attack: 0, defense: 0, speed: 0 }), '');

// 3. training-queue.ts module tests (multi-building concurrent training)
const queueMod = load('src/game/training-queue.ts');
let q = new Map();
const t0 = 100000;

// Enqueue on barracks-1
q = queueMod.enqueueJob(q, 'barracks-1', 'infantry', 'barracks', 30000, t0);
assert.equal(q.size, 1);
const job1 = q.get('barracks-1');
assert.equal(job1.id, 'barracks-1');
assert.equal(job1.buildingId, 'barracks-1');
assert.equal(job1.kind, 'infantry');
assert.equal(job1.buildingKind, 'barracks');
assert.equal(job1.startedAt, t0);
assert.equal(job1.durationMs, 30000);
assert.equal(job1.endsAt, t0 + 30000);

// Enqueue on a second building of the same kind (barracks-2) simultaneously!
q = queueMod.enqueueJob(q, 'barracks-2', 'infantry', 'barracks', 20000, t0);
assert.equal(q.size, 2, 'can train simultaneously in multiple buildings of the same kind');

// Test findIdleBuilding
const mockBuildings = [
  { id: 'barracks-1', kind: 'barracks', level: 1 },
  { id: 'barracks-2', kind: 'barracks', level: 2 },
  { id: 'barracks-3', kind: 'barracks', level: 3 },
];
// Both 1 and 2 are busy, barracks-3 is idle
const idleB = queueMod.findIdleBuilding(mockBuildings, q, 'barracks');
assert.equal(idleB.id, 'barracks-3', 'finds the highest-level idle building');

// Progress and countdown
assert.equal(queueMod.jobProgress(job1, t0), 0);
assert.equal(queueMod.jobProgress(job1, t0 + 15000), 0.5);
assert.equal(queueMod.jobProgress(job1, t0 + 30000), 1);
assert.equal(queueMod.secondsRemaining(job1, t0), 30);
assert.equal(queueMod.secondsRemaining(job1, t0 + 15000), 15);
assert.equal(queueMod.secondsRemaining(job1, t0 + 30000), 0);

// Serialization & restore
const serialized = queueMod.serializeQueue(q);
const restored = queueMod.restoreQueue(serialized, t0 + 5000);
assert.ok(restored.has('barracks-1'), 'barracks-1 restored');
assert.ok(restored.has('barracks-2'), 'barracks-2 restored');

const restoredExpired = queueMod.restoreQueue(serialized, t0 + 35000);
assert.equal(restoredExpired.size, 0, 'expired jobs filtered out on restore');

// Drain finished — barracks-2 finishes first (20s)
const { next: qAfter20s, finished: f1 } = queueMod.drainFinished(q, t0 + 20001);
assert.equal(qAfter20s.size, 1);
assert.equal(f1.length, 1);
assert.equal(f1[0].buildingId, 'barracks-2');

// barracks-1 finishes at 30s
const { next: qAfter30s, finished: f2 } = queueMod.drainFinished(qAfter20s, t0 + 30001);
assert.equal(qAfter30s.size, 0);
assert.equal(f2.length, 1);
assert.equal(f2[0].buildingId, 'barracks-1');

// 4. Reset registration audit
const resetMod = load('src/game/reset.ts');
const trainingQueueResettable = resetMod.RESETTABLE_MODULES.find(m => m.id === 'training-queue');
assert.ok(trainingQueueResettable, 'training-queue is registered in RESETTABLE_MODULES');
assert.ok(trainingQueueResettable.storageKeys.includes(queueMod.TRAINING_QUEUE_SAVE_KEY), 'TRAINING_QUEUE_SAVE_KEY registered');

console.log('PASS: units-training-config and training-queue test suite completed successfully!');
