import type { UnitMember } from './units';
import type { WorldKind } from './world';

export type TroopLoadWeights = {
  hero: number;
  infantry: number;
  soldier: number;
  archer: number;
  scout?: number;
};

export type TroopLoadCapacities = {
  soldier?: number;
  archer?: number;
  infantry?: number;
  [key: string]: number | undefined;
};

export type UnitGatherRates = {
  hero?: number;
  infantry?: number;
  soldier?: number;
  archer?: number;
  [key: string]: number | undefined;
};

export type GatheringClassBonus = {
  loadCapacityMultiplier?: number;
  gatherRateMultiplier?: number;
  targetResources?: readonly string[];
};

export type GatheringStatsConfig = {
  loadCapacity: TroopLoadWeights;
  maxTroopLoad?: TroopLoadCapacities;
  maxArmyCapacity?: number;
  minLoadCapacity: number;
  /** Per-unit contribution to harvest rate (res/sec per unit). Stacks additively with node base rate. */
  unitGatherRate?: UnitGatherRates;
  classBonuses: {
    beast?: GatheringClassBonus;
    plant?: GatheringClassBonus;
    bug?: GatheringClassBonus;
    [key: string]: GatheringClassBonus | undefined;
  };
};

export type UnitCombatProfile = {
  health: number;
  attack: number;
  defense: number;
  speed: number;
  attackSpeed: number;
  projectileSpeed?: number;
};

export type CombatStatsConfig = {
  axieHero: UnitCombatProfile;
  soldier: UnitCombatProfile;
  archer: UnitCombatProfile;
  scout: UnitCombatProfile;
  chimera: UnitCombatProfile;
};

export type StatsConfigFile = {
  version: number;
  gathering: GatheringStatsConfig;
  combat: CombatStatsConfig;
};

export const DEFAULT_STATS_CONFIG: StatsConfigFile = {
  version: 1,
  gathering: {
    loadCapacity: {
      hero: 50,
      infantry: 15,
      soldier: 12,
      archer: 10,
    },
    maxTroopLoad: {
      soldier: 300,
      archer: 150,
    },
    maxArmyCapacity: 500,
    minLoadCapacity: 20,
    unitGatherRate: {
      hero: 2.0,
      infantry: 0.08,
      soldier: 0.10,
      archer: 0.05,
    },
    classBonuses: {
      beast: { loadCapacityMultiplier: 1.3 },
      plant: { gatherRateMultiplier: 1.25, targetResources: ['food', 'wood'] },
      bug: { gatherRateMultiplier: 1.25, targetResources: ['stone', 'warSupplies'] },
    },
  },
  combat: {
    axieHero: { health: 820, attack: 108, defense: 76, speed: 2.5, attackSpeed: 0.77 },
    soldier: { health: 55, attack: 6, defense: 20, speed: 2.4, attackSpeed: 0.83 },
    archer: { health: 38, attack: 8, defense: 6, speed: 2.3, attackSpeed: 0.63, projectileSpeed: 12 },
    scout: { health: 70, attack: 5, defense: 10, speed: 3.5, attackSpeed: 0.71 },
    chimera: { health: 75, attack: 12, defense: 15, speed: 2.3, attackSpeed: 0.83 },
  },
};

let cachedConfig: StatsConfigFile | null = null;

export function setActiveStatsConfig(config: StatsConfigFile): void {
  cachedConfig = config;
}

export async function fetchLiveStatsConfig(): Promise<StatsConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/stats-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as StatsConfigFile;
      if (data?.gathering?.loadCapacity && data?.combat?.axieHero) {
        setActiveStatsConfig(data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function getStatsConfigFile(): StatsConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment, read live YAML if available
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yamlParser = require('yaml');
      const candidates = [
        path.resolve(process.cwd(), 'src/game/config/stats-config.yml'),
        path.resolve(__dirname, 'config/stats-config.yml'),
        path.resolve(__dirname, '../src/game/config/stats-config.yml'),
      ];
      for (const cand of candidates) {
        if (fs.existsSync(cand)) {
          cachedConfig = yamlParser.parse(fs.readFileSync(cand, 'utf8')) as StatsConfigFile;
          return cachedConfig;
        }
      }
    } catch {
      // fallback
    }
  }

  if (!cachedConfig) {
    cachedConfig = DEFAULT_STATS_CONFIG;
  }

  return cachedConfig;
}

export function getGatheringStatsConfig(): GatheringStatsConfig {
  return getStatsConfigFile().gathering ?? DEFAULT_STATS_CONFIG.gathering;
}

export function getTroopLoadWeights(): TroopLoadWeights {
  return getGatheringStatsConfig().loadCapacity ?? DEFAULT_STATS_CONFIG.gathering.loadCapacity;
}

export function getCombatStatsConfig(): CombatStatsConfig {
  return getStatsConfigFile().combat ?? DEFAULT_STATS_CONFIG.combat;
}

export function calculateArmyLoadCapacity(members: readonly UnitMember[], leaderClass?: string): number {
  const cfg = getGatheringStatsConfig();
  const weights = cfg.loadCapacity ?? DEFAULT_STATS_CONFIG.gathering.loadCapacity;
  let baseLoad = 0;

  for (const member of members) {
    if (member.heroId) {
      baseLoad += weights.hero ?? 50;
    } else if (member.troopKind) {
      const weight = (weights as Record<string, number>)[member.troopKind] ?? 0;
      let squadLoad = member.count * weight;
      const cap = cfg.maxTroopLoad?.[member.troopKind];
      if (typeof cap === 'number' && cap > 0) {
        squadLoad = Math.min(squadLoad, cap);
      }
      baseLoad += squadLoad;
    }
  }

  if (leaderClass) {
    const bonus = cfg.classBonuses?.[leaderClass.toLowerCase()];
    if (bonus?.loadCapacityMultiplier && bonus.loadCapacityMultiplier > 0) {
      baseLoad *= bonus.loadCapacityMultiplier;
    }
  }

  if (typeof cfg.maxArmyCapacity === 'number' && cfg.maxArmyCapacity > 0) {
    baseLoad = Math.min(baseLoad, cfg.maxArmyCapacity);
  }

  const floor = cfg.minLoadCapacity ?? 20;
  return Math.max(floor, Math.round(baseLoad));
}

export function calculateGatherRate(
  nodeKind: WorldKind | string,
  baseRate: number,
  leaderClass?: string
): number {
  if (!leaderClass) return baseRate;
  const cfg = getGatheringStatsConfig();
  const bonus = cfg.classBonuses?.[leaderClass.toLowerCase()];
  if (!bonus?.gatherRateMultiplier) return baseRate;

  // Check specific resource affiliation
  if (bonus.targetResources && bonus.targetResources.length > 0) {
    const resMap: Record<string, string> = { farm: 'food', lumber: 'wood', stone: 'stone', oil: 'warSupplies' };
    const res = resMap[nodeKind] ?? nodeKind;
    if (bonus.targetResources.includes(res)) {
      return baseRate * bonus.gatherRateMultiplier;
    }
    return baseRate;
  }

  // Fallback defaults
  if (leaderClass === 'plant' && (nodeKind === 'farm' || nodeKind === 'lumber')) {
    return baseRate * bonus.gatherRateMultiplier;
  }
  if (leaderClass === 'bug' && (nodeKind === 'stone' || nodeKind === 'oil')) {
    return baseRate * bonus.gatherRateMultiplier;
  }

  return baseRate;
}

/**
 * Calculates the total effective gather rate (resources/sec) for an army at a node.
 * = nodeBaseRate (from resource-spawn-config) + sum of per-unit contributions (from unitGatherRate)
 * The combined total is then multiplied by any Axie class passive multiplier.
 */
export function calculateArmyGatherRate(
  nodeKind: WorldKind | string,
  nodeBaseRate: number,
  members: readonly UnitMember[],
  leaderClass?: string
): number {
  const cfg = getGatheringStatsConfig();
  const rates = cfg.unitGatherRate;

  // Sum per-unit contributions
  let unitContribution = 0;
  if (rates) {
    for (const member of members) {
      if (member.heroId) {
        unitContribution += rates.hero ?? 0;
      } else if (member.troopKind) {
        const r = rates[member.troopKind] ?? 0;
        unitContribution += r * member.count;
      }
    }
  }

  const combined = nodeBaseRate + unitContribution;

  // Apply class gather rate multiplier (e.g. Plant +25% on food/wood)
  return calculateGatherRate(nodeKind, combined, leaderClass);
}
