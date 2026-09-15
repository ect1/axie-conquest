import { angleTo, angularDifference, BattleRangeSettings, isInDirectionalRange } from './battle-range';

export const SANDBOX_BATTLE_STEP = .1;
export const SANDBOX_AXIE_STATS = { speed: 2.5 };
export const SANDBOX_CHIMERA_STATS = { speed: 2.3 };
export type SandboxBattleUnit = { id: string; side: 'player' | 'enemy'; x: number; z: number; facing: number; speed: number; attackRange: number; state: 'marching' | 'searching' | 'holding' | 'approaching' | 'charging' | 'in-range'; targetId: string | null };
export type SandboxBattle = { tick: number; units: SandboxBattleUnit[] };

/** No-damage simulation used only by the developer board sandbox. */
export function createSandboxBattle(units: readonly Omit<SandboxBattleUnit, 'state' | 'targetId'>[]): SandboxBattle {
  return { tick: 0, units: units.map(unit => ({ ...unit, state: 'holding', targetId: null })) };
}

/**
 * Sandbox-only approach order: march forward, Level 0 detects at walking
 * speed, Level 1 rushes, then the unit stops at its own attack range. The
 * persisted field names retain the prior live-battle schema: Level 0 uses the
 * former outer `level1Detection*` values and Level 1 uses `level0*` values.
 * Attacks intentionally never resolve here.
 */
export function stepSandboxBattle(previous: SandboxBattle, settings: BattleRangeSettings): SandboxBattle {
  const units = previous.units.map(unit => ({ ...unit }));
  for (const unit of units) {
    const origin = previous.units.find(candidate => candidate.id === unit.id)!;
    const enemies = previous.units.filter(candidate => candidate.side !== unit.side)
      .sort((a, b) => Math.hypot(origin.x - a.x, origin.z - a.z) - Math.hypot(origin.x - b.x, origin.z - b.z) || a.id.localeCompare(b.id));
    const target = enemies
      .find(candidate => isInDirectionalRange(origin, { ...candidate, radius: settings.bodyRadius }, settings.level1DetectionRange, settings.level1DetectionAngle));
    if (!target) {
      const searchTarget = enemies.find(candidate => Math.hypot(candidate.x - origin.x, candidate.z - origin.z) <= settings.level1DetectionRange + settings.bodyRadius);
      if (searchTarget) {
        const desiredFacing = angleTo(origin, searchTarget), difference = angularDifference(desiredFacing, origin.facing), turn = Math.sign(difference) * Math.min(Math.abs(difference), Math.PI * SANDBOX_BATTLE_STEP * 2);
        unit.state = 'searching'; unit.targetId = searchTarget.id; unit.facing = origin.facing + turn;
        continue;
      }
      unit.state = 'marching'; unit.targetId = null; unit.x += Math.sin(origin.facing) * unit.speed * SANDBOX_BATTLE_STEP; unit.z += Math.cos(origin.facing) * unit.speed * SANDBOX_BATTLE_STEP; continue;
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
