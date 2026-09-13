# World-object actions and formation dispatch

This milestone supports map strategy and city growth: select a world object, choose an appropriate action, then dispatch a formation from home or redirect one already deployed without locating it manually.

## Agreed interaction rules

| Target | Actions |
| --- | --- |
| Living mob / boss | Scout, Attack |
| Defended garrison | Scout, Attack; Occupy visible but locked with "Defeat this garrison first" |
| Defeated garrison | Occupy |
| Defended village | Attack; Occupy visible but locked with "Defeat this village first" |
| Defeated village | Occupy |
| Other available resources (farm, lumber, stone, oil) | Gather only |
| Empty terrain | Move for an existing selected unit |

Tap an object to highlight it and open a compact mobile panel showing its name, coordinates, state, and relevant actions. Attack and Gather open the formation picker. Scout uses eligible scout units. Keep the chosen target and action while choosing a formation.

The formation picker includes formations at home and already deployed. Show each formation's leader, members, status, and estimated travel time to the selected target. Deployed formations use their actual deployed members and current position. Selecting one issues an order to that same unit; it must not spawn another army or reserve its members again. Moving, holding, and returning armies can be redirected. Confirming replaces the previous order; cancelling leaves it untouched.

## Proposed prototype defaults

These fill gaps in the discussion and can be adjusted during implementation:

- Treat villages and garrisons as defended sites that can be occupied after defeat.
- Use existing army formations for gathering; no new gatherer type is required.
- Keep combat, scouting reports, and resource collection as clearly identified placeholders. Dispatch and travel work, but arrival alone does not grant rewards or silently count as victory.
- Provide a clearly labelled placeholder "Simulate defeat" action for an arrived attacking army to exercise the garrison/village Occupy unlock and defeated-mob state. Defeated mobs have no further actions.
- Gather arrival shows a placeholder gathering/ready state without crediting resources or depleting the site. Scout arrival shows a placeholder scouting state without inventing a report. Timed collection, carrying capacity, resource delivery, respawns, and actual combat are future work.

## Implementation checklist

- [ ] Define target actions and lifecycle in game rules.
  - [x] Add data-driven action definitions for each world-object kind and supported state.
  - [x] Implement one action resolver returning available actions and disabled reasons, including garrison/village Occupy locks.
  - [x] Store target identity and action intent in unit orders so arrival can distinguish Move, Scout, Attack, and Gather.
  - [ ] Validate target existence, current state, and unit capability when issuing an order and again on arrival.
  - [ ] Define safe behavior for removed or regenerated targets: clear the interaction and hold the unit without granting an outcome.

- [ ] Build world-object selection and contextual actions.
  - [x] Resolve picked objects by ID against current world state and highlight the selected target.
  - [x] Replace universal Scout/March buttons with the action matrix above and clear locked/disabled explanations.
  - [x] Preserve target and action through formation selection, back navigation, and confirmation.
  - [ ] Support targeting an object while a player unit is selected, using the same capability and target rules.
  - [ ] Preserve drag panning, pinch/wheel zoom, and empty-ground movement with generous touch targets.

- [x] Include deployed formations in the formation picker.
  - [x] Resolve each formation to its existing active army using city ID and formation identity; distinguish at-home and deployed entries.
  - [x] Show deployed members, current status, and ETA from the army's interpolated current position.
  - [x] Allow eligible holding, moving, and returning formations to be selected; deployment alone is not a disabled reason.
  - [x] Show precise reasons for genuinely unavailable at-home formations.
  - [x] Dispatch at-home formations with existing deployment/reservation validation.
  - [x] Redirect deployed formations in place, preserving unit ID, members, home city, and existing reservations.
  - [x] Revalidate on confirmation, including a formation that arrived home while the picker was open.
  - [x] Keep deployed formation editing locked until return; selection for a new order does not unlock roster editing.

- [ ] Connect action travel and placeholder outcomes.
  - [x] Send Scout through scout capability checks and allow eligible existing scouts to be reused.
  - [x] Display intended action, target, and ETA in the selected-unit panel and activity list.
  - [x] Keep every deployed formation's home-base trail visible without requiring unit selection.
  - [x] Resolve arrivals into explicit placeholder action states; Hold or Return cancels pending interaction.
  - [x] Add the placeholder simulated-defeat control and guard it against invalid targets or repeat resolution.
  - [x] Update garrison/village state immediately after simulated defeat, unlocking Occupy and removing combat actions when selected again.
  - [ ] Prevent incompatible or duplicate placeholder interactions on one target and explain the restriction.

- [x] Persist action and world state through the shared reset contract.
  - [x] Extend world and unit save validation for action intent and lifecycle state; migrate old saves to valid defaults.
  - [x] Restore travel and placeholder arrival state after reload without replaying completed outcomes.
  - [x] Reuse the existing registered world/unit storage keys; no new persistent module is introduced.
  - [x] Verify reset removes the new state, restores starter defaults, preserves unrelated browser data, reports failures, and reloads after success.

- [ ] Verify rules and mobile interaction.
  - [x] Add action-matrix regression coverage, including locked Occupy, defeated garrisons/villages, and resource-only actions.
  - [ ] Test deployed-formation redirection from holding, moving, and returning states, with no duplicate armies or double reservations.
  - [ ] Test current-position ETA, cancellation, arrival-home races, stale targets, and repeated confirmations/outcome resolution.
  - [ ] Add save migration, reload, and reset coverage for the new state.
  - [x] Run `npm run test:placement`, relevant unit/world/reset regression suites, TypeScript checking, and the production build.
  - [ ] Manually verify on a mobile WebGL browser: target selection, locked actions, home and deployed formation selection, redirecting without locating the army, arrival, simulated defeat, Occupy unlock, and reload/reset.

Complete a parent checklist item only when all its subtasks are complete. Remaining unchecked work covers extra conflict handling, direct object orders from a selected map unit, edge-case tests, and manual mobile verification.
