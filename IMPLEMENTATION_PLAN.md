# Unit system milestone

- [x] Implement reusable world-unit rules for map strategy.
  - [x] Separate unit identity, members, capabilities, and movement orders.
  - [x] Support armies with formation offsets and scouts without formations.
  - [x] Resolve movement, redirection, hold, arrival, and return from the current position.
  - [x] Reserve formations, Axies, and troop counts until units return home.
- [x] Connect units to the world scene and HUD.
  - [x] Render members together and highlight the selected group.
  - [x] Select units through map hit targets and the unit list.
  - [x] Issue move, hold, and return commands; display position, status, and travel time.
  - [x] Keep the selected unit's home trail visible after arrival and focus the camera from its coordinate control.
  - [x] Keep the selected unit's home trail visible after arrival and focus the camera from its coordinate control.
- [x] Persist and reset units.
  - [x] Validate saves and restore movement after reload.
  - [x] Migrate legacy formation marches and reject duplicate deployments.
  - [x] Register the unit save in the eager reset registry and test starter restoration.
- [ ] Complete validation.
  - [x] Pass unit, placement, and reset regression checks.
  - [x] Pass TypeScript checking.
  - [x] Pass production build.
  - [ ] Manually verify touch selection and movement in a WebGL browser.

The existing world test expects 100 default objects, while the current definitions total 29; its population assertion fails independently of this milestone. Radius, combat, and scout discovery behavior remain separate future modules.

## Military HUD in world view

- [x] Allow Military to open in world view and clear competing selection panels.
- [x] Keep the World units activity list visible in both city and world views.
- [x] Add explicit formation unassignment controls.
  - [x] Remove an Axie or military stack from a slot.
  - [x] Remove the leader independently; clear leadership when its Axie is removed.
  - [x] Lock leader, Axie, and military edits until a deployed formation returns to base.
- [x] Pass TypeScript, placement, unit, and reset regression checks.
- [ ] Verify Military opening and unassignment on a mobile WebGL browser.
