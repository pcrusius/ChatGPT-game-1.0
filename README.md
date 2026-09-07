# Apex Rush

A 3D endless racer for the browser. You drive a mid-engine supercar down a three-lane highway
that never ends, threading traffic, jumping hurdles, banking gold coins and unlocking paint.

Built with [Vite](https://vite.dev), TypeScript and [Three.js](https://threejs.org). No assets
are loaded from disk: every mesh, texture and sound is generated in code at start-up.

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

```bash
npm run build     # type-checks with tsc --noEmit, then bundles
npm run preview   # serves the production build on :4173
```

## Hosting it

The build in `dist/` is a static site with no backend and no asset files — every mesh, texture
and sound is generated in code at startup — so it can be dropped on any static host.

`.github/workflows/pages.yml` builds and publishes to GitHub Pages on every push to `main`.
It needs Pages switched on for the repository with **Source: GitHub Actions**, and Pages only
covers private repositories on paid plans, so a private repo has to be made public first.

Any other static host works with zero configuration: point it at this repository, build command
`npm run build`, output directory `dist`. A host that serves the site from a subdirectory rather
than a domain root needs the bundle linked from that prefix, which the `PUBLIC_BASE` environment
variable sets at build time (`PUBLIC_BASE=/my-repo/ npm run build`).

## Controls

| Key | Action |
| --- | --- |
| `←` / `→` (or `A` / `D`) | Change lane |
| `SPACE` | Jump |
| `ESC` | Pause / resume |
| `R` | Restart |
| `ENTER` | Start a run from the menu |
| `F3` | Frame-timing and draw-call overlay |

## Gameplay

The car accelerates on its own, from 36 m/s to a 92 m/s ceiling, along a curve that is
forgiving for the first few hundred metres and relentless afterwards. Score climbs with
distance and is multiplied by a bonus that grows with coin streaks, near misses and every
1 000 points banked. Coins go into a permanent wallet you spend in the garage.

Hazards come in three kinds:

- **Traffic** and **stopped vehicles** end the run on contact. Shaving past one scores a near
  miss and bumps the multiplier.
- **Barricades** and **lane closures** are solid, and are flagged ahead by cones.
- **Barriers**, **hurdles** and **roadblocks** are low enough to jump, and usually have a coin
  arc over them for players who commit.

### Never an unwinnable road

Patterns are emitted one at a time with a gap sized from the current speed, and each one leaves
a lane open. That alone is not enough: static obstacles close on the player faster than slower
traffic does, so a barricade dropped far ahead eventually draws level with a car it was never
grouped with, and two survivable patterns can merge into a wall. Every solid spawn is therefore
simulated forward against the live field and rejected if it would ever complete a three-lane
wall before it reaches the player (`Director.sealsRoad`). `npm run spec` asserts the invariant
across roughly 11 minutes of simulated driving.

### Environments

Three themes cycle every 1 500 m and cross-fade over the last 260 m — sky, fog, light colour and
direction, terrain, road tint and the roadside prop mix all blend together:

| Theme | Look |
| --- | --- |
| Pacific Coast | Midday sun, green headlands, palms, ocean on the horizon |
| Mesa Sunset | Low warm sun, long shadows, red rock mesas and cacti |
| Neon Mile | Night city, emissive windows, neon signs, headlight pool on the asphalt |

### Challenges and the garage

Six challenges pay coin rewards; five are per-run and one is cumulative.

| Challenge | Reward |
| --- | --- |
| Drive 1 000 m in one run | 40 |
| Collect 25 coins in one run | 30 |
| Clear 3 jumps in one run | 20 |
| Score 3 near misses in one run | 25 |
| Reach 300 km/h | 50 |
| Bank 200 coins in total | 60 |

Four paint jobs are sold in the garage, where the car sits on a lit turntable:

| Skin | Price |
| --- | --- |
| Crimson | free |
| Aero Blue | 50 |
| Midnight | 120 |
| Apex Gold | 300 |

The wallet, high score, best distance, run count, owned and selected skins, challenge progress
and the audio and graphics settings are saved to `localStorage` under `apex-rush-save-v2`.

## Performance

The game targets 60 FPS on integrated graphics, and the shape of the frame is what keeps it
there rather than any single trick:

- **One draw call per material role, not per object.** Traffic, obstacles, coins, scenery and
  every wheel in the scene are instanced. A busy frame is about 75 draw calls and 34 k triangles.
- **Fixed pools, no allocation in the loop.** Entities, particles, wheels and ground shadows are
  preallocated; the update path allocates nothing, so there is no steady-state GC.
- **Shared materials and textures.** Nothing in the loop clones a material, so the program count
  stays flat. The menu even reuses the run's two lights rather than adding studio ones, because
  changing the scene's light count would recompile every shader on the way into a run.
- **Distance-based detail.** Wheels lose their rims beyond a set distance, scenery recycles in
  slots out in the fog, and the shadow frustum is a tight box that tracks the car.
- **Capped pixel ratio** (1.5 at most) plus AUTO/LOW/MEDIUM/HIGH tiers that scale pixel ratio,
  shadow map size, scenery density, particle count and post effects. AUTO drops a tier if the
  frame rate cannot hold up.

`F3` shows FPS, worst frame, draw calls, triangles, programs, pixel ratio and entity count.

## Where the major systems live

| File | Responsibility |
| --- | --- |
| `src/game/game.ts` | Renderer, scene graph, run loop, state machine, collisions and scoring |
| `src/game/director.ts` | Hazard patterns, difficulty ramp and the survivability guard |
| `src/game/entities.ts` | Pooled traffic, obstacles, coins and decor, drawn as instanced sets |
| `src/game/player.ts` | Lane changes, jump arc, suspension, body lean and crash tumble |
| `src/game/camera.ts` | Chase camera springs, speed FOV, impulses, menu and garage framing |
| `src/game/effects.ts` | Pooled particle system and the soft ground-shadow pass |
| `src/game/audio.ts` | WebAudio engine note, wind, and one-shot effects |
| `src/game/storage.ts` | Save file, challenge tracking and rewards |
| `src/game/config.ts` | Tuning constants and skin definitions |
| `src/render/geom.ts` | Geometry helpers: lofts, superellipse sections, bevelled solids |
| `src/render/vehicles.ts` | Player supercar, five traffic archetypes, shared wheel system |
| `src/render/materials.ts` | The whole material library, built once |
| `src/render/textures.ts` | Canvas-generated road, window, glow, foliage and poster textures |
| `src/world/world.ts` | Sky, lights, fog, terrain, horizon and theme blending |
| `src/world/road.ts` | Road surface, markings, guardrails, gantries, signs and lighting |
| `src/world/scenery.ts` | Instanced roadside props, recycled in slots per theme |
| `src/world/themes.ts` | The three environments and the blend between them |
| `src/core/quality.ts` | Quality tiers and the adaptive downgrade watchdog |
| `src/main.ts` | DOM wiring: menu, garage, settings, HUD, pause and game over |

## Tooling

All of these drive a real Chrome against the production build (`npm run preview` first).

| Command | What it does |
| --- | --- |
| `npm run spec` | 73-check behaviour spec: state machine, controls, collisions, coins, scoring, persistence, garage economy, settings and the survivability invariant |
| `npm run profile` | Frame cost: JS time per frame, WebGL calls, draw calls, triangles, programs |
| `npm run breakdown` | Triangle and draw-call budget broken down by object |
| `node tools/shots.mjs <url> <dir>` | Screenshots of every screen and every theme |
| `node tools/car.mjs <url> <dir>` | Close-ups of the player car from five angles |
| `node tools/demo.mjs <url> <file>` | Deterministic gameplay video, rendered frame by frame |

The box these were written on has no GPU, so the spec steps the simulation directly instead of
rendering, and `profile` reports hardware-independent numbers (JS time per frame and WebGL calls
per frame) alongside the software rasteriser's own timings.
