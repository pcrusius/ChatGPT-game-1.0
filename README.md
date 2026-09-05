# ChatGPT-game-1.0

A small browser-based **Snake** game built with [Vite](https://vitejs.dev/) and TypeScript.
The game logic is written as pure, framework-free functions so it can be unit tested
independently of the DOM/canvas rendering.

## Requirements

- Node.js 22+
- npm 10+

## Getting started

```bash
npm install       # install dependencies
npm run dev       # start the dev server at http://localhost:5173
```

Open the printed URL in a browser and use the **arrow keys** or **WASD** to move.
Press **Space** to pause and **R** to restart.

Append `?demo=1` to the URL (e.g. `http://localhost:5173/?demo=1`) to enable a
hands-free **autopilot/attract mode** that steers the snake toward the food
automatically — handy for quickly verifying the game loop end to end.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (hot reload) on port 5173. |
| `npm run build` | Type-check and produce a production build in `dist/`. |
| `npm run preview` | Serve the production build locally. |
| `npm run lint` | Lint all TypeScript with ESLint (zero warnings allowed). |
| `npm run typecheck` | Run the TypeScript compiler in no-emit mode. |
| `npm test` | Run the Vitest unit-test suite. |

## Project layout

```
index.html          # App entry, mounts the canvas and HUD
src/
  main.ts           # Rendering + input glue (DOM/canvas)
  game.ts           # Pure game logic (movement, collisions, food, scoring)
  game.test.ts      # Unit tests for the game logic
  style.css         # Styling
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:
`npm install` provisions dependencies and a `dev-server` terminal runs `npm run dev`
on port 5173.
