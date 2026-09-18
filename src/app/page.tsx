"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILDABLE_KINDS, BUILDING_DEFINITIONS, BuildableKind, BuildingKind, Building, Cell, canPlace, canMoveBuilding, getBuildingDimensions, MAIN_HALL, EMPTY_TROOPS, Troops } from '@/game/base';
import HeroesPanel from './heroes-panel';
import MilitaryPanel from './military-panel';
import TrainingDialog from './training-dialog';
import MailDialog from './mail-dialog';
import DeveloperPanel from './developer-panel';
import BattleSpectatorModal from './battle-spectator';
import { activateCommanderSkill, Battle, MAX_BATTLE_TICKS, stepBattle } from '@/game/battle';
import { BATTLE_SAVE_KEY, BATTLE_TRANSACTION_KEY, BattleSession, BattleReport, createBattleSession, reinforceBattleSession, restoreBattleSave, readBattleReports, recoverBattleTransaction, commitBattleOutcome } from '@/game/battle-save';
import { beginReplay, recordReplay } from '@/game/battle-replay';
import { createMobGroup, DEFAULT_GENERATION, GenerationSettings, getWorldObjectActions, restoreWorld, SpawnableMobGroup, WORLD_SAVE_KEY, WorldAction, WorldObject } from '@/game/world';
import { getAllBosses, getBossConfig, registerDynamicBoss } from '@/game/bosses';
import type { BaseView } from '@/game/scene';
import CityUnitPanel from './city-unit-panel';
import { CAPITAL_CITY_ID, CITIES_SAVE_KEY, CityState, createCapitalCity, restoreCities } from '@/game/cities';
import { createEmptyFormations, Formation, OFFENSE_FORMATIONS_SAVE_KEY, restoreOffenseFormations, serializeOffenseFormations } from '@/game/offense-formations';
import { BATTLE_SETTINGS_SAVE_KEY, restoreActiveBattleSettings } from '@/game/battle-settings';
import { Coordinate, createRoute, formatDuration, isValidFormation, marchTravelTimeMs, WorldTarget } from '@/game/routes';
import { WorldUnit, UNITS_SAVE_KEY, createArmy, createScout, deployUnit, commandUnit, commandWorldAction, deploymentError, restoreUnits, migrateMarches, settleUnit, unitPosition } from '@/game/units';
import { createMilitaryService } from '@/game/military-service';
import { activeUnitGlobalStats } from '@/game/unit-stats';
import { ApiAxie, AXIE_ROSTER_SAVE_KEY, createAxieRoster, restoreAxieRoster } from '@/game/axie-roster';
import IntroScreen from './intro-screen';
import {
  getPersistedOwner,
  setPersistedOwner,
  getActiveGameOwner,
  setActiveGameOwner,
  normalizeOwnerAddress,
} from '@/game/owner-address';
import { resetGame } from '@/game/reset';
import PortalDialog from './portal-dialog';
import {
  DEFAULT_PORTAL_CONFIG,
  EnemyMarch,
  PORTAL_CONFIG_SAVE_KEY,
  PORTAL_STATE_SAVE_KEY,
  PortalInstance,
  PortalMobSummoningConfig,
  PortalRuntimeState,
  createInitialPortalState,
  defeatEnemyMarch,
  destroySubPortal,
  enemyMarchPosition,
  generateNewPortalCoordinate,
  generateWaveFormation,
  portalFormationToBossConfig,
  restorePortalConfig,
  restorePortalState,
  stepPortalSystem,
  subPortalDefenderToBossConfig,
} from '@/game/portal';

type InventoryTab = 'resources' | 'equipment' | 'other';
type AxieApiResponse = { data?: { axies?: { results?: unknown } }; error?: string };

export default function Home() {
  const unitStats = activeUnitGlobalStats;
  const [battleSessions, setBattleSessions] = useState<BattleSession[]>([]);
  const battleSessionsRef = useRef<BattleSession[]>([]);
  const [spectatorSession, setSpectatorSession] = useState<BattleSession | null>(null);
  const [spectating, setSpectating] = useState(false);
  const [battlePaused, setBattlePaused] = useState(true);
  const [battleSpeed, setBattleSpeed] = useState<1 | 2 | 0.5>(1);
  const [battleDebug, setBattleDebug] = useState(false);
  const [battleReport, setBattleReport] = useState<BattleReport | null>(null);
  const [battleReports, setBattleReports] = useState<BattleReport[]>([]);
  const [battleError, setBattleError] = useState('');
  const [selectedFighterId, setSelectedFighterId] = useState<string | null>(null);
  const battleSession = spectatorSession || battleSessions[0] || null;
  const [loadError, setLoadError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<BaseView | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([MAIN_HALL]);
  const [heroes, setHeroes] = useState(false);
  const [apiAxies, setApiAxies] = useState<readonly ApiAxie[]>([]);
  const [axieSyncStatus, setAxieSyncStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [axieSyncError, setAxieSyncError] = useState('');
  const [axieSyncedAt, setAxieSyncedAt] = useState<number | null>(null);
  const [military, setMilitary] = useState(false);
  const [cityUnit, setCityUnit] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CityState>(createCapitalCity);
  const [citiesLoaded, setCitiesLoaded] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [training, setTraining] = useState(false);
  const [developer, setDeveloper] = useState(false);
  const [generation, setGeneration] = useState<GenerationSettings>(DEFAULT_GENERATION);
  const [worldObjects, setWorldObjects] = useState<WorldObject[]>([]);
  const [generationStatus, setGenerationStatus] = useState('No objects generated. Changes last for this session.');
  const [mail, setMail] = useState(false);
  const [inventory, setInventory] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>('resources');
  const [troops, setTroops] = useState<Troops>({ ...EMPTY_TROOPS });
  const [catalog, setCatalog] = useState(false);
  const [buildingKind, setBuildingKind] = useState<BuildingKind>('farm');
  const [moving, setMoving] = useState<Building | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Building | null>(null);
  const [ready, setReady] = useState(false);
  const [worldView, setWorldView] = useState(false);
  const [message, setMessage] = useState('A new chapter for Lunacia starts here.');
  const [target, setTarget] = useState<WorldTarget | null>(null);
  const [routeAction, setRouteAction] = useState<'choose' | 'formation' | null>(null);
  const [selectedAction, setSelectedAction] = useState<WorldAction | 'march' | null>(null);
  const [formationIndex, setFormationIndex] = useState<number | null>(null);
  const [formations, setFormations] = useState<Formation[]>(createEmptyFormations);
  const [formationsLoaded, setFormationsLoaded] = useState(false);
  const [units, setUnits] = useState<WorldUnit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [mobSpawnEnabled, setMobSpawnEnabled] = useState(false);
  const [mobGroup, setMobGroup] = useState<SpawnableMobGroup>('chimera-pack');
  const [selectedBossId, setSelectedBossId] = useState<string>('kotaro');
  const [now, setNow] = useState(Date.now);
  const [portalConfig, setPortalConfig] = useState<PortalMobSummoningConfig>(() => {
    try {
      return restorePortalConfig(localStorage.getItem(PORTAL_CONFIG_SAVE_KEY));
    } catch {
      return DEFAULT_PORTAL_CONFIG;
    }
  });
  const [portalState, setPortalState] = useState<PortalRuntimeState>(() => {
    try {
      return restorePortalState(localStorage.getItem(PORTAL_STATE_SAVE_KEY), DEFAULT_PORTAL_CONFIG);
    } catch {
      return createInitialPortalState(DEFAULT_PORTAL_CONFIG);
    }
  });
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);

  function togglePortalPause() {
    const updated = { ...portalConfig, paused: !portalConfig.paused };
    setPortalConfig(updated);
    try {
      localStorage.setItem(PORTAL_CONFIG_SAVE_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
    setMessage(updated.paused ? 'Portal respawn paused' : 'Portal respawn resumed');
  }

  function triggerPortalWave(portalId?: string) {
    const time = Date.now();
    const targetPortal = portalId ? portalState.portals.find(p => p.id === portalId) : portalState.portals[0];
    if (!targetPortal) return;

    // Filter out existing active marches for this portal so manual trigger forces the new wave
    const marches = portalState.activeEnemyMarches.filter(m => m.portalId !== targetPortal.id);
    const updated = portalState.portals.map(p => {
      if (p.id === targetPortal.id) {
        return { ...p, cycleState: 'interval_countdown' as const, nextAttackTime: time - 1 };
      }
      return p;
    });
    setPortalState({ ...portalState, portals: updated, activeEnemyMarches: marches });
    setMessage(`Wave triggered for ${targetPortal.name}!`);
  }

  function summonNewPortalManual() {
    const time = Date.now();
    const newCoord = generateNewPortalCoordinate(portalState.portals);
    const newIdx = portalState.portals.length + 1;
    const startLevel = portalConfig.portalLevelScaling.newPortalIndependentLevel ? 1 : (portalState.portals[0]?.level ?? 1);
    const newPortal: PortalInstance = {
      id: `portal-${newIdx}`,
      name: `Rift Portal ${newIdx}`,
      level: startLevel,
      coordinate: newCoord,
      cycleState: 'initial_countdown',
      nextAttackTime: time + portalConfig.initialAttackInSeconds * 1000,
      upcomingFormation: generateWaveFormation(startLevel, portalConfig),
      createdAt: time,
    };
    const nextState = {
      ...portalState,
      portals: [...portalState.portals, newPortal],
    };
    setPortalState(nextState);
    try {
      localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextState));
    } catch { /* ignore */ }
    setMessage(`Summoned ${newPortal.name} at ${newCoord.x}, ${newCoord.z}!`);
  }

  function resetPortalsManual() {
    const initial = createInitialPortalState(portalConfig);
    setPortalState(initial);
    try {
      localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(initial));
    } catch { /* ignore */ }
    setMessage('All portals reset to level 1.');
  }

  function handleDefeatHostileMarch(marchId: string) {
    const { state: nextState, defeatedMarch } = defeatEnemyMarch(marchId, portalState, portalConfig, now, { x: 0, z: 0 });
    setPortalState(nextState);
    try {
      localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextState));
    } catch { /* ignore */ }
    view.current?.setPortalState(nextState, null);
    setSelectedUnitId(null);
    setMessage(`⚔️ Defeated ${defeatedMarch?.name || 'hostile squad'}! Next wave countdown begins.`);
  }

  function handleAttackHostileMarch(march: EnemyMarch) {
    const pos = enemyMarchPosition(march, now);
    const bossCfg = portalFormationToBossConfig(march);
    registerDynamicBoss(bossCfg);
    setTarget({ x: pos.x, z: pos.z, id: march.id, label: march.name });
    setSelectedUnitId(null);
    setSelectedAction('attack');
    setRouteAction('formation');
    setFormationIndex(null);
  }

  function handleMarchToHostileMarch(march: EnemyMarch) {
    const pos = enemyMarchPosition(march, now);
    setTarget({ x: pos.x, z: pos.z, id: march.id, label: march.name });
    setSelectedUnitId(null);
    setSelectedAction('march');
    setRouteAction('formation');
    setFormationIndex(null);
  }

  function handleAttackPortal(portal: PortalInstance) {
    const bossCfg = subPortalDefenderToBossConfig(portal);
    registerDynamicBoss(bossCfg);
    setTarget({ x: portal.coordinate.x, z: portal.coordinate.z, id: portal.id, label: portal.name });
    setSelectedPortalId(null);
    setSelectedUnitId(null);
    setSelectedAction('attack');
    setRouteAction('formation');
    setFormationIndex(null);
  }

  function handleDestroySubPortal(portalId: string) {
    const { state: nextState, destroyedPortal } = destroySubPortal(portalId, portalState);
    setPortalState(nextState);
    try {
      localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextState));
    } catch { /* ignore */ }
    view.current?.setPortalState(nextState, null);
    setSelectedPortalId(null);
    setSelectedUnitId(null);
    setMessage(`💥 VICTORY! Destroyed ${destroyedPortal?.name || 'sub-portal'}! The void rift collapsed.`);
  }

  const [showIntro, setShowIntro] = useState(true);
  const [ownerAddress, setOwnerAddress] = useState<string>(getPersistedOwner);

  function handleStartGame(address: string) {
    const normalized = normalizeOwnerAddress(address);
    const activeOwner = getActiveGameOwner();
    const isAddressChanged = Boolean(activeOwner && normalizeOwnerAddress(activeOwner).toLowerCase() !== normalized.toLowerCase());

    if (isAddressChanged) {
      resetGame(window.localStorage);
      setActiveGameOwner(normalized);
      setPersistedOwner(normalized);
      if (ready) {
        window.location.reload();
        return;
      }
      setOwnerAddress(normalized);
      setApiAxies([]);
      setFormationsLoaded(false);
      setCitiesLoaded(false);
      setShowIntro(false);
    } else {
      setActiveGameOwner(normalized);
      setPersistedOwner(normalized);
      setOwnerAddress(normalized);
      setShowIntro(false);
    }
  }

  function handleRestartGame(address: string) {
    const normalized = normalizeOwnerAddress(address);
    resetGame(window.localStorage);
    setActiveGameOwner(normalized);
    setPersistedOwner(normalized);
    if (ready) {
      window.location.reload();
      return;
    }
    setOwnerAddress(normalized);
    setApiAxies([]);
    setFormationsLoaded(false);
    setCitiesLoaded(false);
    setShowIntro(false);
  }

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (showIntro) return;
    const cached = restoreAxieRoster(localStorage.getItem(AXIE_ROSTER_SAVE_KEY));
    if (cached) { setApiAxies(cached.axies); setAxieSyncedAt(cached.syncedAt); }
    const controller = new AbortController();
    fetch(`/api/axies?owner=${encodeURIComponent(ownerAddress)}&size=30`, { signal: controller.signal })
      .then(async response => {
        const payload = await response.json() as AxieApiResponse;
        if (!response.ok) throw new Error(payload.error || `Axie sync failed with HTTP ${response.status}.`);
        const roster = restoreAxieRoster(JSON.stringify({ version: 1, syncedAt: Date.now(), axies: payload.data?.axies?.results }));
        if (!roster) throw new Error('The Axie API returned an invalid roster.');
        const next = createAxieRoster(roster.axies);
        localStorage.setItem(AXIE_ROSTER_SAVE_KEY, JSON.stringify(next));
        setApiAxies(next.axies); setAxieSyncedAt(next.syncedAt); setAxieSyncStatus('ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        setAxieSyncError(error instanceof Error ? error.message : 'Could not sync Axies.');
        setAxieSyncStatus('error');
      });
    return () => controller.abort();
  }, [showIntro, ownerAddress]);
  useEffect(() => { if (ready) view.current?.setUnits(units, selectedUnitId); }, [units, selectedUnitId, ready]);
  useEffect(() => { if (ready) view.current?.setBattles(battleSessions); }, [battleSessions, ready]);
  useEffect(() => { if (ready) view.current?.setSelectedTarget(target?.id ?? null); }, [target, ready]);
  useEffect(() => { if (!ready || showIntro) return; setUnits(current => { const next = current.map(u => settleUnit(u, now)).filter(u => u.status !== 'home'); return next.length !== current.length || next.some((u, i) => u !== current[i]) ? next : current; }); }, [now, ready, showIntro]);
  useEffect(() => { if (!ready || showIntro) return; try { localStorage.setItem(UNITS_SAVE_KEY, JSON.stringify(units)); } catch { setMessage('Browser storage unavailable; units last this session.'); } }, [units, ready, showIntro]);
  useEffect(() => {
    if (showIntro) return;
    try { setSelectedCity(restoreCities(localStorage.getItem(CITIES_SAVE_KEY)).find(city => city.id === CAPITAL_CITY_ID) ?? createCapitalCity()); } catch { /* Keep the in-memory capital when storage is unavailable. */ } finally { setCitiesLoaded(true); }
  }, [showIntro]);
  useEffect(() => {
    if (!citiesLoaded || showIntro) return;
    try { localStorage.setItem(CITIES_SAVE_KEY, JSON.stringify([{ ...selectedCity, troops }])); } catch { /* City state remains usable for this session. */ }
  }, [selectedCity, troops, citiesLoaded, showIntro]);
  useEffect(() => {
    if (!citiesLoaded || !apiAxies.length || formationsLoaded || showIntro) return;
    try { const board = restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY)); setFormations(restoreOffenseFormations(localStorage.getItem(OFFENSE_FORMATIONS_SAVE_KEY), selectedCity.deployedAxieIds.filter(id => apiAxies.some(axie => axie.id === id)), troops, { columns: board.boardColumns, rows: board.boardRows })); } catch { /* Use empty formations when storage is unavailable. */ }
    setFormationsLoaded(true);
  }, [citiesLoaded, apiAxies, formationsLoaded, selectedCity.deployedAxieIds, troops, showIntro]);
  useEffect(() => {
    if (!formationsLoaded || showIntro) return;
    try { localStorage.setItem(OFFENSE_FORMATIONS_SAVE_KEY, serializeOffenseFormations(formations)); } catch { setMessage('Browser storage unavailable; formations last this session.'); }
  }, [formations, formationsLoaded, showIntro]);
  useEffect(() => {
    if (showIntro) return;
    let disposed = false;
    import('@/game/scene').then(({ createBase }) => {
      if (disposed || !canvas.current) return;
      try {
        const settings = restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY));
        setBattleDebug(settings.debugBattle);
      } catch {
        const settings = restoreActiveBattleSettings(null);
        setBattleDebug(settings.debugBattle);
      }
      try { recoverBattleTransaction(localStorage); }
      catch (error) { setLoadError(`Cannot recover the last battle save: ${(error as Error).message}`); return; }
      view.current = createBase(canvas.current, { watchBattle: (sessionId) => { const session = battleSessionsRef.current.find(s => (s.id || s.army.id) === sessionId) || battleSessionsRef.current[0]; if (session) { setSpectatorSession(session); setSpectating(true); } }, fighterSelect: setSelectedFighterId, change: setBuildings, preview: setCell, unitSelect: id => { setSelectedUnitId(id); setSelectedPortalId(null); setTarget(null); setRouteAction(null); setSelectedAction(null); }, portalSelect: portalId => { setSelectedPortalId(portalId); setSelectedUnitId(null); setSelected(null); setTarget(null); setDeveloper(false); setMilitary(false); setTraining(false); setHeroes(false); setInventory(false); }, target: next => { setTarget(next); setRouteAction(next ? 'choose' : null); setSelectedAction(null); setFormationIndex(null); if (next?.id) setSelectedUnitId(null); if (next) { setSelected(null); setDeveloper(false); setMilitary(false); setTraining(false); setHeroes(false); setInventory(false); setCatalog(false); } }, viewMode: mode => { setWorldView(mode === 'world'); if (mode !== 'world') { setSelectedUnitId(null); setTarget(null); setRouteAction(null); setSelectedAction(null); } }, select: building => { setSelected(building); if (building) { setDeveloper(false); setMilitary(false); setTraining(false); setHeroes(false); setInventory(false); } }, message: setMessage, troops: setTroops });
      let initialObjects: WorldObject[];
      let savedObjects: WorldObject[] | null = null;
      try { savedObjects = restoreWorld(localStorage.getItem(WORLD_SAVE_KEY)); } catch { savedObjects = null; }
      if (savedObjects !== null) {
        view.current.loadWorld(savedObjects);
        initialObjects = savedObjects;
      } else {
        initialObjects = view.current.regenerateWorld(DEFAULT_GENERATION);
      }
      setWorldObjects(initialObjects);
      try {
        const available = createMilitaryService(localStorage, CAPITAL_CITY_ID).getTroops();
        const savedBattle = restoreBattleSave(localStorage.getItem(BATTLE_SAVE_KEY), available);
        setBattleReport(savedBattle.report);
        setBattleReports(readBattleReports(localStorage.getItem(BATTLE_SAVE_KEY)));
        const initialSessions = savedBattle.sessions ?? (savedBattle.active ? [savedBattle.active] : []);
        battleSessionsRef.current = initialSessions; setBattleSessions(initialSessions);
        const raw = localStorage.getItem(UNITS_SAVE_KEY);
        setUnits(raw === null ? migrateMarches(localStorage.getItem('axie-conquest-routes-v1'), CAPITAL_CITY_ID, available, unitStats.marchSpeed, Date.now()) : restoreUnits(raw, available, Date.now()));
      } catch { /* Keep session defaults if storage is unavailable. */ }
      const requested = Object.values(DEFAULT_GENERATION.counts).reduce((sum, count) => sum + count, 0);
      setGenerationStatus(savedObjects !== null ? `${initialObjects.length} saved objects restored.` : `${initialObjects.length} / ${requested} generated.`);
      setReady(true);
      view.current?.setPortalState(portalState, selectedUnitId);
    }).catch(() => setMessage('Unable to open the 3D view. Please enable WebGL and reload.'));
    return () => { disposed = true; view.current?.dispose(); view.current = null; };
  }, [showIntro]);
  useEffect(() => {
    if (ready && !worldView) view.current?.setGridVisible((catalog && !selected) || placing);
  }, [catalog, placing, ready, selected, worldView]);
  useEffect(() => { if (catalog) setInventory(false); }, [catalog]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const { state: nextState, newMarchesSpawned, arrivedMarchesCount } = stepPortalSystem(
      now,
      portalState,
      portalConfig,
      { x: 0, z: 0 }
    );
    try {
      localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextState));
    } catch { /* session only */ }
    setPortalState(nextState);
    view.current?.setPortalState(nextState, selectedUnitId);
    if (newMarchesSpawned.length > 0) {
      newMarchesSpawned.forEach(march => {
        setMessage(`⚠️ Hostile March detected! ${march.name} approaching Everleaf Haven.`);
      });
    }
    if (arrivedMarchesCount > 0) {
      setMessage('⚠️ Hostile forces have surrounded the city perimeter and halted outside!');
    }
  }, [now, ready, portalConfig]);
  useEffect(() => {
    if (!ready || battleError) return;
    const activeAttackerIds = new Set(battleSessionsRef.current.map(s => s.army.id));
    const arrivedAttackers = units.filter(unit => !unit.order && unit.activity?.action === 'attack' && !activeAttackerIds.has(unit.id));
    if (!arrivedAttackers.length) return;

    const newSessions: BattleSession[] = [];
    let unitsChanged = false;
    let nextUnits = [...units];

    for (const attacker of arrivedAttackers) {
      const targetId = attacker.activity!.targetId;
      let enemy = worldObjects.find(object => object.id === targetId && object.state === 'defended');
      if (!enemy) {
        const hostile = portalState.activeEnemyMarches.find(m => m.id === targetId);
        if (hostile) {
          const pos = enemyMarchPosition(hostile, now);
          const bossCfg = portalFormationToBossConfig(hostile);
          registerDynamicBoss(bossCfg);
          enemy = {
            id: hostile.id,
            kind: 'boss',
            x: pos.x,
            z: pos.z,
            state: 'defended',
            loot: { apple: 0 },
            bossId: `portal-boss-${hostile.id}`,
            bossName: hostile.name,
          };
        } else {
          const subPortal = portalState.portals.find(p => p.id === targetId && p.id !== 'portal-prime');
          if (subPortal && portalConfig.portalLevelScaling.subPortal?.destroyable) {
            const bossCfg = subPortalDefenderToBossConfig(subPortal);
            registerDynamicBoss(bossCfg);
            enemy = {
              id: subPortal.id,
              kind: 'boss',
              x: subPortal.coordinate.x,
              z: subPortal.coordinate.z,
              state: 'defended',
              loot: { apple: 50 * subPortal.level },
              bossId: `subportal-boss-${subPortal.id}`,
              bossName: `${subPortal.name} Defenders`,
            };
          }
        }
      }
      if (!enemy) {
        nextUnits = nextUnits.map(u => u.id === attacker.id ? { ...u, activity: undefined } : u);
        unitsChanged = true;
        setMessage('The attack target is no longer defended.');
        continue;
      }

      // Check if target is already engaged by an active battle (in current sessions or newly created in this loop)
      const existingActiveIndex = battleSessionsRef.current.findIndex(s => s.target.id === targetId && !s.battle.result);
      const newActiveIndex = newSessions.findIndex(s => s.target.id === targetId && !s.battle.result);

      if (existingActiveIndex >= 0) {
        const existingSession = battleSessionsRef.current[existingActiveIndex];
        const reinforced = reinforceBattleSession(existingSession, attacker, apiAxies);
        battleSessionsRef.current[existingActiveIndex] = reinforced;
        setBattleSessions([...battleSessionsRef.current]);
        view.current?.setBattles(battleSessionsRef.current);
        setMessage(`${attacker.name} reinforced the battle at ${existingSession.target.kind}!`);
        continue;
      }

      if (newActiveIndex >= 0) {
        const existingSession = newSessions[newActiveIndex];
        newSessions[newActiveIndex] = reinforceBattleSession(existingSession, attacker, apiAxies);
        setMessage(`${attacker.name} reinforced the battle at ${existingSession.target.kind}!`);
        continue;
      }

      const session = createBattleSession(attacker, enemy, apiAxies);
      newSessions.push(session);
    }

    if (unitsChanged) {
      setUnits(nextUnits);
    }

    if (newSessions.length > 0) {
      // Freeze any EnemyMarch targets that have just entered battle
      const fightingMarchTargets = new Map<string, Coordinate>();
      for (const s of newSessions) {
        if (portalState.activeEnemyMarches.some(m => m.id === s.target.id)) {
          fightingMarchTargets.set(s.target.id, { x: s.target.x, z: s.target.z });
        }
      }
      if (fightingMarchTargets.size > 0) {
        const updatedMarches = portalState.activeEnemyMarches.map(m => {
          const fightPos = fightingMarchTargets.get(m.id);
          return fightPos ? { ...m, status: 'fighting' as const, fightingPosition: fightPos } : m;
        });
        const nextPortalState = { ...portalState, activeEnemyMarches: updatedMarches };
        setPortalState(nextPortalState);
        view.current?.setPortalState(nextPortalState, selectedUnitId);
        try {
          localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextPortalState));
        } catch { /* session only */ }
      }

      const allSessions = [...battleSessionsRef.current, ...newSessions];
      try {
        localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({ active: allSessions[0] ?? null, sessions: allSessions, report: battleReport, reports: battleReports }));
        battleSessionsRef.current = allSessions;
        setBattleSessions(allSessions);
        view.current?.setBattles(allSessions);
        setSelectedUnitId(newSessions[0].army.id);
        setTarget(null);
        setRouteAction(null);
        setBattlePaused(false);
      } catch {
        setBattleError('Battle could not start because browser storage is unavailable. Free storage and retry.');
      }
    }
  }, [units, worldObjects, portalState, ready, battleError, battleReport, battleReports, apiAxies]);

  useEffect(() => {
    if (!battleSessions.length || battleError || battlePaused) return;
    const intervalMs = Math.round(100 / battleSpeed);
    const timer = window.setInterval(() => {
      const currentSessions = battleSessionsRef.current;
      if (!currentSessions.length || document.hidden) return;

      let anyRunning = false;
      const updatedSessions: BattleSession[] = [];
      const finishedSessions: BattleSession[] = [];

      for (const session of currentSessions) {
        if (session.battle.result) {
          updatedSessions.push(session);
          finishedSessions.push(session);
          continue;
        }
        anyRunning = true;
        const stepped = stepBattle(session.battle);
        const skilled = activateCommanderSkill(stepped);
        const nextBattle = skilled === stepped ? stepped : { ...skilled, events: [...stepped.events, ...skilled.events] };
        const updated = {
          ...session,
          battle: nextBattle,
          replay: recordReplay(session.replay ?? beginReplay(session.battle), nextBattle),
        };
        updatedSessions.push(updated);
        if (nextBattle.result) {
          finishedSessions.push(updated);
        }
      }

      if (anyRunning) {
        battleSessionsRef.current = updatedSessions;
        view.current?.setBattles(updatedSessions);
        setSpectatorSession(current => {
          if (!current) return null;
          return updatedSessions.find(s => (s.id || s.army.id) === (current.id || current.army.id)) ?? current;
        });

        const shouldSave = updatedSessions.some(s => s.battle.tick % 20 === 0 || s.battle.result);
        if (shouldSave) {
          try {
            localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({
              active: updatedSessions[0] ?? null,
              sessions: updatedSessions,
              report: battleReport,
              reports: battleReports,
            }));
          } catch { /* Storage error handling */ }
        }

        const shouldUpdateUi = updatedSessions.some(s => s.battle.tick % 2 === 0 || s.battle.result);
        if (shouldUpdateUi) {
          setBattleSessions([...updatedSessions]);
        }
      }

      for (const finished of finishedSessions) {
        finishBattle(finished);
      }
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [battleSessions.length, battleError, battlePaused, battleSpeed, battleReport, battleReports]);

  const toggleBattlePause = useCallback(() => {
    setBattlePaused(prev => !prev);
  }, []);

  const stepBattleOnce = useCallback(() => {
    const session = spectatorSession || battleSessionsRef.current[0];
    if (!session || session.battle.result) return;
    const stepped = stepBattle(session.battle), skilled = activateCommanderSkill(stepped);
    const nextBattle = skilled === stepped ? stepped : { ...skilled, events: [...stepped.events, ...skilled.events] };
    updateSingleBattle(session, nextBattle, true);
  }, [spectatorSession]);

  const restartBattle = useCallback(() => {
    const session = spectatorSession || battleSessionsRef.current[0];
    if (!session) return;
    const restarted = createBattleSession(session.army, session.target, apiAxies);
    const nextSessions = battleSessionsRef.current.map(s => (s.id || s.army.id) === (session.id || session.army.id) ? restarted : s);
    battleSessionsRef.current = nextSessions;
    setBattleSessions(nextSessions);
    setSpectatorSession(restarted);
    setBattlePaused(battleDebug);
    view.current?.setBattles(nextSessions);
    try {
      localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({ active: nextSessions[0] ?? null, sessions: nextSessions, report: battleReport, reports: battleReports }));
    } catch { /* LocalStorage error handling */ }
  }, [apiAxies, battleReport, battleReports, battleDebug, spectatorSession]);

  useEffect(() => {
    const flush = () => {
      const current = battleSessionsRef.current;
      if (!current.length) return;
      try { localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({ active: current[0] ?? null, sessions: current, report: battleReport, reports: battleReports })); }
      catch { setBattleError('Battle paused: progress could not be saved. Free browser storage and retry.'); }
    };
    const hidden = () => { if (document.hidden) flush(); };
    window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden); };
  }, [battleReport, battleReports]);

  useEffect(() => {
    if (!battleSessions.length || !ready) return;
    if (!worldView) { view.current?.setWorldView(true); setWorldView(true); view.current?.focusBattle(battleSessions[0]); }
  }, [battleSessions.length, ready]);

  useEffect(() => {
    const finished = battleSessions.find(s => s.battle.result);
    if (finished && !battleError) finishBattle(finished);
  }, [battleSessions, battleError]);

  function updateSingleBattle(session: BattleSession, battle: Battle, forceSave = false) {
    const next: BattleSession = { ...session, battle, replay: recordReplay(session.replay ?? beginReplay(session.battle), battle) };
    const nextSessions = battleSessionsRef.current.map(s => (s.id || s.army.id) === (session.id || session.army.id) ? next : s);
    battleSessionsRef.current = nextSessions;
    view.current?.setBattles(nextSessions);
    if (spectatorSession && (spectatorSession.id || spectatorSession.army.id) === (session.id || session.army.id)) {
      setSpectatorSession(next);
    }
    try {
      if (forceSave || battle.result || battle.tick % 20 === 0) {
        localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({ active: nextSessions[0] ?? null, sessions: nextSessions, report: battleReport, reports: battleReports }));
      }
      if (forceSave || battle.result || battle.tick % 2 === 0) {
        setBattleSessions([...nextSessions]);
      }
      setBattleError('');
    } catch {
      setBattleSessions([...nextSessions]);
      setBattleError('Battle paused: progress could not be saved. Free browser storage and retry.');
    }
  }

  function finishBattle(sessionToFinish?: BattleSession) {
    const session = sessionToFinish || battleSessionsRef.current.find(s => s.battle.result) || battleSessionsRef.current[0];
    if (!session?.battle.result) return;
    try {
      const outcome = commitBattleOutcome(localStorage, session, units, troops, formations, worldObjects, Date.now());
      const remainingSessions = (outcome.sessions ?? battleSessionsRef.current.filter(s => (s.id || s.army.id) !== (session.id || session.army.id)));
      battleSessionsRef.current = remainingSessions;
      setBattleSessions(remainingSessions);
      view.current?.setBattles(remainingSessions);

      if (spectatorSession && (spectatorSession.id || spectatorSession.army.id) === (session.id || session.army.id)) {
        setSpectatorSession(session);
      }

      setBattleError('');
      setSelectedFighterId(null);
      setSelectedUnitId(session.army.id);
      setTarget(null);
      setRouteAction(null);
      setTroops(outcome.troops);
      setUnits(outcome.units);
      setFormations(outcome.formations);
      setWorldObjects(outcome.objects);
      setBattleReport(outcome.report);
      setBattleReports(outcome.reports);
      view.current?.loadWorld(outcome.objects);
      view.current?.refreshMilitary();
      setMessage(`${outcome.report.result}: ${outcome.report.losses.infantry} infantry and ${outcome.report.losses.archer} archers lost. ${outcome.report.result === 'victory' ? 'Victorious army returning home.' : 'Survivors returning home.'}`);

      if (session.battle.result === 'victory') {
        if (portalState.activeEnemyMarches.some(m => m.id === session.target.id)) {
          handleDefeatHostileMarch(session.target.id);
        } else if (portalState.portals.some(p => p.id === session.target.id && p.id !== 'portal-prime')) {
          handleDestroySubPortal(session.target.id);
        }
      } else {
        const hostile = portalState.activeEnemyMarches.find(m => m.id === session.target.id);
        if (hostile && hostile.status === 'fighting') {
          const currentPos = hostile.fightingPosition || enemyMarchPosition(hostile, now);
          const route = createRoute(hostile.destination, currentPos);
          const travelTime = marchTravelTimeMs(route, hostile.speed);
          const resumedMarches = portalState.activeEnemyMarches.map(m =>
            m.id === hostile.id
              ? {
                  ...m,
                  origin: { ...currentPos },
                  startedAt: now,
                  arrivesAt: now + travelTime,
                  status: travelTime === 0 ? ('arrived' as const) : ('marching' as const),
                  fightingPosition: undefined,
                }
              : m
          );
          const nextPortalState = { ...portalState, activeEnemyMarches: resumedMarches };
          setPortalState(nextPortalState);
          view.current?.setPortalState(nextPortalState, selectedUnitId);
          try {
            localStorage.setItem(PORTAL_STATE_SAVE_KEY, JSON.stringify(nextPortalState));
          } catch { /* session only */ }
        }
      }
    } catch {
      setBattleError('Battle outcome could not be fully saved. Retry to complete recovery; progress is kept in the battle journal.');
    }
  }

  function retreatBattle(targetSession?: BattleSession) {
    const session = targetSession || spectatorSession || battleSessionsRef.current[0];
    if (!session || session.battle.result) return;
    const retreatingBattle: Battle = { ...session.battle, retreating: true };
    if (battlePaused || session.battle.tick >= MAX_BATTLE_TICKS) {
      retreatingBattle.result = 'retreated';
    }
    updateSingleBattle(session, retreatingBattle, true);
    if (retreatingBattle.result) finishBattle({ ...session, battle: retreatingBattle });
    else setMessage(`${session.army.name} is retreating from combat.`);
  }

  function abortBattle(targetSession?: BattleSession) {
    const session = targetSession || spectatorSession || battleSessionsRef.current[0];
    if (!session) return;
    const remaining = battleSessionsRef.current.filter(s => (s.id || s.army.id) !== (session.id || session.army.id));
    battleSessionsRef.current = remaining;
    setBattleSessions(remaining);
    view.current?.setBattles(remaining);
    if (spectatorSession && (spectatorSession.id || spectatorSession.army.id) === (session.id || session.army.id)) {
      setSpectatorSession(null);
      setSpectating(false);
    }
    setBattleError('');
    setSelectedFighterId(null);
    try {
      if (remaining.length) {
        localStorage.setItem(BATTLE_SAVE_KEY, JSON.stringify({ active: remaining[0], sessions: remaining, report: battleReport, reports: battleReports }));
      } else {
        localStorage.removeItem(BATTLE_SAVE_KEY);
      }
      localStorage.removeItem(BATTLE_TRANSACTION_KEY);
    } catch { /* Ignore storage access errors */ }
    setUnits(current => current.map(unit => unit.id === session.army.id ? { ...unit, activity: undefined, order: null, status: 'holding' } : unit));
    setMessage(`Active battle ended and ${session.army.name} returned to holding.`);
  }
  const size = getBuildingDimensions(buildingKind, moving?.rotation);
  const valid = cell !== null && (moving ? canMoveBuilding(moving.id, cell, buildings) : canPlace(cell, buildings, size.width, size.depth));
  const farms = buildings.filter(b => b.kind === 'farm').length;
  const usedCells = buildings.reduce((total, building) => { const size = getBuildingDimensions(building.kind, building.rotation); return total + size.width * size.depth; }, 0);
  function begin(kind: BuildableKind) { setHeroes(false); setMilitary(false); setTraining(false); setMoving(null); setBuildingKind(kind); setSelected(null); setPlacing(true); setCatalog(false); view.current?.begin(kind); }
  function cancel() { view.current?.cancel(); setPlacing(false); setCell(null); setCatalog(!moving); if (moving) setSelected(moving); setMoving(null); }
  function confirm() { if (view.current?.confirm()) { setPlacing(false); setCell(null); setCatalog(!moving); setMoving(null); } }
  function moveSelected() {
    if (!selected || !view.current?.move(selected.id)) return;
    setMoving(selected); setBuildingKind(selected.kind); setSelected(null); setPlacing(true); setCatalog(false);
  }
  function removeSelected() {
    if (selected && view.current?.remove(selected.id)) { setSelected(null); setCatalog(false); }
  }
  function renameCapital() {
    const name = nicknameDraft.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!name || name === selectedCity.name) return;
    setSelectedCity(city => ({ ...city, name }));
    setNicknameDraft('');
  }
  function toggleMilitary() {
    setDeveloper(false);
    setTraining(false);
    setHeroes(false);
    setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelectedUnitId(null); setTarget(null); setRouteAction(null); setCityUnit(false); setMail(false);
    setSelected(null); setCatalog(false); setMilitary(!military);
  }
  function toggleMail() {
    setDeveloper(false);
    setHeroes(false); setMilitary(false); setTraining(false); setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setMail(true);
  }
  function toggleTraining() {
    setDeveloper(false);
    setHeroes(false); setMilitary(false); setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setTraining(current => !current);
  }
  function toggleHeroes() {
    setDeveloper(false);
    setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setMilitary(false); setTraining(false); setHeroes(!heroes);
  }
  function toggleInventory() {
    setDeveloper(false);
    setHeroes(false); setMilitary(false); setTraining(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setInventory(!inventory);
  }
  function toggleWorldView() {
    setDeveloper(false);
    const next = !worldView;
    setHeroes(false); setMilitary(false); setTraining(false); setInventory(false); setSelected(null); setCatalog(false); setPlacing(false); setMoving(null); setCell(null);
    view.current?.setWorldView(next); setWorldView(next);
  }
  function toggleDeveloper() {
    view.current?.cancel();
    setPlacing(false); setMoving(null); setCell(null); setSelected(null); setCatalog(false);
    setHeroes(false); setMilitary(false); setTraining(false); setInventory(false); setMail(false);
    setDeveloper(current => !current);
  }
  function chooseMarch(action: WorldAction | 'march') {
    setFormationIndex(null);
    setSelectedAction(action);
    setRouteAction('formation');
  }
  function regenerate() {
    if (!view.current) return;
    const objects = view.current.regenerateWorld(generation);
    setWorldObjects(objects);
    const requested = Object.values(generation.counts).reduce((sum, count) => sum + count, 0);
    setGenerationStatus(`${objects.length} / ${requested} generated.${objects.length < requested ? ' Not enough space for all objects. Reduce counts or minimum distance.' : ''} Session only.`);
    view.current.setWorldView(true);
  }
  function formationIssue(index: number): string | null {
    if (units.some(unit => unit.kind === 'army' && unit.cityId === selectedCity.id && unit.formationIndex === index)) return null;
    try { return deploymentError(createArmy(formations[index], index, selectedCity.id, selectedCity.name, unitStats.marchSpeed, 'preview'), units, troops, now); }
    catch (error) { return (error as Error).message; }
  }
  function deploy(index: number | null, action: WorldAction | 'march') {
    try {
      let object = target?.id ? worldObjects.find(item => item.id === target.id) : undefined;
      if (!object && target?.id) {
        const hostile = portalState.activeEnemyMarches.find(m => m.id === target.id);
        if (hostile) {
          const pos = enemyMarchPosition(hostile, now);
          const bossCfg = portalFormationToBossConfig(hostile);
          registerDynamicBoss(bossCfg);
          object = {
            id: hostile.id,
            kind: 'boss',
            x: pos.x,
            z: pos.z,
            state: 'defended',
            loot: { apple: 0 },
            bossId: `portal-boss-${hostile.id}`,
            bossName: hostile.name,
          };
        } else {
          const subPortal = portalState.portals.find(p => p.id === target.id && p.id !== 'portal-prime');
          if (subPortal && portalConfig.portalLevelScaling.subPortal?.destroyable) {
            const bossCfg = subPortalDefenderToBossConfig(subPortal);
            registerDynamicBoss(bossCfg);
            object = {
              id: subPortal.id,
              kind: 'boss',
              x: subPortal.coordinate.x,
              z: subPortal.coordinate.z,
              state: 'defended',
              loot: { apple: 50 * subPortal.level },
              bossId: `subportal-boss-${subPortal.id}`,
              bossName: `${subPortal.name} Defenders`,
            };
          }
        }
      }
      if (!target) throw new Error('Choose a destination.');
      if (action !== 'march' && !object) throw new Error('Choose a world object.');
      const dispatchedAt = Date.now();
      if (index !== null) {
        const active = units.find(unit => unit.kind === 'army' && unit.cityId === selectedCity.id && unit.formationIndex === index);
        if (active) {
          if (battleSessionsRef.current.some(s => (s.armies ?? [s.army]).some(a => a.id === active.id) && !s.battle.result)) throw new Error('This formation is fighting. Use Retreat in the battle controls.');
          const redirected = action === 'march'
            ? commandUnit(active, 'move', dispatchedAt, target)
            : commandWorldAction(active, action, object!, dispatchedAt);
          setUnits(current => current.map(unit => unit.id === redirected.id ? redirected : unit));
          setSelectedUnitId(redirected.id); setTarget(null); setRouteAction(null); setSelectedAction(null);
          setMessage(action === 'march' ? `${redirected.name} marching to the selected destination.` : `${redirected.name} redirected to ${action} ${target.label}.`);
          return;
        }
      }
      const candidate: WorldUnit = index !== null
        ? createArmy(formations[index], index, selectedCity.id, selectedCity.name, unitStats.marchSpeed, crypto.randomUUID())
        : createScout(selectedCity.id, selectedCity.name, unitStats.marchSpeed, crypto.randomUUID());
      const deployed = deployUnit(candidate, units, troops, target, dispatchedAt);
      const unit = action === 'march' ? deployed : commandWorldAction(deployed, action, object!, dispatchedAt);
      setUnits(current => [...current, unit]); setSelectedUnitId(unit.id);
      setTarget(null); setRouteAction(null); setSelectedAction(null); setMessage(action === 'march' ? `${unit.name} is marching to the selected destination.` : `${unit.name} dispatched to ${action} ${target.label}.`);
    } catch (error) { setMessage((error as Error).message); }
  }
  function chooseWorldAction(action: WorldAction) {
    if (action === 'scout') {
      const object = target?.id ? worldObjects.find(item => item.id === target.id) : undefined;
      if (!object) return;
      const activeScout = units.find(unit => unit.kind === 'scout' && unit.cityId === selectedCity.id);
      if (activeScout) {
        try {
          const next = commandWorldAction(activeScout, action, object, Date.now());
          setUnits(current => current.map(unit => unit.id === next.id ? next : unit));
          setSelectedUnitId(next.id); setTarget(null); setRouteAction(null); setMessage(`${next.name} redirected to scout ${object.kind}.`);
        } catch (error) { setMessage((error as Error).message); }
      } else deploy(null, action);
      return;
    }
    chooseMarch(action);
  }
  function spawnMobGroup(chosenBossId?: string) {
    if (!target || target.id || !mobSpawnEnabled) return;
    const bossToSpawn = chosenBossId || selectedBossId;
    const actualBossId = bossToSpawn === 'random' ? undefined : bossToSpawn;
    const spawned = createMobGroup(mobGroup, target.x, target.z, worldObjects, actualBossId);
    if (!spawned) { setMessage('Choose clear ground away from the city, map edge, and other world sites.'); return; }
    const objects = [...worldObjects, spawned];
    setWorldObjects(objects); view.current?.loadWorld(objects);
    try { localStorage.setItem(WORLD_SAVE_KEY, JSON.stringify(objects)); } catch { /* Storage optional */ }
    const label = spawned.bossName ? `${spawned.bossName} (Chimera lair)` : 'Chimera pack';
    setTarget({ x: spawned.x, z: spawned.z, id: spawned.id, label });
    setRouteAction('choose');
    setMessage(`${spawned.bossName ?? 'Boss mob'} summoned at ${spawned.x.toFixed(1)}, ${spawned.z.toFixed(1)}. Send an attack march when your formation is ready.`);
  }
  function issueCommand(kind: 'move' | 'hold' | 'return') {
    const unit = units.find(u => u.id === selectedUnitId);
    if (!unit) return;
    if (battleSessionsRef.current.some(s => (s.armies ?? [s.army]).some(a => a.id === unit.id))) { setMessage('This formation is fighting. Use Retreat in the battle controls.'); return; }
    try {
      const next = commandUnit(unit, kind, Date.now(), target ?? undefined);
      setUnits(current => current.map(u => u.id === next.id ? next : u));
      setTarget(null); setRouteAction(null); setMessage(kind === 'return' ? 'Unit returning to base.' : kind === 'hold' ? 'Unit holding position.' : 'Destination updated.');
    } catch (error) { setMessage((error as Error).message); }
  }
  const selectedUnit = units.find(u => u.id === selectedUnitId);
  const selectedEnemyMarch = portalState.activeEnemyMarches.find(m => m.id === selectedUnitId);
  const selectedPosition = selectedUnit
    ? unitPosition(selectedUnit, now)
    : selectedEnemyMarch
    ? enemyMarchPosition(selectedEnemyMarch, now)
    : null;
  const hostileTargetMarch = target?.id ? portalState.activeEnemyMarches.find(m => m.id === target.id) : undefined;
  const targetSubportal = target?.id ? portalState.portals.find(p => p.id === target.id && p.id !== 'portal-prime') : undefined;
  const isDestroyableSubportal = targetSubportal && portalConfig.portalLevelScaling.subPortal?.destroyable;
  const selectedObject = target?.id
    ? (worldObjects.find(object => object.id === target.id) ?? (hostileTargetMarch ? {
        id: hostileTargetMarch.id,
        kind: 'boss' as const,
        x: target.x,
        z: target.z,
        state: 'defended' as const,
        loot: { apple: 0 },
        bossId: `portal-boss-${hostileTargetMarch.id}`,
        bossName: hostileTargetMarch.name,
      } : isDestroyableSubportal ? {
        id: targetSubportal.id,
        kind: 'boss' as const,
        x: targetSubportal.coordinate.x,
        z: targetSubportal.coordinate.z,
        state: 'defended' as const,
        loot: { apple: 50 * targetSubportal.level },
        bossId: `subportal-boss-${targetSubportal.id}`,
        bossName: `${targetSubportal.name} Defenders`,
      } : undefined))
    : undefined;
  const targetActions = selectedObject ? getWorldObjectActions(selectedObject) : [];

  return <main className={`game ${worldView ? 'world-mode' : ''}`}>
    <button className="world-toggle" onClick={toggleWorldView}>{worldView ? 'Base' : 'World'}</button>
    <canvas ref={canvas} aria-label="Lunacia settlement. Drag to pan, scroll or pinch to zoom. Choose a building, then tap the land to position it." />
    <header className="topbar">
      <div
        className="identity"
        role="button"
        tabIndex={0}
        onClick={() => setShowIntro(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setShowIntro(true); }}
        title="Open Title Screen / Change Wallet"
        style={{ pointerEvents: 'auto', cursor: 'pointer' }}
      >
        <div className="crest">✦</div>
        <div>
          <span className="eyebrow">AXIE CONQUEST · MENU</span>
          <strong>{selectedCity.name}</strong>
          <small>Lunacia · Your settlement</small>
        </div>
      </div>
      <div className="resources"><div><span>🌾</span><strong>{farms}<small>FARMS</small></strong></div><div><span>▦</span><strong>{800 - usedCells}<small>FREE CELLS</small></strong></div><div className="power" aria-label="Power"><span>⚡</span><strong>POWER</strong></div><div className="level"><span>✦</span><strong>1<small>HALL LEVEL</small></strong></div></div>
    </header>
    <aside className="chapter"><span className="eyebrow">CHAPTER 01 / ROOTS OF A KINGDOM</span><h1>A home worth<br />growing.</h1><p>Raise your first farm.<br />Bring life back to Lunacia.</p><div className="objective"><span className={farms ? 'complete' : ''}>{farms ? '✓' : '○'}</span><div>Plant the foundations<small>{farms ? 'First farm established' : 'Build your first farm'}</small></div></div></aside>
    <div className="map-controls"><button aria-label="Zoom in" onClick={() => view.current?.zoom(0.85)}>+</button><button aria-label="Zoom out" onClick={() => view.current?.zoom(1.18)}>−</button><button aria-label="Center on main hall" onClick={() => view.current?.home()}>⌂</button></div>
    <aside className="march-list" aria-label="World units">
      <strong>World units</strong>
      {portalState.activeEnemyMarches.map(march => {
        const position = enemyMarchPosition(march, now);
        const etaMs = Math.max(0, march.arrivesAt - now);
        return (
          <button
            key={march.id}
            aria-pressed={selectedUnitId === march.id}
            style={{
              borderLeft: '4px solid #ef4444',
              background: selectedUnitId === march.id ? '#fee2e2' : 'rgba(254, 242, 242, 0.7)',
            }}
            aria-label={`Focus camera on ${march.name}`}
            onClick={() => {
              setSelectedUnitId(march.id);
              setSelectedPortalId(null);
              setTarget(null);
              setRouteAction(null);
              setSelectedAction(null);
              if (!worldView) {
                view.current?.setWorldView(true);
                setWorldView(true);
              }
              view.current?.focusCoordinate(position);
            }}
          >
            <strong style={{ color: '#b91c1c' }}>⚠️ {march.name}</strong>
            <small style={{ color: '#991b1b' }}>
              {march.status === 'fighting'
                ? '⚔️ In battle'
                : march.status === 'arrived' || now >= march.arrivesAt
                ? '⚔️ Halted outside city'
                : `Hostile wave · ETA ${formatDuration(etaMs)}`}
            </small>
            <span className="unit-coordinate">⌖ {position.x.toFixed(1)}, {position.z.toFixed(1)} · View enemy</span>
          </button>
        );
      })}
      {units.map(unit => {
        const position = unitPosition(unit, now);
        const activity = unit.order?.activity ?? unit.activity;
        return (
          <button
            key={unit.id}
            aria-pressed={selectedUnitId === unit.id}
            aria-label={`Focus camera on ${unit.name} at ${position.x.toFixed(1)}, ${position.z.toFixed(1)}`}
            onClick={() => {
              setSelectedUnitId(unit.id);
              setSelectedPortalId(null);
              setTarget(null);
              setRouteAction(null);
              setSelectedAction(null);
              if (!worldView) {
                view.current?.setWorldView(true);
                setWorldView(true);
              }
              view.current?.focusCoordinate(position);
            }}
          >
            <strong>{unit.name}</strong>
            <small>{activity ? `${activity.action} · ${activity.targetLabel}` : settleUnit(unit, now).status} {unit.order ? `· ${formatDuration(unit.order.arrivesAt - now)}` : ''}</small>
            <span className="unit-coordinate">⌖ {position.x.toFixed(1)}, {position.z.toFixed(1)} · View unit</span>
          </button>
        );
      })}
      {!units.length && !portalState.activeEnemyMarches.length && <small>No units deployed</small>}
    </aside>
    {worldView && selectedEnemyMarch && (
      <section
        className="selection world-action panel"
        style={{
          border: '2px solid #ef4444',
          background: 'rgba(28, 16, 20, 0.95)',
          color: '#fef2f2',
          boxShadow: '0 8px 30px rgba(220, 38, 38, 0.3)',
          right: 'var(--edge-right)',
          left: 'auto',
          marginInline: 0,
          marginLeft: 'auto',
          marginRight: 0,
          width: 'min(380px, 94vw)',
          zIndex: 20,
        }}
        aria-label="Selected hostile march"
      >
        <button
          className="close"
          aria-label="Deselect hostile march"
          onClick={() => setSelectedUnitId(null)}
          style={{ background: '#7f1d1d', color: '#fecaca', border: '1px solid #dc2626' }}
        >
          &times;
        </button>
        <span className="eyebrow" style={{ color: '#f87171' }}>
          ⚠️ HOSTILE MARCH · WAVE {selectedEnemyMarch.level}
        </span>
        <h2 style={{ color: '#ffffff' }}>{selectedEnemyMarch.name}</h2>
        <p style={{ color: '#fca5a5' }}>
          Origin: {selectedEnemyMarch.portalName} ➔ Destination: Everleaf Haven
        </p>
        <div
          style={{
            background: 'rgba(127, 29, 29, 0.45)',
            border: '1.5px solid #ef4444',
            borderRadius: '8px',
            padding: '8px 12px',
            margin: '8px 0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#fca5a5' }}>
            {selectedEnemyMarch.status === 'fighting'
              ? 'STATUS:'
              : now >= selectedEnemyMarch.arrivesAt || selectedEnemyMarch.status === 'arrived'
              ? 'STATUS:'
              : 'ETA ARRIVAL:'}
          </span>
          <strong style={{ fontSize: '15px', color: '#ffffff' }}>
            {selectedEnemyMarch.status === 'fighting'
              ? '⚔️ ENGAGED IN BATTLE'
              : now >= selectedEnemyMarch.arrivesAt || selectedEnemyMarch.status === 'arrived'
              ? '⚔️ HALTED OUTSIDE CITY'
              : formatDuration(Math.max(0, selectedEnemyMarch.arrivesAt - now))}
          </strong>
        </div>
        <p style={{ fontSize: '11px', color: '#fecaca' }}>
          Current Position: {enemyMarchPosition(selectedEnemyMarch, now).x.toFixed(1)}, {enemyMarchPosition(selectedEnemyMarch, now).z.toFixed(1)} · March Speed: {selectedEnemyMarch.speed} tiles/s
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', margin: '8px 0' }}>
          <div style={{ background: 'rgba(131, 24, 67, 0.35)', border: '1px solid #db2777', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#fbcfe8', display: 'block' }}>👑 Boss Mascot</span>
            <strong style={{ fontSize: '14px', color: '#ffffff' }}>{selectedEnemyMarch.formation.totalMascot}</strong>
          </div>
          <div style={{ background: 'rgba(30, 41, 59, 0.5)', border: '1px solid #64748b', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#cbd5e1', display: 'block' }}>⚔️ Soldiers</span>
            <strong style={{ fontSize: '14px', color: '#ffffff' }}>{selectedEnemyMarch.formation.totalSoldier}</strong>
          </div>
          <div style={{ background: 'rgba(20, 83, 45, 0.35)', border: '1px solid #16a34a', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#bbf7d0', display: 'block' }}>🏹 Archers</span>
            <strong style={{ fontSize: '14px', color: '#ffffff' }}>{selectedEnemyMarch.formation.totalArcher}</strong>
          </div>
        </div>
        <small style={{ color: '#fca5a5', display: 'block', marginTop: '6px' }}>
          Hostiles halt outside the city perimeter. Next wave will not spawn until hostiles are defeated.
        </small>
        <div className="placement-actions" style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
            <button
              className="primary"
              style={{
                background: '#dc2626',
                borderColor: '#f87171',
                color: '#ffffff',
                fontWeight: 'bold',
                padding: '10px 8px',
                cursor: 'pointer',
              }}
              onClick={() => handleAttackHostileMarch(selectedEnemyMarch)}
            >
              ⚔️ Attack
            </button>
            <button
              className="secondary"
              style={{
                background: 'rgba(30, 41, 59, 0.8)',
                borderColor: '#64748b',
                color: '#f1f5f9',
                padding: '10px 8px',
                cursor: 'pointer',
              }}
              onClick={() => handleMarchToHostileMarch(selectedEnemyMarch)}
            >
              March here
            </button>
          </div>
          <button
            className="secondary"
            style={{
              background: 'rgba(127, 29, 29, 0.4)',
              borderColor: '#7f1d1d',
              color: '#fca5a5',
              fontSize: '11px',
              padding: '4px',
              cursor: 'pointer',
            }}
            onClick={() => handleDefeatHostileMarch(selectedEnemyMarch.id)}
            title="Developer instant clear"
          >
            💥 Instant Defeat (Dev)
          </button>
        </div>
      </section>
    )}
    {worldView && selectedUnit && selectedUnit.id !== battleSession?.army.id && <section className="selection world-action panel" aria-label="Selected unit"><button className="close" aria-label="Deselect unit" onClick={() => setSelectedUnitId(null)}>&times;</button><span className="eyebrow">{selectedUnit.kind} · {settleUnit(selectedUnit, now).status}</span><h2>{selectedUnit.name}</h2><p>Position {selectedPosition!.x.toFixed(1)}, {selectedPosition!.z.toFixed(1)} · {selectedUnit.members.reduce((n, m) => n + m.count, 0)} members</p>{(selectedUnit.order?.activity ?? selectedUnit.activity) ? <p>{(selectedUnit.order?.activity ?? selectedUnit.activity)!.action} · {(selectedUnit.order?.activity ?? selectedUnit.activity)!.targetLabel}{selectedUnit.order ? ` · ${formatDuration(selectedUnit.order.arrivesAt - now)}` : ' · Arrived'}</p> : <p>{target ? `Move to ${target.x.toFixed(1)}, ${target.z.toFixed(1)}` : 'Tap empty ground to choose a destination.'}</p>}<div className="placement-actions"><button className="primary" disabled={!target || !!target.id} onClick={() => issueCommand('move')}>Move</button><button className="secondary" disabled={!selectedUnit.order && !selectedUnit.activity} onClick={() => issueCommand('hold')}>Hold</button><button className="secondary" disabled={selectedUnit.status === 'returning'} onClick={() => issueCommand('return')}>Return to base</button></div></section>}
    {battleError && !battleSession && <section className="selection panel" role="alert"><p>{battleError}</p><button className="primary" onClick={() => setBattleError('')}>Retry battle</button></section>}
    {loadError && <section className="selection panel" role="alert"><p>{loadError}</p><button className="primary" onClick={() => window.location.reload()}>Retry reload</button></section>}
    {!ready && !loadError && <div className="loading">Preparing your settlement…</div>}
    {selected && !placing && <section className="selection panel"><button className="close" aria-label="Close building details" onClick={() => setSelected(null)}>×</button><span className="eyebrow">LEVEL 1 · {BUILDING_DEFINITIONS[selected.kind].category}</span><h2>{selected.kind === 'hall' ? selectedCity.name : BUILDING_DEFINITIONS[selected.kind].name}</h2>{selected.kind === 'hall' && <div className="city-nickname"><label htmlFor="city-nickname">City name</label><div><input id="city-nickname" value={nicknameDraft || selectedCity.name} maxLength={24} onChange={event => setNicknameDraft(event.target.value)} onFocus={event => { if (!nicknameDraft) setNicknameDraft(event.currentTarget.value); }} onKeyDown={event => { if (event.key === 'Enter') renameCapital(); }} /><button className="primary" disabled={!nicknameDraft.trim() || nicknameDraft.trim() === selectedCity.name} onClick={renameCapital}>Rename</button></div><small>You can update this name anytime.</small></div>}<p>{BUILDING_DEFINITIONS[selected.kind].description}</p><small>{getBuildingDimensions(selected.kind, selected.rotation).width} × {getBuildingDimensions(selected.kind, selected.rotation).depth} footprint · Cell {selected.x + 1}, {selected.z + 1}</small><div className="placement-actions"><button className="primary" onClick={moveSelected}>Move</button><button className="secondary" onClick={() => view.current?.rotate(selected.id)} aria-label="Rotate building 90 degrees">Rotate</button>{selected.kind !== 'hall' && <button className="secondary remove-action" onClick={removeSelected}>Remove</button>}</div></section>}
    {placing ? <section className="placement panel"><div><span className="eyebrow">{moving ? 'MOVING' : 'PLACING'} / {BUILDING_DEFINITIONS[buildingKind].name}</span><h2>{valid ? 'Room to grow' : 'Choose another spot'}</h2><p aria-live="polite">{cell ? (valid ? `Clear land at ${cell.x + 1}, ${cell.z + 1}. Ready to ${moving ? 'move' : 'build'}.` : 'Blocked: overlaps a building or crosses the base edge.') : `Tap the land to position your ${BUILDING_DEFINITIONS[buildingKind].name}.`}</p><div className="legend"><span>🟩 Available</span><span>🟥 Blocked</span><span>{size.width} × {size.depth} cells</span></div></div><div className="placement-actions"><button className="secondary" onClick={cancel}>Cancel</button><button className="primary" disabled={!valid} onClick={confirm}>✓ {moving ? 'Confirm move' : `Build ${BUILDING_DEFINITIONS[buildingKind].name}`}</button></div></section> : catalog && !selected && <section className="catalog panel"><div className="catalog-heading"><div><span className="eyebrow">MAKE ROOM FOR POSSIBILITY</span><h2>Build your haven</h2></div><button className="close" aria-label="Close build menu" onClick={() => setCatalog(false)}>×</button></div><div className="building-options">{BUILDABLE_KINDS.map(kind => {
      const definition = BUILDING_DEFINITIONS[kind];
      const dimensions = getBuildingDimensions(kind);
      return <button key={kind} className="building-card" onClick={() => begin(kind)} disabled={!ready}><span className="building-art" aria-hidden="true">{definition.icon}</span><span><strong>{definition.name}</strong><small>{definition.category} &middot; {dimensions.width} &times; {dimensions.depth}</small></span><span className="add" aria-hidden="true">+</span></button>;
    })}</div><div className="catalog-footer">Prototype construction is free <span>40 × 20 base grid</span></div></section>}
    {!selectedUnit && target && routeAction === 'choose' && <section className="selection world-action panel" aria-label="World actions"><button className="close" aria-label="Close world actions" onClick={() => { setTarget(null); setRouteAction(null); setSelectedAction(null); }}>&times;</button><span className="eyebrow">{selectedObject ? `${selectedObject.state} · ${selectedObject.kind}` : 'WORLD TARGET'}</span><h2>{target.label || 'Uncharted land'}</h2><p>Coordinate {target.x.toFixed(1)}, {target.z.toFixed(1)} · Route {createRoute(target).distance} tiles</p>{selectedObject && <div className="world-object-actions">{targetActions.map(option => <div key={option.action}><button className={option.action === 'attack' ? 'primary' : 'secondary'} disabled={!option.enabled} onClick={() => chooseWorldAction(option.action)}>{option.action[0].toUpperCase() + option.action.slice(1)}</button>{option.reason && <small>{option.reason}</small>}</div>)}</div>}{mobSpawnEnabled && !selectedObject && <div className="world-object-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'rgba(25, 33, 30, 0.9)', borderRadius: '6px', border: '1px solid #f59e0b', margin: '6px 0' }}><label htmlFor="world-boss-select" style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚔ Summon Boss Mob</label><select id="world-boss-select" value={selectedBossId} onChange={e => setSelectedBossId(e.target.value)} style={{ padding: '6px 10px', borderRadius: '4px', background: '#151d1a', color: '#fff', border: '1px solid #4a5c54', fontSize: '0.85rem', cursor: 'pointer' }}>{getAllBosses().map(boss => <option key={boss.id} value={boss.id}>{boss.name} {boss.title ? `(${boss.title})` : ''}</option>)}<option value="random">Random Boss</option></select><button className="primary" onClick={() => spawnMobGroup(selectedBossId)}>Summon {selectedBossId === 'random' ? 'Random Boss' : (getBossConfig(selectedBossId)?.name ?? 'Boss')}</button><small style={{ color: '#aaa', fontSize: '0.75rem' }}>Developer HUD enabled: spawn at {target.x.toFixed(1)}, {target.z.toFixed(1)}.</small></div>}<button className={selectedObject ? 'secondary' : 'primary'} onClick={() => chooseMarch('march')}>March here</button><small>{selectedObject ? 'March here moves a formation into position without starting combat.' : 'Choose a formation and send it to this location.'}</small></section>}
    {!selectedUnit && target && routeAction === 'formation' && selectedAction && <section className="selection world-action panel" aria-label="World actions"><button className="close" aria-label="Close world actions" onClick={() => { setRouteAction('choose'); setFormationIndex(null); }}>&times;</button><span className="eyebrow">{selectedAction === 'march' ? `MARCH · ${target.label || 'DESTINATION'}` : `${selectedAction.toUpperCase()} · ${target.label}`}</span><h2>Choose formation</h2><p>At-home and deployed formations can take this order.</p>{formations.map((formation, index) => { const active = units.find(unit => unit.kind === 'army' && unit.cityId === selectedCity.id && unit.formationIndex === index); const issue = formationIssue(index); const origin = active ? unitPosition(active, now) : { x: 0, z: 0 }; const eta = marchTravelTimeMs(createRoute(target, origin), active?.speed ?? unitStats.marchSpeed); return <button key={index} className="building-card" aria-pressed={formationIndex === index} disabled={!!issue} onClick={() => setFormationIndex(index)}><strong>Formation {index + 1}{active ? ' · Deployed' : ' · At home'}{formationIndex === index ? ' · Selected' : ''}</strong><small>{issue || `${active ? `${settleUnit(active, now).status} · ${active.members.reduce((sum, member) => sum + member.count, 0)} members` : 'Ready to deploy'} · ETA ${formatDuration(eta)}`}</small></button>; })}{!formations.some(isValidFormation) && !units.some(unit => unit.kind === 'army') && <button className="secondary" onClick={() => { setTarget(null); setRouteAction(null); setSelectedAction(null); setMilitary(true); }}>Configure formations in Military</button>}<button className="primary" disabled={formationIndex === null || !!formationIssue(formationIndex)} onClick={() => { if (formationIndex !== null) deploy(formationIndex, selectedAction); }}>{selectedAction === 'march' ? 'Send march' : selectedAction === 'attack' ? 'Send attack' : selectedAction === 'occupy' ? 'Send occupiers' : 'Send gatherers'}</button></section>}
    {military && !placing && !selected && <MilitaryPanel troops={troops} units={units} cityId={selectedCity.id} now={now} axies={apiAxies} deployedIds={selectedCity.deployedAxieIds.filter(id => apiAxies.some(axie => axie.id === id))} formations={formations} onFormationsChange={setFormations} onClose={() => setMilitary(false)} />}
    {cityUnit && !placing && !selected && <CityUnitPanel city={{ ...selectedCity, troops }} axies={apiAxies} onClose={() => setCityUnit(false)} />}
    <button
      className="portal-toggle build-toggle"
      style={{
        position: 'absolute',
        zIndex: 3,
        right: 'var(--edge-right)',
        bottom: 'calc(var(--bottom) + 162px)',
        background: selectedPortalId ? '#7e22ce' : 'rgba(59, 7, 100, 0.88)',
        border: '1.5px solid #a855f7',
        color: '#f3e8ff',
        boxShadow: '0 4px 16px rgba(88, 28, 135, 0.35)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
      onClick={() => {
        if (selectedPortalId) {
          setSelectedPortalId(null);
        } else {
          const targetPortal = portalState.portals[0];
          if (targetPortal) {
            setSelectedPortalId(targetPortal.id);
            if (!worldView) {
              view.current?.setWorldView(true);
              setWorldView(true);
            }
            view.current?.focusCoordinate(targetPortal.coordinate);
          }
        }
      }}
      aria-expanded={!!selectedPortalId}
      aria-label="Toggle Portal HUD"
    >
      <span>🌀 Portal</span>
      {portalState.activeEnemyMarches.length > 0 ? (
        <span style={{ background: '#ef4444', color: '#ffffff', padding: '1px 5px', borderRadius: '6px', fontSize: '10px', fontWeight: 800 }}>
          ⚔️ {portalState.activeEnemyMarches.length}
        </span>
      ) : portalConfig.paused ? (
        <span style={{ background: 'rgba(100, 116, 139, 0.65)', color: '#e2e8f0', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
          ⏸️
        </span>
      ) : portalState.portals[0] ? (
        <span style={{ background: 'rgba(147, 51, 234, 0.45)', color: '#f3e8ff', padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>
          {portalState.portals[0].cycleState === 'active_wave' ? '⚔️' : `${Math.max(0, Math.ceil((portalState.portals[0].nextAttackTime - now) / 1000))}s`}
        </span>
      ) : null}
    </button>
    <button className="city-toggle build-toggle" onClick={() => { setHeroes(false); setMilitary(false); setTraining(false); setInventory(false); setSelected(null); setCatalog(false); setCityUnit(current => !current); }} aria-expanded={cityUnit}><span>City</span></button>
    <button className="inventory-toggle build-toggle" onClick={toggleInventory} aria-expanded={inventory}><span>Inventory</span></button>
    {inventory && !catalog && !placing && !selected && <section className="inventory panel" aria-label="Inventory">
      <div className="catalog-heading"><div><span className="eyebrow">YOUR LUNACIAN STORES</span><h2>Inventory</h2></div><button className="close" aria-label="Close inventory" onClick={() => setInventory(false)}>&times;</button></div>
      <div className="inventory-tabs" role="tablist" aria-label="Inventory categories">
        {([['resources', 'Resources'], ['equipment', 'Equipment'], ['other', 'Other']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={inventoryTab === tab} className={inventoryTab === tab ? 'active' : ''} onClick={() => setInventoryTab(tab)}>{label}</button>)}
      </div>
      <div className="empty-state" role="tabpanel"><span className="empty-state-icon" aria-hidden="true">▧</span><strong>No {inventoryTab} yet</strong><p>Your {inventoryTab} will appear here as you explore and rebuild Lunacia.</p></div>
    </section>}
    {heroes && !placing && !selected && <HeroesPanel axies={apiAxies} deployedIds={selectedCity.deployedAxieIds.filter(id => apiAxies.some(axie => axie.id === id))} status={axieSyncStatus} error={axieSyncError} syncedAt={axieSyncedAt} onDeploy={id => setSelectedCity(city => city.deployedAxieIds.includes(id) ? city : { ...city, deployedAxieIds: [...city.deployedAxieIds.filter(deployedId => apiAxies.some(axie => axie.id === deployedId)), id] })} onEnlist={id => setSelectedCity(city => ({ ...city, deployedAxieIds: city.deployedAxieIds.filter(deployedId => deployedId !== id) }))} onClose={() => setHeroes(false)} />}
    {training && <TrainingDialog buildings={buildings} troops={troops} ready={ready} onTrain={kind => { view.current?.train(kind); }} onClose={() => setTraining(false)} />}
    {developer && <DeveloperPanel
      settings={generation}
      onSettings={setGeneration}
      objects={worldObjects}
      status={generationStatus}
      ready={ready}
      mobSpawnEnabled={mobSpawnEnabled}
      onMobSpawnEnabled={setMobSpawnEnabled}
      mobGroup={mobGroup}
      onMobGroup={setMobGroup}
      selectedBossId={selectedBossId}
      onSelectedBossId={setSelectedBossId}
      activeAxies={apiAxies.filter(axie => selectedCity.deployedAxieIds.includes(axie.id))}
      debugBattle={battleDebug}
      onDebugBattleChange={setBattleDebug}
      activeBattleSession={battleSession}
      onAbortBattle={abortBattle}
      portalConfig={portalConfig}
      onPortalConfigChange={newConfig => {
        setPortalConfig(newConfig);
        try {
          localStorage.setItem(PORTAL_CONFIG_SAVE_KEY, JSON.stringify(newConfig));
        } catch { /* ignore */ }
      }}
      portalState={portalState}
      onTriggerPortalWave={id => triggerPortalWave(id)}
      onSummonNewPortal={() => summonNewPortalManual()}
      onResetPortals={() => resetPortalsManual()}
      onClose={() => setDeveloper(false)}
      onRegenerate={regenerate}
      onRemove={() => { view.current?.removeWorld(); try { localStorage.setItem(WORLD_SAVE_KEY, '[]'); } catch { /* Keep the removal in memory when storage is unavailable. */ } setWorldObjects([]); setGenerationStatus('All generated objects removed.'); }}
    />}
    {selectedPortalId && (
      <PortalDialog
        portal={portalState.portals.find(p => p.id === selectedPortalId) ?? portalState.portals[0]}
        config={portalConfig}
        now={now}
        onClose={() => setSelectedPortalId(null)}
        onTriggerWave={id => triggerPortalWave(id)}
        onTogglePause={togglePortalPause}
        onAttackPortal={handleAttackPortal}
      />
    )}
    {mail && <MailDialog battleReports={battleReports} onClose={() => setMail(false)} />}
    {battleSessions.length > 0 && !spectating && (
      <aside
        style={{
          position: 'fixed',
          top: '72px',
          right: '16px',
          zIndex: 40,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          maxWidth: '92vw',
          pointerEvents: 'auto',
        }}
        aria-label="Active combat indicator"
      >
        {battleSessions.map(session => {
          const isFinished = !!session.battle.result;
          const players = session.battle.fighters.filter(f => f.side === 'player');
          const maxHp = players.reduce((sum, f) => sum + f.maxHp, 0);
          const hp = players.reduce((sum, f) => sum + f.hp, 0);
          const ratio = maxHp ? Math.round((hp / maxHp) * 100) : 0;
          return (
            <div
              key={session.id || session.army.id}
              style={{
                background: 'rgba(24, 30, 28, 0.92)',
                backdropFilter: 'blur(8px)',
                border: `1px solid ${isFinished ? '#888' : battlePaused ? '#f1c40f' : 'rgba(255, 90, 90, 0.5)'}`,
                borderRadius: '8px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isFinished ? '#888' : battlePaused ? '#f1c40f' : '#e04040',
                  boxShadow: isFinished || battlePaused ? 'none' : '0 0 8px #e04040',
                  flexShrink: 0,
                }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: '130px' }}>
                <strong style={{ fontSize: '0.85rem' }}>
                  {isFinished
                    ? `⚔️ ${session.battle.result}`
                    : battlePaused && session.battle.tick === 0
                    ? '⚔️ Ready to Engage'
                    : battlePaused
                    ? '⏸ Battle Paused'
                    : '⚔️ Combat in progress'}
                </strong>
                <small style={{ opacity: 0.85, fontSize: '0.75rem' }}>
                  {(session.armies && session.armies.length > 1 ? session.armies.map(a => a.name).join(' + ') : session.army.name)} · {ratio}% HP
                </small>
              </div>
              {battlePaused && session.battle.tick > 0 && !session.battle.result && (
                <button
                  className="secondary"
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                  onClick={() => setBattlePaused(false)}
                >
                  Resume
                </button>
              )}
              {!isFinished && (
                <button
                  className="secondary"
                  style={{ fontSize: '0.8rem', padding: '4px 10px', color: '#ff907d' }}
                  onClick={() => retreatBattle(session)}
                >
                  Retreat
                </button>
              )}
              <button
                className="primary"
                style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                onClick={() => {
                  setSpectatorSession(session);
                  setSpectating(true);
                }}
              >
                Watch Battle
              </button>
            </div>
          );
        })}
      </aside>
    )}
    {spectating && (spectatorSession || battleSessions[0]) && (
      <BattleSpectatorModal
        session={(spectatorSession || battleSessions[0])!}
        allSessions={battleSessions}
        onSelectSession={setSpectatorSession}
        isPaused={battlePaused}
        onTogglePause={toggleBattlePause}
        onStep={stepBattleOnce}
        onRestart={restartBattle}
        speed={battleSpeed}
        onSpeedChange={setBattleSpeed}
        onClose={() => {
          setSpectating(false);
          setSpectatorSession(null);
        }}
        onRetreat={() => retreatBattle(spectatorSession || battleSessions[0])}
        debug={battleDebug}
        onFinish={() => {
          setSpectating(false);
          setSpectatorSession(null);
        }}
      />
    )}
    <footer className="bottom-bar"><div className="status" role="status"><span className="status-dot" />{message}<small>DRAG TO PAN · PINCH / SCROLL TO ZOOM</small></div><div className="hud-actions"><button className="build-toggle" onClick={toggleDeveloper} aria-expanded={developer}><span>Developer</span></button><button className="build-toggle" onClick={toggleHeroes} aria-expanded={heroes}><span>Axies</span></button><button className="build-toggle" onClick={toggleTraining} aria-expanded={training}><span>Train</span></button><button className="build-toggle" onClick={toggleMail} aria-haspopup="dialog" aria-expanded={mail}><span>Mail</span></button><button className="build-toggle" onClick={toggleMilitary} aria-expanded={military}><span>Military</span></button><button className="build-toggle" onClick={() => { setDeveloper(false); setHeroes(false); setMilitary(false); setTraining(false); if (placing) cancel(); else { setSelected(null); setCatalog(selected ? true : !catalog); } }} aria-expanded={(catalog && !selected) || placing}>▦ <span>{placing ? (moving ? 'Cancel move' : 'Cancel build') : 'Build'}</span></button></div></footer>
    {showIntro && <IntroScreen onStartGame={handleStartGame} onRestartGame={handleRestartGame} />}
  </main>;
}

