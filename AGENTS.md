# Axie Conquest — Game Direction

## High-level vision

Build a mobile-first 4X strategy game inspired by *Rise of Kingdoms*, set in the Axie Infinity universe. Players develop a Lunacian settlement, gather resources, research technologies, raise armies, explore the world map, join alliances, and compete or cooperate with other players.

The game should feel like an Axie strategy game rather than a generic kingdom builder: Axies are the collectible heroes and their classes, body parts, personalities, and lore should drive progression, combat identity, and visual language.

## Lore and setting

The world is Lunacia, the homeland of the Axies. Lunacia is rebuilding after ancient wars and the fall of older powers. Players are leaders of emerging Axie settlements, restoring ruined districts, protecting their people, uncovering lost history, and competing for control of valuable lands and resources.

Axies are fierce but lovable creatures who can battle, build, explore, gather, and lead. Their body parts are more than cosmetic traits: they reflect inherited abilities and the history of each Axie. Mystics, Origins, and unusual parts should feel rare and story-significant. Ancient ruins, moon-forged relics, chimeras, hostile creatures, and forgotten temples can provide the foundation for quests, discoveries, and seasonal campaigns.

Keep lore hopeful and community-focused. Lunacia is a living digital nation built by its people, with room for friendship, alliance politics, rivalry, exploration, and long-term restoration.

## Core gameplay model

- City building: construct and upgrade resource buildings, troop facilities, defenses, research buildings, alliance structures, and Axie-focused facilities.
- World map: explore a shared/isometric map containing settlements, resource nodes, ruins, monsters, neutral camps, alliance territory, and enemy armies.
- Progression: improve the city, unlock technologies, train troops, level Axie heroes, discover parts, craft equipment, and complete quests.
- Alliances: support alliance membership, territory, shared objectives, reinforcements, rallies, diplomacy, and cooperative events.
- Strategy: emphasize preparation, formations, march timing, scouting, terrain, counters, and commander composition over twitch controls.

## Controls and interaction

- Tap buildings, troops, map objects, and UI icons to select or open them.
- Drag to pan around the city or world map.
- Pinch to zoom in and out.
- Tap a destination or enemy, then choose actions such as march, gather, scout, attack, or reinforce.
- Use bottom/side menus for commanders, troops, alliance, quests, inventory, research, and city management.

## Camera and presentation

- Use 3D-style models, lighting, terrain height, readable silhouettes, and animations.
- Gameplay is viewed from a fixed/isometric top-down camera rather than free full-3D movement.
- Players can pan and zoom, but should not freely rotate the world like in a true 3D game.
- Keep map objects, buildings, troops, and interactive UI targets legible at common mobile zoom levels.

## Axie heroes and parts

Axies are heroes. A hero’s skills are based on its body parts. The six primary parts are eyes, ears, mouth, horn, back, and tail; the body shape and class also contribute to identity.

- Each part can grant an active skill, passive effect, stat modifier, or tactical trait.
- Hero builds should reward meaningful combinations of parts instead of treating parts as decoration only.
- Preserve recognizable Axie classes: Beast, Bug, Bird, Aqua, Plant, Reptile, Mech, Dawn, and Dusk.
- Classes provide broad combat identity; parts provide the specific skill kit and variation within that class.
- Avoid making one class universally strongest. Use clear strengths, weaknesses, counters, and situational value.
- Commander skills should be activated at selected moments, while most troop behavior remains formation- and order-driven.
- Rare or special parts can unlock distinctive skills, visual effects, quest hooks, and collection value without making ordinary Axies irrelevant.

## Combat rules

- Battles mostly use pre-set troop formations and commander skills.
- Players can reposition marches on the map and activate some abilities, rather than directly controlling every unit.
- A march should communicate its commander, troop type, destination, status, and estimated arrival time.
- Combat readability comes first: show target selection, range, formation, health, buffs/debuffs, skill cooldowns, and battle outcomes clearly.
- Terrain, scouting information, troop counters, commander synergy, Axie class, and part-based skills should all matter.

## Current implementation milestone

Follow `IMPLEMENTATION_PLAN.md` for the main base milestone and keep its TODO checklist current as implementation completes.

When writing or updating `IMPLEMENTATION_PLAN.md`, decompose TODO items into nested subtasks when they involve multiple distinct steps or need finer progress tracking. Make each subtask concrete, actionable, and independently verifiable. Keep simple tasks as single checklist items, and mark a parent TODO complete only after all of its subtasks are complete.

Implementation is in `src/game/base.ts` (rules), `src/game/scene.ts` (Babylon scene and input), and `src/app/page.tsx` (HUD). Run `npm run test:placement` for placement and save-validation regression checks. This prototype uses plain CSS and system fonts.

- Implement a 20 x 40 cell settlement grid (5 x 10 building footprints).
- Start with a main hall and a build HUD offering Farm.
- Farms occupy 4 x 4 cells. Show the full grid while building and a green valid / red invalid snapped preview.
- Block overlapping and out-of-bounds placements; provide explicit confirm and cancel controls.
- Support tap selection, drag panning, pinch/wheel zoom, and a fixed isometric camera.
- Persist placed farms locally for this prototype.
- The settlement story is a game-specific adaptation of Lunacia; new relics and quest details are proposed game lore.

## Product and implementation principles

- Design mobile-first touch interactions, with generous hit areas and clear selected/disabled/loading states.
- Build reusable data-driven definitions for Axie classes, parts, skills, buildings, troops, resources, quests, and map objects.
- Keep game rules separate from presentation so the same systems can support city view, world map, battle previews, and future multiplayer features.
- Prefer readable, friendly fantasy art direction: colorful Lunacian environments, expressive Axies, and strong visual hierarchy.
- When adding a feature, connect it to at least one of the pillars: city growth, Axie hero progression, map strategy, alliance play, or Lunacian lore.
