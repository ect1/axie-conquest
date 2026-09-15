import { Troops } from './base';

/** v1 used four hard-coded rows. v2 is the only writable formation format. */
export const OFFENSE_FORMATIONS_SAVE_KEY = 'axie-conquest-offense-formations-v2';
export const LEGACY_OFFENSE_FORMATIONS_SAVE_KEY = 'axie-conquest-offense-formations-v1';
export type FormationMilitaryKind = 'infantry' | 'archer';
export type FormationSlot = { heroId: string | null; military: FormationMilitaryKind | null; militaryCount: number };
export type FormationAssignment = FormationSlot & { row: number; column: number };
export type Formation = { leader: string | null; assignments: FormationAssignment[] };
export type FormationGrid = { columns: number; rows: number };
export const DEFAULT_FORMATION_GRID: FormationGrid = { columns: 5, rows: 3 };

export function createEmptyFormation(): Formation { return { leader: null, assignments: [] }; }
export function createEmptyFormations(): Formation[] { return [createEmptyFormation(), createEmptyFormation(), createEmptyFormation()]; }
export function formationSlotId(row: number, column: number): string { return `${row}:${column}`; }
export function formationAssignment(formation: Formation, row: number, column: number): FormationSlot { return formation.assignments.find(slot => slot.row === row && slot.column === column) ?? { heroId: null, military: null, militaryCount: 0 }; }
export function formationSlots(formation: Formation): readonly FormationAssignment[] { return formation.assignments; }
export function setFormationAssignment(formation: Formation, row: number, column: number, value: FormationSlot): Formation {
  const assignments = formation.assignments.filter(slot => slot.row !== row || slot.column !== column);
  if (value.heroId || (value.military && value.militaryCount > 0)) assignments.push({ row, column, ...value });
  return { ...formation, assignments };
}
export function getFormationTroopCounts(formation: Formation): Pick<Troops, FormationMilitaryKind> { return formation.assignments.reduce((total, slot) => { if (slot.military) total[slot.military] += slot.militaryCount; return total; }, { infantry: 0, archer: 0 }); }
export function getFormationsTroopCounts(formations: readonly Formation[]): Pick<Troops, FormationMilitaryKind> { return formations.reduce((total, formation) => { const counts = getFormationTroopCounts(formation); total.infantry += counts.infantry; total.archer += counts.archer; return total; }, { infantry: 0, archer: 0 }); }
export function serializeOffenseFormations(formations: readonly Formation[]): string { return JSON.stringify({ version: 2, formations }); }
/** Legacy row saves are intentionally rejected. Assignments must fit the currently visible board. */
export function restoreOffenseFormations(value: string | null, deployedIds: readonly string[], troops: Troops, grid: FormationGrid = DEFAULT_FORMATION_GRID): Formation[] {
  const empty = createEmptyFormations();
  try {
    const saved: unknown = JSON.parse(value || 'null');
    if (!saved || typeof saved !== 'object' || (saved as { version?: unknown }).version !== 2 || !Array.isArray((saved as { formations?: unknown }).formations)) return empty;
    const deployed = new Set(deployedIds), usedHeroes = new Set<string>(), usedTroops = { infantry: 0, archer: 0 }, columns = Math.max(1, Math.floor(grid.columns)), rows = Math.max(1, Math.floor(grid.rows));
    return empty.map((fallback, index) => {
      const source = (saved as { formations: unknown[] }).formations[index];
      if (!source || typeof source !== 'object' || !Array.isArray((source as { assignments?: unknown }).assignments)) return fallback;
      const assignments: FormationAssignment[] = [], occupied = new Set<string>();
      for (const raw of (source as { assignments: unknown[] }).assignments) {
        if (!raw || typeof raw !== 'object') continue;
        const slot = raw as Record<string, unknown>, rawRow = slot.row, rawColumn = slot.column;
        if (!Number.isSafeInteger(rawRow) || !Number.isSafeInteger(rawColumn)) continue;
        const row = rawRow as number, column = rawColumn as number;
        if (row < 0 || row >= rows || column < 0 || column >= columns || occupied.has(formationSlotId(row, column))) continue;
        const heroId = slot.heroId;
        if (typeof heroId === 'string' && deployed.has(heroId) && !usedHeroes.has(heroId)) { assignments.push({ row, column, heroId, military: null, militaryCount: 0 }); usedHeroes.add(heroId); occupied.add(formationSlotId(row, column)); continue; }
        const military = slot.military, rawMilitaryCount = slot.militaryCount;
        if (!Number.isSafeInteger(rawMilitaryCount)) continue;
        const militaryCount = rawMilitaryCount as number;
        if ((military === 'infantry' || military === 'archer') && militaryCount > 0 && usedTroops[military] + militaryCount <= troops[military]) { assignments.push({ row, column, heroId: null, military, militaryCount }); usedTroops[military] += militaryCount; occupied.add(formationSlotId(row, column)); }
      }
      const leader = (source as { leader?: unknown }).leader;
      return { leader: typeof leader === 'string' && assignments.some(slot => slot.heroId === leader) ? leader : null, assignments };
    });
  } catch { return empty; }
}
