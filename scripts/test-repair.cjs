const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');

const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return fs.readFileSync(file, 'utf8');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name =>
      name.startsWith('.')
        ? load(path.resolve(path.dirname(file), /\.(json|ya?ml)$/.test(name) ? name : `${name}.ts`))
        : require(name),
    module,
    module.exports
  );
  return module.exports;
}

console.log('Testing building repair configuration, service, scaling, and reset...');

const gameConfig = load('src/game/game-config.ts');
const repairService = load('src/game/repair-service.ts');
const { resetGame, RESETTABLE_MODULES } = load('src/game/reset.ts');

// 1. Repair configuration tests
const repairCfg = gameConfig.getRepairConfig();
assert.ok(repairCfg.baseRepair > 0, 'baseRepair should be > 0');
assert.equal(typeof repairCfg.defaultAutoRepair, 'boolean', 'defaultAutoRepair is boolean');
assert.ok(repairCfg.costPer100Hp.wood > 0, 'wood cost per 100 HP is > 0');
assert.ok(repairCfg.costPer100Hp.stone > 0, 'stone cost per 100 HP is > 0');
assert.ok(repairCfg.cityHallLevels[1], 'City Hall level 1 config exists');
assert.ok(repairCfg.cityHallLevels[2], 'City Hall level 2 config exists');
assert.ok(repairCfg.cityHallLevels[3], 'City Hall level 3 config exists');
assert.equal(repairCfg.cityHallLevels[1].maxAssignableAxies, 1, 'Lv 1 has 1 max assignable Axie');
assert.equal(repairCfg.cityHallLevels[2].maxAssignableAxies, 2, 'Lv 2 has 2 max assignable Axies');
assert.equal(repairCfg.cityHallLevels[3].maxAssignableAxies, 3, 'Lv 3 has 3 max assignable Axies');

// 2. State restoration & serialization
const defaultState = repairService.restoreCityRepair(null, true);
assert.equal(defaultState.autoRepair, true, 'Default autoRepair is true');
assert.deepEqual(defaultState.assignedAxieIds, [], 'Default assignedAxieIds is empty array');

const serialized = repairService.serializeCityRepair({ autoRepair: false, assignedAxieIds: ['axie-1', 'axie-2'] });
const restored = repairService.restoreCityRepair(serialized);
assert.equal(restored.autoRepair, false, 'Restores autoRepair false');
assert.deepEqual(restored.assignedAxieIds, ['axie-1', 'axie-2'], 'Restores assignedAxieIds correctly');

// Invalid inputs are sanitized
const sanitized = repairService.restoreCityRepair('{"autoRepair":"invalid","assignedAxieIds":[123, "   ", "valid-1", "valid-1"]}');
assert.equal(sanitized.autoRepair, true, 'Falls back to default autoRepair');
assert.deepEqual(sanitized.assignedAxieIds, ['valid-1'], 'Sanitizes and de-duplicates Axie IDs');

// 3. Repair rate calculation tests
assert.equal(repairService.calculateRepairRate(repairCfg, 1, 0), 0, '0 Axies assigned results in 0 repair rate');
assert.equal(repairService.calculateRepairRate(repairCfg, 1, 1), 50, '1 Axie at Lv 1 results in 50 HP/s');

// At Lv 2: 1.35x repairMultiplier
const lv2Rate1Axie = repairService.calculateRepairRate(repairCfg, 2, 1);
assert.equal(lv2Rate1Axie, 67.5, '1 Axie at Lv 2 results in 50 * 1.35 = 67.5 HP/s');

// At Lv 2 with 2 Axies: 50 * 1.35 * (1 + 1 * 0.25) = 84.38 HP/s
const lv2Rate2Axies = repairService.calculateRepairRate(repairCfg, 2, 2);
assert.equal(lv2Rate2Axies, 84.38, '2 Axies at Lv 2 results in 84.38 HP/s');

// Lv 1 with 3 Axies assigned should be capped at maxAssignableAxies (1)
const lv1RateCapped = repairService.calculateRepairRate(repairCfg, 1, 3);
assert.equal(lv1RateCapped, 50, 'Lv 1 with 3 assigned Axies is capped at 1 slot (50 HP/s)');

// 4. Repair cost calculations
const costLv1 = repairService.calculateRepairCost(repairCfg, 1, 100);
assert.equal(costLv1.wood, 5, 'Lv 1 costs 5 wood per 100 HP');
assert.equal(costLv1.stone, 5, 'Lv 1 costs 5 stone per 100 HP');

const costLv2 = repairService.calculateRepairCost(repairCfg, 2, 100);
assert.equal(costLv2.wood, 4.5, 'Lv 2 has 10% discount: 4.5 wood');
assert.equal(costLv2.stone, 4.5, 'Lv 2 has 10% discount: 4.5 stone');

const costLv3 = repairService.calculateRepairCost(repairCfg, 3, 100);
assert.equal(costLv3.wood, 4.0, 'Lv 3 has 20% discount: 4.0 wood');
assert.equal(costLv3.stone, 4.0, 'Lv 3 has 20% discount: 4.0 stone');

// 5. Repair tick processing
// Inactive when autoRepair is false
const tickInactive = repairService.processRepairTick({
  currentHealth: 5000,
  maxHealth: 10000,
  resources: { wood: 100, stone: 100 },
  elapsedSeconds: 1.0,
  hallLevel: 1,
  assignedAxieCount: 1,
  autoRepair: false,
  config: repairCfg,
});
assert.equal(tickInactive.isRepairing, false);
assert.equal(tickInactive.hpRepaired, 0);

// Inactive when city health is full
const tickFull = repairService.processRepairTick({
  currentHealth: 10000,
  maxHealth: 10000,
  resources: { wood: 100, stone: 100 },
  elapsedSeconds: 1.0,
  hallLevel: 1,
  assignedAxieCount: 1,
  autoRepair: true,
  config: repairCfg,
});
assert.equal(tickFull.isRepairing, false);
assert.equal(tickFull.hpRepaired, 0);

// Inactive when resources are depleted
const tickNoRes = repairService.processRepairTick({
  currentHealth: 5000,
  maxHealth: 10000,
  resources: { wood: 0, stone: 0 },
  elapsedSeconds: 1.0,
  hallLevel: 1,
  assignedAxieCount: 1,
  autoRepair: true,
  config: repairCfg,
});
assert.equal(tickNoRes.isRepairing, false);
assert.equal(tickNoRes.hasResources, false);

// Active with sufficient resources
const tickSuccess = repairService.processRepairTick({
  currentHealth: 5000,
  maxHealth: 10000,
  resources: { wood: 100, stone: 100 },
  elapsedSeconds: 1.0,
  hallLevel: 1,
  assignedAxieCount: 1,
  autoRepair: true,
  config: repairCfg,
});
assert.equal(tickSuccess.isRepairing, true);
assert.equal(tickSuccess.hpRepaired, 50, 'Repairs 50 HP in 1 second');
assert.equal(tickSuccess.nextHealth, 5050, 'Next health is 5050');
assert.equal(tickSuccess.consumed.wood, 2.5, 'Consumes 2.5 wood (5 per 100 HP)');
assert.equal(tickSuccess.consumed.stone, 2.5, 'Consumes 2.5 stone (5 per 100 HP)');

// Clamps at maxHealth
const tickClamp = repairService.processRepairTick({
  currentHealth: 9980,
  maxHealth: 10000,
  resources: { wood: 100, stone: 100 },
  elapsedSeconds: 1.0,
  hallLevel: 1,
  assignedAxieCount: 1,
  autoRepair: true,
  config: repairCfg,
});
assert.equal(tickClamp.nextHealth, 10000, 'Clamps at maxHealth');
assert.equal(tickClamp.hpRepaired, 20, 'Only repairs the needed 20 HP');
assert.equal(tickClamp.consumed.wood, 1, 'Only consumes resources for 20 HP');

// 6. Reset registration
const repairModule = RESETTABLE_MODULES.find(m => m.id === 'city-repair');
assert.ok(repairModule, 'city-repair is registered in RESETTABLE_MODULES');
assert.ok(repairModule.storageKeys.includes(repairService.CITY_REPAIR_SAVE_KEY), 'Storage key registered');
assert.ok(repairModule.matchesStorageKey('axie-conquest-city-everleaf-haven-repair-v1'), 'Dynamic key matched');

console.log('PASS: repair configuration, service, City Hall scaling, and reset integration verified!');
