import { useEffect, useState } from 'react';
import BattleSandbox from './battle-sandbox';
import ResetGameControl from './reset-game-control';
import { GenerationSettings, SpawnableMobGroup, WorldObject, SPAWNABLE_MOB_GROUPS, WORLD_KINDS, WORLD_DEFINITIONS, WORLD_WIDTH, WORLD_DEPTH, DEFAULT_GENERATION, WorldKind } from '@/game/world';
import { getActiveGenerationSettings } from '@/game/resource-spawn-config';
import { DEFAULT_UNIT_GLOBAL_STATS, setActiveUnitGlobalStats, UnitGlobalStats } from '@/game/unit-stats';
import { BATTLE_SETTINGS_SAVE_KEY, BattleSettings, DEFAULT_BATTLE_SETTINGS, restoreActiveBattleSettings, sanitizeBattleSettings, setActiveBattleSettings } from '@/game/battle-settings';
import type { BattleSession } from '@/game/battle-save';
import type { ApiAxie } from '@/game/axie-roster';

import { getAllBosses } from '@/game/bosses';
import {
  DEFAULT_PORTAL_CONFIG,
  PORTAL_CONFIG_SAVE_KEY,
  PortalMobSummoningConfig,
  PortalRuntimeState,
  sanitizePortalConfig,
  setActivePortalConfig,
} from '@/game/portal';

type Props = {
  settings: GenerationSettings; onSettings: (settings: GenerationSettings) => void;
  objects: WorldObject[]; status: string; ready: boolean; unitStats?: UnitGlobalStats; onUnitStats?: (stats: UnitGlobalStats) => void;
  onClose: () => void; onRegenerate: () => void; onRemove: () => void;
  mobSpawnEnabled: boolean; onMobSpawnEnabled: (enabled: boolean) => void;
  mobGroup: SpawnableMobGroup; onMobGroup: (group: SpawnableMobGroup) => void;
  selectedBossId?: string; onSelectedBossId?: (id: string) => void;
  activeAxies: readonly ApiAxie[];
  debugBattle?: boolean;
  onDebugBattleChange?: (enabled: boolean) => void;
  activeBattleSession?: BattleSession | null;
  onAbortBattle?: () => void;
  portalConfig?: PortalMobSummoningConfig;
  onPortalConfigChange?: (config: PortalMobSummoningConfig) => void;
  portalState?: PortalRuntimeState;
  onTriggerPortalWave?: (portalId?: string) => void;
  onSummonNewPortal?: () => void;
  onResetPortals?: () => void;
};

export default function DeveloperPanel({
  settings,
  onSettings,
  objects,
  status,
  ready,
  unitStats = DEFAULT_UNIT_GLOBAL_STATS,
  onUnitStats = stats => setActiveUnitGlobalStats(stats),
  onClose,
  onRegenerate,
  onRemove,
  mobSpawnEnabled,
  onMobSpawnEnabled,
  mobGroup,
  onMobGroup,
  selectedBossId,
  onSelectedBossId,
  activeAxies,
  debugBattle = false,
  onDebugBattleChange,
  activeBattleSession,
  onAbortBattle,
  portalConfig = DEFAULT_PORTAL_CONFIG,
  onPortalConfigChange,
  portalState,
  onTriggerPortalWave,
  onSummonNewPortal,
  onResetPortals,
}: Props) {
  const [tab, setTab] = useState<'world' | 'units' | 'battle' | 'portal'>('world');
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [localStats, setLocalStats] = useState(unitStats);
  const [battleSettings, setBattleSettings] = useState<BattleSettings>(DEFAULT_BATTLE_SETTINGS);
  const [localPortalConfig, setLocalPortalConfig] = useState<PortalMobSummoningConfig>(portalConfig);
  const [applyStatus, setApplyStatus] = useState('');
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem('axie-conquest-unit-stats-v1') || 'null'); if (saved && Number.isFinite(saved.marchSpeed) && saved.marchSpeed > 0) { const next = { marchSpeed: saved.marchSpeed }; setLocalStats(next); setActiveUnitGlobalStats(next); onUnitStats(next); } } catch { /* Use code defaults. */ } }, []);
  useEffect(() => {
    try {
      const restored = restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY));
      setBattleSettings(restored);
      onDebugBattleChange?.(restored.debugBattle);
    } catch {
      setApplyStatus('Saved settings unavailable. Changes still work for this session.');
    }
  }, []);
  function saveUnitStats() { try { localStorage.setItem('axie-conquest-unit-stats-v1', JSON.stringify(localStats)); } catch { /* Keep session value. */ } setActiveUnitGlobalStats(localStats); onUnitStats(localStats); }
  function applyBattleSettings() { const next = sanitizeBattleSettings(battleSettings); setBattleSettings(next); setActiveBattleSettings(next); const feedback = 'Applied. The sandbox now uses the saved board spacing.'; try { localStorage.setItem(BATTLE_SETTINGS_SAVE_KEY, JSON.stringify(next)); setApplyStatus(feedback); } catch { setApplyStatus(`${feedback} Browser save failed; changes last only for this session.`); } }
  function saveBoardLayout(layout: { hexGap: number; teamGap: number; columns: number; rowsPerTeam: number }) { const next = sanitizeBattleSettings({ ...battleSettings, boardHexGap: layout.hexGap, boardTeamGap: layout.teamGap, boardColumns: layout.columns, boardRows: layout.rowsPerTeam }); setBattleSettings(next); setActiveBattleSettings(next); try { localStorage.setItem(BATTLE_SETTINGS_SAVE_KEY, JSON.stringify(next)); setApplyStatus('Board layout saved.'); } catch { setApplyStatus('Board layout applied, but browser save failed.'); } }
  function saveRange(range: BattleSettings) { const next = sanitizeBattleSettings({ ...battleSettings, ...range }); setBattleSettings(next); setActiveBattleSettings(next); try { localStorage.setItem(BATTLE_SETTINGS_SAVE_KEY, JSON.stringify(next)); setApplyStatus('Battle sandbox settings saved.'); } catch { setApplyStatus('Battle sandbox settings applied, but browser save failed.'); } }
  function updateDebugBattle(enabled: boolean) {
    const next = sanitizeBattleSettings({ ...battleSettings, debugBattle: enabled });
    setBattleSettings(next);
    setActiveBattleSettings(next);
    onDebugBattleChange?.(enabled);
    try {
      localStorage.setItem(BATTLE_SETTINGS_SAVE_KEY, JSON.stringify(next));
      setApplyStatus(`Battle debugging ${enabled ? 'enabled' : 'disabled'}.`);
    } catch {
      setApplyStatus('Debug setting applied for this session.');
    }
  }
  useEffect(() => {
    setLocalPortalConfig(portalConfig);
  }, [portalConfig]);

  function savePortalSettings() {
    const sanitized = sanitizePortalConfig(localPortalConfig);
    setLocalPortalConfig(sanitized);
    setActivePortalConfig(sanitized);
    onPortalConfigChange?.(sanitized);
    try {
      localStorage.setItem(PORTAL_CONFIG_SAVE_KEY, JSON.stringify(sanitized));
      setApplyStatus('Portal settings saved.');
    } catch {
      setApplyStatus('Portal settings applied for this session.');
    }
  }

  function resetPortalToDefaults() {
    setLocalPortalConfig({ ...DEFAULT_PORTAL_CONFIG });
    setActivePortalConfig({ ...DEFAULT_PORTAL_CONFIG });
    onPortalConfigChange?.({ ...DEFAULT_PORTAL_CONFIG });
    try {
      localStorage.setItem(PORTAL_CONFIG_SAVE_KEY, JSON.stringify(DEFAULT_PORTAL_CONFIG));
      setApplyStatus('Portal settings reverted to JSON defaults.');
    } catch {
      setApplyStatus('Reverted for this session.');
    }
  }

  return <section className="developer panel" aria-label="Developer">
    <div className="catalog-heading"><div><span className="eyebrow">WORLD GENERATION</span><h2>Developer</h2></div><button className="close" aria-label="Close developer tab" onClick={onClose}>&times;</button></div>
    <p>Populate the full {WORLD_WIDTH} × {WORLD_DEPTH} map. Gather resources at wild nodes or attack defended sites to fight chimeras.</p>
    <div className="city-tabs" role="tablist" aria-label="Developer categories"><button role="tab" aria-selected={tab === 'world'} className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>World</button><button role="tab" aria-selected={tab === 'units'} className={tab === 'units' ? 'active' : ''} onClick={() => setTab('units')}>Unit global stats</button><button role="tab" aria-selected={tab === 'battle'} className={tab === 'battle' ? 'active' : ''} onClick={() => setTab('battle')}>Battle</button><button role="tab" aria-selected={tab === 'portal'} className={tab === 'portal' ? 'active' : ''} onClick={() => setTab('portal')}>Portal</button></div>
    {tab === 'units' && <div className="unit-global-stats"><p>Global movement values used to simulate marching.</p><label className="developer-distance">March speed (tiles / second)<input type="number" min={0.1} max={100} step={0.1} value={localStats.marchSpeed} onChange={event => setLocalStats({ marchSpeed: Math.max(0.1, Math.min(100, Number(event.target.value) || 0.1)) })} /></label><div className="placement-actions"><button className="primary" onClick={saveUnitStats}>Save unit stats</button></div><p><small>Higher speed reduces travel time. Edit <code>src/game/unit-stats.json</code> to change the code default.</small></p></div>}
    {tab === 'world' && <div className="developer-world"><div className="developer-counts">{WORLD_KINDS.map(kind => <label key={kind}><span>{WORLD_DEFINITIONS[kind].name}<small>{objects.filter(object => object.kind === kind).length} on map{kind === 'village' || kind === 'garrison' ? ' · Loot: 1 apple' : ''}</small></span><input type="number" min={0} max={100} step={1} value={settings.counts[kind]} onChange={event => onSettings({ ...settings, counts: { ...settings.counts, [kind]: Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))) } })} /></label>)}</div><label className="developer-distance">Minimum distance<input type="number" min={1} max={50} step={1} value={settings.spacing} onChange={event => onSettings({ ...settings, spacing: Math.max(1, Math.min(50, Math.floor(Number(event.target.value) || 1))) })} /></label><p><small>1–50 units of clear ground between objects. City, walls and map edges are protected. Counts: 0–100 per type.</small></p><div className="placement-actions"><button className="primary" disabled={!ready} onClick={onRegenerate}>{objects.length ? 'Regenerate' : 'Generate'}</button><button className="secondary" disabled={!ready || !objects.length} onClick={onRemove}>Remove all</button><button className="secondary" onClick={() => { const active = getActiveGenerationSettings(); onSettings({ counts: { ...active.counts as Record<WorldKind, number> }, spacing: active.spacing }); }}>Defaults</button></div><p role="status">{status}</p></div>}
    {tab === 'battle' && <div className="battle-system"><p>Prototype the new tactical board before units and simulation are added. The middle lane is made of neutral gray hex slots, not empty ground.</p><label className="developer-distance">Gap between hexes<input type="number" min={0} max={3} step={0.05} value={battleSettings.boardHexGap} onChange={event => setBattleSettings({ ...battleSettings, boardHexGap: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })} /></label><label className="developer-distance">Neutral hex rows<input type="number" min={0} max={4} step={1} value={battleSettings.boardTeamGap} onChange={event => setBattleSettings({ ...battleSettings, boardTeamGap: Math.max(0, Math.min(4, Math.round(Number(event.target.value) || 0))) })} /></label><div className="placement-actions"><button className="primary" onClick={applyBattleSettings}>Save board settings</button><button className="secondary" onClick={() => setBattleSettings(DEFAULT_BATTLE_SETTINGS)}>JSON defaults</button><button className="primary" onClick={() => { applyBattleSettings(); setSandboxOpen(true); }}>Open battle sandbox</button></div><p><small>Set hex gap to 0 for one connected board. Neutral rows split the two teams.</small></p><p role="status">{applyStatus || 'Open the sandbox to inspect the empty formation board.'}</p></div>}
    {tab === 'battle' && <fieldset className="battle-debug">
      <legend>Tactical battle debugging</legend>
      <p><small>Enable or disable developer combat controls (pause/step/restart/speed/overlays) in the battle spectator.</small></p>
      <div style={{ display: 'flex', gap: '20px', margin: '8px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="debugBattle"
            value="disabled"
            checked={!battleSettings.debugBattle}
            onChange={() => updateDebugBattle(false)}
          />
          <span>Disabled (Standard RTS)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="debugBattle"
            value="enabled"
            checked={!!battleSettings.debugBattle}
            onChange={() => updateDebugBattle(true)}
          />
          <span>Enabled (Debug controls)</span>
        </label>
      </div>
    </fieldset>}
    {tab === 'battle' && <fieldset className="battle-debug">
      <legend>Active Combat Control</legend>
      {activeBattleSession ? (
        <div>
          <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>
            <strong>⚔️ Active Battle:</strong> {activeBattleSession.army.name} vs{' '}
            {activeBattleSession.target.kind === 'boss' ? 'Chimera Boss' : activeBattleSession.target.kind === 'garrison' ? 'Garrison' : 'Wild Chimeras'} (Tick {activeBattleSession.battle.tick})
          </p>
          <div className="placement-actions" style={{ marginTop: '8px' }}>
            <button
              className="secondary"
              style={{ color: '#ff7070', borderColor: '#ff7070' }}
              onClick={onAbortBattle}
            >
              ✕ Abort / Clear Active Battle
            </button>
          </div>
        </div>
      ) : (
        <p style={{ margin: '4px 0', fontSize: '0.82rem', opacity: 0.8 }}>No active battle currently running.</p>
      )}
    </fieldset>}
    {tab === 'battle' && (
      <fieldset className="battle-debug mob-spawn-controls">
        <legend>World encounter spawning</legend>
        <label>
          <input
            type="checkbox"
            checked={mobSpawnEnabled}
            onChange={event => onMobSpawnEnabled(event.target.checked)}
          />
          Enable mob spawning on World View
        </label>
        <label>
          Mob group / Boss
          <select
            disabled={!mobSpawnEnabled}
            value={selectedBossId || 'kotaro'}
            onChange={event => onSelectedBossId?.(event.target.value)}
          >
            {getAllBosses().map(boss => (
              <option key={boss.id} value={boss.id}>
                {boss.name} ({boss.title || 'Boss'})
              </option>
            ))}
            <option value="random">Random Boss</option>
          </select>
        </label>
        <small>With this enabled, tap empty ground in World View and select/summon any configured boss mob directly from the map HUD.</small>
      </fieldset>
    )}
    {tab === 'portal' && (
      <div className="developer-portal" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p>Configure automatic enemy mob portal summoning waves attacking the city.</p>
        
        {/* Enable checkbox */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={localPortalConfig.enabled}
              onChange={e => setLocalPortalConfig({ ...localPortalConfig, enabled: e.target.checked })}
            />
            <span>Enable Portal Mob Summoning</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!localPortalConfig.paused}
              onChange={e => setLocalPortalConfig({ ...localPortalConfig, paused: e.target.checked })}
            />
            <span style={{ color: localPortalConfig.paused ? '#b91c1c' : 'inherit', fontWeight: localPortalConfig.paused ? 'bold' : 'normal' }}>
              ⏸️ Pause Respawn
            </span>
          </label>
        </div>

        {/* Initial Portal Coordinates */}
        <fieldset style={{ border: '1px solid #91a38c', borderRadius: '8px', padding: '10px' }}>
          <legend style={{ fontWeight: 'bold', fontSize: '12px', color: '#294d43' }}>Initial Portal Coordinate</legend>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>X:</span>
              <input
                type="number"
                step={0.1}
                value={localPortalConfig.initialPortalCoordinate.x}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  initialPortalCoordinate: { ...localPortalConfig.initialPortalCoordinate, x: Number(e.target.value) || 0 },
                })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Y (Z):</span>
              <input
                type="number"
                step={0.1}
                value={localPortalConfig.initialPortalCoordinate.y}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  initialPortalCoordinate: { ...localPortalConfig.initialPortalCoordinate, y: Number(e.target.value) || 0 },
                })}
                style={{ width: '80px' }}
              />
            </label>
          </div>
        </fieldset>

        {/* Timing Settings */}
        <fieldset style={{ border: '1px solid #91a38c', borderRadius: '8px', padding: '10px' }}>
          <legend style={{ fontWeight: 'bold', fontSize: '12px', color: '#294d43' }}>Wave Timing &amp; Exhaustion</legend>
          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Initial attack (seconds):</span>
              <input
                type="number"
                min={1}
                max={600}
                value={localPortalConfig.initialAttackInSeconds}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, initialAttackInSeconds: Math.max(1, Number(e.target.value) || 1) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Attack interval (seconds):</span>
              <input
                type="number"
                min={1}
                max={300}
                value={localPortalConfig.attackIntervalSeconds}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, attackIntervalSeconds: Math.max(1, Number(e.target.value) || 1) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Exhausted every N levels:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={localPortalConfig.exhaustedEveryMobLevel}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, exhaustedEveryMobLevel: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Exhausted duration (seconds):</span>
              <input
                type="number"
                min={1}
                max={600}
                value={localPortalConfig.exhaustedSeconds}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, exhaustedSeconds: Math.max(1, Number(e.target.value) || 1) })}
                style={{ width: '80px' }}
              />
            </label>
          </div>
        </fieldset>

        {/* Scaling & Multi-Portal Settings */}
        <fieldset style={{ border: '1px solid #91a38c', borderRadius: '8px', padding: '10px' }}>
          <legend style={{ fontWeight: 'bold', fontSize: '12px', color: '#294d43' }}>Scaling &amp; Multi-Portal Expansion</legend>
          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Starter mob count:</span>
              <input
                type="number"
                min={1}
                max={100}
                value={localPortalConfig.starterMobCount}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, starterMobCount: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Initial move speed:</span>
              <input
                type="number"
                step={0.1}
                min={0.1}
                max={20}
                value={localPortalConfig.initialMoveSpeed ?? 0.5}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, initialMoveSpeed: Math.max(0.1, Number(e.target.value) || 0.1) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Max move speed:</span>
              <input
                type="number"
                step={0.1}
                min={0.5}
                max={20}
                value={localPortalConfig.maxMoveSpeed}
                onChange={e => setLocalPortalConfig({ ...localPortalConfig, maxMoveSpeed: Math.max(0.5, Number(e.target.value) || 0.5) })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Stats multiplier / level:</span>
              <input
                type="number"
                step={0.01}
                min={1.0}
                max={3.0}
                value={localPortalConfig.portalLevelScaling.statsMultiplierPerLevel}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: { ...localPortalConfig.portalLevelScaling, statsMultiplierPerLevel: Math.max(1.0, Number(e.target.value) || 1.0) }
                })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Mobs count multiplier / level:</span>
              <input
                type="number"
                step={0.01}
                min={1.0}
                max={3.0}
                value={localPortalConfig.portalLevelScaling.mobsCountMultiplierPerLevel}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: { ...localPortalConfig.portalLevelScaling, mobsCountMultiplierPerLevel: Math.max(1.0, Number(e.target.value) || 1.0) }
                })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Summon new portal every level:</span>
              <input
                type="number"
                min={1}
                max={100}
                value={localPortalConfig.portalLevelScaling.summonNewPortalEveryLevel}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: { ...localPortalConfig.portalLevelScaling, summonNewPortalEveryLevel: Math.max(1, Math.round(Number(e.target.value) || 1)) }
                })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Max sub-portals:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={localPortalConfig.portalLevelScaling.subPortal?.maxSubportal ?? 10}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: {
                    ...localPortalConfig.portalLevelScaling,
                    subPortal: {
                      destroyable: localPortalConfig.portalLevelScaling.subPortal?.destroyable ?? true,
                      maxSubportal: Math.max(1, Math.round(Number(e.target.value) || 1)),
                    }
                  }
                })}
                style={{ width: '80px' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={localPortalConfig.portalLevelScaling.newPortalIndependentLevel}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: { ...localPortalConfig.portalLevelScaling, newPortalIndependentLevel: e.target.checked }
                })}
              />
              <span style={{ fontSize: '11px' }}>New portals start at Level 1 (Independent)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
              <input
                type="checkbox"
                checked={localPortalConfig.portalLevelScaling.subPortal?.destroyable ?? false}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: {
                    ...localPortalConfig.portalLevelScaling,
                    subPortal: {
                      ...localPortalConfig.portalLevelScaling.subPortal,
                      destroyable: e.target.checked,
                      maxSubportal: localPortalConfig.portalLevelScaling.subPortal?.maxSubportal ?? 10,
                    }
                  }
                })}
              />
              <span style={{ fontSize: '11px' }}>Sub-portals are destroyable</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={localPortalConfig.portalLevelScaling.subPortal?.lastDestroyedRespwanOnTimer ?? true}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: {
                    ...localPortalConfig.portalLevelScaling,
                    subPortal: {
                      ...localPortalConfig.portalLevelScaling.subPortal,
                      destroyable: localPortalConfig.portalLevelScaling.subPortal?.destroyable ?? false,
                      lastDestroyedRespwanOnTimer: e.target.checked,
                    }
                  }
                })}
              />
              <span style={{ fontSize: '11px' }}>Respawn last destroyed sub-portal on timer</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="checkbox"
                checked={localPortalConfig.portalLevelScaling.subPortal?.lastDestroyedBackToLevel1 ?? true}
                onChange={e => setLocalPortalConfig({
                  ...localPortalConfig,
                  portalLevelScaling: {
                    ...localPortalConfig.portalLevelScaling,
                    subPortal: {
                      ...localPortalConfig.portalLevelScaling.subPortal,
                      destroyable: localPortalConfig.portalLevelScaling.subPortal?.destroyable ?? false,
                      lastDestroyedBackToLevel1: e.target.checked,
                    }
                  }
                })}
              />
              <span style={{ fontSize: '11px' }}>Respawned sub-portal resets to Level 1</span>
            </label>
          </div>
        </fieldset>

        {/* Mob Base Stats */}
        <fieldset style={{ border: '1px solid #91a38c', borderRadius: '8px', padding: '10px' }}>
          <legend style={{ fontWeight: 'bold', fontSize: '12px', color: '#294d43' }}>Mob Types Base Stats</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', fontSize: '11px' }}>
            <div>
              <strong style={{ color: '#ec4899', display: 'block', marginBottom: '4px' }}>👑 Mascot</strong>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>HP: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.mascot.baseStats.health} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, mascot: { baseStats: { ...localPortalConfig.mobTypes.mascot.baseStats, health: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>ATK: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.mascot.baseStats.attack} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, mascot: { baseStats: { ...localPortalConfig.mobTypes.mascot.baseStats, attack: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>DEF: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.mascot.baseStats.defense} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, mascot: { baseStats: { ...localPortalConfig.mobTypes.mascot.baseStats, defense: Number(e.target.value) || 1 } } } })} /></label>
            </div>
            <div>
              <strong style={{ color: '#475569', display: 'block', marginBottom: '4px' }}>⚔️ Soldier</strong>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>HP: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.soldier.baseStats.health} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, soldier: { baseStats: { ...localPortalConfig.mobTypes.soldier.baseStats, health: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>ATK: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.soldier.baseStats.attack} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, soldier: { baseStats: { ...localPortalConfig.mobTypes.soldier.baseStats, attack: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>DEF: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.soldier.baseStats.defense} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, soldier: { baseStats: { ...localPortalConfig.mobTypes.soldier.baseStats, defense: Number(e.target.value) || 1 } } } })} /></label>
            </div>
            <div>
              <strong style={{ color: '#16a34a', display: 'block', marginBottom: '4px' }}>🏹 Archer</strong>
              <label style={{ display: 'flex', justifyContent: 'space-between' }}>HP: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.archer.baseStats.health} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, archer: { baseStats: { ...localPortalConfig.mobTypes.archer.baseStats, health: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>ATK: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.archer.baseStats.attack} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, archer: { baseStats: { ...localPortalConfig.mobTypes.archer.baseStats, attack: Number(e.target.value) || 1 } } } })} /></label>
              <label style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>DEF: <input type="number" style={{ width: '45px' }} value={localPortalConfig.mobTypes.archer.baseStats.defense} onChange={e => setLocalPortalConfig({ ...localPortalConfig, mobTypes: { ...localPortalConfig.mobTypes, archer: { baseStats: { ...localPortalConfig.mobTypes.archer.baseStats, defense: Number(e.target.value) || 1 } } } })} /></label>
            </div>
          </div>
        </fieldset>

        {/* Action Buttons */}
        <div className="placement-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button className="primary" onClick={savePortalSettings}>Save portal settings</button>
          <button className="secondary" onClick={resetPortalToDefaults}>JSON defaults</button>
          <button
            className="secondary"
            style={{ background: localPortalConfig.paused ? '#166534' : '#334155', color: '#fff' }}
            onClick={() => {
              const updated = { ...localPortalConfig, paused: !localPortalConfig.paused };
              setLocalPortalConfig(updated);
              onPortalConfigChange?.(updated);
            }}
          >
            {localPortalConfig.paused ? '▶️ Resume Respawn' : '⏸️ Pause Respawn'}
          </button>
          {onTriggerPortalWave && (
            <button className="primary" style={{ background: '#7e22ce' }} onClick={() => onTriggerPortalWave()}>
              ⚡ Trigger wave now
            </button>
          )}
          {onSummonNewPortal && (
            <button className="secondary" onClick={onSummonNewPortal}>
              🌀 Summon new portal
            </button>
          )}
          {onResetPortals && (
            <button className="secondary" style={{ color: '#b91c1c' }} onClick={onResetPortals}>
              🔄 Reset all portals
            </button>
          )}
        </div>

        {/* Live Portals Monitor */}
        {portalState && (
          <fieldset style={{ border: '1px solid #7e22ce', borderRadius: '8px', padding: '10px', background: 'rgba(88, 28, 135, 0.08)' }}>
            <legend style={{ fontWeight: 'bold', fontSize: '12px', color: '#7e22ce' }}>Active Portals Monitor ({portalState.portals.length})</legend>
            <div style={{ display: 'grid', gap: '6px', fontSize: '11px' }}>
              {portalState.portals.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: '#fff', borderRadius: '4px', border: '1px solid #e9d5ff' }}>
                  <strong>{p.name} (Lv {p.level})</strong>
                  <span>{p.cycleState === 'exhausted' ? '⏳ Exhausted' : p.cycleState === 'disabled' ? '⏸️ Paused' : '⚔️ Attacking'} · {Math.max(0, Math.ceil((p.nextAttackTime - Date.now()) / 1000))}s</span>
                </div>
              ))}
              {portalState.lastDestroyedSubportal && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 6px', background: '#fef2f2', borderRadius: '4px', border: '1px solid #fca5a5', color: '#991b1b' }}>
                  <strong>⏳ {portalState.lastDestroyedSubportal.name} (Destroyed)</strong>
                  <span>Respawning Lv {portalState.lastDestroyedSubportal.level} in {Math.max(0, Math.ceil((portalState.lastDestroyedSubportal.respawnAt - Date.now()) / 1000))}s</span>
                </div>
              )}
              <div style={{ marginTop: '4px', color: '#64748b' }}>
                Active enemy marches on map: <strong>{portalState.activeEnemyMarches.length}</strong>
              </div>
            </div>
          </fieldset>
        )}

        <p role="status">{applyStatus}</p>
      </div>
    )}
    {sandboxOpen && <BattleSandbox layout={{ hexGap: battleSettings.boardHexGap, teamGap: battleSettings.boardTeamGap, columns: battleSettings.boardColumns, rowsPerTeam: battleSettings.boardRows }} range={battleSettings} activeAxies={activeAxies} onSaveLayout={saveBoardLayout} onSaveRange={saveRange} onClose={() => setSandboxOpen(false)} />}
    <ResetGameControl onBeforeReset={onResetPortals} />
  </section>;
}
