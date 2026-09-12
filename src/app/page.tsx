"use client";

import { useEffect, useRef, useState } from 'react';
import { BUILDABLE_KINDS, BUILDING_DEFINITIONS, BuildableKind, BuildingKind, Building, Cell, canPlace, canMoveBuilding, getBuildingDimensions, MAIN_HALL, EMPTY_TROOPS, Troops } from '@/game/base';
import HeroesPanel from './heroes-panel';
import MilitaryPanel from './military-panel';
import TrainingDialog from './training-dialog';
import MailDialog from './mail-dialog';
import type { BaseView } from '@/game/scene';

type InventoryTab = 'resources' | 'equipment' | 'other';

export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<BaseView | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([MAIN_HALL]);
  const [heroes, setHeroes] = useState(false);
  const [military, setMilitary] = useState(false);
  const [training, setTraining] = useState(false);
  const [mail, setMail] = useState(false);
  const [inventory, setInventory] = useState(false);
  const [inventoryTab, setInventoryTab] = useState<InventoryTab>('resources');
  const [troops, setTroops] = useState<Troops>({ ...EMPTY_TROOPS });
  const [catalog, setCatalog] = useState(true);
  const [buildingKind, setBuildingKind] = useState<BuildingKind>('farm');
  const [moving, setMoving] = useState<Building | null>(null);
  const [placing, setPlacing] = useState(false);
  const [cell, setCell] = useState<Cell | null>(null);
  const [selected, setSelected] = useState<Building | null>(null);
  const [ready, setReady] = useState(false);
  const [worldView, setWorldView] = useState(false);
  const [message, setMessage] = useState('A new chapter for Lunacia starts here.');
  useEffect(() => {
    let disposed = false;
    import('@/game/scene').then(({ createBase }) => {
      if (disposed || !canvas.current) return;
      view.current = createBase(canvas.current, { change: setBuildings, preview: setCell, viewMode: mode => { setWorldView(mode === 'world'); if (mode === 'world') { setCatalog(false); setSelected(null); setMilitary(false); setTraining(false); setHeroes(false); setInventory(false); setPlacing(false); setMoving(null); setCell(null); } }, select: building => { setSelected(building); if (building) { setMilitary(false); setTraining(false); setHeroes(false); setInventory(false); } }, message: setMessage, troops: setTroops });
      setReady(true);
    }).catch(() => setMessage('Unable to open the 3D view. Please enable WebGL and reload.'));
    return () => { disposed = true; view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => {
    if (ready && !worldView) view.current?.setGridVisible((catalog && !selected) || placing);
  }, [catalog, placing, ready, selected, worldView]);
  useEffect(() => { if (catalog) setInventory(false); }, [catalog]);
  const size = getBuildingDimensions(buildingKind, moving?.rotation);
  const valid = cell !== null && (moving ? canMoveBuilding(moving.id, cell, buildings) : canPlace(cell, buildings, size.width, size.depth));
  const farms = buildings.filter(b => b.kind === 'farm').length;
  const militaryUnlocked = buildings.some(building => ['barracks', 'archery', 'scout'].includes(building.kind));
  const usedCells = buildings.reduce((total, building) => { const size = getBuildingDimensions(building.kind, building.rotation); return total + size.width * size.depth; }, 0);
  function begin(kind: BuildableKind) { setHeroes(false); setMilitary(false); setTraining(false); setMoving(null); setBuildingKind(kind); setSelected(null); setPlacing(true); setCatalog(false); view.current?.begin(kind); }
  function cancel() { view.current?.cancel(); setPlacing(false); setCell(null); setCatalog(!moving); if (moving) setSelected(moving); setMoving(null); }
  function confirm() { if (view.current?.confirm()) { setPlacing(false); setCell(null); setCatalog(!moving); setMoving(null); } }
  function moveSelected() {
    if (!selected || !view.current?.move(selected.id)) return;
    setMoving(selected); setBuildingKind(selected.kind); setSelected(null); setPlacing(true); setCatalog(false);
  }
  function removeSelected() {
    if (selected && view.current?.remove(selected.id)) { setSelected(null); setCatalog(false); }
  }
  function toggleMilitary() {
    setTraining(false);
    setHeroes(false);
    setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setMilitary(!military);
  }
  function toggleMail() {
    setHeroes(false); setMilitary(false); setTraining(false); setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setMail(true);
  }
  function toggleTraining() {
    setHeroes(false); setMilitary(false); setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setTraining(current => !current);
  }
  function toggleHeroes() {
    setInventory(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setMilitary(false); setTraining(false); setHeroes(!heroes);
  }
  function toggleInventory() {
    setHeroes(false); setMilitary(false); setTraining(false);
    if (placing) { view.current?.cancel(); setPlacing(false); setMoving(null); setCell(null); }
    setSelected(null); setCatalog(false); setInventory(!inventory);
  }
  function toggleWorldView() {
    const next = !worldView;
    setHeroes(false); setMilitary(false); setTraining(false); setInventory(false); setSelected(null); setCatalog(false); setPlacing(false); setMoving(null); setCell(null);
    view.current?.setWorldView(next); setWorldView(next);
  }
  return <main className={`game ${worldView ? 'world-mode' : ''}`}>
    <button className="world-toggle" onClick={toggleWorldView}>{worldView ? 'Base' : 'World'}</button>
    <canvas ref={canvas} aria-label="Lunacia settlement. Drag to pan, scroll or pinch to zoom. Choose a building, then tap the land to position it." />
    <header className="topbar">
      <div className="identity"><div className="crest">✦</div><div><span className="eyebrow">AXIE CONQUEST</span><strong>Everleaf Haven</strong><small>Lunacia · Your settlement</small></div></div>
      <div className="resources"><div><span>🌾</span><strong>{farms}<small>FARMS</small></strong></div><div><span>▦</span><strong>{800 - usedCells}<small>FREE CELLS</small></strong></div><div className="level"><span>✦</span><strong>1<small>HALL LEVEL</small></strong></div></div>
    </header>
    <aside className="chapter"><span className="eyebrow">CHAPTER 01 / ROOTS OF A KINGDOM</span><h1>A home worth<br />growing.</h1><p>Raise your first farm.<br />Bring life back to Lunacia.</p><div className="objective"><span className={farms ? 'complete' : ''}>{farms ? '✓' : '○'}</span><div>Plant the foundations<small>{farms ? 'First farm established' : 'Build your first farm'}</small></div></div></aside>
    <div className="map-controls"><button aria-label="Zoom in" onClick={() => view.current?.zoom(0.85)}>+</button><button aria-label="Zoom out" onClick={() => view.current?.zoom(1.18)}>−</button><button aria-label="Center on main hall" onClick={() => view.current?.home()}>⌂</button></div>
    {!ready && <div className="loading">Preparing your settlement…</div>}
    {selected && !placing && <section className="selection panel"><button className="close" aria-label="Close building details" onClick={() => setSelected(null)}>×</button><span className="eyebrow">LEVEL 1 · {BUILDING_DEFINITIONS[selected.kind].category}</span><h2>{BUILDING_DEFINITIONS[selected.kind].name}</h2><p>{BUILDING_DEFINITIONS[selected.kind].description}</p><small>{getBuildingDimensions(selected.kind, selected.rotation).width} × {getBuildingDimensions(selected.kind, selected.rotation).depth} footprint · Cell {selected.x + 1}, {selected.z + 1}</small><div className="placement-actions"><button className="primary" onClick={moveSelected}>Move</button><button className="secondary" onClick={() => view.current?.rotate(selected.id)} aria-label="Rotate building 90 degrees">Rotate</button>{selected.kind !== 'hall' && <button className="secondary remove-action" onClick={removeSelected}>Remove</button>}</div></section>}
    {placing ? <section className="placement panel"><div><span className="eyebrow">{moving ? 'MOVING' : 'PLACING'} / {BUILDING_DEFINITIONS[buildingKind].name}</span><h2>{valid ? 'Room to grow' : 'Choose another spot'}</h2><p aria-live="polite">{cell ? (valid ? `Clear land at ${cell.x + 1}, ${cell.z + 1}. Ready to ${moving ? 'move' : 'build'}.` : 'Blocked: overlaps a building or crosses the base edge.') : `Tap the land to position your ${BUILDING_DEFINITIONS[buildingKind].name}.`}</p><div className="legend"><span>🟩 Available</span><span>🟥 Blocked</span><span>{size.width} × {size.depth} cells</span></div></div><div className="placement-actions"><button className="secondary" onClick={cancel}>Cancel</button><button className="primary" disabled={!valid} onClick={confirm}>✓ {moving ? 'Confirm move' : `Build ${BUILDING_DEFINITIONS[buildingKind].name}`}</button></div></section> : catalog && !selected && <section className="catalog panel"><div className="catalog-heading"><div><span className="eyebrow">MAKE ROOM FOR POSSIBILITY</span><h2>Build your haven</h2></div><button className="close" aria-label="Close build menu" onClick={() => setCatalog(false)}>×</button></div><div className="building-options">{BUILDABLE_KINDS.map(kind => {
      const definition = BUILDING_DEFINITIONS[kind];
      const dimensions = getBuildingDimensions(kind);
      return <button key={kind} className="building-card" onClick={() => begin(kind)} disabled={!ready}><span className="building-art" aria-hidden="true">{definition.icon}</span><span><strong>{definition.name}</strong><small>{definition.category} &middot; {dimensions.width} &times; {dimensions.depth}</small></span><span className="add" aria-hidden="true">+</span></button>;
    })}</div><div className="catalog-footer">Prototype construction is free <span>40 × 20 base grid</span></div></section>}
    {military && !placing && !selected && <MilitaryPanel buildings={buildings} troops={troops} ready={ready} onClose={() => setMilitary(false)} onTrain={kind => { view.current?.train(kind); }} />}
    <button className="inventory-toggle build-toggle" onClick={toggleInventory} aria-expanded={inventory}><span>Inventory</span></button>
    {inventory && !catalog && !placing && !selected && <section className="inventory panel" aria-label="Inventory">
      <div className="catalog-heading"><div><span className="eyebrow">YOUR LUNACIAN STORES</span><h2>Inventory</h2></div><button className="close" aria-label="Close inventory" onClick={() => setInventory(false)}>&times;</button></div>
      <div className="inventory-tabs" role="tablist" aria-label="Inventory categories">
        {([['resources', 'Resources'], ['equipment', 'Equipment'], ['other', 'Other']] as const).map(([tab, label]) => <button key={tab} role="tab" aria-selected={inventoryTab === tab} className={inventoryTab === tab ? 'active' : ''} onClick={() => setInventoryTab(tab)}>{label}</button>)}
      </div>
      <div className="empty-state" role="tabpanel"><span className="empty-state-icon" aria-hidden="true">▧</span><strong>No {inventoryTab} yet</strong><p>Your {inventoryTab} will appear here as you explore and rebuild Lunacia.</p></div>
    </section>}
    {heroes && !placing && !selected && <HeroesPanel onClose={() => setHeroes(false)} />}
    {training && <TrainingDialog buildings={buildings} troops={troops} ready={ready} onTrain={kind => { view.current?.train(kind); }} onClose={() => setTraining(false)} />}
    {mail && <MailDialog onClose={() => setMail(false)} />}
    <footer className="bottom-bar"><div className="status" role="status"><span className="status-dot" />{message}<small>DRAG TO PAN · PINCH / SCROLL TO ZOOM</small></div><div className="hud-actions"><button className="build-toggle" onClick={toggleHeroes} aria-expanded={heroes}><span>Axies</span></button><button className="build-toggle" onClick={toggleTraining} aria-expanded={training}><span>Train</span></button><button className="build-toggle" onClick={toggleMail} aria-haspopup="dialog" aria-expanded={mail}><span>Mail</span></button><button className="build-toggle" onClick={toggleMilitary} disabled={!militaryUnlocked} aria-expanded={military}><span>Military</span></button><button className="build-toggle" onClick={() => { setHeroes(false); setMilitary(false); setTraining(false); if (placing) cancel(); else { setSelected(null); setCatalog(selected ? true : !catalog); } }} aria-expanded={(catalog && !selected) || placing}>▦ <span>{placing ? (moving ? 'Cancel move' : 'Cancel build') : 'Build'}</span></button></div></footer>
  </main>;
}
