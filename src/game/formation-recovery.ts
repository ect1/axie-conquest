import { Formation } from './offense-formations';
import { getBaseHealingRecoveryConfig, getCombatStatsConfig } from './stats-config';

/** Heals damaged formation slots while their formation is home. A hospital only changes the rate. */
export function recoverFormationHealth(
  formations: readonly Formation[],
  hospitalLevel: number,
  hospitalHealingMultiplier: number,
  now: number,
  blockedFormationIndices: ReadonlySet<number> = new Set(),
): { formations: Formation[]; changed: boolean } {
  if (!Number.isFinite(now)) return { formations: formations.map(formation => structuredClone(formation)), changed: false };
  const healing = getBaseHealingRecoveryConfig();
  const combat = getCombatStatsConfig();
  const multiplier = Math.max(0, hospitalHealingMultiplier);
  let changed = false;
  const next = formations.map((formation, formationIndex) => {
    if (blockedFormationIndices.has(formationIndex)) return structuredClone(formation);
    let formationChanged = false;
    const assignments = formation.assignments.flatMap(slot => {
      if (slot.healthRatio === undefined || slot.healthRatio >= 1 || slot.healthUpdatedAt !== undefined && slot.healthUpdatedAt > now) return [slot];
      // Migrate wounded formations saved before healthUpdatedAt existed.
      if (slot.healthUpdatedAt === undefined) {
        formationChanged = changed = true;
        return [{ ...slot, healthUpdatedAt: now }];
      }
      const elapsedSeconds = Math.max(0, (now - slot.healthUpdatedAt) / 1000);
      if (elapsedSeconds <= 0) return [slot];
      const unitHealth = slot.heroId ? combat.axieHero.health : slot.military === 'archer' ? combat.archer.health : combat.soldier.health;
      const memberCount = slot.heroId ? 1 : Math.max(1, slot.militaryCount);
      const maxHealth = unitHealth * memberCount;
      const healedRatio = Math.min(1, slot.healthRatio + (healing.baseHealingRate * multiplier * memberCount * elapsedSeconds) / maxHealth);
      if (healedRatio <= slot.healthRatio) return [slot];
      formationChanged = changed = true;
      return [{ ...slot, healthRatio: healedRatio >= 1 ? undefined : healedRatio, healthUpdatedAt: healedRatio >= 1 ? undefined : now }];
    });
    const woundedAxies = { ...(formation.woundedAxies ?? {}) };
    for (const [heroId, wounded] of Object.entries(woundedAxies)) {
      if (wounded.healthUpdatedAt > now) continue;
      const elapsedSeconds = Math.max(0, (now - wounded.healthUpdatedAt) / 1000);
      if (elapsedSeconds <= 0) continue;
      const healedRatio = Math.min(1, wounded.healthRatio + (healing.baseHealingRate * multiplier * elapsedSeconds) / combat.axieHero.health);
      if (healedRatio <= wounded.healthRatio) continue;
      if (healedRatio >= 1) delete woundedAxies[heroId];
      else woundedAxies[heroId] = { healthRatio: healedRatio, healthUpdatedAt: now };
      formationChanged = changed = true;
    }
    const leader = formation.leader && assignments.some(slot => slot.heroId === formation.leader) ? formation.leader : null;
    if (leader !== formation.leader) formationChanged = changed = true;
    return formationChanged
      ? { ...formation, leader, assignments, woundedAxies: Object.keys(woundedAxies).length ? woundedAxies : undefined }
      : formation;
  });
  return { formations: next, changed };
}
