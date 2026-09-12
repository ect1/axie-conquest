import {
  Building,
  EMPTY_TROOPS,
  TRAINING_BATCH,
  TroopKind,
  Troops,
  restoreTroops,
  trainTroops,
} from './base';

export const MILITARY_SAVE_KEY = 'axie-conquest-troops-v1';
export function getMilitarySaveKey(cityId: string) { return `axie-conquest-city-${cityId}-troops-v1`; }

export type MilitaryStorage = Pick<Storage, 'getItem' | 'setItem'>;
export type TrainingResult = { troops: Troops; persisted: boolean };

/** Owns military state and persistence independently from Babylon and React. */
export function createMilitaryService(storage?: MilitaryStorage, cityId?: string) {
  let troops = { ...EMPTY_TROOPS };

  try {
    troops = restoreTroops(storage?.getItem(cityId ? getMilitarySaveKey(cityId) : MILITARY_SAVE_KEY) ?? (cityId ? storage?.getItem(MILITARY_SAVE_KEY) : null) ?? null);
  } catch {
    // Storage can be unavailable during SSR or when the browser denies access.
  }

  return {
    getTroops(): Troops {
      return { ...troops };
    },

    train(kind: TroopKind, buildings: Building[]): TrainingResult | null {
      const next = trainTroops(kind, buildings, troops);
      if (!next) return null;

      troops = next;
      let persisted = false;
      try {
        storage?.setItem(cityId ? getMilitarySaveKey(cityId) : MILITARY_SAVE_KEY, JSON.stringify(troops));
        persisted = !!storage;
      } catch {
        // Successfully trained troops remain available for this session.
      }
      return { troops: { ...troops }, persisted };
    },
  };
}

export function getTotalMilitary(troops: Troops): number {
  return troops.infantry + troops.archer;
}

export function getTrainingMessage(kind: TroopKind): string {
  return `${TRAINING_BATCH} ${kind === 'infantry' ? 'soldiers' : 'archers'} trained.`;
}
