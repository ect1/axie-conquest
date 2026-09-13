# Playable battle milestone

The first battle loop is a local PvE encounter: march to a defended village, garrison,
or boss, fight its chimera formation, then return home with the surviving troops.
Battle combat uses a dedicated fixed-isometric battlefield. Concurrent arrivals queue;
this milestone does not simulate multiplayer or free-moving world-map combat.

- [x] Implement combat rules separately from Babylon and React.
  - [x] Convert each hero slot into a combatant and each military slot into a counted squad.
  - [x] Define troop health, attack, defense, movement speed, attack range, interval, and body radius.
  - [x] Apply existing Axie stats and preserve the deployed formation's selected leader.
  - [x] Simulate deterministic 0.1-second ticks and simultaneous basic-attack damage.
  - [x] Reduce squad damage as soldiers fall; retain individual defense, speed, and range.
  - [x] Implement awareness (18), engagement (10), edge-to-edge attacks, and 10% melee charge speed.
  - [x] Keep archers at shooting distance, separate bodies, and replace defeated targets.
  - [x] Implement retreat, enemy pursuit leash (30), defeat, victory, and a five-minute draw limit.
- [x] Add developer battle tools and readable presentation.
  - [x] Add Developer > Battle system with balanced, infantry-heavy, and archer-heavy presets.
  - [x] Add enemy strength selection, start/pause, single-step, retreat, reset, and sandbox isolation.
  - [x] Add fixed-isometric 3D presentation, touch selection, drag panning, and pinch/wheel zoom.
  - [x] Show health bars, attack/skill feedback, remaining headcounts, and outcomes.
  - [x] Add independent awareness, engagement, attack, body, facing, and target overlays.
  - [x] Default overlays to the selected unit/formation, with an all-units option.
  - [x] Inspect each combatant's state, target, health, movement, and attack timer.
- [x] Connect battles to existing world and military systems.
  - [x] Preserve the free March command for open land and defended sites; only Attack begins combat.
  - [x] Start real combat when an attack march arrives; remove the simulated-defeat shortcut.
  - [x] Mark sites defeated only after victory and persist troop losses and reduced slot assignments.
  - [x] Return survivors home and keep them reserved until arrival.
  - [x] Carry wounds on redirected marches; recover heroes and surviving soldiers at home.
  - [x] Save the latest battle outcome in Mail > Battle Logs.
- [x] Make battle persistence recoverable and resettable.
  - [x] Save and validate active battle checkpoints; resume without offline combat advancement.
  - [x] Journal absolute outcome writes and replay interrupted transactions before loading game state.
  - [x] Pause and report storage failures, with explicit retry controls.
  - [x] Register battle and transaction keys eagerly in RESETTABLE_MODULES.
  - [x] Test interrupted writes, unrelated-key protection, reset, and starter restoration.
- [x] Establish separate skill and talent modules.
  - [x] Add manual mouth-part skills with independent range and cooldown.
  - [x] Prevent healing from reviving lost soldiers.
  - [x] Apply one class-based leader talent bonus at battle start without stacking.
- [x] Verify the integrated milestone.
  - [x] Add and pass npm run test:battle for combat, replay, outcomes, and recovery.
  - [x] Pass placement, unit, world, and reset regression suites.
  - [x] Pass production compilation and TypeScript validation.
  - [x] Check sandbox controls, colored overlays, and mobile layout in a browser.
  - [x] Check world arrival, reload resume, casualty settlement, return orders, and Mail in a browser.

## Follow-up milestones

- [ ] Expand Axie skills to all six part slots and add progression/talent selection.
- [ ] Add terrain, line of sight, troop counters, and formation frontage limits.
- [ ] Add attack-angle restrictions and configurable stances after movement playtesting.
- [ ] Add durable battle history, rewards, hospital treatment, and enemy replenishment rules.
- [ ] Support simultaneous world-map battles, allied reinforcements, and multiplayer authority.

Initial balance is provisional. Soldiers have 100 HP, 12 attack, and 35 defense;
archers have 65 HP, 14 attack, and 10 defense. Damage is attack × 100 / (100 + defense).
Training adds headcount; it does not upgrade every soldier's stats. Talent bonuses are
5% at battle start. Only the implemented mouth skills affect combat; other existing
part descriptions remain future behavior.
