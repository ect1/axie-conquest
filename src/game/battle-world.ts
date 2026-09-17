import type { BattleSession } from './battle-save';
import type { Coordinate } from './routes';
import { activeBattleSettings } from './battle-settings';
import { teamStartingCenter } from './battle-layout';

/** Transform arena coordinates into the existing march's approach to its world target. */
export function battleWorldTransform(session: Pick<BattleSession, 'army' | 'target'>) {
  const dx = session.target.x - session.army.position.x;
  const dz = session.target.z - session.army.position.z;
  const angle = Math.atan2(dx, dz);
  return { angle, x: session.army.position.x, z: session.army.position.z };
}
export function fighterWorldPosition(session: Pick<BattleSession, 'army' | 'target'>, point: Coordinate & { memberId?: string }): Coordinate {
  const origin = battleWorldTransform(session), sin = Math.sin(origin.angle), cos = Math.cos(origin.angle);
  const member = point.memberId ? session.army.members.find(m => m.id === point.memberId) : undefined;
  const offset = member?.offset ?? { x: point.x, z: point.z };
  return { x: origin.x + offset.x * cos + offset.z * sin, z: origin.z - offset.x * sin + offset.z * cos };
}
