export const DEPLOYED_AXIES_SAVE_KEY = 'axie-conquest-deployed-axies';

export function getDefaultDeployedAxieIds(): string[] {
  return [];
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
import { STARTER_HEROES } from './heroes';
