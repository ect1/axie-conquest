## Game reset

- [x] Add extensible reset support for persistent modules.
  - [x] Register buildings, legacy saves, world, routes, cities, military, formations, deployments and unit stats.
  - [x] Support dynamic city keys and module cleanup callbacks without clearing unrelated storage.
  - [x] Add Developer HUD confirmation, error feedback and reload into starter defaults.
  - [x] Document mandatory reset registration in AGENTS.md.
  - [x] Verify reset coverage, failure handling and placement/save regressions (`npm run test:reset`, `npm run test:placement`).

Type checking also identified an existing missing `marchSelect` event callback in `src/app/page.tsx`.
