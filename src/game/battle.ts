import { ApiAxie } from './axie-roster';
import { STARTER_HEROES } from './heroes';
import { UnitMember, WorldUnit, createArmy } from './units';
import { createEmptyFormation } from './offense-formations';
import { commanderSkill } from './battle-skills';
import { leaderTalent, NO_MODIFIERS } from './battle-modifiers';
import { activeBattleSettings } from './battle-settings';
import { teamFacing, teamStartingCenter } from './battle-layout';
import { level0CanAttack, level1CanDetect } from './battle-range';
import { baseCombatStats } from './sandbox-battle';

export const BATTLE_STEP = 0.1;
export const MAX_BATTLE_TICKS = 3000;
export type CombatStats = { health: number; attack: number; defense: number; speed: number; range: number; interval: number; radius: number };
export const TROOP_COMBAT_STATS: Record<'infantry' | 'archer' | 'scout', CombatStats> = {
  infantry: { health: 100, attack: 12, defense: 35, speed: 2.5, range: 0.65, interval: 1.2, radius: 0.45 },
  archer: { health: 65, attack: 14, defense: 10, speed: 2.3, range: 6, interval: 1.6, radius: 0.4 },
  scout: { health: 70, attack: 5, defense: 10, speed: 3.5, range: 0.6, interval: 1.4, radius: 0.4 },
};
export type Fighter = {
  appearance?: ApiAxie;
  id: string; memberId: string; side: 'player' | 'enemy'; name: string; heroId?: string; troopKind?: UnitMember['troopKind'];
  initialCount: number; hp: number; maxHp: number; stats: CombatStats; x: number; z: number; facing: number;
  cooldown: number; targetId: string | null; state: 'holding' | 'approaching' | 'charging' | 'attacking' | 'retreating' | 'defeated';
};
export type Battle = {
  version: 1; layoutVersion?: 2; tick: number; fighters: Fighter[]; leaderId: string | null; skillCooldown: number;
  retreating: boolean; result: 'victory' | 'defeat' | 'retreated' | 'draw' | null;
  events: { from: string; to: string; amount: number; kind: 'hit' | 'skill' | 'heal' }[];
};
export function livingCount(fighter: Fighter): number { return Math.max(0, Math.min(fighter.initialCount, Math.ceil(fighter.hp / fighter.stats.health))); }
export function edgeDistance(a: Fighter, b: Fighter): number { return Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - a.stats.radius - b.stats.radius); }
export function damageAfterDefense(attack: number, defense: number): number { return attack * 100 / (100 + Math.max(0, defense)); }
export function formationCenter(battle: Battle, side: Fighter['side']) {
  const members = battle.fighters.filter(f => f.side === side && f.hp > 0);
  return members.length ? { x: members.reduce((sum, f) => sum + f.x, 0) / members.length, z: members.reduce((sum, f) => sum + f.z, 0) / members.length } : { x: 0, z: side === 'player' ? -8 : 8 };
}
export function createBattle(army: WorldUnit, enemyCount = 18, roster: readonly ApiAxie[] = []): Battle {
  const leader = STARTER_HEROES.find(hero => hero.id === army.leaderId);
  const modifiers = leaderTalent(leader)?.modifiers ?? NO_MODIFIERS;
  const playerCenter = teamStartingCenter('player', activeBattleSettings.teamSeparation);
  const enemyCenter = teamStartingCenter('enemy', activeBattleSettings.teamSeparation);
  const playerOffsetCenter = army.members.reduce((center, member) => ({ x: center.x + member.offset.x / army.members.length, z: center.z + member.offset.z / army.members.length }), { x: 0, z: 0 });
  const members: Fighter[] = army.members.map(member => {
    const hero = STARTER_HEROES.find(h => h.id === member.heroId);
    const appearance = roster.find(axie => axie.id === member.heroId);
    const troopKind = member.troopKind ?? 'infantry';
    const profile = hero ? baseCombatStats(activeBattleSettings, 'axie') : troopKind === 'infantry' ? baseCombatStats(activeBattleSettings, 'soldier') : troopKind === 'archer' ? baseCombatStats(activeBattleSettings, 'archer') : TROOP_COMBAT_STATS.scout;
    const attackInterval = 'attackSpeed' in profile ? 1 / profile.attackSpeed : profile.interval;
    const base: CombatStats = hero ? { ...profile, speed: profile.speed * hero.stats.speed / 100, range: hero.class === 'bird' || hero.class === 'dawn' ? 5 : 0.8, interval: attackInterval, radius: 0.5 } : { ...TROOP_COMBAT_STATS[troopKind], health: profile.health, attack: profile.attack, defense: profile.defense, speed: profile.speed, interval: attackInterval };
    const stats = { ...base, range: base.range * activeBattleSettings.attackRangeMultiplier, radius: base.radius * activeBattleSettings.bodyRadiusMultiplier, health: base.health * modifiers.health, attack: base.attack * modifiers.attack, defense: base.defense * modifiers.defense, speed: base.speed * modifiers.speed };
    return { id: `player:${member.id}`, memberId: member.id, side: 'player', ...(appearance ? { appearance: structuredClone(appearance) } : {}), name: appearance?.name ?? hero?.name ?? member.troopKind ?? 'Squad', heroId: member.heroId, troopKind: member.troopKind, initialCount: member.count, hp: stats.health * member.count * (member.healthRatio ?? 1), maxHp: stats.health * member.count, stats, x: playerCenter.x + member.offset.x - playerOffsetCenter.x, z: playerCenter.z + member.offset.z - playerOffsetCenter.z, facing: teamFacing('player'), cooldown: 0, targetId: null, state: 'holding' };
  });
  const enemyOffsets = [{ x: -2, z: -1 }, { x: 0, z: -1 }, { x: 2, z: 2 }];
  for (let index = 0; index < 3; index++) {
    const kind = index === 2 ? 'archer' : 'infantry';
    const baseline = TROOP_COMBAT_STATS[kind], chimera = baseCombatStats(activeBattleSettings, 'chimera'), base = { ...baseline, health: chimera.health, attack: chimera.attack, defense: chimera.defense, speed: chimera.speed, interval: 1 / chimera.attackSpeed }, stats = { ...base, range: base.range * activeBattleSettings.attackRangeMultiplier, radius: base.radius * activeBattleSettings.bodyRadiusMultiplier };
    const offset = enemyOffsets[index];
    members.push({ id: `enemy:${index}`, memberId: `${index}`, side: 'enemy', name: kind === 'archer' ? 'Chimera archers' : 'Chimera guards', troopKind: kind, initialCount: enemyCount, hp: stats.health * enemyCount, maxHp: stats.health * enemyCount, stats, x: enemyCenter.x + offset.x, z: enemyCenter.z + offset.z, facing: teamFacing('enemy'), cooldown: 0, targetId: null, state: 'holding' });
  }
  return { version: 1, layoutVersion: 2, tick: 0, fighters: members, leaderId: members.find(f => f.heroId === army.leaderId)?.id ?? null, skillCooldown: 0, retreating: false, result: null, events: [] };
}
export function createSandboxArmy(kind: 'balanced' | 'infantry' | 'archer'): WorldUnit {
  const formation = createEmptyFormation();
  formation.assignments.push({ row: 0, column: 1, heroId: STARTER_HEROES[0].id, military: null, militaryCount: 0 });
  formation.leader = STARTER_HEROES[0].id;
  formation.assignments.push({ row: 0, column: 0, heroId: null, military: kind === 'archer' ? 'archer' : 'infantry', militaryCount: 20 });
  formation.assignments.push({ row: 2, column: 2, heroId: null, military: kind === 'infantry' ? 'infantry' : 'archer', militaryCount: 20 });
  return createArmy(formation, 0, 'sandbox', 'Practice', 3, 'sandbox');
}
export function battleOutcome(battle: Battle): Battle['result'] {
  const player = battle.fighters.some(f => f.side === 'player' && f.hp > 0);
  const enemy = battle.fighters.some(f => f.side === 'enemy' && f.hp > 0);
  return !player && !enemy ? 'draw' : !player ? 'defeat' : !enemy ? 'victory'
    : battle.retreating && battle.fighters.filter(f => f.side === 'player' && f.hp > 0).every(f => f.z <= -22) ? 'retreated'
    : battle.tick >= MAX_BATTLE_TICKS ? 'draw' : null;
}
function finish(battle: Battle): Battle {
  battle.result = battleOutcome(battle);
  for (const fighter of battle.fighters) if (fighter.hp <= 0) { fighter.state = 'defeated'; fighter.targetId = null; }
  return battle;
}
/** Pure, simultaneous-damage, fixed-step simulation. Rendering never determines combat timing. */
export function stepBattle(previous: Battle): Battle {
  if (previous.result) return previous;
  const battle: Battle = { ...previous, tick: previous.tick + 1, skillCooldown: Math.max(0, previous.skillCooldown - BATTLE_STEP), events: [], fighters: previous.fighters.map(f => ({ ...f })) };
  const hits = new Map<string, number>();
  for (const fighter of battle.fighters) {
    if (fighter.hp <= 0) { fighter.state = 'defeated'; fighter.targetId = null; continue; }
    fighter.cooldown = Math.max(0, fighter.cooldown - BATTLE_STEP);
    if (battle.retreating && fighter.side === 'player') {
      fighter.state = 'retreating'; fighter.targetId = null; fighter.facing = Math.PI;
      fighter.z = Math.max(-23, fighter.z - fighter.stats.speed * BATTLE_STEP); continue;
    }
    const origin = previous.fighters.find(f => f.id === fighter.id)!;
    const enemies = previous.fighters.filter(f => f.side !== fighter.side && f.hp > 0 && (fighter.side === 'player' || Math.hypot(f.x, f.z - 8) <= activeBattleSettings.leashRadius));
    enemies.sort((a, b) => edgeDistance(origin, a) - edgeDistance(origin, b) || a.id.localeCompare(b.id));
    const target = enemies.find(e => e.id === fighter.targetId && edgeDistance(origin, e) <= fighter.stats.range) ?? enemies[0];
    const rangeTarget = target && { ...target, radius: target.stats.radius };
    const detected = rangeTarget && level1CanDetect(origin, rangeTarget, activeBattleSettings);
    if (!target || (!detected && !previous.fighters.some(f => f.side === fighter.side && f.hp < f.maxHp))) { fighter.state = 'holding'; fighter.targetId = null; continue; }
    const alerted = previous.fighters.some(f => f.side === fighter.side && (f.hp < f.maxHp || f.state === 'approaching' || f.state === 'charging' || f.state === 'attacking'));
    fighter.facing = Math.atan2(target.x - fighter.x, target.z - fighter.z);
    if (fighter.side === 'enemy' && !alerted && !detected) { fighter.state = 'holding'; fighter.targetId = null; continue; }
    fighter.targetId = target.id;
    const distance = edgeDistance(origin, target);
    if (level0CanAttack(origin, rangeTarget, fighter.stats.range + fighter.stats.radius, activeBattleSettings)) {
      fighter.state = 'attacking';
      if (fighter.cooldown <= 0.00001) {
        const amount = damageAfterDefense(fighter.stats.attack * livingCount(fighter), target.stats.defense);
        hits.set(target.id, (hits.get(target.id) ?? 0) + amount);
        battle.events.push({ from: fighter.id, to: target.id, amount, kind: 'hit' });
        fighter.cooldown = fighter.stats.interval;
      }
    } else {
      const charge = fighter.stats.range < 2 && detected;
      fighter.state = charge ? 'charging' : 'approaching';
      const step = Math.min(Math.max(0, distance - fighter.stats.range), fighter.stats.speed * (charge ? activeBattleSettings.dashSpeedMultiplier : 1) * BATTLE_STEP);
      fighter.x += Math.sin(fighter.facing) * step; fighter.z += Math.cos(fighter.facing) * step;
    }
  }
  // Soft body separation keeps squads legible while allowing friendly ranks to pass.
  for (let i = 0; i < battle.fighters.length; i++) for (let j = i + 1; j < battle.fighters.length; j++) {
    const a = battle.fighters[i], b = battle.fighters[j];
    if (a.hp <= 0 || b.hp <= 0) continue;
    const dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz), min = a.stats.radius + b.stats.radius;
    if (distance >= min) continue;
    const shift = (min - distance) / 2, nx = distance > 0 ? dx / distance : 1, nz = distance > 0 ? dz / distance : 0;
    a.x -= nx * shift; a.z -= nz * shift; b.x += nx * shift; b.z += nz * shift;
  }
  for (const fighter of battle.fighters) { fighter.hp = Math.max(0, fighter.hp - (hits.get(fighter.id) ?? 0)); if (!fighter.hp) fighter.state = 'defeated'; }
  return finish(battle);
}
export function activateCommanderSkill(previous: Battle): Battle {
  const leader = previous.fighters.find(f => f.id === previous.leaderId && f.hp > 0);
  const skill = commanderSkill(STARTER_HEROES.find(h => h.id === leader?.heroId));
  if (!leader || !skill || previous.result || previous.retreating || previous.skillCooldown > 0) return previous;
  const candidates = previous.fighters.filter(f => f.hp > 0 && (skill.effect === 'heal' ? f.side === leader.side && f.hp < livingCount(f) * f.stats.health : f.side !== leader.side) && edgeDistance(leader, f) <= skill.range);
  candidates.sort((a, b) => skill.effect === 'heal' ? a.hp / a.maxHp - b.hp / b.maxHp : edgeDistance(leader, a) - edgeDistance(leader, b));
  const target = candidates[0];
  if (!target) return previous;
  const amount = skill.effect === 'heal' ? Math.min(livingCount(target) * target.stats.health - target.hp, target.maxHp * skill.power) : damageAfterDefense(leader.stats.attack * skill.power * (leader.heroId && STARTER_HEROES.find(h => h.id === leader.heroId)?.parts.mouth === 'Risky Fish' ? 2 - leader.hp / leader.maxHp : 1), target.stats.defense * (skill.effect === 'pierce' ? 0.5 : 1));
  return finish({ ...previous, skillCooldown: skill.cooldown, events: [{ from: leader.id, to: target.id, amount, kind: skill.effect === 'heal' ? 'heal' : 'skill' }], fighters: previous.fighters.map(f => f.id === target.id ? { ...f, hp: skill.effect === 'heal' ? f.hp + amount : Math.max(0, f.hp - amount) } : { ...f }) });
}
