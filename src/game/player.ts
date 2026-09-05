import * as THREE from "three";
import {
  JUMP_DURATION,
  JUMP_HEIGHT,
  LANE_CHANGE_TIME,
  LANE_COUNT,
  laneX,
  skinById,
  type SkinId,
} from "./config";
import type { Materials } from "../render/materials";
import { VehicleView, WheelSystem, vehicleModels } from "../render/vehicles";

const GRAVITY = (8 * JUMP_HEIGHT) / (JUMP_DURATION * JUMP_DURATION);
const LAUNCH_SPEED = (4 * JUMP_HEIGHT) / JUMP_DURATION;

export type PlayerEvent = "jump" | "land" | "laneChange";

/**
 * Player car state and animation. Lane changes are eased, the jump is a real ballistic arc,
 * and a critically damped spring drives suspension squat so takeoff and landing have weight.
 */
export class Player {
  readonly view: VehicleView;
  readonly group: THREE.Group;

  lane = 1;
  x = 0;
  y = 0;
  /** Vertical velocity while airborne. */
  private vy = 0;
  airborne = false;
  crashed = false;

  private laneFrom = 0;
  private laneTo = 0;
  private laneT = 1;
  private wheelSpin = 0;
  private suspension = 0;
  private suspensionVel = 0;
  private steerLean = 0;
  private bodyPitch = 0;
  private crashSpin = 0;
  private crashTilt = 0;
  private crashVel = 0;
  private engineShake = 0;

  private readonly materials: Materials;
  private readonly listeners: ((event: PlayerEvent) => void)[] = [];

  constructor(materials: Materials, skin: SkinId, castShadow: boolean) {
    this.materials = materials;
    const model = vehicleModels().get("player")!;
    this.view = new VehicleView(model, materials, {
      paint: materials.paintFor(skin, this.paintSpec(skin)),
      accent: materials.trim,
      castShadow,
    });
    this.group = this.view.group;
    this.group.name = "player";
    this.applySkin(skin);
  }

  private paintSpec(skin: SkinId) {
    const def = skinById(skin);
    return {
      color: def.paint,
      metalness: def.metalness,
      roughness: def.roughness,
      clearcoat: def.clearcoat,
      sheen: def.sheen,
      sheenColor: def.sheenColor,
    };
  }

  applySkin(skin: SkinId): void {
    const def = skinById(skin);
    this.view.setPaint(this.materials.paintFor(skin, this.paintSpec(skin)), this.materials.trim);
    this.view.rimColor.setHex(def.rim, THREE.SRGBColorSpace);
    this.view.brakeColor = new THREE.Color().setHex(def.caliper, THREE.SRGBColorSpace);
  }

  on(listener: (event: PlayerEvent) => void): void {
    this.listeners.push(listener);
  }

  private emit(event: PlayerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  reset(): void {
    this.lane = 1;
    this.x = laneX(1);
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.crashed = false;
    this.laneFrom = this.x;
    this.laneTo = this.x;
    this.laneT = 1;
    this.suspension = 0;
    this.suspensionVel = 0;
    this.steerLean = 0;
    this.bodyPitch = 0;
    this.crashSpin = 0;
    this.crashTilt = 0;
    this.crashVel = 0;
    this.group.position.set(this.x, 0, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.visible = true;
  }

  /** Parks the car at a fixed spot for the menu and garage presentations. */
  showcase(x: number): void {
    this.x = x;
    this.laneFrom = x;
    this.laneTo = x;
    this.laneT = 1;
    this.group.position.set(x, 0, 0);
  }

  move(direction: -1 | 1): void {
    if (this.crashed) return;
    const target = THREE.MathUtils.clamp(this.lane + direction, 0, LANE_COUNT - 1);
    if (target === this.lane) return;
    this.lane = target;
    this.laneFrom = this.x;
    this.laneTo = laneX(target);
    this.laneT = 0;
    this.emit("laneChange");
  }

  jump(): void {
    if (this.crashed || this.airborne) return;
    this.airborne = true;
    this.vy = LAUNCH_SPEED;
    // Squat then extend: a brief compression sells the launch.
    this.suspensionVel = -3.4;
    this.emit("jump");
  }

  crash(impactX: number): void {
    if (this.crashed) return;
    this.crashed = true;
    this.crashVel = THREE.MathUtils.clamp(-impactX * 2.4, -6, 6) + (Math.random() - 0.5) * 2;
    this.suspensionVel = -6;
    if (!this.airborne) this.vy = 2.2;
    this.airborne = true;
  }

  /** Vertical offset applied to the wheels, i.e. suspension travel. */
  get suspensionTravel(): number {
    return this.suspension;
  }

  update(dt: number, speed: number, wheels: WheelSystem): void {
    if (this.laneT < 1) {
      this.laneT = Math.min(1, this.laneT + dt / LANE_CHANGE_TIME);
      const eased = THREE.MathUtils.smootherstep(this.laneT, 0, 1);
      this.x = THREE.MathUtils.lerp(this.laneFrom, this.laneTo, eased);
    }

    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        const impact = this.vy;
        this.vy = 0;
        if (!this.crashed) {
          this.airborne = false;
          // Landing compression scales with how hard the car came down.
          this.suspensionVel = THREE.MathUtils.clamp(impact * 0.5, -7, 0);
          this.emit("land");
        } else {
          this.airborne = false;
        }
      }
    }

    // Critically damped spring returns the body to ride height.
    const stiffness = 210;
    const damping = 21;
    this.suspensionVel += (-this.suspension * stiffness - this.suspensionVel * damping) * dt;
    this.suspension = THREE.MathUtils.clamp(this.suspension + this.suspensionVel * dt, -0.13, 0.09);

    // Lean into lane changes, and pitch with vertical motion.
    const lateralTarget = this.laneT < 1 ? (this.laneTo - this.laneFrom) * 0.11 : 0;
    this.steerLean += (lateralTarget - this.steerLean) * Math.min(1, dt * 9);
    const pitchTarget = this.airborne
      ? THREE.MathUtils.clamp(-this.vy * 0.035, -0.14, 0.16)
      : THREE.MathUtils.clamp(this.suspension * 0.5, -0.06, 0.05);
    this.bodyPitch += (pitchTarget - this.bodyPitch) * Math.min(1, dt * 11);

    if (this.crashed) {
      this.crashSpin += this.crashVel * dt;
      this.crashVel *= 1 - Math.min(dt * 1.4, 0.6);
      this.crashTilt += (0.22 - this.crashTilt) * Math.min(1, dt * 2.2);
    }

    // Idle engine vibration: tiny, but the car never looks frozen.
    this.engineShake += dt * 42;
    const idle = this.crashed ? 0 : Math.sin(this.engineShake) * 0.0016;

    this.group.position.set(this.x, this.y + this.suspension * 0.55, 0);
    this.group.rotation.set(
      this.bodyPitch + idle,
      this.crashSpin,
      -this.steerLean + this.crashTilt * Math.sign(this.crashVel || 1),
    );

    if (!this.crashed) {
      this.wheelSpin += (speed / 0.36) * dt;
    } else {
      this.wheelSpin += (speed / 0.36) * dt * 0.2;
    }
    this.view.pushWheels(wheels, this.wheelSpin, -this.suspension * 0.45);
  }

  setShadow(enabled: boolean): void {
    this.view.setShadow(enabled);
  }
}
