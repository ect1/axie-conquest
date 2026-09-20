import { BuildingKind } from './base';
import { CityResources } from './cities';

export type BuildingCost = Partial<Record<'food' | 'wood' | 'stone', number>>;

export type BuildingProduction = {
  resource: 'food' | 'wood' | 'stone';
  rateUnits: number;
  produceEverySeconds: number;
  storageCapacity?: number;
};

export type BuildingCapacityBonus = Partial<Record<'food' | 'wood' | 'stone', number>>;

export type BuildingLevelConfig = {
  health: number;
  buildTimeSeconds: number;
  removeTimerSeconds?: number;
  cost: BuildingCost;
  production?: BuildingProduction;
  capacityBonus?: BuildingCapacityBonus;
  unlocks?: { troops?: string[] };
  trainingSpeedBonusPercent?: number;
  healingMultiplier?: number;
  requirements?: { cityHallLevel?: number };
};

export type BuildingConfigItem = {
  id: string;
  alias?: string;
  name: string;
  category: string;
  description: string;
  available: boolean;
  movable: boolean;
  removable: boolean;
  maxLevel: number;
  maxPerCity: number;
  dimensions: { width: number; depth: number };
  model?: string;
  levels: Record<string, BuildingLevelConfig>;
};

export type BuildingConfigFile = {
  settings: {
    defaultMaxLevel: number;
    demolishRefundRatio: number;
    instantBuildInDebug: boolean;
  };
  buildings: Record<string, BuildingConfigItem>;
};

let cachedConfig: BuildingConfigFile | null = null;

export function setActiveBuildingConfig(config: BuildingConfigFile): void {
  cachedConfig = config;
}

export async function fetchLiveBuildingConfig(): Promise<BuildingConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/building-config', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json() as BuildingConfigFile;
      if (data?.buildings) {
        setActiveBuildingConfig(data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function getBuildingConfigFile(): BuildingConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment (such as test suites), read live YAML if available
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yaml = require('yaml');
      const ymlPath = path.resolve(__dirname, 'config/building-config.yml');
      if (fs.existsSync(ymlPath)) {
        cachedConfig = yaml.parse(fs.readFileSync(ymlPath, 'utf8')) as BuildingConfigFile;
        return cachedConfig;
      }
    } catch {
      // fallback to pre-bundled json
    }
  }

  if (!cachedConfig) {
    cachedConfig = {
      settings: { defaultMaxLevel: 3, demolishRefundRatio: 0.5, instantBuildInDebug: false },
      buildings: {},
    };
  }
  return cachedConfig;
}

export function getBuildingConfig(kind: string): BuildingConfigItem | undefined {
  const file = getBuildingConfigFile();
  if (file.buildings[kind]) return file.buildings[kind];
  for (const item of Object.values(file.buildings)) {
    if (item.alias === kind || item.id === kind) return item;
  }
  return undefined;
}

export function getBuildingLevelConfig(kind: string, level = 1): BuildingLevelConfig | undefined {
  const item = getBuildingConfig(kind);
  if (!item) return undefined;
  const key = `level${Math.max(1, Math.min(level, item.maxLevel))}`;
  return item.levels[key] ?? item.levels.level1;
}

export function isBuildingAvailable(kind: string): boolean {
  const item = getBuildingConfig(kind);
  return Boolean(item?.available);
}

export function isBuildingMovable(kind: string): boolean {
  const item = getBuildingConfig(kind);
  return Boolean(item?.movable);
}

export function getDemolishRefundRatio(): number {
  return getBuildingConfigFile().settings?.demolishRefundRatio ?? 0.5;
}

export function canAffordBuilding(resources: CityResources, cost: BuildingCost): boolean {
  for (const [resKey, amount] of Object.entries(cost)) {
    if (typeof amount === 'number' && amount > 0) {
      const current = resources[resKey as keyof CityResources]?.amount ?? 0;
      if (current < amount) return false;
    }
  }
  return true;
}

export function deductBuildingCost(resources: CityResources, cost: BuildingCost): CityResources {
  const next: CityResources = {
    food: { ...resources.food },
    wood: { ...resources.wood },
    stone: { ...resources.stone },
  };

  for (const [resKey, amount] of Object.entries(cost)) {
    const key = resKey as keyof CityResources;
    if (typeof amount === 'number' && amount > 0 && next[key]) {
      next[key].amount = Math.max(0, next[key].amount - amount);
    }
  }

  return next;
}

export function calculateDemolishRefund(kind: string, level = 1): BuildingCost {
  const levelConfig = getBuildingLevelConfig(kind, level);
  if (!levelConfig?.cost) return {};
  const ratio = getDemolishRefundRatio();
  const refund: BuildingCost = {};

  for (const [resKey, amount] of Object.entries(levelConfig.cost)) {
    if (typeof amount === 'number' && amount > 0) {
      refund[resKey as keyof CityResources] = Math.floor(amount * ratio);
    }
  }

  return refund;
}

export function refundBuildingCost(resources: CityResources, refund: BuildingCost): CityResources {
  const next: CityResources = {
    food: { ...resources.food },
    wood: { ...resources.wood },
    stone: { ...resources.stone },
  };

  for (const [resKey, amount] of Object.entries(refund)) {
    const key = resKey as keyof CityResources;
    if (typeof amount === 'number' && amount > 0 && next[key]) {
      next[key].amount = next[key].amount + amount;
    }
  }

  return next;
}
