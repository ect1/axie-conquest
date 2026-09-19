import type { CityResourceKind } from './cities';

export type CityBaseCapacity = Record<CityResourceKind, number>;

export type CityDestructionType = 'health' | 'walls';

export type CityDestructionConfig = {
  type: CityDestructionType;
  maxHealth: number;
  damageMultiplier?: number;
};

export type CityTypeConfig = {
  id: string;
  name: string;
  description: string;
  isCapital: boolean;
  maxPerPlayer?: number;
  baseCapacity: CityBaseCapacity;
  destruction?: CityDestructionConfig;
};

export type CityConfigFile = {
  version: number;
  destruction?: CityDestructionConfig;
  cityTypes: Record<string, CityTypeConfig>;
};

export const DEFAULT_CITY_DESTRUCTION: CityDestructionConfig = {
  type: 'health',
  maxHealth: 10000,
};

const DEFAULT_CAPITAL_CAPACITY: CityBaseCapacity = {
  food: 500,
  wood: 500,
  stone: 500,
};

const DEFAULT_CITY_CONFIG: CityConfigFile = {
  version: 1,
  destruction: DEFAULT_CITY_DESTRUCTION,
  cityTypes: {
    capital: {
      id: 'capital',
      name: 'Capital Settlement',
      description: 'The primary heart of your Lunacian nation.',
      isCapital: true,
      maxPerPlayer: 1,
      baseCapacity: DEFAULT_CAPITAL_CAPACITY,
      destruction: DEFAULT_CITY_DESTRUCTION,
    },
  },
};

let cachedConfig: CityConfigFile | null = null;

export function setActiveCityConfig(config: CityConfigFile): void {
  cachedConfig = config;
}

export async function fetchLiveCityConfig(): Promise<CityConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/city-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as CityConfigFile;
      if (data?.cityTypes) {
        setActiveCityConfig(data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function getCityConfigFile(): CityConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment (such as test suites or server), read live YAML if available
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yamlParser = require('yaml');
      const ymlPath = path.resolve(__dirname, 'config/city-config.yml');
      if (fs.existsSync(ymlPath)) {
        cachedConfig = yamlParser.parse(fs.readFileSync(ymlPath, 'utf8')) as CityConfigFile;
        return cachedConfig;
      }
    } catch {
      // fallback
    }
  }

  if (!cachedConfig) {
    cachedConfig = DEFAULT_CITY_CONFIG;
  }

  return cachedConfig;
}

export function getCityTypeConfig(kind: string): CityTypeConfig | undefined {
  const file = getCityConfigFile();
  return file?.cityTypes?.[kind];
}

export function getCityBaseCapacity(kind: string = 'capital'): CityBaseCapacity {
  const typeConfig = getCityTypeConfig(kind) ?? getCityTypeConfig('capital');
  const caps = typeConfig?.baseCapacity;
  return {
    food: caps?.food ?? DEFAULT_CAPITAL_CAPACITY.food,
    wood: caps?.wood ?? DEFAULT_CAPITAL_CAPACITY.wood,
    stone: caps?.stone ?? DEFAULT_CAPITAL_CAPACITY.stone,
  };
}

export function getCityDestructionConfig(kind: string = 'capital'): CityDestructionConfig {
  const file = getCityConfigFile();
  const typeConfig = getCityTypeConfig(kind) ?? getCityTypeConfig('capital');
  const candidate = typeConfig?.destruction ?? file?.destruction;

  const validTypes: CityDestructionType[] = ['health', 'walls'];
  const type: CityDestructionType = validTypes.includes(candidate?.type as CityDestructionType)
    ? (candidate!.type as CityDestructionType)
    : DEFAULT_CITY_DESTRUCTION.type;

  const maxHealth = typeof candidate?.maxHealth === 'number' && candidate.maxHealth > 0
    ? candidate.maxHealth
    : DEFAULT_CITY_DESTRUCTION.maxHealth;

  const damageMultiplier = typeof candidate?.damageMultiplier === 'number' && candidate.damageMultiplier > 0
    ? candidate.damageMultiplier
    : (DEFAULT_CITY_DESTRUCTION.damageMultiplier ?? 0.25);

  return {
    type,
    maxHealth,
    damageMultiplier,
  };
}
