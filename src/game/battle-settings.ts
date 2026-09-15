import defaults from './battle-settings.json';
import { BattleOverlays, DEFAULT_BATTLE_OVERLAYS } from './battle-debug';
import { BattleRangeSettings, DEFAULT_BATTLE_RANGE, sanitizeBattleRange } from './battle-range';

export const BATTLE_SETTINGS_SAVE_KEY = 'axie-conquest-battle-settings-v1';
export type BattleSettings = typeof defaults & BattleRangeSettings & { overlays: BattleOverlays; showAll: boolean };
type SavedBattleSettings = Partial<BattleSettings> & { replayTeamSeparation?: unknown };
// `battle-settings.json` is the canonical combined battle configuration. Keep
// range defaults as a fallback for fields it does not provide, rather than
// letting the legacy range file overwrite its sandbox/live-battle values.
export const DEFAULT_BATTLE_SETTINGS: BattleSettings = { ...DEFAULT_BATTLE_RANGE, ...defaults, overlays: { ...DEFAULT_BATTLE_OVERLAYS }, showAll: false };
export let activeBattleSettings: BattleSettings = { ...DEFAULT_BATTLE_SETTINGS };

export function sanitizeBattleSettings(value: SavedBattleSettings | null | undefined): BattleSettings {
  const number = (key: keyof typeof defaults, minimum: number, maximum: number) => {
    const candidate = value?.[key];
    return typeof candidate === 'number' && Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : DEFAULT_BATTLE_SETTINGS[key];
  };
  const savedSeparation = value?.teamSeparation ?? value?.replayTeamSeparation;
  const teamSeparation = typeof savedSeparation === 'number' && Number.isFinite(savedSeparation)
    ? Math.max(8, Math.min(80, savedSeparation))
    : DEFAULT_BATTLE_SETTINGS.teamSeparation;
  const range = sanitizeBattleRange(value);
  return {
    awarenessRadius: number('awarenessRadius', 1, 100),
    engagementRadius: number('engagementRadius', 1, 100),
    leashRadius: number('leashRadius', 1, 200),
    // `replayTeamSeparation` was the old replay-only setting. Retain it as a
    // migration input, but make one shared opening separation drive all views.
    teamSeparation,
    boardHexGap: number('boardHexGap', 0, 3),
    boardTeamGap: number('boardTeamGap', 0, 4),
    boardColumns: number('boardColumns', 2, 16),
    boardRows: number('boardRows', 1, 12),
    attackRangeMultiplier: number('attackRangeMultiplier', 0.1, 5),
    bodyRadiusMultiplier: number('bodyRadiusMultiplier', 0.1, 5),
    ...range,
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
