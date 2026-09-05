import * as THREE from "three";
import { MAX_SPEED, START_SPEED } from "./config";

export type CameraMode = "chase" | "menu" | "garage" | "frozen";

const CHASE = {
  height: 2.95,
  distance: 9.4,
  lookHeight: 1.15,
  lookAhead: 16,
};

const SCRATCH = new THREE.Vector3();

/**
 * Chase camera with deliberate lag. Position and aim are separate springs, FOV opens up with
 * speed, and short impulses cover landings and crashes without making the view unreadable.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = "menu";
  private readonly position = new THREE.Vector3(0, CHASE.height, CHASE.distance);
  private readonly look = new THREE.Vector3(0, CHASE.lookHeight, -CHASE.lookAhead);
  private readonly targetPosition = new THREE.Vector3();
  private readonly targetLook = new THREE.Vector3();

  private shake = 0;
  private shakeDecay = 3;
  private impulse = 0;
  private roll = 0;
  private fov = 62;
  private garageAngle = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.4, 2600);
    this.camera.position.copy(this.position);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode === "garage") this.garageAngle = 0.6;
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Snaps the rig to its steady-state chase pose so a run never opens mid-swoop. */
  snapToChase(playerX: number): void {
    this.mode = "chase";
    this.position.set(playerX * 0.5, CHASE.height, CHASE.distance);
    this.look.set(playerX * 0.6, CHASE.lookHeight, -CHASE.lookAhead);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.look);
    this.shake = 0;
    this.impulse = 0;
    this.roll = 0;
  }

  kick(strength: number, decay = 3): void {
    this.shake = Math.max(this.shake, strength);
    this.shakeDecay = decay;
  }

  /** Vertical nudge used for landings; reads as the suspension loading the chassis. */
  bump(strength: number): void {
    this.impulse -= strength;
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    speed: number,
    lateralVelocity: number,
    crashed: boolean,
  ): void {
    // "frozen" hands camera control to the caller; used by the screenshot tooling.
    if (this.mode === "frozen") return;

    if (this.mode === "garage") {
      // Slow orbit around the car, offset right so the garage panel never covers it.
      this.garageAngle += dt * 0.26;
      const radius = 7.6;
      this.camera.position.set(
        Math.sin(this.garageAngle) * radius + 2.4,
        1.9 + Math.sin(this.garageAngle * 0.7) * 0.45,
        Math.cos(this.garageAngle) * radius,
      );
      this.camera.lookAt(2.4, 0.68, 0);
      this.applyFov(dt, 38);
      return;
    }

    if (this.mode === "menu") {
      this.garageAngle += dt * 0.12;
      // Framed to keep the car in the right two thirds, clear of the menu panel.
      this.camera.position.set(
        -5.4 + Math.sin(this.garageAngle * 0.6) * 0.7,
        1.95,
        7.4 + Math.cos(this.garageAngle * 0.5) * 1.1,
      );
      this.camera.lookAt(2.3, 0.72, -2.6);
      this.applyFov(dt, 48);
      return;
    }

    const speedT = THREE.MathUtils.clamp(
      (speed - START_SPEED) / (MAX_SPEED - START_SPEED),
      0,
      1,
    );

    // Camera drops and pulls back a little as speed builds.
    this.targetPosition.set(
      playerX * 0.62,
      CHASE.height + playerY * 0.42 - speedT * 0.28 + this.impulse,
      CHASE.distance + speedT * 0.5,
    );
    this.targetLook.set(
      playerX * 0.86 + lateralVelocity * 0.06,
      CHASE.lookHeight + playerY * 0.7,
      -CHASE.lookAhead - speedT * 6,
    );

    if (crashed) {
      this.targetPosition.y += 0.9;
      this.targetPosition.z += 1.6;
    }

    // Two springs: the aim point leads, the body follows, which is what creates the lag.
    const posLerp = Math.min(1, dt * (crashed ? 2.4 : 6.2));
    const lookLerp = Math.min(1, dt * (crashed ? 3.2 : 9.5));
    this.position.lerp(this.targetPosition, posLerp);
    this.look.lerp(this.targetLook, lookLerp);

    this.impulse += (0 - this.impulse) * Math.min(1, dt * 7);

    this.shake *= Math.exp(-this.shakeDecay * dt);
    const jitter = this.shake;
    SCRATCH.copy(this.position);
    if (jitter > 0.001) {
      SCRATCH.x += (Math.random() - 0.5) * jitter;
      SCRATCH.y += (Math.random() - 0.5) * jitter * 0.8;
      SCRATCH.z += (Math.random() - 0.5) * jitter * 0.4;
    }
    this.camera.position.copy(SCRATCH);
    this.camera.lookAt(this.look);

    // A touch of counter-roll during lane changes; strictly small to stay readable.
    const rollTarget = THREE.MathUtils.clamp(-lateralVelocity * 0.006, -0.05, 0.05);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 5);
    this.camera.rotateZ(this.roll);

    this.applyFov(dt, 60 + speedT * 15 + jitter * 3);
  }

  private applyFov(dt: number, target: number): void {
    this.fov += (target - this.fov) * Math.min(1, dt * 3.2);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
