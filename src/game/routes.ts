import { Formation, FORMATION_ROWS } from './offense-formations';
import { WORLD_DEPTH, WORLD_WIDTH, WorldObject } from './world';
import { activeUnitGlobalStats, DEFAULT_UNIT_GLOBAL_STATS } from './unit-stats';

export const ROUTES_SAVE_KEY = 'axie-conquest-routes-v1';
export type Coordinate = { x: number; z: number };
export type Route = { origin: Coordinate; destination: Coordinate; points: Coordinate[]; distance: number };
export type WorldTarget = Coordinate & { id?: string; label?: string };
export type ScoutOrder = { id: string; kind: 'scout'; target: WorldTarget; route: Route; status: 'scouting' };
export type OffensiveMarchOrder = { id: string; kind: 'march'; target: WorldTarget; route: Route; formationIndex: number; status: 'marching'; formation?: Formation; cityName?: string; startedAt?: number; arrivesAt?: number };
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
      if (source.kind === 'march') {
        const formation = source.formation as Formation | undefined;
        if (!formation || !FORMATION_ROWS.every(row => Array.isArray(formation[row]) && formation[row].length <= 5 && formation[row].every(slot => slot && (slot.heroId === null || typeof slot.heroId === 'string') && (slot.military === null || slot.military === 'infantry' || slot.military === 'archer') && Number.isSafeInteger(slot.militaryCount) && slot.militaryCount >= 0))) return [];
        if (!isValidFormation(formation) || typeof source.startedAt !== 'number' || !Number.isFinite(source.startedAt) || typeof source.arrivesAt !== 'number' || !Number.isFinite(source.arrivesAt) || source.arrivesAt < source.startedAt) return [];
        return [{ id: source.id, kind: 'march', target, route, formationIndex: source.formationIndex as number, status: 'marching', formation, cityName: typeof source.cityName === 'string' ? source.cityName : 'City', startedAt: source.startedAt, arrivesAt: source.arrivesAt } as RouteOrder];
      }
      return [{ id: source.id, kind: 'scout', target, route, status: 'scouting' } as RouteOrder];
    });
  } catch { return []; }
}
export function createScoutOrder(target: WorldTarget): ScoutOrder { return { id: `scout-${Date.now()}`, kind: 'scout', target, route: createRoute(target), status: 'scouting' }; }
export function marchTravelTimeMs(route: Route, marchSpeed = activeUnitGlobalStats.marchSpeed): number { return Math.max(1000, route.distance / Math.max(0.1, marchSpeed) * 1000); }
export function formatDuration(ms: number): string { const totalSeconds = Math.max(0, Math.ceil(ms / 1000)); const hours = Math.floor(totalSeconds / 3600); const minutes = Math.floor(totalSeconds % 3600 / 60); const seconds = totalSeconds % 60; return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`; }
export function getMarchArrivalTime(target: Coordinate, now = Date.now()): number { return now + marchTravelTimeMs(createRoute(target)); }
export function createOffensiveMarchOrder(target: WorldTarget, formationIndex: number, formation: Formation, cityName: string, now = Date.now(), marchSpeed = DEFAULT_UNIT_GLOBAL_STATS.marchSpeed): OffensiveMarchOrder {
  if (!isValidFormation(formation)) throw new Error('Assign at least one Axie.');
  const route = createRoute(target);
  return { id: `march-${now}-${Math.random().toString(36).slice(2)}`, kind: 'march', target, route, formationIndex, status: 'marching', formation: structuredClone(formation), cityName, startedAt: now, arrivesAt: now + marchTravelTimeMs(route, marchSpeed) };
}
export function marchProgress(order: OffensiveMarchOrder, now: number): number {
  return Math.max(0, Math.min(1, (now - (order.startedAt ?? now)) / Math.max(1, (order.arrivesAt ?? now) - (order.startedAt ?? now))));
}
export function targetFromObject(object: WorldObject): WorldTarget { return { x: object.x, z: object.z, id: object.id, label: WORLD_LABELS[object.kind] }; }
const WORLD_LABELS: Record<WorldObject['kind'], string> = { farm: 'Farmstead', lumber: 'Lumber camp', stone: 'Stone quarry', oil: 'Oil field', boss: 'Chimera lair', village: 'Village', garrison: 'Garrison' };
