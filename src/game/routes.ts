import { Formation, FORMATION_ROWS } from './offense-formations';
import { WORLD_DEPTH, WORLD_WIDTH, WorldObject } from './world';

export const ROUTES_SAVE_KEY = 'axie-conquest-routes-v1';
export type Coordinate = { x: number; z: number };
export type Route = { origin: Coordinate; destination: Coordinate; points: Coordinate[]; distance: number };
export type WorldTarget = Coordinate & { id?: string; label?: string };
export type ScoutOrder = { id: string; kind: 'scout'; target: WorldTarget; route: Route; status: 'scouting' };
export type OffensiveMarchOrder = { id: string; kind: 'march'; target: WorldTarget; route: Route; formationIndex: number; status: 'marching' };
export type RouteOrder = ScoutOrder | OffensiveMarchOrder;

export function normalizeCoordinate(value: unknown): Coordinate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.x !== 'number' || typeof candidate.z !== 'number' || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.z)) return null;
  return { x: Math.max(-WORLD_WIDTH / 2, Math.min(WORLD_WIDTH / 2, candidate.x)), z: Math.max(-WORLD_DEPTH / 2, Math.min(WORLD_DEPTH / 2, candidate.z)) };
}
export function createRoute(destination: Coordinate, origin: Coordinate = { x: 0, z: 0 }): Route {
  const safe = normalizeCoordinate(destination)!;
  const distance = Math.hypot(safe.x - origin.x, safe.z - origin.z);
  return { origin, destination: safe, points: [origin, safe], distance: Math.round(distance * 10) / 10 };
}
export function hasAssignedAxie(formation: Formation): boolean {
  return FORMATION_ROWS.some(row => formation[row].some(slot => !!slot.heroId));
}
export function isValidFormation(formation: Formation | undefined): boolean { return !!formation && hasAssignedAxie(formation); }
export function restoreRouteOrders(value: string | null): RouteOrder[] {
  try {
    const parsed: unknown = JSON.parse(value || 'null');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const source = item as Record<string, unknown>;
      const target = normalizeCoordinate(source.target);
      if (!target || (source.kind !== 'scout' && source.kind !== 'march') || typeof source.id !== 'string') return [];
      if (source.kind === 'march' && (!Number.isSafeInteger(source.formationIndex) || (source.formationIndex as number) < 0)) return [];
      const route = createRoute(target);
      return [{ id: source.id, kind: source.kind, target: { ...target, label: typeof (source.target as Record<string, unknown>)?.label === 'string' ? (source.target as Record<string, unknown>).label as string : undefined }, route, ...(source.kind === 'march' ? { formationIndex: source.formationIndex as number, status: 'marching' as const } : { status: 'scouting' as const }) } as RouteOrder];
    });
  } catch { return []; }
}
export function createScoutOrder(target: WorldTarget): ScoutOrder { return { id: `scout-${Date.now()}`, kind: 'scout', target, route: createRoute(target), status: 'scouting' }; }
export function createOffensiveMarchOrder(target: WorldTarget, formationIndex: number): OffensiveMarchOrder { return { id: `march-${Date.now()}`, kind: 'march', target, route: createRoute(target), formationIndex, status: 'marching' }; }
export function targetFromObject(object: WorldObject): WorldTarget { return { x: object.x, z: object.z, id: object.id, label: WORLD_LABELS[object.kind] }; }
const WORLD_LABELS: Record<WorldObject['kind'], string> = { farm: 'Farmstead', lumber: 'Lumber camp', stone: 'Stone quarry', oil: 'Oil field', boss: 'Chimera lair', village: 'Village', garrison: 'Garrison' };
