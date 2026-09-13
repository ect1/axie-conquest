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
  new Function('require', 'module', 'exports', source)(name => load(path.resolve(path.dirname(file), name.endsWith('.json') ? name : `${name}.ts`)), module, module.exports);
  return module.exports;
}
const { resetGame, RESETTABLE_MODULES } = load('src/game/reset.ts');
const stats = load('src/game/unit-stats.ts');
const battleSettings = load('src/game/battle-settings.ts');
const data = new Map(RESETTABLE_MODULES.flatMap(module => module.storageKeys.map(key => [key, 'saved'])));
data.set('axie-conquest-city-everleaf-haven-troops-v1', 'saved');
data.set('axie-conquest-city-new-outpost-troops-v1', 'saved');
data.set('other-app-save', 'preserve');
data.set('axie-conquest-city-unrelated', 'preserve');
const storage = { get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, removeItem: key => data.delete(key) };
stats.setActiveUnitGlobalStats({ marchSpeed: 50 });
battleSettings.setActiveBattleSettings({ awarenessRadius: 50, engagementRadius: 25, leashRadius: 60, attackRangeMultiplier: 2, bodyRadiusMultiplier: 2 });
const applied = { ...battleSettings.activeBattleSettings, overlays: { ...battleSettings.DEFAULT_BATTLE_SETTINGS.overlays, awareness: true, attack: true }, showAll: true };
assert.deepEqual(battleSettings.restoreActiveBattleSettings(JSON.stringify(applied)), applied, 'overlay choices and tuning survive reload together');
assert.equal(battleSettings.restoreActiveBattleSettings('{"awarenessRadius":25}').overlays.awareness, false, 'legacy tuning saves restore default overlays');
assert.deepEqual(battleSettings.restoreActiveBattleSettings('invalid'), battleSettings.DEFAULT_BATTLE_SETTINGS, 'invalid tuning restores defaults');
battleSettings.setActiveBattleSettings(applied);
resetGame(storage);
assert.deepEqual([...data.keys()], ['other-app-save', 'axie-conquest-city-unrelated']);
assert.equal(stats.activeUnitGlobalStats.marchSpeed, stats.DEFAULT_UNIT_GLOBAL_STATS.marchSpeed);
assert.deepEqual(battleSettings.activeBattleSettings, battleSettings.DEFAULT_BATTLE_SETTINGS);
resetGame(storage); // Safe to retry on a fresh game.
let called = false;
data.set('future-feature', 'saved');
resetGame(storage, [{ id: 'future', storageKeys: ['future-feature'], reset: () => { called = true; } }]);
assert.equal(called, true);
assert.equal(data.has('future-feature'), false);
assert.throws(() => resetGame({ ...storage, removeItem() { throw new Error('Denied'); } }), /Denied/);
const base = load('src/game/base.ts');
assert.deepEqual(base.restoreBuildings(null), [base.MAIN_HALL]);
assert.deepEqual(base.restoreTroops(null), base.EMPTY_TROOPS);
const deployment = load('src/game/town-deployment.ts');
const formations = load('src/game/offense-formations.ts');
assert.deepEqual(deployment.restoreDeployedAxieIds(null), deployment.getDefaultDeployedAxieIds());
assert.deepEqual(formations.restoreOffenseFormations(null, deployment.getDefaultDeployedAxieIds(), base.EMPTY_TROOPS), formations.createEmptyFormations());
assert.deepEqual(load('src/game/routes.ts').restoreRouteOrders(null), []);
assert.equal(load('src/game/world.ts').restoreWorld(null), null);
assert.deepEqual(load('src/game/cities.ts').restoreCities(null), [load('src/game/cities.ts').createCapitalCity()]);
// Audit literal save keys in source, so an unregistered feature fails this check.
function audit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) audit(file);
    else if (/\.tsx?$/.test(file)) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/['"](axie-conquest-[\w-]+)['"]/g)) {
        assert.ok(RESETTABLE_MODULES.some(module => module.storageKeys.includes(match[1]) || module.matchesStorageKey?.(match[1])), `Unregistered save key ${match[1]} in ${file}`);
      }
    }
  }
}
audit('src');
console.log('PASS: reset registry, dynamic city saves, cache callbacks, unrelated data, retries, failures, starter restoration and save-key audit');
