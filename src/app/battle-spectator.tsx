"use client";

import { useEffect, useRef, useState } from 'react';
import { BattleSession } from '@/game/battle-save';
import { createBattleBoardScene } from '@/game/battle-board-scene';
import { activeBattleSettings } from '@/game/battle-settings';
import { BattleOverlays } from '@/game/battle-debug';

type Props = {
  session: BattleSession;
  isPaused: boolean;
  onTogglePause: () => void;
  onStep: () => void;
  onRestart: () => void;
  speed: 1 | 2 | 0.5;
  onSpeedChange: (speed: 1 | 2 | 0.5) => void;
  onClose: () => void;
  onFinish?: () => void;
};

export default function BattleSpectatorModal({
  session,
  isPaused,
  onTogglePause,
  onStep,
  onRestart,
  speed,
  onSpeedChange,
  onClose,
  onFinish,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReturnType<typeof createBattleBoardScene> | null>(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [modelError, setModelError] = useState('');

  const [overlays, setOverlays] = useState<BattleOverlays>({
    attack: true,
    engagement: true,
    awareness: false,
    body: false,
    facing: true,
    targets: true,
  });
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveSession = useRef(session);
  liveSession.current = session;

  const currentBattle = session.battle;
  const isFinished = !!currentBattle.result;
  const elapsedSeconds = (currentBattle.tick / 10).toFixed(1);

  const livingAllies = currentBattle.fighters.filter(f => f.side === 'player' && f.hp > 0).length;
  const livingEnemies = currentBattle.fighters.filter(f => f.side === 'enemy' && f.hp > 0).length;
  const selectedFighter = selectedId ? currentBattle.fighters.find(f => f.id === selectedId) : null;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => prev?.focus();
  }, []);

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
          if (!disposed) setReady(true);
        },
        (id) => setSelectedId(id),
        false,
        (msg) => {
          if (!disposed) setModelError(msg);
        }
      );

      scene.bindBattleReader(() => ({
        battle: liveSession.current.battle,
        selected: selectedId,
        overlays,
        all: showAll,
      }));

      sceneRef.current = scene;
    } catch {
      setError('Tactical battlefield unavailable. WebGL could not be initialized.');
    }

    return () => {
      disposed = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [overlays, showAll, selectedId]);

  function toggleOverlay(key: keyof BattleOverlays) {
    setOverlays(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const dotColor = isFinished ? '#888' : isPaused ? (currentBattle.tick === 0 ? '#2ecc71' : '#f39c12') : '#e04040';
  const eyebrowLabel = isFinished
    ? 'COMBAT CONCLUDED'
    : isPaused
    ? currentBattle.tick === 0
      ? 'OPENING FORMATION — READY TO ENGAGE'
      : `COMBAT PAUSED — INSPECTING TICK ${currentBattle.tick} (${elapsedSeconds}s)`
    : 'LIVE TACTICAL COMBAT';

  return (
    <dialog
      ref={dialog}
      className="battle-dialog spectator-dialog"
      aria-label="Live Battle Spectator"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="battle-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: dotColor,
                boxShadow: isPaused || isFinished ? 'none' : '0 0 10px #e04040',
                animation: !isPaused && !isFinished ? 'pulse 1.5s infinite' : 'none',
              }}
            />
            <span className="eyebrow" style={{ color: dotColor }}>
              {eyebrowLabel}
            </span>
          </div>
          <h2>
            {session.army.name} vs {session.target.kind === 'boss' ? 'Chimera Boss' : session.target.kind === 'garrison' ? 'Garrison' : 'Wild Chimeras'}
          </h2>
          <span role="status">
            Time: {elapsedSeconds}s · Allies: {livingAllies}/{currentBattle.fighters.filter(f => f.side === 'player').length} · Hostiles: {livingEnemies}/{currentBattle.fighters.filter(f => f.side === 'enemy').length}
          </span>
        </div>

        {/* Primary Combat & Inspection Controls */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          {/* Main Action: Start Battle / Pause / Resume */}
          {isFinished ? (
            <button className="secondary" onClick={onRestart} title="Restart combat to replay/inspect from tick 0">
              ↺ Restart
            </button>
          ) : isPaused && currentBattle.tick === 0 ? (
            <button
              className="primary"
              onClick={onTogglePause}
              style={{
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
                border: 'none',
                padding: '8px 18px',
                fontSize: '0.92rem',
                boxShadow: '0 2px 10px rgba(46, 204, 113, 0.4)',
                cursor: 'pointer',
              }}
            >
              ▶ Start Battle
            </button>
          ) : (
            <button
              className={isPaused ? 'primary' : 'secondary'}
              onClick={onTogglePause}
              style={{ minWidth: '85px', fontWeight: 600 }}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
          )}

          {/* Step Button (when paused and combat running) */}
          {isPaused && !isFinished && (
            <button
              className="secondary"
              onClick={onStep}
              title="Advance exactly 1 tick (0.1s)"
              style={{ padding: '6px 12px', fontWeight: 500 }}
            >
              ⏭ Step (+0.1s)
            </button>
          )}

          {/* Restart Button (during battle) */}
          {!isFinished && currentBattle.tick > 0 && (
            <button
              className="secondary"
              onClick={onRestart}
              title="Rewind to tick 0 opening positions"
              style={{ padding: '6px 10px' }}
            >
              ↺ Restart
            </button>
          )}

          {/* Speed Toggle */}
          {!isFinished && (
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                padding: '2px',
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              {([0.5, 1, 2] as const).map(s => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  style={{
                    background: speed === s ? '#36f0d8' : 'transparent',
                    color: speed === s ? '#0f2027' : '#fff',
                    fontWeight: speed === s ? 700 : 400,
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 7px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {s}x
                </button>
              ))}
            </div>
          )}

          <button className="secondary" onClick={onClose}>
            Minimize to map
          </button>
        </div>
      </header>

      <div className="battle-field" style={{ position: 'relative' }}>
        <canvas
          ref={canvas}
          aria-label="Live battle board. Drag to rotate or pan; scroll or pinch to zoom. Tap units to inspect."
        />

        {/* Selected Unit Inspector Card */}
        {selectedFighter && (
          <aside
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              background: 'rgba(18, 24, 30, 0.94)',
              backdropFilter: 'blur(10px)',
              border: `1px solid ${selectedFighter.side === 'player' ? '#36f0d8' : '#ff907d'}`,
              borderRadius: '8px',
              padding: '10px 14px',
              minWidth: '230px',
              maxWidth: '290px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
              zIndex: 10,
              color: '#fff',
              fontSize: '0.8rem',
            }}
            aria-label="Selected unit details"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <strong style={{ fontSize: '0.95rem', color: selectedFighter.side === 'player' ? '#7fffd4' : '#ff9a8b' }}>
                {selectedFighter.name}
              </strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: selectedFighter.side === 'player' ? 'rgba(54, 240, 216, 0.2)' : 'rgba(255, 144, 125, 0.2)',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                  }}
                >
                  {selectedFighter.side}
                </span>
                <button
                  onClick={() => setSelectedId(null)}
                  style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                  title="Close inspector"
                >
                  &times;
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.85, marginBottom: '3px' }}>
                <span>HP: {Math.round(selectedFighter.hp)} / {selectedFighter.maxHp}</span>
                <span>State: <b style={{ textTransform: 'capitalize', color: selectedFighter.state === 'attacking' ? '#ffd166' : selectedFighter.state === 'defeated' ? '#888' : '#fff' }}>{selectedFighter.state}</b></span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, (selectedFighter.hp / selectedFighter.maxHp) * 100))}%`,
                    height: '100%',
                    background: selectedFighter.side === 'player' ? '#36f0d8' : '#ff7865',
                    transition: 'width 0.15s ease-out',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: '0.74rem', opacity: 0.9 }}>
              <div>ATK: <b>{Math.round(selectedFighter.stats.attack)}</b></div>
              <div>DEF: <b>{Math.round(selectedFighter.stats.defense)}</b></div>
              <div>SPD: <b>{selectedFighter.stats.speed.toFixed(1)}</b></div>
              <div>RNG: <b>{selectedFighter.stats.range.toFixed(1)}m</b></div>
              <div>BOARD X: <b>{(-selectedFighter.x).toFixed(1)}</b></div>
              <div>BOARD Z: <b>{(-selectedFighter.z).toFixed(1)}</b></div>
            </div>

            {selectedFighter.targetId && (
              <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: '0.74rem', color: '#ffd166' }}>
                Target: <b>{currentBattle.fighters.find(f => f.id === selectedFighter.targetId)?.name ?? selectedFighter.targetId}</b>
              </div>
            )}
          </aside>
        )}

        {!ready && !error && (
          <p className="battle-loading" role="status">
            Connecting to live battlefield...
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
            Axie model notice: {modelError}
          </p>
        )}
        {error && <p role="alert">{error}</p>}

        {/* Live Debug & Overlay Toggles */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', margin: '4px 0' }}>
          <span style={{ fontSize: '0.8rem', opacity: 0.8, marginRight: '4px' }}>Inspect Overlays:</span>
          <button
            className={overlays.attack ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('attack')}
          >
            Attack Ranges
          </button>
          <button
            className={overlays.engagement ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('engagement')}
          >
            Vision Cones
          </button>
          <button
            className={overlays.awareness ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('awareness')}
          >
            Awareness Radius
          </button>
          <button
            className={overlays.targets ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('targets')}
          >
            Target Lines
          </button>
          <button
            className={overlays.facing ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('facing')}
          >
            Facing Lines
          </button>
          <button
            className={overlays.body ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => toggleOverlay('body')}
          >
            Body Rings
          </button>
          <button
            className={showAll ? 'primary' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '4px 8px' }}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Selected Only' : 'Show All Units'}
          </button>
        </div>

        {/* Finished Combat Action */}
        {isFinished && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.06)',
              padding: '8px 12px',
              borderRadius: '6px',
              marginTop: '6px',
            }}
          >
            <div>
              <strong>Outcome: {currentBattle.result?.toUpperCase()}!</strong>
              <div style={{ fontSize: '0.8rem', opacity: 0.85 }}>
                {currentBattle.result === 'victory'
                  ? 'Victory achieved. The area is secured.'
                  : 'Army defeated or retreated to base.'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="secondary" onClick={onRestart}>
                ↺ Replay / Inspect Again
              </button>
              <button
                className="primary"
                onClick={() => {
                  onFinish?.();
                  onClose();
                }}
              >
                Complete & View Report
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

