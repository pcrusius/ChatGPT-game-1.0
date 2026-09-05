import {
  changeDirection,
  chooseDirection,
  createGame,
  step,
  type Direction,
  type GameState,
} from "./game";
import "./style.css";

const COLS = 20;
const ROWS = 20;
const TICK_MS = 110;

// Opt-in attract/demo mode (http://localhost:5173/?demo=1): the snake autopilots
// toward the food so the full game loop can be demonstrated hands-free.
const DEMO = new URLSearchParams(window.location.search).has("demo");

const canvas = document.getElementById("board") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const scoreEl = document.getElementById("score") as HTMLElement;
const bestEl = document.getElementById("best") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

const cellW = canvas.width / COLS;
const cellH = canvas.height / ROWS;

let state: GameState = createGame(COLS, ROWS);
let best = 0;
let started = false;
let paused = false;
let lastTick = 0;
let raf = 0;

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};

function reset(): void {
  state = createGame(COLS, ROWS);
  started = DEMO;
  paused = false;
  lastTick = 0;
  setStatus(DEMO ? "Demo mode — autopilot" : "Press an arrow key or WASD to start", false);
  render();
}

function setStatus(text: string, gameOver: boolean): void {
  statusEl.textContent = text;
  statusEl.classList.toggle("game-over", gameOver);
}

function render(): void {
  ctx.fillStyle = "#0b0c1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Food
  ctx.fillStyle = "#f472b6";
  drawCell(state.food.x, state.food.y, 0.5);

  // Snake
  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#4ade80" : "#22c55e";
    drawCell(seg.x, seg.y, i === 0 ? 0.2 : 0.15);
  });

  scoreEl.textContent = `Score: ${state.score}`;
  bestEl.textContent = `Best: ${best}`;
}

function drawCell(gx: number, gy: number, roundFactor: number): void {
  const pad = 1;
  const x = gx * cellW + pad;
  const y = gy * cellH + pad;
  const w = cellW - pad * 2;
  const h = cellH - pad * 2;
  const r = Math.min(w, h) * roundFactor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function loop(timestamp: number): void {
  raf = requestAnimationFrame(loop);
  if (!started || paused || state.gameOver) {
    return;
  }
  if (timestamp - lastTick < TICK_MS) {
    return;
  }
  lastTick = timestamp;
  if (DEMO) {
    changeDirection(state, chooseDirection(state));
  }
  step(state);
  if (state.gameOver) {
    best = Math.max(best, state.score);
    setStatus(`Game over! Score ${state.score}. Press R to restart.`, true);
    if (DEMO) {
      // Keep the attract loop going.
      setTimeout(reset, 1200);
    }
  }
  render();
}

window.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "r" || e.key === "R") {
    reset();
    return;
  }
  if (e.key === " ") {
    e.preventDefault();
    if (started && !state.gameOver) {
      paused = !paused;
      setStatus(paused ? "Paused" : "", false);
    }
    return;
  }
  const dir = KEY_TO_DIR[e.key];
  if (!dir) {
    return;
  }
  e.preventDefault();
  if (!started) {
    started = true;
    setStatus("", false);
  }
  changeDirection(state, dir);
});

reset();
raf = requestAnimationFrame(loop);

// Guard against hot-reload leaking multiple loops during development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => cancelAnimationFrame(raf));
}
