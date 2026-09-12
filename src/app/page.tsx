"use client";

import { useEffect, useRef, useState } from 'react';
import { BUILDABLE_KINDS, BUILDING_DEFINITIONS, BuildableKind, BuildingKind, Building, Cell, canPlace, canMoveBuilding, MAIN_HALL, TROOP_DEFINITIONS, TRAINABLE_TROOP_KINDS, TRAINING_BATCH, EMPTY_TROOPS, Troops, canTrain } from '@/game/base';
import HeroesPanel from './heroes-panel';
import type { BaseView } from '@/game/scene';

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<BaseView | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([MAIN_HALL]);
  const [heroes, setHeroes] = useState(false);
  const [training, setTraining] = useState(false);
  const [troops, setTroops] = useState<Troops>({ ...EMPTY_TROOPS });
  const [catalog, setCatalog] = useState(true);
  const [buildingKind, setBuildingKind] = useState<BuildingKind>('farm');
  const [moving, setMoving] = useState<Building | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Building | null>(null);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('A new chapter for Lunacia starts here.');
  useEffect(() => {
    let disposed = false;
    import('@/game/scene').then(({ createBase }) => {
      if (disposed || !canvas.current) return;
      view.current = createBase(canvas.current, { change: setBuildings, preview: setCell, select: building => { setSelected(building); if (building) { setTraining(false); setHeroes(false); } }, message: setMessage, troops: setTroops });
      setReady(true);
    }).catch(() => setMessage('Unable to open the 3D view. Please enable WebGL and reload.'));
    return () => { disposed = true; view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => {
    if (ready) view.current?.setGridVisible((catalog && !selected) || placing);
  }, [catalog, placing, ready, selected]);
  const valid = cell !== null && (moving ? canMoveBuilding(moving.id, cell, buildings) : canPlace(cell, buildings));
  const farms = buildings.filter(b => b.kind === 'farm').length;
  function begin(kind: BuildableKind) { setHeroes(false); setTraining(false); setMoving(null); setBuildingKind(kind); setSelected(null); setPlacing(true); setCatalog(false); view.current?.begin(kind); }
  function cancel() { view.current?.cancel(); setPlacing(false); setCell(null); setCatalog(!moving); if (moving) setSelected(moving); setMoving(null); }
  function confirm() { if (view.current?.confirm()) { setPlacing(false); setCell(null); setCatalog(!moving); setMoving(null); } }
  function moveSelected() {
    if (!selected || !view.current?.move(selected.id)) return;
    setMoving(selected); setBuildingKind(selected.kind); setSelected(null); setPlacing(true); setCatalog(false);
  }
  function removeSelected() {
    if (selected && view.current?.remove(selected.id)) { setSelected(null); setCatalog(false); }
  }
  function toggleTraining() {
    setHeroes(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setTraining(!training);
  }
  function toggleHeroes() {
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setTraining(false); setHeroes(!heroes);
  }
  return <main className="game">
    <canvas ref={canvas} aria-label="Lunacia settlement. Drag to pan, scroll or pinch to zoom. Choose a building, then tap the land to position it." />
    <header className="topbar">
      <div className="identity"><div className="crest">✦</div><div><span className="eyebrow">AXIE CONQUEST</span><strong>Everleaf Haven</strong><small>Lunacia · Your settlement</small></div></div>
      <div className="resources"><div><span>🌾</span><strong>{farms}<small>FARMS</small></strong></div><div><span>▦</span><strong>{800 - buildings.length * 16}<small>FREE CELLS</small></strong></div><div className="level"><span>✦</span><strong>1<small>HALL LEVEL</small></strong></div></div>
    </header>
    <aside className="chapter"><span className="eyebrow">CHAPTER 01 / ROOTS OF A KINGDOM</span><h1>A home worth<br />growing.</h1><p>Raise your first farm.<br />Bring life back to Lunacia.</p><div className="objective"><span className={farms ? 'complete' : ''}>{farms ? '✓' : '○'}</span><div>Plant the foundations<small>{farms ? 'First farm established' : 'Build your first farm'}</small></div></div></aside>
    <div className="map-controls"><button aria-label="Zoom in" onClick={() => view.current?.zoom(0.85)}>+</button><button aria-label="Zoom out" onClick={() => view.current?.zoom(1.18)}>−</button><button aria-label="Center on main hall" onClick={() => view.current?.home()}>⌂</button></div>
    {!ready && <div className="loading">Preparing your settlement…</div>}
    {selected && !placing && <section className="selection panel"><button className="close" aria-label="Close building details" onClick={() => setSelected(null)}>×</button><span className="eyebrow">LEVEL 1 · {BUILDING_DEFINITIONS[selected.kind].category}</span><h2>{BUILDING_DEFINITIONS[selected.kind].name}</h2><p>{BUILDING_DEFINITIONS[selected.kind].description}</p><small>4 × 4 footprint · Cell {selected.x + 1}, {selected.z + 1}</small><div className="placement-actions"><button className="primary" onClick={moveSelected}>Move</button><button className="secondary" onClick={() => view.current?.rotate(selected.id)} aria-label="Rotate building 90 degrees">Rotate</button>{selected.kind !== 'hall' && <button className="secondary remove-action" onClick={removeSelected}>Remove</button>}</div></section>}
    {placing ? <section className="placement panel"><div><span className="eyebrow">{moving ? 'MOVING' : 'PLACING'} / {BUILDING_DEFINITIONS[buildingKind].name}</span><h2>{valid ? 'Room to grow' : 'Choose another spot'}</h2><p aria-live="polite">{cell ? (valid ? `Clear land at ${cell.x + 1}, ${cell.z + 1}. Ready to ${moving ? 'move' : 'build'}.` : 'Blocked: overlaps a building or crosses the base edge.') : `Tap the land to position your ${BUILDING_DEFINITIONS[buildingKind].name}.`}</p><div className="legend"><span>🟩 Available</span><span>🟥 Blocked</span><span>4 × 4 cells</span></div></div><div className="placement-actions"><button className="secondary" onClick={cancel}>Cancel</button><button className="primary" disabled={!valid} onClick={confirm}>✓ {moving ? 'Confirm move' : `Build ${BUILDING_DEFINITIONS[buildingKind].name}`}</button></div></section> : catalog && !selected && <section className="catalog panel"><div className="catalog-heading"><div><span className="eyebrow">MAKE ROOM FOR POSSIBILITY</span><h2>Build your haven</h2></div><button className="close" aria-label="Close build menu" onClick={() => setCatalog(false)}>×</button></div><div className="building-options">{BUILDABLE_KINDS.map(kind => {
      const definition = BUILDING_DEFINITIONS[kind];
      return <button key={kind} className="building-card" onClick={() => begin(kind)} disabled={!ready}><span className="building-art" aria-hidden="true">{definition.icon}</span><span><strong>{definition.name}</strong><small>{definition.category} &middot; 4 &times; 4</small></span><span className="add" aria-hidden="true">+</span></button>;
    })}</div><div className="catalog-footer">Prototype construction is free <span>40 × 20 base grid</span></div></section>}
    {training && !placing && !selected && <section className="training panel" aria-label="Train troops">
      <div className="catalog-heading"><div><h2>Train troops</h2><small>{Object.values(troops).reduce((total, count) => total + count, 0)} troops ready</small></div><button className="close" aria-label="Close training menu" onClick={() => setTraining(false)}>&times;</button></div>
      <div className="troop-options">{TRAINABLE_TROOP_KINDS.map(kind => {
        const definition = TROOP_DEFINITIONS[kind];
        const unlocked = canTrain(kind, buildings);
        return <div className={`troop-card ${unlocked ? '' : 'locked'}`} key={kind}>
          <span className="building-art" aria-hidden="true">{definition.icon}</span>
          <div className="troop-info"><strong>{definition.name}</strong><small>{troops[kind]} ready &middot; {BUILDING_DEFINITIONS[definition.building].name}</small><small>{unlocked ? definition.description : `Build ${BUILDING_DEFINITIONS[definition.building].name} to unlock`}</small></div>
          <button className="primary" disabled={!ready || !unlocked || troops[kind] > Number.MAX_SAFE_INTEGER - TRAINING_BATCH} onClick={() => view.current?.train(kind)} aria-label={`Train ${TRAINING_BATCH} ${definition.name.toLowerCase()}`}>{unlocked ? `Train ${TRAINING_BATCH}` : 'Locked'}</button>
        </div>;
      })}</div>
      <div className="catalog-footer">Training is free and instant for now.</div>
    </section>}
    {heroes && !placing && !selected && <HeroesPanel onClose={() => setHeroes(false)} />}
    <footer className="bottom-bar"><div className="status" role="status"><span className="status-dot" />{message}<small>DRAG TO PAN · PINCH / SCROLL TO ZOOM</small></div><div className="hud-actions"><button className="build-toggle" onClick={toggleHeroes} aria-expanded={heroes}><span>Axies</span></button><button className="build-toggle" onClick={toggleTraining} aria-expanded={training}><span>Train</span></button><button className="build-toggle" onClick={() => { setHeroes(false); setTraining(false); if (placing) cancel(); else { setSelected(null); setCatalog(selected ? true : !catalog); } }} aria-expanded={(catalog && !selected) || placing}>▦ <span>{placing ? (moving ? 'Cancel move' : 'Cancel build') : 'Build'}</span></button></div></footer>
  </main>;
}
