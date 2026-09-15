"use client";

import { useEffect, useRef, useState } from 'react';
import { BattleReplay, replayBattleAt, replayPresentationBattle } from '@/game/battle-replay';
import { activeBattleSettings } from '@/game/battle-settings';

export default function BattleReplayViewer({ replay, onClose }: { replay: BattleReplay; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof import('@/game/battle-scene').createBattleScene> | null>(null);
  const [ready, setReady] = useState(false), [finished, setFinished] = useState(false), [error, setError] = useState('');
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [modelError, setModelError] = useState('');
  // Snapshot the developer debug view at open. Replays previously hard-coded
  // all overlays off, making range inspection impossible.
  const [overlays] = useState(() => ({ ...activeBattleSettings.overlays }));
  const [showAll] = useState(() => activeBattleSettings.showAll || Object.values(activeBattleSettings.overlays).some(Boolean));
  const current = useRef(replayBattleAt(replay, 0));
  const presentation = useRef(replayPresentationBattle(replay, current.current));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let disposed = false;
    let scene: ReturnType<typeof import('@/game/battle-scene').createBattleScene> | undefined;
    import('@/game/battle-scene').then(({ createBattleScene }) => {
      if (disposed || !canvas.current) return;
      scene = createBattleScene(canvas.current, () => ({ battle: presentation.current, selected: null, overlays, all: showAll }), () => {}, () => { if (!disposed) setReady(true); }, false, setModelError);
      renderer.current = scene;
    }).catch(() => setError('The replay could not load. Close it and open the report again to retry.'));
    return () => { disposed = true; renderer.current = null; scene?.dispose(); };
  }, []);
  useEffect(() => {
    if (!ready || error || !playing) return;
    let previous = performance.now(), elapsed = 0, index = 0, request = 0;
    current.current = replayBattleAt(replay, 0); presentation.current = replayPresentationBattle(replay, current.current); setFinished(false);
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(250, now - previous);
      previous = now;
      const target = replay.frames[0].tick + elapsed / 100;
      let next = index;
      while (next + 1 < replay.frames.length && replay.frames[next + 1].tick <= target) next++;
      if (next !== index) { index = next; current.current = replayBattleAt(replay, index); presentation.current = replayPresentationBattle(replay, current.current); }
      if (index === replay.frames.length - 1) { setFinished(true); return; }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [ready, error, replay, run, playing]);
  return <dialog ref={dialog} className="battle-dialog replay-dialog" aria-label="Battle replay" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="battle-header"><div><span className="eyebrow">BATTLE RECORDING</span><h2>{finished ? `Battle ended: ${replay.result}` : playing ? 'Watching battle' : 'Replay paused'}</h2></div><button className="secondary" onClick={onClose}>Close replay</button></header>
    <div className="battle-field"><canvas ref={canvas} aria-label="Recorded battle. Drag to rotate; pinch or scroll to zoom. Starts paused; use Start replay to play." />{!ready && !error && <p className="battle-loading" role="status">Preparing replay...</p>}<div className="battle-camera"><button aria-label="Zoom battlefield in" onClick={() => renderer.current?.zoom(0.85)}>+</button><button aria-label="Zoom battlefield out" onClick={() => renderer.current?.zoom(1.18)}>−</button><button onClick={() => renderer.current?.home()}>Reset view</button></div></div>
    <div className="battle-controls">{modelError && <p role="alert">Some Axie models could not load. {modelError}</p>}{error ? <p role="alert">{error}</p> : <p>{finished ? 'The recording has finished.' : playing ? 'Playing the recorded fight.' : 'Replay paused. Inspect the opening formation, then watch when ready.'}{replay.frames[0].tick > 0 ? ` Recording starts at ${(replay.frames[0].tick / 10).toFixed(1)}s.` : ''}</p>}{!finished && !error && <button className="primary" disabled={!ready} onClick={() => setPlaying(true)}>Watch now</button>}{finished && !error && <button className="primary" onClick={() => { setPlaying(true); setRun(value => value + 1); }}>Watch Again</button>}</div>
  </dialog>;
}
