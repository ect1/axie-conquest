import { useEffect, useRef, useState } from 'react';
import type { BattleBoardLayout } from '@/game/battle-board-scene';

export default function BattleSandbox({ layout, onSaveLayout, onClose }: { layout: BattleBoardLayout; onSaveLayout: (layout: BattleBoardLayout) => void; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const renderer = useRef<ReturnType<typeof import('@/game/battle-board-scene').createBattleBoardScene> | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(layout);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  useEffect(() => {
    let disposed = false;
    import('@/game/battle-board-scene').then(({ createBattleBoardScene }) => {
      if (!disposed && canvas.current) renderer.current = createBattleBoardScene(canvas.current, layout, () => !disposed && setReady(true));
    }).catch(reason => setError(`The battle board could not be prepared: ${reason instanceof Error ? reason.message : 'unknown error'}`));
    return () => { disposed = true; renderer.current?.dispose(); renderer.current = null; };
  }, []);
  useEffect(() => { renderer.current?.update(layout); }, [layout]);
  return <dialog ref={dialog} className="battle-dialog battle-sandbox-dialog" aria-label="Battle board sandbox" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="battle-header"><div><span className="eyebrow">DEVELOPER · BATTLE SANDBOX</span><h2>Hex board prototype</h2><span>Board only · no units or simulation</span></div><button className="secondary" onClick={onClose}>Close sandbox</button></header>
    <div className="battle-field battle-board-field">
      {!ready && !error && <p className="battle-loading" role="status">Preparing hex board...</p>}
      {error && <p className="battle-loading" role="alert">{error}</p>}
      <canvas ref={canvas} aria-label="Empty hex battle board. Drag to pan and pinch or scroll to zoom." />
      <span className="battle-side-label enemy">Enemy</span><span className="battle-side-label player">Your team</span>
      <div className="battle-camera"><button aria-label="Zoom battlefield in" onClick={() => renderer.current?.zoom(0.85)}>+</button><button aria-label="Zoom battlefield out" onClick={() => renderer.current?.zoom(1.18)}>−</button><button onClick={() => renderer.current?.home()}>Center</button></div>
    </div>
    <div className="battle-controls battle-board-controls"><label>Columns per team<input type="number" min={2} max={16} step={1} value={draft.columns} onChange={event => setDraft({ ...draft, columns: Math.max(2, Math.min(16, Math.round(Number(event.target.value) || 2))) })} /></label><label>Rows per team<input type="number" min={1} max={12} step={1} value={draft.rowsPerTeam} onChange={event => setDraft({ ...draft, rowsPerTeam: Math.max(1, Math.min(12, Math.round(Number(event.target.value) || 1))) })} /></label><label>Gap between hexes<input type="number" min={0} max={3} step={0.05} value={draft.hexGap} onChange={event => setDraft({ ...draft, hexGap: Math.max(0, Math.min(3, Number(event.target.value) || 0)) })} /></label><label>Neutral hex rows<input type="number" min={0} max={4} step={1} value={draft.teamGap} onChange={event => setDraft({ ...draft, teamGap: Math.max(0, Math.min(4, Math.round(Number(event.target.value) || 0))) })} /></label><button className="primary" onClick={() => onSaveLayout(draft)}>Save layout</button><p>Both teams use <strong>{draft.columns} × {draft.rowsPerTeam}</strong> slots. <strong>{draft.teamGap}</strong> gray hex row{draft.teamGap === 1 ? '' : 's'} divide them.</p></div>
  </dialog>;
}
