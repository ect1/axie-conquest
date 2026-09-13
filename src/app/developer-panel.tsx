import { useEffect, useState } from 'react';
import ResetGameControl from './reset-game-control';
import { GenerationSettings, WorldObject, WORLD_KINDS, WORLD_DEFINITIONS, WORLD_WIDTH, WORLD_DEPTH, DEFAULT_GENERATION } from '@/game/world';
import { DEFAULT_UNIT_GLOBAL_STATS, setActiveUnitGlobalStats, UnitGlobalStats } from '@/game/unit-stats';

type Props = {
  settings: GenerationSettings; onSettings: (settings: GenerationSettings) => void;
  objects: WorldObject[]; status: string; ready: boolean; unitStats?: UnitGlobalStats; onUnitStats?: (stats: UnitGlobalStats) => void;
  onClose: () => void; onRegenerate: () => void; onRemove: () => void;
};

export default function DeveloperPanel({ settings, onSettings, objects, status, ready, onClose, onRegenerate, onRemove, unitStats = DEFAULT_UNIT_GLOBAL_STATS, onUnitStats = stats => setActiveUnitGlobalStats(stats) }: Props) {
  const [tab, setTab] = useState<'world' | 'units'>('world');
  const [localStats, setLocalStats] = useState(unitStats);
  useEffect(() => { try { const saved = JSON.parse(localStorage.getItem('axie-conquest-unit-stats-v1') || 'null'); if (saved && Number.isFinite(saved.marchSpeed) && saved.marchSpeed > 0) { const stats = { marchSpeed: saved.marchSpeed }; setLocalStats(stats); setActiveUnitGlobalStats(stats); onUnitStats(stats); } } catch { /* Use code defaults when no saved stats exist. */ } }, []);
  function saveUnitStats() { try { localStorage.setItem('axie-conquest-unit-stats-v1', JSON.stringify(localStats)); } catch { /* Keep the active value for this session. */ } setActiveUnitGlobalStats(localStats); onUnitStats(localStats); }
  return <section className="developer panel" aria-label="Developer">
    <div className="catalog-heading"><div><span className="eyebrow">WORLD GENERATION</span><h2>Developer</h2></div><button className="close" aria-label="Close developer tab" onClick={onClose}>&times;</button></div>
    <p>Populate the full {WORLD_WIDTH} × {WORLD_DEPTH} map. Structures only; gathering, combat and loot collection are unavailable.</p>
    <div className="city-tabs" role="tablist" aria-label="Developer categories"><button role="tab" aria-selected={tab === 'world'} className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>World</button><button role="tab" aria-selected={tab === 'units'} className={tab === 'units' ? 'active' : ''} onClick={() => setTab('units')}>Unit global stats</button></div>
    {tab === 'units' && <div className="unit-global-stats"><p>Global movement values used to simulate marching.</p><label className="developer-distance">March speed (tiles / second)<input type="number" min={0.1} max={100} step={0.1} value={localStats.marchSpeed} onChange={event => setLocalStats({ marchSpeed: Math.max(0.1, Math.min(100, Number(event.target.value) || 0.1)) })} /></label><div className="placement-actions"><button className="primary" onClick={saveUnitStats}>Save unit stats</button></div><p><small>Higher speed reduces travel time. Edit <code>src/game/unit-stats.json</code> to change the code default.</small></p></div>}
    {tab === 'world' && <div className="developer-world"><div className="developer-counts">
      {WORLD_KINDS.map(kind => <label key={kind}><span>{WORLD_DEFINITIONS[kind].name}<small>{objects.filter(object => object.kind === kind).length} on map{kind === 'village' || kind === 'garrison' ? ' · Loot: 1 apple' : ''}</small></span><input type="number" min={0} max={100} step={1} value={settings.counts[kind]} onChange={event => onSettings({ ...settings, counts: { ...settings.counts, [kind]: Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))) } })} /></label>)}
    </div>
    <label className="developer-distance">Minimum distance<input type="number" min={1} max={50} step={1} value={settings.spacing} onChange={event => onSettings({ ...settings, spacing: Math.max(1, Math.min(50, Math.floor(Number(event.target.value) || 1))) })} /></label>
    <p><small>1–50 units of clear ground between objects. City, walls and map edges are protected. Counts: 0–100 per type.</small></p>
    <div className="placement-actions"><button className="primary" disabled={!ready} onClick={onRegenerate}>{objects.length ? 'Regenerate' : 'Generate'}</button><button className="secondary" disabled={!ready || !objects.length} onClick={onRemove}>Remove all</button><button className="secondary" onClick={() => onSettings({ counts: { ...DEFAULT_GENERATION.counts }, spacing: DEFAULT_GENERATION.spacing })}>Defaults</button></div>
    <p role="status">{status}</p></div>}
    <ResetGameControl />
  </section>;
}
