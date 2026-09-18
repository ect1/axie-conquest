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


const b = load('src/game/battle.ts');
const range = load('src/game/battle-range.ts');
const battleSettings = load('src/game/battle-settings.ts');
const sandboxRules = load('src/game/sandbox-battle.ts');
const save = load('src/game/battle-save.ts');
const u = load('src/game/units.ts');
const f = load('src/game/offense-formations.ts');
const military = load('src/game/military-service.ts');
const world = load('src/game/world.ts');
const replayRules = load('src/game/battle-replay.ts');
const { STARTER_HEROES } = load('src/game/heroes.ts');
const troops = { infantry: 100, archer: 100, scout: 0 };
const army = b.createSandboxArmy('balanced');
assert.equal(battleSettings.DEFAULT_BATTLE_SETTINGS.dashSpeedMultiplier, 3, 'combined battle settings retain the JSON dash multiplier for the sandbox');
assert.deepEqual(sandboxRules.baseCombatStats(battleSettings.DEFAULT_BATTLE_SETTINGS, 'archer'), { health: 38, attack: 8, defense: 6, speed: 2.3, attackSpeed: .63, projectileSpeed: 12 }, 'archer base stats come from the shared JSON battle settings');
assert.equal(battleSettings.sanitizeBattleSettings({ baseChimeraHealth: -1, baseChimeraAttack: 999999, baseChimeraDefense: -1 }).baseChimeraHealth, 1, 'base health settings are clamped');
assert.equal(army.leaderId, STARTER_HEROES[0].id);
let initial = b.createBattle(army);
const openingPlayer = b.formationCenter(initial, 'player');
const openingEnemy = b.formationCenter(initial, 'enemy');
assert.equal(openingPlayer.x, 0, 'player formation opens centered on the battle axis');
assert.equal(openingEnemy.x, 0, 'enemy formation opens centered on the battle axis');
assert.ok(Math.abs((openingEnemy.z - openingPlayer.z) - 11.483) < 0.01, 'opening teams honor the shared configurable separation');
assert.ok(initial.fighters.filter(fighter => fighter.side === 'player').every(fighter => fighter.facing === 0), 'player opens south-facing north');
assert.ok(initial.fighters.filter(fighter => fighter.side === 'enemy').every(fighter => fighter.facing === Math.PI), 'enemy opens north-facing south');
const recording = replayRules.beginReplay(initial);
const staged = replayRules.replayPresentationBattle(recording, initial);
const stagedPlayer = b.formationCenter(staged, 'player'), stagedEnemy = b.formationCenter(staged, 'enemy');
assert.ok(Math.abs(stagedPlayer.x) < 1e-9 && Math.abs(stagedEnemy.x) < 1e-9, 'replay formations align on the north-south axis');
assert.ok(stagedPlayer.z < 0 && stagedEnemy.z > 0, 'replay stages player south and enemy north');
assert.ok(staged.fighters.every(fighter => fighter.facing === (fighter.side === 'player' ? 0 : Math.PI)), 'opening replay formations face each other');
const advanced = { ...initial, fighters: initial.fighters.map(fighter => fighter.side === 'player' ? { ...fighter, z: fighter.z + 1 } : fighter) };
const stagedAdvanced = replayRules.replayPresentationBattle(recording, advanced);
assert.notEqual(stagedAdvanced.fighters[0].z, staged.fighters[0].z, 'fixed replay transform preserves recorded movement');
assert.equal(initial.fighters.find(f => f.troopKind === 'infantry').maxHp, 1100, 'live battles use the shared soldier base-health setting');
assert.equal(b.damageAfterDefense(100, 100), 50);
const squad = initial.fighters.find(f => f.troopKind === 'infantry');
assert.equal(b.livingCount({ ...squad, hp: 800 }), 15);
assert.equal(b.livingCount({ ...squad, hp: 0 }), 0);
const before = JSON.stringify(initial);
b.stepBattle(initial);
assert.equal(JSON.stringify(initial), before, 'simulation does not mutate inputs');
function run(battle) { while (!battle.result) battle = b.stepBattle(battle); return battle; }
assert.deepEqual(run(initial), run(structuredClone(initial)), 'deterministic outcomes');
for (const kind of ['balanced', 'infantry', 'archer']) {
  const result = run(b.createBattle(b.createSandboxArmy(kind)));
  assert.ok(['victory', 'defeat'].includes(result.result), `${kind} resolves without deadlock`);
  assert.ok(result.fighters.every(f => f.hp >= 0));
  console.log(`${kind}: ${result.result} in ${result.tick / 10}s`);
}
let melee = { ...initial.fighters[0], stats: { ...squad.stats }, x: 0, z: 0, initialCount: 1, hp: 100, maxHp: 100, targetId: null, cooldown: 0 };
let enemy = { ...melee, id: 'enemy:test', side: 'enemy', x: 0, z: 5 };
let duel = { ...initial, fighters: [melee, enemy], leaderId: null };
let step = b.stepBattle(duel);
assert.equal(step.fighters[0].state, 'charging');
assert.ok(Math.abs(step.fighters[0].z - melee.stats.speed * battleSettings.DEFAULT_BATTLE_SETTINGS.dashSpeedMultiplier * b.BATTLE_STEP) < 1e-10, 'charge movement uses the configured dash multiplier');
const archer = { ...melee, stats: { ...b.TROOP_COMBAT_STATS.archer }, troopKind: 'archer' };
step = b.stepBattle({ ...duel, fighters: [archer, enemy] });
assert.equal(step.fighters[0].state, 'attacking');
assert.equal(step.fighters[0].z, 0, 'archers hold shooting distance');
assert.ok(step.fighters[1].hp < enemy.hp);
step = b.stepBattle({ ...duel, fighters: [melee, { ...enemy, z: 50 }] });
assert.equal(step.fighters[0].state, 'holding', 'awareness does not reach distant enemies');
// Level 1 is directional: a unit first needs to be facing its detected enemy.
const watch = b.stepBattle({ ...duel, fighters: [melee, { ...enemy, z: 14 }] });
assert.equal(watch.fighters[1].state, 'holding');
assert.equal(watch.fighters[1].z, 14);
assert.equal(watch.fighters[1].facing, 0);
assert.ok(watch.fighters[0].z > 0, 'ordered attacker continues its approach');
const facedDefender = { ...enemy, facing: Math.PI };
assert.equal(b.stepBattle({ ...duel, fighters: [melee, facedDefender] }).fighters[1].state, 'charging', 'Level 1 dash begins when the defender detects an enemy ahead');
assert.equal(range.level0CanAttack({ x: 0, z: 0, facing: 0 }, { x: 0, z: 4, radius: .5 }, 4, { ...range.DEFAULT_BATTLE_RANGE, level0Angle: 90 }), true, 'Level 0 accepts targets within its facing cone');
assert.equal(range.level0CanAttack({ x: 0, z: 0, facing: 0 }, { x: 4, z: 0, radius: .5 }, 4, { ...range.DEFAULT_BATTLE_RANGE, level0Angle: 90 }), false, 'Level 0 rejects targets outside its facing cone');
const sandboxSettings = { ...range.DEFAULT_BATTLE_RANGE, level0Range: 1, level0Angle: 180, level1DetectionRange: 10, level1DetectionAngle: 180, bodyRadius: .5, dashSpeedMultiplier: 2 };
const sandboxOpening = sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1 }, { id: 'enemy', side: 'enemy', x: 0, z: 5, facing: Math.PI, speed: 2, attackRange: 1 }]);
const sandboxStep = sandboxRules.stepSandboxBattle(sandboxOpening, sandboxSettings);
assert.equal(sandboxStep.units[0].state, 'approaching', 'sandbox Level 0 detection starts a walking approach');
assert.ok(sandboxStep.units[0].z > 0, 'sandbox approach moves toward the detected target');
assert.equal(sandboxStep.units[0].hp, sandboxStep.units[0].maxHp, 'sandbox units retain their health while approaching');
const sandboxArrival = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1 }, { id: 'enemy', side: 'enemy', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 1 }]), sandboxSettings);
assert.equal(sandboxArrival.units[0].state, 'attacking', 'sandbox unit attacks once it arrives in range');
assert.ok(sandboxArrival.units[0].hp < sandboxArrival.units[0].maxHp, 'sandbox attacks reduce health');
assert.equal(sandboxArrival.units[0].hp, sandboxArrival.units[1].hp, 'sandbox damage resolves simultaneously');
const armoredSandbox = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'attacker', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 2, health: 100, attack: 100, defense: 0 }, { id: 'armored', side: 'enemy', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 2, health: 100, attack: 1, defense: 100 }]), sandboxSettings);
assert.equal(armoredSandbox.units.find(unit => unit.id === 'armored').hp, 50, 'sandbox defense reduces incoming attack damage');
const projectileSandbox = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'archer', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 2, projectileSpeed: 12 }, { id: 'target', side: 'enemy', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 2 }]), sandboxSettings);
assert.deepEqual(projectileSandbox.events.filter(event => event.projectileSpeed), [{ from: 'archer', to: 'target', projectileSpeed: 12 }], 'ranged sandbox attacks emit a projectile event for the board renderer');
const narrowSearch = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1, searchAtZ: 0 }, { id: 'enemy', side: 'enemy', x: 4, z: 0, facing: Math.PI, speed: 2, attackRange: 1 }]), { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(narrowSearch.units[0].state, 'searching', 'sandbox turns toward a nearby enemy outside a narrow detection cone');
assert.equal(narrowSearch.units[0].targetId, 'enemy');
const beforeEdge = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 2, facing: Math.PI, speed: 2, attackRange: 1, searchAtZ: 1 }, { id: 'enemy', side: 'enemy', x: 4, z: 0, facing: 0, speed: 2, attackRange: 1, searchAtZ: -1 }]), { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(beforeEdge.units[0].state, 'marching', 'sandbox marches until the board edge when no target is inside its cone');
assert.equal(beforeEdge.units[0].targetId, null);
const boardEdge = sandboxRules.stepSandboxBattle(sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 1, searchAtZ: 1, movementBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } }, { id: 'enemy', side: 'enemy', x: 0, z: 50, facing: 0, speed: 2, attackRange: 1, searchAtZ: -50 }]), sandboxSettings);
assert.equal(boardEdge.units[0].state, 'searching', 'melee units sweep at the board edge before roaming');
assert.equal(boardEdge.units[0].edgeScanStepsRemaining, sandboxRules.EDGE_SCAN_STEPS - 1, 'the edge sweep lasts a short fixed number of battle steps');
const roamingSweep = sandboxRules.stepSandboxBattle({
  tick: 4, events: [], result: null, units: [
    { ...sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 1, searchAtZ: 1, movementBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 } }]).units[0], reachedBoardEdge: true, edgeScanStepsRemaining: 0, roamStepsSinceScan: sandboxRules.MELEE_ROAM_SCAN_INTERVAL - 1 },
    { ...sandboxRules.createSandboxBattle([{ id: 'flanker', side: 'enemy', x: 4, z: 1, facing: Math.PI, speed: 2, attackRange: 1 }]).units[0] },
  ],
}, { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(roamingSweep.units[0].targetId, 'flanker', 'melee units periodically scan their full awareness radius while roaming');
assert.equal(roamingSweep.units[0].state, 'searching', 'a roaming full-circle sweep pauses movement when it finds a target');
const postKillScan = sandboxRules.stepSandboxBattle({
  tick: 4, events: [], result: null, units: [
    { ...sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1 }]).units[0], targetId: 'fallen' },
    { ...sandboxRules.createSandboxBattle([{ id: 'fallen', side: 'enemy', x: 0, z: 1, facing: Math.PI, speed: 2, attackRange: 1 }]).units[0], hp: 0, state: 'defeated' },
    { ...sandboxRules.createSandboxBattle([{ id: 'flanker', side: 'enemy', x: 4, z: 0, facing: Math.PI, speed: 2, attackRange: 1 }]).units[0] },
  ],
}, { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(postKillScan.units[0].state, 'searching', 'a unit scans instead of marching immediately after its target falls');
assert.equal(postKillScan.units[0].targetId, 'flanker', 'the post-kill scan detects an enemy anywhere in its awareness radius');
assert.equal(postKillScan.units[0].searchStepsRemaining, sandboxRules.POST_KILL_SCAN_STEPS - 1, 'the all-around scan lasts a short fixed number of battle steps');
const rangedSweep = sandboxRules.stepSandboxBattle({
  tick: 4, events: [], result: null, units: [
    { ...sandboxRules.createSandboxBattle([{ id: 'archer', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1, projectileSpeed: 12 }]).units[0], movementStepsSinceScan: sandboxRules.RANGED_MOVEMENT_SCAN_INTERVAL - 1 },
    { ...sandboxRules.createSandboxBattle([{ id: 'flanker', side: 'enemy', x: 4, z: 0, facing: Math.PI, speed: 2, attackRange: 1 }]).units[0] },
  ],
}, { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(rangedSweep.units[0].targetId, 'flanker', 'ranged units periodically detect enemies across their full awareness radius while marching');
assert.notEqual(rangedSweep.units[0].state, 'marching', 'a ranged full-circle sweep interrupts forward movement when it finds a target');
const alertedByDamage = sandboxRules.stepSandboxBattle({
  tick: 4, result: null, events: [{ from: 'attacker', to: 'player', projectileSpeed: 12 }], units: [
    { ...sandboxRules.createSandboxBattle([{ id: 'player', side: 'player', x: 0, z: 0, facing: 0, speed: 2, attackRange: 1 }]).units[0] },
    { ...sandboxRules.createSandboxBattle([{ id: 'attacker', side: 'enemy', x: 4, z: 0, facing: Math.PI, speed: 2, attackRange: 1 }]).units[0] },
  ],
}, { ...sandboxSettings, level1DetectionAngle: 20 });
assert.equal(alertedByDamage.units[0].targetId, 'attacker', 'a damaged unit identifies its attacker outside its normal detection cone');
assert.notEqual(alertedByDamage.units[0].state, 'marching', 'damage awareness interrupts an otherwise unaware unit movement');
const hurt = b.stepBattle({ ...duel, fighters: [melee, { ...enemy, z: 14, hp: 90 }] });
assert.equal(hurt.fighters[1].state, 'approaching', 'damage provokes retaliation beyond Level 1');
assert.ok(hurt.fighters[1].z < 14);
const distantHit = b.stepBattle({ ...duel, fighters: [melee, { ...enemy, z: 20, hp: 90 }] });
assert.equal(distantHit.fighters[1].state, 'approaching', 'damage wakes defenders beyond awareness');
const attackerAware = b.stepBattle({ ...duel, fighters: [{ ...melee, id: 'player:near', z: 1 }, { ...enemy, hp: 90, targetId: null, facing: 0 }, { ...enemy, id: 'player:attacker', side: 'player', x: 4, z: 5 }], events: [{ from: 'player:attacker', to: 'enemy:test', amount: 1, kind: 'hit' }] });
assert.equal(attackerAware.fighters.find(fighter => fighter.id === 'enemy:test').targetId, 'player:attacker', 'a unit outside its detection cone reacquires the attacker that damaged it');
const leashed = b.stepBattle({ ...duel, fighters: [{ ...melee, z: -40 }, { ...enemy, hp: 90 }] });
assert.equal(leashed.fighters[1].state, 'holding', 'retaliation respects camp leash');
const rangedDefender = { ...enemy, stats: { ...b.TROOP_COMBAT_STATS.archer }, troopKind: 'archer', hp: 90, facing: Math.PI };
const rangedStep = b.stepBattle({ ...duel, fighters: [melee, rangedDefender] });
assert.equal(rangedStep.fighters[1].state, 'attacking');
assert.equal(rangedStep.fighters[1].z, rangedDefender.z, 'defender archers stop at bow range');
const lethal = { ...melee, hp: 1, stats: { ...melee.stats, attack: 1000, range: 2 } };
step = b.stepBattle({ ...duel, fighters: [lethal, { ...lethal, side: 'enemy', id: 'enemy:test', z: 1, facing: Math.PI }] });
assert.equal(step.result, 'draw', 'simultaneous lethal attacks have no ordering advantage');
assert.equal(run({ ...initial, retreating: true }).result, 'retreated');
assert.equal(b.stepBattle({ ...duel, tick: b.MAX_BATTLE_TICKS - 1, fighters: [melee, { ...enemy, z: 50 }] }).result, 'draw');
let skillBattle = { ...initial, fighters: initial.fighters.map(f => ({ ...f, x: f.side === 'player' ? 0 : 1, z: 0, hp: f.hp / 2 })) };
const cast = b.activateCommanderSkill(skillBattle);
assert.notEqual(cast, skillBattle);
assert.ok(cast.skillCooldown > 0);
assert.equal(b.activateCommanderSkill(cast), cast, 'cooldown prevents repeated skill casts');
assert.equal(b.activateCommanderSkill({ ...skillBattle, retreating: true }).skillCooldown, 0);
const healer = STARTER_HEROES.find(h => h.parts.mouth === 'Axie Kiss');
assert.ok(healer);
let healing = structuredClone(initial);
const leaderIndex = healing.fighters.findIndex(f => f.id === healing.leaderId);
healing.fighters[leaderIndex].heroId = healer.id;
healing.fighters.forEach(f => { f.x = 0; f.z = 0; });
const woundedIndex = healing.fighters.findIndex(f => f.side === 'player' && f.troopKind === 'infantry');
healing.fighters[woundedIndex].hp = 800;
const healed = b.activateCommanderSkill(healing);
assert.equal(b.livingCount(healed.fighters[woundedIndex]), 15, 'healing cannot resurrect lost soldiers');
assert.equal(healed.fighters[woundedIndex].hp, 825, 'healing repairs the remaining wounded soldier');
const retarget = b.stepBattle({ ...duel, fighters: [{ ...melee, targetId: 'dead' }, { ...enemy, id: 'dead', hp: 0 }, { ...enemy, id: 'alive' }] });
assert.equal(retarget.fighters[0].targetId, 'alive');
const target = { id: 'test-garrison', kind: 'garrison', state: 'defended', x: 40, z: 0, loot: { apple: 1 } };
const attacking = { ...army, position: { x: 40, z: 0 }, activity: { action: 'attack', targetId: target.id, targetLabel: 'Garrison' } };
let session = save.createBattleSession(attacking, target);
for (let i = 0; i < 50; i++) session = { ...session, battle: b.stepBattle(session.battle) };
const restored = save.restoreBattleSave(JSON.stringify({ active: session, report: null }), troops).active;
assert.ok(restored, 'valid active battle restores');
assert.equal(JSON.stringify(run(restored.battle)), JSON.stringify(run(session.battle)), 'reload resumes exactly the same simulation');
const legacyOffset = 16 - Math.hypot(target.x - attacking.position.x, target.z - attacking.position.z);
const legacySession = { ...session, battle: { ...session.battle, layoutVersion: undefined, fighters: session.battle.fighters.map(fighter => fighter.side === 'player' ? { ...fighter, z: fighter.z + legacyOffset } : fighter) } };
const migrated = save.restoreBattleSave(JSON.stringify({ active: legacySession, report: null }), troops).active;
assert.ok(migrated, 'legacy active battle restores');
assert.ok(migrated.battle.fighters.every((fighter, index) => Math.hypot(fighter.x - session.battle.fighters[index].x, fighter.z - session.battle.fighters[index].z) < 1e-9), 'legacy active battle keeps its current combat positions after recentering');
for (const corrupt of [null, {}, { ...session.battle, tick: -1 }, { ...session.battle, fighters: [{ ...session.battle.fighters[0], hp: -1 }] }]) {
  assert.equal(save.restoreBattleSave(JSON.stringify({ active: { ...session, battle: corrupt } }), troops).active, null);
}
const completed = { ...session, battle: run(session.battle) };
const formation = f.createEmptyFormation();
formation.assignments.push({ row: 0, column: 1, heroId: STARTER_HEROES[0].id, military: null, militaryCount: 0 }); formation.leader = STARTER_HEROES[0].id;
formation.assignments.push({ row: 0, column: 0, heroId: null, military: 'infantry', militaryCount: 20 });
formation.assignments.push({ row: 2, column: 2, heroId: null, military: 'archer', militaryCount: 20 });
function storageFor(failAt = Infinity) {
  const data = new Map([['unrelated', 'keep']]); let writes = 0;
  return { data, getItem: key => data.get(key) ?? null, setItem(key, value) { if (++writes === failAt) throw Error('Interrupted'); data.set(key, value); }, removeItem: key => data.delete(key), get length() { return data.size; }, key: i => [...data.keys()][i] ?? null };
}
const storage = storageFor();
const outcome = save.commitBattleOutcome(storage, completed, [attacking], troops, [formation], [target], 10000);
assert.equal(outcome.troops.infantry, troops.infantry - outcome.report.losses.infantry);
assert.equal(outcome.units[0].status, 'returning');
assert.equal(outcome.units[0].activity, undefined);
assert.equal(storage.getItem(save.BATTLE_TRANSACTION_KEY), null);
assert.ok(u.restoreUnits(JSON.stringify(outcome.units), outcome.troops, 10000).length, 'survivors restore and remain reserved');
assert.equal(save.restoreBattleSave(storage.getItem(save.BATTLE_SAVE_KEY), outcome.troops).active, null);
assert.ok(save.restoreBattleSave(storage.getItem(save.BATTLE_SAVE_KEY), outcome.troops).report);
for (let failAt = 2; failAt <= 6; failAt++) {
  const interrupted = storageFor(failAt);
  assert.throws(() => save.commitBattleOutcome(interrupted, completed, [attacking], troops, [formation], [target], 10000), /Interrupted/);
  assert.ok(interrupted.getItem(save.BATTLE_TRANSACTION_KEY));
  save.recoverBattleTransaction(interrupted);
  assert.deepEqual([...interrupted.data].sort(), [...storage.data].sort(), `recovery after write ${failAt}`);
  save.recoverBattleTransaction(interrupted);
  assert.equal(interrupted.getItem('unrelated'), 'keep');
}
const win = { ...session, battle: { ...session.battle, result: 'victory', fighters: session.battle.fighters.map(f => f.side === 'enemy' ? { ...f, hp: 0, state: 'defeated', targetId: null } : f) } };
const won = save.commitBattleOutcome(storageFor(), win, [attacking], troops, [formation], [target], 10000);
assert.equal(won.units[0].id, attacking.id);
assert.equal(won.units[0].status, 'returning', 'victorious formation returns to base');
assert.ok(won.units[0].order && won.units[0].order.kind === 'return');
assert.equal(won.units[0].activity, undefined, 'finished attack cannot restart');
assert.equal(u.commandUnit(won.units[0], 'move', 10001, { x: 55, z: 25 }).status, 'moving', 'survivors accept the next order');
assert.equal(u.restoreUnits(JSON.stringify(won.units), won.troops, 10001)[0].status, 'returning', 'victorious survivors remain commandable after reload');
const projection = load('src/game/battle-world.ts');
for (const point of [{ x: 24, z: 0 }, { x: 40, z: -16 }, { x: 40, z: 0 }, { x: 45, z: 5 }]) {
  const march = { ...attacking, position: point };
  const fight = save.createBattleSession(march, target);
  const sessionPlayer = b.formationCenter(fight.battle, 'player');
  const sessionEnemy = b.formationCenter(fight.battle, 'enemy');
  assert.ok(Math.abs((sessionEnemy.z - sessionPlayer.z) - 11.483) < 0.01, 'world sessions retain the centered tactical opening');
  const angle = projection.battleWorldTransform(fight).angle;
  for (const fighter of fight.battle.fighters.filter(f => f.side === 'player')) {
    const member = march.members.find(m => m.id === fighter.memberId);
    const actual = projection.fighterWorldPosition(fight, fighter);
    const expected = { x: point.x + member.offset.x * Math.cos(angle) + member.offset.z * Math.sin(angle), z: point.z - member.offset.x * Math.sin(angle) + member.offset.z * Math.cos(angle) };
    assert.ok(Math.hypot(actual.x - expected.x, actual.z - expected.z) < 1e-9, 'combat begins at the actual formation position');
  }
}
// Test simultaneous battles against two different enemies
const targetB = { id: 'test-boss', kind: 'boss', state: 'defended', x: 60, z: 20, loot: { apple: 1 } };
const marchB = { ...attacking, id: 'army-2', name: 'Alpha Strike', position: { x: 60, z: 20 }, formationIndex: 1, activity: { action: 'attack', targetId: targetB.id, targetLabel: 'Boss' } };
const sessionB = save.createBattleSession(marchB, targetB);
const multiStorage = storageFor();
const multiSave = { active: session, sessions: [session, sessionB], report: null };
multiStorage.setItem(save.BATTLE_SAVE_KEY, JSON.stringify(multiSave));

const restoredMulti = save.restoreBattleSave(multiStorage.getItem(save.BATTLE_SAVE_KEY), troops);
assert.equal(restoredMulti.sessions.length, 2, 'both simultaneous battles restore in active state');
assert.equal(restoredMulti.sessions[0].army.id, attacking.id);
assert.equal(restoredMulti.sessions[1].army.id, marchB.id);

// When battle A finishes, commit its outcome while battle B is still fighting
const multiOutcome = save.commitBattleOutcome(multiStorage, completed, [attacking, marchB], troops, [formation, formation], [target, targetB], 10000);
assert.equal(multiOutcome.sessions.length, 1, 'finishing battle A leaves battle B active');
assert.equal(multiOutcome.sessions[0].army.id, marchB.id);
assert.equal(save.restoreBattleSave(multiStorage.getItem(save.BATTLE_SAVE_KEY), multiOutcome.troops).sessions.length, 1);
assert.equal(save.restoreBattleSave(multiStorage.getItem(save.BATTLE_SAVE_KEY), multiOutcome.troops).active.army.id, marchB.id, 'battle B remains active in storage');

// Finish battle B as well
const completedB = { ...sessionB, battle: run(sessionB.battle) };
const multiOutcomeB = save.commitBattleOutcome(multiStorage, completedB, multiOutcome.units, multiOutcome.troops, multiOutcome.formations, multiOutcome.objects, 10050);
assert.equal(multiOutcomeB.sessions.length, 0, 'finishing battle B cleans up all active battles');
assert.equal(save.restoreBattleSave(multiStorage.getItem(save.BATTLE_SAVE_KEY), multiOutcome.troops).active, null);
// Test joint reinforcement battle against the same enemy
const reinforceArmy = { ...attacking, id: 'army-reinforce', name: 'Arrow Storm', position: { x: 40, z: 0 }, formationIndex: 1, activity: { action: 'attack', targetId: target.id, targetLabel: 'Garrison' } };
let jointSession = save.createBattleSession(attacking, target);
jointSession = save.reinforceBattleSession(jointSession, reinforceArmy);
assert.equal(jointSession.armies.length, 2, 'joint session contains both armies');
assert.ok(jointSession.battle.fighters.some(f => f.armyId === reinforceArmy.id), 'reinforcing army fighters are on the board');

const jointStorage = storageFor();
jointStorage.setItem(save.BATTLE_SAVE_KEY, JSON.stringify({ active: jointSession, sessions: [jointSession], report: null }));
const restoredJoint = save.restoreBattleSave(jointStorage.getItem(save.BATTLE_SAVE_KEY), troops);
assert.equal(restoredJoint.active.armies.length, 2, 'restored battle session retains both participant armies');

const completedJoint = { ...jointSession, battle: run(jointSession.battle) };
const jointOutcome = save.commitBattleOutcome(jointStorage, completedJoint, [attacking, reinforceArmy], troops, [formation, formation], [target], 10100);
assert.equal(jointOutcome.sessions.length, 0, 'joint battle concludes cleanly');
assert.equal(jointOutcome.units.length, 2);
assert.equal(jointOutcome.report.armyName, `${attacking.name} + ${reinforceArmy.name}`);
assert.ok(jointOutcome.report.armies && jointOutcome.report.armies.length === 2, 'report contains breakdown for both formations');
assert.equal(jointOutcome.report.armies[0].id, attacking.id);
assert.equal(jointOutcome.report.armies[1].id, reinforceArmy.id);
assert.ok(jointOutcome.report.members.some(m => m.formationName === attacking.name), 'member breakdown tags primary formation');
assert.ok(jointOutcome.report.members.some(m => m.formationName === reinforceArmy.name), 'member breakdown tags reinforcing formation');

const denied = storageFor(1);
assert.throws(() => save.commitBattleOutcome(denied, completed, [attacking], troops, [formation], [target], 10000), /Interrupted/);
assert.deepEqual([...denied.data], [['unrelated', 'keep']], 'journal failure makes no partial writes');
const malicious = storageFor(); malicious.data.set(save.BATTLE_TRANSACTION_KEY, JSON.stringify([['unrelated', 'bad']]));
assert.throws(() => save.recoverBattleTransaction(malicious), /invalid/);
assert.equal(malicious.getItem('unrelated'), 'keep');
const { resetGame } = load('src/game/reset.ts');
resetGame(storage);
assert.equal(storage.getItem('unrelated'), 'keep');
assert.deepEqual(save.restoreBattleSave(storage.getItem(save.BATTLE_SAVE_KEY), troops), { active: null, report: null });
assert.deepEqual(military.createMilitaryService(storage, army.cityId).getTroops(), { infantry: 0, archer: 0, scout: 0 });
assert.equal(world.restoreWorld(storage.getItem(world.WORLD_SAVE_KEY)), null);
console.log('PASS: battle rules, range, charge, archers, simultaneous damage, retreat, skill cooldown, deterministic resume, casualties, transaction recovery and reset');
