import type { CityResourceKind } from './cities';
import type { CityDestructionConfig } from './city-config';
import { DEFAULT_CITY_DESTRUCTION } from './city-config';

export type GameStartingResources = Record<CityResourceKind, number>;

export type RepairCostPer100Hp = {
  wood?: number;
  stone?: number;
  food?: number;
};

export type RepairCityHallLevelConfig = {
  maxAssignableAxies: number;
  repairMultiplier: number;
  costMultiplier: number;
};

export type RepairConfig = {
  baseRepair: number;
  defaultAutoRepair: boolean;
  costPer100Hp: RepairCostPer100Hp;
  axieMultiplier: number;
  cityHallLevels: Record<number | string, RepairCityHallLevelConfig>;
};

export const DEFAULT_REPAIR_CONFIG: RepairConfig = {
  baseRepair: 50,
  defaultAutoRepair: true,
  costPer100Hp: {
    wood: 5,
    stone: 5,
  },
  axieMultiplier: 0.25,
  cityHallLevels: {
    1: { maxAssignableAxies: 1, repairMultiplier: 1.0, costMultiplier: 1.0 },
    2: { maxAssignableAxies: 2, repairMultiplier: 1.35, costMultiplier: 0.9 },
    3: { maxAssignableAxies: 3, repairMultiplier: 1.75, costMultiplier: 0.8 },
  },
};

export type EndBattleConfig = {
  /** Tactical Z coordinate player formations must cross to leave combat. */
  retreatBoundaryZ: number;
  defeatedType: 'retreat' | 'destroy';
  retreat: {
    untargetable: boolean;
    unmarchable: boolean;
    armyLossPercent: number;
    /** Protection after a manual retreat crosses the tactical boundary. */
    postBoundaryUntargetableSeconds: number;
    postBoundaryUnmarchableSeconds: number;
  };
};

export const DEFAULT_END_BATTLE_CONFIG: EndBattleConfig = {
  retreatBoundaryZ: -22,
  defeatedType: 'retreat',
  retreat: {
    untargetable: true,
    unmarchable: true,
    armyLossPercent: 0.6,
    postBoundaryUntargetableSeconds: 1,
    postBoundaryUnmarchableSeconds: 3,
  },
};

export type GameConfigFile = {
  version: number;
  destruction?: CityDestructionConfig;
  repair?: RepairConfig;
  endBattle?: EndBattleConfig;
  startingState: {
    capitalCity: {
      id: string;
      defaultName: string;
      resources: GameStartingResources;
    };
  };
};

const DEFAULT_GAME_CONFIG: GameConfigFile = {
  version: 1,
  destruction: DEFAULT_CITY_DESTRUCTION,
  repair: DEFAULT_REPAIR_CONFIG,
  endBattle: DEFAULT_END_BATTLE_CONFIG,
  startingState: {
    capitalCity: {
      id: 'everleaf-haven',
      defaultName: 'City #1',
      resources: { food: 240, wood: 180, stone: 120, warSupplies: 80 },
    },
  },
};

let cachedConfig: GameConfigFile | null = null;

export function setActiveGameConfig(config: GameConfigFile): void {
  cachedConfig = config;
}

export async function fetchLiveGameConfig(): Promise<GameConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/game-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as GameConfigFile;
      if (data?.startingState?.capitalCity?.resources) {
        setActiveGameConfig(data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function getGameConfigFile(): GameConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment (such as test suites or server), read live YAML if available
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yamlParser = require('yaml');
      const ymlPath = path.resolve(__dirname, 'config/game-config.yml');
      if (fs.existsSync(ymlPath)) {
        cachedConfig = yamlParser.parse(fs.readFileSync(ymlPath, 'utf8')) as GameConfigFile;
        return cachedConfig;
      }
    } catch {
      // fallback
    }
  }

  if (!cachedConfig) {
    cachedConfig = DEFAULT_GAME_CONFIG;
  }

  return cachedConfig;
}

export function getStartingResources(): GameStartingResources {
  const cfg = getGameConfigFile();
  const res = cfg?.startingState?.capitalCity?.resources;
  return {
    food: res?.food ?? 240,
    wood: res?.wood ?? 180,
    stone: res?.stone ?? 120,
    warSupplies: res?.warSupplies ?? 80,
  };
}

export function getCapitalCityIdentity(): { id: string; defaultName: string } {
  const cfg = getGameConfigFile();
  const cap = cfg?.startingState?.capitalCity;
  return {
    id: cap?.id ?? 'everleaf-haven',
    defaultName: cap?.defaultName ?? 'City #1',
  };
}

export function getRepairConfig(): RepairConfig {
  const cfg = getGameConfigFile();
  const repair = cfg?.repair;
  if (!repair) return DEFAULT_REPAIR_CONFIG;

  const baseRepair = typeof repair.baseRepair === 'number' && repair.baseRepair > 0
    ? repair.baseRepair
    : DEFAULT_REPAIR_CONFIG.baseRepair;

  const defaultAutoRepair = typeof repair.defaultAutoRepair === 'boolean'
    ? repair.defaultAutoRepair
    : DEFAULT_REPAIR_CONFIG.defaultAutoRepair;

  const costPer100Hp: RepairCostPer100Hp = {
    wood: typeof repair.costPer100Hp?.wood === 'number' ? repair.costPer100Hp.wood : DEFAULT_REPAIR_CONFIG.costPer100Hp.wood,
    stone: typeof repair.costPer100Hp?.stone === 'number' ? repair.costPer100Hp.stone : DEFAULT_REPAIR_CONFIG.costPer100Hp.stone,
    food: typeof repair.costPer100Hp?.food === 'number' ? repair.costPer100Hp.food : DEFAULT_REPAIR_CONFIG.costPer100Hp.food,
  };

  const axieMultiplier = typeof repair.axieMultiplier === 'number' && repair.axieMultiplier >= 0
    ? repair.axieMultiplier
    : DEFAULT_REPAIR_CONFIG.axieMultiplier;

  const cityHallLevels = repair.cityHallLevels ?? DEFAULT_REPAIR_CONFIG.cityHallLevels;

  return {
    baseRepair,
    defaultAutoRepair,
    costPer100Hp,
    axieMultiplier,
    cityHallLevels,
  };
}

export function getEndBattleConfig(): EndBattleConfig {
  const cfg = getGameConfigFile();
  const eb = cfg?.endBattle;
  const retreatBoundaryZ =
    typeof eb?.retreatBoundaryZ === 'number' && eb.retreatBoundaryZ <= -1 && eb.retreatBoundaryZ >= -100
      ? eb.retreatBoundaryZ
      : DEFAULT_END_BATTLE_CONFIG.retreatBoundaryZ;
  const defeatedType = eb?.defeatedType === 'destroy' ? 'destroy' : 'retreat';
  const retreat = {
    untargetable: typeof eb?.retreat?.untargetable === 'boolean' ? eb.retreat.untargetable : DEFAULT_END_BATTLE_CONFIG.retreat.untargetable,
    unmarchable: typeof eb?.retreat?.unmarchable === 'boolean' ? eb.retreat.unmarchable : DEFAULT_END_BATTLE_CONFIG.retreat.unmarchable,
    armyLossPercent: typeof eb?.retreat?.armyLossPercent === 'number' && Number.isFinite(eb.retreat.armyLossPercent)
      ? Math.max(0, Math.min(1, eb.retreat.armyLossPercent))
      : DEFAULT_END_BATTLE_CONFIG.retreat.armyLossPercent,
    postBoundaryUntargetableSeconds: typeof eb?.retreat?.postBoundaryUntargetableSeconds === 'number' && Number.isFinite(eb.retreat.postBoundaryUntargetableSeconds)
      ? Math.max(0, Math.min(30, eb.retreat.postBoundaryUntargetableSeconds))
      : DEFAULT_END_BATTLE_CONFIG.retreat.postBoundaryUntargetableSeconds,
    postBoundaryUnmarchableSeconds: typeof eb?.retreat?.postBoundaryUnmarchableSeconds === 'number' && Number.isFinite(eb.retreat.postBoundaryUnmarchableSeconds)
      ? Math.max(0, Math.min(30, eb.retreat.postBoundaryUnmarchableSeconds))
      : DEFAULT_END_BATTLE_CONFIG.retreat.postBoundaryUnmarchableSeconds,
  };
  return { retreatBoundaryZ, defeatedType, retreat };
}

/** Applies Developer HUD end-battle tuning for the current session. */
export function setActiveEndBattleConfig(config: EndBattleConfig): EndBattleConfig {
  const current = getGameConfigFile();
  const retreat = config.retreat ?? current.endBattle?.retreat ?? DEFAULT_END_BATTLE_CONFIG.retreat;
  cachedConfig = {
    ...current,
    endBattle: {
      retreatBoundaryZ: Number.isFinite(config.retreatBoundaryZ)
        ? Math.max(-100, Math.min(-1, config.retreatBoundaryZ))
        : DEFAULT_END_BATTLE_CONFIG.retreatBoundaryZ,
      defeatedType: config.defeatedType === 'destroy' || config.defeatedType === 'retreat'
        ? config.defeatedType
        : (current.endBattle?.defeatedType ?? DEFAULT_END_BATTLE_CONFIG.defeatedType),
      retreat: {
        untargetable: typeof retreat.untargetable === 'boolean' ? retreat.untargetable : DEFAULT_END_BATTLE_CONFIG.retreat.untargetable,
        unmarchable: typeof retreat.unmarchable === 'boolean' ? retreat.unmarchable : DEFAULT_END_BATTLE_CONFIG.retreat.unmarchable,
        armyLossPercent: typeof retreat.armyLossPercent === 'number' ? Math.max(0, Math.min(1, retreat.armyLossPercent)) : DEFAULT_END_BATTLE_CONFIG.retreat.armyLossPercent,
        postBoundaryUntargetableSeconds: typeof retreat.postBoundaryUntargetableSeconds === 'number' ? Math.max(0, Math.min(30, retreat.postBoundaryUntargetableSeconds)) : DEFAULT_END_BATTLE_CONFIG.retreat.postBoundaryUntargetableSeconds,
        postBoundaryUnmarchableSeconds: typeof retreat.postBoundaryUnmarchableSeconds === 'number' ? Math.max(0, Math.min(30, retreat.postBoundaryUnmarchableSeconds)) : DEFAULT_END_BATTLE_CONFIG.retreat.postBoundaryUnmarchableSeconds,
      },
    },
  };
  return getEndBattleConfig();
}
