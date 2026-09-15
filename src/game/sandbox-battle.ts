import { angleTo, angularDifference, BattleRangeSettings, isInDirectionalRange } from './battle-range';

export const SANDBOX_BATTLE_STEP = .1;
export const SANDBOX_AXIE_STATS = { speed: 2.5 };
export const SANDBOX_CHIMERA_STATS = { speed: 2.3 };
export const SANDBOX_TROOP_STATS = { speed: 2.4 };
export type SandboxMovementBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type SandboxBattleUnit = { id: string; side: 'player' | 'enemy'; x: number; z: number; facing: number; speed: number; attackRange: number; searchAtZ?: number; movementBounds?: SandboxMovementBounds; reachedBoardEdge?: boolean; roamTarget?: { x: number; z: number }; state: 'marching' | 'searching' | 'roaming' | 'holding' | 'approaching' | 'charging' | 'in-range'; targetId: string | null };
export type SandboxBattle = { tick: number; units: SandboxBattleUnit[] };

/** No-damage simulation used only by the developer board sandbox. */
export function createSandboxBattle(units: readonly Omit<SandboxBattleUnit, 'state' | 'targetId'>[]): SandboxBattle {
  return { tick: 0, units: units.map(unit => ({ ...unit, reachedBoardEdge: false, state: 'holding', targetId: null })) };
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
 * edge is a movement boundary; it never disables target detection. The
 * persisted field names retain the prior live-battle schema: Level 0 uses the
 * former outer `level1Detection*` values and Level 1 uses `level0*` values.
 * Attacks intentionally never resolve here.
 */
export function stepSandboxBattle(previous: SandboxBattle, settings: BattleRangeSettings): SandboxBattle {
  const units = previous.units.map(unit => ({ ...unit }));
  for (const unit of units) {
    const origin = previous.units.find(candidate => candidate.id === unit.id)!;
    const hasReachedBoardEdge = origin.reachedBoardEdge || (origin.searchAtZ !== undefined && (origin.side === 'player' ? origin.z <= origin.searchAtZ : origin.z >= origin.searchAtZ));
    if (hasReachedBoardEdge) unit.reachedBoardEdge = true;
    const enemies = previous.units.filter(candidate => candidate.side !== unit.side)
      .sort((a, b) => Math.hypot(origin.x - a.x, origin.z - a.z) - Math.hypot(origin.x - b.x, origin.z - b.z) || a.id.localeCompare(b.id));
    const target = enemies
      .find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, settings.level1DetectionAngle));
    if (!target) {
      const searchTarget = enemies.find(candidate => Math.hypot(candidate.x - origin.x, candidate.z - origin.z) <= settings.level1DetectionRange + settings.bodyRadius);
      if (hasReachedBoardEdge && searchTarget) {
        const desiredFacing = angleTo(origin, searchTarget), difference = angularDifference(desiredFacing, origin.facing), turn = Math.sign(difference) * Math.min(Math.abs(difference), Math.PI * SANDBOX_BATTLE_STEP * 2);
        unit.state = 'searching'; unit.targetId = searchTarget.id; unit.facing = origin.facing + turn;
        continue;
      }
      if (hasReachedBoardEdge) {
        const bounds = unit.movementBounds;
        if (!bounds) { unit.state = 'holding'; unit.targetId = null; continue; }
        const oldTarget = origin.roamTarget, oldDistance = oldTarget ? Math.hypot(oldTarget.x - origin.x, oldTarget.z - origin.z) : 0;
        const targetPoint = !oldTarget || oldDistance < .2 ? nextRoamTarget(unit.id, previous.tick, bounds) : oldTarget;
        const distance = Math.hypot(targetPoint.x - origin.x, targetPoint.z - origin.z), facing = angleTo(origin, targetPoint);
        const move = Math.min(distance, unit.speed * .7 * SANDBOX_BATTLE_STEP);
        unit.state = 'roaming'; unit.targetId = null; unit.roamTarget = targetPoint; unit.facing = facing;
        unit.x = Math.max(bounds.minX, Math.min(bounds.maxX, origin.x + Math.sin(facing) * move));
        unit.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, origin.z + Math.cos(facing) * move));
        continue;
      }
      const direction = origin.side === 'player' ? -1 : 1;
      unit.state = 'marching'; unit.targetId = null;
      unit.z = origin.searchAtZ === undefined ? origin.z + direction * unit.speed * SANDBOX_BATTLE_STEP : direction < 0 ? Math.max(origin.searchAtZ, origin.z - unit.speed * SANDBOX_BATTLE_STEP) : Math.min(origin.searchAtZ, origin.z + unit.speed * SANDBOX_BATTLE_STEP);
      continue;
    }
    unit.targetId = target.id;
    unit.facing = Math.atan2(target.x - origin.x, target.z - origin.z);
    const attackRange = unit.attackRange;
    if (isInDirectionalRange(origin, { ...target, radius: settings.bodyRadius }, attackRange, 360)) { unit.state = 'in-range'; continue; }
    const rush = isInDirectionalRange(origin, { ...target, radius: settings.bodyRadius }, settings.level0Range, settings.level0Angle);
    unit.state = rush ? 'charging' : 'approaching';
    const distance = Math.hypot(target.x - origin.x, target.z - origin.z);
    const move = Math.min(Math.max(0, distance - attackRange - settings.bodyRadius), unit.speed * (rush ? settings.dashSpeedMultiplier : 1) * SANDBOX_BATTLE_STEP);
    unit.x += Math.sin(unit.facing) * move; unit.z += Math.cos(unit.facing) * move;
  }
  return { tick: previous.tick + 1, units };
}
