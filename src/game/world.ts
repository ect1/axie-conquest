import { GRID_WIDTH, GRID_DEPTH } from './base';
import { getBossConfig, selectBossForSpawn } from './bosses';

export const WORLD_WIDTH = 200;
export const WORLD_DEPTH = 200;
export const WORLD_OBJECT_RADIUS = 3;
export const WORLD_SAVE_KEY = 'axie-conquest-world-v1';
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
export type WorldObject = { id: string; kind: WorldKind; x: number; z: number; state: WorldObjectState; loot: { apple: number }; bossId?: string; bossName?: string };
export type SpawnableMobGroup = 'chimera-pack';
export const SPAWNABLE_MOB_GROUPS: Record<SpawnableMobGroup, { label: string; kind: 'boss' }> = {
  'chimera-pack': { label: 'Chimera pack', kind: 'boss' },
};
export const DEFAULT_GENERATION: GenerationSettings = {
  counts: Object.fromEntries(WORLD_KINDS.map(kind => [kind, WORLD_DEFINITIONS[kind].count])) as Record<WorldKind, number>,
  spacing: 8,
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
        && typeof candidate.x === 'number' && Number.isFinite(candidate.x)
        && typeof candidate.z === 'number' && Number.isFinite(candidate.z)
        && !!loot && typeof loot === 'object' && typeof (loot as Record<string, unknown>).apple === 'number';
    }).map(object => {
      const savedState = (object as WorldObject).state;
      const state = ['available', 'defended', 'defeated'].includes(savedState) ? savedState : defaultWorldObjectState(object.kind);
      // Villages were resource sites in older saves. Promote that legacy state to the new defended lifecycle.
      return { ...object, state: object.kind === 'village' && state === 'available' ? 'defended' : state };
    });
  } catch {
    return null;
  }
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
      objects.push({
        id: `world-${objects.length}`,
        kind,
        x,
        z,
        state: defaultWorldObjectState(kind),
        loot: { apple: kind === 'village' || kind === 'garrison' ? 1 : 0 },
        ...(bossId ? { bossId, bossName } : {}),
      });
      break;
    }
  }
  return objects;
}
