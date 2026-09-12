export const AXIE_CLASSES = {
  beast: { name: 'Beast', color: '#edb25f', accent: '#aa602d', role: 'Frontline attacker', description: 'A bold commander who leads the charge.' },
  bug: { name: 'Bug', color: '#e68b82', accent: '#9c4e62', role: 'Disruption', description: 'A patient tactician who looks for openings in enemy formations.' },
  bird: { name: 'Bird', color: '#eeafd0', accent: '#ad668f', role: 'Swift striker', description: 'A quick-thinking commander who favors speed and precise attacks.' },
  aqua: { name: 'Aqua', color: '#80ccdf', accent: '#388baf', role: 'Mobile fighter', description: 'An adaptable hero who keeps the march moving.' },
  plant: { name: 'Plant', color: '#b4d77a', accent: '#618b3e', role: 'Defender', description: 'A steady protector devoted to the people of Everleaf.' },
  reptile: { name: 'Reptile', color: '#b8a1d8', accent: '#755495', role: 'Resilient fighter', description: 'A resourceful commander who thrives in long engagements.' },
  mech: { name: 'Mech', color: '#bdc8d0', accent: '#647d8c', role: 'Precision fighter', description: 'A methodical hero who values preparation and well-timed orders.' },
  dawn: { name: 'Dawn', color: '#c5dfee', accent: '#a788bc', role: 'Support', description: 'A hopeful guide who brings the formation together.' },
  dusk: { name: 'Dusk', color: '#98c4bc', accent: '#665b99', role: 'Versatile defender', description: 'A watchful guardian who balances endurance with adaptability.' },
} as const;
export type AxieClass = keyof typeof AXIE_CLASSES;
export type AxiePartSlot = 'horn' | 'eyes' | 'ears' | 'mouth' | 'back' | 'tail';
export type AxieParts = Record<AxiePartSlot, string>;
export type AxieStats = { health: number; attack: number; defense: number; speed: number; fatigue: 'Happy' | 'Sad' };
export type AxieSkill = { name: string; description: string };
export type AxieHero = {
  id: string;
  name: string;
  class: AxieClass;
  level: number;
  parts: AxieParts;
  stats: AxieStats;
  skills: AxieSkill[];
  talents: string[];
};

export const AXIE_PARTS: Record<AxiePartSlot, readonly string[]> = {
  horn: ['Anemone', 'Caterpillars', 'Incisor'],
  eyes: ['Blossom', 'Kotaro', 'Puppy', 'Zeal'],
  ears: ['Beetle Spike', 'Earwing', 'Leafy', 'Pagona'],
  mouth: ['Axie Kiss', 'Lam', 'Risky Fish', 'Serious'],
  back: ['Bidens', 'Furball', 'Ronin', 'Tri Feather'],
  tail: ['Balloon', 'Goldfish', 'Perch', 'Raven', 'Jaguar'],
};

const PART_SKILLS: Record<AxiePartSlot, Record<string, AxieSkill>> = {
  horn: {
    Anemone: { name: 'Tide Bloom', description: 'Restores a little health after the march takes damage.' },
    Caterpillars: { name: 'Caterpillar Rush', description: 'Deals bonus damage to wounded targets.' },
    Incisor: { name: 'Piercing Bite', description: 'Ignores a portion of enemy defense.' },
  },
  eyes: {
    Blossom: { name: 'Bloomwatch', description: 'Reveals hidden threats and improves scouting.' },
    Kotaro: { name: 'Keen Focus', description: 'Raises accuracy against fast formations.' },
    Puppy: { name: 'Loyal Lookout', description: 'Improves the march response to ambushes.' },
    Zeal: { name: 'Zealous Aim', description: 'Builds extra skill charge when attacking.' },
  },
  ears: {
    'Beetle Spike': { name: 'Spiked Guard', description: 'Returns a small amount of damage to attackers.' },
    Earwing: { name: 'Wingbeat Signal', description: 'Briefly increases the formation’s speed.' },
    Leafy: { name: 'Leafcloak', description: 'Reduces damage from the first enemy skill.' },
    Pagona: { name: 'Pagona Call', description: 'Strengthens nearby allied marches.' },
  },
  mouth: {
    'Axie Kiss': { name: 'Axie Kiss', description: 'Heals the most injured ally in the formation.' },
    Lam: { name: 'Lam Lunge', description: 'Strikes the enemy frontline and lowers its armor.' },
    'Risky Fish': { name: 'Risky Current', description: 'Deals greater damage when health is low.' },
    Serious: { name: 'Serious Order', description: 'Steals a small amount of enemy skill charge.' },
  },
  back: {
    Bidens: { name: 'Bidens Snare', description: 'Slows the enemy march for a short time.' },
    Furball: { name: 'Furball Volley', description: 'Hits multiple nearby targets.' },
    Ronin: { name: 'Ronin Strike', description: 'Delivers a precise blow to the enemy commander.' },
    'Tri Feather': { name: 'Tri Feather Gust', description: 'Pushes back and disrupts the enemy formation.' },
  },
  tail: {
    Balloon: { name: 'Balloon Lift', description: 'Raises movement speed while travelling on the map.' },
    Goldfish: { name: 'Goldfish Flow', description: 'Regenerates skill charge while moving.' },
    Perch: { name: 'Perch Tactics', description: 'Improves damage from elevated terrain.' },
    Raven: { name: 'Raven’s Mark', description: 'Marks a target, making it easier for allies to finish.' },
    Jaguar: { name: 'Jaguar Pounce', description: 'Deals extra damage when starting an attack.' },
  },
};

const PART_SLOTS: readonly AxiePartSlot[] = ['horn', 'eyes', 'ears', 'mouth', 'back', 'tail'];
const TALENTS: Record<AxieClass, readonly string[]> = {
  beast: ['Bloodied Momentum', 'Brave Vanguard'], bug: ['Patient Ambush', 'Swarm Tactics'], bird: ['Windrunner', 'First Strike'],
  aqua: ['Tidal Step', 'Current Rider'], plant: ['Everleaf Ward', 'Rooted Resolve'], reptile: ['Scale Temper', 'Venomous Patience'],
  mech: ['Calibrated Core', 'Overclock'], dawn: ['Lunacian Light', 'Rallying Spirit'], dusk: ['Moonshadow', 'Twilight Guard'],
};

function seededIndex(seed: string, length: number, offset: number) {
  let value = offset + 17;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) % 1000003;
  return value % length;
}

function createHeroLoadout(id: string, axieClass: AxieClass): Pick<AxieHero, 'parts' | 'stats' | 'skills' | 'talents'> {
  const parts = Object.fromEntries(PART_SLOTS.map((slot, index) => [slot, AXIE_PARTS[slot][seededIndex(id, AXIE_PARTS[slot].length, index)]])) as AxieParts;
  const skills = PART_SLOTS.map(slot => PART_SKILLS[slot][parts[slot]]);
  return {
    parts,
    stats: { health: 820 + seededIndex(id, 100, 4), attack: 108 + seededIndex(id, 24, 9), defense: 76 + seededIndex(id, 20, 13), speed: 92 + seededIndex(id, 28, 19), fatigue: 'Happy' },
    skills,
    talents: [TALENTS[axieClass][seededIndex(id, TALENTS[axieClass].length, 23)], TALENTS[axieClass][seededIndex(id, TALENTS[axieClass].length, 29)]].filter((talent, index, list) => list.indexOf(talent) === index),
  };
}
// Local starter heroes for the prototype, independent of wallet ownership.
const STARTER_HERO_SEEDS: readonly [string, string, AxieClass][] = [
  ['ember', 'Ember', 'beast'], ['pippa', 'Pippa', 'bug'], ['breeze', 'Breeze', 'bird'], ['ripple', 'Ripple', 'aqua'], ['clover', 'Clover', 'plant'],
  ['moss', 'Moss', 'reptile'], ['cog', 'Cog', 'mech'], ['lumi', 'Lumi', 'dawn'], ['vesper', 'Vesper', 'dusk'],
];
export const STARTER_HEROES: readonly AxieHero[] = STARTER_HERO_SEEDS.map(([id, name, axieClass]) => ({ id, name, class: axieClass, level: 1, ...createHeroLoadout(id, axieClass) }));
