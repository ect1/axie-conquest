const fs = require('node:fs');
const ts = require('typescript');
const assert = require('node:assert/strict');
const source = ts.transpileModule(fs.readFileSync('src/game/base.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const compiled = { exports: {} };
new Function('exports', 'require', 'module', source)(compiled.exports, require, compiled);
const { canPlace, getBuildingDimensions, getBuildingFootprint, restoreBuildings, MAIN_HALL } = compiled.exports;

assert.equal(canPlace({ x: 0, z: 0 }, []), true);
assert.equal(canPlace({ x: 36, z: 16 }, []), true);
for (const cell of [{ x: -1, z: 0 }, { x: 37, z: 16 }, { x: 0, z: 17 }, { x: 0.5, z: 0 }]) {
  assert.equal(canPlace(cell, []), false, 'Reject out-of-bounds or fractional coordinates');
}
assert.equal(canPlace({ x: 18, z: 8 }, [MAIN_HALL]), false);
assert.equal(canPlace({ x: 21, z: 11 }, [MAIN_HALL]), false, 'Reject even one overlapping cell');
assert.equal(canPlace({ x: 22, z: 8 }, [MAIN_HALL]), true, 'Allow adjacent footprints');
assert.equal(getBuildingFootprint('road'), 1, 'Road occupies one cell');
assert.deepEqual(getBuildingDimensions('road'), { width: 4, depth: 1 }, 'Road builds as a four-cell horizontal segment');
assert.deepEqual(getBuildingDimensions('road', 1), { width: 1, depth: 4 }, 'Road rotates to a four-cell vertical segment');
assert.equal(canPlace({ x: 18, z: 8 }, [MAIN_HALL], getBuildingFootprint('road')), false, 'Road cannot overlap Main Hall');
assert.equal(canPlace({ x: 0, z: 0 }, [{ id: 'road', kind: 'road', x: 1, z: 0 }], getBuildingFootprint('road')), true, 'Road can use adjacent single cell');
const fullBase = [];
for (let z = 0; z < 20; z += 4) for (let x = 0; x < 40; x += 4) {
  assert.equal(canPlace({ x, z }, fullBase), true);
  fullBase.push({ id: `${x}-${z}`, kind: 'farm', x, z });
}
assert.equal(fullBase.length, 50, 'Base fits 10 by 5 building footprints');
assert.equal(restoreBuildings('bad').length, 1);
const saved = [
  { id: 'farm-1', kind: 'farm', x: 0, z: 0 },
  { id: 'overlap', kind: 'farm', x: 0, z: 0 },
  { id: 'outside', kind: 'farm', x: 40, z: 0 },
  { id: 'farm-1', kind: 'farm', x: 4, z: 0 },
];
assert.deepEqual(restoreBuildings(JSON.stringify(saved)), [MAIN_HALL, saved[0]]);
console.log('PASS: boundaries, overlap, adjacency, 50-footprint capacity, and save restoration');

const legacy = [{ id: 'legacy-farm', kind: 'farm', x: 12, z: 18 }, { id: 'far-edge', kind: 'farm', x: 16, z: 36 }];
assert.deepEqual(restoreBuildings(JSON.stringify(legacy), true), [MAIN_HALL, ...legacy.map(b => ({ ...b, x: b.z, z: b.x }))], 'Migrate legacy farms by swapping coordinates');
assert.deepEqual(restoreBuildings(JSON.stringify(restoreBuildings(JSON.stringify(legacy), true))), restoreBuildings(JSON.stringify(legacy), true));
const { BUILDABLE_KINDS } = compiled.exports;
const mixedSettlement = BUILDABLE_KINDS.map((kind, i) => ({ id: `building-${kind}`, kind, x: (i % 10) * 4, z: Math.floor(i / 10) * 4 }));
assert.deepEqual(restoreBuildings(JSON.stringify(mixedSettlement)), [MAIN_HALL, ...mixedSettlement], 'Restore every supported building kind without changing its identity');
for (const kind of ['lumber', 'quarry', 'barracks', 'tavern', 'scout', 'archery', 'road', 'hospital', 'training', 'oil']) {
  assert.ok(BUILDABLE_KINDS.includes(kind), `Build menu supports ${kind}`);
  const footprint = getBuildingFootprint(kind);
  assert.deepEqual(restoreBuildings(JSON.stringify([
    { id: 'valid', kind, x: 0, z: 0 },
    { id: 'overlap', kind, x: footprint === 1 ? 0 : 1, z: footprint === 1 ? 0 : 1 },
    { id: 'outside', kind, x: footprint === 1 ? 40 : 38, z: 0 },
  ])), [MAIN_HALL, { id: 'valid', kind, x: 0, z: 0 }], `Validate saved ${kind} placements`);
}
assert.deepEqual(restoreBuildings(JSON.stringify([{ id: 'unknown', kind: 'castle', x: 0, z: 0 }])), [MAIN_HALL], 'Reject unsupported building kinds');
console.log('PASS: all building types, mixed settlement restoration, and unknown building rejection');
// Old manually placed defenses are retired; ordinary saved buildings remain intact.
const oldDefenseSave = [
  { id: 'old-wall', kind: 'wall', x: 0, z: 0 },
  { id: 'old-tower', kind: 'watchtower', x: 4, z: 0 },
  { id: 'kept-farm', kind: 'farm', x: 8, z: 0 },
];
assert.deepEqual(restoreBuildings(JSON.stringify(oldDefenseSave)), [MAIN_HALL, oldDefenseSave[2]]);
assert.equal(BUILDABLE_KINDS.includes('wall'), false);
assert.equal(BUILDABLE_KINDS.includes('watchtower'), false);
assert.equal(canPlace({ x: 0, z: 0 }, restoreBuildings(JSON.stringify(oldDefenseSave))), true, 'Retired defenses release their cells');
console.log('PASS: default defenses excluded from building catalog and legacy defense placements retired');
const { canMoveBuilding, moveBuilding, removeBuilding } = compiled.exports;
const movable = { id: 'movable', kind: 'farm', x: 0, z: 0 };
const blocker = { id: 'blocker', kind: 'lumber', x: 8, z: 0 };
const original = [MAIN_HALL, movable, blocker];
assert.equal(canMoveBuilding(movable.id, { x: 1, z: 0 }, original), true, 'Moving can reuse the original footprint');
assert.equal(moveBuilding(movable.id, { x: 5, z: 0 }, original), null, 'Reject collision during a move');
assert.equal(moveBuilding(movable.id, { x: 37, z: 16 }, original), null, 'Reject out-of-bounds move');
assert.equal(moveBuilding(movable.id, { x: 0.5, z: 0 }, original), null, 'Reject fractional move');
assert.equal(moveBuilding(movable.id, MAIN_HALL, original), null, 'Cannot move onto Main Hall');
assert.ok(moveBuilding(MAIN_HALL.id, { x: 0, z: 8 }, original), 'Main Hall can move');
assert.equal(removeBuilding(MAIN_HALL.id, original), null, 'Main Hall cannot be removed');
assert.equal(moveBuilding('missing', { x: 0, z: 8 }, original), null);
assert.equal(removeBuilding('missing', original), null);
const moved = moveBuilding(movable.id, { x: 36, z: 16 }, original);
assert.deepEqual(moved, [MAIN_HALL, { ...movable, x: 36, z: 16 }, blocker]);
assert.deepEqual(original, [MAIN_HALL, { id: 'movable', kind: 'farm', x: 0, z: 0 }, blocker], 'Preview validation and movement do not mutate original data');
assert.deepEqual(restoreBuildings(JSON.stringify(moved)), moved, 'Moved position survives reload');
const removed = removeBuilding(movable.id, moved);
assert.deepEqual(removed, [MAIN_HALL, blocker]);
assert.deepEqual(restoreBuildings(JSON.stringify(removed)), removed, 'Removal survives reload');
assert.equal(canPlace({ x: 36, z: 16 }, removed), true, 'Removal frees occupied cells');
console.log('PASS: moving, removal, Main Hall protection, immutable validation, and persistence');

const { rotateBuilding } = compiled.exports;
let rotated = original;
for (let turn = 1; turn <= 4; turn++) {
  rotated = rotateBuilding(movable.id, rotated);
  assert.equal(rotated[1].rotation, turn % 4, 'Rotation cycles through four quarter turns');
  assert.equal(rotated[1].x, movable.x);
  assert.equal(rotated[1].z, movable.z);
}
assert.equal(rotateBuilding('missing', original), null);
const movedHall = moveBuilding(MAIN_HALL.id, { x: 0, z: 8 }, rotateBuilding(MAIN_HALL.id, original));
assert.equal(movedHall[0].rotation, 1, 'Moving preserves orientation');
assert.deepEqual(restoreBuildings(JSON.stringify(movedHall)), movedHall, 'Hall position and rotation survive reload');
assert.equal(removeBuilding(MAIN_HALL.id, movedHall), null, 'Moved hall still cannot be removed');
const atOldHall = { id: 'old-hall-site', kind: 'farm', x: MAIN_HALL.x, z: MAIN_HALL.z, rotation: 3 };
assert.deepEqual(restoreBuildings(JSON.stringify([atOldHall, ...movedHall])), [movedHall[0], atOldHall, ...movedHall.slice(1)], 'Restore hall before buildings even if save order differs');
assert.equal(restoreBuildings(JSON.stringify([{ ...MAIN_HALL, x: -1 }]))[0].x, MAIN_HALL.x, 'Invalid hall falls back to default');
assert.equal(restoreBuildings(JSON.stringify([{ ...movable, rotation: 99 }]))[1].rotation, undefined, 'Invalid rotation resets to default');
assert.equal(restoreBuildings(JSON.stringify([movedHall[0], { ...movedHall[0], x: 12 }])).filter(b => b.kind === 'hall').length, 1, 'Restore exactly one hall');
assert.deepEqual(restoreBuildings(JSON.stringify(rotateBuilding(movable.id, original))), rotateBuilding(movable.id, original));
console.log('PASS: rotation, moved Main Hall persistence, save validation, and removal protection');
const { TRAINABLE_TROOP_KINDS, TROOP_KINDS, TROOP_DEFINITIONS, TRAINING_BATCH, EMPTY_TROOPS, canTrain, trainTroops, restoreTroops } = compiled.exports;
assert.deepEqual(restoreTroops(null), EMPTY_TROOPS);
assert.deepEqual(restoreTroops('bad'), EMPTY_TROOPS);
assert.deepEqual(restoreTroops('{"infantry":-1,"archer":1.5,"scout":"20"}'), EMPTY_TROOPS);
assert.deepEqual(restoreTroops('{"infantry":1e100,"unknown":100}'), EMPTY_TROOPS);
for (const kind of TRAINABLE_TROOP_KINDS) {
  const facility = { id: 'training-facility', kind: TROOP_DEFINITIONS[kind].building, x: 0, z: 0 };
  const settlement = [MAIN_HALL, facility];
  assert.equal(canTrain(kind, [MAIN_HALL]), false, 'Main Hall alone does not unlock troops');
  assert.equal(trainTroops(kind, [MAIN_HALL], EMPTY_TROOPS), null, 'Reject training without required building');
  assert.equal(canTrain(kind, settlement), true);
  const trained = trainTroops(kind, settlement, EMPTY_TROOPS);
  assert.equal(trained[kind], TRAINING_BATCH);
  assert.equal(EMPTY_TROOPS[kind], 0, 'Training does not mutate prior counts');
  assert.deepEqual(restoreTroops(JSON.stringify(trained)), trained, 'Troops survive reload');
  assert.equal(trainTroops(kind, settlement, trained)[kind], TRAINING_BATCH * 2, 'Repeated training accumulates');
  assert.equal(trainTroops(kind, [MAIN_HALL], trained), null, 'Removing facility locks further training');
  assert.equal(trained[kind], TRAINING_BATCH, 'Existing troops remain after facility removal');
  const movedFacility = moveBuilding(facility.id, { x: 4, z: 0 }, settlement);
  assert.equal(canTrain(kind, movedFacility), true, 'Moving facility preserves unlock');
  for (const other of TROOP_KINDS.filter(value => value !== kind)) assert.equal(canTrain(other, settlement), false, 'Facilities only unlock their assigned troop');
  assert.equal(trainTroops(kind, settlement, { ...trained, [kind]: Number.MAX_SAFE_INTEGER }), null, 'Reject count overflow');
}
console.log('PASS: troop unlocks, training batches, facility removal/movement, and troop save validation');

const militaryServiceSource = ts.transpileModule(fs.readFileSync('src/game/military-service.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const militaryServiceCompiled = { exports: {} };
new Function('exports', 'require', 'module', militaryServiceSource)(
  militaryServiceCompiled.exports,
  specifier => specifier === './base' ? compiled.exports : require(specifier),
  militaryServiceCompiled,
);
const { createMilitaryService, getTotalMilitary, MILITARY_SAVE_KEY } = militaryServiceCompiled.exports;
const savedValues = new Map([[MILITARY_SAVE_KEY, '{"infantry":20,"archer":10,"scout":0}']]);
const storage = {
  getItem: key => savedValues.get(key) ?? null,
  setItem: (key, value) => savedValues.set(key, value),
};
assert.deepEqual(createMilitaryService().getTroops(), EMPTY_TROOPS, 'A fresh game starts without default troops');
const militaryService = createMilitaryService(storage);
assert.deepEqual(militaryService.getTroops(), { infantry: 20, archer: 10, scout: 0 }, 'Military service restores saved troops');
assert.equal(getTotalMilitary(militaryService.getTroops()), 30, 'Military total includes soldiers and archers');
const trainedArchers = militaryService.train('archer', [MAIN_HALL, { id: 'range', kind: 'archery', x: 0, z: 0 }]);
assert.equal(trainedArchers.persisted, true);
assert.deepEqual(JSON.parse(savedValues.get(MILITARY_SAVE_KEY)), { infantry: 20, archer: 20, scout: 0 }, 'Military service persists training');
assert.equal(createMilitaryService(storage).getTroops().archer, 20, 'Persisted troops survive service recreation');
console.log('PASS: zero-unit fresh start, military restoration, training persistence, and totals');

const heroesSource = ts.transpileModule(fs.readFileSync('src/game/heroes.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const heroesCompiled = { exports: {} };
new Function('exports', 'require', 'module', heroesSource)(heroesCompiled.exports, require, heroesCompiled);
const compileGameModule = (path) => {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const result = { exports: {} };
  new Function('exports', 'require', 'module', output)(result.exports, specifier => {
    if (specifier === './base') return compiled.exports;
    if (specifier === './heroes') return heroesCompiled.exports;
    return require(specifier);
  }, result);
  return result.exports;
};
const deployment = compileGameModule('src/game/town-deployment.ts');
const offense = compileGameModule('src/game/offense-formations.ts');
assert.deepEqual(deployment.restoreDeployedAxieIds('["ember","moss","ember","unknown"]'), ['ember', 'moss'], 'Town deployment restore rejects unknown and duplicate Axies');
assert.deepEqual(deployment.restoreDeployedAxieIds('bad'), deployment.getDefaultDeployedAxieIds(), 'Invalid deployment saves use starter town Axies');
const savedFormation = offense.createEmptyFormations();
savedFormation[0].assignments.push({ row: 0, column: 0, heroId: 'ember', military: null, militaryCount: 0 });
savedFormation[0].assignments.push({ row: 0, column: 1, heroId: 'moss', military: null, militaryCount: 0 });
savedFormation[0].assignments.push({ row: 1, column: 0, heroId: null, military: 'infantry', militaryCount: 12 });
savedFormation[0].assignments.push({ row: 1, column: 1, heroId: null, military: 'infantry', militaryCount: 9 });
savedFormation[0].assignments.push({ row: 2, column: 0, heroId: null, military: 'archer', militaryCount: 7 });
savedFormation[0].leader = 'ember';
const restoredFormation = offense.restoreOffenseFormations(offense.serializeOffenseFormations(savedFormation), ['ember'], { infantry: 20, archer: 7, scout: 0 });
assert.equal(restoredFormation[0].assignments[0].heroId, 'ember', 'A deployed town Axie restores into offense');
assert.equal(restoredFormation[0].assignments.some(slot => slot.heroId === 'moss'), false, 'An Axie outside town is removed from offense');
assert.equal(restoredFormation[0].leader, 'ember', 'A deployed Axie in the formation restores as leader');
assert.equal(restoredFormation[0].assignments.find(slot => slot.row === 1 && slot.column === 0).militaryCount, 12, 'Valid trained military restores');
assert.equal(restoredFormation[0].assignments.some(slot => slot.row === 1 && slot.column === 1), false, 'Military assignments cannot exceed trained totals');
assert.equal(restoredFormation[0].assignments.find(slot => slot.row === 2 && slot.column === 0).militaryCount, 7, 'Each trained military kind restores independently');
assert.deepEqual(offense.getFormationTroopCounts(restoredFormation[0]), { infantry: 12, archer: 7 });
assert.deepEqual(offense.getFormationsTroopCounts(restoredFormation), { infantry: 12, archer: 7 }, 'Formation military totals are city-wide');
const duplicateFormations = offense.createEmptyFormations();
duplicateFormations[0].assignments.push({ row: 0, column: 0, heroId: null, military: 'infantry', militaryCount: 15 });
duplicateFormations[1].assignments.push({ row: 0, column: 0, heroId: null, military: 'infantry', militaryCount: 15 });
const cappedFormations = offense.restoreOffenseFormations(offense.serializeOffenseFormations(duplicateFormations), [], { infantry: 20, archer: 0, scout: 0 });
assert.equal(offense.getFormationsTroopCounts(cappedFormations).infantry, 15, 'Saved formations share the city-wide troop cap');
assert.deepEqual(offense.restoreOffenseFormations('bad', ['ember'], { infantry: 20, archer: 7, scout: 0 }), offense.createEmptyFormations(), 'Invalid formation saves start empty');
const wideFormation = offense.createEmptyFormations();
wideFormation[0].assignments.push({ row: 2, column: 4, heroId: 'ember', military: null, militaryCount: 0 });
assert.equal(offense.restoreOffenseFormations(offense.serializeOffenseFormations(wideFormation), ['ember'], { infantry: 0, archer: 0, scout: 0 }, { columns: 5, rows: 3 })[0].assignments[0].column, 4, 'Any visible grid coordinate persists');
assert.deepEqual(offense.restoreOffenseFormations(JSON.stringify(savedFormation), ['ember'], { infantry: 20, archer: 7, scout: 0 }), offense.createEmptyFormations(), 'Legacy row saves are rejected');
console.log('PASS: town-only Axie assignments, troop limits, leaders, and offense formation restoration');
