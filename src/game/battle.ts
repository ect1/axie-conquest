import { ApiAxie } from './axie-roster';
import { STARTER_HEROES } from './heroes';
import { UnitMember, WorldUnit, createArmy } from './units';
import { createEmptyFormation } from './offense-formations';
import { commanderSkill } from './battle-skills';
import { leaderTalent, NO_MODIFIERS } from './battle-modifiers';
import { activeBattleSettings } from './battle-settings';
import { teamFacing, teamStartingCenter } from './battle-layout';
import { isInDirectionalRange, level0CanAttack, level1CanDetect } from './battle-range';
import { baseCombatStats } from './sandbox-battle';
import { HexGridSlot, createHexGridSlots } from './hex-grid';
import { BossConfig, BossCustomStats, defaultBoss, getBossConfig } from './bosses';
import type { WorldObject } from './world';

import defaults from './battle-settings.json';
import { getCombatStatsConfig } from './stats-config';
import { DEFAULT_END_BATTLE_CONFIG, getEndBattleConfig } from './game-config';

export const BATTLE_STEP = 0.1;
export const MAX_BATTLE_TICKS = 3000;
/** Player formations retreat toward decreasing Z, away from the enemy front. */
export const RETREAT_FACING = Math.PI;
export type CombatStats = { health: number; attack: number; defense: number; speed: number; range: number; interval: number; radius: number; projectileSpeed?: number };

const combatDefaults = getCombatStatsConfig();
export const TROOP_COMBAT_STATS: Record<'infantry' | 'soldier' | 'archer' | 'scout', CombatStats> = {
  infantry: { health: combatDefaults.soldier.health, attack: combatDefaults.soldier.attack, defense: combatDefaults.soldier.defense, speed: combatDefaults.soldier.speed, range: defaults.meleeAttackRange, interval: 1 / combatDefaults.soldier.attackSpeed, radius: defaults.bodyRadius },
  soldier: { health: combatDefaults.soldier.health, attack: combatDefaults.soldier.attack, defense: combatDefaults.soldier.defense, speed: combatDefaults.soldier.speed, range: defaults.meleeAttackRange, interval: 1 / combatDefaults.soldier.attackSpeed, radius: defaults.bodyRadius },
  archer: { health: combatDefaults.archer.health, attack: combatDefaults.archer.attack, defense: combatDefaults.archer.defense, speed: combatDefaults.archer.speed, range: defaults.rangedAttackRange, interval: 1 / combatDefaults.archer.attackSpeed, radius: defaults.bodyRadius, projectileSpeed: combatDefaults.archer.projectileSpeed ?? defaults.baseArcherProjectileSpeed },
  scout: { health: combatDefaults.scout.health, attack: combatDefaults.scout.attack, defense: combatDefaults.scout.defense, speed: combatDefaults.scout.speed, range: defaults.meleeAttackRange, interval: 1 / combatDefaults.scout.attackSpeed, radius: defaults.bodyRadius },
};
export type FighterState = 'holding' | 'approaching' | 'charging' | 'attacking' | 'retreating' | 'defeated' | 'marching' | 'searching' | 'roaming';
export type Fighter = {
  appearance?: ApiAxie;
  id: string; memberId: string; side: 'player' | 'enemy'; name: string; heroId?: string; troopKind?: UnitMember['troopKind'];
  armyId?: string; formationIndex?: number;
  initialCount: number; hp: number; maxHp: number; stats: CombatStats; x: number; z: number; facing: number;
  cooldown: number; targetId: string | null; state: FighterState;
  searchAtZ?: number;
  reachedBoardEdge?: boolean;
  searchStepsRemaining?: number;
  edgeScanStepsRemaining?: number;
  movementStepsSinceScan?: number;
  roamStepsSinceScan?: number;
  roamTarget?: { x: number; z: number };
  movementBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  mascotId?: string;
  isBoss?: boolean;
};
export type BattleEvent = { from: string; to: string; amount: number; kind: 'hit' | 'skill' | 'heal'; projectileSpeed?: number };
export type Battle = {
  version: 1; layoutVersion?: 2; tick: number; fighters: Fighter[]; leaderId: string | null; skillCooldown: number;
  retreating: boolean; retreatingArmyIds?: string[]; retreatBoundaryZ?: number;
  result: 'victory' | 'defeat' | 'retreated' | 'draw' | null;
  events: BattleEvent[];
};
export function livingCount(fighter: Fighter): number { return Math.max(0, Math.min(fighter.initialCount, Math.ceil(fighter.hp / fighter.stats.health))); }
export function edgeDistance(a: Fighter, b: Fighter): number { return Math.max(0, Math.hypot(a.x - b.x, a.z - b.z) - a.stats.radius - b.stats.radius); }
export function damageAfterDefense(attack: number, defense: number): number { return attack * 100 / (100 + Math.max(0, defense)); }
export function formationCenter(battle: Battle, side: Fighter['side']) {
  const members = battle.fighters.filter(f => f.side === side && f.hp > 0);
  return members.length ? { x: members.reduce((sum, f) => sum + f.x, 0) / members.length, z: members.reduce((sum, f) => sum + f.z, 0) / members.length } : { x: 0, z: side === 'player' ? -8 : 8 };
}

export function battleRetreatBoundary(battle: Pick<Battle, 'retreatBoundaryZ'>): number {
  return Number.isFinite(battle.retreatBoundaryZ) ? battle.retreatBoundaryZ! : DEFAULT_END_BATTLE_CONFIG.retreatAction.retreatBoundaryZ;
}

function retreatingArmies(battle: Battle): ReadonlySet<string> {
  if (battle.retreatingArmyIds?.length) return new Set(battle.retreatingArmyIds);
  if (!battle.retreating) return new Set();
  // Legacy saves used one global flag. Snapshot every army already in that battle.
  return new Set(battle.fighters.filter(f => f.side === 'player').map(f => f.armyId ?? 'primary'));
}

export function isFighterRetreating(battle: Battle, fighter: Fighter): boolean {
  return fighter.side === 'player' && retreatingArmies(battle).has(fighter.armyId ?? 'primary');
}

export function hasFighterRetreated(battle: Battle, fighter: Fighter): boolean {
  return isFighterRetreating(battle, fighter) && fighter.z <= battleRetreatBoundary(battle);
}

export function buildBossFighters(boss: BossConfig, enemySlots: readonly HexGridSlot[]): Fighter[] {
  const fighters: Fighter[] = [];
  const createBossUnitCombatStats = (custom: BossCustomStats | undefined, fallbackKind: 'soldier' | 'infantry' | 'archer' | 'chimera'): CombatStats => {
    const fallback = TROOP_COMBAT_STATS[fallbackKind === 'chimera' ? 'infantry' : fallbackKind];
    const health = custom?.health ?? fallback.health;
    const attack = custom?.attack ?? fallback.attack;
    const defense = custom?.defense ?? fallback.defense;
    const speed = custom?.speed ?? fallback.speed;
    const attackSpeed = custom?.attackSpeed ?? (fallback.interval > 0 ? 1 / fallback.interval : 1);
    const interval = attackSpeed > 0 ? 1 / attackSpeed : 1;
    const range = (custom?.range ?? fallback.range) * (activeBattleSettings.attackRangeMultiplier ?? 1);
    const radius = (custom?.radius ?? fallback.radius) * (activeBattleSettings.bodyRadiusMultiplier ?? 1);
    const projectileSpeed = custom?.projectileSpeed ?? fallback.projectileSpeed;
    return { health, attack, defense, speed, interval, range, radius, ...(projectileSpeed ? { projectileSpeed } : {}) };
  };

  const leaderCfg = boss.leader;
  const leaderPos = leaderCfg.position;
  const leaderSlot = enemySlots.find(s => s.row === leaderPos.row && s.column === leaderPos.column)
    || enemySlots.find(s => s.band === 'enemy')!;
  const leaderStats = createBossUnitCombatStats(leaderCfg.stats, 'soldier');
  const leaderCount = leaderCfg.initialCount ?? 1;

  fighters.push({
    id: `enemy:boss:${boss.id}`,
    memberId: `boss:${leaderCfg.id}`,
    side: 'enemy',
    name: leaderCfg.name,
    troopKind: 'soldier',
    mascotId: leaderCfg.mascotId,
    isBoss: true,
    initialCount: leaderCount,
    hp: leaderStats.health * leaderCount,
    maxHp: leaderStats.health * leaderCount,
    stats: leaderStats,
    x: -leaderSlot.x,
    z: -leaderSlot.z,
    facing: teamFacing('enemy'),
    cooldown: 0,
    targetId: null,
    state: 'holding',
  });

  boss.military.forEach((squad, index) => {
    const slot = enemySlots.find(s => s.row === squad.position.row && s.column === squad.position.column)
      || enemySlots[index % enemySlots.length];
    const stats = createBossUnitCombatStats(squad.stats, squad.troopKind);
    const count = squad.count;
    fighters.push({
      id: `enemy:squad:${squad.id}`,
      memberId: `squad:${squad.id}`,
      side: 'enemy',
      name: squad.name ?? (squad.troopKind === 'archer' ? 'Chimera archers' : 'Chimera guards'),
      troopKind: squad.troopKind,
      mascotId: squad.mascotId,
      initialCount: count,
      hp: stats.health * count,
      maxHp: stats.health * count,
      stats,
      x: -slot.x,
      z: -slot.z,
      facing: teamFacing('enemy'),
      cooldown: 0,
      targetId: null,
      state: 'holding',
    });
  });

  return fighters;
}

export function createBattle(army: WorldUnit, enemyCountOrTarget: number | WorldObject | BossConfig = 18, roster: readonly ApiAxie[] = []): Battle {
  const leader = STARTER_HEROES.find(hero => hero.id === army.leaderId);
  const modifiers = leaderTalent(leader)?.modifiers ?? NO_MODIFIERS;

  let boss: BossConfig | undefined;
  let enemyCount = 18;
  if (typeof enemyCountOrTarget === 'number') {
    enemyCount = enemyCountOrTarget;
  } else if (enemyCountOrTarget && typeof enemyCountOrTarget === 'object') {
    if ('leader' in enemyCountOrTarget && 'military' in enemyCountOrTarget) {
      boss = enemyCountOrTarget as BossConfig;
    } else if ('kind' in enemyCountOrTarget) {
      const target = enemyCountOrTarget as WorldObject;
      if (target.kind === 'boss') {
        boss = getBossConfig(target.bossId) ?? defaultBoss();
      } else {
        enemyCount = target.kind === 'garrison' ? 18 : 12;
      }
    }
  }

  const boardRows = activeBattleSettings.boardRows ?? 3;
  const boardColumns = activeBattleSettings.boardColumns ?? 5;
  const neutralRows = Math.round(activeBattleSettings.boardTeamGap ?? 1);
  const hexGap = (activeBattleSettings.boardHexGap ?? 0.35) * 0.22;
  const slots = createHexGridSlots({
    columns: boardColumns,
    hexGap,
    bands: [
      { id: 'enemy', rows: boardRows },
      { id: 'neutral', rows: neutralRows },
      { id: 'player', rows: boardRows },
    ],
  });

  const members: Fighter[] = army.members.map((member, index) => {
    const hero = STARTER_HEROES.find(h => h.id === member.heroId);
    const appearance = roster.find(axie => axie.id === member.heroId);
    const troopKind = member.troopKind ?? 'infantry';
    const profile = hero ? baseCombatStats(activeBattleSettings, 'axie') : (troopKind === 'infantry' || troopKind === 'soldier') ? baseCombatStats(activeBattleSettings, 'soldier') : troopKind === 'archer' ? baseCombatStats(activeBattleSettings, 'archer') : TROOP_COMBAT_STATS.scout;
    const attackInterval = 'attackSpeed' in profile ? 1 / profile.attackSpeed : profile.interval;
    const projectileSpeed = 'projectileSpeed' in profile ? profile.projectileSpeed : troopKind === 'archer' ? activeBattleSettings.baseArcherProjectileSpeed : undefined;
    const isRanged = hero ? (hero.class === 'bird' || hero.class === 'dawn') : troopKind === 'archer';
    const attackRange = isRanged ? activeBattleSettings.rangedAttackRange : activeBattleSettings.meleeAttackRange;
    const base: CombatStats = hero
      ? { ...profile, speed: profile.speed * hero.stats.speed / 100, range: attackRange, interval: attackInterval, radius: activeBattleSettings.bodyRadius, ...(isRanged ? { projectileSpeed: activeBattleSettings.baseArcherProjectileSpeed } : {}) }
      : { ...(TROOP_COMBAT_STATS[troopKind as keyof typeof TROOP_COMBAT_STATS] ?? TROOP_COMBAT_STATS.infantry), health: profile.health, attack: profile.attack, defense: profile.defense, speed: profile.speed, interval: attackInterval, range: attackRange, radius: activeBattleSettings.bodyRadius, ...(projectileSpeed ? { projectileSpeed } : {}) };
    const stats = { ...base, range: base.range * activeBattleSettings.attackRangeMultiplier, radius: base.radius * activeBattleSettings.bodyRadiusMultiplier, health: base.health * modifiers.health, attack: base.attack * modifiers.attack, defense: base.defense * modifiers.defense, speed: base.speed * modifiers.speed, ...(base.projectileSpeed ? { projectileSpeed: base.projectileSpeed } : {}) };

    // Resolve exact tactical hex slot matching the march formation assignment:
    const match = /^hex-(\d+)-(\d+)$/.exec(member.id);
    const formationRow = match ? parseInt(match[1], 10) : Math.floor(index / boardColumns);
    const formationCol = match ? parseInt(match[2], 10) : index % boardColumns;
    const targetBoardRow = boardRows + neutralRows + formationRow;
    const slot = slots.find(s => s.band === 'player' && s.row === targetBoardRow && s.column === formationCol)
      || slots.find(s => s.band === 'player')!;

    // Coordinate convention: in battle.ts, player has negative Z and faces 0 (North).
    // The board scene displays (bx = -x, bz = -z), landing precisely at (slot.x, slot.z).
    const posX = -slot.x;
    const posZ = -slot.z;

    return {
      id: `player:${member.id}`, memberId: member.id, side: 'player',
      armyId: army.id, formationIndex: army.formationIndex,
      ...(appearance ? { appearance: structuredClone(appearance) } : {}),
      name: appearance?.name ?? hero?.name ?? member.troopKind ?? 'Squad',
      heroId: member.heroId, troopKind: member.troopKind, initialCount: member.count,
      hp: stats.health * member.count * (member.healthRatio ?? 1), maxHp: stats.health * member.count,
      stats, x: posX, z: posZ, facing: teamFacing('player'), cooldown: 0, targetId: null, state: 'holding'
    };
  });

  if (boss) {
    const bossFighters = buildBossFighters(boss, slots.filter(s => s.band === 'enemy'));
    members.push(...bossFighters);
  } else {
    // Deploy enemy units symmetrically onto the enemy hex rows:
    // Melee front line (closest to neutral row), archers in middle/back.
    const enemyFrontRow = boardRows - 1;
    const enemyBackRow = 0;
    const enemyPositions = [
      { row: enemyFrontRow, col: 1, kind: 'infantry' as const },
      { row: enemyFrontRow, col: 3, kind: 'infantry' as const },
      { row: enemyBackRow, col: 2, kind: 'archer' as const },
    ];

    for (let index = 0; index < 3; index++) {
      const enemyPos = enemyPositions[index] || { row: enemyFrontRow, col: index % boardColumns, kind: index % 2 === 0 ? 'infantry' : 'archer' };
      const kind = enemyPos.kind;
      const isRanged = kind === 'archer';
      const attackRange = isRanged ? activeBattleSettings.rangedAttackRange : activeBattleSettings.meleeAttackRange;
      const baseline = TROOP_COMBAT_STATS[kind], chimera = baseCombatStats(activeBattleSettings, 'chimera');
      const base = { ...baseline, health: chimera.health, attack: chimera.attack, defense: chimera.defense, speed: chimera.speed, interval: 1 / chimera.attackSpeed, range: attackRange, radius: activeBattleSettings.bodyRadius, ...(isRanged ? { projectileSpeed: activeBattleSettings.baseArcherProjectileSpeed } : {}) };
      const stats = { ...base, range: base.range * activeBattleSettings.attackRangeMultiplier, radius: base.radius * activeBattleSettings.bodyRadiusMultiplier, ...(isRanged ? { projectileSpeed: activeBattleSettings.baseArcherProjectileSpeed } : {}) };

      const slot = slots.find(s => s.band === 'enemy' && s.row === enemyPos.row && s.column === enemyPos.col)
        || slots.find(s => s.band === 'enemy')!;
      const posX = -slot.x;
      const posZ = -slot.z;

      members.push({
        id: `enemy:${index}`, memberId: `${index}`, side: 'enemy',
        name: kind === 'archer' ? 'Chimera archers' : 'Chimera guards',
        troopKind: kind, initialCount: enemyCount,
        hp: stats.health * enemyCount, maxHp: stats.health * enemyCount,
        stats, x: posX, z: posZ, facing: teamFacing('enemy'), cooldown: 0, targetId: null, state: 'holding'
      });
    }
  }

  return { version: 1, layoutVersion: 2, tick: 0, fighters: members, leaderId: members.find(f => f.heroId === army.leaderId)?.id ?? null, skillCooldown: 0, retreating: false, retreatingArmyIds: [], retreatBoundaryZ: getEndBattleConfig().retreatAction.retreatBoundaryZ, result: null, events: [] };
}
export function reinforceBattle(battle: Battle, army: WorldUnit, roster: readonly ApiAxie[] = []): Battle {
  const retreatingArmyIds = battle.retreatingArmyIds?.length ? battle.retreatingArmyIds : (battle.retreating
    ? Array.from(new Set(battle.fighters.filter(f => f.side === 'player').map(f => f.armyId ?? 'primary')))
    : []);
  const leader = STARTER_HEROES.find(hero => hero.id === army.leaderId);
  const modifiers = leaderTalent(leader)?.modifiers ?? NO_MODIFIERS;

  const boardRows = activeBattleSettings.boardRows ?? 3;
  const boardColumns = activeBattleSettings.boardColumns ?? 5;
  const neutralRows = Math.round(activeBattleSettings.boardTeamGap ?? 1);
  const hexGap = (activeBattleSettings.boardHexGap ?? 0.35) * 0.22;
  const slots = createHexGridSlots({
    columns: boardColumns,
    hexGap,
    bands: [
      { id: 'enemy', rows: boardRows },
      { id: 'neutral', rows: neutralRows },
      { id: 'player', rows: boardRows },
    ],
  });

  const playerSlots = slots.filter(s => s.band === 'player');
  const occupied = new Set<string>();
  for (const f of battle.fighters) {
    if (f.side === 'player') {
      const nearest = playerSlots.find(s => Math.hypot(-s.x - f.x, -s.z - f.z) < 0.5);
      if (nearest) occupied.add(`${nearest.row}:${nearest.column}`);
    }
  }

  const reinforcingFighters: Fighter[] = army.members.map((member, index) => {
    const hero = STARTER_HEROES.find(h => h.id === member.heroId);
    const appearance = roster.find(axie => axie.id === member.heroId);
    const troopKind = member.troopKind ?? 'infantry';
    const profile = hero ? baseCombatStats(activeBattleSettings, 'axie') : (troopKind === 'infantry' || troopKind === 'soldier') ? baseCombatStats(activeBattleSettings, 'soldier') : troopKind === 'archer' ? baseCombatStats(activeBattleSettings, 'archer') : TROOP_COMBAT_STATS.scout;
    const attackInterval = 'attackSpeed' in profile ? 1 / profile.attackSpeed : profile.interval;
    const projectileSpeed = 'projectileSpeed' in profile ? profile.projectileSpeed : troopKind === 'archer' ? activeBattleSettings.baseArcherProjectileSpeed : undefined;
    const isRanged = hero ? (hero.class === 'bird' || hero.class === 'dawn') : troopKind === 'archer';
    const attackRange = isRanged ? activeBattleSettings.rangedAttackRange : activeBattleSettings.meleeAttackRange;
    const base: CombatStats = hero
      ? { ...profile, speed: profile.speed * hero.stats.speed / 100, range: attackRange, interval: attackInterval, radius: activeBattleSettings.bodyRadius, ...(isRanged ? { projectileSpeed: activeBattleSettings.baseArcherProjectileSpeed } : {}) }
      : { ...(TROOP_COMBAT_STATS[troopKind as keyof typeof TROOP_COMBAT_STATS] ?? TROOP_COMBAT_STATS.infantry), health: profile.health, attack: profile.attack, defense: profile.defense, speed: profile.speed, interval: attackInterval, range: attackRange, radius: activeBattleSettings.bodyRadius, ...(projectileSpeed ? { projectileSpeed } : {}) };
    const stats = { ...base, range: base.range * activeBattleSettings.attackRangeMultiplier, radius: base.radius * activeBattleSettings.bodyRadiusMultiplier, health: base.health * modifiers.health, attack: base.attack * modifiers.attack, defense: base.defense * modifiers.defense, speed: base.speed * modifiers.speed, ...(base.projectileSpeed ? { projectileSpeed: base.projectileSpeed } : {}) };

    const match = /^hex-(\d+)-(\d+)$/.exec(member.id);
    const formationRow = match ? parseInt(match[1], 10) : Math.floor(index / boardColumns);
    const formationCol = match ? parseInt(match[2], 10) : index % boardColumns;
    const targetBoardRow = boardRows + neutralRows + formationRow;
    const prefKey = `${targetBoardRow}:${formationCol}`;

    let slot = !occupied.has(prefKey) ? playerSlots.find(s => s.row === targetBoardRow && s.column === formationCol) : undefined;
    if (!slot) {
      slot = playerSlots.find(s => !occupied.has(`${s.row}:${s.column}`));
    }

    let posX: number;
    let posZ: number;
    if (slot) {
      occupied.add(`${slot.row}:${slot.column}`);
      posX = -slot.x;
      posZ = -slot.z;
    } else {
      posX = (index - army.members.length / 2) * 1.5;
      posZ = -13;
    }

    const uniqueId = `player:${army.id}:${member.id}`;
    return {
      id: uniqueId, memberId: member.id, side: 'player',
      armyId: army.id, formationIndex: army.formationIndex,
      ...(appearance ? { appearance: structuredClone(appearance) } : {}),
      name: appearance?.name ?? hero?.name ?? member.troopKind ?? 'Squad',
      heroId: member.heroId, troopKind: member.troopKind, initialCount: member.count,
      hp: stats.health * member.count * (member.healthRatio ?? 1), maxHp: stats.health * member.count,
      stats, x: posX, z: posZ, facing: teamFacing('player'), cooldown: 0, targetId: null, state: 'approaching'
    };
  });

  return {
    ...battle,
    retreatingArmyIds,
    fighters: [...battle.fighters, ...reinforcingFighters],
  };
}
export function createSandboxArmy(kind: 'balanced' | 'infantry' | 'archer'): WorldUnit {
  const formation = createEmptyFormation();
  formation.assignments.push({ row: 0, column: 1, heroId: STARTER_HEROES[0].id, military: null, militaryCount: 0 });
  formation.leader = STARTER_HEROES[0].id;
  formation.assignments.push({ row: 0, column: 3, heroId: null, military: kind === 'archer' ? 'archer' : 'infantry', militaryCount: 20 });
  formation.assignments.push({ row: 2, column: 2, heroId: null, military: kind === 'infantry' ? 'infantry' : 'archer', militaryCount: 20 });
  return createArmy(formation, 0, 'sandbox', 'Practice', 3, 'sandbox');
}
export function battleOutcome(battle: Battle): Battle['result'] {
  const livingPlayers = battle.fighters.filter(f => f.side === 'player' && f.hp > 0);
  const player = livingPlayers.length > 0;
  const activePlayer = livingPlayers.some(f => !hasFighterRetreated(battle, f));
  const enemy = battle.fighters.some(f => f.side === 'enemy' && f.hp > 0);
  return !player && !enemy ? 'draw' : !player ? 'defeat' : !enemy ? 'victory'
    : battle.retreating && !activePlayer ? 'retreated'
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
    if (isFighterRetreating(battle, fighter)) {
      fighter.state = 'retreating'; fighter.targetId = null; fighter.facing = RETREAT_FACING;
      fighter.z = Math.max(battleRetreatBoundary(battle), fighter.z - fighter.stats.speed * BATTLE_STEP); continue;
    }
    const origin = previous.fighters.find(f => f.id === fighter.id)!;
    const enemies = previous.fighters.filter(f => f.side !== fighter.side && f.hp > 0 && !hasFighterRetreated(previous, f) && (fighter.side === 'player' || Math.hypot(f.x, f.z - 8) <= activeBattleSettings.leashRadius));
    enemies.sort((a, b) => edgeDistance(origin, a) - edgeDistance(origin, b) || a.id.localeCompare(b.id));
    const usualTarget = enemies.find(e => e.id === fighter.targetId && edgeDistance(origin, e) <= fighter.stats.range) ?? enemies[0];
    const usualRangeTarget = usualTarget && { ...usualTarget, radius: usualTarget.stats.radius };
    const usualDetection = usualRangeTarget && level1CanDetect(origin, usualRangeTarget, activeBattleSettings);
    // Combat events record the source of every applied hit. A fighter that did
    // not see an enemy in its cone still reacts to the unit that damaged it.
    const damageSource = usualDetection ? undefined : previous.events
      .filter(event => event.to === fighter.id && (event.kind === 'hit' || event.kind === 'skill'))
      .map(event => previous.fighters.find(candidate => candidate.id === event.from))
      .filter((candidate): candidate is Fighter => !!candidate && candidate.hp > 0 && candidate.side !== fighter.side)
      .filter(candidate => fighter.side === 'player' || Math.hypot(candidate.x, candidate.z - 8) <= activeBattleSettings.leashRadius)
      .sort((a, b) => edgeDistance(origin, a) - edgeDistance(origin, b) || a.id.localeCompare(b.id))[0];
    const target = damageSource ?? usualTarget;
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
        battle.events.push({ from: fighter.id, to: target.id, amount, kind: 'hit', ...(fighter.stats.projectileSpeed ? { projectileSpeed: fighter.stats.projectileSpeed } : {}) });
        fighter.cooldown = fighter.stats.interval;
      }
    } else {
      const rush = isInDirectionalRange(origin, rangeTarget, activeBattleSettings.level0Range, activeBattleSettings.level0Angle);
      const charge = (rush || fighter.stats.range < 2) && detected;
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
  if (!leader || !skill || previous.result || isFighterRetreating(previous, leader) || previous.skillCooldown > 0) return previous;
  const candidates = previous.fighters.filter(f => f.hp > 0 && (skill.effect === 'heal' ? f.side === leader.side && f.hp < livingCount(f) * f.stats.health : f.side !== leader.side) && edgeDistance(leader, f) <= skill.range);
  candidates.sort((a, b) => skill.effect === 'heal' ? a.hp / a.maxHp - b.hp / b.maxHp : edgeDistance(leader, a) - edgeDistance(leader, b));
  const target = candidates[0];
  if (!target) return previous;
  const amount = skill.effect === 'heal' ? Math.min(livingCount(target) * target.stats.health - target.hp, target.maxHp * skill.power) : damageAfterDefense(leader.stats.attack * skill.power * (leader.heroId && STARTER_HEROES.find(h => h.id === leader.heroId)?.parts.mouth === 'Risky Fish' ? 2 - leader.hp / leader.maxHp : 1), target.stats.defense * (skill.effect === 'pierce' ? 0.5 : 1));
  return finish({ ...previous, skillCooldown: skill.cooldown, events: [{ from: leader.id, to: target.id, amount, kind: skill.effect === 'heal' ? 'heal' : 'skill' }], fighters: previous.fighters.map(f => f.id === target.id ? { ...f, hp: skill.effect === 'heal' ? f.hp + amount : Math.max(0, f.hp - amount) } : { ...f }) });
}
