import * as THREE from "three";
import { createTrafficCar } from "./carModel";
import { DESPAWN_Z, LANE_COUNT, laneX } from "./config";

export type EntityKind = "traffic" | "barrier" | "hurdle" | "coin";

export interface Entity {
  kind: EntityKind;
  object: THREE.Object3D;
  lane: number;
  z: number;
  y: number;
  halfWidth: number;
  halfLength: number;
  /** Player must be above this height to clear the entity. Infinity means it can never be jumped. */
  clearHeight: number;
  /** How fast the entity recedes relative to the player, in metres per second. */
  closingBonus: number;
  collected: boolean;
}

const TRAFFIC_COLORS = [0xdfe3e8, 0x2f3b4c, 0xb84b2f, 0x2e6f4e, 0xd7b45a, 0x6d4f8f, 0x1f4f7a];

const coinGeo = new THREE.TorusGeometry(0.46, 0.15, 10, 22);
const coinMat = new THREE.MeshStandardMaterial({
  color: 0xffcc33,
  emissive: 0xa86e00,
  emissiveIntensity: 0.8,
  metalness: 0.95,
  roughness: 0.18,
});
const coinCoreGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 18);
const coinCoreMat = new THREE.MeshStandardMaterial({
  color: 0xffe89a,
  emissive: 0xffb524,
  emissiveIntensity: 0.95,
  metalness: 0.8,
  roughness: 0.25,
});

const barrierBodyGeo = new THREE.BoxGeometry(2.7, 0.92, 0.5);
const barrierCapGeo = new THREE.BoxGeometry(2.86, 0.2, 0.62);
const barrierStripeGeo = new THREE.BoxGeometry(0.4, 0.66, 0.06);
const concreteMat = new THREE.MeshStandardMaterial({ color: 0xc2c6ca, roughness: 0.92 });
const warnOrange = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.6, emissive: 0x2e0d00 });
const warnWhite = new THREE.MeshStandardMaterial({ color: 0xf3f3f3, roughness: 0.6 });

const hurdleBarGeo = new THREE.BoxGeometry(2.8, 0.3, 0.4);
const hurdleLegGeo = new THREE.BoxGeometry(0.14, 0.32, 0.14);
const hurdleMat = new THREE.MeshStandardMaterial({
  color: 0xffb020,
  emissive: 0x4a2a00,
  emissiveIntensity: 0.7,
  roughness: 0.55,
  metalness: 0.25,
});
const coneGeo = new THREE.ConeGeometry(0.3, 0.78, 10);
const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.7, emissive: 0x220a00 });

function buildCoin(): THREE.Group {
  const coin = new THREE.Group();
  const ring = new THREE.Mesh(coinGeo, coinMat);
  ring.castShadow = true;
  coin.add(ring);
  const core = new THREE.Mesh(coinCoreGeo, coinCoreMat);
  core.rotation.x = Math.PI / 2;
  coin.add(core);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.95, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffd257,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  coin.add(halo);
  return coin;
}

function buildBarrier(): THREE.Group {
  const barrier = new THREE.Group();
  const body = new THREE.Mesh(barrierBodyGeo, concreteMat);
  body.position.y = 0.46;
  body.castShadow = true;
  body.receiveShadow = true;
  barrier.add(body);

  const cap = new THREE.Mesh(barrierCapGeo, warnOrange);
  cap.position.y = 1.02;
  cap.castShadow = true;
  barrier.add(cap);

  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(barrierStripeGeo, i % 2 === 0 ? warnOrange : warnWhite);
    stripe.position.set(-1.0 + i * 0.5, 0.46, -0.26);
    barrier.add(stripe);
  }
  return barrier;
}

function buildHurdle(): THREE.Group {
  const hurdle = new THREE.Group();
  const bar = new THREE.Mesh(hurdleBarGeo, hurdleMat);
  bar.position.y = 0.44;
  bar.castShadow = true;
  hurdle.add(bar);

  for (const x of [-1.24, 1.24]) {
    const leg = new THREE.Mesh(hurdleLegGeo, hurdleMat);
    leg.position.set(x, 0.16, 0);
    leg.castShadow = true;
    hurdle.add(leg);
  }
  for (const x of [-0.7, 0.7]) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 0.39, 0.42);
    cone.castShadow = true;
    hurdle.add(cone);
  }
  return hurdle;
}

class Pool<T extends THREE.Object3D> {
  private items: T[] = [];
  constructor(private readonly factory: () => T) {}

  take(): T {
    return this.items.pop() ?? this.factory();
  }

  give(item: T): void {
    if (this.items.length < 40) this.items.push(item);
  }
}

export class EntityField {
  readonly group = new THREE.Group();
  readonly entities: Entity[] = [];

  private readonly coinPool = new Pool(buildCoin);
  private readonly barrierPool = new Pool(buildBarrier);
  private readonly hurdlePool = new Pool(buildHurdle);
  private readonly trafficPool = new Pool(() => createTrafficCar(TRAFFIC_COLORS[0]));
  private spinTimer = 0;

  clear(): void {
    for (const entity of this.entities) {
      this.group.remove(entity.object);
      this.recyclePart(entity);
    }
    this.entities.length = 0;
  }

  private recyclePart(entity: Entity): void {
    const object = entity.object as THREE.Group;
    object.visible = true;
    object.scale.setScalar(1);
    object.rotation.set(0, 0, 0);
    switch (entity.kind) {
      case "coin":
        this.coinPool.give(object);
        break;
      case "barrier":
        this.barrierPool.give(object);
        break;
      case "hurdle":
        this.hurdlePool.give(object);
        break;
      case "traffic":
        this.trafficPool.give(object);
        break;
    }
  }

  spawnTraffic(lane: number, z: number, closingBonus: number): void {
    const car = this.trafficPool.take();
    const paint = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
    car.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material;
        if (!Array.isArray(mat) && mat instanceof THREE.MeshStandardMaterial && mat.userData.role === "paint") {
          mat.color.setHex(paint);
        }
      }
    });
    car.rotation.y = Math.PI;
    car.position.set(laneX(lane), 0, z);
    this.group.add(car);
    this.entities.push({
      kind: "traffic",
      object: car,
      lane,
      z,
      y: 0,
      halfWidth: 0.92,
      halfLength: 2.0,
      clearHeight: Number.POSITIVE_INFINITY,
      closingBonus,
      collected: false,
    });
  }

  spawnBarrier(lane: number, z: number): void {
    const barrier = this.barrierPool.take();
    barrier.position.set(laneX(lane), 0, z);
    this.group.add(barrier);
    this.entities.push({
      kind: "barrier",
      object: barrier,
      lane,
      z,
      y: 0,
      halfWidth: 1.38,
      halfLength: 0.42,
      clearHeight: Number.POSITIVE_INFINITY,
      closingBonus: 0,
      collected: false,
    });
  }

  spawnHurdle(lane: number, z: number): void {
    const hurdle = this.hurdlePool.take();
    hurdle.position.set(laneX(lane), 0, z);
    this.group.add(hurdle);
    this.entities.push({
      kind: "hurdle",
      object: hurdle,
      lane,
      z,
      y: 0,
      halfWidth: 1.4,
      halfLength: 0.4,
      clearHeight: 0.95,
      closingBonus: 0,
      collected: false,
    });
  }

  spawnCoin(lane: number, z: number, y = 1.05): void {
    const coin = this.coinPool.take();
    coin.position.set(laneX(lane), y, z);
    this.group.add(coin);
    this.entities.push({
      kind: "coin",
      object: coin,
      lane,
      z,
      y,
      halfWidth: 0.95,
      halfLength: 0.9,
      clearHeight: 0,
      closingBonus: 0,
      collected: false,
    });
  }

  update(dt: number, scrollSpeed: number): void {
    this.spinTimer += dt;
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      entity.z += (scrollSpeed - entity.closingBonus) * dt;
      entity.object.position.z = entity.z;

      if (entity.kind === "coin" && !entity.collected) {
        entity.object.rotation.y += dt * 3.4;
        entity.object.position.y = entity.y + Math.sin(this.spinTimer * 3 + entity.z * 0.12) * 0.09;
      }

      if (entity.z > DESPAWN_Z || entity.collected) {
        this.group.remove(entity.object);
        this.recyclePart(entity);
        this.entities.splice(i, 1);
      }
    }
  }
}

export interface PatternContext {
  distance: number;
  speed: number;
  spawnZ: number;
  /** Lanes that were left open by the previous pattern. */
  previousSafeLanes: number[];
}

export interface PatternResult {
  /** Lanes the player can be in and still survive this group. */
  safeLanes: number[];
  /** How far past the spawn point this group extends, in metres. */
  depth: number;
}

const ALL_LANES = [0, 1, 2];

function pickFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function reachableLanes(from: number[], laneChangesAllowed: number): number[] {
  const options = ALL_LANES.filter((lane) =>
    from.some((start) => Math.abs(start - lane) <= laneChangesAllowed),
  );
  return options.length ? options : ALL_LANES.slice(0, LANE_COUNT);
}

/**
 * Builds the next obstacle group. Every pattern keeps at least one lane survivable and only
 * picks open lanes the player can still reach from the previous group, so runs never become
 * mathematically impossible.
 */
export function spawnPattern(
  field: EntityField,
  ctx: PatternContext,
  laneChangesAllowed: number,
): PatternResult {
  const z = ctx.spawnZ;
  const difficulty = Math.min(1, ctx.distance / 2600);
  const openOptions = reachableLanes(ctx.previousSafeLanes, laneChangesAllowed);

  // Single blocker, coin trail in an open lane.
  const singleBlocker = (): PatternResult => {
    const blocked = pickFrom(ALL_LANES.filter((lane) => openOptions.length > 1 || lane !== openOptions[0]));
    const safe = ALL_LANES.filter((lane) => lane !== blocked);
    if (Math.random() < 0.55) field.spawnTraffic(blocked, z, 12 + Math.random() * 8);
    else field.spawnBarrier(blocked, z);
    const coinLane = pickFrom(safe);
    for (let i = 0; i < 4; i++) field.spawnCoin(coinLane, z - i * 4.5);
    return { safeLanes: safe, depth: 18 };
  };

  // Two blockers, exactly one reachable lane open.
  const twoBlockers = (): PatternResult => {
    const open = pickFrom(openOptions);
    for (const lane of ALL_LANES) {
      if (lane === open) continue;
      if (Math.random() < 0.5) field.spawnTraffic(lane, z, 10 + Math.random() * 10);
      else field.spawnBarrier(lane, z);
    }
    for (let i = 0; i < 3; i++) field.spawnCoin(open, z - i * 4.5);
    return { safeLanes: [open], depth: 18 };
  };

  // Full-width hurdle: jumpable in every lane.
  const jumpWall = (): PatternResult => {
    for (const lane of ALL_LANES) field.spawnHurdle(lane, z);
    const coinLane = pickFrom(openOptions);
    for (let i = 0; i < 3; i++) field.spawnCoin(coinLane, z - 2 + i * 3.4, 1.8 + Math.sin(i) * 0.3);
    return { safeLanes: ALL_LANES, depth: 14 };
  };

  // Hurdles either side of a clean lane: dodge or jump.
  const hurdleGap = (): PatternResult => {
    const open = pickFrom(openOptions);
    for (const lane of ALL_LANES) {
      if (lane === open) continue;
      field.spawnHurdle(lane, z);
    }
    for (let i = 0; i < 4; i++) field.spawnCoin(open, z - i * 4);
    return { safeLanes: ALL_LANES, depth: 18 };
  };

  // Pure coin run with a jump arc.
  const coinRun = (): PatternResult => {
    const lane = pickFrom(openOptions);
    for (let i = 0; i < 7; i++) {
      field.spawnCoin(lane, z - i * 3.6, 1.05 + Math.sin((i / 6) * Math.PI) * 1.2);
    }
    return { safeLanes: ALL_LANES, depth: 26 };
  };

  // Slalom: two staggered walls one lane change apart.
  const slalom = (): PatternResult => {
    const first = pickFrom(openOptions);
    for (const lane of ALL_LANES) {
      if (lane === first) continue;
      field.spawnTraffic(lane, z, 14 + Math.random() * 6);
    }
    const second = pickFrom(ALL_LANES.filter((lane) => Math.abs(lane - first) === 1));
    for (const lane of ALL_LANES) {
      if (lane === second) continue;
      field.spawnBarrier(lane, z - 52);
    }
    for (let i = 0; i < 3; i++) field.spawnCoin(second, z - 52 - i * 4);
    return { safeLanes: [second], depth: 70 };
  };

  const easyPool = [singleBlocker, jumpWall, coinRun];
  const hardPool = [twoBlockers, hurdleGap, slalom];
  const useHard = Math.random() < 0.12 + difficulty * 0.52;
  return (useHard ? pickFrom(hardPool) : pickFrom(easyPool))();
}
