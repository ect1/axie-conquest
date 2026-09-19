import { CityResourceKind } from './cities';
import { WorldKind, WorldObject } from './world';
import { UnitMember, WorldUnit } from './units';
import { STARTER_HEROES } from './heroes';
import { ApiAxie } from './axie-roster';
import { getResourceNodeConfig } from './resource-spawn-config';

import {
  getTroopLoadWeights,
  calculateArmyLoadCapacity as calcLoadCapacity,
  calculateGatherRate as calcGatherRate,
  calculateArmyGatherRate as calcArmyGatherRate,
} from './stats-config';

export const TROOP_LOAD_WEIGHTS = getTroopLoadWeights();

export const RESOURCE_NODE_KINDS: readonly WorldKind[] = ['farm', 'lumber', 'stone', 'oil'] as const;

export function isResourceNode(kind: WorldKind | string): boolean {
  return (RESOURCE_NODE_KINDS as readonly string[]).includes(kind);
}

export function nodeKindToCityResource(nodeKind: WorldKind | string): CityResourceKind | null {
  switch (nodeKind) {
    case 'farm':
      return 'food';
    case 'lumber':
      return 'wood';
    case 'stone':
      return 'stone';
    default:
      return null;
  }
}

export function getLeaderClass(leaderId?: string | null, apiAxies?: readonly ApiAxie[]): string | undefined {
  if (!leaderId) return undefined;
  if (apiAxies?.length) {
    const axie = apiAxies.find(a => a.id === leaderId);
    if (axie?.class) return axie.class.toLowerCase();
  }
  const starter = STARTER_HEROES.find(h => h.id === leaderId);
  return starter?.class?.toLowerCase();
}

/**
 * Calculates the total resource carrying capacity for an army.
 * Configured in src/game/config/stats-config.yml
 */
export function calculateArmyLoadCapacity(members: readonly UnitMember[], leaderClass?: string): number {
  return calcLoadCapacity(members, leaderClass);
}

/**
 * Calculates the effective gathering rate (resources per second) for a node,
 * taking into account both the node base rate and per-unit troop contributions.
 * Configured in src/game/config/stats-config.yml
 */
export function calculateGatherRate(nodeKind: WorldKind | string, baseRate: number, leaderClass?: string): number {
  const rate = calcGatherRate(nodeKind, baseRate, leaderClass);
  return Math.max(0.5, Number(rate.toFixed(2)));
}

/**
 * Calculates the total effective gather rate for an army at a node.
 * Combines node base rate + per-unit troop contributions + Axie class multipliers.
 */
export function calculateArmyGatherRate(
  nodeKind: WorldKind | string,
  nodeBaseRate: number,
  members: readonly UnitMember[],
  leaderClass?: string
): number {
  const rate = calcArmyGatherRate(nodeKind, nodeBaseRate, members, leaderClass);
  return Math.max(0.5, Number(rate.toFixed(2)));
}

export type StepGatheringResult = {
  updatedUnit: WorldUnit;
  updatedNode: WorldObject;
  gatheredAmount: number;
  isFull: boolean;
  isDepleted: boolean;
};

/**
 * Steps gathering progress for a unit at a world resource node over elapsed time.
 */
export function stepUnitGathering(
  unit: WorldUnit,
  node: WorldObject,
  deltaMs: number,
  now: number,
  leaderClass?: string
): StepGatheringResult {
  const resource = nodeKindToCityResource(node.kind);
  if (!resource) {
    return { updatedUnit: unit, updatedNode: node, gatheredAmount: 0, isFull: false, isDepleted: false };
  }

  const nodeCfg = getResourceNodeConfig(node.kind);
  const maxNodeCapacity = node.maxCapacity ?? nodeCfg?.capacity ?? 500;
  const currentNodeCapacity = node.currentCapacity !== undefined ? node.currentCapacity : maxNodeCapacity;

  if (currentNodeCapacity <= 0) {
    const depletedNode: WorldObject = {
      ...node,
      currentCapacity: 0,
      maxCapacity: maxNodeCapacity,
      depletedAt: node.depletedAt ?? now,
      respawnAt: node.respawnAt ?? (now + (nodeCfg?.respawnTimerSeconds ?? 300) * 1000),
    };
    return {
      updatedUnit: unit,
      updatedNode: depletedNode,
      gatheredAmount: 0,
      isFull: false,
      isDepleted: true,
    };
  }

  const maxLoad = unit.cargo?.maxLoad ?? calculateArmyLoadCapacity(unit.members, leaderClass);
  const currentAmount = unit.cargo?.amount ?? 0;
  const loadSpace = Math.max(0, maxLoad - currentAmount);

  if (loadSpace <= 0) {
    return {
      updatedUnit: unit,
      updatedNode: node,
      gatheredAmount: 0,
      isFull: true,
      isDepleted: false,
    };
  }

  const baseRate = nodeCfg?.gatherRatePerSecond ?? 5;
  const effectiveRate = calculateArmyGatherRate(node.kind, baseRate, unit.members, leaderClass);
  const desiredGather = effectiveRate * (deltaMs / 1000);
  const actualGather = Math.min(desiredGather, loadSpace, currentNodeCapacity);

  const newCargoAmount = currentAmount + actualGather;
  const newNodeCapacity = Math.max(0, currentNodeCapacity - actualGather);
  const isDepleted = newNodeCapacity <= 0;
  const isFull = newCargoAmount >= maxLoad;

  const updatedNode: WorldObject = {
    ...node,
    currentCapacity: Number(newNodeCapacity.toFixed(2)),
    maxCapacity: maxNodeCapacity,
    ...(isDepleted
      ? {
          depletedAt: now,
          respawnAt: now + (nodeCfg?.respawnTimerSeconds ?? 300) * 1000,
        }
      : {}),
  };

  const updatedUnit: WorldUnit = {
    ...unit,
    status: 'gathering',
    cargo: {
      resource,
      amount: Number(newCargoAmount.toFixed(2)),
      maxLoad,
    },
  };

  return {
    updatedUnit,
    updatedNode,
    gatheredAmount: actualGather,
    isFull,
    isDepleted,
  };
}
