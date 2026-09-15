import { useEffect, useMemo, useRef, useState } from "react";
import type { ApiAxie } from "@/game/axie-roster";
import { createHexGridSlots, HEX_GRID_RADIUS } from "@/game/hex-grid";
import type {
  BattleBoardAssignment,
  BattleBoardLayout,
  SandboxTroopKind,
} from "@/game/battle-board-scene";
import type { BattleSettings } from "@/game/battle-settings";
import {
  createSandboxBattle,
  SANDBOX_BATTLE_STEP,
  SandboxBattle,
  baseCombatStats,
  stepSandboxBattle,
} from "@/game/sandbox-battle";

type Props = {
  layout: BattleBoardLayout;
  range: BattleSettings;
  activeAxies: readonly ApiAxie[];
  onSaveLayout: (layout: BattleBoardLayout) => void;
  onSaveRange: (range: BattleSettings) => void;
  onClose: () => void;
};
type DraftAssignment = {
  slotId: string;
  side: "player" | "enemy";
  axieId?: string;
  mob?: "chimera-pack";
  troopKind?: SandboxTroopKind;
  quantity?: number;
};
const TROOP_LABELS: Record<SandboxTroopKind, string> = {
  soldier: "Soldier",
  archer: "Archer",
};

export default function BattleSandbox({
  layout,
  range,
  activeAxies,
  onSaveLayout,
  onSaveRange,
  onClose,
}: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const renderer = useRef<ReturnType<
    typeof import("@/game/battle-board-scene").createBattleBoardScene
  > | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [draft, setDraft] = useState(layout),
    [rangeDraft, setRangeDraft] = useState(range),
    [showRange, setShowRange] = useState(true);
  const [assignments, setAssignments] = useState<DraftAssignment[]>([]),
    [applied, setApplied] = useState<BattleBoardAssignment[]>([]);
  const [battle, setBattle] = useState<SandboxBattle | null>(null),
    [running, setRunning] = useState(false);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const slots = useMemo(
    () =>
      createHexGridSlots({
        columns: draft.columns,
        hexGap: draft.hexGap * 0.22,
        bands: [
          { id: "enemy", rows: draft.rowsPerTeam },
          { id: "neutral", rows: Math.round(draft.teamGap) },
          { id: "player", rows: draft.rowsPerTeam },
        ],
      }),
    [draft],
  );
  const teamSlots = slots.filter((slot) => slot.band === "player"),
    enemySlots = slots.filter((slot) => slot.band === "enemy");
  const editingSlot = slots.find((slot) => slot.id === editingSlotId);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let disposed = false;
    import("@/game/battle-board-scene")
      .then(({ createBattleBoardScene }) => {
        if (!disposed && canvas.current)
          renderer.current = createBattleBoardScene(
            canvas.current,
            layout,
            () => !disposed && setReady(true),
          );
      })
      .catch((reason) =>
        setError(
          `The battle board could not be prepared: ${reason instanceof Error ? reason.message : "unknown error"}`,
        ),
      );
    return () => {
      disposed = true;
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);
  useEffect(() => {
    renderer.current?.update(draft, applied, rangeDraft, showRange);
  }, [draft, applied, rangeDraft, showRange]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(
      () =>
        setBattle((current) =>
          current ? stepSandboxBattle(current, rangeDraft) : current,
        ),
      SANDBOX_BATTLE_STEP * 1000,
    );
    return () => window.clearInterval(timer);
  }, [running, rangeDraft]);
  useEffect(() => {
    if (battle) renderer.current?.updateUnitPositions(battle.units, battle.events);
  }, [battle]);
  useEffect(() => {
    if (battle?.result) setRunning(false);
  }, [battle?.result]);
  useEffect(() => {
    setAssignments((current) =>
      current.filter((item) =>
        slots.some(
          (slot) => slot.id === item.slotId && slot.band === item.side,
        ),
      ),
    );
    setApplied([]);
    setBattle(null);
    setRunning(false);
  }, [slots]);
  function assign(slotId: string, side: "player" | "enemy", value: string) {
    setAssignments((current) => {
      const rest = current.filter((item) => item.slotId !== slotId);
      if (!value) return rest;
      if (value === "chimera-pack")
        return [...rest, { slotId, side, mob: "chimera-pack" }];
      if (value === "soldier" || value === "archer")
        return [...rest, { slotId, side, troopKind: value, quantity: 1 }];
      return [
        ...rest.filter((item) => item.axieId !== value),
        { slotId, side, axieId: value },
      ];
    });
  }
  function setTroopQuantity(slotId: string, quantity: number) {
    setAssignments((current) =>
      current.map((item) =>
        item.slotId === slotId && item.troopKind
          ? {
              ...item,
              quantity: Math.max(1, Math.min(999, Math.round(quantity || 1))),
            }
          : item,
      ),
    );
  }
  function applyFormation() {
    const next: BattleBoardAssignment[] = [];
    for (const item of assignments) {
      if (item.axieId) {
        const axie = activeAxies.find(
          (candidate) => candidate.id === item.axieId,
        );
        if (axie)
          next.push({
            slotId: item.slotId,
            side: item.side,
            name: axie.name,
            axie,
          });
      } else if (item.mob)
        next.push({
          slotId: item.slotId,
          side: "enemy",
          name: "Chimera pack",
          mob: item.mob,
        });
      else if (item.troopKind)
        next.push({
          slotId: item.slotId,
          side: item.side,
          name: `${TROOP_LABELS[item.troopKind]} x${item.quantity ?? 1}`,
          troopKind: item.troopKind,
          quantity: item.quantity ?? 1,
        });
    }
    setApplied(next);
    renderer.current?.update(draft, next, rangeDraft, showRange);
    setBattle(null);
    setRunning(false);
  }
  function clearFormation() {
    setAssignments([]);
    setApplied([]);
    renderer.current?.update(draft, [], rangeDraft, showRange);
    setBattle(null);
    setRunning(false);
  }
  const selected = (slotId: string) =>
    assignments.find((item) => item.slotId === slotId);
  const label = (slotId: string) => {
    const item = selected(slotId);
    return item?.axieId
      ? (activeAxies.find((axie) => axie.id === item.axieId)?.name ?? "Axie")
      : item?.mob
        ? "Chimera pack"
        : item?.troopKind
          ? `${TROOP_LABELS[item.troopKind]} x${item.quantity ?? 1}`
          : "Assign unit";
  };
  const setNumber =
    (
      key: keyof typeof draft,
      minimum: number,
      maximum: number,
      integer = false,
    ) =>
    (value: number) =>
      setDraft({
        ...draft,
        [key]: Math.max(
          minimum,
          Math.min(
            maximum,
            integer ? Math.round(value || minimum) : value || minimum,
          ),
        ),
      });
  const setRangeNumber =
    (key: keyof BattleSettings, minimum: number, maximum: number) =>
    (value: number) =>
      setRangeDraft({
        ...rangeDraft,
        [key]: Math.max(minimum, Math.min(maximum, value || minimum)),
      });
  function startBattle() {
    // Search begins only at the far edge of the complete board (including
    // both teams and neutral rows), never at a team's own deployment edge.
    const playerSearchEdge =
      Math.min(...slots.map((slot) => slot.z)) - HEX_GRID_RADIUS;
    const enemySearchEdge =
      Math.max(...slots.map((slot) => slot.z)) + HEX_GRID_RADIUS;
    const movementBounds = {
      minX: Math.min(...slots.map((slot) => slot.x)) - HEX_GRID_RADIUS,
      maxX: Math.max(...slots.map((slot) => slot.x)) + HEX_GRID_RADIUS,
      minZ: playerSearchEdge,
      maxZ: enemySearchEdge,
    };
    const positions = applied.map((assignment) => {
      const slot = slots.find(
        (candidate) => candidate.id === assignment.slotId,
      )!;
      const stats = baseCombatStats(rangeDraft, assignment.axie ? "axie" : assignment.troopKind ?? "chimera");
      const members = assignment.troopKind ? assignment.quantity ?? 1 : 1;
      return {
        id: assignment.slotId,
        side: assignment.side,
        x: slot.x,
        z: slot.z,
        facing: assignment.side === "player" ? Math.PI : 0,
        searchAtZ:
          assignment.side === "player" ? playerSearchEdge : enemySearchEdge,
        movementBounds,
        attackRange:
          assignment.troopKind === "archer"
            ? rangeDraft.rangedAttackRange
            : rangeDraft.meleeAttackRange,
        ...stats,
        health: stats.health * members,
        attack: stats.attack * members,
      };
    });
    setBattle(createSandboxBattle(positions));
    setRunning(true);
  }
  return (
    <dialog
      ref={dialog}
      className="battle-dialog battle-sandbox-dialog"
      aria-label="Battle board sandbox"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="battle-header">
        <div>
          <span className="eyebrow">DEVELOPER · BATTLE SANDBOX</span>
          <h2>Hex board prototype</h2>
          <span>
            {applied.length
              ? `${applied.length} assigned model${applied.length === 1 ? "" : "s"} on board`
              : "Assign a formation, then apply it to preview models."}
          </span>
        </div>
        <button className="secondary" onClick={onClose}>
          Close sandbox
        </button>
      </header>
      <div className="battle-field battle-board-field">
        {!ready && !error && (
          <p className="battle-loading" role="status">
            Preparing hex board...
          </p>
        )}
        {error && (
          <p className="battle-loading" role="alert">
            {error}
          </p>
        )}
        <canvas
          ref={canvas}
          aria-label="Hex battle board. Drag to pan and pinch or scroll to zoom."
        />
        <span className="battle-side-label enemy">Enemy</span>
        <span className="battle-side-label player">Your team</span>
        <div className="battle-camera">
          <button
            aria-label="Zoom battlefield in"
            onClick={() => renderer.current?.zoom(0.85)}
          >
            +
          </button>
          <button
            aria-label="Zoom battlefield out"
            onClick={() => renderer.current?.zoom(1.18)}
          >
            −
          </button>
          <button onClick={() => renderer.current?.home()}>Center</button>
        </div>
      </div>
      <div className="battle-controls">
        <button
          className="primary"
          disabled={
            !applied.some((unit) => unit.side === "player") ||
            !applied.some((unit) => unit.side === "enemy")
          }
          onClick={startBattle}
        >
          Start battle
        </button>
        {battle && (
          <>
            <button
              className="secondary"
              disabled={!!battle.result}
              onClick={() => setRunning((value) => !value)}
            >
              {running ? "Pause" : "Resume"}
            </button>
            <button
              className="secondary"
              onClick={() => {
                setBattle(null);
                setRunning(false);
                renderer.current?.update(draft, applied, rangeDraft, showRange);
              }}
            >
              Reset positions
            </button>
            <p role="status">
              {running
                ? "Battle running"
                : battle.result
                  ? battle.result === "victory" ? "Victory" : battle.result === "defeat" ? "Defeat" : "Draw"
                  : "Battle paused"}{" "}
              · {(battle.tick / 10).toFixed(1)}s ·{" "}
              {battle.units.filter((unit) => unit.state === "marching").length}{" "}
              marching ·{" "}
              {battle.units.filter((unit) => unit.state === "searching").length}{" "}
              searching ·{" "}
              {battle.units.filter((unit) => unit.state === "roaming").length}{" "}
              roaming ·{" "}
              {
                battle.units.filter((unit) => unit.state === "approaching")
                  .length
              }{" "}
              walking ·{" "}
              {battle.units.filter((unit) => unit.state === "charging").length}{" "}
              rushing ·{" "}
              {battle.units.filter((unit) => unit.state === "attacking").length}{" "}
              attacking · Player HP {Math.ceil(battle.units.filter((unit) => unit.side === "player").reduce((total, unit) => total + unit.hp, 0))}/{Math.ceil(battle.units.filter((unit) => unit.side === "player").reduce((total, unit) => total + unit.maxHp, 0))} · Enemy HP {Math.ceil(battle.units.filter((unit) => unit.side === "enemy").reduce((total, unit) => total + unit.hp, 0))}/{Math.ceil(battle.units.filter((unit) => unit.side === "enemy").reduce((total, unit) => total + unit.maxHp, 0))}. Health, attack, and defense resolve in battle; range and movement remain approach-only.
            </p>
            <small>
              Search recommendation: keep the detection angle around 120°–180°
              for responsive turns; narrow cones now rotate toward the nearest
              enemy inside detection range before moving.
            </small>
          </>
        )}
      </div>
      <div className="battle-controls battle-board-controls">
        <label>
          Columns per team
          <input
            type="number"
            min={2}
            max={16}
            value={draft.columns}
            onChange={(event) =>
              setNumber("columns", 2, 16, true)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Rows per team
          <input
            type="number"
            min={1}
            max={12}
            value={draft.rowsPerTeam}
            onChange={(event) =>
              setNumber("rowsPerTeam", 1, 12, true)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Gap between hexes
          <input
            type="number"
            min={0}
            max={3}
            step={0.05}
            value={draft.hexGap}
            onChange={(event) =>
              setNumber("hexGap", 0, 3)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Neutral hex rows
          <input
            type="number"
            min={0}
            max={4}
            value={draft.teamGap}
            onChange={(event) =>
              setNumber("teamGap", 0, 4, true)(Number(event.target.value))
            }
          />
        </label>
        <button className="secondary" onClick={() => onSaveLayout(draft)}>
          Save layout
        </button>
      </div>
      <fieldset
        className="battle-controls battle-board-controls"
        aria-label="Sandbox base combat stats"
      >
        <legend>Base combat stats · JSON configurable</legend>
        {([
          ["Axie", "baseAxieHealth", "baseAxieAttack", "baseAxieDefense", "baseAxieSpeed", "baseAxieAttackSpeed"],
          ["Soldier", "baseSoldierHealth", "baseSoldierAttack", "baseSoldierDefense", "baseSoldierSpeed", "baseSoldierAttackSpeed"],
          ["Archer", "baseArcherHealth", "baseArcherAttack", "baseArcherDefense", "baseArcherSpeed", "baseArcherAttackSpeed"],
          ["Chimera", "baseChimeraHealth", "baseChimeraAttack", "baseChimeraDefense", "baseChimeraSpeed", "baseChimeraAttackSpeed"],
        ] as const).map(([name, health, attack, defense, speed, attackSpeed]) => (
          <div className="sandbox-stat-row" key={name}>
            <strong>{name}</strong>
            <label>Health<input type="number" min={1} max={100000} step={1} value={rangeDraft[health]} onChange={(event) => setRangeNumber(health, 1, 100000)(Number(event.target.value))} /></label>
            <label>Attack<input type="number" min={0} max={100000} step={1} value={rangeDraft[attack]} onChange={(event) => setRangeNumber(attack, 0, 100000)(Number(event.target.value))} /></label>
            <label>Defense<input type="number" min={0} max={100000} step={1} value={rangeDraft[defense]} onChange={(event) => setRangeNumber(defense, 0, 100000)(Number(event.target.value))} /></label>
            <label>Speed<input type="number" min={0.1} max={100} step={0.1} value={rangeDraft[speed]} onChange={(event) => setRangeNumber(speed, 0.1, 100)(Number(event.target.value))} /></label>
            <label>Attack speed<input type="number" min={0.1} max={10} step={0.01} value={rangeDraft[attackSpeed]} onChange={(event) => setRangeNumber(attackSpeed, 0.1, 10)(Number(event.target.value))} /></label>
          </div>
        ))}
        <label>Archer projectile speed (tiles / second)<input type="number" min={0.1} max={100} step={0.1} value={rangeDraft.baseArcherProjectileSpeed} onChange={(event) => setRangeNumber("baseArcherProjectileSpeed", 0.1, 100)(Number(event.target.value))} /></label>
        <small>Attack speed is attacks per second, so 1.0 means one attack each second. Troop quantities multiply their squad health and attack.</small>
        <button className="secondary" onClick={() => onSaveRange(rangeDraft)}>Save combat stats</button>
      </fieldset>
      <fieldset
        className="battle-controls battle-board-controls"
        aria-label="Directional range tuning"
      >
        <legend>Directional range · JSON configurable</legend>
        <label>
          Level 0 range
          <input
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            value={rangeDraft.level0Range}
            onChange={(event) =>
              setRangeNumber("level0Range", 0.1, 30)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Level 0 angle
          <input
            type="number"
            min={1}
            max={360}
            value={rangeDraft.level0Angle}
            onChange={(event) =>
              setRangeNumber("level0Angle", 1, 360)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Body radius
          <input
            type="number"
            min={0.1}
            max={5}
            step={0.1}
            value={rangeDraft.bodyRadius}
            onChange={(event) =>
              setRangeNumber("bodyRadius", 0.1, 5)(Number(event.target.value))
            }
          />
        </label>
        <label>
          Level 1 detect range
          <input
            type="number"
            min={0.1}
            max={100}
            step={0.1}
            value={rangeDraft.level1DetectionRange}
            onChange={(event) =>
              setRangeNumber(
                "level1DetectionRange",
                0.1,
                100,
              )(Number(event.target.value))
            }
          />
        </label>
        <label>
          Level 1 angle
          <input
            type="number"
            min={1}
            max={360}
            value={rangeDraft.level1DetectionAngle}
            onChange={(event) =>
              setRangeNumber(
                "level1DetectionAngle",
                1,
                360,
              )(Number(event.target.value))
            }
          />
        </label>
        <label>
          Dash multiplier
          <input
            type="number"
            min={1}
            max={5}
            step={0.1}
            value={rangeDraft.dashSpeedMultiplier}
            onChange={(event) =>
              setRangeNumber(
                "dashSpeedMultiplier",
                1,
                5,
              )(Number(event.target.value))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={showRange}
            onChange={(event) => setShowRange(event.target.checked)}
          />{" "}
          Show range
        </label>
        <button className="secondary" onClick={() => onSaveRange(rangeDraft)}>
          Save range
        </button>
      </fieldset>
      <fieldset
        className="battle-controls battle-board-controls"
        aria-label="Base attack range tuning"
      >
        <legend>Base attack range · JSON configurable</legend>
        <label>
          Melee range
          <input
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            value={rangeDraft.meleeAttackRange}
            onChange={(event) =>
              setRangeNumber(
                "meleeAttackRange",
                0.1,
                30,
              )(Number(event.target.value))
            }
          />
        </label>
        <label>
          Ranged range
          <input
            type="number"
            min={0.1}
            max={30}
            step={0.1}
            value={rangeDraft.rangedAttackRange}
            onChange={(event) =>
              setRangeNumber(
                "rangedAttackRange",
                0.1,
                30,
              )(Number(event.target.value))
            }
          />
        </label>
        <small>
          Show range draws melee in cyan and ranged in violet. Current Axies and
          Chimera packs use the melee value.
        </small>
        <button className="secondary" onClick={() => onSaveRange(rangeDraft)}>
          Save attack ranges
        </button>
      </fieldset>
      <p className="range-color-legend" role="note">
        <span>
          <i style={{ backgroundColor: "#fff" }} />
          Body
        </span>
        <span>
          <i style={{ backgroundColor: "#ffac46" }} />
          Level 0 detect
        </span>
        <span>
          <i style={{ backgroundColor: "#ff6262" }} />
          Level 1 rush
        </span>
        <span>
          <i style={{ backgroundColor: "#6ee7ff" }} />
          Melee attack
        </span>
        <span>
          <i style={{ backgroundColor: "#bd8cff" }} />
          Ranged attack
        </span>
      </p>
      <section
        className="battle-controls battle-board-controls"
        aria-label="Sandbox troop groups"
      >
        <div>
          <strong>Sandbox troop groups</strong>
          <small>
            {" "}
            Soldier groups use melee range; Archer groups stop at the violet
            ranged range.
          </small>
        </div>
        {(["player", "enemy"] as const).map((side) => (
          <div key={side} className="placement-actions">
            <span>{side === "player" ? "Your team" : "Enemy"}</span>
            {(["soldier", "archer"] as const).map((kind) => (
              <button
                key={kind}
                className="secondary"
                disabled={
                  !slots.find(
                    (slot) => slot.band === side && !selected(slot.id),
                  )
                }
                onClick={() => {
                  const slot = slots.find(
                    (candidate) =>
                      candidate.band === side && !selected(candidate.id),
                  );
                  if (slot) assign(slot.id, side, kind);
                }}
              >{`Add ${TROOP_LABELS[kind]}`}</button>
            ))}
          </div>
        ))}
        {assignments
          .filter((item) => item.troopKind)
          .map((item) => (
            <label key={item.slotId}>
              {TROOP_LABELS[item.troopKind!]} quantity ·{" "}
              {item.side === "player" ? "Your team" : "Enemy"}
              <input
                type="number"
                min={1}
                max={999}
                value={item.quantity ?? 1}
                onChange={(event) =>
                  setTroopQuantity(item.slotId, Number(event.target.value))
                }
              />
            </label>
          ))}
      </section>
      <section
        className="sandbox-formation"
        aria-label="Sandbox hex assignments"
      >
        <div>
          <h3>Your team</h3>
          <p>
            Tap a hex to assign one active Axie. The formation resizes with the
            board settings.
          </p>
          <div
            className="formation-board shared-team-board sandbox-hex-board"
            style={
              { "--formation-columns": draft.columns } as React.CSSProperties
            }
          >
            {Array.from({ length: draft.rowsPerTeam }, (_, row) => (
              <div
                className={`formation-row ${row % 2 ? "hex-row-shifted" : ""}`}
                key={row}
              >
                {teamSlots
                  .filter(
                    (slot) =>
                      slot.row ===
                      row + draft.rowsPerTeam + Math.round(draft.teamGap),
                  )
                  .map((slot) => (
                    <button
                      className={`formation-slot ${selected(slot.id) ? "filled" : ""}`}
                      key={slot.id}
                      onClick={() => setEditingSlotId(slot.id)}
                    >
                      <strong>{label(slot.id)}</strong>
                      <small>
                        Hex {row + 1}-{slot.column + 1}
                      </small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3>Enemy</h3>
          <p>Tap a hex to assign an active Axie or Chimera pack.</p>
          <div
            className="formation-board shared-team-board sandbox-hex-board"
            style={
              { "--formation-columns": draft.columns } as React.CSSProperties
            }
          >
            {Array.from({ length: draft.rowsPerTeam }, (_, row) => (
              <div
                className={`formation-row ${row % 2 ? "hex-row-shifted" : ""}`}
                key={row}
              >
                {enemySlots
                  .filter((slot) => slot.row === row)
                  .map((slot) => (
                    <button
                      className={`formation-slot ${selected(slot.id) ? "filled" : ""}`}
                      key={slot.id}
                      onClick={() => setEditingSlotId(slot.id)}
                    >
                      <strong>{label(slot.id)}</strong>
                      <small>
                        Hex {row + 1}-{slot.column + 1}
                      </small>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      </section>
      {editingSlot && (
        <div
          className="assignment-backdrop"
          role="presentation"
          onClick={() => setEditingSlotId(null)}
        >
          <section
            className="assignment-popup"
            role="dialog"
            aria-modal="true"
            aria-label="Assign sandbox hex"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="catalog-heading">
              <div>
                <span className="eyebrow">SANDBOX HEX</span>
                <h3>
                  Assign {editingSlot.band === "player" ? "team" : "enemy"} unit
                </h3>
                <small>
                  Hex {editingSlot.column + 1} ·{" "}
                  {editingSlot.band === "player" ? "Your team" : "Enemy"}
                </small>
              </div>
              <button
                className="close"
                onClick={() => setEditingSlotId(null)}
                aria-label="Close assignment"
              >
                ×
              </button>
            </div>
            <div className="assignment-list">
              {(["soldier", "archer"] as const).map((kind) => {
                const assigned = selected(editingSlot.id)?.troopKind === kind;
                return (
                  <button
                    key={kind}
                    className={`assignment-row ${assigned ? "assigned" : ""}`}
                    onClick={() =>
                      assign(
                        editingSlot.id,
                        editingSlot.band as "player" | "enemy",
                        assigned ? "" : kind,
                      )
                    }
                  >
                    <span className="assignment-copy">
                      <strong>{TROOP_LABELS[kind]}</strong>
                      <small>
                        {kind === "archer"
                          ? `Ranged unit · attack range ${rangeDraft.rangedAttackRange}`
                          : `Melee unit · attack range ${rangeDraft.meleeAttackRange}`}
                      </small>
                    </span>
                    <span className="assignment-action">
                      {assigned ? "Unassign" : "Assign"}
                    </span>
                  </button>
                );
              })}
              {selected(editingSlot.id)?.troopKind && (
                <label>
                  Group quantity
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={selected(editingSlot.id)?.quantity ?? 1}
                    onChange={(event) =>
                      setTroopQuantity(
                        editingSlot.id,
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              )}
              {activeAxies.map((axie) => {
                const occupied = assignments.some(
                  (item) =>
                    item.slotId !== editingSlot.id && item.axieId === axie.id,
                );
                const assigned = selected(editingSlot.id)?.axieId === axie.id;
                return (
                  <button
                    key={axie.id}
                    className={`assignment-row ${assigned ? "assigned" : ""} ${occupied ? "unavailable" : ""}`}
                    disabled={occupied}
                    onClick={() => {
                      assign(
                        editingSlot.id,
                        editingSlot.band as "player" | "enemy",
                        assigned ? "" : axie.id,
                      );
                      setEditingSlotId(null);
                    }}
                  >
                    <span className="assignment-copy">
                      <strong>{axie.name}</strong>
                      <small>{axie.class} · Active Axie</small>
                    </span>
                    <span className="assignment-action">
                      {assigned ? "Unassign" : "Assign"}
                    </span>
                  </button>
                );
              })}
              {editingSlot.band === "enemy" && (
                <button
                  className={`assignment-row ${selected(editingSlot.id)?.mob ? "assigned" : ""}`}
                  onClick={() => {
                    assign(
                      editingSlot.id,
                      "enemy",
                      selected(editingSlot.id)?.mob ? "" : "chimera-pack",
                    );
                    setEditingSlotId(null);
                  }}
                >
                  <span className="assignment-copy">
                    <strong>Chimera pack</strong>
                    <small>Available developer mob</small>
                  </span>
                  <span className="assignment-action">
                    {selected(editingSlot.id)?.mob ? "Unassign" : "Assign"}
                  </span>
                </button>
              )}
              {!activeAxies.length && editingSlot.band === "player" && (
                <p>
                  No active Axies are available. Deploy Axies in Town first.
                </p>
              )}
            </div>
            <div className="placement-actions">
              <button
                className="secondary"
                onClick={() => {
                  assign(
                    editingSlot.id,
                    editingSlot.band as "player" | "enemy",
                    "",
                  );
                  setEditingSlotId(null);
                }}
              >
                Clear hex
              </button>
              <button
                className="primary"
                onClick={() => setEditingSlotId(null)}
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
      <div className="battle-controls">
        <button className="primary" onClick={applyFormation}>
          Apply formation
        </button>
        <p>
          Both teams use{" "}
          <strong>
            {draft.columns} × {draft.rowsPerTeam}
          </strong>{" "}
          slots. Apply puts the selected Axie and Chimera 3D models on their
          assigned hexes; it does not start combat or change real formations.
        </p>
      </div>
      <div className="battle-controls">
        <button
          className="secondary"
          disabled={!assignments.length && !applied.length}
          onClick={clearFormation}
        >
          Clear all units
        </button>
      </div>
    </dialog>
  );
}
