import { ApiAxie, restoreAxieRoster } from './axie-roster';
import { normalizeCoordinate } from './routes';
import { BattleReplay, beginReplay, restoreReplay } from './battle-replay';
import { fighterWorldPosition } from './battle-world';
import { Battle, battleOutcome, createBattle, reinforceBattle, livingCount, MAX_BATTLE_TICKS } from './battle';
import { Troops } from './base';
import { WorldUnit, UNITS_SAVE_KEY, restoreUnits, commandUnit } from './units';
import { WORLD_SAVE_KEY, WorldObject, restoreWorld } from './world';
import { getMilitarySaveKey } from './military-service';
import { Formation, OFFENSE_FORMATIONS_SAVE_KEY, serializeOffenseFormations } from './offense-formations';

export const BATTLE_SAVE_KEY = 'axie-conquest-battle-v1';
export const BATTLE_TRANSACTION_KEY = 'axie-conquest-battle-transaction-v1';
export type BattleSession = {
  id?: string;
  army: WorldUnit;
  armies?: WorldUnit[];
  target: WorldObject;
  battle: Battle;
  startedAt?: number;
  replay?: BattleReplay;
};
export type BattleReport = {
  result: NonNullable<Battle['result']>;
  target: string;
  seconds: number;
  losses: { infantry: number; archer: number };
  survivors: number;
  id?: string;
  completedAt?: number;
  location?: { x: number; z: number };
  armyName?: string;
  armies?: {
    id: string;
    name: string;
    leaderId?: string | null;
    losses: { infantry: number; archer: number };
    survivors: number;
    damage: number;
    healing: number;
  }[];
  replay?: BattleReplay;
  members?: {
    name: string;
    side: 'player' | 'enemy';
    starting: number;
    surviving: number;
    damage: number;
    healing: number;
    skills: number;
    formationName?: string;
    armyId?: string;
  }[];
};
export type BattleSave = { active: BattleSession | null; sessions?: BattleSession[]; report: BattleReport | null; reports?: BattleReport[] };
export const MAX_BATTLE_REPORTS = 5;
function validReport(value: unknown): value is BattleReport {
  const r = value as BattleReport;
  return !!r && ['victory', 'defeat', 'draw', 'retreated'].includes(r.result) && typeof r.target === 'string' && [r.seconds, r.survivors, r.losses?.infantry, r.losses?.archer].every(v => Number.isFinite(v) && v >= 0);
}
export function readBattleReports(raw: string | null): BattleReport[] {
  try {
    const saved = JSON.parse(raw || '{}');
    const entries: unknown[] = Array.isArray(saved.reports) ? saved.reports : saved.report ? [saved.report] : [];
    return entries.filter(validReport).slice(0, MAX_BATTLE_REPORTS).map(r => ({ ...r, replay: restoreReplay(r.replay),
      location: r.location && [r.location.x, r.location.z].every(Number.isFinite) ? r.location : undefined,
      completedAt: Number.isFinite(r.completedAt) ? r.completedAt : undefined,
      armyName: typeof r.armyName === 'string' ? r.armyName : undefined,
      armies: Array.isArray(r.armies) ? r.armies : undefined,
      members: Array.isArray(r.members) && r.members.length <= 64 && r.members.every(m => m && typeof m.name === 'string' && ['player', 'enemy'].includes(m.side) && [m.starting, m.surviving, m.damage, m.healing, m.skills].every(v => Number.isFinite(v) && v >= 0)) ? r.members : undefined,
    }));
  } catch { return []; }
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function enemyStrength(target: WorldObject): number { return target.kind === 'boss' ? 30 : target.kind === 'garrison' ? 18 : 12; }
export function createBattleSession(army: WorldUnit, target: WorldObject, roster: readonly ApiAxie[] = []): BattleSession {
  const battle = createBattle(army, target, roster);
  const startedAt = Date.now();
  const id = `${army.id}:${target.id}:${startedAt}`;
  return { id, army: structuredClone(army), armies: [structuredClone(army)], target: { ...target }, battle, startedAt, replay: beginReplay(battle) };
}
export function reinforceBattleSession(session: BattleSession, reinforcingArmy: WorldUnit, roster: readonly ApiAxie[] = []): BattleSession {
  const armies = session.armies && session.armies.length ? [...session.armies] : [session.army];
  if (armies.some(a => a.id === reinforcingArmy.id)) return session;
  const nextArmies = [...armies, structuredClone(reinforcingArmy)];
  const nextBattle = reinforceBattle(session.battle, reinforcingArmy, roster);
  return {
    ...session,
    armies: nextArmies,
    battle: nextBattle,
  };
}
export function validateBattleSession(entry: unknown, troops: Troops): BattleSession | null {
  if (!entry || typeof entry !== 'object') return null;
  const s = entry as BattleSession;
  const { army, target, battle } = s;
  if (!army || !target || !battle) return null;
  const armies = Array.isArray(s.armies) && s.armies.length > 0 ? s.armies : [army];
  for (const a of armies) {
    if (!restoreUnits(JSON.stringify([a]), troops, 0).length || a.order || a.activity?.action !== 'attack' || a.activity.targetId !== target.id) return null;
  }
  if (!restoreWorld(JSON.stringify([target]))?.length || target.state !== 'defended' || !['boss', 'garrison', 'village'].includes(target.kind)) return null;
  const roster = restoreAxieRoster(JSON.stringify({ version: 1, syncedAt: 0, axies: battle.fighters?.flatMap(f => f.appearance && f.appearance.id === f.heroId ? [f.appearance] : []) }))?.axies ?? [];
  let initial = createBattle(armies[0], target, roster);
  if (target.kind === 'boss' && (!battle.fighters?.some(f => f.isBoss) && battle.fighters?.length === 3)) {
    initial = createBattle(armies[0], enemyStrength(target), roster);
  }
  for (let i = 1; i < armies.length; i++) {
    initial = reinforceBattle(initial, armies[i], roster);
  }
  if (battle.version !== 1 || (battle.layoutVersion !== undefined && battle.layoutVersion !== 2) || !Number.isSafeInteger(battle.tick) || battle.tick < 0 || battle.tick > MAX_BATTLE_TICKS || typeof battle.retreating !== 'boolean' || !Number.isFinite(battle.skillCooldown) || battle.skillCooldown < 0 || battle.skillCooldown > 15 || battle.leaderId !== initial.leaderId || ![null, 'victory', 'defeat', 'retreated', 'draw'].includes(battle.result)) return null;
  if (!Array.isArray(battle.fighters) || battle.fighters.length !== initial.fighters.length) return null;
  for (let i = 0; i < initial.fighters.length; i++) {
    const f = battle.fighters[i], base = initial.fighters[i];
    if (!f || f.id !== base.id || f.name !== base.name || f.side !== base.side || f.memberId !== base.memberId || f.heroId !== base.heroId || f.troopKind !== base.troopKind || f.initialCount !== base.initialCount || f.maxHp !== base.maxHp || JSON.stringify(f.stats) !== JSON.stringify(base.stats)) return null;
    if (![f.hp, f.x, f.z, f.facing, f.cooldown].every(Number.isFinite) || f.hp < 0 || f.hp > f.maxHp || Math.abs(f.x) > 100 || Math.abs(f.z) > 100 || f.cooldown < 0 || f.cooldown > f.stats.interval || (f.targetId !== null && !initial.fighters.some(other => other.id === f.targetId)) || !['holding', 'approaching', 'charging', 'attacking', 'retreating', 'defeated', 'marching', 'searching', 'roaming'].includes(f.state)) return null;
  }
  if (battle.result && battle.result !== battleOutcome(battle)) return null;
  const legacyShift = 16 - Math.hypot(target.x - army.position.x, target.z - army.position.z);
  const restoredBattle: Battle = battle.layoutVersion === 2 ? battle : {
    ...battle,
    layoutVersion: 2,
    fighters: battle.fighters.map(fighter => fighter.side === 'player' ? { ...fighter, z: fighter.z - legacyShift } : fighter),
  };
  const replay = restoreReplay(s.replay);
  const compatible = replay && replay.initial.fighters.every((f, i) => f.id === restoredBattle.fighters[i]?.id) && replay.initial.fighters.length === restoredBattle.fighters.length && replay.frames[replay.frames.length - 1].tick <= restoredBattle.tick;
  const startedAt = Number.isFinite(s.startedAt) ? s.startedAt : undefined;
  const id = typeof s.id === 'string' && s.id ? s.id : `${army.id}:${target.id}:${startedAt ?? 0}`;
  return { id, army, armies, target, battle: { ...restoredBattle, events: [] }, startedAt, replay: compatible ? replay : beginReplay(restoredBattle) };
}
export function restoreBattleSave(raw: string | null, troops: Troops): BattleSave {
  const empty: BattleSave = { active: null, report: null };
  if (!raw) return empty;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return empty;
    const report = readBattleReports(raw)[0] ?? null;
    const reports = readBattleReports(raw);
    const rawSessions: unknown[] = Array.isArray(saved.sessions) ? saved.sessions : saved.active ? [saved.active] : [];
    const sessions: BattleSession[] = [];
    for (const entry of rawSessions) {
      const restored = validateBattleSession(entry, troops);
      if (restored && !sessions.some(s => s.id === restored.id || s.army.id === restored.army.id)) {
        sessions.push(restored);
      }
    }
    if (sessions.length === 0) return { active: null, report, ...(reports.length ? { reports } : {}) };
    return { active: sessions[0], sessions, report, reports };
  } catch { return empty; }
}
function allowedTransactionKey(key: string): boolean {
  return [BATTLE_SAVE_KEY, UNITS_SAVE_KEY, OFFENSE_FORMATIONS_SAVE_KEY, WORLD_SAVE_KEY].includes(key) || /^axie-conquest-city-.+-troops-v1$/.test(key);
}
/** Write-ahead journal: every operation is an absolute replacement, safe to replay after interruption. */
export function recoverBattleTransaction(storage: StorageAccess): void {
  const raw = storage.getItem(BATTLE_TRANSACTION_KEY);
  if (!raw) return;
  const entries: unknown = JSON.parse(raw);
  if (!Array.isArray(entries) || !entries.every(entry => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && allowedTransactionKey(entry[0]) && typeof entry[1] === 'string')) throw new Error('Battle recovery data is invalid. Reset game data to start again.');
  for (const [key, value] of entries as [string, string][]) storage.setItem(key, value);
  storage.removeItem(BATTLE_TRANSACTION_KEY);
}
export function commitBattleOutcome(storage: StorageAccess, session: BattleSession, units: WorldUnit[], troops: Troops, formations: Formation[], objects: WorldObject[], now: number) {
  if (!session.battle.result) throw new Error('The battle is still running.');
  const participantArmies = session.armies && session.armies.length ? session.armies : [session.army];
  const losses = { infantry: 0, archer: 0 };
  const players = session.battle.fighters.filter(f => f.side === 'player');
  const living = players.filter(fighter => fighter.hp > 0);
  const positions = living.map(fighter => fighterWorldPosition(session, fighter));
  const defaultPosition = positions.length ? { x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length, z: positions.reduce((sum, p) => sum + p.z, 0) / positions.length } : session.army.position;

  let nextUnits = [...units];
  let nextFormations = [...formations];
  const armiesBreakdown: NonNullable<BattleReport['armies']> = [];
  const events = session.replay?.frames.flatMap(frame => frame.events) ?? [];

  for (const army of participantArmies) {
    const armyFighters = players.filter(f => f.armyId === army.id || (!f.armyId && army.id === session.army.id));
    const armyLosses = { infantry: 0, archer: 0 };
    for (const f of armyFighters) {
      if (f.troopKind === 'infantry' || f.troopKind === 'archer') {
        const lost = f.initialCount - livingCount(f);
        armyLosses[f.troopKind] += lost;
        losses[f.troopKind] += lost;
      }
    }
    const members = army.members.flatMap(member => {
      const fighter = armyFighters.find(f => f.memberId === member.id);
      if (!fighter) return [];
      const count = livingCount(fighter);
      return member.heroId ? [{ ...member, healthRatio: fighter.hp / fighter.maxHp }] : count ? [{ ...member, count, healthRatio: fighter.hp / (count * fighter.stats.health) }] : [];
    });
    const surviving = { ...army, position: normalizeCoordinate(defaultPosition)!, members, activity: undefined, order: null, status: 'holding' as const };
    const returning = session.battle.result === 'victory' ? surviving : commandUnit(surviving, 'return', now);
    nextUnits = nextUnits.map(unit => unit.id === army.id ? returning : unit);

    if (army.formationIndex !== undefined) {
      nextFormations = nextFormations.map((formation, index) => {
        if (index !== army.formationIndex) return formation;
        const next = structuredClone(formation);
        next.assignments = next.assignments.map(slot => {
          const fighter = armyFighters.find(f => f.memberId === `hex-${slot.row}-${slot.column}`);
          if (!fighter?.troopKind) return slot;
          const count = livingCount(fighter);
          return { ...slot, military: count ? slot.military : null, militaryCount: count };
        });
        return next;
      });
    }

    armiesBreakdown.push({
      id: army.id,
      name: army.name,
      leaderId: army.leaderId,
      losses: armyLosses,
      survivors: armyFighters.reduce((sum, f) => sum + livingCount(f), 0),
      damage: events.filter(e => armyFighters.some(f => f.id === e.from) && e.kind !== 'heal').reduce((sum, e) => sum + e.amount, 0),
      healing: events.filter(e => armyFighters.some(f => f.id === e.from) && e.kind === 'heal').reduce((sum, e) => sum + e.amount, 0),
    });
  }

  const nextTroops = { ...troops, infantry: Math.max(0, troops.infantry - losses.infantry), archer: Math.max(0, troops.archer - losses.archer) };
  const nextObjects = objects.map(object => object.id === session.target.id && session.battle.result === 'victory' ? { ...object, state: 'defeated' as const } : object);

  const report: BattleReport = {
    result: session.battle.result,
    target: session.target.kind,
    seconds: session.battle.tick / 10,
    losses,
    survivors: players.reduce((sum, fighter) => sum + livingCount(fighter), 0),
    id: `${session.army.id}:${session.startedAt ?? now}`,
    completedAt: now,
    location: { x: session.target.x, z: session.target.z },
    armyName: participantArmies.map(a => a.name).join(' + '),
    armies: armiesBreakdown.length > 1 ? armiesBreakdown : undefined,
    replay: session.replay?.result === session.battle.result ? session.replay : undefined,
    members: session.battle.fighters.map(f => {
      const parentArmy = participantArmies.find(a => a.id === f.armyId) ?? (f.side === 'player' ? participantArmies[0] : undefined);
      return {
        name: f.name,
        side: f.side,
        starting: f.initialCount,
        surviving: livingCount(f),
        damage: events.filter(e => e.from === f.id && e.kind !== 'heal').reduce((sum, e) => sum + e.amount, 0),
        healing: events.filter(e => e.from === f.id && e.kind === 'heal').reduce((sum, e) => sum + e.amount, 0),
        skills: events.filter(e => e.from === f.id && e.kind !== 'hit').length,
        formationName: parentArmy?.name,
        armyId: f.armyId,
      };
    }),
  };

  const reports = [report, ...readBattleReports(storage.getItem(BATTLE_SAVE_KEY)).filter(r => r.id !== report.id)].slice(0, MAX_BATTLE_REPORTS);
  while (reports.length > 1 && JSON.stringify(reports).length > 900_000) reports.pop();
  if (JSON.stringify(reports).length > 900_000) report.replay = undefined;

  const currentSave = restoreBattleSave(storage.getItem(BATTLE_SAVE_KEY), nextTroops);
  const remainingSessions = (currentSave.sessions ?? (currentSave.active ? [currentSave.active] : []))
    .filter(s => s.id !== session.id && !participantArmies.some(a => a.id === s.army.id));
  const save: BattleSave = { active: remainingSessions[0] ?? null, sessions: remainingSessions, report, reports };

  const entries = [
    [getMilitarySaveKey(session.army.cityId), JSON.stringify(nextTroops)],
    [UNITS_SAVE_KEY, JSON.stringify(nextUnits)],
    [OFFENSE_FORMATIONS_SAVE_KEY, serializeOffenseFormations(nextFormations)],
    [WORLD_SAVE_KEY, JSON.stringify(nextObjects)],
    [BATTLE_SAVE_KEY, JSON.stringify(save)],
  ];
  storage.setItem(BATTLE_TRANSACTION_KEY, JSON.stringify(entries));
  recoverBattleTransaction(storage);
  return { troops: nextTroops, units: nextUnits, formations: nextFormations, objects: nextObjects, report, reports, sessions: remainingSessions };
}
