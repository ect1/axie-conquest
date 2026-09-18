import portalData from './portal-config.json';
import { Coordinate, createRoute, marchTravelTimeMs } from './routes';

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
};

export type PortalMobSummoningConfig = {
  enabled: boolean;
  initialPortalCoordinate: {
    x: number;
    y: number;
  };
  initialAttackInSeconds: number;
  attackIntervalSeconds: number;
  exhaustedEveryMobLevel: number;
  exhaustedSeconds: number;
  starterMobCount: number;
  maxMoveSpeed: number;
  portalLevelScaling: PortalLevelScaling;
  mobTypes: Record<PortalMobKind, { baseStats: PortalMobBaseStats }>;
};

export type PortalConfigFile = {
  portalMobSummoning: PortalMobSummoningConfig;
};

export const DEFAULT_PORTAL_CONFIG: PortalMobSummoningConfig = (portalData as PortalConfigFile).portalMobSummoning;

export type PortalCycleState = 'initial_countdown' | 'interval_countdown' | 'exhausted' | 'disabled';

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
  createdAt: number;
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
};

export type PortalRuntimeState = {
  portals: PortalInstance[];
  activeEnemyMarches: EnemyMarch[];
};

export const MASCOT_HERO_IDS = ['kotaro', 'paladill', 'tripp', 'xia', 'bing', 'kibo', 'pomodoro'] as const;

export function sanitizePortalConfig(raw: unknown): PortalMobSummoningConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PORTAL_CONFIG };
  const candidate = raw as Partial<PortalMobSummoningConfig>;
  const coord = candidate.initialPortalCoordinate ?? DEFAULT_PORTAL_CONFIG.initialPortalCoordinate;
  const scaling = candidate.portalLevelScaling ?? DEFAULT_PORTAL_CONFIG.portalLevelScaling;
  const mobTypes = candidate.mobTypes ?? DEFAULT_PORTAL_CONFIG.mobTypes;

  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : DEFAULT_PORTAL_CONFIG.enabled,
    initialPortalCoordinate: {
      x: Number.isFinite(coord?.x) ? coord.x : DEFAULT_PORTAL_CONFIG.initialPortalCoordinate.x,
      y: Number.isFinite(coord?.y) ? coord.y : DEFAULT_PORTAL_CONFIG.initialPortalCoordinate.y,
    },
    initialAttackInSeconds: Math.max(1, Number(candidate.initialAttackInSeconds) || DEFAULT_PORTAL_CONFIG.initialAttackInSeconds),
    attackIntervalSeconds: Math.max(1, Number(candidate.attackIntervalSeconds) || DEFAULT_PORTAL_CONFIG.attackIntervalSeconds),
    exhaustedEveryMobLevel: Math.max(1, Math.round(Number(candidate.exhaustedEveryMobLevel) || DEFAULT_PORTAL_CONFIG.exhaustedEveryMobLevel)),
    exhaustedSeconds: Math.max(1, Number(candidate.exhaustedSeconds) || DEFAULT_PORTAL_CONFIG.exhaustedSeconds),
    starterMobCount: Math.max(1, Math.round(Number(candidate.starterMobCount) || DEFAULT_PORTAL_CONFIG.starterMobCount)),
    maxMoveSpeed: Math.max(0.5, Number(candidate.maxMoveSpeed) || DEFAULT_PORTAL_CONFIG.maxMoveSpeed),
    portalLevelScaling: {
      statsMultiplierPerLevel: Math.max(1.0, Number(scaling?.statsMultiplierPerLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.statsMultiplierPerLevel),
      mobsCountMultiplierPerLevel: Math.max(1.0, Number(scaling?.mobsCountMultiplierPerLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.mobsCountMultiplierPerLevel),
      summonNewPortalEveryLevel: Math.max(1, Math.round(Number(scaling?.summonNewPortalEveryLevel) || DEFAULT_PORTAL_CONFIG.portalLevelScaling.summonNewPortalEveryLevel)),
      newPortalIndependentLevel: typeof scaling?.newPortalIndependentLevel === 'boolean' ? scaling.newPortalIndependentLevel : DEFAULT_PORTAL_CONFIG.portalLevelScaling.newPortalIndependentLevel,
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
  const rawSpeed = baseStats.moveSpeed * mult;
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

export function createInitialPortalState(config: PortalMobSummoningConfig, now = Date.now()): PortalRuntimeState {
  const primeCoord = {
    x: config.initialPortalCoordinate.x,
    z: config.initialPortalCoordinate.y,
  };

  const primePortal: PortalInstance = {
    id: 'portal-prime',
    name: 'Prime Rift Portal',
    level: 1,
    coordinate: primeCoord,
    cycleState: config.enabled ? 'initial_countdown' : 'disabled',
    nextAttackTime: now + config.initialAttackInSeconds * 1000,
    upcomingFormation: generateWaveFormation(1, config),
    createdAt: now,
  };

  return {
    portals: [primePortal],
    activeEnemyMarches: [],
  };
}

export function restorePortalState(raw: string | null, config: PortalMobSummoningConfig, now = Date.now()): PortalRuntimeState {
  if (!raw) return createInitialPortalState(config, now);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.portals) || parsed.portals.length === 0) {
      return createInitialPortalState(config, now);
    }
    const portals: PortalInstance[] = parsed.portals.map((p: any, idx: number) => ({
      id: typeof p.id === 'string' ? p.id : `portal-${idx + 1}`,
      name: typeof p.name === 'string' ? p.name : `Rift Portal ${idx + 1}`,
      level: Math.max(1, Math.round(Number(p.level) || 1)),
      coordinate: {
        x: Number.isFinite(p.coordinate?.x) ? p.coordinate.x : config.initialPortalCoordinate.x,
        z: Number.isFinite(p.coordinate?.z) ? p.coordinate.z : config.initialPortalCoordinate.y,
      },
      cycleState: ['initial_countdown', 'interval_countdown', 'exhausted', 'disabled'].includes(p.cycleState)
        ? p.cycleState
        : 'initial_countdown',
      nextAttackTime: Number.isFinite(p.nextAttackTime) ? p.nextAttackTime : now + config.initialAttackInSeconds * 1000,
      upcomingFormation: p.upcomingFormation && Array.isArray(p.upcomingFormation.slots)
        ? p.upcomingFormation
        : generateWaveFormation(Math.max(1, Math.round(Number(p.level) || 1)), config),
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : now,
    }));

    const activeEnemyMarches: EnemyMarch[] = Array.isArray(parsed.activeEnemyMarches)
      ? parsed.activeEnemyMarches.filter((m: any) => m && m.id && m.arrivesAt > now)
      : [];

    return { portals, activeEnemyMarches };
  } catch {
    return createInitialPortalState(config, now);
  }
}

/**
 * Computes current enemy march position along route.
 */
export function enemyMarchPosition(march: EnemyMarch, now: number): Coordinate {
  const duration = Math.max(1, march.arrivesAt - march.startedAt);
  const progress = Math.max(0, Math.min(1, (now - march.startedAt) / duration));
  return {
    x: march.origin.x + (march.destination.x - march.origin.x) * progress,
    z: march.origin.z + (march.destination.z - march.origin.z) * progress,
  };
}

/**
 * Updates portal cycles, spawns waves, triggers new portals, and removes arrived marches (disappear at city).
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

  const newMarches: EnemyMarch[] = [];
  const updatedPortals: PortalInstance[] = [];
  let nextPortalIndex = state.portals.length + 1;

  const newPortalsToAppend: PortalInstance[] = [];

  for (const portal of state.portals) {
    let currentPortal = { ...portal };

    // If disabled, activate
    if (currentPortal.cycleState === 'disabled') {
      currentPortal.cycleState = 'initial_countdown';
      currentPortal.nextAttackTime = now + config.initialAttackInSeconds * 1000;
    }

    // Check if countdown expired
    if (now >= currentPortal.nextAttackTime) {
      // 1. Spawn enemy march from this portal
      const route = createRoute(cityDestination, currentPortal.coordinate);
      // Average move speed across formation slots
      const speeds = currentPortal.upcomingFormation.slots.map(s => s.stats.moveSpeed);
      const marchSpeed = speeds.length ? Math.min(...speeds) : 3.0;
      const travelTime = marchTravelTimeMs(route, marchSpeed);

      const march: EnemyMarch = {
        id: `portal-march-${portal.id}-w${currentPortal.level}-${now}`,
        portalId: currentPortal.id,
        portalName: currentPortal.name,
        level: currentPortal.level,
        name: `${currentPortal.name} · Wave ${currentPortal.level}`,
        ownerId: 'portal',
        origin: { ...currentPortal.coordinate },
        destination: { ...cityDestination },
        startedAt: now,
        arrivesAt: now + travelTime,
        speed: marchSpeed,
        formation: currentPortal.upcomingFormation,
      };
      newMarches.push(march);

      // 2. Determine next cycle state:
      const justFinishedLevel = currentPortal.level;
      const nextLevel = justFinishedLevel + 1;

      // Check exhaustion
      const isExhausted = justFinishedLevel % config.exhaustedEveryMobLevel === 0;
      const cycleState: PortalCycleState = isExhausted ? 'exhausted' : 'interval_countdown';
      const delaySec = isExhausted ? config.exhaustedSeconds : config.attackIntervalSeconds;

      currentPortal = {
        ...currentPortal,
        level: nextLevel,
        cycleState,
        nextAttackTime: now + delaySec * 1000,
        upcomingFormation: generateWaveFormation(nextLevel, config, random),
      };

      // 3. Check if this portal reached level 10 (or multiples of summonNewPortalEveryLevel)
      const shouldSummonNewPortal =
        config.portalLevelScaling.summonNewPortalEveryLevel > 0 &&
        justFinishedLevel % config.portalLevelScaling.summonNewPortalEveryLevel === 0;

      if (shouldSummonNewPortal) {
        const newCoord = generateNewPortalCoordinate([...state.portals, ...updatedPortals, ...newPortalsToAppend], random);
        const startLevel = config.portalLevelScaling.newPortalIndependentLevel ? 1 : nextLevel;
        const newPortal: PortalInstance = {
          id: `portal-${nextPortalIndex}`,
          name: `Rift Portal ${nextPortalIndex}`,
          level: startLevel,
          coordinate: newCoord,
          cycleState: 'initial_countdown',
          nextAttackTime: now + config.initialAttackInSeconds * 1000,
          upcomingFormation: generateWaveFormation(startLevel, config, random),
          createdAt: now,
        };
        nextPortalIndex++;
        newPortalsToAppend.push(newPortal);
      }
    }

    updatedPortals.push(currentPortal);
  }

  if (newPortalsToAppend.length > 0) {
    updatedPortals.push(...newPortalsToAppend);
  }

  // Filter existing active marches:
  // When they reach the city (arrivesAt <= now), make them DISAPPEAR!
  const remainingMarches: EnemyMarch[] = [];
  let arrivedCount = 0;

  for (const march of [...state.activeEnemyMarches, ...newMarches]) {
    if (now < march.arrivesAt) {
      remainingMarches.push(march);
    } else {
      arrivedCount++;
    }
  }

  return {
    state: {
      portals: updatedPortals,
      activeEnemyMarches: remainingMarches,
    },
    newMarchesSpawned: newMarches,
    arrivedMarchesCount: arrivedCount,
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
}
