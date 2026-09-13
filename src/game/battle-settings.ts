import defaults from './battle-settings.json';
import { BattleOverlays, DEFAULT_BATTLE_OVERLAYS } from './battle-debug';

export const BATTLE_SETTINGS_SAVE_KEY = 'axie-conquest-battle-settings-v1';
export type BattleSettings = typeof defaults & { overlays: BattleOverlays; showAll: boolean };
export const DEFAULT_BATTLE_SETTINGS: BattleSettings = { ...defaults, overlays: { ...DEFAULT_BATTLE_OVERLAYS }, showAll: false };
export let activeBattleSettings: BattleSettings = { ...DEFAULT_BATTLE_SETTINGS };

export function sanitizeBattleSettings(value: Partial<BattleSettings> | null | undefined): BattleSettings {
  const number = (key: keyof typeof defaults, minimum: number, maximum: number) => {
    const candidate = value?.[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : DEFAULT_BATTLE_SETTINGS[key];
  };
  return {
    awarenessRadius: number('awarenessRadius', 1, 100),
    engagementRadius: number('engagementRadius', 1, 100),
    leashRadius: number('leashRadius', 1, 200),
    attackRangeMultiplier: number('attackRangeMultiplier', 0.1, 5),
    bodyRadiusMultiplier: number('bodyRadiusMultiplier', 0.1, 5),
    overlays: Object.fromEntries(Object.keys(DEFAULT_BATTLE_OVERLAYS).map(key => [key, typeof value?.overlays?.[key as keyof BattleOverlays] === 'boolean' ? value.overlays[key as keyof BattleOverlays] : DEFAULT_BATTLE_OVERLAYS[key as keyof BattleOverlays]])) as BattleOverlays,
    showAll: value?.showAll === true,
  };
}

export function setActiveBattleSettings(value: Partial<BattleSettings>): void {
  activeBattleSettings = sanitizeBattleSettings(value);
}

/** Restore eagerly at app startup so world-map marches use the same tuning on arrival. */
export function restoreActiveBattleSettings(raw: string | null): BattleSettings {
  try { setActiveBattleSettings(raw ? JSON.parse(raw) : DEFAULT_BATTLE_SETTINGS); }
  catch { setActiveBattleSettings(DEFAULT_BATTLE_SETTINGS); }
  return activeBattleSettings;
}
