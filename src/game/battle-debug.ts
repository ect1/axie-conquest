export const BATTLE_OVERLAYS = {
  awareness: { label: 'Level 2 · Awareness', color: '#48a9ff' },
  engagement: { label: 'Level 1 · Engagement / charge', color: '#ffac46' },
  attack: { label: 'Basic attack range', color: '#ff6262' },
  body: { label: 'Body radius', color: '#ffffff' },
  facing: { label: 'Facing direction', color: '#f5d66c' },
  targets: { label: 'Target lines', color: '#d29bff' },
};
export type BattleOverlays = Record<keyof typeof BATTLE_OVERLAYS, boolean>;
export const DEFAULT_BATTLE_OVERLAYS: BattleOverlays = { awareness: false, engagement: false, attack: false, body: false, facing: false, targets: false };
