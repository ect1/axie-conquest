# Main base implementation

## Plan

1. Replace the reactor demo with a colorful Babylon.js settlement and a fixed isometric camera. Use procedural buildings and scenery.
2. Define a 40 by 20 cell base, equivalent to 10 by 5 footprints of 4 by 4 cells. Place a main hall at the center and reserve its footprint.
3. Add a responsive build HUD with a farm option. Choosing it reveals the entire grid, occupied cells, and a snapped 4 by 4 preview.
4. Color valid preview cells green and invalid previews red. Reject overlap and out-of-bounds placement. Tap to position, then confirm or cancel.
5. Support drag panning, wheel/pinch zoom, building selection, and local persistence of farms. Keep camera rotation fixed.
6. Resolve existing startup blockers, check TypeScript and production compilation, and verify placement rules at boundaries and occupied cells.

## TODO

- [x] Base grid definitions and placement validation.
- [x] Main hall, farm models, terrain, and fixed camera.
- [x] Build catalog, placement preview, confirmation, and selection HUD.
- [x] Touch/mouse controls and local save restoration.
- [x] Startup fixes and automated verification.
- [x] Default camera presents southeast-facing buildings.

- [x] Swap the base to 40 by 20 cells; update scenery, placement, and legacy save migration.

- [x] Remove perimeter trees and soften daylight, grass, and background colors to reduce glare.

- [x] Compact mobile HUD and bottom building details with exclusive panels, safe-area spacing, and 44px touch controls.

- [x] Add lumber mill, quarry, barracks, tavern, scout lodge, and archery range to a compact scrolling catalog, with distinct models, building details, and validated persistence.

- [x] Add default perimeter walls, four corner watchtowers, and an entrance outside the build grid; remove manually placed defenses from the catalog and restored saves.

- [x] Add building Move and Remove actions, validated move confirmation/cancellation, local persistence, and Main Hall removal protection.

- [x] Add 90-degree building rotation and Main Hall movement with saved orientation/position and camera recentering.

- [x] Add Train HUD with building-gated infantry and archers, instant prototype training batches, and validated local troop saves.

- [x] Add Axies HUD, all nine class starter heroes, compact roster portraits, and selectable hero details.

## Verification results

- Build menu visibility now controls the construction grid, including initial load and returning from placement.

- `npm run test:placement` passes: boundaries, overlaps, adjacency, 50-footprint capacity, and invalid/duplicate save data.
- `npx tsc --noEmit` passes.
- `npm run build` passes, including Next.js page generation and type validation.
- Browser visual review and physical touch-device gesture testing have not been performed in this environment.

## Acceptance criteria

- Main hall is visible on first load; base has 800 cells.
- Farm occupies exactly 16 cells, cannot overlap a building or cross the boundary.
- Choosing Farm shows the grid and green/red feedback; cancel places nothing.
- Confirming a valid position creates a selectable farm and reserves its cells.
- Dragging or pinching does not accidentally select/place a building.
- Reload restores placed farms; narrow screens retain accessible controls.
