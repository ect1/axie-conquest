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

console.log('Testing portal spawn mobs aggression and formation body radius encounter detection...');

const portal = load('src/game/portal.ts');
const units = load('src/game/units.ts');
const formations = load('src/game/offense-formations.ts');
const { STARTER_HEROES } = load('src/game/heroes.ts');

// 1. Verify portal config has aggressiveOnPath enabled by default
assert.equal(portal.DEFAULT_PORTAL_CONFIG.aggressiveOnPath, true, 'DEFAULT_PORTAL_CONFIG.aggressiveOnPath should be true');
const sanitized = portal.sanitizePortalConfig({ enabled: true, aggressiveOnPath: false });
assert.equal(sanitized.aggressiveOnPath, false, 'sanitizePortalConfig should preserve aggressiveOnPath override');
const sanitizedDefault = portal.sanitizePortalConfig({ enabled: true });
assert.equal(sanitizedDefault.aggressiveOnPath, true, 'sanitizePortalConfig should default aggressiveOnPath to true');

// 2. Formation body radius calculations
// Build a player formation with assigned hero and soldiers
const formation = formations.createEmptyFormation();
formation.assignments.push({ row: 0, column: 0, heroId: STARTER_HEROES[0].id, military: null, militaryCount: 0 });
formation.assignments.push({ row: 1, column: 2, heroId: null, military: 'infantry', militaryCount: 20 });
const playerArmy = units.createArmy(formation, 0, 'everleaf-haven', 'Everleaf Haven', 5, 'test-army-1');

const playerRadius = units.getUnitFormationBodyRadius(playerArmy);
assert.ok(playerRadius > 1.0, `Player formation radius should be > 1.0, got ${playerRadius}`);
assert.ok(playerRadius < 6.0, `Player formation radius should be < 6.0, got ${playerRadius}`);

// Build an enemy march formation
const waveFormation = portal.generateWaveFormation(1, portal.DEFAULT_PORTAL_CONFIG, () => 0.5);
const enemyMarch = {
  id: 'march-test-1',
  portalId: 'portal-prime',
  portalName: 'Prime Portal',
  level: 1,
  name: 'Prime Rift Wave 1',
  ownerId: 'portal',
  origin: { x: 80, z: 0 },
  destination: { x: 25, z: 0 },
  startedAt: 0,
  arrivesAt: 10000,
  speed: 5.5,
  formation: waveFormation,
  status: 'marching',
};

const enemyRadius = portal.getEnemyFormationBodyRadius(enemyMarch);
assert.ok(enemyRadius > 2.0, `Enemy march formation radius should be > 2.0, got ${enemyRadius}`);
assert.ok(enemyRadius < 7.0, `Enemy march formation radius should be < 7.0, got ${enemyRadius}`);

const combinedRadius = playerRadius + enemyRadius;
console.log(`Calculated radii: playerRadius=${playerRadius.toFixed(2)}, enemyRadius=${enemyRadius.toFixed(2)}, combinedRadius=${combinedRadius.toFixed(2)}`);

// 3. Distance from point to segment
const pOnSegment = { x: 50, z: 0 };
const distOn = portal.distancePointToSegment(pOnSegment, { x: 80, z: 0 }, { x: 20, z: 0 });
assert.equal(distOn, 0, 'Point on segment should have distance 0');

const pSide = { x: 50, z: 4 };
const distSide = portal.distancePointToSegment(pSide, { x: 80, z: 0 }, { x: 20, z: 0 });
assert.equal(distSide, 4, 'Perpendicular distance should be exactly 4');

const pBeyondEnd = { x: 10, z: 0 };
const distBeyond = portal.distancePointToSegment(pBeyondEnd, { x: 80, z: 0 }, { x: 20, z: 0 });
assert.equal(distBeyond, 10, 'Distance beyond endpoint should measure from endpoint');

// 4. checkFormationPathEncounter
// Case A: Player army positioned right on the march path (x: 50, z: 0)
const playerArmyOnPath = { ...playerArmy, position: { x: 50, z: 0 } };
const hitOnPath = portal.checkFormationPathEncounter(
  enemyMarch,
  { x: 60, z: 0 },
  { x: 45, z: 0 },
  playerArmyOnPath,
  { x: 50, z: 0 }
);
assert.equal(hitOnPath, true, 'Should detect encounter when army is directly on path segment');

// Case B: Player army slightly offset within combined formation body radius
const playerArmyNearPath = { ...playerArmy, position: { x: 50, z: combinedRadius * 0.8 } };
const hitNearPath = portal.checkFormationPathEncounter(
  enemyMarch,
  { x: 60, z: 0 },
  { x: 45, z: 0 },
  playerArmyNearPath,
  playerArmyNearPath.position
);
assert.equal(hitNearPath, true, 'Should detect encounter within combined formation body radius');

// Case C: Player army far away from the path
const playerArmyFar = { ...playerArmy, position: { x: 50, z: combinedRadius + 5.0 } };
const hitFar = portal.checkFormationPathEncounter(
  enemyMarch,
  { x: 60, z: 0 },
  { x: 45, z: 0 },
  playerArmyFar,
  playerArmyFar.position
);
assert.equal(hitFar, false, 'Should not detect encounter when outside combined formation body radius');

// 5. detectEnemyMarchEncounters
// March moving from (80, 0) to (25, 0). At t=5000 (halfway), position is (52.5, 0).
const now = 5000;
const encounters = portal.detectEnemyMarchEncounters(
  now,
  [enemyMarch],
  [playerArmyOnPath],
  new Set(),
  new Set(),
  new Map([['march-test-1', { x: 55, z: 0 }]])
);
assert.equal(encounters.length, 1, 'Should detect 1 encounter');
assert.equal(encounters[0].march.id, enemyMarch.id);
assert.equal(encounters[0].unit.id, playerArmyOnPath.id);

// Should ignore army at home
const armyHome = { ...playerArmyOnPath, status: 'home' };
const encountersHome = portal.detectEnemyMarchEncounters(now, [enemyMarch], [armyHome]);
assert.equal(encountersHome.length, 0, 'Should ignore army with status "home"');

// Should ignore scouts
const scoutUnit = units.createScout('everleaf-haven', 'Everleaf Haven', 5, 'scout-1');
const scoutOnPath = { ...scoutUnit, position: { x: 52.5, z: 0 }, status: 'holding' };
const encountersScout = portal.detectEnemyMarchEncounters(now, [enemyMarch], [scoutOnPath]);
assert.equal(encountersScout.length, 0, 'Should ignore scout units');

// Should ignore march if already fighting
const fightingMarch = { ...enemyMarch, status: 'fighting', fightingPosition: { x: 50, z: 0 } };
const encountersFighting = portal.detectEnemyMarchEncounters(now, [fightingMarch], [playerArmyOnPath]);
assert.equal(encountersFighting.length, 0, 'Should ignore march already in "fighting" status');

// Should ignore army already in active battle session
const encountersArmyBusy = portal.detectEnemyMarchEncounters(
  now,
  [enemyMarch],
  [playerArmyOnPath],
  new Set(),
  new Set([playerArmyOnPath.id])
);
assert.equal(encountersArmyBusy.length, 0, 'Should ignore army currently fighting in active battle');

console.log('PASS: Portal spawn mobs aggressive encounter detection and formation body radius tests passed successfully.');
