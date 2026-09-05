# Apex Rush

A 3D endless racing game for the browser. You drive a sports car down a three-lane
highway that never ends, dodging traffic and barriers, jumping hurdles, and collecting
gold coins to unlock new paint jobs.

Built with [Vite](https://vite.dev), TypeScript and [Three.js](https://threejs.org).

## Running it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

To produce a production build:

```bash
npm run build
```

`npm run build` type-checks with `tsc --noEmit` before bundling, so type errors fail the build.

## Controls

| Key | Action |
| --- | --- |
| `←` / `→` (or `A` / `D`) | Change lane |
| `SPACE` | Jump |
| `R` | Restart after crashing |
| `ENTER` | Start a run from the menu |

## Gameplay

Your car accelerates on its own and keeps getting faster, from 38 m/s up to 86 m/s.
Score climbs with distance travelled. Coins add to a permanent bank you spend in the garage.

Obstacles come in three kinds:

- **Traffic cars** and **concrete barriers** end your run on contact.
- **Hurdles** are low, so you can jump them.

Obstacle groups are generated from a set of patterns. Every pattern reports which lanes stay
survivable, and the generator only opens lanes the player can actually reach from the previous
group, so a run can never become mathematically impossible. Harder patterns become more likely
as the distance grows.

## Garage

Four paint jobs are available. Crimson is free; the others are bought with banked coins.

| Skin | Price |
| --- | --- |
| Crimson | free |
| Aero Blue | 50 |
| Midnight | 120 |
| Apex Gold | 300 |

Total coins, purchased skins, the selected skin and the high score are saved to `localStorage`
under the `apex-rush-save-v1` key.

## Where the major systems live

| File | Responsibility |
| --- | --- |
| `src/game/game.ts` | Game loop, state machine, collisions, scoring and speed ramp |
| `src/game/carModel.ts` | Procedural sports car geometry, materials and skin repainting |
| `src/game/world.ts` | Highway, lane markings, guardrails, scenery, sky, fog and lighting |
| `src/game/obstacles.ts` | Obstacle/coin entities, object pooling and pattern generation |
| `src/game/player.ts` | Lane changing, jumping, body lean and wheel rotation |
| `src/game/cameraRig.ts` | Third-person chase camera, menu/garage framing and crash shake |
| `src/game/effects.ts` | Additive particle system for coins, tire smoke and crashes |
| `src/game/storage.ts` | `localStorage` save/load |
| `src/game/config.ts` | Tuning constants and skin definitions |
| `src/main.ts` | DOM/HUD wiring, start screen, game over screen and garage |
