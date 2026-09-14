"use client";

import { useEffect, useRef, useState } from 'react';
import { BattleReplay, replayBattleAt } from '@/game/battle-replay';
import { DEFAULT_BATTLE_OVERLAYS } from '@/game/battle-debug';

export default function BattleReplayViewer({ replay, onClose }: { replay: BattleReplay; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false), [finished, setFinished] = useState(false), [error, setError] = useState('');
  const [run, setRun] = useState(0);
  const current = useRef(replayBattleAt(replay, 0));
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
      scene = createBattleScene(canvas.current, () => ({ battle: current.current, selected: null, overlays: DEFAULT_BATTLE_OVERLAYS, all: false }), () => {}, () => { if (!disposed) setReady(true); }, true);
    }).catch(() => setError('The replay could not load. Close it and open the report again to retry.'));
    return () => { disposed = true; scene?.dispose(); };
  }, []);
  useEffect(() => {
    if (!ready || error) return;
    let previous = performance.now(), elapsed = 0, index = 0, request = 0;
    current.current = replayBattleAt(replay, 0); setFinished(false);
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(250, now - previous);
      previous = now;
      const target = replay.frames[0].tick + elapsed / 100;
      let next = index;
      while (next + 1 < replay.frames.length && replay.frames[next + 1].tick <= target) next++;
      if (next !== index) { index = next; current.current = replayBattleAt(replay, index); }
      if (index === replay.frames.length - 1) { setFinished(true); return; }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [ready, error, replay, run]);
  return <dialog ref={dialog} className="battle-dialog replay-dialog" aria-label="Battle replay" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="battle-header"><div><span className="eyebrow">BATTLE RECORDING</span><h2>{finished ? `Battle ended: ${replay.result}` : 'Watching battle'}</h2></div><button className="secondary" onClick={onClose}>Close replay</button></header>
    <div className="battle-field"><canvas ref={canvas} aria-label="Recorded battle playing automatically" />{!ready && !error && <p className="battle-loading" role="status">Preparing replay...</p>}</div>
    <div className="battle-controls">{error ? <p role="alert">{error}</p> : <p>{finished ? 'The recording has finished.' : 'Playing the recorded fight.'}{replay.frames[0].tick > 0 ? ` Recording starts at ${(replay.frames[0].tick / 10).toFixed(1)}s.` : ''}</p>}{finished && !error && <button className="primary" onClick={() => setRun(value => value + 1)}>Watch Again</button>}</div>
  </dialog>;
}
