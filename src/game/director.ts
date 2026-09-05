import { LANE_COUNT, MAX_SPEED, SPAWN_DISTANCE, START_SPEED, laneX } from "./config";
import type { EntityField } from "./entities";
import type { VehicleKind } from "../render/vehicles";

const JUMPABLE = ["barrier", "hurdle", "roadblock"] as const;
const BLOCKERS = ["barricade", "laneClosure"] as const;
const TRAFFIC: VehicleKind[] = ["sedan", "suv", "sports", "van", "pickup"];

export interface DifficultyState {
  /** 0 while the run is still teaching, ramping to 1 once patterns are at full pressure. */
  pressure: number;
  label: string;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Decides what the road throws at the player. Patterns are emitted one at a time with a gap
 * sized from current speed, and every pattern leaves at least one lane clear, so a run can
 * always be survived with correct play.
 */
export class Director {
  private nextSpawnZ = -SPAWN_DISTANCE;
  private lastFreeLane = 1;
  private patternsSpawned = 0;
  private coinStreakLane = 1;

  reset(): void {
    this.nextSpawnZ = -SPAWN_DISTANCE;
    this.lastFreeLane = 1;
    this.patternsSpawned = 0;
    this.coinStreakLane = 1;
  }

  difficulty(distance: number): DifficultyState {
    if (distance < 320) return { pressure: 0.12, label: "WARM UP" };
    if (distance < 900) return { pressure: 0.42, label: "PUSHING" };
    if (distance < 1900) return { pressure: 0.68, label: "FAST" };
    if (distance < 3200) return { pressure: 0.86, label: "RELENTLESS" };
    return { pressure: 1, label: "APEX" };
  }

  /**
   * `scroll` is how far the world moved this frame; spawn positions are tracked in the same
   * moving frame so gaps stay speed-correct.
   */
  update(scroll: number, distance: number, speed: number, field: EntityField): void {
    this.nextSpawnZ += scroll;
    if (this.nextSpawnZ < -SPAWN_DISTANCE) return;

    const { pressure } = this.difficulty(distance);
    const gap = this.emitPattern(field, pressure, speed, -SPAWN_DISTANCE);
    this.nextSpawnZ = -SPAWN_DISTANCE - gap;
    this.patternsSpawned += 1;
  }

  /** Returns the metres of clear road to leave before the next pattern. */
  private emitPattern(field: EntityField, pressure: number, speed: number, z: number): number {
    // Minimum reaction distance: enough road to complete a lane change plus a margin.
    const reaction = speed * (1.35 - pressure * 0.45);
    const roll = Math.random();

    // The first few patterns teach the two verbs before anything is combined.
    if (this.patternsSpawned === 0) {
      this.singleBlocker(field, z, 1);
      this.coinTrail(field, z - 26, this.lastFreeLane, 5);
      return reaction + 46;
    }
    if (this.patternsSpawned === 1) {
      this.jumpRow(field, z, true);
      return reaction + 44;
    }

    if (roll < 0.12 + pressure * 0.05) {
      this.coinShape(field, z);
      return reaction * 0.6 + 20;
    }
    if (roll < 0.34) {
      this.singleBlocker(field, z, pressure > 0.5 ? 2 : 1);
      return reaction + 30 - pressure * 8;
    }
    if (roll < 0.52) {
      this.jumpRow(field, z, Math.random() < 0.72);
      return reaction + 30 - pressure * 8;
    }
    if (roll < 0.7) {
      this.movingTraffic(field, z, pressure);
      return reaction + 36 - pressure * 10;
    }
    if (roll < 0.86 && pressure > 0.35) {
      this.twoLaneSqueeze(field, z, pressure);
      return reaction + 40 - pressure * 10;
    }
    if (pressure > 0.55) {
      this.stagger(field, z, pressure);
      return reaction + 52 - pressure * 12;
    }
    this.singleBlocker(field, z, 1);
    return reaction + 34;
  }

  private randomLane(exclude = -1): number {
    let lane = Math.floor(Math.random() * LANE_COUNT);
    if (lane === exclude) lane = (lane + 1 + Math.floor(Math.random() * (LANE_COUNT - 1))) % LANE_COUNT;
    return lane;
  }

  /** One blocked lane, with optional advance-warning cones. */
  private singleBlocker(field: EntityField, z: number, count: number): void {
    const lane = this.randomLane();
    const key = Math.random() < 0.55 ? pick(BLOCKERS) : "stoppedVehicle";
    if (key === "stoppedVehicle") {
      field.spawnVehicle(Math.random() < 0.3 ? "truck" : pick(TRAFFIC), laneX(lane), z, 0);
    } else {
      field.spawnObstacle(key, laneX(lane), z);
      this.warningCones(field, lane, z - 13);
    }
    this.lastFreeLane = this.randomLane(lane);
    // Reward the safe line with a coin trail.
    this.coinTrail(field, z - 6, this.lastFreeLane, 3 + count);
  }

  /** A jumpable obstacle spanning the road, with a coin arc for players who commit. */
  private jumpRow(field: EntityField, z: number, arc: boolean): void {
    const key = pick(JUMPABLE);
    const lane = this.randomLane();
    field.spawnObstacle(key, laneX(lane), z);
    if (Math.random() < 0.45) {
      const second = (lane + 1) % LANE_COUNT;
      field.spawnObstacle(key, laneX(second), z);
      this.lastFreeLane = (lane + 2) % LANE_COUNT;
    } else {
      this.lastFreeLane = lane;
    }
    this.warningCones(field, lane, z - 14);
    if (arc) this.coinArc(field, z, lane);
  }

  /** Two lanes blocked, one clear; the classic "pick the gap" pattern. */
  private twoLaneSqueeze(field: EntityField, z: number, pressure: number): void {
    const free = Math.floor(Math.random() * LANE_COUNT);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (lane === free) continue;
      if (Math.random() < 0.5) {
        field.spawnVehicle(pick(TRAFFIC), laneX(lane), z + (Math.random() - 0.5) * 6, 0);
      } else {
        field.spawnObstacle(pick(BLOCKERS), laneX(lane), z);
      }
    }
    this.lastFreeLane = free;
    this.coinTrail(field, z - 10, free, 4 + Math.round(pressure * 4));
  }

  /** Obstacles offset along the road, forcing a sequence of lane changes. */
  private stagger(field: EntityField, z: number, pressure: number): void {
    const first = Math.floor(Math.random() * LANE_COUNT);
    const second = (first + 1 + Math.floor(Math.random() * (LANE_COUNT - 1))) % LANE_COUNT;
    field.spawnVehicle(pick(TRAFFIC), laneX(first), z, 0);
    const spacing = 24 + (1 - pressure) * 16;
    field.spawnObstacle(pick(BLOCKERS), laneX(second), z - spacing);
    // With three lanes the untouched one is whatever is left over from 0 + 1 + 2.
    this.lastFreeLane = 3 - first - second;
    this.coinTrail(field, z - spacing / 2, this.lastFreeLane, 5);
  }

  /** Slower-moving traffic the player overtakes; the main source of near misses. */
  private movingTraffic(field: EntityField, z: number, pressure: number): void {
    const lane = this.randomLane();
    const relative = 8 + Math.random() * 12 + pressure * 6;
    const speed = Math.max(START_SPEED * 0.35, Math.min(MAX_SPEED, relative));
    const entity = field.spawnVehicle(pick(TRAFFIC), laneX(lane), z, speed);
    // Occasionally let a car ease across into a neighbouring lane, but never into the player.
    if (entity && pressure > 0.5 && Math.random() < 0.3) {
      const dir = lane === 0 ? 1 : lane === LANE_COUNT - 1 ? -1 : Math.random() < 0.5 ? -1 : 1;
      entity.driftTarget = dir * 3.6;
    }
    if (Math.random() < 0.3 + pressure * 0.3) {
      const second = this.randomLane(lane);
      field.spawnVehicle(pick(TRAFFIC), laneX(second), z - 18 - Math.random() * 14, speed * 0.8);
      this.lastFreeLane = 3 - lane - second;
    } else {
      this.lastFreeLane = this.randomLane(lane);
    }
    this.coinTrail(field, z - 8, this.lastFreeLane, 4);
  }

  private warningCones(field: EntityField, lane: number, z: number): void {
    const x = laneX(lane);
    field.spawnDecor("cone", x - 1.1, z);
    field.spawnDecor("cone", x + 1.1, z);
    field.spawnDecor("cone", x, z + 6);
  }

  private coinTrail(field: EntityField, z: number, lane: number, count: number): void {
    const x = laneX(lane);
    for (let i = 0; i < count; i++) {
      field.spawnCoin(x, 1.05, z - i * 4.2);
    }
    this.coinStreakLane = lane;
  }

  /** Coins arcing over a jumpable obstacle, timed to the jump trajectory. */
  private coinArc(field: EntityField, z: number, lane: number): void {
    const x = laneX(lane);
    const count = 7;
    const span = 26;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const height = 0.95 + Math.sin(t * Math.PI) * 1.85;
      field.spawnCoin(x, height, z - span / 2 + t * span);
    }
  }

  /** Decorative coin geometry: zigzags, clusters and risky lines beside the shoulder. */
  private coinShape(field: EntityField, z: number): void {
    const shape = Math.random();
    if (shape < 0.34) {
      // Zigzag across the lanes.
      let lane = this.coinStreakLane;
      for (let i = 0; i < 10; i++) {
        field.spawnCoin(laneX(lane), 1.05, z - i * 4.6);
        if (i % 2 === 1) lane = Math.max(0, Math.min(LANE_COUNT - 1, lane + (Math.random() < 0.5 ? -1 : 1)));
      }
    } else if (shape < 0.67) {
      // Cluster: three lanes wide, short and dense.
      for (let row = 0; row < 3; row++) {
        for (let lane = 0; lane < LANE_COUNT; lane++) {
          if (Math.random() < 0.45) continue;
          field.spawnCoin(laneX(lane), 1.05, z - row * 5);
        }
      }
    } else {
      // Risky line hugging a blocker, worth more coins for a tighter line.
      const lane = this.randomLane();
      field.spawnObstacle(pick(BLOCKERS), laneX(lane), z - 22);
      const beside = lane === 0 ? 1 : lane === LANE_COUNT - 1 ? LANE_COUNT - 2 : lane + 1;
      for (let i = 0; i < 8; i++) {
        field.spawnCoin(laneX(beside), 1.05, z - i * 4.4);
      }
      this.warningCones(field, lane, z - 34);
    }
  }
}
