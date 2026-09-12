import { STARTER_HEROES } from './heroes';

export const DEPLOYED_AXIES_SAVE_KEY = 'axie-conquest-deployed-axies';
export const DEFAULT_DEPLOYED_AXIE_COUNT = 5;

export function getDefaultDeployedAxieIds(): string[] {
  return STARTER_HEROES.slice(0, DEFAULT_DEPLOYED_AXIE_COUNT).map(hero => hero.id);
}

export function restoreDeployedAxieIds(value: string | null): string[] {
  try {
    const saved: unknown = JSON.parse(value || 'null');
    if (!Array.isArray(saved)) return getDefaultDeployedAxieIds();
    return Array.from(new Set(saved.filter((id): id is string => typeof id === 'string' && STARTER_HEROES.some(hero => hero.id === id))));
  } catch {
    return getDefaultDeployedAxieIds();
  }
}
