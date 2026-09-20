const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', source)(
    name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name),
    module, module.exports);
  return module.exports;
}
const { recoverFormationHealth } = load('src/game/formation-recovery.ts');
const { setFormationAssignment } = load('src/game/offense-formations.ts');
const wounded = { leader: null, assignments: [], woundedAxies: { injured: { healthRatio: 0, healthUpdatedAt: 1000 } } };
assert.equal(recoverFormationHealth([wounded], 0, 1, 1000).changed, false, 'same-timestamp recovery must not trigger another React update');
const healed = recoverFormationHealth([wounded], 0, 1, 2000);
assert.ok(healed.formations[0].woundedAxies.injured.healthRatio > 0, 'base recovery works without hospital');
assert.equal(recoverFormationHealth(healed.formations, 0, 1, 2000).changed, false, 'recovery stabilizes after one update');
const assigned = setFormationAssignment(healed.formations[0], 0, 0, { heroId: 'healthy', military: null, militaryCount: 0 });
const next = recoverFormationHealth([assigned], 0, 1, 3000);
assert.equal(next.formations[0].assignments[0].heroId, 'healthy', 'healthy replacement survives recovery of former occupant');
assert.ok(next.formations[0].woundedAxies.injured.healthRatio > healed.formations[0].woundedAxies.injured.healthRatio);
const stale = recoverFormationHealth([{ ...assigned, leader: 'removed', woundedAxies: undefined }], 0, 1, 3000);
assert.equal(stale.formations[0].leader, null, 'stale leaders clear even without a healing change');
console.log('PASS: recovery stabilizes, heals without hospital, and preserves healthy replacement assignments');
