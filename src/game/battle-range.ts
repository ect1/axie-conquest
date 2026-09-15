import defaults from './battle-range.json';

/** Per-unit, directional combat-range rules. Angles are full cone angles in degrees. */
export type BattleRangeSettings = typeof defaults;
export const DEFAULT_BATTLE_RANGE: BattleRangeSettings = { ...defaults };

export type RangePoint = { x: number; z: number; facing: number };
export type RangeTarget = { x: number; z: number; radius?: number };

export function sanitizeBattleRange(value: Partial<BattleRangeSettings> | null | undefined): BattleRangeSettings {
  const number = (key: keyof BattleRangeSettings, minimum: number, maximum: number) => {
    const candidate = value?.[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : DEFAULT_BATTLE_RANGE[key];
  };
  return {
    level0Range: number('level0Range', .1, 30),
    level0Angle: number('level0Angle', 1, 360),
    bodyRadius: number('bodyRadius', .1, 5),
    level1DetectionRange: number('level1DetectionRange', .1, 100),
    level1DetectionAngle: number('level1DetectionAngle', 1, 360),
    dashSpeedMultiplier: number('dashSpeedMultiplier', 1, 5),
    meleeAttackRange: number('meleeAttackRange', .1, 30),
    rangedAttackRange: number('rangedAttackRange', .1, 30),
  };
}

export function angleTo(source: RangePoint, target: RangeTarget): number {
  return Math.atan2(target.x - source.x, target.z - source.z);
}

export function angularDifference(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** True when a target's body intersects the source's directional cone. */
export function isInDirectionalRange(source: RangePoint, target: RangeTarget, radius: number, angleDegrees: number): boolean {
  const distance = Math.hypot(target.x - source.x, target.z - source.z);
  if (distance > radius + (target.radius ?? 0) + .02) return false;
  if (distance < 0.00001 || angleDegrees >= 360) return true;
  return Math.abs(angularDifference(angleTo(source, target), source.facing)) <= angleDegrees * Math.PI / 360;
}

export function level0CanAttack(source: RangePoint, target: RangeTarget, attackRange: number, settings: BattleRangeSettings): boolean {
  return isInDirectionalRange(source, target, attackRange, settings.level0Angle);
}

export function level1CanDetect(source: RangePoint, target: RangeTarget, settings: BattleRangeSettings): boolean {
  return isInDirectionalRange(source, target, settings.level1DetectionRange, settings.level1DetectionAngle);
}
