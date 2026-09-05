export interface Point {
  x: number;
  y: number;
}

export type Direction = "up" | "down" | "left" | "right";

export interface GameState {
  readonly cols: number;
  readonly rows: number;
  snake: Point[];
  direction: Direction;
  pendingDirection: Direction;
  food: Point;
  score: number;
  gameOver: boolean;
}

const DELTAS: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

/**
 * Deterministic RNG hook so tests can control food placement.
 * Defaults to Math.random in the running game.
 */
export type Rng = () => number;

export function createGame(cols = 20, rows = 20, rng: Rng = Math.random): GameState {
  const start: Point = { x: Math.floor(cols / 2), y: Math.floor(rows / 2) };
  const snake = [start, { x: start.x - 1, y: start.y }, { x: start.x - 2, y: start.y }];
  const state: GameState = {
    cols,
    rows,
    snake,
    direction: "right",
    pendingDirection: "right",
    food: { x: 0, y: 0 },
    score: 0,
    gameOver: false,
  };
  state.food = spawnFood(state, rng);
  return state;
}

/** Queue a direction change, ignoring reversals into the snake's own neck. */
export function changeDirection(state: GameState, next: Direction): void {
  if (next === OPPOSITE[state.direction]) {
    return;
  }
  state.pendingDirection = next;
}

/** Pick a random empty cell for the next food. Returns {-1,-1} when the board is full. */
export function spawnFood(state: GameState, rng: Rng = Math.random): Point {
  const occupied = new Set(state.snake.map((p) => `${p.x},${p.y}`));
  const free: Point[] = [];
  for (let y = 0; y < state.rows; y++) {
    for (let x = 0; x < state.cols; x++) {
      if (!occupied.has(`${x},${y}`)) {
        free.push({ x, y });
      }
    }
  }
  if (free.length === 0) {
    return { x: -1, y: -1 };
  }
  return free[Math.floor(rng() * free.length)];
}

/** Is `cell` a legal, non-fatal move target on this tick (in bounds, not into the body)? */
function isSafe(state: GameState, cell: Point): boolean {
  if (cell.x < 0 || cell.y < 0 || cell.x >= state.cols || cell.y >= state.rows) {
    return false;
  }
  const eating = cell.x === state.food.x && cell.y === state.food.y;
  const body = eating ? state.snake : state.snake.slice(0, -1);
  return !body.some((p) => p.x === cell.x && p.y === cell.y);
}

/**
 * Greedy autopilot used by the optional demo mode: from the current head, pick a
 * non-reversing, non-fatal direction that minimizes Manhattan distance to the food.
 * Falls back to the current direction when no safe move exists.
 */
export function chooseDirection(state: GameState): Direction {
  const head = state.snake[0];
  const candidates = (Object.keys(DELTAS) as Direction[]).filter(
    (d) => d !== OPPOSITE[state.direction],
  );
  let best: Direction | null = null;
  let bestDist = Infinity;
  for (const dir of candidates) {
    const delta = DELTAS[dir];
    const cell = { x: head.x + delta.x, y: head.y + delta.y };
    if (!isSafe(state, cell)) {
      continue;
    }
    const dist = Math.abs(cell.x - state.food.x) + Math.abs(cell.y - state.food.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  return best ?? state.direction;
}

/**
 * Advance the simulation by one tick. Mutates and returns the state.
 * Handles direction commit, wall/self collisions, eating, and growth.
 */
export function step(state: GameState, rng: Rng = Math.random): GameState {
  if (state.gameOver) {
    return state;
  }

  state.direction = state.pendingDirection;
  const delta = DELTAS[state.direction];
  const head = state.snake[0];
  const next: Point = { x: head.x + delta.x, y: head.y + delta.y };

  const hitsWall = next.x < 0 || next.y < 0 || next.x >= state.cols || next.y >= state.rows;
  if (hitsWall) {
    state.gameOver = true;
    return state;
  }

  const eating = next.x === state.food.x && next.y === state.food.y;

  // The tail cell is free after moving unless we grow this tick.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const hitsSelf = body.some((p) => p.x === next.x && p.y === next.y);
  if (hitsSelf) {
    state.gameOver = true;
    return state;
  }

  state.snake = [next, ...body];

  if (eating) {
    state.score += 1;
    state.food = spawnFood(state, rng);
  }

  return state;
}
