export type BattleSide = 'player' | 'enemy';

/**
 * The shared tactical board convention. +Z is north: enemies deploy there
 * looking south, while the player deploys south looking north.
 */
export function teamFacing(side: BattleSide): number {
  return side === 'player' ? 0 : Math.PI;
}

export function teamStartingCenter(side: BattleSide, separation: number): { x: number; z: number } {
  return { x: 0, z: (side === 'player' ? -1 : 1) * separation / 2 };
}
