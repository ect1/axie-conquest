const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(name) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(`src/game/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'require', 'module', source)(module.exports, id => load(id.replace('./', '')), module);
  return module.exports;
}
const { generateWorld, DEFAULT_GENERATION, WORLD_WIDTH, WORLD_DEPTH, WORLD_OBJECT_RADIUS, WORLD_KINDS, getWorldObjectActions, restoreWorld } = load('world');
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (let seed = 1; seed <= 20; seed++) {
  const objects = generateWorld(DEFAULT_GENERATION, seeded(seed));
  assert.equal(objects.length, Object.values(DEFAULT_GENERATION.counts).reduce((sum, count) => sum + count, 0), 'Default population fits');
  for (const kind of WORLD_KINDS) assert.equal(objects.filter(o => o.kind === kind).length, DEFAULT_GENERATION.counts[kind]);
  for (const [i, object] of objects.entries()) {
    assert.ok(Math.abs(object.x) + WORLD_OBJECT_RADIUS <= WORLD_WIDTH / 2);
    assert.ok(Math.abs(object.z) + WORLD_OBJECT_RADIUS <= WORLD_DEPTH / 2);
    assert.ok(Math.abs(object.x) >= 20 + 3 + WORLD_OBJECT_RADIUS + 8 || Math.abs(object.z) >= 10 + 3 + WORLD_OBJECT_RADIUS + 8, 'Reserve the whole fortified city');
    assert.equal(object.loot.apple, ['village', 'garrison'].includes(object.kind) ? 1 : 0);
    for (const other of objects.slice(i + 1)) assert.ok(Math.hypot(object.x - other.x, object.z - other.z) >= 2 * WORLD_OBJECT_RADIUS + 8);
  }
  for (const axis of ['x', 'z']) {
    assert.ok(objects.some(o => o[axis] < -70), 'Populate the negative outer map');
    assert.ok(objects.some(o => o[axis] > 70), 'Populate the positive outer map');
  }
}
const empty = Object.fromEntries(WORLD_KINDS.map(kind => [kind, 0]));
assert.deepEqual(generateWorld({ counts: empty, spacing: 8 }), []);
const crowded = generateWorld({ counts: Object.fromEntries(WORLD_KINDS.map(kind => [kind, 100])), spacing: 50 }, seeded(5));
assert.ok(crowded.length > 0 && crowded.length < 700, 'Impossible requests return partial results');
for (const [i, object] of crowded.entries()) for (const other of crowded.slice(i + 1)) assert.ok(Math.hypot(object.x - other.x, object.z - other.z) >= 56);
assert.deepEqual(generateWorld({ counts: empty, spacing: NaN }), []);
const resource = { id: 'resource', kind: 'lumber', x: 1, z: 1, state: 'available', loot: { apple: 0 } };
assert.deepEqual(getWorldObjectActions(resource), [{ action: 'gather', enabled: true }]);
const defended = { id: 'guarded', kind: 'garrison', x: 2, z: 2, state: 'defended', loot: { apple: 1 } };
assert.deepEqual(getWorldObjectActions(defended).map(action => [action.action, action.enabled]), [['scout', true], ['attack', true], ['occupy', false]]);
assert.deepEqual(getWorldObjectActions({ ...defended, state: 'defeated' }), [{ action: 'occupy', enabled: true }]);
const village = { ...defended, id: 'village', kind: 'village' };
assert.deepEqual(getWorldObjectActions(village).map(action => [action.action, action.enabled]), [['attack', true], ['occupy', false]]);
assert.deepEqual(getWorldObjectActions({ ...village, state: 'defeated' }), [{ action: 'occupy', enabled: true }]);
assert.equal(restoreWorld(JSON.stringify([{ id: 'old', kind: 'boss', x: 3, z: 3, loot: { apple: 0 } }]))[0].state, 'defended', 'legacy worlds gain their default state');
assert.equal(restoreWorld(JSON.stringify([{ id: 'old-village', kind: 'village', x: 3, z: 3, state: 'available', loot: { apple: 1 } }]))[0].state, 'defended', 'legacy villages join the defended lifecycle');
console.log('PASS: world counts, spacing, city exclusion, full map coverage, loot placeholders, empty and crowded generation');
