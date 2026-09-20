import portalData from './portal-config.json';
import { Coordinate, createRoute, marchTravelTimeMs } from './routes';
import { BossConfig, BossLeaderConfig, BossMilitarySquad, clearDynamicBosses, registerDynamicBoss } from './bosses';
import { activeBattleSettings } from './battle-settings';
import { WorldUnit, getUnitFormationBodyRadius, isUnitTargetable, unitPosition } from './units';

export const PORTAL_CONFIG_SAVE_KEY = 'axie-conquest-portal-config-v1';
export const PORTAL_STATE_SAVE_KEY = 'axie-conquest-portal-state-v1';

export type PortalMobKind = 'mascot' | 'soldier' | 'archer';

export type PortalMobBaseStats = {
  health: number;
  attack: number;
  defense: number;
  attackSpeed: number;
  moveSpeed: number;
  attackRange: number;
};

export type PortalLevelScaling = {
  statsMultiplierPerLevel: number;
  mobsCountMultiplierPerLevel: number;
  summonNewPortalEveryLevel: number;
  newPortalIndependentLevel: boolean;
  subPortal?: {
    destroyable: boolean;
    maxSubportal?: number;
    lastDestroyedRespwanOnTimer?: boolean;
    lastDestroyedRespawnOnTimer?: boolean;
    lastDestroyedBackToLevel1?: boolean;
    respawnTimerSeconds?: number;
  };
};

export type PortalMobSummoningConfig = {
  enabled: boolean;
  paused?: boolean;
  aggressiveOnPath?: boolean;
  initialPortalCoordinate: {
    x: number;
    y: number;
  };
  initialAttackInSeconds: number;
  attackIntervalSeconds: number;
  exhaustedEveryMobLevel: number;
  exhaustedSeconds: number;
  starterMobCount: number;
  initialMoveSpeed?: number;
  maxMoveSpeed: number;
  portalLevelScaling: PortalLevelScaling;
  mobTypes: Record<PortalMobKind, { baseStats: PortalMobBaseStats }>;
};

export type PortalConfigFile = {
  portalMobSummoning: PortalMobSummoningConfig;
};

export const DEFAULT_PORTAL_CONFIG: PortalMobSummoningConfig = (portalData as PortalConfigFile).portalMobSummoning;

export type PortalCycleState = 'initial_countdown' | 'interval_countdown' | 'exhausted' | 'active_wave' | 'disabled' | 'paused';

export type FormationSlotSquad = {
  id: string;
  row: number;
  column: number;
  kind: PortalMobKind;
  count: number;
  mascotId?: string;
  offset: Coordinate;
  stats: PortalMobBaseStats;
};

export type PortalWaveFormation = {
  level: number;
  totalMascot: number;
  totalSoldier: number;
  totalArcher: number;
  totalMobs: number;
  slots: FormationSlotSquad[];
};

export type PortalInstance = {
  id: string;
  name: string;
  level: number;
  coordinate: Coordinate; // { x, z } in Babylon 3D world space
  cycleState: PortalCycleState;
  nextAttackTime: number; // ms timestamp
  upcomingFormation: PortalWaveFormation;
  defenderFormation?: PortalWaveFormation;
  createdAt: number;
  activeMarchId?: string | null;
};

export type EnemyMarch = {
  id: string;
  portalId: string;
  portalName: string;
  level: number;
  name: string;
  ownerId: 'portal';
  origin: Coordinate;
  destination: Coordinate;
  startedAt: number;
  arrivesAt: number;
  speed: number;
  formation: PortalWaveFormation;
  status?: 'marching' | 'arrived' | 'fighting' | 'defeated';
  fightingPosition?: Coordinate;
  /** Remaining HP ratios keyed by the generated boss fighter member id. */
  defenderHealth?: Record<string, number>;
};

export type DestroyedSubportalRecord = {
  id: string;
  name: string;
  coordinate: Coordinate;
  level: number;
  destroyedAt: number;
  respawnAt: number;
};

export type PortalRuntimeState = {
  portals: PortalInstance[];
  activeEnemyMarches: EnemyMarch[];
  lastDestroyedSubportal?: DestroyedSubportalRecord | null;
};

export const MASCOT_HERO_IDS = ['kotaro', 'paladill', 'tripp', 'xia', 'bing', 'kibo', 'pomodoro'] as const;

export function sanitizePortalConfig(raw: unknown): PortalMobSummoningConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PORTAL_CONFIG };
  const candidate = raw as Partial<PortalMobSummoningConfig>;
  const coord = candidate.initialPortalCoordinate ?? DEFAULT_PORTAL_CONFIG.initialPortalCoordinate;
  const scaling = candidate.portalLevelScaling ?? DEFAULT_PORTAL_CONFIG.portalLevelScaling;
  const mobTypes = candidate.mobTypes ?? DEFAULT_PORTAL_CONFIG.mobTypes;

  const rawSub = scaling?.subPortal as any;
  const defaultSub = DEFAULT_PORTAL_CONFIG.portalLevelScaling.subPortal as any;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_PORTAL_CONFIG.enabled,
    paused: typeof candidate.paused === 'boolean' ? candidate.paused : false,
    aggressiveOnPath: typeof candidate.aggressiveOnPath === 'boolean' ? candidate.aggressiveOnPath : (DEFAULT_PORTAL_CONFIG.aggressiveOnPath ?? true),
    initialPortalCoordinate: {
      x: Number.isFinite(coord?.x) ? coord.x : DEFAULT_PORTAL_CONFIG.initialPortalCoordinate.x,
      y: Number.isFinite(coord?.y) ? coord.y : DEFAULT_PORTAL_CONFIG.initialPortalCoordinate.y,
    },
    initialAttackInSeconds: Math.max(1, Number(candidate.initialAttackInSeconds) || DEFAULT_PORTAL_CONFIG.initialAttackInSeconds),
    attackIntervalSeconds: Math.max(1, Number(candidate.attackIntervalSeconds) || DEFAULT_PORTAL_CONFIG.attackIntervalSeconds),
    exhaustedEveryMobLevel: Math.max(1, Math.round(Number(candidate.exhaustedEveryMobLevel) || DEFAULT_PORTAL_CONFIG.exhaustedEveryMobLevel)),
    exhaustedSeconds: Math.max(1, Number(candidate.exhaustedSeconds) || DEFAULT_PORTAL_CONFIG.exhaustedSeconds),
    starterMobCount: Math.max(1, Math.round(Number(candidate.starterMobCount) || DEFAULT_PORTAL_CONFIG.starterMobCount)),
    initialMoveSpeed: Math.max(0.1, Number(candidate.initialMoveSpeed) || (DEFAULT_PORTAL_CONFIG.initialMoveSpeed ?? 0.5)),
    maxMoveSpeed: Math.max(0.5, Number(candidate.maxMoveSpeed) || DEFAULT_PORTAL_CONFIG.maxMoveSpeed),
    portalLevelScaling: {
      statsMultiplierPerLevel: Math.max(1.0, Number(scaling?.statsMultiplierPerLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.statsMultiplierPerLevel),
      mobsCountMultiplierPerLevel: Math.max(1.0, Number(scaling?.mobsCountMultiplierPerLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.mobsCountMultiplierPerLevel),
      summonNewPortalEveryLevel: Math.max(1, Math.round(Number(scaling?.summonNewPortalEveryLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.summonNewPortalEveryLevel)),
      newPortalIndependentLevel: typeof scaling?.newPortalIndependentLevel === 'boolean' ? scaling.newPortalIndependentLevel : DEFAULT_PORTAL_CONFIG.portalLevelScaling.newPortalIndependentLevel,
      subPortal: {
        destroyable: typeof rawSub?.destroyable === 'boolean' ? rawSub.destroyable : (defaultSub?.destroyable ?? false),
        maxSubportal: Math.max(1, Math.round(Number(rawSub?.maxSubportal) || (defaultSub?.maxSubportal ?? 10))),
        lastDestroyedRespwanOnTimer: typeof rawSub?.lastDestroyedRespwanOnTimer === 'boolean'
          ? rawSub.lastDestroyedRespwanOnTimer
          : (typeof rawSub?.lastDestroyedRespawnOnTimer === 'boolean'
            ? rawSub.lastDestroyedRespawnOnTimer
            : (defaultSub?.lastDestroyedRespwanOnTimer ?? defaultSub?.lastDestroyedRespawnOnTimer ?? true)),
        lastDestroyedBackToLevel1: typeof rawSub?.lastDestroyedBackToLevel1 === 'boolean'
          ? rawSub.lastDestroyedBackToLevel1
          : (defaultSub?.lastDestroyedBackToLevel1 ?? true),
        respawnTimerSeconds: Number.isFinite(rawSub?.respawnTimerSeconds) ? Number(rawSub.respawnTimerSeconds) : undefined,
      },
    },
    mobTypes: {
      mascot: { baseStats: { ...DEFAULT_PORTAL_CONFIG.mobTypes.mascot.baseStats, ...(mobTypes?.mascot?.baseStats || {}) } },
      soldier: { baseStats: { ...DEFAULT_PORTAL_CONFIG.mobTypes.soldier.baseStats, ...(mobTypes?.soldier?.baseStats || {}) } },
      archer: { baseStats: { ...DEFAULT_PORTAL_CONFIG.mobTypes.archer.baseStats, ...(mobTypes?.archer?.baseStats || {}) } },
    },
  };
}

export function restorePortalConfig(saved: string | null): PortalMobSummoningConfig {
  if (!saved) return { ...DEFAULT_PORTAL_CONFIG };
  try {
    return sanitizePortalConfig(JSON.parse(saved));
  } catch {
    return { ...DEFAULT_PORTAL_CONFIG };
  }
}

export function calculateLevelMobCount(level: number, config: PortalMobSummoningConfig): number {
  const mult = config.portalLevelScaling.mobsCountMultiplierPerLevel;
  return Math.max(1, Math.round(config.starterMobCount * Math.pow(mult, Math.max(0, level - 1))));
}

export function calculateLevelStats(baseStats: PortalMobBaseStats, level: number, config: PortalMobSummoningConfig): PortalMobBaseStats {
  const mult = Math.pow(config.portalLevelScaling.statsMultiplierPerLevel, Math.max(0, level - 1));
  const baseSpeed = config.initialMoveSpeed ?? baseStats.moveSpeed;
  const rawSpeed = baseSpeed * mult;
  return {
    health: Math.round(baseStats.health * mult),
    attack: Math.round(baseStats.attack * mult),
    defense: Math.round(baseStats.defense * mult),
    attackSpeed: Number((baseStats.attackSpeed * (1 + (mult - 1) * 0.2)).toFixed(2)),
    moveSpeed: Number(Math.min(config.maxMoveSpeed, rawSpeed).toFixed(2)),
    attackRange: baseStats.attackRange,
  };
}

/**
 * Generates a randomized tactical formation for a given wave level:
 * - Computes total mobs
 * - Randomly distributes total count among Mascot, Soldier, and Archer
 * - Randomly distributes the quantities across tactical grid positions (row 0: archers, row 1: mascots/center, row 2: soldiers/vanguard)
 */
export function generateWaveFormation(
  level: number,
  config: PortalMobSummoningConfig,
  random = Math.random
): PortalWaveFormation {
  const totalMobs = calculateLevelMobCount(level, config);

  // Mascot count: 1 base, chance of 2 at level >= 5, 3 at level >= 10
  const maxMascots = Math.min(3, 1 + Math.floor(level / 5));
  const totalMascot = Math.min(totalMobs, Math.max(1, 1 + Math.floor(random() * maxMascots)));

  const remaining = Math.max(0, totalMobs - totalMascot);

  let totalSoldier = 0;
  let totalArcher = 0;

  if (remaining <= 0) {
    totalSoldier = 0;
    totalArcher = 0;
  } else if (remaining === 1) {
    if (random() < 0.6) totalSoldier = 1;
    else totalArcher = 1;
  } else {
    // Random ratio between 40% and 70% soldiers
    const soldierRatio = 0.4 + random() * 0.3;
    totalSoldier = Math.max(1, Math.round(remaining * soldierRatio));
    totalArcher = Math.max(1, remaining - totalSoldier);
  }

  // Tactical formation grid: 3 rows (0 = rear/archers, 1 = mid/mascots, 2 = front/vanguard), 5 columns (0..4)
  const slots: FormationSlotSquad[] = [];

  // 1. Distribute Mascots to middle row (row 1, center columns)
  const mascotCols = [2, 1, 3, 0, 4];
  const mascotStats = calculateLevelStats(config.mobTypes.mascot.baseStats, level, config);
  for (let i = 0; i < totalMascot; i++) {
    const col = mascotCols[i % mascotCols.length];
    const mascotId = MASCOT_HERO_IDS[Math.floor(random() * MASCOT_HERO_IDS.length)];
    slots.push({
      id: `slot-mascot-${i}`,
      row: 1,
      column: col,
      kind: 'mascot',
      count: 1,
      mascotId,
      offset: {
        x: (col - 2) * 1.5 + (random() - 0.5) * 0.3,
        z: 0 + (random() - 0.5) * 0.3,
      },
      stats: mascotStats,
    });
  }

  // Helper to partition count into random chunks across available slots
  function partitionCount(total: number, minSlots: number, maxSlots: number): number[] {
    if (total <= 0) return [];
    const numSlots = Math.max(1, Math.min(total, minSlots + Math.floor(random() * (maxSlots - minSlots + 1))));
    if (numSlots === 1) return [total];

    const portions: number[] = new Array(numSlots).fill(1);
    let left = total - numSlots;
    while (left > 0) {
      const idx = Math.floor(random() * numSlots);
      const add = Math.min(left, 1 + Math.floor(random() * Math.max(1, Math.ceil(left / 2))));
      portions[idx] += add;
      left -= add;
    }
    return portions;
  }

  // 2. Distribute Soldiers across front row (row 2) and optionally front-flanks
  if (totalSoldier > 0) {
    const soldierCols = [1, 2, 3, 0, 4];
    // Shuffle columns slightly for variety
    for (let i = soldierCols.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [soldierCols[i], soldierCols[j]] = [soldierCols[j], soldierCols[i]];
    }
    const soldierPartitions = partitionCount(totalSoldier, 2, 4);
    const soldierStats = calculateLevelStats(config.mobTypes.soldier.baseStats, level, config);

    soldierPartitions.forEach((count, idx) => {
      const col = soldierCols[idx % soldierCols.length];
      slots.push({
        id: `slot-soldier-${idx}`,
        row: 2,
        column: col,
        kind: 'soldier',
        count,
        offset: {
          x: (col - 2) * 1.5 + (random() - 0.5) * 0.4,
          z: 1.8 + (random() - 0.5) * 0.4,
        },
        stats: soldierStats,
      });
    });
  }

  // 3. Distribute Archers across rear row (row 0)
  if (totalArcher > 0) {
    const archerCols = [2, 1, 3, 0, 4];
    for (let i = archerCols.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [archerCols[i], archerCols[j]] = [archerCols[j], archerCols[i]];
    }
    const archerPartitions = partitionCount(totalArcher, 2, 4);
    const archerStats = calculateLevelStats(config.mobTypes.archer.baseStats, level, config);

    archerPartitions.forEach((count, idx) => {
      const col = archerCols[idx % archerCols.length];
      slots.push({
        id: `slot-archer-${idx}`,
        row: 0,
        column: col,
        kind: 'archer',
        count,
        offset: {
          x: (col - 2) * 1.5 + (random() - 0.5) * 0.4,
          z: -1.8 + (random() - 0.5) * 0.4,
        },
        stats: archerStats,
      });
    });
  }

  return {
    level,
    totalMascot,
    totalSoldier,
    totalArcher,
    totalMobs,
    slots,
  };
}

export function generateNewPortalCoordinate(existingPortals: readonly PortalInstance[], random = Math.random): Coordinate {
  // Generate a coordinate around the world map (~60-85 units away from city center 0,0)
  // in a distinct quadrant from existing portals
  const existingAngles = existingPortals.map(p => Math.atan2(p.coordinate.z, p.coordinate.x));

  for (let attempt = 0; attempt < 50; attempt++) {
    const angle = random() * Math.PI * 2;
    const distance = 65 + random() * 20;
    const x = Number((Math.cos(angle) * distance).toFixed(1));
    const z = Number((Math.sin(angle) * distance).toFixed(1));

    const tooClose = existingPortals.some(p => Math.hypot(p.coordinate.x - x, p.coordinate.z - z) < 30);
    if (!tooClose) {
      return { x, z };
    }
  }

  // Fallback offset
  const count = existingPortals.length;
  const fallbackAngle = (count * 2 * Math.PI) / 3 + Math.PI / 4;
  return {
    x: Number((Math.cos(fallbackAngle) * 75).toFixed(1)),
    z: Number((Math.sin(fallbackAngle) * 75).toFixed(1)),
  };
}

/**
 * Computes a destination coordinate stopping outside the city walls/perimeter
 * along the vector connecting the city center and the portal origin.
 */
export function computeOutsideCityDestination(
  origin: Coordinate | { x: number; y?: number; z?: number },
  cityCenter: Coordinate | { x: number; y?: number; z?: number } = { x: 0, z: 0 },
  padding = 3.0
): Coordinate {
  const ox = Number.isFinite(origin?.x) ? origin.x : 0;
  const oz = Number.isFinite((origin as any)?.z) ? (origin as any).z : Number.isFinite((origin as any)?.y) ? (origin as any).y : 0;
  const cx = Number.isFinite(cityCenter?.x) ? cityCenter.x : 0;
  const cz = Number.isFinite((cityCenter as any)?.z) ? (cityCenter as any).z : Number.isFinite((cityCenter as any)?.y) ? (cityCenter as any).y : 0;

  const dx = ox - cx;
  const dz = oz - cz;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return { x: cx + 24, z: cz };

  const ux = dx / dist;
  const uz = dz / dist;

  // City wall boundary extents: halfWidth = 21.5, halfDepth = 11.5
  const halfW = 21.5;
  const halfD = 11.5;

  const scaleX = Math.abs(ux) > 1e-4 ? halfW / Math.abs(ux) : Infinity;
  const scaleZ = Math.abs(uz) > 1e-4 ? halfD / Math.abs(uz) : Infinity;
  const edgeDist = Math.min(scaleX, scaleZ) + padding;

  const finalDist = Math.min(dist, edgeDist);
  return {
    x: Number((cx + ux * finalDist).toFixed(1)),
    z: Number((cz + uz * finalDist).toFixed(1)),
  };
}

export function createInitialPortalState(config: PortalMobSummoningConfig, now = Date.now()): PortalRuntimeState {
  const primeCoord = {
    x: config.initialPortalCoordinate.x,
    z: config.initialPortalCoordinate.y,
  };

  const isDestroyable = !!config.portalLevelScaling.subPortal?.destroyable;
  const upcoming = generateWaveFormation(1, config);

  const primePortal: PortalInstance = {
    id: 'portal-prime',
    name: 'Prime Rift Portal',
    level: 1,
    coordinate: primeCoord,
    cycleState: config.enabled ? 'initial_countdown' : 'disabled',
    nextAttackTime: now + config.initialAttackInSeconds * 1000,
    upcomingFormation: upcoming,
    defenderFormation: isDestroyable ? JSON.parse(JSON.stringify(upcoming)) : undefined,
    createdAt: now,
  };

  return {
    portals: [primePortal],
    activeEnemyMarches: [],
    lastDestroyedSubportal: null,
  };
}

export function restorePortalState(raw: string | null, config: PortalMobSummoningConfig, now = Date.now()): PortalRuntimeState {
  if (!raw) return createInitialPortalState(config, now);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.portals) || parsed.portals.length === 0) {
      return createInitialPortalState(config, now);
    }
    const isDestroyable = !!config.portalLevelScaling.subPortal?.destroyable;
    const portals: PortalInstance[] = parsed.portals.map((p: any, idx: number) => {
      const upcoming = p.upcomingFormation && Array.isArray(p.upcomingFormation.slots)
        ? p.upcomingFormation
        : generateWaveFormation(Math.max(1, Math.round(Number(p.level) || 1)), config);
      const defender = p.defenderFormation && Array.isArray(p.defenderFormation.slots)
        ? p.defenderFormation
        : (isDestroyable ? JSON.parse(JSON.stringify(upcoming)) : undefined);
      return {
        id: typeof p.id === 'string' ? p.id : `portal-${idx + 1}`,
        name: typeof p.name === 'string' ? p.name : `Rift Portal ${idx + 1}`,
        level: Math.max(1, Math.round(Number(p.level) || 1)),
        coordinate: {
          x: Number.isFinite(p.coordinate?.x) ? p.coordinate.x : config.initialPortalCoordinate.x,
          z: Number.isFinite(p.coordinate?.z) ? p.coordinate.z : config.initialPortalCoordinate.y,
        },
        cycleState: ['initial_countdown', 'interval_countdown', 'exhausted', 'active_wave', 'disabled', 'paused'].includes(p.cycleState)
          ? p.cycleState
          : 'initial_countdown',
        nextAttackTime: Number.isFinite(p.nextAttackTime) ? p.nextAttackTime : now + config.initialAttackInSeconds * 1000,
        upcomingFormation: upcoming,
        defenderFormation: defender,
        createdAt: Number.isFinite(p.createdAt) ? p.createdAt : now,
        activeMarchId: typeof p.activeMarchId === 'string' ? p.activeMarchId : null,
      };
    });

    const activeEnemyMarches: EnemyMarch[] = Array.isArray(parsed.activeEnemyMarches)
      ? parsed.activeEnemyMarches.filter((m: any) => m && m.id && typeof m.startedAt === 'number').map((m: any) => {
        const defenderHealth = m.defenderHealth && typeof m.defenderHealth === 'object'
          ? Object.fromEntries(Object.entries(m.defenderHealth).filter(([id, value]) => id && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)) as Record<string, number>
          : undefined;
        return { ...m, ...(defenderHealth && Object.keys(defenderHealth).length ? { defenderHealth } : {}) };
      })
      : [];

    activeEnemyMarches.forEach(m => {
      try {
        registerDynamicBoss(portalFormationToBossConfig(m));
      } catch { /* ignore */ }
    });

    portals.filter(p => p.id !== 'portal-prime').forEach(p => {
      try {
        registerDynamicBoss(subPortalDefenderToBossConfig(p));
      } catch { /* ignore */ }
    });

    const lastDestroyedSubportal: DestroyedSubportalRecord | null = parsed.lastDestroyedSubportal && typeof parsed.lastDestroyedSubportal.id === 'string'
      ? {
          id: parsed.lastDestroyedSubportal.id,
          name: parsed.lastDestroyedSubportal.name || 'Sub-portal',
          coordinate: {
            x: Number(parsed.lastDestroyedSubportal.coordinate?.x) || 0,
            z: Number(parsed.lastDestroyedSubportal.coordinate?.z) || 0,
          },
          level: Math.max(1, Number(parsed.lastDestroyedSubportal.level) || 1),
          destroyedAt: Number(parsed.lastDestroyedSubportal.destroyedAt) || now,
          respawnAt: Number(parsed.lastDestroyedSubportal.respawnAt) || now,
        }
      : null;

    return { portals, activeEnemyMarches, lastDestroyedSubportal };
  } catch {
    return createInitialPortalState(config, now);
  }
}

/**
 * Computes current enemy march position along route.
 * Locks position when engaged in battle ('fighting' status).
 */
export function enemyMarchPosition(march: EnemyMarch, now: number): Coordinate {
  if (march.status === 'fighting' && march.fightingPosition) {
    return { ...march.fightingPosition };
  }
  if (march.status === 'arrived' || now >= march.arrivesAt) {
    return { ...march.destination };
  }
  const duration = Math.max(1, march.arrivesAt - march.startedAt);
  const progress = Math.max(0, Math.min(1, (now - march.startedAt) / duration));
  return {
    x: march.origin.x + (march.destination.x - march.origin.x) * progress,
    z: march.origin.z + (march.destination.z - march.origin.z) * progress,
  };
}

/**
 * Computes the overall formation body radius for an enemy wave march.
 * Accounts for wave slot offsets and the active unit body radius.
 */
export function getEnemyFormationBodyRadius(march: EnemyMarch): number {
  const memberRadius = (activeBattleSettings?.bodyRadius ?? 0.5) * (activeBattleSettings?.bodyRadiusMultiplier ?? 1.0);
  const slots = march.formation?.slots;
  if (!slots || slots.length === 0) {
    return 3.75; // Standard default matching portal scene hit cylinder (diameter 7.5 / 2)
  }
  let maxDist = 0;
  for (const slot of slots) {
    const dist = Math.hypot(slot.offset.x, slot.offset.z);
    if (dist > maxDist) {
      maxDist = dist;
    }
  }
  return maxDist + memberRadius;
}

/**
 * Computes shortest distance from point P to line segment A -> B.
 */
export function distancePointToSegment(p: Coordinate, a: Coordinate, b: Coordinate): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-6) {
    return Math.hypot(p.x - a.x, p.z - a.z);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / lenSq));
  const projX = a.x + t * dx;
  const projZ = a.z + t * dz;
  return Math.hypot(p.x - projX, p.z - projZ);
}

/**
 * Checks whether an enemy march encounters a player unit along its path.
 * Compares swept-segment distance from the enemy march against the combined
 * formation body radius of both formations.
 */
export function checkFormationPathEncounter(
  enemyMarch: EnemyMarch,
  enemyPrevPos: Coordinate,
  enemyCurrPos: Coordinate,
  playerUnit: WorldUnit,
  playerPos: Coordinate
): boolean {
  const enemyRadius = getEnemyFormationBodyRadius(enemyMarch);
  const playerRadius = getUnitFormationBodyRadius(playerUnit);
  const combinedRadius = enemyRadius + playerRadius;
  const dist = distancePointToSegment(playerPos, enemyPrevPos, enemyCurrPos);
  return dist <= combinedRadius;
}

export type MarchEncounter = {
  march: EnemyMarch;
  unit: WorldUnit;
  encounterPosition: Coordinate;
};

/**
 * Sweeps all active marching enemy mobs against deployed player armies.
 * Detects encounters based on formation body radius and returns any new engagements.
 */
export function detectEnemyMarchEncounters(
  now: number,
  marches: readonly EnemyMarch[],
  units: readonly WorldUnit[],
  activeBattleSessionTargetIds: ReadonlySet<string> = new Set(),
  activeBattleUnitIds: ReadonlySet<string> = new Set(),
  lastMarchPositions: ReadonlyMap<string, Coordinate> = new Map()
): MarchEncounter[] {
  const encounters: MarchEncounter[] = [];
  const engagedMarchIds = new Set<string>();
  const engagedUnitIds = new Set<string>();

  for (const march of marches) {
    if (march.status !== 'marching' || activeBattleSessionTargetIds.has(march.id) || engagedMarchIds.has(march.id)) {
      continue;
    }

    const currPos = enemyMarchPosition(march, now);
    const prevPos = lastMarchPositions.get(march.id) ?? currPos;

    for (const unit of units) {
      if (
        unit.kind !== 'army' ||
        unit.status === 'home' ||
        !isUnitTargetable(unit, now) ||
        activeBattleUnitIds.has(unit.id) ||
        engagedUnitIds.has(unit.id)
      ) {
        continue;
      }

      const playerPos = unitPosition(unit, now);
      if (checkFormationPathEncounter(march, prevPos, currPos, unit, playerPos)) {
        encounters.push({
          march,
          unit,
          encounterPosition: { ...currPos },
        });
        engagedMarchIds.add(march.id);
        engagedUnitIds.add(unit.id);
        break;
      }
    }
  }

  return encounters;
}

/**
 * Updates portal cycles, spawns waves, triggers new portals, and retains arrived marches outside the city.
 * Ensures sequential "one at a time" wave spawning per portal: no new mobs will respawn while current mobs are active.
 */
export function stepPortalSystem(
  now: number,
  state: PortalRuntimeState,
  config: PortalMobSummoningConfig,
  cityDestination: Coordinate = { x: 0, z: 0 },
  random = Math.random
): {
  state: PortalRuntimeState;
  newMarchesSpawned: EnemyMarch[];
  arrivedMarchesCount: number;
} {
  if (!config.enabled) {
    const portals = state.portals.map(p => ({ ...p, cycleState: 'disabled' as const }));
    return { state: { ...state, portals }, newMarchesSpawned: [], arrivedMarchesCount: 0 };
  }

  // 1. Process active marches: do NOT remove arrived marches (they stop outside the city!)
  const remainingMarches: EnemyMarch[] = [];
  let arrivedCount = 0;

  for (const march of state.activeEnemyMarches) {
    if (march.status === 'fighting') {
      remainingMarches.push(march);
      continue;
    }
    const isArrived = now >= march.arrivesAt;
    if (isArrived && march.status !== 'arrived') {
      arrivedCount++;
    }
    remainingMarches.push({
      ...march,
      status: isArrived ? 'arrived' : 'marching',
    });
  }

  const newMarches: EnemyMarch[] = [];
  const updatedPortals: PortalInstance[] = [];
  const newPortalsToAppend: PortalInstance[] = [];
  let nextPortalIndex = state.portals.length + 1;
  let lastDestroyedSubportal = state.lastDestroyedSubportal ?? null;

  // Handle timed respawn of last destroyed sub-portal
  if (
    !config.paused &&
    lastDestroyedSubportal &&
    now >= lastDestroyedSubportal.respawnAt
  ) {
    const maxSub = config.portalLevelScaling.subPortal?.maxSubportal ?? 10;
    const currentSubCount = [...state.portals, ...newPortalsToAppend].filter(p => p.id !== 'portal-prime').length;
    if (currentSubCount < maxSub && !state.portals.some(p => p.id === lastDestroyedSubportal!.id)) {
      const respawnUpcoming = generateWaveFormation(lastDestroyedSubportal.level, config, random);
      const isDestroyable = !!config.portalLevelScaling.subPortal?.destroyable;
      const respawned: PortalInstance = {
        id: lastDestroyedSubportal.id,
        name: lastDestroyedSubportal.name,
        level: lastDestroyedSubportal.level,
        coordinate: { ...lastDestroyedSubportal.coordinate },
        cycleState: 'initial_countdown',
        nextAttackTime: now + config.initialAttackInSeconds * 1000,
        upcomingFormation: respawnUpcoming,
        defenderFormation: isDestroyable ? JSON.parse(JSON.stringify(respawnUpcoming)) : undefined,
        createdAt: now,
        activeMarchId: null,
      };
      newPortalsToAppend.push(respawned);
    }
    lastDestroyedSubportal = null;
  }

  for (const portal of state.portals) {
    let currentPortal = { ...portal };

    // If disabled, activate
    if (currentPortal.cycleState === 'disabled') {
      currentPortal.cycleState = 'initial_countdown';
      currentPortal.nextAttackTime = now + config.initialAttackInSeconds * 1000;
    }

    // Check if this portal currently has an active squad marching or arrived outside city
    const hasActiveMarch = remainingMarches.some(m => m.portalId === currentPortal.id);
    const waveJustFinished =
      currentPortal.cycleState === 'active_wave' && !hasActiveMarch;

    if (waveJustFinished) {
      // Current wave has ended (defeated / cleared).
      // Now progress level and initiate interval or exhausted countdown.
      const justFinishedLevel = currentPortal.level;
      const nextLevel = justFinishedLevel + 1;

      // Check exhaustion
      const isExhausted = justFinishedLevel % config.exhaustedEveryMobLevel === 0;
      const cycleState: PortalCycleState = isExhausted ? 'exhausted' : 'interval_countdown';
      const delaySec = isExhausted ? config.exhaustedSeconds : config.attackIntervalSeconds;

      const isDestroyable = !!config.portalLevelScaling.subPortal?.destroyable;
      const nextUpcoming = generateWaveFormation(nextLevel, config, random);

      currentPortal = {
        ...currentPortal,
        level: nextLevel,
        cycleState,
        nextAttackTime: now + delaySec * 1000,
        upcomingFormation: nextUpcoming,
        defenderFormation: isDestroyable ? JSON.parse(JSON.stringify(nextUpcoming)) : undefined,
        activeMarchId: null,
      };

      // Check if this portal reached level 10 (or multiples of summonNewPortalEveryLevel)
      const maxSub = config.portalLevelScaling.subPortal?.maxSubportal ?? 10;
      const currentSubCount = [...state.portals, ...newPortalsToAppend].filter(p => p.id !== 'portal-prime').length;
      const shouldSummonNewPortal =
        config.portalLevelScaling.summonNewPortalEveryLevel > 0 &&
        justFinishedLevel % config.portalLevelScaling.summonNewPortalEveryLevel === 0 &&
        currentSubCount < maxSub;

      if (shouldSummonNewPortal) {
        const newCoord = generateNewPortalCoordinate([...state.portals, ...updatedPortals, ...newPortalsToAppend], random);
        const startLevel = config.portalLevelScaling.newPortalIndependentLevel ? 1 : nextLevel;
        const subUpcoming = generateWaveFormation(startLevel, config, random);
        const newPortal: PortalInstance = {
          id: `portal-${nextPortalIndex}`,
          name: `Rift Portal ${nextPortalIndex}`,
          level: startLevel,
          coordinate: newCoord,
          cycleState: 'initial_countdown',
          nextAttackTime: now + config.initialAttackInSeconds * 1000,
          upcomingFormation: subUpcoming,
          defenderFormation: isDestroyable ? JSON.parse(JSON.stringify(subUpcoming)) : undefined,
          createdAt: now,
          activeMarchId: null,
        };
        nextPortalIndex++;
        newPortalsToAppend.push(newPortal);
      }
    } else if (hasActiveMarch) {
      // Mobs are still marching or alive outside city: wait till mobs are defeated or gone.
      // Do NOT spawn any new wave!
      currentPortal.cycleState = 'active_wave';
    } else if (!config.paused && now >= currentPortal.nextAttackTime) {
      // Countdown completed and no active mobs: spawn wave for currentPortal.level
      const stopDestination = computeOutsideCityDestination(currentPortal.coordinate, cityDestination);
      const route = createRoute(stopDestination, currentPortal.coordinate);

      const baseSpeed = config.initialMoveSpeed ?? 0.5;
      const speedMult = Math.pow(config.portalLevelScaling.statsMultiplierPerLevel, Math.max(0, currentPortal.level - 1));
      const marchSpeed = Math.min(config.maxMoveSpeed, Math.max(0.1, Number((baseSpeed * speedMult).toFixed(2))));
      const travelTime = marchTravelTimeMs(route, marchSpeed);

      const march: EnemyMarch = {
        id: `portal-march-${portal.id}-w${currentPortal.level}-${now}`,
        portalId: currentPortal.id,
        portalName: currentPortal.name,
        level: currentPortal.level,
        name: `${currentPortal.name} · Wave ${currentPortal.level}`,
        ownerId: 'portal',
        origin: { ...currentPortal.coordinate },
        destination: stopDestination,
        startedAt: now,
        arrivesAt: now + travelTime,
        speed: marchSpeed,
        formation: currentPortal.upcomingFormation,
        status: 'marching',
      };
      newMarches.push(march);
      remainingMarches.push(march);

      currentPortal.cycleState = 'active_wave';
      currentPortal.activeMarchId = march.id;
    }

    updatedPortals.push(currentPortal);
  }

  if (newPortalsToAppend.length > 0) {
    updatedPortals.push(...newPortalsToAppend);
    newPortalsToAppend.forEach(p => {
      try {
        registerDynamicBoss(subPortalDefenderToBossConfig(p));
      } catch { /* ignore */ }
    });
  }

  newMarches.forEach(m => {
    try {
      registerDynamicBoss(portalFormationToBossConfig(m));
    } catch { /* ignore */ }
  });

  return {
    state: {
      portals: updatedPortals,
      activeEnemyMarches: remainingMarches,
      lastDestroyedSubportal,
    },
    newMarchesSpawned: newMarches,
    arrivedMarchesCount: arrivedCount,
  };
}

/**
 * Manually or tactically defeats an enemy march on the map.
 * Removes the march and triggers the originating portal to progress its wave and start cooldown.
 */
export function defeatEnemyMarch(
  marchId: string,
  state: PortalRuntimeState,
  config: PortalMobSummoningConfig,
  now = Date.now(),
  cityDestination: Coordinate = { x: 0, z: 0 },
  random = Math.random
): { state: PortalRuntimeState; defeatedMarch?: EnemyMarch } {
  const march = state.activeEnemyMarches.find(m => m.id === marchId);
  if (!march) return { state };

  const remainingMarches = state.activeEnemyMarches.filter(m => m.id !== marchId);
  const stepResult = stepPortalSystem(
    now,
    { ...state, activeEnemyMarches: remainingMarches },
    config,
    cityDestination,
    random
  );

  return {
    state: stepResult.state,
    defeatedMarch: march,
  };
}

/**
 * Converts an EnemyMarch wave formation into a structured BossConfig
 * compatible with the battle simulation engine.
 */
export function portalFormationToBossConfig(march: EnemyMarch): BossConfig {
  const mascots = march.formation.slots.filter(s => s.kind === 'mascot');
  const nonMascots = march.formation.slots.filter(s => s.kind !== 'mascot');
  const mainMascot = mascots[0];

  const leader: BossLeaderConfig = {
    id: `portal-leader-${march.id}`,
    name: mainMascot ? `Hostile ${mainMascot.mascotId?.toUpperCase() || 'Mascot'} (Lv. ${march.level})` : `Hostile Vanguard (Lv. ${march.level})`,
    modelKind: 'mascot',
    mascotId: mainMascot?.mascotId || 'kotaro',
    position: { row: mainMascot?.row ?? 1, column: mainMascot?.column ?? 2 },
    initialCount: 1,
    stats: mainMascot ? {
      health: mainMascot.stats.health,
      attack: mainMascot.stats.attack,
      defense: mainMascot.stats.defense,
      attackSpeed: mainMascot.stats.attackSpeed,
      speed: mainMascot.stats.moveSpeed,
      range: mainMascot.stats.attackRange,
    } : { health: 150, attack: 20, defense: 10, speed: 3.5 },
  };

  const military: BossMilitarySquad[] = [];
  for (let i = 1; i < mascots.length; i++) {
    const m = mascots[i];
    military.push({
      id: `portal-mascot-${i}-${march.id}`,
      name: `Hostile ${m.mascotId?.toUpperCase() || 'Mascot'}`,
      troopKind: 'soldier',
      count: 1,
      mascotId: m.mascotId || 'paladill',
      position: { row: m.row, column: m.column },
      stats: {
        health: m.stats.health,
        attack: m.stats.attack,
        defense: m.stats.defense,
        attackSpeed: m.stats.attackSpeed,
        speed: m.stats.moveSpeed,
        range: m.stats.attackRange,
      },
    });
  }

  nonMascots.forEach((slot, idx) => {
    military.push({
      id: `portal-squad-${idx}-${march.id}`,
      name: slot.kind === 'archer' ? `Rift Archers (Lv. ${march.level})` : `Rift Soldiers (Lv. ${march.level})`,
      troopKind: slot.kind === 'archer' ? 'archer' : 'soldier',
      count: slot.count,
      position: { row: slot.row, column: slot.column },
      stats: {
        health: slot.stats.health,
        attack: slot.stats.attack,
        defense: slot.stats.defense,
        attackSpeed: slot.stats.attackSpeed,
        speed: slot.stats.moveSpeed,
        range: slot.stats.attackRange,
      },
    });
  });

  return {
    id: `portal-boss-${march.id}`,
    name: march.name,
    title: `Void Rift Wave ${march.level}`,
    description: `Hostile forces spawned from ${march.portalName}.`,
    leader,
    military,
  };
}

/**
 * Converts a Sub-portal's defender formation into a structured BossConfig
 * for defending the portal when attacked by player formations.
 */
export function subPortalDefenderToBossConfig(portal: PortalInstance): BossConfig {
  // Defenders mirror the portal's current/upcoming attacking wave formation
  const formation = portal.upcomingFormation;
  const mascots = formation.slots.filter(s => s.kind === 'mascot');
  const nonMascots = formation.slots.filter(s => s.kind !== 'mascot');
  const mainMascot = mascots[0];

  const leader: BossLeaderConfig = {
    id: `portal-guardian-${portal.id}`,
    name: mainMascot ? `Guardian ${mainMascot.mascotId?.toUpperCase() || 'Mascot'} (Lv. ${portal.level})` : `Rift Guardian (Lv. ${portal.level})`,
    modelKind: 'mascot',
    mascotId: mainMascot?.mascotId || 'kotaro',
    position: { row: mainMascot?.row ?? 1, column: mainMascot?.column ?? 2 },
    initialCount: 1,
    stats: mainMascot ? {
      health: Math.round(mainMascot.stats.health * 1.5),
      attack: mainMascot.stats.attack,
      defense: mainMascot.stats.defense,
      attackSpeed: mainMascot.stats.attackSpeed,
      speed: mainMascot.stats.moveSpeed,
      range: mainMascot.stats.attackRange,
    } : { health: 250, attack: 22, defense: 12, speed: 3.5 },
  };

  const military: BossMilitarySquad[] = [];
  for (let i = 1; i < mascots.length; i++) {
    const m = mascots[i];
    military.push({
      id: `portal-guardian-mascot-${i}-${portal.id}`,
      name: `Guardian ${m.mascotId?.toUpperCase() || 'Mascot'}`,
      troopKind: 'soldier',
      count: 1,
      mascotId: m.mascotId || 'paladill',
      position: { row: m.row, column: m.column },
      stats: { ...m.stats },
    });
  }

  nonMascots.forEach((slot, idx) => {
    military.push({
      id: `portal-guardian-squad-${idx}-${portal.id}`,
      name: slot.kind === 'archer' ? `Guardian Archers (Lv. ${portal.level})` : `Guardian Soldiers (Lv. ${portal.level})`,
      troopKind: slot.kind === 'archer' ? 'archer' : 'soldier',
      count: slot.count,
      position: { row: slot.row, column: slot.column },
      stats: { ...slot.stats },
    });
  });

  return {
    id: `subportal-boss-${portal.id}`,
    name: `${portal.name} Defenders`,
    title: `Rift Defense Garrison (Lv. ${portal.level})`,
    description: `Defenders guarding ${portal.name}. Destroy them to collapse the sub-portal.`,
    leader,
    military,
  };
}

/**
 * Destroys a sub-portal. Remaining spawned mobs from this sub-portal remain in the world until killed.
 * If lastDestroyedRespwanOnTimer is enabled, schedules the last destroyed sub-portal for timed respawn.
 */
export function destroySubPortal(
  portalId: string,
  state: PortalRuntimeState,
  config: PortalMobSummoningConfig = activePortalConfig,
  now = Date.now()
): { state: PortalRuntimeState; destroyedPortal?: PortalInstance } {
  const destroyed = state.portals.find(p => p.id === portalId);
  if (!destroyed) return { state };

  const remainingPortals = state.portals.filter(p => p.id !== portalId);
  // Spawned mobs remain in the world until killed in battle
  const remainingMarches = state.activeEnemyMarches;

  let lastDestroyedSubportal: DestroyedSubportalRecord | null = state.lastDestroyedSubportal ?? null;
  const subConfig = config.portalLevelScaling.subPortal;
  const shouldRespawnOnTimer = subConfig?.lastDestroyedRespwanOnTimer ?? subConfig?.lastDestroyedRespawnOnTimer;

  if (shouldRespawnOnTimer) {
    const backToLv1 = subConfig?.lastDestroyedBackToLevel1 ?? true;
    const targetLevel = backToLv1 ? 1 : destroyed.level;
    const delaySec = subConfig?.respawnTimerSeconds ?? config.exhaustedSeconds ?? config.initialAttackInSeconds ?? 30;
    lastDestroyedSubportal = {
      id: destroyed.id,
      name: destroyed.name,
      coordinate: { ...destroyed.coordinate },
      level: targetLevel,
      destroyedAt: now,
      respawnAt: now + delaySec * 1000,
    };
  }

  return {
    state: {
      ...state,
      portals: remainingPortals,
      activeEnemyMarches: remainingMarches,
      lastDestroyedSubportal,
    },
    destroyedPortal: destroyed,
  };
}

let activePortalConfig: PortalMobSummoningConfig = { ...DEFAULT_PORTAL_CONFIG };
let activePortalState: PortalRuntimeState = createInitialPortalState(DEFAULT_PORTAL_CONFIG);

export function getActivePortalConfig(): PortalMobSummoningConfig {
  return activePortalConfig;
}

export function setActivePortalConfig(config: PortalMobSummoningConfig): void {
  activePortalConfig = config;
}

export function getActivePortalState(): PortalRuntimeState {
  return activePortalState;
}

export function setActivePortalState(state: PortalRuntimeState): void {
  activePortalState = state;
}

export function resetPortalState(): void {
  activePortalConfig = { ...DEFAULT_PORTAL_CONFIG };
  activePortalState = createInitialPortalState(DEFAULT_PORTAL_CONFIG);
  clearDynamicBosses();
}
