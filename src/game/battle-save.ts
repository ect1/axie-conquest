import { normalizeCoordinate } from './routes';
import { BattleReplay, beginReplay, restoreReplay } from './battle-replay';
import { fighterWorldPosition } from './battle-world';
import { Battle, battleOutcome, createBattle, livingCount, MAX_BATTLE_TICKS } from './battle';
import { Troops } from './base';
import { WorldUnit, UNITS_SAVE_KEY, restoreUnits, commandUnit } from './units';
import { WORLD_SAVE_KEY, WorldObject, restoreWorld } from './world';
import { getMilitarySaveKey } from './military-service';
import { Formation, FORMATION_ROWS, OFFENSE_FORMATIONS_SAVE_KEY } from './offense-formations';

export const BATTLE_SAVE_KEY = 'axie-conquest-battle-v1';
export const BATTLE_TRANSACTION_KEY = 'axie-conquest-battle-transaction-v1';
export type BattleSession = { army: WorldUnit; target: WorldObject; battle: Battle; startedAt?: number; replay?: BattleReplay };
export type BattleReport = { result: NonNullable<Battle['result']>; target: string; seconds: number; losses: { infantry: number; archer: number }; survivors: number;
  id?: string; completedAt?: number; location?: { x: number; z: number }; armyName?: string; replay?: BattleReplay;
  members?: { name: string; side: 'player' | 'enemy'; starting: number; surviving: number; damage: number; healing: number; skills: number }[];
};
export type BattleSave = { active: BattleSession | null; report: BattleReport | null; reports?: BattleReport[] };
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
      members: Array.isArray(r.members) && r.members.length <= 64 && r.members.every(m => m && typeof m.name === 'string' && ['player', 'enemy'].includes(m.side) && [m.starting, m.surviving, m.damage, m.healing, m.skills].every(v => Number.isFinite(v) && v >= 0)) ? r.members : undefined,
    }));
  } catch { return []; }
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function enemyStrength(target: WorldObject): number { return target.kind === 'boss' ? 30 : target.kind === 'garrison' ? 18 : 12; }
export function createBattleSession(army: WorldUnit, target: WorldObject): BattleSession {
  const battle = createBattle(army, enemyStrength(target));
  const distance = Math.hypot(target.x - army.position.x, target.z - army.position.z);
  for (const fighter of battle.fighters) if (fighter.side === 'player') fighter.z += 16 - distance;
  return { army: structuredClone(army), target: { ...target }, battle, startedAt: Date.now(), replay: beginReplay(battle) };
}
export function restoreBattleSave(raw: string | null, troops: Troops): BattleSave {
  const empty: BattleSave = { active: null, report: null };
  if (!raw) return empty;
  try {
    const saved = JSON.parse(raw) as BattleSave;
    if (!saved || typeof saved !== 'object') return empty;
    empty.report = readBattleReports(raw)[0] ?? null;
    if (!saved.active) return empty;
    const { army, target, battle } = saved.active;
    if (!restoreUnits(JSON.stringify([army]), troops, 0).length || army.order || army.activity?.action !== 'attack' || army.activity.targetId !== target.id) return empty;
    if (!restoreWorld(JSON.stringify([target]))?.length || target.state !== 'defended' || !['boss', 'garrison', 'village'].includes(target.kind)) return empty;
    const initial = createBattle(army, enemyStrength(target));
    if (battle.version !== 1 || !Number.isSafeInteger(battle.tick) || battle.tick < 0 || battle.tick > MAX_BATTLE_TICKS || typeof battle.retreating !== 'boolean' || !Number.isFinite(battle.skillCooldown) || battle.skillCooldown < 0 || battle.skillCooldown > 15 || battle.leaderId !== initial.leaderId || ![null, 'victory', 'defeat', 'retreated', 'draw'].includes(battle.result)) return empty;
    if (!Array.isArray(battle.fighters) || battle.fighters.length !== initial.fighters.length) return empty;
    for (let i = 0; i < initial.fighters.length; i++) {
      const f = battle.fighters[i], base = initial.fighters[i];
      if (!f || f.id !== base.id || f.name !== base.name || f.side !== base.side || f.memberId !== base.memberId || f.heroId !== base.heroId || f.troopKind !== base.troopKind || f.initialCount !== base.initialCount || f.maxHp !== base.maxHp || JSON.stringify(f.stats) !== JSON.stringify(base.stats)) return empty;
      if (![f.hp, f.x, f.z, f.facing, f.cooldown].every(Number.isFinite) || f.hp < 0 || f.hp > f.maxHp || Math.abs(f.x) > 100 || Math.abs(f.z) > 100 || f.cooldown < 0 || f.cooldown > f.stats.interval || (f.targetId !== null && !initial.fighters.some(other => other.id === f.targetId)) || !['holding', 'approaching', 'charging', 'attacking', 'retreating', 'defeated'].includes(f.state)) return empty;
    }
    if (battle.result && battle.result !== battleOutcome(battle)) return empty;
    const replay = restoreReplay(saved.active.replay);
    const compatible = replay && replay.initial.fighters.every((f, i) => f.id === battle.fighters[i]?.id) && replay.initial.fighters.length === battle.fighters.length && replay.frames[replay.frames.length - 1].tick <= battle.tick;
    return { active: { army, target, battle: { ...battle, events: [] }, startedAt: Number.isFinite(saved.active.startedAt) ? saved.active.startedAt : undefined, replay: compatible ? replay : beginReplay(battle) }, report: empty.report };
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
  const losses = { infantry: 0, archer: 0 };
  const players = session.battle.fighters.filter(f => f.side === 'player');
  for (const fighter of players) if (fighter.troopKind === 'infantry' || fighter.troopKind === 'archer') losses[fighter.troopKind] += fighter.initialCount - livingCount(fighter);
  const nextTroops = { ...troops, infantry: Math.max(0, troops.infantry - losses.infantry), archer: Math.max(0, troops.archer - losses.archer) };
  const members = session.army.members.flatMap(member => {
    const fighter = players.find(f => f.memberId === member.id)!;
    const count = livingCount(fighter);
    // Heroes are knocked out, never removed from the collection; they recover at home.
    return member.heroId ? [{ ...member, healthRatio: fighter.hp / fighter.maxHp }] : count ? [{ ...member, count, healthRatio: fighter.hp / (count * fighter.stats.health) }] : [];
  });
  const living = players.filter(fighter => fighter.hp > 0);
  const positions = living.map(fighter => fighterWorldPosition(session, fighter));
  const position = positions.length ? { x: positions.reduce((sum, p) => sum + p.x, 0) / positions.length, z: positions.reduce((sum, p) => sum + p.z, 0) / positions.length } : session.army.position;
  const surviving = { ...session.army, position: normalizeCoordinate(position)!, members, activity: undefined, order: null, status: 'holding' as const };
  // A winning army remains deployed and commandable; defeated/retreating armies recover at home.
  const returning = session.battle.result === 'victory' ? surviving : commandUnit(surviving, 'return', now);
  const nextUnits = units.map(unit => unit.id === session.army.id ? returning : unit);
  const nextFormations = formations.map((formation, index) => {
    if (index !== session.army.formationIndex) return formation;
    const next = structuredClone(formation);
    for (const row of FORMATION_ROWS) next[row] = next[row].map((slot, column) => {
      const fighter = players.find(f => f.memberId === `${row}-${column}`);
      if (!fighter?.troopKind) return slot;
      const count = livingCount(fighter);
      return { ...slot, military: count ? slot.military : null, militaryCount: count };
    });
    return next;
  });
  const nextObjects = objects.map(object => object.id === session.target.id && session.battle.result === 'victory' ? { ...object, state: 'defeated' as const } : object);
  const events = session.replay?.frames.flatMap(frame => frame.events) ?? [];
  const report: BattleReport = { result: session.battle.result, target: session.target.kind, seconds: session.battle.tick / 10, losses, survivors: players.reduce((sum, fighter) => sum + livingCount(fighter), 0),
    id: `${session.army.id}:${session.startedAt ?? now}`, completedAt: now, location: { x: session.target.x, z: session.target.z }, armyName: session.army.name,
    replay: session.replay?.result === session.battle.result ? session.replay : undefined,
    members: session.battle.fighters.map(f => ({ name: f.name, side: f.side, starting: f.initialCount, surviving: livingCount(f),
      damage: events.filter(e => e.from === f.id && e.kind !== 'heal').reduce((sum, e) => sum + e.amount, 0),
      healing: events.filter(e => e.from === f.id && e.kind === 'heal').reduce((sum, e) => sum + e.amount, 0),
      skills: events.filter(e => e.from === f.id && e.kind !== 'hit').length,
    })),
  };
  const reports = [report, ...readBattleReports(storage.getItem(BATTLE_SAVE_KEY)).filter(r => r.id !== report.id)].slice(0, MAX_BATTLE_REPORTS);
  // Bound the archive to leave space for the next recording and unrelated game saves.
  while (reports.length > 1 && JSON.stringify(reports).length > 900_000) reports.pop();
  if (JSON.stringify(reports).length > 900_000) report.replay = undefined;
  const save: BattleSave = { active: null, report, reports };
  const entries = [[getMilitarySaveKey(session.army.cityId), JSON.stringify(nextTroops)], [UNITS_SAVE_KEY, JSON.stringify(nextUnits)], [OFFENSE_FORMATIONS_SAVE_KEY, JSON.stringify(nextFormations)], [WORLD_SAVE_KEY, JSON.stringify(nextObjects)], [BATTLE_SAVE_KEY, JSON.stringify(save)]];
  storage.setItem(BATTLE_TRANSACTION_KEY, JSON.stringify(entries));
  recoverBattleTransaction(storage);
  return { troops: nextTroops, units: nextUnits, formations: nextFormations, objects: nextObjects, report, reports };
}
