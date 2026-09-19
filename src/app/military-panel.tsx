"use client";

import { useEffect, useState } from 'react';
import { TROOP_DEFINITIONS, Troops } from '@/game/base';
import { AXIE_CLASSES, AxieClass } from '@/game/heroes';
import { ApiAxie } from '@/game/axie-roster';
import {
  createEmptyFormation,
  Formation,
  FormationMilitaryKind,
  FormationSlot,
  formationAssignment,
  formationSlots,
  getFormationTroopCounts,
  getFormationsTroopCounts,
  setFormationAssignment,
} from '@/game/offense-formations';
import { createHexGridSlots } from '@/game/hex-grid';
import { BATTLE_SETTINGS_SAVE_KEY, DEFAULT_BATTLE_SETTINGS, restoreActiveBattleSettings } from '@/game/battle-settings';
import { WorldUnit, settleUnit } from '@/game/units';
import {
  CityRepairState,
  calculateRepairCost,
  calculateRepairRate,
  getCityHallRepairLevelConfig,
  createDefaultRepairState,
} from '@/game/repair-service';
import { RepairConfig, DEFAULT_REPAIR_CONFIG } from '@/game/game-config';

type Section = 'repair' | 'offense' | 'leader' | 'slot' | null;

type MilitaryPanelProps = {
  troops: Troops;
  units: readonly WorldUnit[];
  cityId: string;
  now: number;
  axies: readonly ApiAxie[];
  deployedIds: readonly string[];
  formations: Formation[];
  onFormationsChange: React.Dispatch<React.SetStateAction<Formation[]>>;
  onClose: () => void;
  repairState?: CityRepairState;
  onRepairStateChange?: (updater: (prev: CityRepairState) => CityRepairState) => void;
  cityHallLevel?: number;
  repairConfig?: RepairConfig;
  cityHealth?: number;
  maxCityHealth?: number;
};

const emptySlot = (): FormationSlot => ({ heroId: null, military: null, militaryCount: 0 });
const MILITARY_TYPES: FormationMilitaryKind[] = ['infantry', 'archer'];
const MILITARY_DETAILS: Record<FormationMilitaryKind, { consumption: string; icon: string }> = {
  infantry: { consumption: '2 provisions / hr', icon: '⚔' },
  archer: { consumption: '3 provisions / hr', icon: '➶' },
};

function AxieRow({
  hero,
  assigned,
  unavailable,
  onAssign,
}: {
  hero: ApiAxie;
  assigned: boolean;
  unavailable?: string;
  onAssign: () => void;
}) {
  const style = AXIE_CLASSES[hero.class.toLowerCase() as AxieClass] ?? AXIE_CLASSES.beast;
  return (
    <button
      className={`assignment-row ${assigned ? 'assigned' : ''} ${unavailable ? 'unavailable' : ''}`}
      onClick={onAssign}
      disabled={!!unavailable}
      aria-pressed={assigned}
    >
      <span
        className="scout-axie-mark"
        style={{ '--axie-color': style.color, '--axie-accent': style.accent } as React.CSSProperties}
      >
        {style.name.slice(0, 1)}
      </span>
      <span className="assignment-copy">
        <strong>{hero.name}</strong>
        <small>{style.name} · {style.role}</small>
      </span>
      <span className="assignment-action">{assigned ? 'Unassign' : unavailable || 'Assign'}</span>
    </button>
  );
}

export default function MilitaryPanel({
  troops,
  units,
  cityId,
  now,
  axies,
  deployedIds,
  formations,
  onFormationsChange,
  onClose,
  repairState = createDefaultRepairState(),
  onRepairStateChange,
  cityHallLevel = 1,
  repairConfig = DEFAULT_REPAIR_CONFIG,
  cityHealth = 10000,
  maxCityHealth = 10000,
}: MilitaryPanelProps) {
  const [popup, setPopup] = useState<Section>(null);
  const [template, setTemplate] = useState(0);
  const [editingSlot, setEditingSlot] = useState<{ row: number; column: number } | null>(null);
  const [slotTab, setSlotTab] = useState<'axie' | 'military'>('axie');
  const [militaryDraft, setMilitaryDraft] = useState<FormationSlot>(emptySlot());
  const [teamGrid] = useState(() =>
    typeof window === 'undefined'
      ? DEFAULT_BATTLE_SETTINGS
      : restoreActiveBattleSettings(localStorage.getItem(BATTLE_SETTINGS_SAVE_KEY))
  );

  // A resized board never leaves hidden assignments reserving an Axie or troops.
  useEffect(() => {
    onFormationsChange(current =>
      current.map(formation => ({
        ...formation,
        assignments: formation.assignments.filter(
          slot => slot.row < teamGrid.boardRows && slot.column < teamGrid.boardColumns
        ),
      }))
    );
  }, [onFormationsChange, teamGrid.boardColumns, teamGrid.boardRows]);

  const activeFormation = formations[template];
  const teamHexSlots = createHexGridSlots({
    columns: teamGrid.boardColumns,
    hexGap: teamGrid.boardHexGap * 0.22,
    bands: [{ id: 'team', rows: teamGrid.boardRows }],
  });
  const teamHexRows = Array.from({ length: teamGrid.boardRows }, (_, row) => ({
    row,
    slots: teamHexSlots.filter(slot => slot.row === row),
  }));

  const activeFormationDeployed = units.some(unit => {
    const current = settleUnit(unit, now);
    return current.cityId === cityId && current.formationIndex === template && current.status !== 'home';
  });

  const assignedTroops = getFormationTroopCounts(activeFormation);
  const cityAssignedTroops = getFormationsTroopCounts(formations);

  const currentEditingCount = (kind: FormationMilitaryKind) =>
    editingSlot
      ? formationAssignment(activeFormation, editingSlot.row, editingSlot.column).military === kind
        ? formationAssignment(activeFormation, editingSlot.row, editingSlot.column).militaryCount
        : 0
      : 0;

  const militaryInfo: Record<FormationMilitaryKind, { available: number; max: number; consumption: string; icon: string }> = {
    infantry: {
      ...MILITARY_DETAILS.infantry,
      available: Math.max(0, troops.infantry - cityAssignedTroops.infantry),
      max: Math.max(0, troops.infantry - cityAssignedTroops.infantry + currentEditingCount('infantry')),
    },
    archer: {
      ...MILITARY_DETAILS.archer,
      available: Math.max(0, troops.archer - cityAssignedTroops.archer),
      max: Math.max(0, troops.archer - cityAssignedTroops.archer + currentEditingCount('archer')),
    },
  };

  const formationHeroIds = new Set(formationSlots(activeFormation).map(slot => slot.heroId).filter(Boolean));
  const deployedHeroes = axies.filter(hero => deployedIds.includes(hero.id));
  const leaderCandidates = deployedHeroes.filter(hero => formationHeroIds.has(hero.id));

  const otherOffenseHeroes = new Set(
    formations
      .flatMap((formation, index) =>
        index !== template ? formationSlots(formation).map(slot => slot.heroId).concat(formation.leader) : []
      )
      .filter(Boolean) as string[]
  );

  const levelConfig = getCityHallRepairLevelConfig(repairConfig, cityHallLevel);
  const maxAssignableAxies = levelConfig.maxAssignableAxies;
  const repairRate = calculateRepairRate(repairConfig, cityHallLevel, repairState.assignedAxieIds.length);
  const repairCost = calculateRepairCost(repairConfig, cityHallLevel, 100);

  const assignLeader = (id: string) => {
    if (activeFormationDeployed) return;
    onFormationsChange(current =>
      current.map((formation, index) => {
        if (index !== template || !formationSlots(formation).some(slot => slot.heroId === id)) return formation;
        return { ...formation, leader: formation.leader === id ? null : id };
      })
    );
    if (repairState.assignedAxieIds.includes(id)) {
      onRepairStateChange?.(prev => ({
        ...prev,
        assignedAxieIds: prev.assignedAxieIds.filter(axieId => axieId !== id),
      }));
    }
    setPopup('offense');
  };

  const closePopup = () => setPopup(null);
  const openFormation = () => setPopup('offense');
  const openRepair = () => setPopup('repair');

  const updateFormation = (row: number, column: number, value: FormationSlot) =>
    onFormationsChange(current =>
      current.map((formation, formationIndex) => {
        if (formationIndex !== template || activeFormationDeployed) return formation;
        const next = setFormationAssignment(formation, row, column, value);
        if (!formationSlots(next).some(slot => slot.heroId === next.leader)) next.leader = null;
        return next;
      })
    );

  const clearFormation = () => {
    if (!activeFormationDeployed) {
      onFormationsChange(current => current.map((formation, index) => (index === template ? createEmptyFormation() : formation)));
    }
  };

  const assignSlotAxie = (id: string) => {
    if (!editingSlot) return;
    const currentSlot = formationAssignment(activeFormation, editingSlot.row, editingSlot.column);
    const willAssign = currentSlot.heroId !== id;
    updateFormation(
      editingSlot.row,
      editingSlot.column,
      willAssign ? { heroId: id, military: null, militaryCount: 0 } : emptySlot()
    );
    if (willAssign && repairState.assignedAxieIds.includes(id)) {
      onRepairStateChange?.(prev => ({
        ...prev,
        assignedAxieIds: prev.assignedAxieIds.filter(axieId => axieId !== id),
      }));
    }
    setPopup('offense');
  };

  const openSlot = (row: number, column: number) => {
    if (activeFormationDeployed) return;
    setEditingSlot({ row, column });
    setMilitaryDraft({ ...formationAssignment(activeFormation, row, column) });
    setSlotTab('axie');
    setPopup('slot');
  };

  const addMilitary = () => {
    if (
      !editingSlot ||
      !militaryDraft.military ||
      !Number.isSafeInteger(militaryDraft.militaryCount) ||
      militaryDraft.militaryCount < 0 ||
      militaryDraft.militaryCount > militaryInfo[militaryDraft.military].max
    )
      return;
    updateFormation(
      editingSlot.row,
      editingSlot.column,
      militaryDraft.militaryCount === 0 ? emptySlot() : { ...militaryDraft, heroId: null }
    );
  };

  return (
    <section className="military panel" aria-label="Military command">
      <div className="catalog-heading">
        <div>
          <span className="eyebrow">COMMAND &amp; PROTECT</span>
          <h2>Military</h2>
          <small>Choose a command position to assign an Axie.</small>
        </div>
        <button className="close" aria-label="Close military" onClick={onClose}>
          &times;
        </button>
      </div>

      <div className="military-cards">
        <button className="military-card repair-card" onClick={openRepair}>
          <span className="military-card-icon">🛠️</span>
          <span>
            <strong>Repair</strong>
            <small>
              {repairState.assignedAxieIds.length}/{maxAssignableAxies} Axies assigned · Auto: {repairState.autoRepair ? 'ON' : 'OFF'}
              {repairRate > 0 ? ` · +${repairRate} HP/s` : ''}
            </small>
          </span>
          <span className="card-chevron">›</span>
        </button>
        <button className="military-card offense-card" onClick={openFormation}>
          <span className="military-card-icon">⚔</span>
          <span>
            <strong>Offense</strong>
            <small>
              Formation {template + 1} · Leader {activeFormation.leader ? 'assigned' : 'empty'} ·{' '}
              {assignedTroops.infantry + assignedTroops.archer} military assigned
            </small>
          </span>
          <span className="card-chevron">›</span>
        </button>
      </div>

      <div className="military-note">Repair and Offense formations update in real time.</div>

      {popup && (
        <div className="assignment-backdrop" role="presentation" onClick={closePopup}>
          <section
            className={`assignment-popup ${popup === 'offense' ? 'formation-popup' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${popup}`}
            onClick={event => event.stopPropagation()}
          >
            {popup === 'repair' ? (
              <>
                <div className="catalog-heading">
                  <div>
                    <span className="eyebrow">SETTLEMENT ENGINEERING · CITY HALL LV {cityHallLevel}</span>
                    <h3>Base &amp; Building Repair</h3>
                    <small>
                      {repairState.assignedAxieIds.length}/{maxAssignableAxies} Axie repair slots filled · Rate: +{repairRate} HP/s
                    </small>
                  </div>
                  <button className="close" aria-label="Close repair" onClick={closePopup}>
                    &times;
                  </button>
                </div>

                <div className="repair-toggle-banner">
                  <label className="repair-checkbox-label">
                    <input
                      type="checkbox"
                      checked={repairState.autoRepair}
                      onChange={e => {
                        const checked = e.target.checked;
                        onRepairStateChange?.(prev => ({ ...prev, autoRepair: checked }));
                      }}
                    />
                    <div>
                      <strong>Auto-repair damaged base &amp; buildings</strong>
                      <small>When enabled, assigned Axies automatically repair damage using Wood &amp; Stone.</small>
                    </div>
                  </label>
                </div>

                <div className="repair-status-box">
                  <div className="repair-status-row">
                    <span>City Base Health</span>
                    <strong>
                      {Math.round(cityHealth)} / {maxCityHealth} HP ({Math.round((cityHealth / maxCityHealth) * 100)}%)
                    </strong>
                  </div>
                  <div className="repair-health-bar">
                    <div
                      className="repair-health-fill"
                      style={{
                        width: `${Math.max(0, Math.min(100, (cityHealth / maxCityHealth) * 100))}%`,
                        backgroundColor: cityHealth / maxCityHealth > 0.5 ? '#22c55e' : '#ef4444',
                      }}
                    />
                  </div>
                  <div className="repair-status-details">
                    <span>⚡ Speed: <strong>+{repairRate} HP/s</strong></span>
                    <span>🪵 Wood cost: <strong>{repairCost.wood} / 100 HP</strong></span>
                    <span>🪨 Stone cost: <strong>{repairCost.stone} / 100 HP</strong></span>
                  </div>
                  {cityHallLevel < 3 && (
                    <div className="repair-upgrade-hint">
                      <small>
                        💡 Upgrade City Hall to Lv {cityHallLevel + 1} to unlock {cityHallLevel + 1} Axie repair slots and higher repair speed.
                      </small>
                    </div>
                  )}
                </div>

                <div className="catalog-heading" style={{ marginTop: '12px' }}>
                  <div>
                    <span className="eyebrow">ASSIGN REPAIR CREW</span>
                    <small>Choose up to {maxAssignableAxies} Axie(s) deployed in town</small>
                  </div>
                </div>

                <div className="assignment-list">
                  {deployedHeroes.map(hero => {
                    const assigned = repairState.assignedAxieIds.includes(hero.id);
                    const isMarching = units.some(u => {
                      const s = settleUnit(u, now);
                      return s.cityId === cityId && s.status !== 'home' && s.members.some(m => m.heroId === hero.id);
                    });
                    const slotsFull = !assigned && repairState.assignedAxieIds.length >= maxAssignableAxies;
                    const unavailable = assigned
                      ? undefined
                      : isMarching
                      ? 'Marching'
                      : slotsFull
                      ? 'Slots Full'
                      : undefined;

                    return (
                      <AxieRow
                        key={hero.id}
                        hero={hero}
                        assigned={assigned}
                        unavailable={unavailable}
                        onAssign={() => {
                          const willAssign = !assigned;
                          onRepairStateChange?.(prev => {
                            const isAssigned = prev.assignedAxieIds.includes(hero.id);
                            if (isAssigned) {
                              return { ...prev, assignedAxieIds: prev.assignedAxieIds.filter(id => id !== hero.id) };
                            }
                            if (prev.assignedAxieIds.length >= maxAssignableAxies) return prev;
                            return { ...prev, assignedAxieIds: [...prev.assignedAxieIds, hero.id] };
                          });
                          if (willAssign) {
                            onFormationsChange(current =>
                              current.map(formation => {
                                const hasSlot = formationSlots(formation).some(s => s.heroId === hero.id);
                                const isLead = formation.leader === hero.id;
                                if (!hasSlot && !isLead) return formation;
                                const assignments = formation.assignments.filter(slot => slot.heroId !== hero.id);
                                const leader = isLead ? null : formation.leader;
                                return { ...formation, leader, assignments };
                              })
                            );
                          }
                        }}
                      />
                    );
                  })}
                  {!deployedHeroes.length && (
                    <div className="empty-state">
                      <strong>No Axies deployed in town</strong>
                      <p>Deploy an Axie from the Axies HUD before assigning it to repairs.</p>
                    </div>
                  )}
                </div>

                <div className="assignment-footer">
                  {repairState.assignedAxieIds.length >= maxAssignableAxies
                    ? `Repair crew capacity reached (${maxAssignableAxies}/${maxAssignableAxies}).`
                    : `Up to ${maxAssignableAxies} Axie(s) can repair base at City Hall Lv ${cityHallLevel}.`}
                </div>

                <div className="placement-actions">
                  <button className="primary assignment-done" onClick={closePopup}>
                    Done
                  </button>
                </div>
              </>
            ) : popup === 'offense' ? (
              <>
                <div className="catalog-heading">
                  <div>
                    <span className="eyebrow">OFFENSE FORMATION</span>
                    <h3>March formation {template + 1}</h3>
                    <small>
                      {teamGrid.boardColumns} columns · {teamGrid.boardRows} rows · Every visible hex is assignable
                    </small>
                  </div>
                  <button className="close" aria-label="Close formation" onClick={closePopup}>
                    &times;
                  </button>
                </div>
                <div className="template-tabs" role="tablist" aria-label="Formations">
                  {[0, 1, 2].map(index => (
                    <button
                      key={index}
                      role="tab"
                      aria-selected={template === index}
                      className={template === index ? 'active' : ''}
                      onClick={() => setTemplate(index)}
                    >
                      Formation {index + 1}
                    </button>
                  ))}
                </div>
                <div className="resource-requirement">
                  <span>◈</span>
                  <div>
                    <strong>Requires resources</strong>
                    <small>500 provisions + 250 war supplies to prepare this march</small>
                  </div>
                  <b>Static</b>
                </div>
                {activeFormationDeployed && (
                  <div className="military-note" role="status">
                    This formation is outside the city. Return it to base before changing its leader or members.
                  </div>
                )}
                <div className="leader-slot">
                  <span className="formation-label">LEADER</span>
                  <strong>
                    {activeFormation.leader
                      ? axies.find(hero => hero.id === activeFormation.leader)?.name
                      : 'No leader assigned'}
                  </strong>
                  <small>
                    {activeFormationDeployed
                      ? 'Locked while this formation is deployed'
                      : leaderCandidates.length
                      ? 'Choose an Axie in this formation; tap the current leader to unassign'
                      : 'Place an Axie in a slot first'}
                  </small>
                  <button
                    className="secondary"
                    disabled={activeFormationDeployed || !leaderCandidates.length}
                    onClick={() => setPopup('leader')}
                  >
                    {activeFormation.leader ? 'Change leader' : 'Assign leader'}
                  </button>
                  {activeFormation.leader && (
                    <button
                      className="secondary"
                      disabled={activeFormationDeployed}
                      onClick={() => assignLeader(activeFormation.leader!)}
                    >
                      Unassign leader
                    </button>
                  )}
                </div>
                <div
                  className="formation-board shared-team-board"
                  style={{ '--formation-columns': teamGrid.boardColumns } as React.CSSProperties}
                >
                  <span className="formation-edge-label formation-edge-front">Front</span>
                  {teamHexRows.map(({ row, slots }) => (
                    <div className={`formation-row ${row % 2 ? 'hex-row-shifted' : ''}`} key={row}>
                      {slots.map(gridSlot => {
                        const slot = formationAssignment(activeFormation, row, gridSlot.column);
                        return (
                          <button
                            disabled={activeFormationDeployed}
                            className={`formation-slot ${slot.heroId || slot.military ? 'filled' : ''} ${
                              slot.heroId && activeFormation.leader === slot.heroId ? 'leader-slot-hex' : ''
                            }`}
                            key={gridSlot.id}
                            onClick={() => openSlot(row, gridSlot.column)}
                            aria-label={`Formation hex row ${row + 1}, column ${gridSlot.column + 1}`}
                          >
                            <strong>
                              {slot.heroId
                                ? axies.find(hero => hero.id === slot.heroId)?.name
                                : slot.military
                                ? TROOP_DEFINITIONS[slot.military].name
                                : 'Add Axie'}
                            </strong>
                            <small>
                              {slot.military
                                ? `${slot.militaryCount} assigned`
                                : slot.heroId
                                ? activeFormation.leader === slot.heroId
                                  ? 'Leader'
                                  : 'Axie'
                                : 'Add military'}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <span className="formation-edge-label formation-edge-back">Back</span>
                </div>
                <small className="formation-help">
                  Only Axies deployed in town can join. Assign Axies or trained military units to the hexes, then choose one placed
                  Axie as leader.
                </small>
                <div className="placement-actions">
                  <button className="secondary" disabled={activeFormationDeployed} onClick={clearFormation}>
                    Clear formation
                  </button>
                  <button className="primary assignment-done" onClick={closePopup}>
                    Save formation
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="catalog-heading">
                  <div>
                    <span className="eyebrow">{popup === 'slot' ? 'FORMATION SLOT' : 'ASSIGN AXIE'}</span>
                    <h3>{popup === 'leader' ? 'Formation leader' : 'Assign slot'}</h3>
                    <small>
                      {popup === 'leader'
                        ? 'Choose from Axies already in this formation'
                        : 'Choose an Axie or military units'}
                    </small>
                  </div>
                  <button className="close" aria-label="Close assignment" onClick={closePopup}>
                    &times;
                  </button>
                </div>
                <div className="resource-requirement">
                  <span>◈</span>
                  <div>
                    <strong>Requires resources</strong>
                    <small>500 provisions + 250 war supplies per march</small>
                  </div>
                  <b>Static</b>
                </div>
                {popup === 'slot' && editingSlot && (
                  <div className="slot-tabs" role="tablist" aria-label="Assignment type">
                    <button
                      role="tab"
                      aria-selected={slotTab === 'axie'}
                      className={slotTab === 'axie' ? 'active' : ''}
                      onClick={() => setSlotTab('axie')}
                    >
                      Axie
                    </button>
                    <button
                      role="tab"
                      aria-selected={slotTab === 'military'}
                      className={slotTab === 'military' ? 'active' : ''}
                      onClick={() => setSlotTab('military')}
                    >
                      Military
                    </button>
                  </div>
                )}
                {popup === 'slot' && editingSlot && slotTab === 'military' && (
                  <div className="slot-military-list">
                    {MILITARY_TYPES.map(type => {
                      const current = militaryDraft;
                      const selected = current.military === type;
                      const info = militaryInfo[type];
                      return (
                        <div className={`military-unit-row ${selected ? 'active' : ''}`} key={type}>
                          <button
                            className="military-unit-select"
                            disabled={!info.max}
                            onClick={() =>
                              setMilitaryDraft({
                                military: type,
                                heroId: null,
                                militaryCount: Math.min(info.max, current.militaryCount || 10),
                              })
                            }
                          >
                            <span className="unit-type-icon">{info.icon}</span>
                            <span>
                              <strong>{TROOP_DEFINITIONS[type].name}</strong>
                              <small>Available: {info.available}</small>
                              <small>Resource consumption: {info.consumption}</small>
                            </span>
                          </button>
                          <label className="unit-count">
                            Quantity
                            <input
                              type="number"
                              min="0"
                              max={info.max}
                              disabled={!info.max}
                              value={selected ? current.militaryCount : 0}
                              step="1"
                              onKeyDown={event => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addMilitary();
                                }
                              }}
                              onChange={event =>
                                setMilitaryDraft({
                                  military: type,
                                  heroId: null,
                                  militaryCount: Math.max(
                                    0,
                                    Math.min(info.max, Math.floor(Number(event.target.value) || 0))
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
                {((popup !== 'slot') || slotTab === 'axie') && (
                  <div className="assignment-list">
                    {(popup === 'leader' ? leaderCandidates : deployedHeroes).map(hero => {
                      const currentSlotHero = (popup === 'slot' && editingSlot)
                        ? formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId
                        : null;
                      const assigned = popup === 'leader' ? activeFormation.leader === hero.id : currentSlotHero === hero.id;
                      const inOtherSlotInThisTeam = !assigned && popup === 'slot' && formationHeroIds.has(hero.id);
                      const inOtherFormation = !assigned && otherOffenseHeroes.has(hero.id);
                      const isMarching = units.some(u => {
                        const s = settleUnit(u, now);
                        return s.cityId === cityId && s.status !== 'home' && s.members.some(m => m.heroId === hero.id);
                      });
                      const inRepair = !assigned && repairState.assignedAxieIds.includes(hero.id);
                      const unavailable = assigned
                        ? undefined
                        : isMarching
                        ? 'Marching'
                        : inOtherSlotInThisTeam
                        ? 'In Team'
                        : inOtherFormation
                        ? 'Offense'
                        : inRepair
                        ? 'Repair'
                        : undefined;

                      return (
                        <AxieRow
                          key={hero.id}
                          hero={hero}
                          assigned={assigned}
                          unavailable={unavailable}
                          onAssign={() => (popup === 'leader' ? assignLeader(hero.id) : assignSlotAxie(hero.id))}
                        />
                      );
                    })}
                    {!deployedHeroes.length && (
                      <div className="empty-state">
                        <strong>No Axies deployed in town</strong>
                        <p>Deploy an Axie from the Axies HUD before assigning it.</p>
                      </div>
                    )}
                  </div>
                )}
                <div className="assignment-footer">
                  {popup === 'leader'
                    ? 'Tap the assigned leader to unassign it.'
                    : slotTab === 'axie'
                    ? 'Tap the assigned Axie to remove it from this hex.'
                    : 'Choose Infantry or Archers, enter a quantity, then tap Update.'}
                </div>
                <div className="placement-actions">
                  {popup === 'slot' &&
                    editingSlot &&
                    (formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId ||
                      formationAssignment(activeFormation, editingSlot.row, editingSlot.column).military) && (
                      <button
                        className="secondary"
                        onClick={() => {
                          updateFormation(editingSlot.row, editingSlot.column, emptySlot());
                          setMilitaryDraft(emptySlot());
                          setPopup('offense');
                        }}
                      >
                        Unassign{' '}
                        {formationAssignment(activeFormation, editingSlot.row, editingSlot.column).heroId
                          ? 'Axie'
                          : 'military'}
                      </button>
                    )}
                  {popup === 'leader' && activeFormation.leader && (
                    <button className="secondary" onClick={() => assignLeader(activeFormation.leader!)}>
                      Unassign leader
                    </button>
                  )}
                  <button className="secondary" onClick={() => (popup === 'slot' || popup === 'leader' ? setPopup('offense') : closePopup())}>
                    {popup === 'slot' || popup === 'leader' ? 'Back to formation' : 'Done'}
                  </button>
                  {popup === 'slot' && slotTab === 'military' && (
                    <button className="primary" disabled={!militaryDraft.military} onClick={addMilitary}>
                      Update
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
