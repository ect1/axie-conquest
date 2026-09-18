import bossData from './boss-config.json';

export type BossHexPosition = {
  row: number;
  column: number;
};

export type BossCustomStats = {
  health?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  attackSpeed?: number;
  range?: number;
  radius?: number;
  projectileSpeed?: number;
};

export type BossLeaderConfig = {
  id: string;
  name: string;
  modelKind?: 'mascot' | 'axie' | 'chimera';
  mascotId?: string;
  heroId?: string;
  position: BossHexPosition;
  initialCount?: number;
  stats: BossCustomStats;
};

export type BossMilitarySquad = {
  id: string;
  name?: string;
  troopKind: 'soldier' | 'infantry' | 'archer';
  count: number;
  position: BossHexPosition;
  mascotId?: string;
  stats?: BossCustomStats;
};

export type BossConfig = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  spawnWeight?: number;
  loot?: { apple: number };
  leader: BossLeaderConfig;
  military: BossMilitarySquad[];
};

export type BossLineupFile = {
  schemaVersion: number;
  bosses: BossConfig[];
};

export const BOSS_LINEUP: BossConfig[] = (bossData as BossLineupFile).bosses;

export function getAllBosses(): readonly BossConfig[] {
  return BOSS_LINEUP;
}

export function getBossConfig(id: string | null | undefined): BossConfig | undefined {
  if (!id) return undefined;
  return BOSS_LINEUP.find(b => b.id === id);
}

export function defaultBoss(): BossConfig {
  return BOSS_LINEUP[0];
}

export function selectBossForSpawn(random = Math.random): BossConfig {
  const bosses = BOSS_LINEUP;
  if (!bosses.length) throw new Error('No bosses defined in configuration.');
  const totalWeight = bosses.reduce((sum, b) => sum + (b.spawnWeight ?? 1), 0);
  let roll = random() * totalWeight;
  for (const boss of bosses) {
    roll -= (boss.spawnWeight ?? 1);
    if (roll <= 0) return boss;
  }
  return bosses[0];
}
