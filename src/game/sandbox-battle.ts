import { angleTo, angularDifference, BattleRangeSettings, isInDirectionalRange } from './battle-range';

export const SANDBOX_BATTLE_STEP = .1;
/** A brief all-around awareness check after a unit's current target is defeated. */
export const POST_KILL_SCAN_STEPS = 5;
/** Ranged units sweep their full awareness radius after this many movement ticks. */
export const RANGED_MOVEMENT_SCAN_INTERVAL = 5;
/** Melee units pause to check their surroundings when their forward order reaches its edge. */
export const EDGE_SCAN_STEPS = 5;
export const MELEE_ROAM_SCAN_INTERVAL = 5;
// These are deliberately simple practice values. Range and movement remain
// board-navigation aids; this sandbox currently balances health, attack, and
// defense only.
const FALLBACK_COMBAT_STATS = { health: 55, attack: 6, defense: 20 };
export type BaseCombatSettings = {
  baseAxieHealth: number; baseAxieAttack: number; baseAxieDefense: number; baseAxieSpeed: number; baseAxieAttackSpeed: number;
  baseSoldierHealth: number; baseSoldierAttack: number; baseSoldierDefense: number; baseSoldierSpeed: number; baseSoldierAttackSpeed: number;
  baseArcherHealth: number; baseArcherAttack: number; baseArcherDefense: number; baseArcherSpeed: number; baseArcherAttackSpeed: number; baseArcherProjectileSpeed: number;
  baseChimeraHealth: number; baseChimeraAttack: number; baseChimeraDefense: number; baseChimeraSpeed: number; baseChimeraAttackSpeed: number;
};
export type BaseCombatKind = 'axie' | 'soldier' | 'archer' | 'chimera';
export function baseCombatStats(settings: BaseCombatSettings, kind: BaseCombatKind) {
  const key = kind[0].toUpperCase() + kind.slice(1) as 'Axie' | 'Soldier' | 'Archer' | 'Chimera';
  return { health: settings[`base${key}Health`], attack: settings[`base${key}Attack`], defense: settings[`base${key}Defense`], speed: settings[`base${key}Speed`], attackSpeed: settings[`base${key}AttackSpeed`], ...(kind === 'archer' ? { projectileSpeed: settings.baseArcherProjectileSpeed } : {}) };
}
export type SandboxMovementBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type SandboxBattleUnit = { id: string; side: 'player' | 'enemy'; x: number; z: number; facing: number; health: number; attack: number; defense: number; attackSpeed: number; projectileSpeed?: number; hp: number; maxHp: number; cooldown: number; speed: number; attackRange: number; searchAtZ?: number; movementBounds?: SandboxMovementBounds; reachedBoardEdge?: boolean; roamTarget?: { x: number; z: number }; searchStepsRemaining?: number; edgeScanStepsRemaining?: number; movementStepsSinceScan?: number; roamStepsSinceScan?: number; state: 'marching' | 'searching' | 'roaming' | 'holding' | 'approaching' | 'charging' | 'attacking' | 'defeated'; targetId: string | null };
export type SandboxBattleSeed = Omit<SandboxBattleUnit, 'state' | 'targetId' | 'health' | 'attack' | 'defense' | 'attackSpeed' | 'hp' | 'maxHp' | 'cooldown'> & Partial<Pick<SandboxBattleUnit, 'health' | 'attack' | 'defense' | 'attackSpeed'>>;
export type SandboxBattleEvent = { from: string; to: string; projectileSpeed?: number };
export type SandboxBattle = { tick: number; units: SandboxBattleUnit[]; events: SandboxBattleEvent[]; result: 'victory' | 'defeat' | 'draw' | null };
const DEFAULT_COMBAT_STATS = FALLBACK_COMBAT_STATS;

export function createSandboxBattle(units: readonly SandboxBattleSeed[]): SandboxBattle {
  return { tick: 0, events: [], result: null, units: units.map(unit => {
    const health = unit.health ?? DEFAULT_COMBAT_STATS.health;
    return { ...unit, health, attack: unit.attack ?? DEFAULT_COMBAT_STATS.attack, defense: unit.defense ?? DEFAULT_COMBAT_STATS.defense, attackSpeed: unit.attackSpeed ?? 1, hp: health, maxHp: health, cooldown: 0, reachedBoardEdge: false, searchStepsRemaining: 0, movementStepsSinceScan: 0, state: 'holding', targetId: null };
  }) };
}

function roamingSeed(id: string, tick: number): number {
  let seed = tick * 1103515245;
  for (let index = 0; index < id.length; index++) seed = (seed * 31 + id.charCodeAt(index)) >>> 0;
  return (seed % 10000) / 10000;
}
function nextRoamTarget(id: string, tick: number, bounds: SandboxMovementBounds): { x: number; z: number } {
  const padding = .3;
  return {
    x: bounds.minX + padding + (bounds.maxX - bounds.minX - padding * 2) * roamingSeed(`${id}:x`, tick),
    z: bounds.minZ + padding + (bounds.maxZ - bounds.minZ - padding * 2) * roamingSeed(`${id}:z`, tick + 97),
  };
}

/**
 * Sandbox-only approach order: march forward while checking Level 0 targets,
 * Level 1 rushes, then the unit stops at its own attack range. The far board
 * edge is a movement boundary; it never disables target detection. Once a
 * unit arrives it exchanges simultaneous, defense-reduced attacks. The
 * persisted field names retain the prior live-battle schema: Level 0 uses the
 * former outer `level1Detection*` values and Level 1 uses `level0*` values.
 */
export function stepSandboxBattle(previous: SandboxBattle, settings: BattleRangeSettings): SandboxBattle {
  if (previous.result) return previous;
  const units = previous.units.map(unit => ({ ...unit, roamTarget: unit.roamTarget && { ...unit.roamTarget } }));
  const hits = new Map<string, number>();
  const events: SandboxBattleEvent[] = [];
  for (const unit of units) {
    const origin = previous.units.find(candidate => candidate.id === unit.id)!;
    if (origin.hp <= 0) { unit.state = 'defeated'; unit.targetId = null; continue; }
    unit.cooldown = Math.max(0, origin.cooldown - SANDBOX_BATTLE_STEP);
    const hasReachedBoardEdge = origin.reachedBoardEdge || (origin.searchAtZ !== undefined && (origin.side === 'player' ? origin.z <= origin.searchAtZ : origin.z >= origin.searchAtZ));
    if (hasReachedBoardEdge) unit.reachedBoardEdge = true;
    const enemies = previous.units.filter(candidate => candidate.side !== unit.side && candidate.hp > 0)
      .sort((a, b) => Math.hypot(origin.x - a.x, origin.z - a.z) - Math.hypot(origin.x - b.x, origin.z - b.z) || a.id.localeCompare(b.id));
    // Do not immediately resume the forward order when the unit's opponent
    // falls. For half a second, sweep its awareness radius in every direction
    // so a nearby flanking enemy can become its next target.
    const formerTarget = origin.targetId ? previous.units.find(candidate => candidate.id === origin.targetId) : undefined;
    const scanSteps = origin.searchStepsRemaining || (formerTarget?.hp === 0 ? POST_KILL_SCAN_STEPS : 0);
    if (scanSteps > 0) {
      const scanTarget = enemies.find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, 360));
      unit.state = 'searching';
      unit.searchStepsRemaining = scanSteps - 1;
      if (scanTarget) {
        const desiredFacing = angleTo(origin, scanTarget), difference = angularDifference(desiredFacing, origin.facing);
        unit.targetId = scanTarget.id;
        unit.facing = origin.facing + Math.sign(difference) * Math.min(Math.abs(difference), Math.PI * 2 / POST_KILL_SCAN_STEPS);
      } else {
        unit.targetId = null;
        unit.facing = origin.facing + Math.PI * 2 / POST_KILL_SCAN_STEPS;
      }
      continue;
    }
    // Reaching the end of a forward order is not permission to wander away
    // immediately. Melee units make a short full-circle sweep first.
    const edgeScanSteps = origin.edgeScanStepsRemaining ?? (hasReachedBoardEdge && !origin.reachedBoardEdge ? EDGE_SCAN_STEPS : 0);
    if (edgeScanSteps > 0) {
      const scanTarget = enemies.find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, 360));
      unit.state = 'searching';
      unit.edgeScanStepsRemaining = edgeScanSteps - 1;
      if (scanTarget) {
        const desiredFacing = angleTo(origin, scanTarget), difference = angularDifference(desiredFacing, origin.facing);
        unit.targetId = scanTarget.id;
        unit.facing = origin.facing + Math.sign(difference) * Math.min(Math.abs(difference), Math.PI * 2 / EDGE_SCAN_STEPS);
      } else {
        unit.targetId = null;
        unit.facing = origin.facing + Math.PI * 2 / EDGE_SCAN_STEPS;
      }
      continue;
    }
    const directionalTarget = enemies
      .find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, settings.level1DetectionAngle));
    // A hit tells a unit exactly who to look for, even when that attacker was
    // outside its forward detection cone. This is resolved on the next fixed
    // step after simultaneous damage has been applied.
    const damageSource = directionalTarget ? undefined : previous.events
      .filter(event => event.to === origin.id)
      .map(event => previous.units.find(candidate => candidate.id === event.from))
      .filter((candidate): candidate is SandboxBattleUnit => !!candidate && candidate.hp > 0 && candidate.side !== origin.side)
      .sort((a, b) => Math.hypot(origin.x - a.x, origin.z - a.z) - Math.hypot(origin.x - b.x, origin.z - b.z) || a.id.localeCompare(b.id))[0];
    const movementSteps = origin.movementStepsSinceScan ?? 0;
    const rangedSweep = !directionalTarget && !damageSource && origin.projectileSpeed !== undefined && movementSteps + 1 >= RANGED_MOVEMENT_SCAN_INTERVAL;
    const target = damageSource ?? directionalTarget ?? (rangedSweep
      ? enemies.find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, 360))
      : undefined);
    if (!target) {
      if (hasReachedBoardEdge) {
        const bounds = unit.movementBounds;
        if (!bounds) { unit.state = 'holding'; unit.targetId = null; unit.movementStepsSinceScan = 0; unit.roamStepsSinceScan = 0; continue; }
        const roamSteps = origin.roamStepsSinceScan ?? 0;
        const roamSweep = origin.projectileSpeed === undefined && roamSteps + 1 >= MELEE_ROAM_SCAN_INTERVAL;
        const searchTarget = roamSweep ? enemies.find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, 360)) : undefined;
        if (searchTarget) {
          const desiredFacing = angleTo(origin, searchTarget), difference = angularDifference(desiredFacing, origin.facing);
          unit.state = 'searching'; unit.targetId = searchTarget.id; unit.roamStepsSinceScan = 0;
          unit.facing = origin.facing + Math.sign(difference) * Math.min(Math.abs(difference), Math.PI * 2 / MELEE_ROAM_SCAN_INTERVAL);
          continue;
        }
        const oldTarget = origin.roamTarget, oldDistance = oldTarget ? Math.hypot(oldTarget.x - origin.x, oldTarget.z - origin.z) : 0;
        const targetPoint = !oldTarget || oldDistance < .2 ? nextRoamTarget(unit.id, previous.tick, bounds) : oldTarget;
        const distance = Math.hypot(targetPoint.x - origin.x, targetPoint.z - origin.z), facing = angleTo(origin, targetPoint);
        const move = Math.min(distance, unit.speed * .7 * SANDBOX_BATTLE_STEP);
        unit.state = 'roaming'; unit.targetId = null; unit.roamTarget = targetPoint; unit.facing = facing; unit.movementStepsSinceScan = 0;
        unit.roamStepsSinceScan = origin.projectileSpeed === undefined ? (roamSweep ? 0 : roamSteps + 1) : 0;
        unit.x = Math.max(bounds.minX, Math.min(bounds.maxX, origin.x + Math.sin(facing) * move));
        unit.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, origin.z + Math.cos(facing) * move));
        continue;
      }
      const direction = origin.side === 'player' ? -1 : 1;
      unit.state = 'marching'; unit.targetId = null;
      unit.movementStepsSinceScan = origin.projectileSpeed !== undefined ? (rangedSweep ? 0 : movementSteps + 1) : 0;
      unit.z = origin.searchAtZ === undefined ? origin.z + direction * unit.speed * SANDBOX_BATTLE_STEP : direction < 0 ? Math.max(origin.searchAtZ, origin.z - unit.speed * SANDBOX_BATTLE_STEP) : Math.min(origin.searchAtZ, origin.z + unit.speed * SANDBOX_BATTLE_STEP);
      continue;
    }
    unit.targetId = target.id;
    unit.movementStepsSinceScan = 0;
    unit.roamStepsSinceScan = 0;
    unit.facing = Math.atan2(target.x - origin.x, target.z - origin.z);
    const attackRange = unit.attackRange;
    if (isInDirectionalRange(origin, { ...target, radius: settings.bodyRadius }, attackRange, 360)) {
      unit.state = 'attacking';
      if (unit.cooldown <= 0) {
        const damage = unit.attack * 100 / (100 + Math.max(0, target.defense));
        hits.set(target.id, (hits.get(target.id) ?? 0) + damage);
        events.push({ from: unit.id, to: target.id, ...(unit.projectileSpeed ? { projectileSpeed: unit.projectileSpeed } : {}) });
        unit.cooldown = 1 / unit.attackSpeed;
      }
      continue;
    }
    const rush = isInDirectionalRange(origin, { ...target, radius: settings.bodyRadius }, settings.level0Range, settings.level0Angle);
    unit.state = rush ? 'charging' : 'approaching';
    const distance = Math.hypot(target.x - origin.x, target.z - origin.z);
    const move = Math.min(Math.max(0, distance - attackRange - settings.bodyRadius), unit.speed * (rush ? settings.dashSpeedMultiplier : 1) * SANDBOX_BATTLE_STEP);
    unit.x += Math.sin(unit.facing) * move; unit.z += Math.cos(unit.facing) * move;
  }
  for (const unit of units) {
    unit.hp = Math.max(0, unit.hp - (hits.get(unit.id) ?? 0));
    if (!unit.hp) { unit.state = 'defeated'; unit.targetId = null; }
  }
  const playerAlive = units.some(unit => unit.side === 'player' && unit.hp > 0);
  const enemyAlive = units.some(unit => unit.side === 'enemy' && unit.hp > 0);
  return { tick: previous.tick + 1, units, events, result: playerAlive && enemyAlive ? null : playerAlive ? 'victory' : enemyAlive ? 'defeat' : 'draw' };
}
