import { UNITS_SAVE_KEY } from './units';
import { BATTLE_SAVE_KEY, BATTLE_TRANSACTION_KEY } from './battle-save';
import { CITIES_SAVE_KEY } from './cities';
import { MILITARY_SAVE_KEY } from './military-service';
import { OFFENSE_FORMATIONS_SAVE_KEY } from './offense-formations';
import { ROUTES_SAVE_KEY } from './routes';
import { DEPLOYED_AXIES_SAVE_KEY } from './town-deployment';
import { DEFAULT_UNIT_GLOBAL_STATS, setActiveUnitGlobalStats } from './unit-stats';
import { WORLD_SAVE_KEY } from './world';
import { BATTLE_SETTINGS_SAVE_KEY, DEFAULT_BATTLE_SETTINGS, setActiveBattleSettings } from './battle-settings';

export type ResettableModule = {
  id: string;
  storageKeys: readonly string[];
  matchesStorageKey?: (key: string) => boolean;
  /** Synchronous cleanup for module caches. The caller reloads after a successful reset. */
  reset?: () => void;
};

/** Register every persistent module here, including legacy and dynamically scoped keys.
 * This eager registry must cover modules even if their UI has never been opened.
 */
export const RESETTABLE_MODULES: readonly ResettableModule[] = [
  { id: 'battle', storageKeys: [BATTLE_SAVE_KEY, BATTLE_TRANSACTION_KEY] },
  { id: 'buildings', storageKeys: ['axie-conquest-base-v1', 'axie-conquest-base-v2'] },
  { id: 'world', storageKeys: [WORLD_SAVE_KEY] },
  { id: 'units', storageKeys: [UNITS_SAVE_KEY] },
  { id: 'routes', storageKeys: [ROUTES_SAVE_KEY] },
  { id: 'cities', storageKeys: [CITIES_SAVE_KEY] },
  { id: 'military', storageKeys: [MILITARY_SAVE_KEY], matchesStorageKey: key => /^axie-conquest-city-.+-troops-v1$/.test(key) },
  { id: 'formations', storageKeys: [OFFENSE_FORMATIONS_SAVE_KEY] },
  { id: 'deployments', storageKeys: [DEPLOYED_AXIES_SAVE_KEY] },
  { id: 'unit-stats', storageKeys: ['axie-conquest-unit-stats-v1'], reset: () => setActiveUnitGlobalStats({ ...DEFAULT_UNIT_GLOBAL_STATS }) },
  { id: 'battle-settings', storageKeys: [BATTLE_SETTINGS_SAVE_KEY], reset: () => setActiveBattleSettings({ ...DEFAULT_BATTLE_SETTINGS }) },
];

type ResetStorage = Pick<Storage, 'length' | 'key' | 'removeItem'>;

/** Deletes only registered game data; throws on failure so the UI never claims success.
 * Snapshot keys before deletion because Storage indices change on removal.
 * Reload immediately on success to discard React, Babylon and service state.
 */
export function resetGame(storage: ResetStorage, modules = RESETTABLE_MODULES): void {
  const keys = new Set(modules.flatMap(module => [...module.storageKeys]));
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null && modules.some(module => module.matchesStorageKey?.(key))) keys.add(key);
  }
  for (const key of Array.from(keys)) storage.removeItem(key);
  for (const module of modules) module.reset?.();
}
