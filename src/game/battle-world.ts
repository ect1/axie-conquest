import type { BattleSession } from './battle-save';
import type { Coordinate } from './routes';

/** Transform arena coordinates into the existing march's approach to its world target. */
export function battleWorldTransform(session: Pick<BattleSession, 'army' | 'target'>) {
  const dx = session.target.x - session.army.position.x;
  const dz = session.target.z - session.army.position.z;
  const angle = Math.atan2(dx, dz);
  return { angle, x: session.target.x - Math.sin(angle) * 8, z: session.target.z - Math.cos(angle) * 8 };
}
export function fighterWorldPosition(session: Pick<BattleSession, 'army' | 'target'>, point: Coordinate): Coordinate {
  const origin = battleWorldTransform(session), sin = Math.sin(origin.angle), cos = Math.cos(origin.angle);
  return { x: origin.x + point.x * cos + point.z * sin, z: origin.z - point.x * sin + point.z * cos };
}
