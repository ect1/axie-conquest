import { restoreAxieRoster } from './axie-roster';
import { Battle, Fighter, MAX_BATTLE_TICKS } from './battle';

const STATES: Fighter['state'][] = [
  'holding', 'approaching', 'charging', 'attacking', 'retreating',
  'defeated', 'marching', 'searching', 'roaming'
];

export type RecordedUnit = [hp: number, x: number, z: number, facing: number, stateIndex: number, targetIndex: number];
export type ReplayFrame = { tick: number; units: RecordedUnit[]; events: Battle['events'] };
export type BattleReplay = {
  version: 1;
  initial: Battle;
  frames: ReplayFrame[];
  pending: Battle['events'];
  result: Battle['result'];
};

const round = (value: number) => Math.round(value * 1000) / 1000;

function frame(battle: Battle, events = battle.events): ReplayFrame {
  return {
    tick: battle.tick,
    units: battle.fighters.map(f => [
      Math.max(0, round(f.hp)),
      round(f.x),
      round(f.z),
      round(f.facing),
      Math.max(0, STATES.indexOf(f.state)),
      battle.fighters.findIndex(t => t.id === f.targetId),
    ]),
    events: events.map(e => ({ ...e })),
  };
}

export function beginReplay(battle: Battle): BattleReplay {
  return {
    version: 1,
    initial: structuredClone(battle),
    frames: [frame(battle, [])],
    pending: [],
    result: battle.result,
  };
}

/** Record observations without running duplicate simulations. Samples every 2 ticks or on resolution. */
export function recordReplay(replay: BattleReplay, battle: Battle): BattleReplay {
  if (battle.tick <= replay.frames[replay.frames.length - 1].tick) return replay;
  const pending = [...replay.pending, ...battle.events];
  if (battle.tick % 2 && !battle.result) return { ...replay, pending };
  return {
    ...replay,
    frames: [...replay.frames, frame(battle, pending)],
    pending: [],
    result: battle.result,
  };
}

/** Reconstruct battle snapshot at the given frame index for scene playback. */
export function replayBattleAt(replay: BattleReplay, index: number): Battle {
  const clamped = Math.max(0, Math.min(index, replay.frames.length - 1));
  const current = replay.frames[clamped];
  return {
    ...replay.initial,
    tick: current.tick,
    events: current.events,
    result: clamped >= replay.frames.length - 1 ? replay.result : null,
    fighters: replay.initial.fighters.map((fighter, i) => {
      const [hp, x, z, facing, stateIndex, targetIndex] = current.units[i];
      return {
        ...fighter,
        hp,
        x,
        z,
        facing,
        state: STATES[stateIndex] ?? 'holding',
        targetId: replay.initial.fighters[targetIndex]?.id ?? null,
      };
    }),
  };
}

/**
 * Tactical presentation transform: returns the battle directly as coordinates
 * are already aligned with the 3D hex-board layout.
 */
export function replayPresentationBattle(_replay: BattleReplay, battle: Battle): Battle {
  return battle;
}

/** Safe deserialization for local save storage. */
export function restoreReplay(value: unknown): BattleReplay | undefined {
  try {
    const r = value as BattleReplay;
    const initial = r.initial;
    if (
      r.version !== 1 ||
      !initial ||
      !Array.isArray(initial.fighters) ||
      !initial.fighters.length ||
      initial.fighters.length > 64 ||
      !Array.isArray(r.frames) ||
      !r.frames.length ||
      r.frames.length > MAX_BATTLE_TICKS / 2 + 2 ||
      ![null, 'victory', 'defeat', 'retreated', 'draw'].includes(r.result)
    ) {
      return;
    }

    const ids = new Set<string>();
    for (const f of initial.fighters) {
      if (
        !f ||
        typeof f.id !== 'string' ||
        ids.has(f.id) ||
        typeof f.name !== 'string' ||
        !['player', 'enemy'].includes(f.side) ||
        !Number.isSafeInteger(f.initialCount) ||
        f.initialCount <= 0 ||
        !Number.isFinite(f.maxHp) ||
        f.maxHp <= 0 ||
        !f.stats ||
        !([
          'health', 'attack', 'defense', 'speed', 'range', 'interval', 'radius'
        ] as const).every(k => {
          const val = f.stats[k];
          return val !== undefined && Number.isFinite(val) && val >= 0;
        }) ||
        f.stats.health <= 0 ||
        f.stats.radius > 10
      ) {
        return;
      }
      ids.add(f.id);
    }

    const validEvents = (events: Battle['events']) =>
      Array.isArray(events) &&
      events.length <= 512 &&
      events.every(
        e =>
          e &&
          ids.has(e.from) &&
          ids.has(e.to) &&
          ['hit', 'skill', 'heal'].includes(e.kind) &&
          Number.isFinite(e.amount) &&
          e.amount >= 0 &&
          (e.projectileSpeed === undefined || Number.isFinite(e.projectileSpeed))
      );

    let tick = -1;
    for (const f of r.frames) {
      if (
        !Number.isInteger(f.tick) ||
        f.tick <= tick ||
        f.tick > MAX_BATTLE_TICKS ||
        !Array.isArray(f.units) ||
        f.units.length !== initial.fighters.length ||
        !validEvents(f.events)
      ) {
        return;
      }
      if (
        !f.units.every(
          (u, i) =>
            Array.isArray(u) &&
            u.length === 6 &&
            u.every(Number.isFinite) &&
            u[0] >= 0 &&
            u[0] <= initial.fighters[i].maxHp &&
            Math.abs(u[1]) <= 100 &&
            Math.abs(u[2]) <= 100 &&
            Number.isInteger(u[4]) &&
            !!STATES[u[4]] &&
            Number.isInteger(u[5]) &&
            u[5] >= -1 &&
            u[5] < initial.fighters.length
        )
      ) {
        return;
      }
      tick = f.tick;
    }

    if (!validEvents(r.pending)) return;

    return {
      ...r,
      initial: {
        ...initial,
        fighters: initial.fighters.map(f => {
          const appearance = restoreAxieRoster(
            JSON.stringify({ version: 1, syncedAt: 0, axies: [f.appearance] })
          )?.axies[0];
          return { ...f, appearance: appearance?.id === f.heroId ? appearance : undefined };
        }),
      },
    };
  } catch {
    return;
  }
}
