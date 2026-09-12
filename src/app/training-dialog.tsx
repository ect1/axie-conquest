"use client";

import { useEffect, useRef } from 'react';
import { Building, Troops, TroopKind, BUILDING_DEFINITIONS, TROOP_DEFINITIONS, TRAINABLE_TROOP_KINDS, TRAINING_BATCH, canTrain } from '@/game/base';

export default function TrainingDialog({ buildings, troops, ready, onTrain, onClose }: {
  buildings: Building[]; troops: Troops; ready: boolean;
  onTrain: (kind: TroopKind) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="assignment-popup training-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="training-dialog-content">
      <div className="catalog-heading"><div><h2>Training</h2><small>Prepare troops and help your Axies grow.</small></div><button className="close" aria-label="Close training" onClick={onClose}>&times;</button></div>
      <div className="troop-options">{TRAINABLE_TROOP_KINDS.map(kind => {
        const definition = TROOP_DEFINITIONS[kind];
        const name = kind === 'infantry' ? 'Soldiers (Infantry)' : definition.name;
        const unlocked = canTrain(kind, buildings);
        return <div className={`troop-card ${unlocked ? '' : 'locked'}`} key={kind}>
          <span className="building-art" aria-hidden="true">{definition.icon}</span>
          <div className="troop-info"><strong>{name}</strong><small>{troops[kind]} ready</small><small>{unlocked ? definition.description : `Build ${BUILDING_DEFINITIONS[definition.building].name} to unlock`}</small></div>
          <button className="primary" disabled={!ready || !unlocked || troops[kind] > Number.MAX_SAFE_INTEGER - TRAINING_BATCH} onClick={() => onTrain(kind)} aria-label={`Train ${TRAINING_BATCH} ${name}`}>{unlocked ? `Train ${TRAINING_BATCH}` : 'Locked'}</button>
        </div>;
      })}
        <div className="troop-card locked">
          <span className="building-art" aria-hidden="true">✦</span>
          <div className="troop-info"><strong>Axie self-leveling</strong><small id="axie-training-description">Self-leveling helps an Axie gain experience and level up.</small><small id="axie-training-requirements">Requires a Happy Axie with no assignment. Axies assigned to Scout, Defense, Offense, or any other duty cannot train.</small><small>Coming soon</small></div>
          <button className="primary" disabled aria-describedby="axie-training-description axie-training-requirements">Train Axie</button>
        </div>
      </div>
      <p className="catalog-footer" role="status">{troops.infantry + troops.archer} troops ready. Training is free and instant for now.</p>
    </div>
  </dialog>;
}
