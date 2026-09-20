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

console.log('Running stats configuration test suite...');

// 1. Verify stats-config.yml exists and has valid YAML content
const yaml = require('yaml');
const ymlPath = path.resolve('src/game/config/stats-config.yml');
assert.ok(fs.existsSync(ymlPath), 'stats-config.yml exists on disk');
const parsedYaml = yaml.parse(fs.readFileSync(ymlPath, 'utf8'));

assert.equal(parsedYaml.version, 1, 'Config version is 1');
assert.ok(parsedYaml.gathering, 'Gathering configuration section exists');
assert.ok(parsedYaml.combat, 'Combat configuration section exists');

// 2. Test stats-config module loader
const s = load('src/game/stats-config.ts');
const cfg = s.getStatsConfigFile();
assert.ok(cfg, 'getStatsConfigFile returns config object');

// Check gathering load capacity weights
const weights = s.getTroopLoadWeights();
assert.equal(weights.hero, 50, 'Hero load capacity is 50');
assert.equal(weights.infantry, 15, 'Infantry load capacity is 15');
assert.equal(weights.archer, 10, 'Archer load capacity is 10');
assert.equal(weights.soldier, 12, 'Soldier load capacity is 12');
assert.equal(weights.scout, undefined, 'Scout is omitted from load capacity (scout is an Axie hero unit)');

// Check combat profiles
const combat = s.getCombatStatsConfig();
assert.equal(combat.axieHero.health, 820, 'Axie hero HP is 820');
assert.equal(combat.axieHero.attack, 108, 'Axie hero ATK is 108');
assert.equal(combat.soldier.health, 55, 'Soldier HP is 55');
assert.equal(combat.archer.projectileSpeed, 12, 'Archer projectile speed is 12');
assert.equal(combat.scout.speed, 3.5, 'Scout speed is 3.5');
assert.equal(combat.chimera.health, 75, 'Chimera HP is 75');

// 3. Test calculation helpers
const members = [
  { id: 'm1', heroId: 'axie-1', count: 1, offset: { x: 0, z: 0 } },
  { id: 'm2', troopKind: 'infantry', count: 10, offset: { x: 1, z: 0 } },
  { id: 'm3', troopKind: 'archer', count: 5, offset: { x: 2, z: 0 } },
];
// 50 + 10*15 + 5*10 = 250
const normalCapacity = s.calculateArmyLoadCapacity(members);
assert.equal(normalCapacity, 250, 'Calculated army load capacity matches formula');

// Beast passive +30%: 250 * 1.3 = 325
const beastCapacity = s.calculateArmyLoadCapacity(members, 'beast');
assert.equal(beastCapacity, 325, 'Beast commander passive gives +30% load capacity');

// Max troop load cap check: 40 soldiers = 40 * 12 = 480; if capped at 300 -> 50 (hero) + 300 = 350
const largeArmy = [
  { id: 'm1', heroId: 'axie-1', count: 1, offset: { x: 0, z: 0 } },
  { id: 'm2', troopKind: 'soldier', count: 40, offset: { x: 1, z: 0 } },
];
// Check with explicit config having maxTroopLoad
s.setActiveStatsConfig({
  ...s.getStatsConfigFile(),
  gathering: {
    ...s.getGatheringStatsConfig(),
    maxTroopLoad: { soldier: 300, archer: 150 },
    maxArmyCapacity: 500,
  },
});
assert.equal(s.calculateArmyLoadCapacity(largeArmy), 350, 'Soldier contribution is capped at maxTroopLoad (300)');
// Reset to disk config
s.setActiveStatsConfig(null);

// Gather rates
const farmBase = 10;
const plantFarmRate = s.calculateGatherRate('farm', farmBase, 'plant');
assert.equal(plantFarmRate, 12.5, 'Plant leader receives +25% gather rate on Farm');

const bugStoneRate = s.calculateGatherRate('stone', farmBase, 'bug');
assert.equal(bugStoneRate, 12.5, 'Bug leader receives +25% gather rate on Stone');

// 4. Test integration with gathering.ts
const g = load('src/game/gathering.ts');
assert.equal(g.TROOP_LOAD_WEIGHTS.infantry, 15, 'gathering.ts re-exports load weights');
assert.equal(g.calculateArmyLoadCapacity(members), 250, 'gathering.ts calculateArmyLoadCapacity delegates to stats-config');

// 5. Test integration with battle-settings.ts
const bs = load('src/game/battle-settings.ts');
assert.equal(bs.DEFAULT_BATTLE_SETTINGS.baseAxieHealth, 820, 'DEFAULT_BATTLE_SETTINGS reflects stats-config axie health');
assert.equal(bs.DEFAULT_BATTLE_SETTINGS.baseSoldierHealth, 55, 'DEFAULT_BATTLE_SETTINGS reflects stats-config soldier health');
assert.equal(bs.DEFAULT_BATTLE_SETTINGS.baseArcherHealth, 38, 'DEFAULT_BATTLE_SETTINGS reflects stats-config archer health');
assert.equal(bs.DEFAULT_BATTLE_SETTINGS.baseChimeraHealth, 75, 'DEFAULT_BATTLE_SETTINGS reflects stats-config chimera health');

// 6. Test integration with battle.ts
const b = load('src/game/battle.ts');
assert.equal(b.TROOP_COMBAT_STATS.infantry.health, 55, 'TROOP_COMBAT_STATS infantry health is 55');
assert.equal(b.TROOP_COMBAT_STATS.archer.health, 38, 'TROOP_COMBAT_STATS archer health is 38');
assert.equal(b.TROOP_COMBAT_STATS.scout.health, 70, 'TROOP_COMBAT_STATS scout health is 70');
assert.equal(b.TROOP_COMBAT_STATS.scout.speed, 3.5, 'TROOP_COMBAT_STATS scout speed is 3.5');

console.log('PASS: stats-config test suite completed successfully!');
