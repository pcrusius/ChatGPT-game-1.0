import * as THREE from "three";
import {
  DESPAWN_Z,
  MAX_SPEED,
  PLAYER_HALF_LENGTH,
  PLAYER_HALF_WIDTH,
  START_SPEED,
  laneX,
  type SkinId,
} from "./config";
import { AdaptiveQuality, detectQuality, settingsFor, type QualityLevel, type QualitySettings } from "../core/quality";
import { DebugOverlay } from "../core/debug";
import { Materials } from "../render/materials";
import { WheelSystem } from "../render/vehicles";
import { World } from "../world/world";
import { Sky } from "../world/sky";
import { THEMES, THEME_ORDER, blendThemes, makeBlend, type ThemeId } from "../world/themes";
import { CameraRig } from "./camera";
import { Director } from "./director";
import { EntityField } from "./entities";
import { GroundShadows, Particles } from "./effects";
import { Player } from "./player";
import { AudioEngine } from "./audio";
import type { MissionProgress } from "./storage";

export type GameState = "menu" | "garage" | "playing" | "paused" | "crashed";

export interface HudState {
  score: number;
  coins: number;
  speedKph: number;
  multiplier: number;
  streak: number;
  themeName: string;
  difficulty: string;
  distance: number;
}

export interface RunResult {
  score: number;
  coins: number;
  distance: number;
  nearMisses: number;
  jumps: number;
  topSpeed: number;
}

export interface GameHooks {
  onHud?: (hud: HudState) => void;
  onCoin?: (streak: number, multiplier: number) => void;
  onNearMiss?: (bonus: number) => void;
  onMilestone?: (score: number) => void;
  onCrash?: (result: RunResult) => void;
  onStateChange?: (state: GameState) => void;
  onQualityChange?: (level: QualityLevel) => void;
  onSpeedFactor?: (factor: number) => void;
}

const KPH = 3.6;
/** Where the car parks for the menu and garage, clear of the left-hand UI panel. */
const SHOWCASE_X = 2.4;

/**
 * Showroom floor for the menu and garage: a dark turntable with a lit rim and a pool of light,
 * so the car is presented rather than just left standing on the asphalt.
 */
function buildPlinth(materials: Materials): THREE.Group {
  const group = new THREE.Group();
  group.name = "plinth";

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4.8, 48),
    // Mid slate, not charcoal: the car's contact shadow is what sits it on the turntable, and
    // a 40% shadow cast onto near-black is a shadow nobody can see. Rough enough that the sky
    // does not smear a hard white streak across it.
    new THREE.MeshStandardMaterial({ color: 0x424b5c, roughness: 0.62, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.008;
  floor.receiveShadow = true;
  group.add(floor);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(4.8, 0.055, 6, 48),
    new THREE.MeshBasicMaterial({ color: 0xff8a3d }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.05;
  group.add(rim);

  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 13),
    new THREE.MeshBasicMaterial({
      map: materials.glow,
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  group.add(pool);

  return group;
}

/** Pool of light thrown forward by the headlights, faded in with the night factor. */
function buildHeadlightPool(materials: Materials): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(11, 30),
    new THREE.MeshBasicMaterial({
      map: materials.glow,
      color: 0xffeccb,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.name = "headlights";
  return mesh;
}

/**
 * Owns the renderer, the scene graph and the run loop. Everything that can be preallocated is
 * built in the constructor; the per-frame path does no allocation and no material work.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly hooks: GameHooks = {};

  state: GameState = "menu";
  score = 0;
  coins = 0;
  distance = 0;
  speed = START_SPEED;

  private readonly canvas: HTMLCanvasElement;
  private readonly materials: Materials;
  private readonly wheels: WheelSystem;
  private readonly world: World;
  private readonly field: EntityField;
  private readonly particles: Particles;
  private readonly shadows: GroundShadows;
  private readonly plinth: THREE.Group;
  private readonly headlights: THREE.Mesh;
  private readonly player: Player;
  private readonly director = new Director();
  private readonly debug = new DebugOverlay();
  private readonly adaptive: AdaptiveQuality;
  private readonly audio: AudioEngine;

  private quality: QualitySettings;
  private readonly envMaps = new Map<ThemeId, THREE.Texture>();
  private appliedEnv: ThemeId | null = null;

  private readonly hud: HudState = {
    score: 0,
    coins: 0,
    speedKph: 0,
    multiplier: 1,
    streak: 0,
    themeName: "",
    difficulty: "",
    distance: 0,
  };

  private multiplier = 1;
  private coinStreak = 0;
  private nearMisses = 0;
  private jumps = 0;
  private topSpeed = 0;
  private lastMilestone = 0;
  private clock = new THREE.Clock();
  private previousX = 0;
  private lateralVelocity = 0;
  private running = false;
  private crashTimer = 0;
  private selectedSkin: SkinId = "red";
  private dustTimer = 0;

  constructor(canvas: HTMLCanvasElement, audio: AudioEngine, requestedQuality: QualityLevel | "auto") {
    this.canvas = canvas;
    this.audio = audio;
    const level = requestedQuality === "auto" ? detectQuality() : requestedQuality;
    this.quality = settingsFor(level);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: level !== "low",
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = true;

    this.materials = new Materials(this.quality);
    this.wheels = new WheelSystem(96, this.materials);
    this.scene.add(this.wheels.group);

    this.world = new World(this.scene, this.materials, this.quality);

    this.field = new EntityField(this.materials, this.wheels);
    this.scene.add(this.field.group);

    this.particles = new Particles(this.materials, this.quality);
    this.scene.add(this.particles.points);

    this.shadows = new GroundShadows(this.materials);
    this.scene.add(this.shadows.mesh);

    this.plinth = buildPlinth(this.materials);
    this.scene.add(this.plinth);

    this.headlights = buildHeadlightPool(this.materials);
    this.scene.add(this.headlights);

    this.player = new Player(this.materials, "red", this.quality.shadows);
    this.scene.add(this.player.group);
    this.player.on((event) => this.onPlayerEvent(event));

    this.rig = new CameraRig(window.innerWidth / Math.max(1, window.innerHeight));
    this.rig.setMode("menu");

    this.adaptive = new AdaptiveQuality(level, (next) => {
      this.setQuality(next);
      this.hooks.onQualityChange?.(next);
    });

    this.buildEnvironmentMaps();
    this.field.setCastShadow(false);

    window.addEventListener("resize", () => this.resize());
    this.resize();
  }

  /**
   * Pre-bakes one irradiance map per theme from the sky shader. Doing this up front avoids a
   * multi-frame hitch mid-run, and the maps are what make the car paint read as metallic.
   */
  private buildEnvironmentMaps(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    pmrem.compileEquirectangularShader();
    const scratchScene = new THREE.Scene();
    const sky = new Sky();
    scratchScene.add(sky.mesh);
    const blend = makeBlend();
    for (const id of THEME_ORDER) {
      const theme = THEMES[id];
      sky.apply(blendThemes(theme, theme, 0, blend));
      this.envMaps.set(id, pmrem.fromScene(scratchScene, 0, 1, 1200).texture);
    }
    sky.dispose();
    pmrem.dispose();
    this.applyEnvironment("coastal");
  }

  private applyEnvironment(id: ThemeId): void {
    if (this.appliedEnv === id) return;
    this.appliedEnv = id;
    this.scene.environment = this.envMaps.get(id) ?? null;
  }

  get currentQuality(): QualityLevel {
    return this.quality.level;
  }

  setQuality(level: QualityLevel): void {
    this.quality = settingsFor(level);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.maxPixelRatio));
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.needsUpdate = true;
    this.materials.setQuality(this.quality);
    this.world.setQuality(this.quality);
    this.player.setShadow(this.quality.shadows);
    this.wheels.setShadows(false);
    this.adaptive.setLevel(level);
    this.resize();
  }

  /** Called when the player picks a tier by hand; stops the automatic downgrade watchdog. */
  lockQuality(): void {
    this.adaptive.disable();
  }

  resize(): void {
    const width = window.innerWidth;
    const height = Math.max(1, window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.rig.resize(width / height);
  }

  setSkin(skin: SkinId): void {
    this.selectedSkin = skin;
    this.player.applySkin(skin);
  }

  toggleDebug(): void {
    this.debug.toggle();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  private setState(state: GameState): void {
    if (this.state === state) return;
    this.state = state;
    this.hooks.onStateChange?.(state);
  }

  showMenu(): void {
    this.setState("menu");
    this.rig.setMode("menu");
    this.showcase();
    // Previewed, not forced: a theme chosen in settings must survive visiting the menu.
    const backdrop = this.world.override ?? "coastal";
    this.world.previewTheme(backdrop);
    this.applyEnvironment(backdrop);
  }

  showGarage(): void {
    this.setState("garage");
    this.rig.setMode("garage");
    this.showcase();
  }

  /** Parks the car on the plinth for the menu and garage. */
  private showcase(): void {
    this.player.reset();
    this.player.showcase(SHOWCASE_X);
    this.field.clear();
    this.particles.clear();
    this.plinth.position.x = SHOWCASE_X;
    this.plinth.visible = true;
  }

  startRun(): void {
    this.setState("playing");
    this.score = 0;
    this.coins = 0;
    this.distance = 0;
    this.speed = START_SPEED;
    this.multiplier = 1;
    this.coinStreak = 0;
    this.nearMisses = 0;
    this.jumps = 0;
    this.topSpeed = 0;
    this.lastMilestone = 0;
    this.crashTimer = 0;
    this.field.clear();
    this.particles.clear();
    this.director.reset();
    this.player.reset();
    this.player.applySkin(this.selectedSkin);
    this.plinth.visible = false;
    this.world.resetThemes();
    this.applyEnvironment(this.world.dominantTheme);
    this.rig.snapToChase(this.player.x);
    this.previousX = this.player.x;
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.setState("paused");
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.setState("playing");
  }

  input(action: "left" | "right" | "jump"): void {
    if (this.state !== "playing") return;
    if (action === "left") this.player.move(-1);
    else if (action === "right") this.player.move(1);
    else this.player.jump();
  }

  private onPlayerEvent(event: "jump" | "land" | "laneChange"): void {
    if (event === "jump") {
      this.jumps += 1;
      this.audio.jump();
      this.particles.burst("landing", this.player.x, 0.1, 0, 0.55);
      this.rig.bump(-0.16);
    } else if (event === "land") {
      this.audio.land(1);
      this.particles.burst("landing", this.player.x, 0.1, 0, 1.1);
      this.rig.bump(0.34);
      this.rig.kick(0.13, 8);
    }
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.debug.update(dt, this.renderer, {
      state: this.state,
      entities: this.field.entities.filter((e) => e.active).length,
      quality: this.quality.level,
      theme: this.world.currentThemeName,
      speed: `${(this.speed * KPH).toFixed(0)} kph`,
    });
    this.adaptive.update(dt);

    if (this.state === "playing" || this.state === "crashed") {
      this.simulate(dt);
    } else {
      this.idle(dt);
    }

    this.renderer.render(this.scene, this.rig.camera);
  }

  /** Menu and garage: the car idles on a plinth and the camera drifts. */
  private idle(dt: number): void {
    this.wheels.beginFrame();
    this.shadows.begin();
    this.player.update(dt, 0, this.wheels);
    // On the turntable the key light comes from the camera's side, so the cast shadow falls
    // behind the car where nobody can see it and the car reads as floating. A wide soft body
    // shadow plus a tight patch under each contact patch is what sits it on the floor.
    this.shadows.setOpacity(0.5);
    this.shadows.push(this.player.x, 0, 4.1, 6.8, 1);
    for (const wheel of this.player.view.model.wheels) {
      this.shadows.push(this.player.x + wheel.x, wheel.z, wheel.radius * 3, wheel.radius * 3.6, 1);
    }
    this.shadows.end();
    this.wheels.endFrame();
    this.particles.update(dt);
    this.world.update(0, dt, 0);
    this.rig.update(dt, this.player.x, 0, 0, 0, false);
    this.world.lightShowcase(this.rig.camera.position, SHOWCASE_X);
    this.audio.updateDrive(0.12, this.state === "menu" || this.state === "garage" ? 0.35 : 0);
    this.hooks.onSpeedFactor?.(0);
  }

  private simulate(dt: number): void {
    const playing = this.state === "playing";

    if (playing) {
      // Speed ramps quickly at first then asymptotes, so early play is forgiving.
      const ramp = 1 - Math.exp(-this.distance / 1500);
      this.speed = START_SPEED + (MAX_SPEED - START_SPEED) * ramp;
      this.topSpeed = Math.max(this.topSpeed, this.speed);
    } else {
      this.speed *= 1 - Math.min(dt * 1.8, 0.9);
    }

    const scroll = this.speed * dt;
    if (playing) this.distance += scroll;

    this.lateralVelocity = (this.player.x - this.previousX) / Math.max(dt, 1e-4);
    this.previousX = this.player.x;

    this.wheels.beginFrame();
    this.shadows.begin();

    this.player.update(dt, this.speed, this.wheels);
    // Airborne, the projected shadow becomes a hard slab detached from the car, so the soft
    // contact blob takes over entirely.
    this.player.setShadow(this.quality.shadows && !this.player.airborne);
    // Player contact shadow shrinks and fades while airborne.
    const lift = THREE.MathUtils.clamp(this.player.y / 2.5, 0, 1);
    this.shadows.push(this.player.x, 0, 3.2 * (1 - lift * 0.45), 6.0 * (1 - lift * 0.4), 1);

    if (playing) this.director.update(scroll, this.distance, this.speed, this.field);
    this.field.update(dt, playing ? scroll : 0, this.shadows);

    this.shadows.end();
    this.wheels.endFrame();

    if (playing) this.collide(dt);

    this.emitDriveEffects(dt, playing);
    this.particles.update(dt);
    this.world.update(this.distance, dt, this.rig.camera.position.z);
    this.applyEnvironment(this.world.dominantTheme);
    this.renderer.toneMappingExposure = this.world.theme.exposure;
    this.shadows.setOpacity(0.42 * (1 - this.world.theme.nightFactor * 0.55));

    const night = this.world.nightFactor;
    this.headlights.position.set(this.player.x, 0.05, -14);
    (this.headlights.material as THREE.MeshBasicMaterial).opacity = night * 0.36;
    this.headlights.visible = night > 0.02;

    this.rig.update(
      dt,
      this.player.x,
      this.player.y,
      this.speed,
      this.lateralVelocity,
      !playing,
    );

    const speedRatio = THREE.MathUtils.clamp((this.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
    this.audio.updateDrive(speedRatio, playing ? 1 : 0.15);
    this.hooks.onSpeedFactor?.(playing ? speedRatio : 0);

    if (playing) {
      this.score += scroll * 1.1 * this.multiplier;
      const milestone = Math.floor(this.score / 1000);
      if (milestone > this.lastMilestone) {
        this.lastMilestone = milestone;
        this.multiplier = Math.min(6, this.multiplier + 0.25);
        this.audio.milestone();
        this.hooks.onMilestone?.(Math.floor(this.score));
      }
      this.publishHud();
    } else {
      this.crashTimer += dt;
    }
  }

  private emitDriveEffects(dt: number, playing: boolean): void {
    if (!playing) return;
    // Tyre dust when the car is planted and moving quickly.
    this.dustTimer += dt * (this.speed / 12);
    while (this.dustTimer > 1) {
      this.dustTimer -= 1;
      if (this.player.airborne) break;
      const side = Math.random() < 0.5 ? -0.82 : 0.82;
      this.particles.burst("dust", this.player.x + side, 0.08, 1.4, 0.6);
    }
    this.particles.emitWind(
      dt,
      this.speed,
      this.rig.camera.position.x,
      this.rig.camera.position.z,
      this.quality.speedStreaks,
    );
  }

  private publishHud(): void {
    this.hud.score = Math.floor(this.score);
    this.hud.coins = this.coins;
    this.hud.speedKph = Math.round(this.speed * KPH);
    this.hud.multiplier = this.multiplier;
    this.hud.streak = this.coinStreak;
    this.hud.themeName = this.world.currentThemeName;
    this.hud.difficulty = this.director.difficulty(this.distance).label;
    this.hud.distance = Math.floor(this.distance);
    this.hooks.onHud?.(this.hud);
  }

  /** Narrow-phase collision against the few entities near the car. */
  private collide(dt: number): void {
    void dt;
    for (const entity of this.field.entities) {
      if (!entity.active || entity.role === "decor") continue;
      if (entity.z < -12 || entity.z > DESPAWN_Z) continue;

      const ex = entity.x + entity.laneDrift;
      const dx = Math.abs(ex - this.player.x);
      const dz = Math.abs(entity.z);

      if (entity.role === "coin") {
        if (entity.collectT >= 0) continue;
        const dy = Math.abs(entity.y - (this.player.y + 0.7));
        if (dz < 1.5 && dx < 1.25 && dy < 1.15) this.collectCoin(entity.x, entity.y, entity.z, entity);
        continue;
      }

      const zOverlap = dz < entity.halfLength + PLAYER_HALF_LENGTH;
      if (!zOverlap) continue;

      const xOverlap = dx < entity.halfWidth + PLAYER_HALF_WIDTH;
      if (xOverlap) {
        // Airborne above a low obstacle counts as cleared, not a hit.
        if (this.player.y > entity.height + 0.05) continue;
        this.crash(ex);
        return;
      }

      // Near miss: shaved past without touching.
      const clearance = dx - (entity.halfWidth + PLAYER_HALF_WIDTH);
      if (!entity.nearMissed && entity.role === "traffic" && clearance < 0.75 && dz < 2.4) {
        entity.nearMissed = true;
        this.nearMisses += 1;
        this.multiplier = Math.min(6, this.multiplier + 0.15);
        const bonus = Math.round(120 * this.multiplier);
        this.score += bonus;
        this.audio.nearMiss();
        this.particles.burst("spark", ex + Math.sign(this.player.x - ex) * entity.halfWidth, 0.9, entity.z, 0.7);
        this.hooks.onNearMiss?.(bonus);
      }
    }
  }

  private collectCoin(x: number, y: number, z: number, entity: { collectT: number }): void {
    entity.collectT = 0;
    this.coins += 1;
    this.coinStreak += 1;
    if (this.coinStreak % 8 === 0) this.multiplier = Math.min(6, this.multiplier + 0.2);
    this.score += 25 * this.multiplier;
    this.particles.burst("coin", x, y, z, 1);
    this.audio.coin(this.coinStreak);
    this.hooks.onCoin?.(this.coinStreak, this.multiplier);
  }

  private crash(impactX: number): void {
    this.setState("crashed");
    this.player.crash(impactX - this.player.x);
    this.particles.burst("crash", this.player.x, 0.9, 0, 1);
    this.particles.burst("spark", this.player.x, 0.6, -1.4, 1.4);
    this.rig.kick(1.5, 2.4);
    this.audio.crash();
    this.coinStreak = 0;
    this.hooks.onCrash?.(this.result());
  }

  result(): RunResult {
    return {
      score: Math.floor(this.score),
      coins: this.coins,
      distance: Math.floor(this.distance),
      nearMisses: this.nearMisses,
      jumps: this.jumps,
      topSpeed: this.topSpeed,
    };
  }

  missionProgress(): MissionProgress {
    return {
      distance: Math.floor(this.distance),
      coins: this.coins,
      jumps: this.jumps,
      nearMisses: this.nearMisses,
      topSpeed: this.topSpeed,
    };
  }

  /** Debug/testing hook: force an environment so all three can be inspected on demand. */
  forceTheme(id: ThemeId): void {
    this.world.forceTheme(id);
    this.applyEnvironment(id);
  }

  clearThemeOverride(): void {
    this.world.clearThemeOverride();
  }

  get canRestart(): boolean {
    return this.state === "crashed" && this.crashTimer > 0.4;
  }

  get lanePosition(): number {
    return laneX(this.player.lane);
  }

  get fps(): number {
    return this.debug.currentFps;
  }

  dispose(): void {
    this.stop();
    this.world.dispose();
    this.field.dispose();
    this.particles.dispose();
    this.shadows.dispose();
    this.wheels.dispose();
    this.materials.dispose();
    for (const map of this.envMaps.values()) map.dispose();
    this.renderer.dispose();
    void this.canvas;
  }
}
