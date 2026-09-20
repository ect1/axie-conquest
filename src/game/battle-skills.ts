import { AxieHero } from './heroes';

export type CommanderSkill = { name: string; description: string; range: number; cooldown: number; effect: 'heal' | 'pierce' | 'strike'; power: number };
/** First playable part skills. Skill range and cooldown are independent of basic attacks. */
export function commanderSkill(hero?: AxieHero): CommanderSkill | null {
  if (!hero) return null;
  switch (hero.parts.mouth) {
    case 'Axie Kiss': return { name: 'Axie Kiss', description: 'Heal the most injured ally for up to 25% of maximum health. Lost troops cannot be revived.', range: 12, cooldown: 15, effect: 'heal', power: 0.25 };
    case 'Lam': return { name: 'Lam Lunge', description: 'Strike an enemy for twice attack, ignoring half its defense.', range: 6, cooldown: 12, effect: 'pierce', power: 2 };
    case 'Risky Fish': return { name: 'Risky Current', description: 'Strike an enemy; damage increases as the commander loses health.', range: 7, cooldown: 12, effect: 'strike', power: 2.5 };
    default: return { name: 'Serious Order', description: 'Strike an enemy for twice attack.', range: 8, cooldown: 10, effect: 'strike', power: 2 };
  }
}
