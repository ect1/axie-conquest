export const GRID_WIDTH = 40;
export const GRID_DEPTH = 20;
export const FOOTPRINT = 4;
export const BUILDING_DEFINITIONS = {
  oil: { name: 'Oil Barrel', category: 'Storage', icon: '\u{1F6E2}', description: 'A sturdy oil barrel on a timber platform, storing supplies for the growing settlement.' },
  training: { name: 'Training Ground', category: 'Military', icon: '\u2694', description: 'An open practice yard where Axies drill and prepare to defend Lunacia. A settlement structure; troop training unlocks at the Barracks and Archery Range.' },
  hall: { name: 'Main Hall', category: 'City center', icon: '\u2302', description: 'The heart of your settlement. Your Axies gather here to plan a brighter Lunacia.' },
  farm: { name: 'Everleaf Farm', category: 'Resource', icon: '\u{1F33E}', description: 'A little patch of abundance, tended by the Axies of Everleaf.' },
  lumber: { name: 'Lumber Mill', category: 'Resource', icon: '\u{1FAB5}', description: 'Axie woodworkers prepare timber to help Everleaf grow.' },
  stone: { name: 'Stone Works', category: 'Resource', icon: '🪨', description: 'Axie stonecutters quarry stone and securely store supplies to help Everleaf grow.' },
  quarry: { name: 'Quarry', category: 'Resource', icon: '\u26CF', description: 'Axie stonecutters uncover the foundations of a growing settlement.' },
  barracks: { name: 'Barracks', category: 'Military', icon: '\u2694', description: 'A gathering ground for the defenders of Everleaf.' },
  tavern: { name: 'Tavern', category: 'Community', icon: '\u{1F37A}', description: 'A warm hearth where Axies share stories and forge friendships.' },
  scout: { name: 'Scout Lodge', category: 'Exploration', icon: '\u{1F9ED}', description: 'A lookout for explorers preparing to chart the paths of Lunacia.' },
  archery: { name: 'Archery Range', category: 'Military', icon: '\u{1F3F9}', description: 'A practice yard for the sharp-eyed defenders of the settlement.' },
  road: { name: 'Lunacian Road', category: 'Infrastructure', icon: '\u{1F6E3}', description: 'A sturdy stone way that connects Axies, homes, and gathering places.' },
  hospital: { name: 'Healing Lodge', category: 'Community', icon: '\u2695', description: 'A gentle refuge where healer Axies tend to wounded friends and restore their strength.' },
} as const;
export type BuildingKind = keyof typeof BUILDING_DEFINITIONS;
export type BuildableKind = Exclude<BuildingKind, 'hall'>;
export const BUILDABLE_KINDS: BuildableKind[] = ['farm', 'lumber', 'stone', 'quarry', 'barracks', 'tavern', 'scout', 'archery', 'road', 'hospital', 'training', 'oil'];
export function getBuildingFootprint(kind: BuildingKind): number {
  return kind === 'road' ? 1 : FOOTPRINT;
}
export function getBuildingDimensions(kind: BuildingKind, rotation: 0 | 1 | 2 | 3 = 0): { width: number; depth: number } {
  return kind === 'road' && rotation % 2 === 0 ? { width: 4, depth: 1 } : kind === 'road' ? { width: 1, depth: 4 } : { width: FOOTPRINT, depth: FOOTPRINT };
}
export function isBuildableKind(value: unknown): value is BuildableKind {
  return typeof value === 'string' && BUILDABLE_KINDS.includes(value as BuildableKind);
}
export type Building = { id: string; kind: BuildingKind; x: number; z: number; rotation?: 0 | 1 | 2 | 3; level?: number };
export type Cell = { x: number; z: number };
export const MAIN_HALL: Building = { id: 'main-hall', kind: 'hall', x: (GRID_WIDTH - FOOTPRINT) / 2, z: (GRID_DEPTH - FOOTPRINT) / 2 };
export function canPlace(cell: Cell, buildings: Building[], width = FOOTPRINT, depth = width): boolean {
  return Number.isInteger(cell.x) && Number.isInteger(cell.z) && cell.x >= 0 && cell.z >= 0 &&
    cell.x + width <= GRID_WIDTH && cell.z + depth <= GRID_DEPTH &&
    !buildings.some(b => { const size = getBuildingDimensions(b.kind, b.rotation); return cell.x < b.x + size.width && cell.x + width > b.x && cell.z < b.z + size.depth && cell.z + depth > b.z; });
}
export function restoreBuildings(value: string | null, transposeLegacy = false): Building[] {
  const result: Building[] = [{ ...MAIN_HALL }];
  try {
    const entries: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(entries)) return result;
    const rotation = (entry: { rotation?: unknown }): Pick<Building, 'rotation'> =>
      entry.rotation === 0 || entry.rotation === 1 || entry.rotation === 2 || entry.rotation === 3 ? { rotation: entry.rotation } : {};
    const level = (entry: { level?: unknown }): Pick<Building, 'level'> =>
      typeof entry?.level === 'number' && Number.isInteger(entry.level) && entry.level >= 1 && entry.level <= 3 ? { level: entry.level } : {};
    // Restore the unique hall first so its current footprint is reserved, regardless of save order.
    if (!transposeLegacy) {
      const hall = entries.find(entry => entry?.kind === 'hall' && entry.id === MAIN_HALL.id && canPlace(entry, []));
      if (hall) result[0] = { ...MAIN_HALL, x: hall.x, z: hall.z, ...rotation(hall), ...level(hall) };
    }
    for (const saved of entries) {
      const entry = saved && transposeLegacy ? { ...saved, x: saved.z, z: saved.x } : saved;
      if (entry && isBuildableKind(entry.kind) && typeof entry.id === 'string' && !result.some(b => b.id === entry.id) && canPlace(entry, result, getBuildingDimensions(entry.kind, rotation(entry).rotation).width, getBuildingDimensions(entry.kind, rotation(entry).rotation).depth)) {
        result.push({ id: entry.id, kind: entry.kind, x: entry.x, z: entry.z, ...rotation(entry), ...level(entry) });
      }
    }
  } catch { /* An invalid save starts a fresh settlement. */ }
  return result;
}

export function canMoveBuilding(id: string, cell: Cell, buildings: Building[]): boolean {
  const building = buildings.find(b => b.id === id);
  const size = building && getBuildingDimensions(building.kind, building.rotation);
  return !!building && !!size && canPlace(cell, buildings.filter(b => b.id !== id), size.width, size.depth);
}
export function moveBuilding(id: string, cell: Cell, buildings: Building[]): Building[] | null {
  if (!canMoveBuilding(id, cell, buildings)) return null;
  return buildings.map(b => b.id === id ? { ...b, x: cell.x, z: cell.z } : b);
}
export function removeBuilding(id: string, buildings: Building[]): Building[] | null {
  const building = buildings.find(b => b.id === id);
  return building && building.kind !== 'hall' ? buildings.filter(b => b.id !== id) : null;
}

export function rotateBuilding(id: string, buildings: Building[]): Building[] | null {
  if (!buildings.some(b => b.id === id)) return null;
  return buildings.map(b => b.id === id ? { ...b, rotation: ((b.rotation ?? 0) + 1) % 4 as 0 | 1 | 2 | 3 } : b);
}

export const TROOP_DEFINITIONS = {
  infantry: { name: 'Infantry', building: 'barracks', icon: '\u2694', description: 'Frontline defenders of Everleaf.' },
  archer: { name: 'Archers', building: 'archery', icon: '\u{1F3F9}', description: 'Ranged support for your formations.' },
  scout: { name: 'Scouts', building: 'scout', icon: '\u{1F9ED}', description: 'Explorers for the paths of Lunacia.' },
} as const;
export type TroopKind = keyof typeof TROOP_DEFINITIONS;
export type Troops = Record<TroopKind, number>;
export const TROOP_KINDS: TroopKind[] = ['infantry', 'archer', 'scout'];
export const TRAINABLE_TROOP_KINDS: TroopKind[] = ['infantry', 'archer'];
export const TRAINING_BATCH = 10;
export const EMPTY_TROOPS: Troops = { infantry: 0, archer: 0, scout: 0 };
export function canTrain(kind: TroopKind, buildings: Building[]): boolean {
  return TRAINABLE_TROOP_KINDS.includes(kind) && buildings.some(b => b.kind === TROOP_DEFINITIONS[kind].building);
}
export function trainTroops(kind: TroopKind, buildings: Building[], troops: Troops): Troops | null {
  if (!canTrain(kind, buildings) || troops[kind] > Number.MAX_SAFE_INTEGER - TRAINING_BATCH) return null;
  return { ...troops, [kind]: troops[kind] + TRAINING_BATCH };
}
export function restoreTroops(value: string | null): Troops {
  const troops = { ...EMPTY_TROOPS };
  try {
    const saved = JSON.parse(value || '{}');
    for (const kind of TROOP_KINDS) {
      if (Number.isSafeInteger(saved?.[kind]) && saved[kind] >= 0) troops[kind] = saved[kind];
    }
  } catch { /* Invalid troop saves start with an empty army. */ }
  return troops;
}
