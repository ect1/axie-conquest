"use client";

import { useEffect, useRef, useState } from 'react';
import type { ApiAxie } from '@/game/axie-roster';
import type { BabylonAxiePlan } from '@/game/axie/babylon-mixer';
import type { AxieInspectorAnimation } from '@/game/axie/axie-inspector-scene';

type Props = { axie: ApiAxie };
type Inspector = { setAnimation: (state: AxieInspectorAnimation) => void; home: () => void; dispose: () => void };

export default function AxieModelInspector({ axie }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), inspector = useRef<Inspector | null>(null);
  const [state, setState] = useState<AxieInspectorAnimation>('idle');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(axie.newGenes ? 'loading' : 'error');
  const [error, setError] = useState(axie.newGenes ? '' : 'This Axie has no genes available for a 3D preview.');
  const [details, setDetails] = useState('');
  useEffect(() => {
    let closed = false; const controller = new AbortController();
    inspector.current?.dispose(); inspector.current = null; setState('idle'); setDetails('');
    if (!axie.newGenes) { setStatus('error'); setError('This Axie has no genes available for a 3D preview.'); return () => controller.abort(); }
    setStatus('loading'); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/axies/decode?genes=${encodeURIComponent(axie.newGenes!)}`, { signal: controller.signal });
        const payload = await response.json() as BabylonAxiePlan & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Could not prepare this Axie model.');
        const { createAxieInspectorScene } = await import('@/game/axie/axie-inspector-scene');
        if (closed || !canvas.current) return;
        const next = await createAxieInspectorScene(canvas.current, payload, avatar => { if (!closed) setDetails(`${avatar.bodyId} body · ${avatar.attachedPartCount} attached parts`); });
        if (closed) { next.dispose(); return; }
        inspector.current = next; setStatus('ready');
      } catch (cause) {
        if (!closed && !(cause instanceof DOMException && cause.name === 'AbortError')) { setStatus('error'); setError(cause instanceof Error ? cause.message : 'Could not load this Axie model.'); }
      }
    })();
    return () => { closed = true; controller.abort(); inspector.current?.dispose(); inspector.current = null; };
  }, [axie.id, axie.newGenes]);
  const choose = (next: AxieInspectorAnimation) => { setState(next); inspector.current?.setAnimation(next); };
  return <section className="axie-model-inspector" aria-label={`${axie.name} 3D model preview`}>
    <div className="axie-model-stage"><canvas ref={canvas} aria-label={`${axie.name} 3D model. Drag to rotate; pinch or scroll to zoom.`} />{status === 'loading' && <p className="axie-model-status" role="status">Assembling Axie model…</p>}{status === 'error' && <p className="axie-model-status error" role="alert">{error}</p>}{status === 'ready' && <button className="axie-model-reset" onClick={() => inspector.current?.home()}>Reset view</button>}</div>
    {status === 'ready' && <><div className="axie-animation-controls" aria-label="Model animation preview">{(['idle', 'run', 'attack'] as const).map(item => <button key={item} className={state === item ? 'active' : ''} aria-pressed={state === item} onClick={() => choose(item)}>{item === 'run' ? 'walk' : item}</button>)}</div><small className="axie-model-details">{details} · Drag to rotate · Pinch to zoom</small></>}
  </section>;
}
