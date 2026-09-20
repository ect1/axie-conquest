import { EnemyMarch } from './portal';
import { CityDestructionConfig, getCityDestructionConfig } from './city-config';

export const CITY_HEALTH_SAVE_KEY = 'axie-conquest-city-health-v1';
export const UNITS_PRODUCED_SAVE_KEY = 'axie-conquest-units-produced-v1';

export type CityHealthState = {
  currentHealth: number;
  maxHealth: number;
  isGameOver: boolean;
  unitsProduced: number;
  highestPortalLevel: number;
  underAttack: boolean;
};

/**
 * Restores the persisted city health value or starts at maxHealth.
 */
export function restoreCityHealth(maxHealth: number, raw?: string | null): number {
  if (raw === null || raw === undefined || raw === '') return maxHealth;
  try {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return maxHealth;
    return Math.max(0, Math.min(maxHealth, Math.round(parsed)));
  } catch {
    return maxHealth;
  }
}

/**
 * Restores the total units produced count or starts at 0.
 */
export function restoreUnitsProduced(raw?: string | null): number {
  if (!raw) return 0;
  try {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.round(parsed);
  } catch {
    return 0;
  }
}

/**
 * Calculates the damage-per-second (DPS) dealt by an arrived hostile march against the city base.
 * Damage comes directly from formation attack power: count * attack * attackSpeed.
 */
export function calculateHostileMarchDps(march: EnemyMarch, damageMultiplier = 1.0): number {
  if (!march || !march.formation || !Array.isArray(march.formation.slots)) return 0;
  let totalDps = 0;
  for (const slot of march.formation.slots) {
    const count = slot.count ?? 1;
    const attack = slot.stats?.attack ?? 10;
    const attackSpeed = slot.stats?.attackSpeed ?? 1.0;
    totalDps += count * attack * attackSpeed * damageMultiplier;
  }
  return Math.max(0, Number(totalDps.toFixed(2)));
}

/**
 * Checks if a specific hostile march is currently engaged or being attacked by a player formation.
 * When engaged by a formation, this hostile damager's attack against the city stops.
 */
export function isMarchEngagedByFormation(
  march: EnemyMarch,
  battleSessions: readonly { id?: string; army?: { id: string }; target?: { id: string }; battle?: { result?: string | null } }[] = [],
  units: readonly { kind: string; activity?: { action?: string; targetId?: string }; order?: { activity?: { action?: string; targetId?: string } } | null }[] = []
): boolean {
  if (!march) return false;

  // 1. Hostile status is actively fighting
  if (march.status === 'fighting') return true;

  // 2. Active battle session has this hostile march as target or participant
  const activeSession = battleSessions.some(
    s => (s.target?.id === march.id || s.id === march.id) && !s.battle?.result
  );
  if (activeSession) return true;

  // 3. Player army formation is currently ordered to attack or actively attacking this march
  const armyAttacking = units.some(
    u =>
      u.kind === 'army' &&
      ((u.activity?.action === 'attack' && u.activity?.targetId === march.id) ||
       (u.order?.activity?.action === 'attack' && u.order?.activity?.targetId === march.id))
  );
  if (armyAttacking) return true;

  return false;
}

/**
 * Calculates the total city assault DPS from arrived hostile marches.
 * When multiple hostiles attack the city base, any hostile engaged/attacked by a player
 * formation deals 0 damage to the city, while any unengaged hostiles continue attacking.
 */
export function calculateCityAssaultDps(
  arrivedMarches: readonly EnemyMarch[],
  battleSessions: readonly { id?: string; army?: { id: string }; target?: { id: string }; battle?: { result?: string | null } }[] = [],
  units: readonly { kind: string; activity?: { action?: string; targetId?: string }; order?: { activity?: { action?: string; targetId?: string } } | null }[] = [],
  damageMultiplier = 1.0
): {
  totalDps: number;
  attackingMarches: EnemyMarch[];
  engagedMarches: EnemyMarch[];
} {
  let totalDps = 0;
  const attackingMarches: EnemyMarch[] = [];
  const engagedMarches: EnemyMarch[] = [];

  for (const march of arrivedMarches) {
    if (isMarchEngagedByFormation(march, battleSessions, units)) {
      engagedMarches.push(march);
    } else {
      attackingMarches.push(march);
      totalDps += calculateHostileMarchDps(march, damageMultiplier);
    }
  }

  return {
    totalDps: Math.max(0, Number(totalDps.toFixed(2))),
    attackingMarches,
    engagedMarches,
  };
}

/**
 * Applies incoming damage to the city base, clamping at 0.
 */
export function applyCityDamage(
  currentHealth: number,
  damage: number
): { currentHealth: number; isDestroyed: boolean } {
  const nextHealth = Math.max(0, Number((currentHealth - Math.max(0, damage)).toFixed(1)));
  return {
    currentHealth: nextHealth,
    isDestroyed: nextHealth <= 0,
  };
}

/**
 * Calculates the final player score displayed on Game Over.
 */
export function calculateGameOverScore(portalLevel: number, unitsProduced: number): number {
  const levelScore = Math.max(1, portalLevel) * 1000;
  const unitScore = Math.max(0, unitsProduced) * 100;
  return levelScore + unitScore;
}

let cachedCityHealthState: CityHealthState | null = null;

export function getCachedCityHealthState(): CityHealthState | null {
  return cachedCityHealthState;
}

export function setCachedCityHealthState(state: CityHealthState | null): void {
  cachedCityHealthState = state;
}

/**
 * Synchronous reset callback for city defense module cache.
 */
export function resetCityDefense(): void {
  cachedCityHealthState = null;
}
