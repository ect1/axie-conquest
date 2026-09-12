const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
function load(name) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(`src/game/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('exports', 'require', 'module', source)(module.exports, id => load(id.replace('./', '')), module);
  return module.exports;
}
const { generateWorld, DEFAULT_GENERATION, WORLD_WIDTH, WORLD_DEPTH, WORLD_OBJECT_RADIUS, WORLD_KINDS } = load('world');
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
for (let seed = 1; seed <= 20; seed++) {
  const objects = generateWorld(DEFAULT_GENERATION, seeded(seed));
  assert.equal(objects.length, 100, 'Default population fits');
  for (const kind of WORLD_KINDS) assert.equal(objects.filter(o => o.kind === kind).length, DEFAULT_GENERATION.counts[kind]);
  for (const [i, object] of objects.entries()) {
    assert.ok(Math.abs(object.x) + WORLD_OBJECT_RADIUS <= WORLD_WIDTH / 2);
    assert.ok(Math.abs(object.z) + WORLD_OBJECT_RADIUS <= WORLD_DEPTH / 2);
    assert.ok(Math.abs(object.x) >= 20 + 3 + WORLD_OBJECT_RADIUS + 8 || Math.abs(object.z) >= 10 + 3 + WORLD_OBJECT_RADIUS + 8, 'Reserve the whole fortified city');
    assert.equal(object.loot.apple, ['village', 'garrison'].includes(object.kind) ? 1 : 0);
    for (const other of objects.slice(i + 1)) assert.ok(Math.hypot(object.x - other.x, object.z - other.z) >= 2 * WORLD_OBJECT_RADIUS + 8);
  }
  for (const axis of ['x', 'z']) {
    assert.ok(objects.some(o => o[axis] < -80), 'Reach negative map edge');
    assert.ok(objects.some(o => o[axis] > 80), 'Reach positive map edge');
  }
}
const empty = Object.fromEntries(WORLD_KINDS.map(kind => [kind, 0]));
assert.deepEqual(generateWorld({ counts: empty, spacing: 8 }), []);
const crowded = generateWorld({ counts: Object.fromEntries(WORLD_KINDS.map(kind => [kind, 100])), spacing: 50 }, seeded(5));
assert.ok(crowded.length > 0 && crowded.length < 700, 'Impossible requests return partial results');
for (const [i, object] of crowded.entries()) for (const other of crowded.slice(i + 1)) assert.ok(Math.hypot(object.x - other.x, object.z - other.z) >= 56);
assert.deepEqual(generateWorld({ counts: empty, spacing: NaN }), []);
console.log('PASS: world counts, spacing, city exclusion, full map coverage, loot placeholders, empty and crowded generation');
