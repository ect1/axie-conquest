import defaults from './unit-stats.json';
export type UnitGlobalStats = { marchSpeed: number };
export const DEFAULT_UNIT_GLOBAL_STATS: UnitGlobalStats = defaults;
export let activeUnitGlobalStats: UnitGlobalStats = { ...DEFAULT_UNIT_GLOBAL_STATS };
export function setActiveUnitGlobalStats(stats: UnitGlobalStats): void { activeUnitGlobalStats.marchSpeed = stats.marchSpeed; }
