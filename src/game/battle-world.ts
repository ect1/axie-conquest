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
export function fighterWorldPosition(session: Pick<BattleSession, 'army' | 'target'>, point: Coordinate): Coordinate {
  const origin = battleWorldTransform(session), sin = Math.sin(origin.angle), cos = Math.cos(origin.angle);
  const boardCenter = teamStartingCenter('player', activeBattleSettings.teamSeparation);
  const offsetCenter = session.army.members.reduce((center, member) => ({ x: center.x + member.offset.x / session.army.members.length, z: center.z + member.offset.z / session.army.members.length }), { x: 0, z: 0 });
  const x = point.x - boardCenter.x + offsetCenter.x;
  const z = point.z - boardCenter.z + offsetCenter.z;
  return { x: origin.x + x * cos + z * sin, z: origin.z - x * sin + z * cos };
}
