export type ResourceSpawnRewards = {
  food?: number;
  wood?: number;
  stone?: number;
  apple?: number;
  oil?: number;
};

export type ResourceNodeConfig = {
  enabled?: boolean;
  id: string;
  name: string;
  resourceType: 'food' | 'wood' | 'stone' | 'oil' | string;
  description?: string;
  defaultSpawnCount: number;
  capacity: number;
  gatherRatePerSecond: number;
  respawnTimerSeconds: number;
};

export type BossSpawnConfig = {
  id: string;
  name: string;
  title?: string;
  description?: string;
  spawnWeight: number;
  rewards: ResourceSpawnRewards;
};

export type NeutralPoiConfig = {
  enabled?: boolean;
  id: string;
  name: string;
  description?: string;
  defaultSpawnCount: number;
  state: 'defended' | 'available' | 'defeated';
  rewards: ResourceSpawnRewards;
};

export type NeutralPoiConfigFile = {
  enabled?: boolean;
  village?: NeutralPoiConfig;
  garrison?: NeutralPoiConfig;
  [key: string]: NeutralPoiConfig | boolean | undefined;
};

export type WorldSettingsConfig = {
  mapWidth: number;
  mapDepth: number;
  objectRadius: number;
  defaultSpacing: number;
  cityBufferDistance: number;
  globalSpawnTimerSeconds: number;
  respawnWhenAllCollected: boolean;
  // Legacy aliases
  globalSpwanTimerSecods?: number;
  respawnWhenDepletion?: boolean;
};

export type ResourceSpawnConfigFile = {
  version: number;
  worldSettings: WorldSettingsConfig;
  resourceNodes: Record<string, ResourceNodeConfig>;
  bossMobs: {
    defaultSpawnCount: number;
    respawnTimerSeconds: number;
    roster: Record<string, BossSpawnConfig>;
  };
  neutralPointsOfInterest: NeutralPoiConfigFile;
};

const DEFAULT_RESOURCE_SPAWN_CONFIG: ResourceSpawnConfigFile = {
  version: 1,
  worldSettings: {
    mapWidth: 200,
    mapDepth: 200,
    objectRadius: 3,
    defaultSpacing: 8,
    cityBufferDistance: 14,
    globalSpawnTimerSeconds: 300,
    respawnWhenAllCollected: true,
  },
  resourceNodes: {
    farm: {
      enabled: true,
      id: 'farm',
      name: 'Wild Farm',
      resourceType: 'food',
      description: 'Abundant agricultural lands rich in grain and fresh Lunacian produce.',
      defaultSpawnCount: 5,
      capacity: 500,
      gatherRatePerSecond: 5,
      respawnTimerSeconds: 300,
    },
    lumber: {
      enabled: true,
      id: 'lumber',
      name: 'Lumber Grove',
      resourceType: 'wood',
      description: 'Ancient woodland dense with timber suitable for settlement construction.',
      defaultSpawnCount: 5,
      capacity: 500,
      gatherRatePerSecond: 5,
      respawnTimerSeconds: 300,
    },
    stone: {
      enabled: true,
      id: 'stone',
      name: 'Stone Quarry',
      resourceType: 'stone',
      description: 'Rocky outcrop containing Lunacian stone and minerals for fortifications.',
      defaultSpawnCount: 5,
      capacity: 400,
      gatherRatePerSecond: 4,
      respawnTimerSeconds: 300,
    },
    oil: {
      enabled: false,
      id: 'oil',
      name: 'Oil Spring',
      resourceType: 'oil',
      description: 'Rare geological fissure bubbling with energy-rich Lunacian crude oil.',
      defaultSpawnCount: 3,
      capacity: 250,
      gatherRatePerSecond: 2,
      respawnTimerSeconds: 600,
    },
  },
  bossMobs: {
    defaultSpawnCount: 3,
    respawnTimerSeconds: 600,
    roster: {
      kotaro: {
        id: 'kotaro',
        name: 'Kotaro',
        title: 'Wandering Blademaster',
        description: 'A fierce rogue blademaster supported by vanguard infantry and snipers.',
        spawnWeight: 10,
        rewards: { food: 200, wood: 200, stone: 150 },
      },
      paladill: {
        id: 'paladill',
        name: 'Paladill',
        title: 'Ironclad Colossus',
        description: 'A heavily armored juggernaut wielding an immense greataxe with elite guard.',
        spawnWeight: 5,
        rewards: { food: 350, wood: 350, stone: 300 },
      },
      'chimera-pack': {
        id: 'chimera-pack',
        name: 'Chimera Pack',
        title: 'Wild Corrupted Beasts',
        description: 'A roving pack of aggressive Chimeras prowling the wilderness.',
        spawnWeight: 8,
        rewards: { food: 120, wood: 120, stone: 80, apple: 25 },
      },
    },
  },
  neutralPointsOfInterest: {
    enabled: true,
    village: {
      enabled: true,
      id: 'village',
      name: 'Neutral Village',
      description: 'An unaligned Lunacian hamlet that can be attacked and occupied.',
      defaultSpawnCount: 4,
      state: 'defended',
      rewards: { food: 120, wood: 80, stone: 0, apple: 1 },
    },
    garrison: {
      enabled: true,
      id: 'garrison',
      name: 'Frontier Garrison',
      description: 'A fortified outpost occupied by rogue sentinels.',
      defaultSpawnCount: 4,
      state: 'defended',
      rewards: { food: 180, wood: 120, stone: 100, apple: 1 },
    },
  },
};

let cachedConfig: ResourceSpawnConfigFile | null = null;

export function setActiveResourceSpawnConfig(config: ResourceSpawnConfigFile): void {
  cachedConfig = config;
}

export async function fetchLiveResourceSpawnConfig(): Promise<ResourceSpawnConfigFile | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch('/api/resource-spawn-config', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as ResourceSpawnConfigFile;
      if (data?.resourceNodes && data?.worldSettings) {
        setActiveResourceSpawnConfig(data);
        return data;
      }
    }
  } catch {
    // fallback
  }
  return null;
}

export function getResourceSpawnConfigFile(): ResourceSpawnConfigFile {
  if (cachedConfig) return cachedConfig;

  // In Node environment, read live YAML if available
  if (typeof window === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const yamlParser = require('yaml');
      const ymlPath = path.resolve(__dirname, 'config/resource-spawn-config.yml');
      if (fs.existsSync(ymlPath)) {
        cachedConfig = yamlParser.parse(fs.readFileSync(ymlPath, 'utf8')) as ResourceSpawnConfigFile;
        return cachedConfig;
      }
    } catch {
      // fallback
    }
  }

  if (!cachedConfig) {
    cachedConfig = DEFAULT_RESOURCE_SPAWN_CONFIG;
  }

  return cachedConfig;
}

export function getGlobalSpawnTimerSeconds(): number {
  const cfg = getResourceSpawnConfigFile();
  return (
    cfg?.worldSettings?.globalSpawnTimerSeconds ??
    cfg?.worldSettings?.globalSpwanTimerSecods ??
    300
  );
}

export function shouldRespawnWhenAllCollected(): boolean {
  const cfg = getResourceSpawnConfigFile();
  return (
    cfg?.worldSettings?.respawnWhenAllCollected ??
    cfg?.worldSettings?.respawnWhenDepletion ??
    true
  );
}

export function getResourceNodeConfig(id: string): ResourceNodeConfig | null {
  const cfg = getResourceSpawnConfigFile();
  return cfg?.resourceNodes?.[id] ?? null;
}

export function isResourceNodeEnabled(id: string): boolean {
  const cfg = getResourceSpawnConfigFile();
  if ((cfg?.resourceNodes as unknown as { enabled?: boolean })?.enabled === false) return false;
  const node = cfg?.resourceNodes?.[id];
  if (!node) return false;
  return node.enabled !== false;
}

export function isNeutralPoiEnabled(id?: string): boolean {
  const cfg = getResourceSpawnConfigFile();
  const pois = cfg?.neutralPointsOfInterest;
  if (!pois) return true;
  if (pois.enabled === false) return false;
  if (id) {
    const item = pois[id];
    if (item && typeof item === 'object' && item.enabled === false) return false;
  }
  return true;
}

export function isWorldKindEnabled(kind: string): boolean {
  if (['farm', 'lumber', 'stone', 'oil'].includes(kind)) {
    return isResourceNodeEnabled(kind);
  }
  if (kind === 'village' || kind === 'garrison') {
    return isNeutralPoiEnabled(kind);
  }
  return true;
}

export function getActiveGenerationSettings(): { counts: Record<string, number>; spacing: number } {
  const cfg = getResourceSpawnConfigFile();
  const counts: Record<string, number> = {
    farm: isResourceNodeEnabled('farm') ? (cfg.resourceNodes?.farm?.defaultSpawnCount ?? 5) : 0,
    lumber: isResourceNodeEnabled('lumber') ? (cfg.resourceNodes?.lumber?.defaultSpawnCount ?? 5) : 0,
    stone: isResourceNodeEnabled('stone') ? (cfg.resourceNodes?.stone?.defaultSpawnCount ?? 5) : 0,
    oil: isResourceNodeEnabled('oil') ? (cfg.resourceNodes?.oil?.defaultSpawnCount ?? 3) : 0,
    boss: cfg.bossMobs?.defaultSpawnCount ?? 3,
    village: isNeutralPoiEnabled('village') ? (cfg.neutralPointsOfInterest?.village?.defaultSpawnCount ?? 4) : 0,
    garrison: isNeutralPoiEnabled('garrison') ? (cfg.neutralPointsOfInterest?.garrison?.defaultSpawnCount ?? 4) : 0,
  };
  return {
    counts,
    spacing: cfg.worldSettings?.defaultSpacing ?? 8,
  };
}

