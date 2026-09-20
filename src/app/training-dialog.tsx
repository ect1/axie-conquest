"use client";

import { useEffect, useRef, useState } from 'react';
import { Building, Troops, TroopKind, BUILDING_DEFINITIONS, TROOP_DEFINITIONS, TRAINABLE_TROOP_KINDS, canTrain } from '@/game/base';
import { getTotalMilitary } from '@/game/military-service';
import { CityResources } from '@/game/cities';
import {
  UnitTrainingConfigFile,
  fetchLiveTrainingConfig,
  getTrainingConfigFile,
  getUnitTrainingLevelConfig,
  isTrainingEnabled,
  getTrainingBatchSize,
  canAffordTraining,
  formatStatBonuses,
} from '@/game/units-training-config';
import { TrainingQueue, secondsRemaining } from '@/game/training-queue';

export default function TrainingDialog({ buildings, troops, resources, trainingQueue, ready, onTrain, onClose }: {
  buildings: Building[];
  troops: Troops;
  resources: CityResources;
  trainingQueue: TrainingQueue;
  ready: boolean;
  onTrain: (kind: TroopKind, buildingId?: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [trainingConfig, setTrainingConfig] = useState<UnitTrainingConfigFile>(() => getTrainingConfigFile());
  const [now, setNow] = useState(Date.now);

  useEffect(() => { dialog.current?.showModal(); }, []);

  useEffect(() => {
    fetchLiveTrainingConfig().then(cfg => { if (cfg) setTrainingConfig(cfg); });
  }, []);

  // Tick every second so countdown labels stay current while the dialog is open
  useEffect(() => {
    if (!trainingQueue.size) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [trainingQueue.size]);

  const batchSize = trainingConfig.settings?.batchSize ?? getTrainingBatchSize();

  return (
    <dialog ref={dialog} className="assignment-popup training-dialog" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="training-dialog-content">
        <div className="catalog-heading">
          <div>
            <h2>Training</h2>
            <small>Prepare troops and help your Axies grow.</small>
          </div>
          <button className="close" aria-label="Close training" onClick={onClose}>&times;</button>
        </div>

        <div className="troop-options">
          {TRAINABLE_TROOP_KINDS.map(kind => {
            const definition = TROOP_DEFINITIONS[kind];
            const name = kind === 'infantry' ? 'Soldiers (Infantry)' : definition.name;
            const matchingBuildings = buildings.filter(b => b.kind === definition.building);
            const totalBuildings = matchingBuildings.length;
            const hasBuilding = totalBuildings > 0;
            const unitConfig = trainingConfig.units?.[kind];
            const unitEnabled = unitConfig ? isTrainingEnabled(kind) : true;

            const idleBuildings = matchingBuildings.filter(b => !trainingQueue.has(b.id));
            const busyBuildings = matchingBuildings.filter(b => trainingQueue.has(b.id));

            // Choose the best idle building to train at (highest level)
            const targetBuilding = idleBuildings.sort((a, b) => (b.level ?? 1) - (a.level ?? 1))[0]
              ?? matchingBuildings.sort((a, b) => (b.level ?? 1) - (a.level ?? 1))[0];
            const buildingLevel = targetBuilding ? (targetBuilding.level ?? 1) : 1;
            const levelCfg = unitConfig ? getUnitTrainingLevelConfig(kind, Math.max(1, buildingLevel)) : undefined;
            const cost = levelCfg?.cost;
            const statBonusStr = levelCfg ? formatStatBonuses(levelCfg.statBonuses) : '';
            const affordable = !cost || canAffordTraining(resources, cost);

            const allBusy = hasBuilding && idleBuildings.length === 0;
            const busyJobs = busyBuildings
              .map(b => trainingQueue.get(b.id)!)
              .filter(Boolean)
              .sort((a, b) => a.endsAt - b.endsAt);
            const soonestJob = busyJobs[0];
            const secsLeft = soonestJob ? secondsRemaining(soonestJob, now) : 0;

            const canDoTrain = ready && hasBuilding && unitEnabled && affordable && !allBusy && troops[kind] <= Number.MAX_SAFE_INTEGER - batchSize;
            const locked = !unitEnabled;
            const noBuilding = !hasBuilding;

            return (
              <div className={`troop-card ${!hasBuilding || locked ? 'locked' : ''}`} key={kind}>
                <span className="building-art" aria-hidden="true">{definition.icon}</span>
                <div className="troop-info">
                  <strong>{name}</strong>
                  <small>{troops[kind]} ready</small>
                  {locked && (
                    <small className="troop-locked-note">🔒 Coming soon</small>
                  )}
                  {!locked && noBuilding && (
                    <small>Build {BUILDING_DEFINITIONS[definition.building].name} to unlock</small>
                  )}
                  {!locked && hasBuilding && levelCfg && (
                    <>
                      <small className="troop-cost">
                        {cost?.food ? `🌾 ${cost.food}` : ''}
                        {cost?.food && cost?.wood ? '  ' : ''}
                        {cost?.wood ? `🪵 ${cost.wood}` : ''}
                        {'  '}⏱ {levelCfg.trainingTimeSeconds}s / batch
                      </small>
                      {!affordable && (
                        <small className="troop-cost-warning">⚠ Not enough resources</small>
                      )}
                      {statBonusStr && (
                        <small className="troop-bonuses">✦ {statBonusStr}</small>
                      )}
                      <small className="troop-building-level">
                        {totalBuildings > 1
                          ? `${idleBuildings.length} of ${totalBuildings} ${BUILDING_DEFINITIONS[definition.building].name} available`
                          : `${BUILDING_DEFINITIONS[definition.building].name} Lv${buildingLevel}`}
                      </small>
                    </>
                  )}
                  {!locked && !hasBuilding && !levelCfg && (
                    <small>{definition.description}</small>
                  )}
                </div>
                <button
                  className={`primary${allBusy ? ' training-active' : ''}`}
                  disabled={!canDoTrain}
                  onClick={() => targetBuilding && onTrain(kind, targetBuilding.id)}
                  aria-label={allBusy ? `Training… ${secsLeft}s remaining` : `Train ${batchSize} ${name}`}
                >
                  {locked ? 'Locked' : noBuilding ? 'Locked' : allBusy ? `⏱ ${secsLeft}s` : !affordable ? 'Need resources' : `Train ${batchSize}`}
                </button>
              </div>
            );
          })}

          <div className="troop-card locked">
            <span className="building-art" aria-hidden="true">✦</span>
            <div className="troop-info">
              <strong>Axie self-leveling</strong>
              <small id="axie-training-description">Self-leveling helps an Axie gain experience and level up.</small>
              <small id="axie-training-requirements">Requires a Happy Axie with no assignment. Axies assigned to Scout, Defense, Offense, or any other duty cannot train.</small>
              <small>Coming soon</small>
            </div>
            <button className="primary" disabled aria-describedby="axie-training-description axie-training-requirements">Train Axie</button>
          </div>
        </div>

        <p className="catalog-footer" role="status">
          {getTotalMilitary(troops)} troops ready.
          {' '}Training consumes food &amp; wood and produces troops when the countdown completes.
        </p>
      </div>
    </dialog>
  );
}
