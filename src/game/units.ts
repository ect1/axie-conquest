import { Troops, TroopKind } from './base';
import { Formation } from './offense-formations';
import { STARTER_HEROES } from './heroes';
import { Coordinate, createRoute, marchTravelTimeMs, normalizeCoordinate, restoreRouteOrders } from './routes';
import { WorldAction, WorldObject, getWorldObjectActions } from './world';
import { CityResourceKind } from './cities';
import { activeBattleSettings } from './battle-settings';
import { getEndBattleConfig } from './game-config';

export const UNITS_SAVE_KEY = 'axie-conquest-units-v1';
export const UNIT_DEFINITIONS = {
  army: { capabilities: ['move', 'hold', 'return'] },
  scout: { capabilities: ['move', 'hold', 'return', 'scout'] },
} as const;
export type UnitKind = keyof typeof UNIT_DEFINITIONS;
export type UnitCargo = { resource: CityResourceKind; amount: number; maxLoad: number };
export type UnitMember = { id: string; heroId?: string; troopKind?: TroopKind | 'soldier'; count: number; offset: Coordinate; healthRatio?: number };
export type UnitActivity = { action: WorldAction; targetId: string; targetLabel: string };
export type UnitOrder = { kind: 'move' | 'return'; origin: Coordinate; destination: Coordinate; startedAt: number; arrivesAt: number; activity?: UnitActivity };
export type WorldUnit = {
  leaderId?: string | null;
  id: string; kind: UnitKind; ownerId: string; cityId: string; name: string;
  home: Coordinate; position: Coordinate; speed: number; members: UnitMember[];
  formationIndex?: number; order: UnitOrder | null; activity?: UnitActivity;
  status: 'holding' | 'moving' | 'returning' | 'retreating' | 'home' | 'gathering';
  /** Temporary protection applied when a manual retreat crosses the battle boundary. */
  targetableAt?: number;
  controllableAt?: number;
  cargo?: UnitCargo;
  repeatGather?: boolean;
  gatherTargetId?: string;
};
export function unitPosition(unit: WorldUnit, now: number): Coordinate {
  const o = unit.order;
  if (!o) return { ...unit.position };
  const p = Math.max(0, Math.min(1, (now - o.startedAt) / Math.max(1, o.arrivesAt - o.startedAt)));
  return { x: o.origin.x + (o.destination.x - o.origin.x) * p, z: o.origin.z + (o.destination.z - o.origin.z) * p };
}
export function settleUnit(unit: WorldUnit, now: number): WorldUnit {
  if (!unit.order || now < unit.order.arrivesAt) return unit;
  const isReturn = unit.order.kind === 'return';
  const isGather = unit.order.activity?.action === 'gather';
  const nextStatus: WorldUnit['status'] = isReturn ? 'home' : (isGather ? 'gathering' : 'holding');
  return {
    ...unit,
    position: { ...unit.order.destination },
    activity: isReturn ? undefined : unit.order.activity,
    status: nextStatus,
    order: null,
    targetableAt: undefined,
    controllableAt: undefined,
  };
}
export function isUnitTargetable(unit: WorldUnit, now = Date.now()): boolean {
  if (unit.targetableAt !== undefined && now < unit.targetableAt) return false;
  return !(unit.status === 'retreating' && getEndBattleConfig().retreat.untargetable);
}
export function isUnitControllable(unit: WorldUnit, now = Date.now()): boolean {
  return unit.controllableAt === undefined || now >= unit.controllableAt;
}
export function commandUnit(unit: WorldUnit, kind: 'move' | 'hold' | 'return', now: number, destination?: Coordinate, cancelRepeat = false): WorldUnit {
  unit = settleUnit(unit, now);
  if (unit.status === 'home') throw new Error('Deploy a formation before moving it.');
  if (!isUnitControllable(unit, now)) {
    throw new Error('This formation is still recovering from retreat and cannot receive orders yet.');
  }
  if (unit.status === 'retreating' && getEndBattleConfig().retreat.unmarchable) {
    throw new Error('This formation is retreating and cannot receive orders until it reaches base.');
  }
  if (!(UNIT_DEFINITIONS[unit.kind].capabilities as readonly string[]).includes(kind)) throw new Error('Unit cannot perform this command.');
  const position = unitPosition(unit, now);
  const { activity: _activity, ...idleUnit } = unit;
  const repeatGather = cancelRepeat ? false : (kind === 'return' ? (unit.repeatGather ?? false) : false);
  const gatherTargetId = cancelRepeat || kind !== 'return' ? undefined : unit.gatherTargetId;
  if (kind === 'hold') return { ...idleUnit, position, order: null, status: 'holding', repeatGather: false, gatherTargetId: undefined };
  const target = normalizeCoordinate(kind === 'return' ? unit.home : destination);
  if (!target) throw new Error('Choose a valid destination.');
  const route = createRoute(target, position);
  return settleUnit({
    ...idleUnit,
    position,
    status: kind === 'return' ? 'returning' : 'moving',
    repeatGather,
    gatherTargetId,
    order: { kind, origin: position, destination: target, startedAt: now, arrivesAt: now + (route.distance === 0 ? 0 : marchTravelTimeMs(route, unit.speed)) }
  }, now);
}
export function commandWorldAction(unit: WorldUnit, action: WorldAction, object: WorldObject, now: number): WorldUnit {
  unit = settleUnit(unit, now);
  if (!isUnitControllable(unit, now)) {
    throw new Error('This formation is still recovering from retreat and cannot receive orders yet.');
  }
  if (unit.status === 'retreating' && getEndBattleConfig().retreat.unmarchable) {
    throw new Error('This formation is retreating and cannot receive orders until it reaches base.');
  }
  const option = getWorldObjectActions(object).find(item => item.action === action);
  if (!option?.enabled) throw new Error(option?.reason || `${action} is unavailable for this target.`);
  if (action === 'scout' ? unit.kind !== 'scout' : unit.kind !== 'army') throw new Error(`${action === 'scout' ? 'A scout' : 'An army formation'} is required.`);
  if (action === 'gather' && unit.cargo && unit.cargo.amount > 0) {
    throw new Error(`${unit.name} is carrying ${Math.round(unit.cargo.amount)} ${unit.cargo.resource}! Return to base to deposit resources first.`);
  }
  const position = unitPosition(unit, now);
  // World markers meet at the target; tactical ranges stay inside the battle simulation.
  const destination = { x: object.x, z: object.z };
  const route = createRoute(destination, position);
  const activity: UnitActivity = { action, targetId: object.id, targetLabel: object.bossName ?? (object.kind === 'garrison' ? 'Garrison' : object.kind === 'boss' ? 'Boss mob' : object.kind[0].toUpperCase() + object.kind.slice(1)) };
  const { activity: _activity, ...idleUnit } = unit;
  const isGather = action === 'gather';
  return settleUnit({
    ...idleUnit,
    position,
    status: 'moving',
    repeatGather: isGather ? true : undefined,
    gatherTargetId: isGather ? object.id : undefined,
    order: { kind: 'move', origin: position, destination, startedAt: now, arrivesAt: now + (route.distance === 0 ? 0 : marchTravelTimeMs(route, unit.speed)), activity }
  }, now);
}
export function formationMembers(formation: Formation): UnitMember[] {
  const slots = formation.assignments;
  const centerColumn = slots.length ? (Math.min(...slots.map(slot => slot.column)) + Math.max(...slots.map(slot => slot.column))) / 2 : 0;
  const centerRow = slots.length ? (Math.min(...slots.map(slot => slot.row)) + Math.max(...slots.map(slot => slot.row))) / 2 : 0;
  return slots.flatMap<UnitMember>(slot => {
    const offset = { x: (slot.column - centerColumn) * 1.15 + (slot.row % 2 ? .575 : 0), z: (centerRow - slot.row) * 1.25 };
    const id = `hex-${slot.row}-${slot.column}`;
    if (slot.heroId) return [{ id, heroId: slot.heroId, count: 1, offset, ...(slot.healthRatio !== undefined ? { healthRatio: slot.healthRatio } : {}) }];
    return slot.military && slot.militaryCount > 0
      ? [{ id, troopKind: slot.military, count: slot.militaryCount, offset, ...(slot.healthRatio !== undefined ? { healthRatio: slot.healthRatio } : {}) }]
      : [];
  });
}

/**
 * Computes the overall formation body radius for a player unit.
 * Accounts for member slot offsets and the active unit body radius.
 */
export function getUnitFormationBodyRadius(unit: WorldUnit): number {
  const memberRadius = (activeBattleSettings?.bodyRadius ?? 0.5) * (activeBattleSettings?.bodyRadiusMultiplier ?? 1.0);
  if (!unit.members || unit.members.length === 0) {
    return memberRadius * 2;
  }
  let maxOffsetDist = 0;
  for (const member of unit.members) {
    const dist = Math.hypot(member.offset.x, member.offset.z);
    if (dist > maxOffsetDist) {
      maxOffsetDist = dist;
    }
  }
  return maxOffsetDist + memberRadius;
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
      if (!u || !['army', 'scout'].includes(u.kind) || !['holding', 'moving', 'returning', 'retreating', 'home', 'gathering'].includes(u.status) || ![u.id, u.ownerId, u.cityId, u.name].every(v => typeof v === 'string' && v.length > 0) || result.some(v => v.id === u.id)) continue;
      if (!validPoint(u.home) || !validPoint(u.position) || !Number.isFinite(u.speed) || u.speed <= 0 || !Array.isArray(u.members) || !u.members.length) continue;
      if (u.formationIndex !== undefined && (!Number.isSafeInteger(u.formationIndex) || u.formationIndex < 0)) continue;
      if (u.members.some(m => !m || typeof m.id !== 'string' || !validPoint(m.offset) || !Number.isSafeInteger(m.count) || m.count <= 0 || (m.heroId ? m.count !== 1 || !!m.troopKind || !(typeof m.heroId === 'string' && (/^[1-9][0-9]{0,19}$/.test(m.heroId) || STARTER_HEROES.some(h => h.id === m.heroId))) : !['infantry', 'archer', 'scout'].includes(m.troopKind!)))) continue;
      if (new Set(u.members.map(m => m.id)).size !== u.members.length || (u.kind === 'army' && !u.members.some(m => m.heroId))) continue;
      if (u.members.some(m => m.healthRatio !== undefined && (!Number.isFinite(m.healthRatio) || m.healthRatio < 0 || m.healthRatio > 1))) continue;
      if (u.leaderId != null && !u.members.some(m => m.heroId === u.leaderId)) continue;
      if (u.cargo !== undefined) {
        if (typeof u.cargo !== 'object' || u.cargo === null || !['food', 'wood', 'stone', 'warSupplies'].includes(u.cargo.resource) || !Number.isFinite(u.cargo.amount) || u.cargo.amount < 0 || !Number.isFinite(u.cargo.maxLoad) || u.cargo.maxLoad <= 0) continue;
      }
      if (u.order !== null) {
        const o = u.order;
        const expectedMovingStatus = o.kind === 'return' ? (u.status === 'retreating' ? 'retreating' : 'returning') : 'moving';
        if (!o || !['move', 'return'].includes(o.kind) || !validPoint(o.origin) || !validPoint(o.destination) || !Number.isFinite(o.startedAt) || !Number.isFinite(o.arrivesAt) || o.arrivesAt < o.startedAt || u.status !== expectedMovingStatus) continue;
        if (o.activity && (!['scout', 'attack', 'gather', 'occupy'].includes(o.activity.action) || typeof o.activity.targetId !== 'string' || typeof o.activity.targetLabel !== 'string')) continue;
        if (o.kind === 'return' && (o.destination.x !== u.home.x || o.destination.z !== u.home.z)) continue;
      } else if (u.status !== 'home' && u.status !== 'holding' && u.status !== 'retreating' && u.status !== 'gathering') continue;
      if (u.activity && (!['scout', 'attack', 'gather', 'occupy'].includes(u.activity.action) || typeof u.activity.targetId !== 'string' || typeof u.activity.targetLabel !== 'string')) continue;
      const settled = settleUnit(u, now);
      if (settled.status === 'home') continue;
      if (!deploymentError(settled, result, troops, now)) {
        result.push({
          ...settled,
          repeatGather: typeof u.repeatGather === 'boolean' ? u.repeatGather : undefined,
          gatherTargetId: typeof u.gatherTargetId === 'string' ? u.gatherTargetId : undefined,
        });
      }
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
