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

console.log('Testing city destruction configuration, health tracking, damage, and scoring...');

const cityConfig = load('src/game/city-config.ts');
const cityDefense = load('src/game/city-defense.ts');
const { resetGame, RESETTABLE_MODULES } = load('src/game/reset.ts');

// 1. Destruction configuration tests
const defaultDestruction = cityConfig.getCityDestructionConfig();
assert.equal(defaultDestruction.type, 'health', 'Default destruction type should be health');
assert.ok(defaultDestruction.maxHealth >= 1000, 'Max health should be >= 1000');

// 2. Health restoration tests
assert.equal(cityDefense.restoreCityHealth(1500, null), 1500, 'Null returns maxHealth');
assert.equal(cityDefense.restoreCityHealth(1500, undefined), 1500, 'Undefined returns maxHealth');
assert.equal(cityDefense.restoreCityHealth(1500, '850'), 850, 'Valid string restores exact health');
assert.equal(cityDefense.restoreCityHealth(1500, '2000'), 1500, 'Above maxHealth clamps to maxHealth');
assert.equal(cityDefense.restoreCityHealth(1500, '-50'), 0, 'Negative clamps to 0');
assert.equal(cityDefense.restoreCityHealth(1500, 'invalid'), 1500, 'Invalid string restores maxHealth');

// 3. Units produced restoration tests
assert.equal(cityDefense.restoreUnitsProduced(null), 0, 'Null returns 0');
assert.equal(cityDefense.restoreUnitsProduced('12'), 12, 'Valid string restores 12');
assert.equal(cityDefense.restoreUnitsProduced('-5'), 0, 'Negative clamps to 0');
assert.equal(cityDefense.restoreUnitsProduced('invalid'), 0, 'Invalid string returns 0');

// 4. Hostile march DPS calculation (direct formation damage/attack)
const mockMarch1 = {
  id: 'march-1',
  name: 'Vanguard Wave 1',
  status: 'arrived',
  formation: {
    slots: [
      { kind: 'mascot', count: 1, stats: { attack: 20, attackSpeed: 1.0 } },
      { kind: 'soldier', count: 3, stats: { attack: 15, attackSpeed: 1.0 } },
    ],
  },
};
// 1*20*1.0 + 3*15*1.0 = 65 total DPS directly from formation stats
const dps1 = cityDefense.calculateHostileMarchDps(mockMarch1);
assert.equal(dps1, 65, 'DPS matches raw formation damage (sum of unit count * attack * attackSpeed)');

const mockMarch2 = {
  id: 'march-2',
  name: 'Vanguard Wave 2',
  status: 'arrived',
  formation: {
    slots: [
      { kind: 'soldier', count: 2, stats: { attack: 25, attackSpeed: 1.0 } },
    ],
  },
};
const dps2 = cityDefense.calculateHostileMarchDps(mockMarch2);
assert.equal(dps2, 50, 'March 2 DPS is 50');

// 4b. Hostile engagement by player formations
// Not engaged
assert.equal(cityDefense.isMarchEngagedByFormation(mockMarch1, [], []), false, 'Unengaged hostile returns false');

// Engaged via status 'fighting'
assert.equal(cityDefense.isMarchEngagedByFormation({ ...mockMarch1, status: 'fighting' }, [], []), true, 'Hostile in fighting status returns true');

// Engaged via active battle session
const mockSessions = [{ id: 'battle-1', army: { id: 'army-1' }, target: { id: 'march-1' }, battle: {} }];
assert.equal(cityDefense.isMarchEngagedByFormation(mockMarch1, mockSessions, []), true, 'Hostile in active battle session returns true');

// Engaged via player army attack activity
const mockArmyAttacking = [{ kind: 'army', activity: { action: 'attack', targetId: 'march-1' } }];
assert.equal(cityDefense.isMarchEngagedByFormation(mockMarch1, [], mockArmyAttacking), true, 'Hostile targeted by attacking army returns true');

// Engaged via player army order
const mockArmyOrder = [{ kind: 'army', order: { activity: { action: 'attack', targetId: 'march-1' } } }];
assert.equal(cityDefense.isMarchEngagedByFormation(mockMarch1, [], mockArmyOrder), true, 'Hostile targeted by en-route army returns true');

// 4c. Multi-hostile assault DPS: damaged hostile stops attacking when engaged, other hostiles continue
// Scenario 1: Both hostiles unengaged -> both attack (65 + 50 = 115 DPS)
const assault1 = cityDefense.calculateCityAssaultDps([mockMarch1, mockMarch2], [], []);
assert.equal(assault1.totalDps, 115, 'Both hostiles attack city simultaneously');
assert.equal(assault1.attackingMarches.length, 2);
assert.equal(assault1.engagedMarches.length, 0);

// Scenario 2: March 1 is attacked by player army -> March 1 damage STOPS (0 DPS), March 2 continues (50 DPS)
const assault2 = cityDefense.calculateCityAssaultDps([mockMarch1, mockMarch2], [], mockArmyAttacking);
assert.equal(assault2.totalDps, 50, 'March 1 damage stops when attacked by formation; March 2 continues');
assert.equal(assault2.attackingMarches.length, 1);
assert.equal(assault2.attackingMarches[0].id, 'march-2');
assert.equal(assault2.engagedMarches.length, 1);
assert.equal(assault2.engagedMarches[0].id, 'march-1');

// Scenario 3: Both hostiles are engaged by formations -> total DPS drops to 0
const mockArmiesBoth = [
  { kind: 'army', activity: { action: 'attack', targetId: 'march-1' } },
  { kind: 'army', activity: { action: 'attack', targetId: 'march-2' } },
];
const assault3 = cityDefense.calculateCityAssaultDps([mockMarch1, mockMarch2], [], mockArmiesBoth);
assert.equal(assault3.totalDps, 0, 'City base takes 0 damage when all hostiles are engaged by formations');
assert.equal(assault3.attackingMarches.length, 0);
assert.equal(assault3.engagedMarches.length, 2);

// 5. Apply damage & destruction condition tests
const hit1 = cityDefense.applyCityDamage(100, 25);
assert.equal(hit1.currentHealth, 75);
assert.equal(hit1.isDestroyed, false);

const hit2 = cityDefense.applyCityDamage(20, 50);
assert.equal(hit2.currentHealth, 0);
assert.equal(hit2.isDestroyed, true, 'isDestroyed becomes true when HP hits 0');

// 6. Game Over score calculation tests
const score = cityDefense.calculateGameOverScore(3, 14);
// Level 3 * 1000 + 14 * 100 = 3000 + 1400 = 4400
assert.equal(score, 4400, 'Score computes portal level and units produced properly');

// 7. Reset test compliance
const data = new Map();
data.set(cityDefense.CITY_HEALTH_SAVE_KEY, '500');
data.set(cityDefense.UNITS_PRODUCED_SAVE_KEY, '25');
const storage = {
  get length() { return data.size; },
  key: index => [...data.keys()][index] ?? null,
  removeItem: key => data.delete(key),
};
resetGame(storage);
assert.equal(data.has(cityDefense.CITY_HEALTH_SAVE_KEY), false, 'City health save key removed on reset');
assert.equal(data.has(cityDefense.UNITS_PRODUCED_SAVE_KEY), false, 'Units produced save key removed on reset');

console.log('PASS: city-defense test suite completed successfully!');
