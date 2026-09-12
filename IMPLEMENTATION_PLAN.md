# World Coordinates, Routes, and March Orders

## Goal

Let a player tap any traversable point in the world view, see a clear route from Everleaf Haven to that coordinate, then choose to scout it or send an offensive march. An offensive march must use a saved formation containing at least one assigned Axie.

## Interaction contract

1. In world view, a tap on land selects a world coordinate; a tap on a generated object selects that object's coordinate and label.
2. Selecting land opens the action menu without a route line. The route line appears only after Send march is confirmed.
3. The HUD shows the destination coordinate, target name when present, route distance, and two choices: **Scout** and **March**.
4. **Scout** creates a scouting order for the selected coordinate and reports its status in the HUD. It does not require a formation.
5. **March** opens an offensive-formation picker. Only formations with at least one assigned Axie are selectable; empty formations explain why they are unavailable.
6. Confirming a valid formation creates an offensive march order with its destination, selected formation index, route distance, and initial status. Cancel or changing target clears the pending selection without sending an order.

## TODO

- [x] Define route and order rules in `src/game/routes.ts`.
  - [x] Add serializable coordinate, route, scout-order, and offensive-march types with a versioned local-storage key.
  - [x] Normalize and validate tapped coordinates against the world bounds, rejecting malformed saved values.
  - [x] Calculate origin-to-destination route points and world distance in reusable, renderer-independent functions.
  - [x] Add formation eligibility helpers that require at least one assigned Axie, independent of troop assignments.
  - [x] Restore valid orders safely and expose creation helpers for scout and offensive orders.

- [x] Extend world picking and route rendering in `src/game/scene.ts`.
  - [x] Add a world-target event that returns the snapped land coordinate and optional generated-object metadata.
  - [x] Preserve existing building selection, base placement, drag-pan, and pinch/zoom behavior by accepting a target only from a tap in world view.
  - [x] Render and dispose a distinct route line and destination marker in response to selected-route state.
  - [x] Keep the route anchored at Everleaf Haven and redraw it accurately after target changes, world regeneration, and view changes.

- [ ] Build the route action and formation-selection HUD in `src/app/page.tsx` and a focused reusable panel component.
  - [x] Keep action and formation panels visible under world-view CSS rules.
  - [x] Reload saved formations with current town deployments and troops when March is clicked.
  - [ ] Store selected target, preview route, pending action, selected formation, and restored orders in React state.
  - [ ] Show a mobile-sized route card with coordinate, target label, distance, Scout, March, and Cancel controls.
  - [ ] Show an offensive formation picker after March is chosen, including leader/Axie summary and disabled empty formations.
  - [ ] Require an eligible formation before enabling Send march, then save the new offensive order and update the scene/HUD status.
  - [ ] Save scouts and marches locally; restore them on load without crashing on stale or corrupt data.
  - [ ] Close incompatible base, build, hero, military, and developer panels when entering route targeting, and clear target state when returning to base view.

- [ ] Surface issued orders in the world HUD.
  - [ ] Show the latest scout or offensive march target, formation summary for marches, and initial order status.
  - [ ] Use clear status text so the prototype does not imply live combat resolution or travel timers that are not yet implemented.

- [ ] Add focused regression coverage and complete validation.
  - [ ] Add a `scripts/test-routes.cjs` script covering coordinate normalization, route distance, malformed-save recovery, and scout/march order restoration.
  - [ ] Cover formation eligibility for an empty formation, troop-only formation, and a formation with one Axie.
  - [ ] Run `npm run test:placement`, `npm run test:world`, the new route test, and `npm run build`.
