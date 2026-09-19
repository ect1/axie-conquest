import type { CityResourceKind } from './cities';

export type GameStartingResources = Record<CityResourceKind, number>;

export type GameConfigFile = {
  version: number;
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
