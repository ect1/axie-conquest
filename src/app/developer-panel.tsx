import { useEffect, useState } from 'react';
import BattleArena from './battle-arena';
import { Battle, createBattle, createSandboxArmy, livingCount } from '@/game/battle';
import ResetGameControl from './reset-game-control';
import { GenerationSettings, SpawnableMobGroup, WorldObject, SPAWNABLE_MOB_GROUPS, WORLD_KINDS, WORLD_DEFINITIONS, WORLD_WIDTH, WORLD_DEPTH, DEFAULT_GENERATION } from '@/game/world';
import { DEFAULT_UNIT_GLOBAL_STATS, setActiveUnitGlobalStats, UnitGlobalStats } from '@/game/unit-stats';
import { BATTLE_SETTINGS_SAVE_KEY, BattleSettings, DEFAULT_BATTLE_SETTINGS, restoreActiveBattleSettings, sanitizeBattleSettings, setActiveBattleSettings } from '@/game/battle-settings';
import { BATTLE_OVERLAYS, BattleOverlays, DEFAULT_BATTLE_OVERLAYS } from '@/game/battle-debug';

type Props = {
  settings: GenerationSettings; onSettings: (settings: GenerationSettings) => void;
  objects: WorldObject[]; status: string; ready: boolean; unitStats?: UnitGlobalStats; onUnitStats?: (stats: UnitGlobalStats) => void;
  onClose: () => void; onRegenerate: () => void; onRemove: () => void;
  mobSpawnEnabled: boolean; onMobSpawnEnabled: (enabled: boolean) => void;
  mobGroup: SpawnableMobGroup; onMobGroup: (group: SpawnableMobGroup) => void;
};

export default function DeveloperPanel({ settings, onSettings, objects, status, ready, onClose, onRegenerate, onRemove, mobSpawnEnabled, onMobSpawnEnabled, mobGroup, onMobGroup, unitStats = DEFAULT_UNIT_GLOBAL_STATS, onUnitStats = stats => setActiveUnitGlobalStats(stats) }: Props) {
  const [tab, setTab] = useState<'world' | 'units' | 'battle'>('world');
  const [practice, setPractice] = useState<Battle | null>(null);
  const [composition, setComposition] = useState<'balanced' | 'infantry' | 'archer'>('balanced');
  const [enemyCount, setEnemyCount] = useState(18);
  const [localStats, setLocalStats] = useState(unitStats);
  const [battleSettings, setBattleSettings] = useState<BattleSettings>(DEFAULT_BATTLE_SETTINGS);
  const [overlays, setOverlays] = useState<BattleOverlays>(DEFAULT_BATTLE_OVERLAYS);
  const [showAll, setShowAll] = useState(false);
  const [inspectId, setInspectId] = useState('player:hero-1');
  const [applyStatus, setApplyStatus] = useState('');
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem('axie-conquest-unit-stats-v1') || 'null'); if (saved && Number.isFinite(saved.marchSpeed) && saved.marchSpeed > 0) { const stats = { marchSpeed: saved.marchSpeed }; setLocalStats(stats); setActiveUnitGlobalStats(stats); onUnitStats(stats); } } catch { /* Use code defaults when no saved stats exist. */ } }, []);
  function saveUnitStats() { try { localStorage.setItem('axie-conquest-unit-stats-v1', JSON.stringify(localStats)); } catch { /* Keep the active value for this session. */ } setActiveUnitGlobalStats(localStats); onUnitStats(localStats); }
  useEffect(() => {
    try {
      const saved = restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY));
      setBattleSettings(saved); setOverlays(saved.overlays); setShowAll(saved.showAll);
    } catch { setApplyStatus('Saved settings unavailable. Apply will still update this session.'); }
  }, []);
  function applyBattleSettings() {
    const settings = sanitizeBattleSettings({ ...battleSettings, overlays, showAll });
    setBattleSettings(settings); setActiveBattleSettings(settings);
    const feedback = Object.values(overlays).some(Boolean)
      ? 'Applied. Enabled ranges follow the selected world march (or the first deployed march if none is selected). Enable all units to show every march.'
      : 'Applied. All overlays are off; enable a range checkbox and apply to see circles.';
    try { localStorage.setItem(BATTLE_SETTINGS_SAVE_KEY, JSON.stringify(settings)); setApplyStatus(feedback); }
    catch { setApplyStatus(feedback + ' Browser save failed; changes last only for this session.'); }
  }
  return <section className="developer panel" aria-label="Developer">
    <div className="catalog-heading"><div><span className="eyebrow">WORLD GENERATION</span><h2>Developer</h2></div><button className="close" aria-label="Close developer tab" onClick={onClose}>&times;</button></div>
    <p>Populate the full {WORLD_WIDTH} × {WORLD_DEPTH} map. Attack defended sites to fight chimeras. Gathering and loot collection are still unavailable.</p>
    <div className="city-tabs" role="tablist" aria-label="Developer categories"><button role="tab" aria-selected={tab === 'world'} className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>World</button><button role="tab" aria-selected={tab === 'units'} className={tab === 'units' ? 'active' : ''} onClick={() => setTab('units')}>Unit global stats</button><button role="tab" aria-selected={tab === 'battle'} className={tab === 'battle' ? 'active' : ''} onClick={() => setTab('battle')}>Battle system</button></div>
    {tab === 'units' && <div className="unit-global-stats"><p>Global movement values used to simulate marching.</p><label className="developer-distance">March speed (tiles / second)<input type="number" min={0.1} max={100} step={0.1} value={localStats.marchSpeed} onChange={event => setLocalStats({ marchSpeed: Math.max(0.1, Math.min(100, Number(event.target.value) || 0.1)) })} /></label><div className="placement-actions"><button className="primary" onClick={saveUnitStats}>Save unit stats</button></div><p><small>Higher speed reduces travel time. Edit <code>src/game/unit-stats.json</code> to change the code default.</small></p></div>}
    {tab === 'world' && <div className="developer-world"><div className="developer-counts">
      {WORLD_KINDS.map(kind => <label key={kind}><span>{WORLD_DEFINITIONS[kind].name}<small>{objects.filter(object => object.kind === kind).length} on map{kind === 'village' || kind === 'garrison' ? ' · Loot: 1 apple' : ''}</small></span><input type="number" min={0} max={100} step={1} value={settings.counts[kind]} onChange={event => onSettings({ ...settings, counts: { ...settings.counts, [kind]: Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))) } })} /></label>)}
    </div>
    <label className="developer-distance">Minimum distance<input type="number" min={1} max={50} step={1} value={settings.spacing} onChange={event => onSettings({ ...settings, spacing: Math.max(1, Math.min(50, Math.floor(Number(event.target.value) || 1))) })} /></label>
    <p><small>1–50 units of clear ground between objects. City, walls and map edges are protected. Counts: 0–100 per type.</small></p>
    <div className="placement-actions"><button className="primary" disabled={!ready} onClick={onRegenerate}>{objects.length ? 'Regenerate' : 'Generate'}</button><button className="secondary" disabled={!ready || !objects.length} onClick={onRemove}>Remove all</button><button className="secondary" onClick={() => onSettings({ counts: { ...DEFAULT_GENERATION.counts }, spacing: DEFAULT_GENERATION.spacing })}>Defaults</button></div>
    <p role="status">{status}</p></div>}
    {tab === 'battle' && <div className="battle-system"><p>Compare formations in a practice fight. The same applied combat tuning is used when a World View march reaches a defended target; march travel speed remains in Unit global stats.</p><label className="developer-distance">Formation<select value={composition} onChange={e => setComposition(e.target.value as typeof composition)}><option value="balanced">Balanced</option><option value="infantry">Infantry heavy</option><option value="archer">Archer heavy</option></select></label><label className="developer-distance">Enemy troops per squad<input type="number" min={1} max={100} value={enemyCount} onChange={e => setEnemyCount(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))} /></label><fieldset className="battle-debug"><legend>Range overlays and tuning</legend>{Object.entries(BATTLE_OVERLAYS).map(([key, definition]) => <label key={key}><input type="checkbox" checked={overlays[key as keyof BattleOverlays]} onChange={e => setOverlays({ ...overlays, [key]: e.target.checked })} /><span style={{ color: definition.color }}>●</span>{definition.label}</label>)}<label><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show both formations / all units</label><label>Awareness range<input type="number" min={1} max={100} step={1} value={battleSettings.awarenessRadius} onChange={e => setBattleSettings({ ...battleSettings, awarenessRadius: Number(e.target.value) })} /></label><label>Engagement range<input type="number" min={1} max={100} step={1} value={battleSettings.engagementRadius} onChange={e => setBattleSettings({ ...battleSettings, engagementRadius: Number(e.target.value) })} /></label><label>Attack range multiplier<input type="number" min={0.1} max={5} step={0.1} value={battleSettings.attackRangeMultiplier} onChange={e => setBattleSettings({ ...battleSettings, attackRangeMultiplier: Number(e.target.value) })} /></label><label>Body radius multiplier<input type="number" min={0.1} max={5} step={0.1} value={battleSettings.bodyRadiusMultiplier} onChange={e => setBattleSettings({ ...battleSettings, bodyRadiusMultiplier: Number(e.target.value) })} /></label><label>Enemy leash range<input type="number" min={1} max={200} step={1} value={battleSettings.leashRadius} onChange={e => setBattleSettings({ ...battleSettings, leashRadius: Number(e.target.value) })} /></label></fieldset><label className="developer-distance">Inspect unit<select value={inspectId} onChange={e => setInspectId(e.target.value)}>{practice?.fighters.map(f => <option key={f.id} value={f.id}>{f.side} · {f.name} · {livingCount(f)}</option>) ?? <><option value="player:hero-1">Player commander</option><option value="player:0">Player front squad</option><option value="player:1">Player rear squad</option><option value="enemy:0">Enemy guard squad</option><option value="enemy:2">Enemy archer squad</option></>}</select></label><div className="placement-actions"><button className="primary" onClick={applyBattleSettings}>Apply battle settings</button><button className="secondary" onClick={() => setBattleSettings(DEFAULT_BATTLE_SETTINGS)}>JSON defaults</button><button className="primary" onClick={() => { applyBattleSettings(); const next = createBattle(createSandboxArmy(composition), enemyCount); setPractice(next); setInspectId(next.leaderId ?? next.fighters[0]?.id ?? ''); }}>Open battle sandbox</button></div><p><small>Defaults live in <code>src/game/battle-settings.json</code>. Apply saves this tuning locally; new or reset practice battles and World View combats use it.</small></p></div>}
    {practice && <BattleArena battle={practice} onChange={setPractice} sandbox overlays={overlays} showAll={showAll} selectedId={inspectId} onSelectedId={setInspectId} onReset={() => setPractice(createBattle(createSandboxArmy(composition), enemyCount))} onClose={() => setPractice(null)} />}
    {tab === 'battle' && <fieldset className="battle-debug mob-spawn-controls"><legend>World encounter spawning</legend><label><input type="checkbox" checked={mobSpawnEnabled} onChange={e => onMobSpawnEnabled(e.target.checked)} />Enable mob spawning on World View</label><label>Mob group<select disabled={!mobSpawnEnabled} value={mobGroup} onChange={e => onMobGroup(e.target.value as SpawnableMobGroup)}>{Object.entries(SPAWNABLE_MOB_GROUPS).map(([id, group]) => <option key={id} value={id}>{group.label}</option>)}</select></label><small>With this enabled, tap empty ground in World View and choose Spawn mob group. The new defended site uses the normal march and battle flow.</small></fieldset>}
    {tab === 'battle' && <p role="status">{applyStatus || 'Enable range checkboxes, then Apply. World View circles follow deployed units; attack and body circles use each member’s combat stats.'}</p>}
    <ResetGameControl />
  </section>;
}
