import { AxieHero } from './heroes';

export type BattleModifiers = { health: number; attack: number; defense: number; speed: number };
export const NO_MODIFIERS: BattleModifiers = { health: 1, attack: 1, defense: 1, speed: 1 };
/** Leader-only formation modifiers; kept independent of targeting and damage resolution. */
export function leaderTalent(hero?: AxieHero): { name: string; modifiers: BattleModifiers } | null {
  if (!hero) return null;
  const stat = hero.class === 'plant' || hero.class === 'dusk' ? 'health'
    : hero.class === 'reptile' || hero.class === 'bug' ? 'defense'
    : hero.class === 'bird' || hero.class === 'aqua' ? 'speed' : 'attack';
  return { name: hero.talents[0] ?? 'Lunacian Resolve', modifiers: { ...NO_MODIFIERS, [stat]: 1.05 } };
}
