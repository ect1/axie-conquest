import { Troops, TroopKind } from './base';
import { Formation, FORMATION_ROWS, FORMATION_ROW_SIZES } from './offense-formations';
import { STARTER_HEROES } from './heroes';
import { Coordinate, createRoute, marchTravelTimeMs, normalizeCoordinate, restoreRouteOrders } from './routes';
import { WorldAction, WorldObject, getWorldObjectActions } from './world';

export const UNITS_SAVE_KEY = 'axie-conquest-units-v1';
export const UNIT_DEFINITIONS = {
  army: { capabilities: ['move', 'hold', 'return'] },
  scout: { capabilities: ['move', 'hold', 'return', 'scout'] },
} as const;
export type UnitKind = keyof typeof UNIT_DEFINITIONS;
export type UnitMember = { id: string; heroId?: string; troopKind?: TroopKind; count: number; offset: Coordinate; healthRatio?: number };
export type UnitActivity = { action: WorldAction; targetId: string; targetLabel: string };
export type UnitOrder = { kind: 'move' | 'return'; origin: Coordinate; destination: Coordinate; startedAt: number; arrivesAt: number; activity?: UnitActivity };
export type WorldUnit = {
  leaderId?: string | null;
  id: string; kind: UnitKind; ownerId: string; cityId: string; name: string;
  home: Coordinate; position: Coordinate; speed: number; members: UnitMember[];
  formationIndex?: number; order: UnitOrder | null; activity?: UnitActivity; status: 'holding' | 'moving' | 'returning' | 'home';
};
export function unitPosition(unit: WorldUnit, now: number): Coordinate {
  const o = unit.order;
  if (!o) return { ...unit.position };
  const p = Math.max(0, Math.min(1, (now - o.startedAt) / Math.max(1, o.arrivesAt - o.startedAt)));
  return { x: o.origin.x + (o.destination.x - o.origin.x) * p, z: o.origin.z + (o.destination.z - o.origin.z) * p };
}
export function settleUnit(unit: WorldUnit, now: number): WorldUnit {
  if (!unit.order || now < unit.order.arrivesAt) return unit;
  return { ...unit, position: { ...unit.order.destination }, activity: unit.order.kind === 'return' ? undefined : unit.order.activity, status: unit.order.kind === 'return' ? 'home' : 'holding', order: null };
}
export function commandUnit(unit: WorldUnit, kind: 'move' | 'hold' | 'return', now: number, destination?: Coordinate): WorldUnit {
  unit = settleUnit(unit, now);
  if (unit.status === 'home') throw new Error('Deploy a formation before moving it.');
  if (!(UNIT_DEFINITIONS[unit.kind].capabilities as readonly string[]).includes(kind)) throw new Error('Unit cannot perform this command.');
  const position = unitPosition(unit, now);
  const { activity: _activity, ...idleUnit } = unit;
  if (kind === 'hold') return { ...idleUnit, position, order: null, status: 'holding' };
  const target = normalizeCoordinate(kind === 'return' ? unit.home : destination);
  if (!target) throw new Error('Choose a valid destination.');
  const route = createRoute(target, position);
  return settleUnit({ ...idleUnit, position, status: kind === 'return' ? 'returning' : 'moving', order: { kind, origin: position, destination: target, startedAt: now, arrivesAt: now + (route.distance === 0 ? 0 : marchTravelTimeMs(route, unit.speed)) } }, now);
}
export function commandWorldAction(unit: WorldUnit, action: WorldAction, object: WorldObject, now: number): WorldUnit {
  unit = settleUnit(unit, now);
  const option = getWorldObjectActions(object).find(item => item.action === action);
  if (!option?.enabled) throw new Error(option?.reason || `${action} is unavailable for this target.`);
  if (action === 'scout' ? unit.kind !== 'scout' : unit.kind !== 'army') throw new Error(`${action === 'scout' ? 'A scout' : 'An army formation'} is required.`);
  const position = unitPosition(unit, now);
  // World markers meet at the target; tactical ranges stay inside the battle simulation.
  const destination = { x: object.x, z: object.z };
  const route = createRoute(destination, position);
  const activity: UnitActivity = { action, targetId: object.id, targetLabel: object.kind === 'garrison' ? 'Garrison' : object.kind === 'boss' ? 'Boss mob' : object.kind[0].toUpperCase() + object.kind.slice(1) };
  const { activity: _activity, ...idleUnit } = unit;
  return settleUnit({ ...idleUnit, position, status: 'moving', order: { kind: 'move', origin: position, destination, startedAt: now, arrivesAt: now + (route.distance === 0 ? 0 : marchTravelTimeMs(route, unit.speed)), activity } }, now);
}
export function formationMembers(formation: Formation): UnitMember[] {
  return FORMATION_ROWS.flatMap((row, rowIndex) => formation[row].flatMap((slot, column): UnitMember[] => {
    const offset = { x: (column - (FORMATION_ROW_SIZES[row] - 1) / 2) * 1.15, z: (1.5 - rowIndex) * 1.25 };
    if (slot.heroId) return [{ id: `${row}-${column}`, heroId: slot.heroId, count: 1, offset }];
    return slot.military && slot.militaryCount > 0 ? [{ id: `${row}-${column}`, troopKind: slot.military, count: slot.militaryCount, offset }] : [];
  }));
}
export function deploymentError(candidate: WorldUnit, units: readonly WorldUnit[], troops: Troops, now: number): string | null {
  const active = units.map(u => settleUnit(u, now)).filter(u => u.status !== 'home');
  if (active.some(u => u.cityId === candidate.cityId && candidate.formationIndex !== undefined && u.formationIndex === candidate.formationIndex)) return 'This formation is already deployed.';
  const heroes = candidate.members.flatMap(m => m.heroId ? [m.heroId] : []);
  if (new Set(heroes).size !== heroes.length || active.some(u => u.members.some(m => m.heroId && heroes.includes(m.heroId)))) return 'An assigned Axie is already deployed.';
  for (const kind of ['infantry', 'archer', 'scout'] as const) {
    const used = [...active.filter(u => u.cityId === candidate.cityId), candidate].flatMap(u => u.members).reduce((n, m) => n + (m.troopKind === kind ? m.count : 0), 0);
    if (used > troops[kind]) return `Not enough available ${kind} troops.`;
  }
  return null;
}
export function createArmy(formation: Formation, formationIndex: number, cityId: string, cityName: string, speed: number, id: string): WorldUnit {
  const members = formationMembers(formation);
  if (!members.some(m => m.heroId)) throw new Error('Assign at least one Axie.');
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('Invalid movement speed.');
  return { id, kind: 'army', ownerId: 'player', cityId, name: `${cityName} · Formation ${formationIndex + 1}`, home: { x: 0, z: 0 }, position: { x: 0, z: 0 }, speed, members, formationIndex, leaderId: formation.leader, order: null, status: 'holding' };
}
export function createScout(cityId: string, cityName: string, speed: number, id: string): WorldUnit {
  if (!Number.isFinite(speed) || speed <= 0) throw new Error('Invalid movement speed.');
  return { id, kind: 'scout', ownerId: 'player', cityId, name: `${cityName} · Scout`, home: { x: 0, z: 0 }, position: { x: 0, z: 0 }, speed, members: [{ id: 'scout', troopKind: 'scout', count: 1, offset: { x: 0, z: 0 } }], order: null, status: 'holding' };
}
export function deployUnit(candidate: WorldUnit, units: readonly WorldUnit[], troops: Troops, destination: Coordinate, now: number): WorldUnit {
  if (units.some(u => u.id === candidate.id)) throw new Error('Unit is already deployed.');
  const error = deploymentError(candidate, units, troops, now);
  if (error) throw new Error(error);
  return commandUnit(candidate, 'move', now, destination);
}
function validPoint(value: unknown): value is Coordinate {
  const point = normalizeCoordinate(value);
  return !!point && point.x === (value as Coordinate).x && point.z === (value as Coordinate).z;
}
/** Validate saves before they can reserve members or enter the renderer. */
export function restoreUnits(raw: string | null, troops: Troops, now: number): WorldUnit[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    const result: WorldUnit[] = [];
    for (const u of parsed as WorldUnit[]) {
      if (!u || !['army', 'scout'].includes(u.kind) || !['holding', 'moving', 'returning', 'home'].includes(u.status) || ![u.id, u.ownerId, u.cityId, u.name].every(v => typeof v === 'string' && v.length > 0) || result.some(v => v.id === u.id)) continue;
      if (!validPoint(u.home) || !validPoint(u.position) || !Number.isFinite(u.speed) || u.speed <= 0 || !Array.isArray(u.members) || !u.members.length) continue;
      if (u.formationIndex !== undefined && (!Number.isSafeInteger(u.formationIndex) || u.formationIndex < 0)) continue;
      if (u.members.some(m => !m || typeof m.id !== 'string' || !validPoint(m.offset) || !Number.isSafeInteger(m.count) || m.count <= 0 || (m.heroId ? m.count !== 1 || !!m.troopKind || !(typeof m.heroId === 'string' && (/^[1-9][0-9]{0,19}$/.test(m.heroId) || STARTER_HEROES.some(h => h.id === m.heroId))) : !['infantry', 'archer', 'scout'].includes(m.troopKind!)))) continue;
      if (new Set(u.members.map(m => m.id)).size !== u.members.length || (u.kind === 'army' && !u.members.some(m => m.heroId))) continue;
      if (u.members.some(m => m.healthRatio !== undefined && (!Number.isFinite(m.healthRatio) || m.healthRatio < 0 || m.healthRatio > 1))) continue;
      if (u.leaderId != null && !u.members.some(m => m.heroId === u.leaderId)) continue;
      if (u.order !== null) {
        const o = u.order;
        if (!o || !['move', 'return'].includes(o.kind) || !validPoint(o.origin) || !validPoint(o.destination) || !Number.isFinite(o.startedAt) || !Number.isFinite(o.arrivesAt) || o.arrivesAt < o.startedAt || u.status !== (o.kind === 'return' ? 'returning' : 'moving')) continue;
        if (o.activity && (!['scout', 'attack', 'gather', 'occupy'].includes(o.activity.action) || typeof o.activity.targetId !== 'string' || typeof o.activity.targetLabel !== 'string')) continue;
        if (o.kind === 'return' && (o.destination.x !== u.home.x || o.destination.z !== u.home.z)) continue;
      } else if (u.status !== 'home' && u.status !== 'holding') continue;
      if (u.activity && (!['scout', 'attack', 'gather', 'occupy'].includes(u.activity.action) || typeof u.activity.targetId !== 'string' || typeof u.activity.targetLabel !== 'string')) continue;
      const settled = settleUnit(u, now);
      if (settled.status === 'home') continue;
      if (!deploymentError(settled, result, troops, now)) result.push(settled);
    }
    return result;
  } catch { return []; }
}
/** Old duplicated marches are reconciled through the same reservation checks. */
export function migrateMarches(raw: string | null, cityId: string, troops: Troops, speed: number, now: number): WorldUnit[] {
  const units: WorldUnit[] = [];
  for (const order of restoreRouteOrders(raw)) {
    if (order.kind !== 'march' || !order.formation) continue;
    const unit = createArmy(order.formation, order.formationIndex, cityId, order.cityName || 'City', speed, order.id);
    units.push({ ...unit, status: 'moving', order: { kind: 'move', origin: order.route.origin, destination: order.target, startedAt: order.startedAt!, arrivesAt: order.arrivesAt! } });
  }
  return restoreUnits(JSON.stringify(units), troops, now);
}
