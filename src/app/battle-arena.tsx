import { useEffect, useRef, useState } from 'react';
import { activateCommanderSkill, Battle, BATTLE_STEP, livingCount, stepBattle } from '@/game/battle';
import { BATTLE_OVERLAYS, BattleOverlays, DEFAULT_BATTLE_OVERLAYS } from '@/game/battle-debug';
import { commanderSkill } from '@/game/battle-skills';
import { leaderTalent } from '@/game/battle-modifiers';
import { STARTER_HEROES } from '@/game/heroes';

type Props = { battle: Battle; onChange: (battle: Battle) => void; onClose: () => void; sandbox?: boolean; onReset?: () => void; error?: string; onRetry?: () => void; title?: string };
export default function BattleArena({ battle, onChange, onClose, sandbox = false, onReset, error, onRetry, title = 'Lunacian skirmish' }: Props) {
  const [paused, setPaused] = useState(sandbox);
  const [selected, setSelected] = useState<string | null>(battle.leaderId ?? battle.fighters[0]?.id ?? null);
  const [overlays, setOverlays] = useState<BattleOverlays>(DEFAULT_BATTLE_OVERLAYS);
  const [all, setAll] = useState(false);
  const [debug, setDebug] = useState(sandbox);
  const [renderError, setRenderError] = useState('');
  const [sceneReady, setSceneReady] = useState(false);
  const [notice, setNotice] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const renderer = useRef<ReturnType<typeof import('@/game/battle-scene').createBattleScene> | null>(null);
  const live = useRef({ battle, selected, overlays, all, onChange, paused, error, sceneReady, renderError });
  live.current = { battle, selected, overlays, all, onChange, paused, error, sceneReady, renderError };
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  useEffect(() => {
    let disposed = false;
    import('@/game/battle-scene').then(({ createBattleScene }) => { if (!disposed && canvas.current) renderer.current = createBattleScene(canvas.current, () => live.current, setSelected, () => { if (!disposed) setSceneReady(true); }); }).catch(() => setRenderError('3D battlefield unavailable. Use the unit list and combat controls below.'));
    return () => { disposed = true; renderer.current?.dispose(); };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => { const current = live.current; if ((current.sceneReady || current.renderError) && !current.paused && !current.error && !current.battle.result && !document.hidden) current.onChange(stepBattle(current.battle)); }, BATTLE_STEP * 1000);
    return () => clearInterval(timer);
  }, []);
  const fighter = battle.fighters.find(f => f.id === selected);
  const leader = battle.fighters.find(f => f.id === battle.leaderId);
  const hero = STARTER_HEROES.find(h => h.id === leader?.heroId);
  const skill = commanderSkill(hero), talent = leaderTalent(hero);
  const canSkill = activateCommanderSkill(battle) !== battle;
  const results = { victory: 'Victory', defeat: 'Defeat', retreated: 'Retreated', draw: 'Draw · time limit or mutual defeat' };
  return <dialog ref={dialog} className="battle-dialog" aria-label={title} onCancel={event => { event.preventDefault(); if (sandbox || battle.result) onClose(); else { setPaused(true); setNotice('Battle paused. Resume or retreat to finish.'); } }}>
    <header className="battle-header"><div><span className="eyebrow">{sandbox ? 'DEVELOPER · PRACTICE BATTLE' : 'DEFEND LUNACIA'}</span><h2>{title}</h2><span role="status">{battle.result ? results[battle.result] : battle.retreating ? 'Retreating to safety' : paused ? 'Paused' : 'Fighting'} · {(battle.tick / 10).toFixed(1)}s</span></div>{(sandbox || battle.result) && <button className="secondary" onClick={onClose}>{sandbox ? 'Close practice' : 'Return to map'}</button>}</header>
    <div className="battle-field">{!sceneReady && !renderError && <p className="battle-loading" role="status">Preparing battlefield...</p>}<canvas ref={canvas} aria-label="Battlefield. Drag to pan, pinch or scroll to zoom, tap a unit to inspect." /><div className="battle-camera"><button aria-label="Zoom battlefield in" onClick={() => renderer.current?.zoom(0.85)}>+</button><button aria-label="Zoom battlefield out" onClick={() => renderer.current?.zoom(1.18)}>−</button><button onClick={() => renderer.current?.home()}>Center</button></div></div>
    <div className="battle-controls">
      {(error || renderError) && <p role="alert">{error || renderError}{error && onRetry && <button onClick={onRetry}>Retry save</button>}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="battle-totals">{(['player', 'enemy'] as const).map(side => { const members = battle.fighters.filter(f => f.side === side); return <span key={side}><strong>{side === 'player' ? 'Your formation' : 'Chimeras'}</strong> {members.reduce((sum, f) => sum + livingCount(f), 0)} remaining · {Math.ceil(members.reduce((sum, f) => sum + f.hp, 0))} HP</span>; })}</div>
      <div className="placement-actions"><button className="primary" disabled={!!battle.result || !!error} onClick={() => setPaused(!paused)}>{paused ? 'Start / Resume' : 'Pause'}</button>{sandbox && <button className="secondary" disabled={!paused || !!battle.result} onClick={() => onChange(stepBattle(battle))}>Step 0.1s</button>}<button className="secondary" disabled={!!battle.result || battle.retreating || !!error} onClick={() => { onChange({ ...battle, retreating: true }); setPaused(false); }}>Retreat</button>{sandbox && <button className="secondary" onClick={() => { onReset?.(); setPaused(true); }}>Reset fight</button>}<button className="secondary" aria-expanded={debug} onClick={() => setDebug(!debug)}>Ranges / inspect</button></div>
      {skill && <div className="battle-skill"><button className="primary" disabled={!canSkill || !!error} onClick={() => onChange(activateCommanderSkill(battle))}>{skill.name}{battle.skillCooldown > 0 ? ` · ${battle.skillCooldown.toFixed(1)}s` : ''}</button><small>{skill.description} Range {skill.range}. {leader?.hp === 0 ? 'Commander knocked out.' : !canSkill && !battle.skillCooldown ? 'No eligible target in range.' : ''}</small></div>}
      {talent && <small>Leader: {hero?.name} · {talent.name}: +5% {Object.entries(talent.modifiers).find(([, value]) => value > 1)?.[0]} for the formation (battle-start bonus).</small>}
      {battle.result && <p role="status">{results[battle.result]}. {sandbox ? 'Practice does not change your army or saves.' : 'Survivors return home. Knocked-out Axies recover at home; lost troops must be trained again.'}</p>}
      {debug && <div className="battle-debug"><fieldset><legend>Range overlays</legend>{Object.entries(BATTLE_OVERLAYS).map(([key, definition]) => <label key={key}><input type="checkbox" checked={overlays[key as keyof BattleOverlays]} onChange={e => setOverlays({ ...overlays, [key]: e.target.checked })} /><span style={{ color: definition.color }}>●</span>{definition.label}</label>)}<label><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Show both formations / all units</label><small>Defaults to the selected unit and its formation. Basic attacks use a full circle and automatic facing.</small></fieldset>
        <label>Inspect unit<select value={selected ?? ''} onChange={e => setSelected(e.target.value)}>{battle.fighters.map(f => <option key={f.id} value={f.id}>{f.side} · {f.name} · {livingCount(f)}</option>)}</select></label>
        {fighter && <p>{fighter.name} · {fighter.state}<br />HP {Math.ceil(fighter.hp)} / {Math.ceil(fighter.maxHp)} · {livingCount(fighter)} / {fighter.initialCount} members<br />Attack {fighter.stats.attack.toFixed(1)} each · Defense {fighter.stats.defense.toFixed(1)} · Speed {fighter.stats.speed.toFixed(2)}{fighter.state === 'charging' ? ' × 1.10 charge' : ''}<br />Range {fighter.stats.range} · Interval {fighter.stats.interval}s · Next attack {fighter.cooldown.toFixed(1)}s<br />Target: {battle.fighters.find(f => f.id === fighter.targetId)?.name ?? 'None'}</p>}
      </div>}
    </div>
  </dialog>;
}
