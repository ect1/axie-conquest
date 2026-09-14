import { Troops } from './base';

export const OFFENSE_FORMATIONS_SAVE_KEY = 'axie-conquest-offense-formations-v1';
export const FORMATION_ROWS = ['front', 'mid', 'back', 'rear'] as const;
export const FORMATION_ROW_SIZES: Record<FormationRow, number> = { front: 4, mid: 5, back: 4, rear: 5 };
export type FormationRow = typeof FORMATION_ROWS[number];
export type FormationMilitaryKind = 'infantry' | 'archer';
export type FormationSlot = { heroId: string | null; military: FormationMilitaryKind | null; militaryCount: number };
export type Formation = { leader: string | null } & Record<FormationRow, FormationSlot[]>;

export function createEmptyFormation(): Formation {
  const slots = (count: number) => Array.from({ length: count }, (): FormationSlot => ({ heroId: null, military: null, militaryCount: 0 }));
  return { leader: null, front: slots(4), mid: slots(5), back: slots(4), rear: slots(5) };
}

export function createEmptyFormations(): Formation[] {
  return [createEmptyFormation(), createEmptyFormation(), createEmptyFormation()];
}

export function getFormationTroopCounts(formation: Formation): Pick<Troops, FormationMilitaryKind> {
  const result = { infantry: 0, archer: 0 };
  for (const row of FORMATION_ROWS) for (const slot of formation[row]) {
    if (slot.military) result[slot.military] += slot.militaryCount;
  }
  return result;
}

export function getFormationsTroopCounts(formations: readonly Formation[]): Pick<Troops, FormationMilitaryKind> {
  return formations.reduce((total, formation) => {
    const counts = getFormationTroopCounts(formation);
    total.infantry += counts.infantry;
    total.archer += counts.archer;
    return total;
  }, { infantry: 0, archer: 0 });
}

/** Restores only valid, currently available assignments. Invalid or stale entries become empty slots. */
export function restoreOffenseFormations(value: string | null, deployedIds: readonly string[], troops: Troops): Formation[] {
  const empty = createEmptyFormations();
  try {
    const saved: unknown = JSON.parse(value || 'null');
    if (!Array.isArray(saved)) return empty;
    const deployed = new Set(deployedIds);
    const usedTroops = { infantry: 0, archer: 0 };
    return empty.map((fallback, formationIndex) => {
      const source = saved[formationIndex];
      if (!source || typeof source !== 'object') return fallback;
      const usedHeroes = new Set<string>();
      const formation = { ...fallback };
      for (const row of FORMATION_ROWS) {
        const savedRow = Array.isArray((source as Record<string, unknown>)[row]) ? (source as Record<string, unknown[]>)[row] : [];
        formation[row] = fallback[row].map((emptySlot, slotIndex) => {
          const slot = savedRow[slotIndex];
          if (!slot || typeof slot !== 'object') return emptySlot;
          const heroId = (slot as Record<string, unknown>).heroId;
          if (typeof heroId === 'string' && deployed.has(heroId) && !usedHeroes.has(heroId)) {
            usedHeroes.add(heroId);
            return { ...emptySlot, heroId };
          }
          const military = (slot as Record<string, unknown>).military;
          const militaryCount = (slot as Record<string, unknown>).militaryCount;
          if ((military === 'infantry' || military === 'archer') && Number.isSafeInteger(militaryCount) && (militaryCount as number) > 0 && usedTroops[military] + (militaryCount as number) <= troops[military]) {
            usedTroops[military] += militaryCount as number;
            return { ...emptySlot, military, militaryCount: militaryCount as number };
          }
          return emptySlot;
        });
      }
      const leader = (source as Record<string, unknown>).leader;
      formation.leader = typeof leader === 'string' && usedHeroes.has(leader) ? leader : null;
      return formation;
    });
  } catch {
    return empty;
  }
}
