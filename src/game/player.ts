import * as THREE from "three";
import { JUMP_HEIGHT, LANE_COUNT, LANE_CHANGE_TIME, LANE_WIDTH, JUMP_DURATION, laneX } from "./config";
import { applyCarColors, createSportsCar, getSkinColors } from "./carModel";
import type { SkinId } from "./config";

export class Player {
  readonly mesh: THREE.Group;
  lane = 1;
  targetLane = 1;
  x = 0;
  y = 0;
  jumping = false;
  jumpT = 0;
  crashed = false;
  crashT = 0;
  private laneT = 1;
  private fromX = 0;
  private toX = 0;

  constructor(skin: SkinId) {
    this.mesh = createSportsCar(getSkinColors(skin));
    this.x = laneX(this.lane);
    this.mesh.position.set(this.x, 0, 0);
  }

  setSkin(skin: SkinId): void {
    applyCarColors(this.mesh, getSkinColors(skin));
  }

  reset(): void {
    this.lane = 1;
    this.targetLane = 1;
    this.x = laneX(1);
    this.y = 0;
    this.jumping = false;
    this.jumpT = 0;
    this.crashed = false;
    this.crashT = 0;
    this.laneT = 1;
    this.mesh.position.set(this.x, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  shift(dir: -1 | 1): void {
    if (this.crashed) return;
    const next = THREE.MathUtils.clamp(this.targetLane + dir, 0, LANE_COUNT - 1);
    if (next === this.targetLane) return;
    this.fromX = this.x;
    this.targetLane = next;
    this.toX = laneX(next);
    this.laneT = 0;
  }

  jump(): boolean {
    if (this.crashed || this.jumping) return false;
    this.jumping = true;
    this.jumpT = 0;
    return true;
  }

  crash(): void {
    this.crashed = true;
    this.crashT = 0;
  }

  update(dt: number, speed: number): void {
    if (this.crashed) {
      this.crashT += dt;
      this.mesh.rotation.x = Math.min(0.8, this.crashT * 1.6);
      this.mesh.rotation.z = Math.sin(this.crashT * 14) * 0.18;
      this.mesh.position.y = Math.max(0, this.y + this.crashT * 1.8);
      return;
    }

    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / LANE_CHANGE_TIME);
      const eased = 1 - Math.pow(1 - this.laneT, 3);
      this.x = THREE.MathUtils.lerp(this.fromX, this.toX, eased);
      if (this.laneT >= 1) this.lane = this.targetLane;
    }

    if (this.jumping) {
      this.jumpT += dt;
      const u = this.jumpT / JUMP_DURATION;
      this.y = Math.sin(Math.min(1, u) * Math.PI) * JUMP_HEIGHT;
      if (u >= 1) {
        this.jumping = false;
        this.y = 0;
      }
    }

    const lateral = this.laneT < 1 ? (this.toX - this.fromX) / LANE_WIDTH : 0;
    const lean = lateral * Math.sin(this.laneT * Math.PI) * 0.16;
    const pitch = this.jumping ? (0.5 - this.jumpT / JUMP_DURATION) * 0.28 : 0;
    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.set(pitch, 0, -lean);

    const wheels = this.mesh.userData.wheels as THREE.Group[];
    const spin = (speed * dt) / 0.38;
    for (const wheel of wheels) wheel.rotation.x += spin;
  }

  airborneEnough(): boolean {
    return this.y > 1.05;
  }
}
