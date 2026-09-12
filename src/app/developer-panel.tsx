import { GenerationSettings, WorldObject, WORLD_KINDS, WORLD_DEFINITIONS, WORLD_WIDTH, WORLD_DEPTH, DEFAULT_GENERATION } from '@/game/world';

type Props = {
  settings: GenerationSettings; onSettings: (settings: GenerationSettings) => void;
  objects: WorldObject[]; status: string; ready: boolean;
  onClose: () => void; onRegenerate: () => void; onRemove: () => void;
};

export default function DeveloperPanel({ settings, onSettings, objects, status, ready, onClose, onRegenerate, onRemove }: Props) {
  return <section className="developer panel" aria-label="Developer">
    <div className="catalog-heading"><div><span className="eyebrow">WORLD GENERATION</span><h2>Developer</h2></div><button className="close" aria-label="Close developer tab" onClick={onClose}>&times;</button></div>
    <p>Populate the full {WORLD_WIDTH} × {WORLD_DEPTH} map. Structures only; gathering, combat and loot collection are unavailable.</p>
    <div className="developer-counts">
      {WORLD_KINDS.map(kind => <label key={kind}><span>{WORLD_DEFINITIONS[kind].name}<small>{objects.filter(object => object.kind === kind).length} on map{kind === 'village' || kind === 'garrison' ? ' · Loot: 1 apple' : ''}</small></span><input type="number" min={0} max={100} step={1} value={settings.counts[kind]} onChange={event => onSettings({ ...settings, counts: { ...settings.counts, [kind]: Math.max(0, Math.min(100, Math.floor(Number(event.target.value) || 0))) } })} /></label>)}
    </div>
    <label className="developer-distance">Minimum distance<input type="number" min={1} max={50} step={1} value={settings.spacing} onChange={event => onSettings({ ...settings, spacing: Math.max(1, Math.min(50, Math.floor(Number(event.target.value) || 1))) })} /></label>
    <p><small>1–50 units of clear ground between objects. City, walls and map edges are protected. Counts: 0–100 per type.</small></p>
    <div className="placement-actions"><button className="primary" disabled={!ready} onClick={onRegenerate}>{objects.length ? 'Regenerate' : 'Generate'}</button><button className="secondary" disabled={!ready || !objects.length} onClick={onRemove}>Remove all</button><button className="secondary" onClick={() => onSettings({ counts: { ...DEFAULT_GENERATION.counts }, spacing: DEFAULT_GENERATION.spacing })}>Defaults</button></div>
    <p role="status">{status}</p>
  </section>;
}
