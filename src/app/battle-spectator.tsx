"use client";

import { useEffect, useRef, useState } from 'react';
import { BattleSession } from '@/game/battle-save';
import { createBattleBoardScene } from '@/game/battle-board-scene';
import { activeBattleSettings } from '@/game/battle-settings';
import { BattleOverlays } from '@/game/battle-debug';

type Props = {
  session: BattleSession;
  onClose: () => void;
  onFinish?: () => void;
};

export default function BattleSpectatorModal({ session, onClose, onFinish }: Props) {
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
    facing: false,
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
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isFinished ? '#888' : '#e04040',
                boxShadow: isFinished ? 'none' : '0 0 8px #e04040',
                animation: isFinished ? 'none' : 'pulse 1.5s infinite',
              }}
            />
            <span className="eyebrow">
              {isFinished ? 'COMBAT CONCLUDED' : 'LIVE TACTICAL COMBAT'}
            </span>
          </div>
          <h2>
            {session.army.name} vs {session.target.kind === 'boss' ? 'Chimera Boss' : session.target.kind === 'garrison' ? 'Garrison' : 'Wild Chimeras'}
          </h2>
          <span role="status">
            Time: {elapsedSeconds}s · Allies alive: {livingAllies} · Hostiles alive: {livingEnemies}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="secondary" onClick={onClose}>
            Minimize to map
          </button>
        </div>
      </header>

      <div className="battle-field">
        <canvas
          ref={canvas}
          aria-label="Live battle board. Drag to rotate or pan; scroll or pinch to zoom. Tap units to inspect."
        />
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
          <span style={{ fontSize: '0.8rem', opacity: 0.8, marginRight: '4px' }}>Inspect:</span>
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
        )}
      </div>
    </dialog>
  );
}
