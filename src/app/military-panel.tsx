"use client";

import { useState } from 'react';
import { Building, Troops } from '@/game/base';
import { AXIE_CLASSES, AxieHero, STARTER_HEROES } from '@/game/heroes';

type Section = 'scout' | 'defense' | 'offense' | 'leader' | 'slot' | null;
type FormationSlot = { heroId: string | null; military: string | null; militaryCount: number };
type Formation = { leader: string | null; front: FormationSlot[]; mid: FormationSlot[]; back: FormationSlot[]; rear: FormationSlot[] };
type MilitaryPanelProps = { buildings: Building[]; troops: Troops; ready: boolean; onClose: () => void; onTrain: (kind: never) => void };
const emptySlot = (): FormationSlot => ({ heroId: null, military: null, militaryCount: 0 });
const emptyFormation = (): Formation => ({ leader: null, front: [emptySlot(), emptySlot(), emptySlot(), emptySlot()], mid: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()], back: [emptySlot(), emptySlot(), emptySlot(), emptySlot()], rear: [emptySlot(), emptySlot(), emptySlot(), emptySlot(), emptySlot()] });
const MILITARY_TYPES = ['Infantry', 'Archers'];
const MILITARY_INFO: Record<string, { available: number; consumption: string; icon: string }> = {
  Infantry: { available: 120, consumption: '2 provisions / hr', icon: '⚔' },
  Archers: { available: 80, consumption: '3 provisions / hr', icon: '➶' },
};

function AxieRow({ hero, assigned, unavailable, onAssign }: { hero: AxieHero; assigned: boolean; unavailable?: string; onAssign: () => void }) {
  const style = AXIE_CLASSES[hero.class];
  return <button className={`assignment-row ${assigned ? 'assigned' : ''} ${unavailable ? 'unavailable' : ''}`} onClick={onAssign} disabled={!!unavailable} aria-pressed={assigned}>
    <span className="scout-axie-mark" style={{ '--axie-color': style.color, '--axie-accent': style.accent } as React.CSSProperties}>{style.name.slice(0, 1)}</span>
    <span className="assignment-copy"><strong>{hero.name}</strong><small>{style.name} · {style.role}</small></span><span className="assignment-action">{assigned ? 'Assigned' : unavailable || 'Assign'}</span>
  </button>;
}

export default function MilitaryPanel({ onClose }: MilitaryPanelProps) {
  const [popup, setPopup] = useState<Section>(null);
  const [scouts, setScouts] = useState<string[]>([]);
  const [defender, setDefender] = useState<string | null>(null);
  const [template, setTemplate] = useState(0);
  const [formations, setFormations] = useState<Formation[]>([emptyFormation(), emptyFormation(), emptyFormation()]);
  const [editingSlot, setEditingSlot] = useState<{ row: 'front' | 'mid' | 'back' | 'rear'; index: number } | null>(null);
  const [slotTab, setSlotTab] = useState<'axie' | 'military'>('axie');
  const [militaryDraft, setMilitaryDraft] = useState<FormationSlot>(emptySlot());
  const activeFormation = formations[template];
  const formationHeroIds = new Set([...activeFormation.front, ...activeFormation.mid, ...activeFormation.back, ...activeFormation.rear].map(slot => slot.heroId).filter(Boolean));
  const leaderCandidates = STARTER_HEROES.filter(hero => formationHeroIds.has(hero.id));
  const activeHeroes = popup === 'scout' ? scouts : popup === 'defense' ? (defender ? [defender] : []) : popup === 'slot' && editingSlot ? (activeFormation[editingSlot.row][editingSlot.index].heroId ? [activeFormation[editingSlot.row][editingSlot.index].heroId!] : []) : activeFormation.leader ? [activeFormation.leader] : [];
  const allFormationHeroes = formations.flatMap(formation => [...formation.front, ...formation.mid, ...formation.back, ...formation.rear].map(slot => slot.heroId).concat(formation.leader)).filter(Boolean) as string[];
  const allOffenseHeroes = new Set([...allFormationHeroes]);
  const toggleScout = (id: string) => setScouts(current => current.includes(id) ? current.filter(heroId => heroId !== id) : current.length < 3 ? [...current, id] : current);
  const toggleDefense = (id: string) => setDefender(current => current === id ? null : current || id);
  const assignLeader = (id: string) => {
    setFormations(current => current.map((formation, index) => {
      if (index !== template || ![...formation.front, ...formation.mid, ...formation.back, ...formation.rear].some(slot => slot.heroId === id)) return formation;
      return { ...formation, leader: id };
    }));
    setPopup('offense');
  };
  const closePopup = () => setPopup(null);
  const openFormation = () => setPopup('offense');
  const updateFormation = (row: 'front' | 'mid' | 'back' | 'rear', index: number, value: Partial<FormationSlot>) => setFormations(current => current.map((formation, formationIndex) => {
    if (formationIndex !== template) return formation;
    const next = { ...formation, [row]: formation[row].map((slot, slotIndex) => slotIndex === index ? { ...slot, ...value } : slot) };
    if (![...next.front, ...next.mid, ...next.back, ...next.rear].some(slot => slot.heroId === next.leader)) next.leader = null;
    return next;
  }));
  const assignSlotAxie = (id: string) => {
    if (!editingSlot) return;
    updateFormation(editingSlot.row, editingSlot.index, { heroId: id, military: null, militaryCount: 0 });
    setPopup('offense');
  };
  const openSlot = (row: 'front' | 'mid' | 'back' | 'rear', index: number) => { setEditingSlot({ row, index }); setMilitaryDraft({ ...activeFormation[row][index] }); setSlotTab('axie'); setPopup('slot'); };

  const addMilitary = () => {
    if (!editingSlot || !militaryDraft.military || !Number.isSafeInteger(militaryDraft.militaryCount) || militaryDraft.militaryCount <= 0 || militaryDraft.militaryCount > MILITARY_INFO[militaryDraft.military].available) return;
    updateFormation(editingSlot.row, editingSlot.index, { ...militaryDraft, heroId: null });
  };

  return <section className="military panel" aria-label="Military command">
    <div className="catalog-heading"><div><span className="eyebrow">COMMAND &amp; PROTECT</span><h2>Military</h2><small>Choose a command position to assign an Axie.</small></div><button className="close" aria-label="Close military" onClick={onClose}>&times;</button></div>
    <div className="military-cards">
      <button className="military-card scout-card" onClick={() => setPopup('scout')}><span className="military-card-icon">⌁</span><span><strong>Scout</strong><small>{scouts.length}/3 Axies assigned · Tap to manage</small></span><span className="card-chevron">›</span></button>
      <button className="military-card defense-card" onClick={() => setPopup('defense')}><span className="military-card-icon">▥</span><span><strong>Defense</strong><small>{defender ? '1/1 Axie assigned' : '0/1 Axies assigned'} · Includes walls</small></span><span className="card-chevron">›</span></button>
      <button className="military-card offense-card" onClick={openFormation}><span className="military-card-icon">⚔</span><span><strong>Offense</strong><small>Formation {template + 1} · Leader {activeFormation.leader ? 'assigned' : 'empty'} · Front / Mid / Back</small></span><span className="card-chevron">›</span></button>
    </div>
    <div className="military-note">Scout, Defense, and Offense use static resource requirements for now.</div>
    {popup && <div className="assignment-backdrop" role="presentation" onClick={closePopup}><section className={`assignment-popup ${popup === 'offense' ? 'formation-popup' : ''}`} role="dialog" aria-modal="true" aria-label={`Manage ${popup}`} onClick={event => event.stopPropagation()}>
      {popup === 'offense' ? <>
        <div className="catalog-heading"><div><span className="eyebrow">OFFENSE FORMATION</span><h3>March formation {template + 1}</h3><small>4 Front · 5 Mid · 4 Back · 5 Rear · 1 Leader</small></div><button className="close" aria-label="Close formation" onClick={closePopup}>&times;</button></div>
        <div className="template-tabs" role="tablist" aria-label="Formations">{[0, 1, 2].map(index => <button key={index} role="tab" aria-selected={template === index} className={template === index ? 'active' : ''} onClick={() => setTemplate(index)}>Formation {index + 1}</button>)}</div>
        <div className="resource-requirement"><span>◈</span><div><strong>Requires resources</strong><small>500 provisions + 250 war supplies to prepare this march</small></div><b>Static</b></div>
        <div className="leader-slot"><span className="formation-label">LEADER</span><strong>{activeFormation.leader ? STARTER_HEROES.find(hero => hero.id === activeFormation.leader)?.name : 'No leader assigned'}</strong><small>{leaderCandidates.length ? 'Choose an Axie in this formation' : 'Place an Axie in a slot first'}</small><button className="secondary" disabled={!leaderCandidates.length} onClick={() => setPopup('leader')}>Assign leader</button></div>
        <div className="formation-board">{(['front', 'mid', 'back', 'rear'] as const).map(row => <div className="formation-row" key={row}><span className="formation-label">{row === 'front' ? 'front' : row === 'rear' ? 'back' : ''}</span>{activeFormation[row].map((slot, index) => <button className={`formation-slot ${slot.heroId || slot.military ? 'filled' : ''} ${slot.heroId && activeFormation.leader === slot.heroId ? 'leader-slot-hex' : ''}`} key={`${row}-${index}`} onClick={() => openSlot(row, index)}><strong>{slot.heroId ? STARTER_HEROES.find(hero => hero.id === slot.heroId)?.name : 'Add Axie'}</strong><small>{slot.military ? `${slot.military} · ${slot.militaryCount}` : slot.heroId ? (activeFormation.leader === slot.heroId ? 'Leader' : 'Axie') : 'Add military'}</small></button>)}</div>)}</div>
        <small className="formation-help">Assign Axies or military units to the hexes, then choose one placed Axie as leader.</small>
        <button className="primary assignment-done" onClick={closePopup}>Save formation</button>
      </> : <>
        <div className="catalog-heading"><div><span className="eyebrow">{popup === 'slot' ? 'FORMATION SLOT' : 'ASSIGN AXIE'}</span><h3>{popup === 'scout' ? 'Scout position' : popup === 'defense' ? 'Defense position' : popup === 'leader' ? 'Formation leader' : 'Assign slot'}</h3><small>{popup === 'scout' ? `${scouts.length}/3 positions filled` : popup === 'defense' ? `${defender ? 1 : 0}/1 position filled` : popup === 'leader' ? 'Choose from Axies already in this formation' : 'Choose an Axie or military units'}</small></div><button className="close" aria-label="Close assignment" onClick={closePopup}>&times;</button></div>
        <div className="resource-requirement"><span>◈</span><div><strong>Requires resources</strong><small>{popup === 'scout' ? '100 provisions per Scout position' : popup === 'defense' ? '250 stone to fill Defense' : '500 provisions + 250 war supplies per march'}</small></div><b>Static</b></div>
        {popup === 'slot' && editingSlot && <div className="slot-tabs" role="tablist" aria-label="Slot assignment type"><button role="tab" aria-selected={slotTab === 'axie'} className={slotTab === 'axie' ? 'active' : ''} onClick={() => setSlotTab('axie')}>Axie</button><button role="tab" aria-selected={slotTab === 'military'} className={slotTab === 'military' ? 'active' : ''} onClick={() => setSlotTab('military')}>Military</button></div>}
        {popup === 'slot' && editingSlot && slotTab === 'military' && <div className="slot-military-list">{MILITARY_TYPES.map(type => { const current = militaryDraft; const selected = current.military === type; const info = MILITARY_INFO[type]; return <div className={`military-unit-row ${selected ? 'active' : ''}`} key={type}><button className="military-unit-select" onClick={() => setMilitaryDraft({ military: type, heroId: null, militaryCount: Math.min(info.available, current.militaryCount || 10) })}><span className="unit-type-icon">{info.icon}</span><span><strong>{type}</strong><small>Available: {info.available}</small><small>Resource consumption: {info.consumption}</small></span></button><label className="unit-count">Quantity<input type="number" min="0" max={info.available} value={selected ? current.militaryCount : 0} step="1" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addMilitary(); } }} onChange={event => setMilitaryDraft({ military: type, heroId: null, militaryCount: Math.max(0, Math.min(info.available, Math.floor(Number(event.target.value) || 0))) })} /></label></div>; })}</div>}
        {(popup !== 'slot' || slotTab === 'axie') && <div className="assignment-list">{(popup === 'leader' ? leaderCandidates : STARTER_HEROES).map(hero => { const assigned = activeHeroes.includes(hero.id); const unavailable = !assigned && popup === 'scout' && (defender === hero.id || allOffenseHeroes.has(hero.id)) ? (defender === hero.id ? 'Defense' : 'Offense') : !assigned && popup === 'defense' && (scouts.includes(hero.id) || allOffenseHeroes.has(hero.id)) ? (scouts.includes(hero.id) ? 'Scout' : 'Offense') : !assigned && popup === 'slot' && (scouts.includes(hero.id) || defender === hero.id || allOffenseHeroes.has(hero.id)) ? (scouts.includes(hero.id) ? 'Scout' : defender === hero.id ? 'Defense' : 'Offense') : undefined; return <AxieRow key={hero.id} hero={hero} assigned={assigned} unavailable={unavailable} onAssign={() => popup === 'scout' ? toggleScout(hero.id) : popup === 'defense' ? toggleDefense(hero.id) : popup === 'leader' ? assignLeader(hero.id) : assignSlotAxie(hero.id)} />; })}</div>}
        <div className="assignment-footer">{popup === 'scout' ? (scouts.length >= 3 ? 'Scout capacity reached.' : 'Up to 3 Axies can scout at once.') : popup === 'defense' ? (defender ? 'Defense position filled.' : 'Only 1 Axie can hold Defense.') : popup === 'leader' ? 'One leader commands this formation.' : 'Choose Infantry or Archers, enter a quantity, then tap Update.'}</div>
        <div className="placement-actions">
          <button className="secondary" onClick={() => popup === 'slot' || popup === 'leader' ? setPopup('offense') : closePopup()}>{popup === 'slot' || popup === 'leader' ? 'Back to formation' : 'Done'}</button>
          {popup === 'slot' && slotTab === 'military' && <button className="primary" disabled={!militaryDraft.military || militaryDraft.militaryCount <= 0} onClick={addMilitary}>Update</button>}
        </div>
      </>}
    </section></div>}
  </section>;
}
