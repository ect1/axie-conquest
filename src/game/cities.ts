import { EMPTY_TROOPS, Troops, restoreTroops, Building } from './base';
import { getDefaultDeployedAxieIds } from './town-deployment';
import { getBuildingLevelConfig } from './building-config';
import { getStartingResources, getCapitalCityIdentity } from './game-config';
import { getCityBaseCapacity } from './city-config';

/** The ownership boundary for a settlement, base, or garrison. */
export type CityResourceKind = 'food' | 'wood' | 'stone';
export type CityResources = Record<CityResourceKind, { amount: number; capacity: number }>;
export type CityState = { id: string; name: string; kind: 'capital' | 'base' | 'garrison'; resources: CityResources; troops: Troops; deployedAxieIds: string[] };
export const CAPITAL_CITY_ID = 'everleaf-haven';
export const CITIES_SAVE_KEY = 'axie-conquest-cities-v1';

export const BASE_CITY_CAPACITY: Record<CityResourceKind, number> = {
  get food() { return getCityBaseCapacity('capital').food; },
  get wood() { return getCityBaseCapacity('capital').wood; },
  get stone() { return getCityBaseCapacity('capital').stone; },
};

export function calculateCityCapacities(
  buildings: Building[],
  kind: CityState['kind'] = 'capital'
): Record<CityResourceKind, number> {
  const caps = { ...getCityBaseCapacity(kind) };
  for (const b of buildings) {
    const cfg = getBuildingLevelConfig(b.kind, b.level ?? 1);
    if (cfg?.capacityBonus) {
      if (cfg.capacityBonus.food) caps.food += cfg.capacityBonus.food;
      if (cfg.capacityBonus.wood) caps.wood += cfg.capacityBonus.wood;
      if (cfg.capacityBonus.stone) caps.stone += cfg.capacityBonus.stone;
    }
  }
  return caps;
}

export function createCapitalCity(): CityState {
  const identity = getCapitalCityIdentity();
  const startingRes = getStartingResources();
  const baseCaps = getCityBaseCapacity('capital');
  return {
    id: identity.id,
    name: identity.defaultName,
    kind: 'capital',
    resources: {
      food: { amount: startingRes.food, capacity: baseCaps.food },
      wood: { amount: startingRes.wood, capacity: baseCaps.wood },
      stone: { amount: startingRes.stone, capacity: baseCaps.stone },
    },
    troops: { ...EMPTY_TROOPS },
    deployedAxieIds: getDefaultDeployedAxieIds(),
  };
}

export function createSubCity(id: string, name: string, kind: 'base' | 'garrison'): CityState {
  const baseCaps = getCityBaseCapacity(kind);
  return {
    id,
    name,
    kind,
    resources: {
      food: { amount: 0, capacity: baseCaps.food },
      wood: { amount: 0, capacity: baseCaps.wood },
      stone: { amount: 0, capacity: baseCaps.stone },
    },
    troops: { ...EMPTY_TROOPS },
    deployedAxieIds: [],
  };
}

function stock(value: unknown, fallback: { amount: number; capacity: number }): { amount: number; capacity: number } {
  const item = value as { amount?: unknown; capacity?: unknown } | null;
  const savedCapacity = item?.capacity;
  const capacity = typeof savedCapacity === 'number' && Number.isFinite(savedCapacity) && savedCapacity >= 0 ? savedCapacity : fallback.capacity;
  const savedAmount = item?.amount;
  return { capacity, amount: typeof savedAmount === 'number' && Number.isFinite(savedAmount) && savedAmount >= 0 ? savedAmount : fallback.amount };
}

/** Validates a city collection; consumers can select by city id as more cities arrive. */
function restoreCityAxieIds(value: unknown): string[] {
  return Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))) : [];
}

export function restoreCities(value: string | null): CityState[] {
  const fallback = createCapitalCity();
  try {
    const saved: unknown = JSON.parse(value || '[]');
    if (!Array.isArray(saved)) return [fallback];
    const cities = saved.flatMap((item): CityState[] => {
      const city = item as Partial<CityState> | null;
      if (!city || typeof city.id !== 'string' || typeof city.name !== 'string' || !['capital', 'base', 'garrison'].includes(city.kind as string)) return [];
      const r = city.resources as Partial<CityResources> | undefined;
      return [{
        ...fallback,
        id: city.id,
        name: city.name,
        kind: city.kind as CityState['kind'],
        resources: {
          food: stock(r?.food, fallback.resources.food),
          wood: stock(r?.wood, fallback.resources.wood),
          stone: stock(r?.stone, fallback.resources.stone),
        },
        troops: restoreTroops(JSON.stringify(city.troops ?? EMPTY_TROOPS)),
        deployedAxieIds: restoreCityAxieIds(city.deployedAxieIds),
      }];
    });
    return cities.length ? Array.from(new Map(cities.map(city => [city.id, city])).values()) : [fallback];
  } catch {
    return [fallback];
  }
}

export function applyResourceProduction(
  resources: CityResources,
  buildings: Building[],
  elapsedSeconds: number,
  kind: CityState['kind'] = 'capital'
): CityResources {
  if (elapsedSeconds <= 0) return resources;
  const caps = calculateCityCapacities(buildings, kind);
  let changed = false;
  const next: CityResources = {
    food: { amount: resources.food.amount, capacity: caps.food },
    wood: { amount: resources.wood.amount, capacity: caps.wood },
    stone: { amount: resources.stone.amount, capacity: caps.stone },
  };

  if (
    caps.food !== resources.food.capacity ||
    caps.wood !== resources.wood.capacity ||
    caps.stone !== resources.stone.capacity
  ) {
    changed = true;
  }

  for (const b of buildings) {
    const level = b.level ?? 1;
    const cfg = getBuildingLevelConfig(b.kind, level);
    if (cfg?.production && cfg.production.rateUnits > 0 && cfg.production.produceEverySeconds > 0) {
      const res = cfg.production.resource;
      const ratePerSec = cfg.production.rateUnits / cfg.production.produceEverySeconds;
      const gain = ratePerSec * elapsedSeconds;
      if (next[res] && next[res].amount < next[res].capacity) {
        next[res].amount = Math.min(next[res].capacity, next[res].amount + gain);
        changed = true;
      }
    }
  }

  return changed ? next : resources;
}

export function calculateCityProductionRates(
  buildings: Building[]
): Record<CityResourceKind, number> {
  const rates: Record<CityResourceKind, number> = {
    food: 0,
    wood: 0,
    stone: 0,
  };
  for (const b of buildings) {
    const level = b.level ?? 1;
    const cfg = getBuildingLevelConfig(b.kind, level);
    if (cfg?.production && cfg.production.rateUnits > 0 && cfg.production.produceEverySeconds > 0) {
      const res = cfg.production.resource;
      if (rates[res] !== undefined) {
        rates[res] += cfg.production.rateUnits / cfg.production.produceEverySeconds;
      }
    }
  }
  return rates;
}
