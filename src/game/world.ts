import { GRID_WIDTH, GRID_DEPTH } from './base';
import { getBossConfig, selectBossForSpawn } from './bosses';
import { isWorldKindEnabled } from './resource-spawn-config';

export const WORLD_WIDTH = 200;
export const WORLD_DEPTH = 200;
export const WORLD_OBJECT_RADIUS = 3;
export const WORLD_SAVE_KEY = 'axie-conquest-world-v1';
export const DEPLETED_NODES_SAVE_KEY = 'axie-conquest-depleted-nodes-v1';
export const WORLD_DEFINITIONS = {
  farm: { name: 'Farm', count: 5 },
  lumber: { name: 'Lumber', count: 5 },
  stone: { name: 'Stone', count: 5 },
  oil: { name: 'Oil', count: 3 },
  boss: { name: 'Boss mob', count: 3 },
  village: { name: 'Village', count: 4 },
  garrison: { name: 'Garrison', count: 4 },
} as const;
export type WorldKind = keyof typeof WORLD_DEFINITIONS;
export const WORLD_KINDS = Object.keys(WORLD_DEFINITIONS) as WorldKind[];
export type WorldAction = 'scout' | 'attack' | 'gather' | 'occupy';
export type WorldObjectState = 'available' | 'defended' | 'defeated';
export type WorldActionOption = { action: WorldAction; enabled: boolean; reason?: string };
export type GenerationSettings = { counts: Record<WorldKind, number>; spacing: number };
export type WorldObject = {
  id: string;
  kind: WorldKind;
  x: number;
  z: number;
  state: WorldObjectState;
  loot: { apple: number };
  bossId?: string;
  bossName?: string;
  currentCapacity?: number;
  maxCapacity?: number;
  depletedAt?: number;
  respawnAt?: number;
};
export type SpawnableMobGroup = 'chimera-pack';
export const SPAWNABLE_MOB_GROUPS: Record<SpawnableMobGroup, { label: string; kind: 'boss' }> = {
  'chimera-pack': { label: 'Chimera pack', kind: 'boss' },
};
export const DEFAULT_GENERATION: GenerationSettings = {
  counts: Object.fromEntries(WORLD_KINDS.map(kind => [kind, WORLD_DEFINITIONS[kind].count])) as Record<WorldKind, number>,
  spacing: 8,
};

export const DEFAULT_RESOURCE_CAPACITIES: Partial<Record<WorldKind, number>> = {
  farm: 500,
  lumber: 500,
  stone: 400,
  oil: 250,
};

export function defaultWorldObjectState(kind: WorldKind): WorldObjectState {
  return kind === 'boss' || kind === 'garrison' || kind === 'village' ? 'defended' : 'available';
}

/** Creates a developer-placed defended encounter at an explicitly chosen map coordinate. */
export function createMobGroup(group: SpawnableMobGroup, x: number, z: number, existing: WorldObject[], chosenBossId?: string): WorldObject | null {
  const definition = SPAWNABLE_MOB_GROUPS[group];
  if (!definition || !Number.isFinite(x) || !Number.isFinite(z)
    || Math.abs(x) > WORLD_WIDTH / 2 - WORLD_OBJECT_RADIUS || Math.abs(z) > WORLD_DEPTH / 2 - WORLD_OBJECT_RADIUS
    || (Math.abs(x) < GRID_WIDTH / 2 + 3 + WORLD_OBJECT_RADIUS && Math.abs(z) < GRID_DEPTH / 2 + 3 + WORLD_OBJECT_RADIUS)
    || existing.some(object => Math.hypot(object.x - x, object.z - z) < WORLD_OBJECT_RADIUS * 2)) return null;
  let serial = existing.length;
  let id = `developer-mob-${serial}`;
  while (existing.some(object => object.id === id)) id = `developer-mob-${++serial}`;
  const boss = chosenBossId ? (getBossConfig(chosenBossId) ?? selectBossForSpawn()) : selectBossForSpawn();
  return { id, kind: definition.kind, x, z, state: 'defended', loot: { apple: 0 }, bossId: boss.id, bossName: boss.name };
}

export function getWorldObjectActions(object: WorldObject): WorldActionOption[] {
  if (object.kind === 'boss') return object.state === 'defended'
    ? [{ action: 'scout', enabled: true }, { action: 'attack', enabled: true }]
    : [];
  if (object.kind === 'garrison') return object.state === 'defeated'
    ? [{ action: 'occupy', enabled: true }]
    : [{ action: 'scout', enabled: true }, { action: 'attack', enabled: true }, { action: 'occupy', enabled: false, reason: 'Defeat this garrison first.' }];
  if (object.kind === 'village') return object.state === 'defeated'
    ? [{ action: 'occupy', enabled: true }]
    : [{ action: 'attack', enabled: true }, { action: 'occupy', enabled: false, reason: 'Defeat this village first.' }];
  if (['farm', 'lumber', 'stone', 'oil'].includes(object.kind)) {
    if (object.currentCapacity !== undefined && object.currentCapacity <= 0) {
      return [{ action: 'gather', enabled: false, reason: 'This resource node is depleted.' }];
    }
  }
  return [{ action: 'gather', enabled: true }];
}

export function restoreWorld(value: string | null): WorldObject[] | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((object): object is WorldObject => {
      if (!object || typeof object !== 'object') return false;
      const candidate = object as Record<string, unknown>;
      const loot = candidate.loot;
      return typeof candidate.id === 'string' && WORLD_KINDS.includes(candidate.kind as WorldKind)
        && isWorldKindEnabled(candidate.kind as string)
        && typeof candidate.x === 'number' && Number.isFinite(candidate.x)
        && typeof candidate.z === 'number' && Number.isFinite(candidate.z)
        && !!loot && typeof loot === 'object' && typeof (loot as Record<string, unknown>).apple === 'number';
    }).map(object => {
      const savedState = (object as WorldObject).state;
      const state = ['available', 'defended', 'defeated'].includes(savedState) ? savedState : defaultWorldObjectState(object.kind);
      const isRes = ['farm', 'lumber', 'stone', 'oil'].includes(object.kind);
      const defaultCap = isRes ? (DEFAULT_RESOURCE_CAPACITIES[object.kind] ?? 500) : undefined;
      const candidate = object as Record<string, unknown>;
      const currentCapacity = typeof candidate.currentCapacity === 'number' && Number.isFinite(candidate.currentCapacity)
        ? Math.max(0, candidate.currentCapacity)
        : defaultCap;
      const maxCapacity = typeof candidate.maxCapacity === 'number' && Number.isFinite(candidate.maxCapacity)
        ? Math.max(1, candidate.maxCapacity)
        : defaultCap;
      const depletedAt = typeof candidate.depletedAt === 'number' ? candidate.depletedAt : undefined;
      const respawnAt = typeof candidate.respawnAt === 'number' ? candidate.respawnAt : undefined;

      // Villages were resource sites in older saves. Promote that legacy state to the new defended lifecycle.
      return {
        ...object,
        state: object.kind === 'village' && state === 'available' ? 'defended' : state,
        ...(isRes ? { currentCapacity, maxCapacity, depletedAt, respawnAt } : {}),
      };
    }).filter(object => {
      const isRes = ['farm', 'lumber', 'stone', 'oil'].includes(object.kind);
      // Depleted resource nodes must not remain in the active world
      if (isRes && object.currentCapacity !== undefined && object.currentCapacity <= 0) {
        return false;
      }
      return true;
    });
  } catch {
    return null;
  }
}

export type DepletedNodeEntry = {
  node: WorldObject;
  depletedAt: number;
  respawnAt: number;
};

export function restoreDepletedNodes(value: string | null): DepletedNodeEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DepletedNodeEntry => {
      return (
        item &&
        typeof item === 'object' &&
        item.node &&
        typeof (item.node as WorldObject).id === 'string' &&
        typeof item.depletedAt === 'number' &&
        typeof item.respawnAt === 'number'
      );
    });
  } catch {
    return [];
  }
}

export function serializeDepletedNodes(entries: DepletedNodeEntry[]): string {
  return JSON.stringify(entries);
}

/** Regenerate depleted resource nodes that have reached their respawn time. */
export function stepWorldResourceRespawn(objects: readonly WorldObject[], now: number): { objects: WorldObject[]; changed: boolean } {
  let changed = false;
  const next = objects.map(object => {
    if (['farm', 'lumber', 'stone', 'oil'].includes(object.kind) && object.respawnAt !== undefined && now >= object.respawnAt && (object.currentCapacity ?? 0) <= 0) {
      changed = true;
      const max = object.maxCapacity ?? DEFAULT_RESOURCE_CAPACITIES[object.kind] ?? 500;
      return {
        ...object,
        currentCapacity: max,
        depletedAt: undefined,
        respawnAt: undefined,
      };
    }
    return object;
  });
  return { objects: changed ? next : [...objects], changed };
}

// Spacing is empty ground between conservative circular object footprints.
export function generateWorld(settings: GenerationSettings, random = Math.random): WorldObject[] {
  const spacing = Number.isFinite(settings.spacing) ? Math.max(1, Math.min(50, settings.spacing)) : 8;
  const pending = WORLD_KINDS.flatMap(kind => Array.from({ length: Number.isFinite(settings.counts[kind]) ? Math.max(0, Math.min(100, Math.floor(settings.counts[kind]))) : 0 }, () => kind));
  // Shuffle types so scarce space does not always favor the first resource.
  for (let i = pending.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pending[i], pending[j]] = [pending[j], pending[i]];
  }
  const objects: WorldObject[] = [];
  for (const kind of pending) {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const x = (random() - 0.5) * (WORLD_WIDTH - WORLD_OBJECT_RADIUS * 2);
      const z = (random() - 0.5) * (WORLD_DEPTH - WORLD_OBJECT_RADIUS * 2);
      // Reserve the city island, walls and corner towers, even in overview mode.
      if (Math.abs(x) < GRID_WIDTH / 2 + 3 + WORLD_OBJECT_RADIUS + spacing && Math.abs(z) < GRID_DEPTH / 2 + 3 + WORLD_OBJECT_RADIUS + spacing) continue;
      if (objects.some(other => Math.hypot(x - other.x, z - other.z) < WORLD_OBJECT_RADIUS * 2 + spacing)) continue;
      let bossId: string | undefined;
      let bossName: string | undefined;
      if (kind === 'boss') {
        const boss = selectBossForSpawn(random);
        bossId = boss.id;
        bossName = boss.name;
      }
      const isRes = ['farm', 'lumber', 'stone', 'oil'].includes(kind);
      const cap = isRes ? (DEFAULT_RESOURCE_CAPACITIES[kind] ?? 500) : undefined;
      objects.push({
        id: `world-${objects.length}`,
        kind,
        x,
        z,
        state: defaultWorldObjectState(kind),
        loot: { apple: kind === 'village' || kind === 'garrison' ? 1 : 0 },
        ...(bossId ? { bossId, bossName } : {}),
        ...(cap !== undefined ? { currentCapacity: cap, maxCapacity: cap } : {}),
      });
      break;
    }
  }
  return objects;
}
