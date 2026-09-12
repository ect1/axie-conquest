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
export type AxieHero = { id: string; name: string; class: AxieClass; level: number };
// Local starter heroes for the prototype, independent of wallet ownership.
export const STARTER_HEROES: readonly AxieHero[] = [
  { id: 'ember', name: 'Ember', class: 'beast', level: 1 },
  { id: 'pippa', name: 'Pippa', class: 'bug', level: 1 },
  { id: 'breeze', name: 'Breeze', class: 'bird', level: 1 },
  { id: 'ripple', name: 'Ripple', class: 'aqua', level: 1 },
  { id: 'clover', name: 'Clover', class: 'plant', level: 1 },
  { id: 'moss', name: 'Moss', class: 'reptile', level: 1 },
  { id: 'cog', name: 'Cog', class: 'mech', level: 1 },
  { id: 'lumi', name: 'Lumi', class: 'dawn', level: 1 },
  { id: 'vesper', name: 'Vesper', class: 'dusk', level: 1 },
];
