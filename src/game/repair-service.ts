import { RepairConfig, RepairCityHallLevelConfig, DEFAULT_REPAIR_CONFIG } from './game-config';

export const CITY_REPAIR_SAVE_KEY = 'axie-conquest-city-repair-v1';
export function getCityRepairSaveKey(cityId: string): string {
  return `axie-conquest-city-${cityId}-repair-v1`;
}

export type CityRepairState = {
  autoRepair: boolean;
  assignedAxieIds: string[];
};

export function createDefaultRepairState(defaultAutoRepair = true): CityRepairState {
  return {
    autoRepair: defaultAutoRepair,
    assignedAxieIds: [],
  };
}

/**
 * Restores the persisted repair state for a city or returns starter defaults.
 */
export function restoreCityRepair(raw?: string | null, defaultAutoRepair = true): CityRepairState {
  if (!raw) return createDefaultRepairState(defaultAutoRepair);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createDefaultRepairState(defaultAutoRepair);

    const autoRepair = typeof parsed.autoRepair === 'boolean' ? parsed.autoRepair : defaultAutoRepair;
    const assignedAxieIds = Array.isArray(parsed.assignedAxieIds)
      ? parsed.assignedAxieIds.filter((id: unknown) => typeof id === 'string' && id.trim().length > 0)
      : [];

    return {
      autoRepair,
      assignedAxieIds: Array.from(new Set(assignedAxieIds)),
    };
  } catch {
    return createDefaultRepairState(defaultAutoRepair);
  }
}

/**
 * Serializes the repair state to a clean JSON string.
 */
export function serializeCityRepair(state: CityRepairState): string {
  return JSON.stringify({
    autoRepair: Boolean(state.autoRepair),
    assignedAxieIds: Array.isArray(state.assignedAxieIds) ? state.assignedAxieIds : [],
  });
}

/**
 * Resolves the configuration for a given City Hall level.
 */
export function getCityHallRepairLevelConfig(config: RepairConfig, hallLevel = 1): RepairCityHallLevelConfig {
  const safeLevel = Math.max(1, Math.floor(hallLevel));
  const candidate = config.cityHallLevels?.[safeLevel] ?? config.cityHallLevels?.[String(safeLevel)];
  if (candidate) return candidate;

  // Fallback to highest defined level or default level 1
  const levels = Object.keys(config.cityHallLevels ?? {}).map(Number).sort((a, b) => a - b);
  const highest = levels[levels.length - 1];
  if (highest && config.cityHallLevels[highest]) {
    return config.cityHallLevels[highest];
  }

  return DEFAULT_REPAIR_CONFIG.cityHallLevels[1];
}

/**
 * Calculates the current repair rate (HP per second) based on assigned Axies and City Hall level.
 */
export function calculateRepairRate(
  config: RepairConfig,
  hallLevel: number,
  assignedAxieCount: number
): number {
  if (assignedAxieCount <= 0) return 0;

  const levelConfig = getCityHallRepairLevelConfig(config, hallLevel);
  // Cap effective Axies by maxAssignableAxies
  const effectiveAxies = Math.min(assignedAxieCount, levelConfig.maxAssignableAxies);
  if (effectiveAxies <= 0) return 0;

  // 1st Axie provides full base * levelMultiplier; each additional Axie adds axieMultiplier bonus
  const extraAxieBonus = 1 + (effectiveAxies - 1) * config.axieMultiplier;
  const rate = config.baseRepair * levelConfig.repairMultiplier * extraAxieBonus;

  return Math.max(0, Number(rate.toFixed(2)));
}

/**
 * Calculates the resource cost to repair a given amount of HP, factoring in City Hall cost discounts.
 */
export function calculateRepairCost(
  config: RepairConfig,
  hallLevel: number,
  hpToRepair: number
): { wood: number; stone: number; food: number } {
  if (hpToRepair <= 0) return { wood: 0, stone: 0, food: 0 };

  const levelConfig = getCityHallRepairLevelConfig(config, hallLevel);
  const costScale = (hpToRepair / 100) * levelConfig.costMultiplier;

  return {
    wood: Math.max(0, Number(((config.costPer100Hp.wood ?? 0) * costScale).toFixed(2))),
    stone: Math.max(0, Number(((config.costPer100Hp.stone ?? 0) * costScale).toFixed(2))),
    food: Math.max(0, Number(((config.costPer100Hp.food ?? 0) * costScale).toFixed(2))),
  };
}

export type ProcessRepairTickParams = {
  currentHealth: number;
  maxHealth: number;
  resources: { wood: number; stone: number; food?: number };
  elapsedSeconds: number;
  hallLevel: number;
  assignedAxieCount: number;
  autoRepair: boolean;
  config: RepairConfig;
};

export type ProcessRepairTickResult = {
  nextHealth: number;
  hpRepaired: number;
  consumed: { wood: number; stone: number; food: number };
  repairRate: number;
  hasResources: boolean;
  isRepairing: boolean;
};

/**
 * Computes repair tick progression, consuming wood/stone and restoring health.
 */
export function processRepairTick({
  currentHealth,
  maxHealth,
  resources,
  elapsedSeconds,
  hallLevel,
  assignedAxieCount,
  autoRepair,
  config,
}: ProcessRepairTickParams): ProcessRepairTickResult {
  const zeroResult: ProcessRepairTickResult = {
    nextHealth: currentHealth,
    hpRepaired: 0,
    consumed: { wood: 0, stone: 0, food: 0 },
    repairRate: 0,
    hasResources: true,
    isRepairing: false,
  };

  if (
    !autoRepair ||
    assignedAxieCount <= 0 ||
    currentHealth >= maxHealth ||
    currentHealth <= 0 ||
    elapsedSeconds <= 0
  ) {
    return zeroResult;
  }

  const repairRate = calculateRepairRate(config, hallLevel, assignedAxieCount);
  if (repairRate <= 0) return zeroResult;

  const potentialHp = Math.min(maxHealth - currentHealth, repairRate * elapsedSeconds);
  if (potentialHp <= 0) return zeroResult;

  const levelConfig = getCityHallRepairLevelConfig(config, hallLevel);
  const unitCostFactor = (1 / 100) * levelConfig.costMultiplier;
  const unitWoodCost = (config.costPer100Hp.wood ?? 0) * unitCostFactor;
  const unitStoneCost = (config.costPer100Hp.stone ?? 0) * unitCostFactor;
  const unitFoodCost = (config.costPer100Hp.food ?? 0) * unitCostFactor;

  // Check how much HP we can afford with current resources
  let maxAffordableHp = potentialHp;
  if (unitWoodCost > 0) {
    maxAffordableHp = Math.min(maxAffordableHp, resources.wood / unitWoodCost);
  }
  if (unitStoneCost > 0) {
    maxAffordableHp = Math.min(maxAffordableHp, resources.stone / unitStoneCost);
  }
  if (unitFoodCost > 0 && resources.food !== undefined) {
    maxAffordableHp = Math.min(maxAffordableHp, resources.food / unitFoodCost);
  }

  if (maxAffordableHp <= 0.01) {
    return {
      nextHealth: currentHealth,
      hpRepaired: 0,
      consumed: { wood: 0, stone: 0, food: 0 },
      repairRate,
      hasResources: false,
      isRepairing: false,
    };
  }

  const hpRepaired = Math.min(potentialHp, maxAffordableHp);
  const consumedWood = Math.max(0, Number((hpRepaired * unitWoodCost).toFixed(2)));
  const consumedStone = Math.max(0, Number((hpRepaired * unitStoneCost).toFixed(2)));
  const consumedFood = Math.max(0, Number((hpRepaired * unitFoodCost).toFixed(2)));
  const nextHealth = Math.min(maxHealth, Number((currentHealth + hpRepaired).toFixed(1)));

  return {
    nextHealth,
    hpRepaired,
    consumed: { wood: consumedWood, stone: consumedStone, food: consumedFood },
    repairRate,
    hasResources: true,
    isRepairing: true,
  };
}

let cachedCityRepairState: CityRepairState | null = null;

export function getCachedCityRepairState(): CityRepairState | null {
  return cachedCityRepairState;
}

export function setCachedCityRepairState(state: CityRepairState | null): void {
  cachedCityRepairState = state;
}

/**
 * Synchronous reset callback for city repair module cache.
 */
export function resetCityRepair(): void {
  cachedCityRepairState = null;
}
