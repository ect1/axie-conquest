import defaults from './battle-settings.json';
import { BattleOverlays, DEFAULT_BATTLE_OVERLAYS } from './battle-debug';
import { BattleRangeSettings, DEFAULT_BATTLE_RANGE, sanitizeBattleRange } from './battle-range';
import { getCombatStatsConfig } from './stats-config';

export const BATTLE_SETTINGS_SAVE_KEY = 'axie-conquest-battle-settings-v1';
export type BattleSettings = typeof defaults & BattleRangeSettings & { overlays: BattleOverlays; showAll: boolean; debugBattle: boolean };
type SavedBattleSettings = Partial<BattleSettings> & { replayTeamSeparation?: unknown };

function getCombatDefaults() {
  const c = getCombatStatsConfig();
  return {
    baseAxieHealth: c.axieHero.health,
    baseAxieAttack: c.axieHero.attack,
    baseAxieDefense: c.axieHero.defense,
    baseAxieSpeed: c.axieHero.speed,
    baseAxieAttackSpeed: c.axieHero.attackSpeed,
    baseSoldierHealth: c.soldier.health,
    baseSoldierAttack: c.soldier.attack,
    baseSoldierDefense: c.soldier.defense,
    baseSoldierSpeed: c.soldier.speed,
    baseSoldierAttackSpeed: c.soldier.attackSpeed,
    baseArcherHealth: c.archer.health,
    baseArcherAttack: c.archer.attack,
    baseArcherDefense: c.archer.defense,
    baseArcherSpeed: c.archer.speed,
    baseArcherAttackSpeed: c.archer.attackSpeed,
    baseArcherProjectileSpeed: c.archer.projectileSpeed ?? 12,
    baseChimeraHealth: c.chimera.health,
    baseChimeraAttack: c.chimera.attack,
    baseChimeraDefense: c.chimera.defense,
    baseChimeraSpeed: c.chimera.speed,
    baseChimeraAttackSpeed: c.chimera.attackSpeed,
  };
}

export const DEFAULT_BATTLE_SETTINGS: BattleSettings = {
  ...DEFAULT_BATTLE_RANGE,
  ...defaults,
  ...getCombatDefaults(),
  overlays: { ...DEFAULT_BATTLE_OVERLAYS },
  showAll: false,
  debugBattle: false,
};
export let activeBattleSettings: BattleSettings = { ...DEFAULT_BATTLE_SETTINGS };

export function sanitizeBattleSettings(value: SavedBattleSettings | null | undefined): BattleSettings {
  const number = (key: keyof typeof defaults, minimum: number, maximum: number) => {
    // The first sandbox prototype stored these same base profiles under
    // `sandbox*`; retain that input solely to migrate existing local saves.
    const legacyKey = String(key).replace(/^base/, 'sandbox');
    const candidate = value?.[key] ?? (value as Record<string, unknown> | null | undefined)?.[legacyKey];
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
    baseAxieHealth: number('baseAxieHealth', 1, 100000),
    baseAxieAttack: number('baseAxieAttack', 0, 100000),
    baseAxieDefense: number('baseAxieDefense', 0, 100000),
    baseAxieSpeed: number('baseAxieSpeed', 0.1, 100),
    baseAxieAttackSpeed: number('baseAxieAttackSpeed', 0.1, 10),
    baseSoldierHealth: number('baseSoldierHealth', 1, 100000),
    baseSoldierAttack: number('baseSoldierAttack', 0, 100000),
    baseSoldierDefense: number('baseSoldierDefense', 0, 100000),
    baseSoldierSpeed: number('baseSoldierSpeed', 0.1, 100),
    baseSoldierAttackSpeed: number('baseSoldierAttackSpeed', 0.1, 10),
    baseArcherHealth: number('baseArcherHealth', 1, 100000),
    baseArcherAttack: number('baseArcherAttack', 0, 100000),
    baseArcherDefense: number('baseArcherDefense', 0, 100000),
    baseArcherSpeed: number('baseArcherSpeed', 0.1, 100),
    baseArcherAttackSpeed: number('baseArcherAttackSpeed', 0.1, 10),
    baseArcherProjectileSpeed: number('baseArcherProjectileSpeed', 0.1, 100),
    baseChimeraHealth: number('baseChimeraHealth', 1, 100000),
    baseChimeraAttack: number('baseChimeraAttack', 0, 100000),
    baseChimeraDefense: number('baseChimeraDefense', 0, 100000),
    baseChimeraSpeed: number('baseChimeraSpeed', 0.1, 100),
    baseChimeraAttackSpeed: number('baseChimeraAttackSpeed', 0.1, 10),
    ...range,
    overlays: Object.fromEntries(Object.keys(DEFAULT_BATTLE_OVERLAYS).map(key => [key, typeof value?.overlays?.[key as keyof BattleOverlays] === 'boolean' ? value.overlays[key as keyof BattleOverlays] : DEFAULT_BATTLE_OVERLAYS[key as keyof BattleOverlays]])) as BattleOverlays,
    showAll: value?.showAll === true,
    debugBattle: value?.debugBattle === true,
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
