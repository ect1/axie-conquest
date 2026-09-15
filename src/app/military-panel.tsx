"use client";

import { useEffect, useState } from 'react';
import { TROOP_DEFINITIONS, Troops } from '@/game/base';
import { AXIE_CLASSES, AxieClass } from '@/game/heroes';
import { ApiAxie } from '@/game/axie-roster';
import { createEmptyFormation, Formation, FormationMilitaryKind, FormationSlot, formationAssignment, formationSlots, getFormationTroopCounts, getFormationsTroopCounts, setFormationAssignment } from '@/game/offense-formations';
import { createHexGridSlots } from '@/game/hex-grid';
import { BATTLE_SETTINGS_SAVE_KEY, DEFAULT_BATTLE_SETTINGS, restoreActiveBattleSettings } from '@/game/battle-settings';

import { WorldUnit, settleUnit } from '@/game/units';

type Section = 'scout' | 'defense' | 'offense' | 'leader' | 'slot' | null;
type MilitaryPanelProps = { troops: Troops; units: readonly WorldUnit[]; cityId: string; now: number; axies: readonly ApiAxie[]; deployedIds: readonly string[]; formations: Formation[]; onFormationsChange: React.Dispatch<React.SetStateAction<Formation[]>>; onClose: () => void };
const emptySlot = (): FormationSlot => ({ heroId: null, military: null, militaryCount: 0 });
const MILITARY_TYPES: FormationMilitaryKind[] = ['infantry', 'archer'];
const MILITARY_DETAILS: Record<FormationMilitaryKind, { consumption: string; icon: string }> = {
  infantry: { consumption: '2 provisions / hr', icon: '⚔' },
  archer: { consumption: '3 provisions / hr', icon: '➶' },
};

function AxieRow({ hero, assigned, unavailable, onAssign }: { hero: ApiAxie; assigned: boolean; unavailable?: string; onAssign: () => void }) {
  const style = AXIE_CLASSES[hero.class.toLowerCase() as AxieClass] ?? AXIE_CLASSES.beast;
  return <button className={`assignment-row ${assigned ? 'assigned' : ''} ${unavailable ? 'unavailable' : ''}`} onClick={onAssign} disabled={!!unavailable} aria-pressed={assigned}>
    <span className="scout-axie-mark" style={{ '--axie-color': style.color, '--axie-accent': style.accent } as React.CSSProperties}>{style.name.slice(0, 1)}</span>
    <span className="assignment-copy"><strong>{hero.name}</strong><small>{style.name} · {style.role}</small></span><span className="assignment-action">{assigned ? 'Unassign' : unavailable || 'Assign'}</span>
  </button>;
}

export default function MilitaryPanel({ troops, units, cityId, now, axies, deployedIds, formations, onFormationsChange, onClose }: MilitaryPanelProps) {
  const [popup, setPopup] = useState<Section>(null);
  const [scouts, setScouts] = useState<string[]>([]);
  const [defender, setDefender] = useState<string | null>(null);
  const [defenseMilitary, setDefenseMilitary] = useState<FormationSlot>(emptySlot());
  const [template, setTemplate] = useState(0);
  const [editingSlot, setEditingSlot] = useState<{ row: number; column: number } | null>(null);
  const [slotTab, setSlotTab] = useState<'axie' | 'military'>('axie');
  const [militaryDraft, setMilitaryDraft] = useState<FormationSlot>(emptySlot());
  const [teamGrid] = useState(() => typeof window === 'undefined' ? DEFAULT_BATTLE_SETTINGS : restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY)));
  // A resized board never leaves hidden assignments reserving an Axie or troops.
  useEffect(() => { onFormationsChange(current => current.map(formation => ({ ...formation, assignments: formation.assignments.filter(slot => slot.row < teamGrid.boardRows && slot.column < teamGrid.boardColumns) }))); }, [onFormationsChange, teamGrid.boardColumns, teamGrid.boardRows]);
  const activeFormation = formations[template];
  const teamHexSlots = createHexGridSlots({ columns: teamGrid.boardColumns, hexGap: teamGrid.boardHexGap * .22, bands: [{ id: 'team', rows: teamGrid.boardRows }] });
  const teamHexRows = Array.from({ length: teamGrid.boardRows }, (_, row) => ({ row, slots: teamHexSlots.filter(slot => slot.row === row) }));
  const activeFormationDeployed = units.some(unit => {
    const current = settleUnit(unit, now);
    return current.cityId === cityId && current.formationIndex === template && current.status !== 'home';
  });
  const assignedTroops = getFormationTroopCounts(activeFormation);
  const cityAssignedTroops = getFormationsTroopCounts(formations);
  const defenseTroopCounts = { infantry: defenseMilitary.military === 'infantry' ? defenseMilitary.militaryCount : 0, archer: defenseMilitary.military === 'archer' ? defenseMilitary.militaryCount : 0 };
  const currentEditingCount = (kind: FormationMilitaryKind) => editingSlot
    ? (formationAssignment(activeFormation, editingSlot.row, editingSlot.column).military === kind ? formationAssignment(activeFormation, editingSlot.row, editingSlot.column).militaryCount : 0)
    : popup === 'defense' && defenseMilitary.military === kind ? defenseMilitary.militaryCount : 0;
  const militaryInfo: Record<FormationMilitaryKind, { available: number; max: number; consumption: string; icon: string }> = {
    infantry: { ...MILITARY_DETAILS.infantry, available: Math.max(0, troops.infantry - cityAssignedTroops.infantry - defenseTroopCounts.infantry), max: Math.max(0, troops.infantry - cityAssignedTroops.infantry - defenseTroopCounts.infantry + currentEditingCount('infantry')) },
    archer: { ...MILITARY_DETAILS.archer, available: Math.max(0, troops.archer - cityAssignedTroops.archer - defenseTroopCounts.archer), max: Math.max(0, troops.archer - cityAssignedTroops.archer - defenseTroopCounts.archer + currentEditingCount('archer')) },
  };
  const formationHeroIds = new Set(formationSlots(activeFormation).map(slot => slot.heroId).filter(Boolean));
  const deployedHeroes = axies.filter(hero => deployedIds.includes(hero.id));
  const leaderCandidates = deployedHeroes.filter(hero => formationHeroIds.has(hero.id));
  const activeHeroes = popup === 'scout' ? scouts : popup === 'defense' ? (defender ? [defender] : []) : popup === 'slot' && editingSlot ? (formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId ? [formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId!] : []) : activeFormation.leader ? [activeFormation.leader] : [];
  const allFormationHeroes = formations.flatMap(formation => formationSlots(formation).map(slot => slot.heroId).concat(formation.leader)).filter(Boolean) as string[];
  const allOffenseHeroes = new Set([...allFormationHeroes]);
  const toggleScout = (id: string) => setScouts(current => current.includes(id) ? current.filter(heroId => heroId !== id) : current.length < 3 ? [...current, id] : current);
  const toggleDefense = (id: string) => setDefender(current => current === id ? null : current || id);
  const assignLeader = (id: string) => {
    if (activeFormationDeployed) return;
    onFormationsChange(current => current.map((formation, index) => {
      if (index !== template || !formationSlots(formation).some(slot => slot.heroId === id)) return formation;
      return { ...formation, leader: formation.leader === id ? null : id };
    }));
    setPopup('offense');
  };
  const closePopup = () => setPopup(null);
  const openFormation = () => setPopup('offense');
  const updateFormation = (row: number, column: number, value: FormationSlot) => onFormationsChange(current => current.map((formation, formationIndex) => {
    if (formationIndex !== template || activeFormationDeployed) return formation;
    const next = setFormationAssignment(formation, row, column, value);
    if (!formationSlots(next).some(slot => slot.heroId === next.leader)) next.leader = null;
    return next;
  }));
  const clearFormation = () => { if (!activeFormationDeployed) onFormationsChange(current => current.map((formation, index) => index === template ? createEmptyFormation() : formation)); };
  const assignSlotAxie = (id: string) => {
    if (!editingSlot) return;
    const currentSlot = formationAssignment(activeFormation, editingSlot.row, editingSlot.column);
    updateFormation(editingSlot.row, editingSlot.column, currentSlot.heroId === id ? emptySlot() : { heroId: id, military: null, militaryCount: 0 });
    setPopup('offense');
  };
  const openSlot = (row: number, column: number) => {
    if (activeFormationDeployed) return;
    setEditingSlot({ row, column }); setMilitaryDraft({ ...formationAssignment(activeFormation, row, column) }); setSlotTab('axie'); setPopup('slot');
  };

  const addMilitary = () => {
    if (!editingSlot || !militaryDraft.military || !Number.isSafeInteger(militaryDraft.militaryCount) || militaryDraft.militaryCount < 0 || militaryDraft.militaryCount > militaryInfo[militaryDraft.military].max) return;
    updateFormation(editingSlot.row, editingSlot.column, militaryDraft.militaryCount === 0 ? emptySlot() : { ...militaryDraft, heroId: null });
  };
  const addDefenseMilitary = () => {
    if (!militaryDraft.military || !Number.isSafeInteger(militaryDraft.militaryCount) || militaryDraft.militaryCount < 0 || militaryDraft.militaryCount > militaryInfo[militaryDraft.military].max) return;
    setDefenseMilitary(militaryDraft.militaryCount === 0 ? emptySlot() : { ...militaryDraft, heroId: null });
  };
  const openDefense = () => {
    setEditingSlot(null);
    setMilitaryDraft({ ...defenseMilitary });
    setSlotTab('axie');
    setPopup('defense');
  };

  return <section className="military panel" aria-label="Military command">
    <div className="catalog-heading"><div><span className="eyebrow">COMMAND &amp; PROTECT</span><h2>Military</h2><small>Choose a command position to assign an Axie.</small></div><button className="close" aria-label="Close military" onClick={onClose}>&times;</button></div>
    <div className="military-cards">
      <button className="military-card scout-card" onClick={() => setPopup('scout')}><span className="military-card-icon">⌁</span><span><strong>Scout</strong><small>{scouts.length}/3 Axies assigned · Tap to manage</small></span><span className="card-chevron">›</span></button>
      <button className="military-card defense-card" onClick={openDefense}><span className="military-card-icon">▥</span><span><strong>Defense</strong><small>{defender ? '1/1 Axie assigned' : '0/1 Axies assigned'}{defenseMilitary.military ? ` · ${TROOP_DEFINITIONS[defenseMilitary.military].name} ${defenseMilitary.militaryCount}` : ''} · Includes walls</small></span><span className="card-chevron">›</span></button>
      <button className="military-card offense-card" onClick={openFormation}><span className="military-card-icon">⚔</span><span><strong>Offense</strong><small>Formation {template + 1} · Leader {activeFormation.leader ? 'assigned' : 'empty'} · {assignedTroops.infantry + assignedTroops.archer} military assigned</small></span><span className="card-chevron">›</span></button>
    </div>
    <div className="military-note">Scout, Defense, and Offense use static resource requirements for now.</div>
    {popup && <div className="assignment-backdrop" role="presentation" onClick={closePopup}><section className={`assignment-popup ${popup === 'offense' ? 'formation-popup' : ''}`} role="dialog" aria-modal="true" aria-label={`Manage ${popup}`} onClick={event => event.stopPropagation()}>
      {popup === 'offense' ? <>
        <div className="catalog-heading"><div><span className="eyebrow">OFFENSE FORMATION</span><h3>March formation {template + 1}</h3><small>{teamGrid.boardColumns} columns · {teamGrid.boardRows} rows · Every visible hex is assignable</small></div><button className="close" aria-label="Close formation" onClick={closePopup}>&times;</button></div>
        <div className="template-tabs" role="tablist" aria-label="Formations">{[0, 1, 2].map(index => <button key={index} role="tab" aria-selected={template === index} className={template === index ? 'active' : ''} onClick={() => setTemplate(index)}>Formation {index + 1}</button>)}</div>
        <div className="resource-requirement"><span>◈</span><div><strong>Requires resources</strong><small>500 provisions + 250 war supplies to prepare this march</small></div><b>Static</b></div>
        {activeFormationDeployed && <div className="military-note" role="status">This formation is outside the city. Return it to base before changing its leader or members.</div>}
        <div className="leader-slot"><span className="formation-label">LEADER</span><strong>{activeFormation.leader ? axies.find(hero => hero.id === activeFormation.leader)?.name : 'No leader assigned'}</strong><small>{activeFormationDeployed ? 'Locked while this formation is deployed' : leaderCandidates.length ? 'Choose an Axie in this formation; tap the current leader to unassign' : 'Place an Axie in a slot first'}</small><button className="secondary" disabled={activeFormationDeployed || !leaderCandidates.length} onClick={() => setPopup('leader')}>{activeFormation.leader ? 'Change leader' : 'Assign leader'}</button>{activeFormation.leader && <button className="secondary" disabled={activeFormationDeployed} onClick={() => assignLeader(activeFormation.leader!)}>Unassign leader</button>}</div>
        <div className="formation-board shared-team-board" style={{ '--formation-columns': teamGrid.boardColumns } as React.CSSProperties}><span className="formation-edge-label formation-edge-front">Front</span>{teamHexRows.map(({ row, slots }) => <div className={`formation-row ${row % 2 ? 'hex-row-shifted' : ''}`} key={row}>{slots.map(gridSlot => { const slot = formationAssignment(activeFormation, row, gridSlot.column); return <button disabled={activeFormationDeployed} className={`formation-slot ${slot.heroId || slot.military ? 'filled' : ''} ${slot.heroId && activeFormation.leader === slot.heroId ? 'leader-slot-hex' : ''}`} key={gridSlot.id} onClick={() => openSlot(row, gridSlot.column)} aria-label={`Formation hex row ${row + 1}, column ${gridSlot.column + 1}`}><strong>{slot.heroId ? axies.find(hero => hero.id === slot.heroId)?.name : slot.military ? TROOP_DEFINITIONS[slot.military].name : 'Add Axie'}</strong><small>{slot.military ? `${slot.militaryCount} assigned` : slot.heroId ? (activeFormation.leader === slot.heroId ? 'Leader' : 'Axie') : 'Add military'}</small></button>; })}</div>)}<span className="formation-edge-label formation-edge-back">Back</span></div>
        <small className="formation-help">Only Axies deployed in town can join. Assign Axies or trained military units to the hexes, then choose one placed Axie as leader.</small>
        <div className="placement-actions"><button className="secondary" disabled={activeFormationDeployed} onClick={clearFormation}>Clear formation</button><button className="primary assignment-done" onClick={closePopup}>Save formation</button></div>
      </> : <>
        <div className="catalog-heading"><div><span className="eyebrow">{popup === 'slot' ? 'FORMATION SLOT' : 'ASSIGN AXIE'}</span><h3>{popup === 'scout' ? 'Scout position' : popup === 'defense' ? 'Defense position' : popup === 'leader' ? 'Formation leader' : 'Assign slot'}</h3><small>{popup === 'scout' ? `${scouts.length}/3 positions filled` : popup === 'defense' ? `${defender ? 1 : 0}/1 position filled` : popup === 'leader' ? 'Choose from Axies already in this formation' : 'Choose an Axie or military units'}</small></div><button className="close" aria-label="Close assignment" onClick={closePopup}>&times;</button></div>
        <div className="resource-requirement"><span>◈</span><div><strong>Requires resources</strong><small>{popup === 'scout' ? '100 provisions per Scout position' : popup === 'defense' ? '250 stone to fill Defense' : '500 provisions + 250 war supplies per march'}</small></div><b>Static</b></div>
        {(popup === 'defense' || (popup === 'slot' && editingSlot)) && <div className="slot-tabs" role="tablist" aria-label="Assignment type"><button role="tab" aria-selected={slotTab === 'axie'} className={slotTab === 'axie' ? 'active' : ''} onClick={() => setSlotTab('axie')}>Axie</button><button role="tab" aria-selected={slotTab === 'military'} className={slotTab === 'military' ? 'active' : ''} onClick={() => setSlotTab('military')}>Military</button></div>}
        {(popup === 'defense' || (popup === 'slot' && editingSlot)) && slotTab === 'military' && <div className="slot-military-list">{MILITARY_TYPES.map(type => { const current = militaryDraft; const selected = current.military === type; const info = militaryInfo[type]; return <div className={`military-unit-row ${selected ? 'active' : ''}`} key={type}><button className="military-unit-select" disabled={!info.max} onClick={() => setMilitaryDraft({ military: type, heroId: null, militaryCount: Math.min(info.max, current.militaryCount || 10) })}><span className="unit-type-icon">{info.icon}</span><span><strong>{TROOP_DEFINITIONS[type].name}</strong><small>Available: {info.available}</small><small>Resource consumption: {info.consumption}</small></span></button><label className="unit-count">Quantity<input type="number" min="0" max={info.max} disabled={!info.max} value={selected ? current.militaryCount : 0} step="1" onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); popup === 'defense' ? addDefenseMilitary() : addMilitary(); } }} onChange={event => setMilitaryDraft({ military: type, heroId: null, militaryCount: Math.max(0, Math.min(info.max, Math.floor(Number(event.target.value) || 0))) })} /></label></div>; })}</div>}
        {(popup !== 'slot' && popup !== 'defense' || slotTab === 'axie') && <div className="assignment-list">{(popup === 'leader' ? leaderCandidates : deployedHeroes).map(hero => { const assigned = activeHeroes.includes(hero.id); const unavailable = !assigned && popup === 'scout' && (defender === hero.id || allOffenseHeroes.has(hero.id)) ? (defender === hero.id ? 'Defense' : 'Offense') : !assigned && popup === 'defense' && (scouts.includes(hero.id) || allOffenseHeroes.has(hero.id)) ? (scouts.includes(hero.id) ? 'Scout' : 'Offense') : !assigned && popup === 'slot' && (scouts.includes(hero.id) || defender === hero.id || allOffenseHeroes.has(hero.id)) ? (scouts.includes(hero.id) ? 'Scout' : defender === hero.id ? 'Defense' : 'Offense') : undefined; return <AxieRow key={hero.id} hero={hero} assigned={assigned} unavailable={unavailable} onAssign={() => popup === 'scout' ? toggleScout(hero.id) : popup === 'defense' ? toggleDefense(hero.id) : popup === 'leader' ? assignLeader(hero.id) : assignSlotAxie(hero.id)} />; })}{!deployedHeroes.length && <div className="empty-state"><strong>No Axies deployed in town</strong><p>Deploy an Axie from the Axies HUD before assigning it.</p></div>}</div>}
        <div className="assignment-footer">{popup === 'scout' ? (scouts.length >= 3 ? 'Scout capacity reached.' : 'Up to 3 Axies can scout at once.') : popup === 'defense' ? (slotTab === 'military' ? 'Choose Infantry or Archers, enter a quantity, then tap Update.' : defender ? 'Defense position filled.' : 'Only 1 Axie can hold Defense.') : popup === 'leader' ? 'Tap the assigned leader to unassign it.' : slotTab === 'axie' ? 'Tap the assigned Axie to remove it from this hex.' : 'Choose Infantry or Archers, enter a quantity, then tap Update.'}</div>
        <div className="placement-actions">
          {popup === 'slot' && editingSlot && (formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId || formationAssignment(activeFormation, editingSlot.row, editingSlot.column).military) && <button className="secondary" onClick={() => { updateFormation(editingSlot.row, editingSlot.column, emptySlot()); setMilitaryDraft(emptySlot()); setPopup('offense'); }}>Unassign {formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId ? 'Axie' : 'military'}</button>}
          {popup === 'leader' && activeFormation.leader && <button className="secondary" onClick={() => assignLeader(activeFormation.leader!)}>Unassign leader</button>}
          <button className="secondary" onClick={() => popup === 'slot' || popup === 'leader' ? setPopup('offense') : closePopup()}>{popup === 'slot' || popup === 'leader' ? 'Back to formation' : 'Done'}</button>
          {popup === 'slot' && slotTab === 'military' && <button className="primary" disabled={!militaryDraft.military} onClick={addMilitary}>Update</button>}
          {popup === 'defense' && slotTab === 'military' && <button className="primary" disabled={!militaryDraft.military} onClick={addDefenseMilitary}>Update</button>}
        </div>
      </>}
    </section></div>}
  </section>;
}
