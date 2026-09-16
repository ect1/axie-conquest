"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { BattleReplay, replayBattleAt } from '@/game/battle-replay';
import { activeBattleSettings } from '@/game/battle-settings';
import { createBattleBoardScene } from '@/game/battle-board-scene';
import { Battle } from '@/game/battle';

export default function BattleReplayViewer({
  replay,
  onClose,
}: {
  replay: BattleReplay;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReturnType<typeof createBattleBoardScene> | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');

  const totalFrames = replay.frames.length;
  const startTick = replay.frames[0]?.tick ?? 0;
  const endTick = replay.frames[totalFrames - 1]?.tick ?? 0;
  const totalSeconds = ((endTick - startTick) / 10).toFixed(1);

  const currentBattle = useRef<Battle>(replayBattleAt(replay, 0));
  const currentTick = currentBattle.current.tick;
  const currentSeconds = Math.max(0, (currentTick - startTick) / 10).toFixed(1);

  const isFinished = frameIndex >= totalFrames - 1;

  // Track living fighters for HUD stats
  const livingCounts = useMemo(() => {
    const battle = currentBattle.current;
    let player = 0;
    let enemy = 0;
    for (const f of battle.fighters) {
      if (f.hp > 0) {
        if (f.side === 'player') player++;
        else enemy++;
      }
    }
    return { player, enemy };
  }, [frameIndex]);

  // Modal lifecycle
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);

  // 3D Scene initialization
  useEffect(() => {
    let disposed = false;
    if (!canvas.current) return;

    try {
      const layout = {
        hexGap: activeBattleSettings.boardHexGap ?? 0.35,
        teamGap: activeBattleSettings.boardTeamGap ?? 1,
        columns: activeBattleSettings.boardColumns ?? 5,
        rowsPerTeam: activeBattleSettings.boardRows ?? 3,
      };

      const scene = createBattleBoardScene(
        canvas.current,
        layout,
        () => {
          if (!disposed) {
            canvas.current?.setAttribute('data-battle-ready', 'true');
            setReady(true);
          }
        },
        undefined,
        false,
        (msg) => {
          if (!disposed) setModelError(msg);
        }
      );

      scene.bindBattleReader(() => ({
        battle: currentBattle.current,
        selected: null,
        overlays: activeBattleSettings.overlays,
        all: activeBattleSettings.showAll,
      }));

      sceneRef.current = scene;
    } catch {
      setError('The tactical replay scene could not load. Please verify WebGL support and retry.');
    }

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Playback animation loop
  useEffect(() => {
    if (!ready || error || !playing || isFinished) return;

    let previous = performance.now();
    let accumulatedElapsed = 0;
    let animationFrameId = 0;

    const step = (now: number) => {
      if (!document.hidden) {
        const delta = Math.min(250, now - previous);
        accumulatedElapsed += delta * speed;
      }
      previous = now;

      // Each tick is 100ms
      const targetTick = startTick + accumulatedElapsed / 100;
      let nextIdx = frameIndex;

      while (nextIdx + 1 < totalFrames && replay.frames[nextIdx + 1].tick <= targetTick) {
        nextIdx++;
      }

      if (nextIdx !== frameIndex) {
        setFrameIndex(nextIdx);
        currentBattle.current = replayBattleAt(replay, nextIdx);
      }

      if (nextIdx >= totalFrames - 1) {
        setPlaying(false);
        return;
      }

      animationFrameId = requestAnimationFrame(step);
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [ready, error, playing, speed, frameIndex, isFinished, totalFrames, startTick, replay]);

  function seekToFrame(index: number) {
    const clamped = Math.max(0, Math.min(index, totalFrames - 1));
    setFrameIndex(clamped);
    currentBattle.current = replayBattleAt(replay, clamped);
    if (clamped >= totalFrames - 1) {
      setPlaying(false);
    }
  }

  function togglePlay() {
    if (isFinished) {
      seekToFrame(0);
      setPlaying(true);
    } else {
      setPlaying(!playing);
    }
  }

  function restart() {
    seekToFrame(0);
    setPlaying(true);
  }

  return (
    <dialog
      ref={dialog}
      className="battle-dialog replay-dialog"
      aria-label="Battle replay"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="battle-header">
        <div>
          <span className="eyebrow">BATTLE RECORDING · TACTICAL BOARD</span>
          <h2>
            {isFinished
              ? `Battle completed · ${replay.result ? replay.result.toUpperCase() : 'ENDED'}`
              : playing
              ? 'Watching battle...'
              : 'Replay paused'}
          </h2>
          <span role="status">
            {currentSeconds}s / {totalSeconds}s · Squads alive: {livingCounts.player} Allies / {livingCounts.enemy} Hostiles
          </span>
        </div>
        <button className="secondary" onClick={onClose}>
          Close replay
        </button>
      </header>

      <div className="battle-field">
        <canvas
          ref={canvas}
          aria-label="Tactical battlefield recording. Drag to rotate or pan; scroll or pinch to zoom."
        />
        {!ready && !error && (
          <p className="battle-loading" role="status">
            Preparing battlefield & Axie units...
          </p>
        )}
        <div className="battle-camera">
          <button aria-label="Zoom in" onClick={() => sceneRef.current?.zoom(0.85)}>
            +
          </button>
          <button aria-label="Zoom out" onClick={() => sceneRef.current?.zoom(1.18)}>
            −
          </button>
          <button onClick={() => sceneRef.current?.home()}>Reset view</button>
        </div>
      </div>

      <div className="battle-controls">
        {modelError && (
          <p role="alert" className="error-note">
            Axie models note: {modelError}
          </p>
        )}
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <>
            {/* Timeline scrubber */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                margin: '8px 0',
              }}
            >
              <span style={{ fontSize: '0.85rem', minWidth: '40px' }}>{currentSeconds}s</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, totalFrames - 1)}
                value={frameIndex}
                aria-label="Replay timeline position"
                onChange={(e) => seekToFrame(Number(e.target.value))}
                style={{ flex: 1, cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', minWidth: '40px', textAlign: 'right' }}>
                {totalSeconds}s
              </span>
            </div>

            {/* Playback action buttons */}
            <div className="placement-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                className="primary"
                disabled={!ready}
                onClick={togglePlay}
              >
                {isFinished ? 'Watch again' : playing ? 'Pause' : 'Play'}
              </button>

              <button
                className="secondary"
                disabled={!ready || frameIndex === 0}
                onClick={restart}
              >
                Restart
              </button>

              <button
                className="secondary"
                disabled={!ready}
                onClick={() => setSpeed(speed === 1 ? 2 : 1)}
                title="Toggle playback speed"
              >
                Speed: {speed}x
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
