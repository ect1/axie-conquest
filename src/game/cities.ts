import { EMPTY_TROOPS, Troops, restoreTroops } from './base';
import { getDefaultDeployedAxieIds, restoreDeployedAxieIds } from './town-deployment';

/** The ownership boundary for a settlement, base, or garrison. */
export type CityResourceKind = 'food' | 'wood' | 'stone' | 'warSupplies';
export type CityResources = Record<CityResourceKind, { amount: number; capacity: number }>;
export type CityState = { id: string; name: string; kind: 'capital' | 'base' | 'garrison'; resources: CityResources; troops: Troops; deployedAxieIds: string[] };
export const CAPITAL_CITY_ID = 'everleaf-haven';
export const CITIES_SAVE_KEY = 'axie-conquest-cities-v1';
export function createCapitalCity(): CityState { return { id: CAPITAL_CITY_ID, name: 'City #1', kind: 'capital', resources: { food: { amount: 240, capacity: 500 }, wood: { amount: 180, capacity: 500 }, stone: { amount: 120, capacity: 500 }, warSupplies: { amount: 80, capacity: 250 } }, troops: { ...EMPTY_TROOPS }, deployedAxieIds: getDefaultDeployedAxieIds() }; }
function stock(value: unknown, fallback: { amount: number; capacity: number }): { amount: number; capacity: number } {
  const item = value as { amount?: unknown; capacity?: unknown } | null;
  const savedCapacity = item?.capacity;
  const capacity = typeof savedCapacity === 'number' && Number.isSafeInteger(savedCapacity) && savedCapacity >= 0 ? savedCapacity : fallback.capacity;
  const savedAmount = item?.amount;
  return { capacity, amount: typeof savedAmount === 'number' && Number.isSafeInteger(savedAmount) && savedAmount >= 0 ? Math.min(savedAmount, capacity) : fallback.amount };
}
/** Validates a city collection; consumers can select by city id as more cities arrive. */
export function restoreCities(value: string | null): CityState[] { const fallback = createCapitalCity(); try { const saved: unknown = JSON.parse(value || '[]'); if (!Array.isArray(saved)) return [fallback]; const cities = saved.flatMap((item): CityState[] => { const city = item as Partial<CityState> | null; if (!city || typeof city.id !== 'string' || typeof city.name !== 'string' || !['capital', 'base', 'garrison'].includes(city.kind as string)) return []; const r = city.resources as Partial<CityResources> | undefined; return [{ ...fallback, id: city.id, name: city.name, kind: city.kind as CityState['kind'], resources: { food: stock(r?.food, fallback.resources.food), wood: stock(r?.wood, fallback.resources.wood), stone: stock(r?.stone, fallback.resources.stone), warSupplies: stock(r?.warSupplies, fallback.resources.warSupplies) }, troops: restoreTroops(JSON.stringify(city.troops ?? EMPTY_TROOPS)), deployedAxieIds: restoreDeployedAxieIds(JSON.stringify(city.deployedAxieIds ?? [])) }]; }); return cities.length ? Array.from(new Map(cities.map(city => [city.id, city])).values()) : [fallback]; } catch { return [fallback]; } }
