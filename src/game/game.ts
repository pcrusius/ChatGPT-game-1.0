import * as THREE from "three";
import {
  LANE_CHANGE_TIME,
  MAX_SPEED,
  PLAYER_HALF_LENGTH,
  PLAYER_HALF_WIDTH,
  SPAWN_DISTANCE,
  SPEED_GAIN,
  START_SPEED,
  type SkinId,
} from "./config";
import { AudioFx } from "./audio";
import { ChaseCamera } from "./cameraRig";
import { EntityField, spawnPattern } from "./obstacles";
import { FX } from "./effects";
import { Player } from "./player";
import { World } from "./world";

export type GameState = "menu" | "garage" | "playing" | "crashed";

export interface RunStats {
  score: number;
  coins: number;
}

export interface GameHooks {
  onHud(score: number, coins: number, speedKmh: number): void;
  onGameOver(stats: RunStats): void;
  onCoinBanked(total: number): void;
}

export class Game {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly rig = new ChaseCamera();
  readonly world: World;
  readonly player: Player;
  readonly field = new EntityField();
  readonly fx = new FX();
  readonly audio = new AudioFx();

  state: GameState = "menu";
  score = 0;
  runCoins = 0;
  speed = START_SPEED;
  distance = 0;

  private clock = new THREE.Clock();
  private spawnCountdown = 60;
  private previousSafeLanes = [0, 1, 2];
  private crashTimer = 0;
  private gameOverFired = false;
  private hudTimer = 0;
  private smokeTimer = 0;
  private menuSpin = 0;

  constructor(
    canvas: HTMLCanvasElement,
    skin: SkinId,
    private readonly hooks: GameHooks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.world = new World(this.scene, this.renderer);
    this.player = new Player(skin);
    this.scene.add(this.player.mesh);
    this.scene.add(this.field.group);
    this.scene.add(this.fx.group);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.rig.resize(width, height);
  }

  setSkin(skin: SkinId): void {
    this.player.setSkin(skin);
  }

  showMenu(): void {
    this.state = "menu";
    this.field.clear();
    this.fx.clear();
    this.player.reset();
  }

  showGarage(): void {
    this.state = "garage";
    this.field.clear();
    this.player.reset();
  }

  startRun(): void {
    this.field.clear();
    this.fx.clear();
    this.player.reset();
    this.state = "playing";
    this.score = 0;
    this.runCoins = 0;
    this.speed = START_SPEED;
    this.distance = 0;
    this.spawnCountdown = 70;
    this.previousSafeLanes = [0, 1, 2];
    this.crashTimer = 0;
    this.gameOverFired = false;
    this.rig.snapToChase();
    this.audio.resume();
    this.hooks.onHud(0, 0, this.speed * 3.6);
  }

  input(action: "left" | "right" | "jump"): void {
    if (this.state !== "playing") return;
    if (action === "left") this.player.shift(-1);
    else if (action === "right") this.player.shift(1);
    else if (this.player.jump()) {
      this.audio.jump();
      this.fx.burst(new THREE.Vector3(this.player.x, 0.25, 1.6), 0xbfc7d2, 8, 4, 0.6);
    }
  }

  private updateSpawning(dt: number): void {
    this.spawnCountdown -= this.speed * dt;
    if (this.spawnCountdown > 0) return;

    const gapTime = 1.05;
    const laneChangesAllowed = Math.max(
      1,
      Math.min(2, Math.floor(gapTime / (LANE_CHANGE_TIME + 0.12))),
    );
    const result = spawnPattern(
      this.field,
      {
        distance: this.distance,
        speed: this.speed,
        spawnZ: -SPAWN_DISTANCE,
        previousSafeLanes: this.previousSafeLanes,
      },
      laneChangesAllowed,
    );
    this.previousSafeLanes = result.safeLanes;
    this.spawnCountdown = result.depth + Math.max(26, this.speed * gapTime);
  }

  private checkCollisions(): void {
    for (const entity of this.field.entities) {
      if (entity.collected) continue;
      const dz = Math.abs(entity.z);
      if (dz > entity.halfLength + PLAYER_HALF_LENGTH) continue;
      const dx = Math.abs(entity.object.position.x - this.player.x);
      if (dx > entity.halfWidth + PLAYER_HALF_WIDTH) continue;

      if (entity.kind === "coin") {
        if (Math.abs(this.player.y + 0.55 - entity.object.position.y) > 1.75) continue;
        entity.collected = true;
        this.runCoins += 1;
        this.audio.coin();
        this.fx.burst(entity.object.position.clone(), 0xffd257, 16, 6, 1.2);
        this.hooks.onCoinBanked(this.runCoins);
        continue;
      }

      if (entity.kind === "hurdle" && this.player.y > entity.clearHeight) continue;

      this.crash(entity.object.position.clone());
      return;
    }
  }

  private crash(at: THREE.Vector3): void {
    if (this.state !== "playing") return;
    this.state = "crashed";
    this.crashTimer = 0;
    this.player.crash();
    this.rig.impact(1.15);
    this.audio.crash();
    at.y = 0.9;
    this.fx.burst(at, 0xff7a1f, 46, 13, 1.6);
    this.fx.burst(at, 0xfff0b0, 26, 9, 1.4);
    this.fx.burst(new THREE.Vector3(this.player.x, 0.8, 0), 0x555555, 22, 5, 1.8);
  }

  private updateHud(force = false): void {
    this.hudTimer += 1;
    if (!force && this.hudTimer % 4 !== 0) return;
    this.hooks.onHud(Math.floor(this.score), this.runCoins, this.speed * 3.6);
  }

  tick = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.state === "playing" || this.state === "crashed") {
      const scroll = this.state === "playing" ? this.speed : this.speed * 0.35;

      if (this.state === "playing") {
        this.speed = Math.min(MAX_SPEED, this.speed + SPEED_GAIN * dt);
        this.distance += this.speed * dt;
        this.score += this.speed * dt * 1.15;
        this.updateSpawning(dt);
      } else {
        this.speed = Math.max(0, this.speed - 26 * dt);
      }

      this.world.scroll(scroll * dt);
      this.field.update(dt, scroll);
      this.player.update(dt, scroll);

      if (this.state === "playing") {
        this.checkCollisions();
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0 && this.speed > START_SPEED + 6) {
          this.smokeTimer = 0.07;
          this.fx.burst(
            new THREE.Vector3(this.player.x + (Math.random() - 0.5) * 1.5, 0.32, 2.3),
            0xd8d2c6,
            2,
            1.6,
            0.5,
          );
        }
      } else {
        this.crashTimer += dt;
        if (!this.gameOverFired && this.crashTimer > 0.85) {
          this.gameOverFired = true;
          this.hooks.onGameOver({ score: Math.floor(this.score), coins: this.runCoins });
        }
      }

      this.rig.chase(this.player.x, this.player.y, this.speed, dt);
      this.updateHud();
    } else {
      this.menuSpin += dt;
      this.world.scroll(16 * dt);
      this.player.update(dt, 16);
      if (this.state === "garage") {
        this.player.mesh.rotation.y = this.menuSpin * 0.55;
        this.rig.garage(dt);
      } else {
        this.player.mesh.rotation.y = Math.sin(this.menuSpin * 0.35) * 0.3;
        this.rig.menu(dt);
      }
    }

    this.fx.update(dt, this.state === "playing" || this.state === "crashed" ? this.speed : 16);
    this.world.followShadow(0);
    this.renderer.render(this.scene, this.rig.camera);
    requestAnimationFrame(this.tick);
  };

  start(): void {
    this.clock.start();
    requestAnimationFrame(this.tick);
  }
}
