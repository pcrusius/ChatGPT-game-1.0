import { describe, expect, it } from "vitest";
import {
  changeDirection,
  createGame,
  spawnFood,
  step,
  type GameState,
} from "./game";

/** RNG that always returns 0 so food lands on the first free cell. */
const firstCellRng = () => 0;

function withoutFood(state: GameState): GameState {
  // Move food far away so plain steps never accidentally eat it.
  state.food = { x: -5, y: -5 };
  return state;
}

describe("createGame", () => {
  it("starts with a length-3 snake moving right", () => {
    const g = createGame(20, 20, firstCellRng);
    expect(g.snake).toHaveLength(3);
    expect(g.direction).toBe("right");
    expect(g.gameOver).toBe(false);
    expect(g.score).toBe(0);
  });

  it("places food on an empty cell", () => {
    const g = createGame(20, 20, firstCellRng);
    const onSnake = g.snake.some((p) => p.x === g.food.x && p.y === g.food.y);
    expect(onSnake).toBe(false);
  });
});

describe("step movement", () => {
  it("moves the head one cell in the current direction", () => {
    const g = withoutFood(createGame(20, 20, firstCellRng));
    const head = { ...g.snake[0] };
    step(g);
    expect(g.snake[0]).toEqual({ x: head.x + 1, y: head.y });
    expect(g.snake).toHaveLength(3);
  });
});

describe("direction changes", () => {
  it("ignores reversing directly onto the neck", () => {
    const g = withoutFood(createGame(20, 20, firstCellRng));
    changeDirection(g, "left");
    step(g);
    // Still moving right, not left.
    expect(g.direction).toBe("right");
  });

  it("allows turning perpendicular", () => {
    const g = withoutFood(createGame(20, 20, firstCellRng));
    changeDirection(g, "up");
    step(g);
    expect(g.direction).toBe("up");
  });
});

describe("collisions", () => {
  it("ends the game when hitting a wall", () => {
    const g = withoutFood(createGame(3, 3, firstCellRng));
    // Head starts at x=1, moving right toward x=2 then x=3 (out of bounds).
    step(g); // x -> 2
    expect(g.gameOver).toBe(false);
    step(g); // x -> 3, out of bounds
    expect(g.gameOver).toBe(true);
  });

  it("ends the game when the snake hits itself", () => {
    const g = withoutFood(createGame(20, 20, firstCellRng));
    // A coiled snake whose head moves right into a body segment (not the tail,
    // which vacates on the same tick). Indices 0..6, head at (5,5).
    g.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 5 },
      { x: 7, y: 5 },
    ];
    g.direction = "right";
    g.pendingDirection = "right";
    step(g); // head -> (6,5), which is an occupied body cell
    expect(g.gameOver).toBe(true);
  });

  it("does not advance after game over", () => {
    const g = withoutFood(createGame(3, 3, firstCellRng));
    step(g);
    step(g);
    const snapshot = JSON.stringify(g.snake);
    step(g);
    expect(JSON.stringify(g.snake)).toBe(snapshot);
  });
});

describe("eating", () => {
  it("grows the snake and increments score when eating food", () => {
    const g = createGame(20, 20, firstCellRng);
    // Put food directly ahead of the head.
    g.food = { x: g.snake[0].x + 1, y: g.snake[0].y };
    step(g, firstCellRng);
    expect(g.score).toBe(1);
    expect(g.snake).toHaveLength(4);
  });
});

describe("spawnFood", () => {
  it("never spawns on the snake", () => {
    const g = createGame(5, 5, firstCellRng);
    for (let i = 0; i < 50; i++) {
      const f = spawnFood(g, Math.random);
      const onSnake = g.snake.some((p) => p.x === f.x && p.y === f.y);
      expect(onSnake).toBe(false);
    }
  });

  it("returns a sentinel when the board is full", () => {
    const g = createGame(2, 1, firstCellRng);
    g.snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    expect(spawnFood(g)).toEqual({ x: -1, y: -1 });
  });
});
