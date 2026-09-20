import { CityResources } from './cities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrainingCost = Partial<Record<'food' | 'wood', number>>;

export type TrainingStatBonuses = {
  health: number;
  attack: number;
  defense: number;
  speed: number;
};

export type UnitTrainingLevelConfig = {
  trainingTimeSeconds: number;
  cost: TrainingCost;
  statBonuses: TrainingStatBonuses;
};

export type UnitTrainingConfigItem = {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Whether this unit type can be trained at all (unit-level toggle). */
  enabled: boolean;
  /** The building kind that must be present in the city. */
  requiredBuilding: string;
  /** Per-building-level configs (level1, level2, level3). */
  levels: Record<string, UnitTrainingLevelConfig>;
};

export type UnitTrainingConfigFile = {
  settings: {
    /** Units produced per training tap. */
    batchSize: number;
  };
  units: Record<string, UnitTrainingConfigItem>;
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedConfig: UnitTrainingConfigFile | null = null;

export function setActiveTrainingConfig(config: UnitTrainingConfigFile): void {
  cachedConfig = config;
}

// ---------------------------------------------------------------------------
// Fetching / Loading
// ---------------------------------------------------------------------------

export async function fetchLiveTrainingConfig(): Promise<UnitTrainingConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/units-training-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as UnitTrainingConfigFile;
      if (data?.units) {
        setActiveTrainingConfig(data);
        return data;
      }
    }
  } catch {
    // fallback to cached / default
  }
  return null;
}

const FALLBACK_CONFIG: UnitTrainingConfigFile = {
  settings: { batchSize: 10 },
  units: {
    infantry: {
      id: 'infantry',
      name: 'Infantry',
      icon: '⚔',
      description: 'Frontline defenders of Everleaf.',
      enabled: true,
      requiredBuilding: 'barracks',
      levels: {
        level1: { trainingTimeSeconds: 30, cost: { food: 80, wood: 20 }, statBonuses: { health: 0, attack: 0, defense: 0, speed: 0 } },
        level2: { trainingTimeSeconds: 20, cost: { food: 60, wood: 15 }, statBonuses: { health: 10, attack: 2, defense: 5, speed: 0 } },
        level3: { trainingTimeSeconds: 12, cost: { food: 40, wood: 10 }, statBonuses: { health: 25, attack: 5, defense: 10, speed: 0.2 } },
      },
    },
    archer: {
      id: 'archer',
      name: 'Archers',
      icon: '🏹',
      description: 'Ranged support who thin enemy lines before contact.',
      enabled: true,
      requiredBuilding: 'archery',
      levels: {
        level1: { trainingTimeSeconds: 40, cost: { food: 60, wood: 40 }, statBonuses: { health: 0, attack: 0, defense: 0, speed: 0 } },
        level2: { trainingTimeSeconds: 28, cost: { food: 45, wood: 30 }, statBonuses: { health: 5, attack: 3, defense: 2, speed: 0 } },
        level3: { trainingTimeSeconds: 16, cost: { food: 30, wood: 20 }, statBonuses: { health: 12, attack: 8, defense: 4, speed: 0.3 } },
      },
    },
    scout: {
      id: 'scout',
      name: 'Scouts',
      icon: '🧭',
      description: 'Swift explorers who chart the paths of Lunacia.',
      enabled: false,
      requiredBuilding: 'scout',
      levels: {
        level1: { trainingTimeSeconds: 60, cost: { food: 50, wood: 10 }, statBonuses: { health: 0, attack: 0, defense: 0, speed: 0 } },
        level2: { trainingTimeSeconds: 45, cost: { food: 40, wood: 8 }, statBonuses: { health: 5, attack: 1, defense: 3, speed: 0.5 } },
        level3: { trainingTimeSeconds: 30, cost: { food: 30, wood: 5 }, statBonuses: { health: 10, attack: 3, defense: 5, speed: 1 } },
      },
    },
  },
};

export function getTrainingConfigFile(): UnitTrainingConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment (test suites), attempt to read the live YAML directly.
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yaml = require('yaml');
      const ymlPath = path.resolve(__dirname, 'config/units-training-config.yml');
      if (fs.existsSync(ymlPath)) {
        cachedConfig = yaml.parse(fs.readFileSync(ymlPath, 'utf8')) as UnitTrainingConfigFile;
        return cachedConfig;
      }
    } catch {
      // fall through to FALLBACK_CONFIG
    }
  }

  cachedConfig = FALLBACK_CONFIG;
  return cachedConfig;
}

/** Alias for getTrainingConfigFile — use either name. */
export const getUnitTrainingConfigFile = getTrainingConfigFile;

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getUnitTrainingConfig(unitId: string): UnitTrainingConfigItem | undefined {
  const file = getTrainingConfigFile();
  return file.units[unitId];
}

/**
 * Returns the training config for a unit at a given building level.
 * Clamps to the highest available level key if buildingLevel exceeds max.
 */
export function getUnitTrainingLevelConfig(
  unitId: string,
  buildingLevel = 1,
): UnitTrainingLevelConfig | undefined {
  const unit = getUnitTrainingConfig(unitId);
  if (!unit) return undefined;
  const clampedLevel = Math.max(1, Math.min(3, buildingLevel));
  const key = `level${clampedLevel}`;
  return unit.levels[key] ?? unit.levels.level1;
}

/** Whether this unit type is enabled for training (unit-level flag). */
export function isTrainingEnabled(unitId: string): boolean {
  return Boolean(getUnitTrainingConfig(unitId)?.enabled);
}

/** Batch size from config settings (falls back to 10). */
export function getTrainingBatchSize(): number {
  return getTrainingConfigFile().settings?.batchSize ?? 10;
}

/** Returns true if the city has enough food and wood to pay the training cost. */
export function canAffordTraining(resources: CityResources, cost: TrainingCost): boolean {
  for (const [key, amount] of Object.entries(cost) as [keyof CityResources, number][]) {
    if (typeof amount === 'number' && amount > 0) {
      if ((resources[key]?.amount ?? 0) < amount) return false;
    }
  }
  return true;
}

/** Returns updated resources after deducting the training cost. Does not mutate. */
export function deductTrainingCost(resources: CityResources, cost: TrainingCost): CityResources {
  const next: CityResources = {
    food: { ...resources.food },
    wood: { ...resources.wood },
    stone: { ...resources.stone },
  };
  for (const [key, amount] of Object.entries(cost) as [keyof CityResources, number][]) {
    if (typeof amount === 'number' && amount > 0 && next[key]) {
      next[key].amount = Math.max(0, next[key].amount - amount);
    }
  }
  return next;
}

/** Formats a stat bonuses object into a compact human-readable string, e.g. "+10 HP · +2 ATK". */
export function formatStatBonuses(bonuses: TrainingStatBonuses): string {
  const parts: string[] = [];
  if (bonuses.health > 0) parts.push(`+${bonuses.health} HP`);
  if (bonuses.attack > 0) parts.push(`+${bonuses.attack} ATK`);
  if (bonuses.defense > 0) parts.push(`+${bonuses.defense} DEF`);
  if (bonuses.speed > 0) parts.push(`+${bonuses.speed} SPD`);
  return parts.join(' · ');
}
