import * as THREE from "three";
import { DESPAWN_Z, TRAFFIC_COLORS } from "./config";
import { PartBuilder, roundedBox, taperedBox, tubeZ } from "../render/geom";
import type { Materials } from "../render/materials";
import { WheelSystem, vehicleModels, type VehicleKind } from "../render/vehicles";
import type { GroundShadows } from "./effects";

const POS = new THREE.Vector3();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const MAT = new THREE.Matrix4();
const EULER = new THREE.Euler();
const WHITE = new THREE.Color(0xffffff);
const TINT = new THREE.Color();
const WHEEL_GREY = new THREE.Color(0x8b929b);
/** Cars further ahead than this draw tyres without spoked rims. */
const RIM_LOD_Z = -48;
/**
 * A set of identical props drawn as instanced meshes, one per material role. The paint role can
 * be tinted per instance, which is how traffic gets a colour palette for free.
 */
class InstancedSet {
  private readonly meshes: { mesh: THREE.InstancedMesh; tinted: boolean }[] = [];
  private count = 0;

  constructor(
    readonly key: string,
    parts: { geometry: THREE.BufferGeometry; material: THREE.Material; tinted?: boolean }[],
    readonly capacity: number,
  ) {
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(capacity * 3).fill(1),
        3,
      );
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.count = 0;
      this.meshes.push({ mesh, tinted: part.tinted ?? false });
    }
  }

  addTo(parent: THREE.Object3D): void {
    for (const entry of this.meshes) parent.add(entry.mesh);
  }

  setCastShadow(enabled: boolean): void {
    for (const entry of this.meshes) entry.mesh.castShadow = enabled;
  }

  begin(): void {
    this.count = 0;
  }

  push(x: number, y: number, z: number, yaw: number, scale: number, color: THREE.Color): void {
    if (this.count >= this.capacity) return;
    const slot = this.count++;
    POS.set(x, y, z);
    EULER.set(0, yaw, 0);
    QUAT.setFromEuler(EULER);
    SCALE.setScalar(scale);
    MAT.compose(POS, QUAT, SCALE);
    for (const entry of this.meshes) {
      entry.mesh.setMatrixAt(slot, MAT);
      const c = entry.tinted ? color : WHITE;
      entry.mesh.instanceColor!.setXYZ(slot, c.r, c.g, c.b);
    }
  }

  end(): void {
    for (const entry of this.meshes) {
      entry.mesh.count = this.count;
      entry.mesh.instanceMatrix.needsUpdate = true;
      entry.mesh.instanceColor!.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const entry of this.meshes) {
      entry.mesh.geometry.dispose();
      entry.mesh.dispose();
    }
  }
}

export type EntityRole = "traffic" | "obstacle" | "coin" | "decor";

export interface Entity {
  active: boolean;
  key: string;
  role: EntityRole;
  x: number;
  y: number;
  z: number;
  /** Forward speed in world units; traffic is slower than the player, obstacles are zero. */
  speed: number;
  halfWidth: number;
  halfLength: number;
  height: number;
  jumpable: boolean;
  color: number;
  spin: number;
  lane: number;
  nearMissed: boolean;
  /** Coins only: pop-and-fade animation once collected. */
  collectT: number;
  wheelKind: VehicleKind | null;
  shadowWidth: number;
  laneDrift: number;
  driftTarget: number;
}

interface ObstacleSpec {
  key: string;
  jumpable: boolean;
  halfWidth: number;
  halfLength: number;
  height: number;
  shadowWidth: number;
}

const OBSTACLE_SPECS: Record<string, ObstacleSpec> = {
  barrier: { key: "barrier", jumpable: true, halfWidth: 1.55, halfLength: 0.4, height: 0.62, shadowWidth: 3.4 },
  hurdle: { key: "hurdle", jumpable: true, halfWidth: 1.5, halfLength: 0.3, height: 0.58, shadowWidth: 3.2 },
  roadblock: { key: "roadblock", jumpable: true, halfWidth: 1.45, halfLength: 0.5, height: 0.55, shadowWidth: 3.2 },
  barricade: { key: "barricade", jumpable: false, halfWidth: 1.6, halfLength: 0.45, height: 1.7, shadowWidth: 3.5 },
  laneClosure: { key: "laneClosure", jumpable: false, halfWidth: 1.45, halfLength: 0.7, height: 2.1, shadowWidth: 3.2 },
};

const VEHICLE_HITBOX: Record<string, { halfWidth: number; halfLength: number; height: number }> = {
  sedan: { halfWidth: 0.95, halfLength: 2.3, height: 1.42 },
  suv: { halfWidth: 1.02, halfLength: 2.4, height: 1.78 },
  sports: { halfWidth: 0.93, halfLength: 2.2, height: 1.18 },
  van: { halfWidth: 1.05, halfLength: 2.78, height: 2.16 },
  pickup: { halfWidth: 1.02, halfLength: 2.76, height: 1.8 },
  truck: { halfWidth: 1.2, halfLength: 3.2, height: 2.78 },
};

/**
 * Every gameplay entity in one place: fixed-size pool, instanced rendering, and no allocation
 * after construction.
 */
export class EntityField {
  readonly group = new THREE.Group();
  readonly entities: Entity[] = [];
  private readonly sets = new Map<string, InstancedSet>();
  private readonly coinGlow: InstancedSet;
  private readonly wheels: WheelSystem;

  constructor(materials: Materials, wheels: WheelSystem, poolSize = 96) {
    this.group.name = "entities";
    this.wheels = wheels;

    for (let i = 0; i < poolSize; i++) {
      this.entities.push({
        active: false,
        key: "",
        role: "obstacle",
        x: 0,
        y: 0,
        z: 0,
        speed: 0,
        halfWidth: 1,
        halfLength: 1,
        height: 1,
        jumpable: false,
        color: 0xffffff,
        spin: 0,
        lane: 1,
        nearMissed: false,
        collectT: -1,
        wheelKind: null,
        shadowWidth: 2,
        laneDrift: 0,
        driftTarget: 0,
      });
    }

    // Traffic and truck bodies: paint role is tinted per instance.
    const models = vehicleModels();
    for (const kind of ["sedan", "suv", "sports", "van", "pickup", "truck"] as VehicleKind[]) {
      const model = models.get(kind)!;
      const parts: { geometry: THREE.BufferGeometry; material: THREE.Material; tinted?: boolean }[] = [];
      for (const [role, geometry] of model.roles) {
        const material =
          role === "paint"
            ? materials.trafficPaint(0xffffff)
            : role === "glass"
              ? materials.glassSimple
              : role === "trim"
                ? materials.trim
                : role === "carbon"
                  ? materials.carbon
                  : role === "chrome"
                    ? materials.chrome
                    : role === "head"
                      ? materials.headlight
                      : role === "tail"
                        ? materials.taillight
                        : materials.trim;
        parts.push({ geometry, material, tinted: role === "paint" });
      }
      this.register(new InstancedSet(kind, parts, kind === "truck" ? 6 : 10));
    }

    this.registerObstacles(materials);

    // Coins: one instanced disc for every coin on screen, plus an additive halo.
    const coinParts = new PartBuilder<"c">();
    coinParts.add("c", tubeZ(0.44, 0.09, 18));
    coinParts.add("c", (() => {
      const rim = new THREE.TorusGeometry(0.44, 0.05, 4, 18);
      return rim;
    })());
    coinParts.add("c", (() => {
      const emboss = tubeZ(0.24, 0.13, 12);
      return emboss;
    })());
    this.register(
      new InstancedSet("coin", [{ geometry: coinParts.build().get("c")!, material: materials.coin }], 64),
    );

    const glowGeo = new THREE.PlaneGeometry(1.9, 1.9);
    const glowMaterial = new THREE.MeshBasicMaterial({
      map: materials.glow,
      color: 0xffc84a,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.coinGlow = new InstancedSet("coinGlow", [{ geometry: glowGeo, material: glowMaterial }], 64);
    this.coinGlow.addTo(this.group);
  }

  private register(set: InstancedSet): void {
    this.sets.set(set.key, set);
    set.addTo(this.group);
  }

  private registerObstacles(m: Materials): void {
    // --- Water-filled construction barrier: white body, orange bands, reflector strip.
    {
      const body = new PartBuilder<"b">();
      body.add("b", (() => {
        const shell = taperedBox(3.0, 2.76, 0.56, 0.42, 0.34);
        shell.translate(0, 0.28, 0);
        return shell;
      })());
      body.add("b", (() => {
        const cap = roundedBox(3.06, 0.09, 0.5, 0.04, 1);
        cap.translate(0, 0.58, 0);
        return cap;
      })());
      const stripes = new PartBuilder<"s">();
      for (let i = -1; i <= 1; i++) {
        stripes.add("s", (() => {
          const band = roundedBox(0.52, 0.42, 0.46, 0.03, 1);
          band.translate(i * 0.96, 0.3, 0);
          return band;
        })());
      }
      const lamps = new PartBuilder<"l">();
      lamps.pair("l", () => roundedBox(0.26, 0.1, 0.06, 0.02, 1), 1.16, 0.5, 0.24);
      this.register(
        new InstancedSet(
          "barrier",
          [
            { geometry: body.build().get("b")!, material: m.barrierBody },
            { geometry: stripes.build().get("s")!, material: m.barrierStripe },
            { geometry: lamps.build().get("l")!, material: m.warningLamp },
          ],
          8,
        ),
      );
    }

    // --- Hurdle: a low rail on folding legs, read instantly as jumpable.
    {
      const frame = new PartBuilder<"f">();
      frame.pair("f", () => roundedBox(0.11, 0.52, 0.5, 0.03, 1), 1.3, 0.26, 0);
      frame.pair("f", () => roundedBox(0.09, 0.09, 0.62, 0.02, 1), 1.3, 0.05, 0);
      const rail = new PartBuilder<"r">();
      rail.add("r", (() => {
        const bar = roundedBox(2.86, 0.2, 0.14, 0.05, 1);
        bar.translate(0, 0.5, 0);
        return bar;
      })());
      rail.add("r", (() => {
        const bar = roundedBox(2.86, 0.14, 0.12, 0.04, 1);
        bar.translate(0, 0.28, 0);
        return bar;
      })());
      this.register(
        new InstancedSet(
          "hurdle",
          [
            { geometry: frame.build().get("f")!, material: m.darkMetal },
            { geometry: rail.build().get("r")!, material: m.signWarning },
          ],
          8,
        ),
      );
    }

    // --- Roadblock: low concrete blocks with cones on top.
    {
      const blocks = new PartBuilder<"b">();
      for (let i = -1; i <= 1; i++) {
        blocks.add("b", (() => {
          const block = taperedBox(0.92, 0.72, 0.5, 0.56, 0.42);
          block.translate(i * 0.98, 0.25, 0);
          return block;
        })());
      }
      const cones = new PartBuilder<"c">();
      for (const x of [-0.98, 0.98]) {
        cones.add("c", (() => {
          const cone = new THREE.ConeGeometry(0.2, 0.44, 8);
          cone.translate(x, 0.72, 0);
          return cone;
        })());
      }
      this.register(
        new InstancedSet(
          "roadblock",
          [
            { geometry: blocks.build().get("b")!, material: m.concrete },
            { geometry: cones.build().get("c")!, material: m.cone },
          ],
          8,
        ),
      );
    }

    // --- Barricade: tall A-frame panel with amber beacons. Must be dodged.
    {
      const frame = new PartBuilder<"f">();
      frame.pair("f", () => roundedBox(0.13, 1.6, 0.13, 0.03, 1), 1.42, 0.8, 0);
      frame.add("f", (() => {
        const brace = roundedBox(2.9, 0.11, 0.11, 0.03, 1);
        brace.translate(0, 0.24, 0);
        return brace;
      })());
      const panels = new PartBuilder<"p">();
      for (let i = 0; i < 2; i++) {
        panels.add("p", (() => {
          const panel = roundedBox(3.1, 0.4, 0.13, 0.04, 1);
          panel.translate(0, 0.86 + i * 0.62, 0);
          return panel;
        })());
      }
      const stripes = new PartBuilder<"s">();
      for (let i = 0; i < 2; i++) {
        for (let j = -3; j <= 3; j++) {
          stripes.add("s", (() => {
            const band = roundedBox(0.24, 0.42, 0.16, 0.02, 1);
            band.rotateZ(0.5);
            band.translate(j * 0.42, 0.86 + i * 0.62, 0);
            return band;
          })());
        }
      }
      const lamps = new PartBuilder<"l">();
      lamps.pair("l", () => tubeZ(0.11, 0.14, 8), 1.42, 1.68, 0);
      this.register(
        new InstancedSet(
          "barricade",
          [
            { geometry: frame.build().get("f")!, material: m.darkMetal },
            { geometry: panels.build().get("p")!, material: m.barrierBody },
            { geometry: stripes.build().get("s")!, material: m.barrierStripe },
            { geometry: lamps.build().get("l")!, material: m.warningLamp },
          ],
          6,
        ),
      );
    }

    // --- Lane closure: arrow board on a trailer behind a cone taper.
    {
      const trailer = new PartBuilder<"t">();
      trailer.add("t", (() => {
        const deck = roundedBox(2.1, 0.24, 1.1, 0.05, 1);
        deck.translate(0, 0.42, 0);
        return deck;
      })());
      trailer.pair("t", () => roundedBox(0.14, 1.5, 0.14, 0.03, 1), 0.8, 1.2, 0);
      const board = new PartBuilder<"b">();
      board.add("b", (() => {
        const panel = roundedBox(2.4, 1.2, 0.16, 0.06, 1);
        panel.translate(0, 1.72, 0);
        return panel;
      })());
      // Chevron of lamps forming a right-pointing arrow.
      const lamps = new PartBuilder<"l">();
      for (let i = 0; i < 5; i++) {
        lamps.add("l", (() => {
          const lamp = tubeZ(0.075, 0.1, 6);
          lamp.translate(-0.72 + i * 0.34, 1.72, 0.1);
          return lamp;
        })());
      }
      for (let i = 0; i < 2; i++) {
        for (const dir of [1, -1]) {
          lamps.add("l", (() => {
            const lamp = tubeZ(0.075, 0.1, 6);
            lamp.translate(0.02 + i * 0.3, 1.72 + dir * (0.28 + i * 0.16), 0.1);
            return lamp;
          })());
        }
      }
      const cones = new PartBuilder<"c">();
      for (let i = 0; i < 3; i++) {
        cones.add("c", (() => {
          const cone = new THREE.ConeGeometry(0.24, 0.62, 8);
          cone.translate(-0.9 + i * 0.9, 0.31, -1.5 - i * 0.5);
          return cone;
        })());
        cones.add("c", (() => {
          const base = roundedBox(0.5, 0.06, 0.5, 0.02, 1);
          base.translate(-0.9 + i * 0.9, 0.03, -1.5 - i * 0.5);
          return base;
        })());
      }
      this.register(
        new InstancedSet(
          "laneClosure",
          [
            { geometry: trailer.build().get("t")!, material: m.darkMetal },
            { geometry: board.build().get("b")!, material: m.trim },
            { geometry: lamps.build().get("l")!, material: m.warningLamp },
            { geometry: cones.build().get("c")!, material: m.cone },
          ],
          6,
        ),
      );
    }

    // --- Standalone cone, used as an advance-warning taper before jumpable obstacles.
    {
      const cone = new PartBuilder<"c">();
      cone.add("c", (() => {
        const body = new THREE.ConeGeometry(0.25, 0.66, 8);
        body.translate(0, 0.33, 0);
        return body;
      })());
      cone.add("c", (() => {
        const base = roundedBox(0.56, 0.07, 0.56, 0.02, 1);
        base.translate(0, 0.035, 0);
        return base;
      })());
      const band = new PartBuilder<"s">();
      band.add("s", (() => {
        // Reflective band around the cone: a torus laid flat in the XZ plane.
        const ring = new THREE.TorusGeometry(0.155, 0.035, 4, 12);
        ring.rotateX(Math.PI / 2);
        ring.translate(0, 0.34, 0);
        return ring;
      })());
      this.register(
        new InstancedSet(
          "cone",
          [
            { geometry: cone.build().get("c")!, material: m.cone },
            { geometry: band.build().get("s")!, material: m.coneStripe },
          ],
          24,
        ),
      );
    }
  }

  private acquire(): Entity | null {
    for (const entity of this.entities) {
      if (!entity.active) return entity;
    }
    return null;
  }

  spawnObstacle(key: string, x: number, z: number): Entity | null {
    const spec = OBSTACLE_SPECS[key];
    if (!spec) return null;
    const entity = this.acquire();
    if (!entity) return null;
    entity.active = true;
    entity.key = key;
    entity.role = "obstacle";
    entity.x = x;
    entity.y = 0;
    entity.z = z;
    entity.speed = 0;
    entity.halfWidth = spec.halfWidth;
    entity.halfLength = spec.halfLength;
    entity.height = spec.height;
    entity.jumpable = spec.jumpable;
    entity.shadowWidth = spec.shadowWidth;
    entity.wheelKind = null;
    entity.nearMissed = false;
    entity.collectT = -1;
    entity.spin = 0;
    entity.laneDrift = 0;
    entity.driftTarget = 0;
    return entity;
  }

  spawnVehicle(kind: VehicleKind, x: number, z: number, speed: number, color?: number): Entity | null {
    const entity = this.acquire();
    if (!entity) return null;
    const hitbox = VEHICLE_HITBOX[kind] ?? VEHICLE_HITBOX.sedan;
    entity.active = true;
    entity.key = kind;
    entity.role = "traffic";
    entity.x = x;
    entity.y = 0;
    entity.z = z;
    entity.speed = speed;
    entity.halfWidth = hitbox.halfWidth;
    entity.halfLength = hitbox.halfLength;
    entity.height = hitbox.height;
    entity.jumpable = false;
    entity.shadowWidth = hitbox.halfWidth * 2.4;
    entity.wheelKind = kind;
    entity.color = color ?? TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
    entity.nearMissed = false;
    entity.collectT = -1;
    entity.spin = Math.random() * 6;
    entity.laneDrift = 0;
    entity.driftTarget = 0;
    return entity;
  }

  spawnCoin(x: number, y: number, z: number): Entity | null {
    const entity = this.acquire();
    if (!entity) return null;
    entity.active = true;
    entity.key = "coin";
    entity.role = "coin";
    entity.x = x;
    entity.y = y;
    entity.z = z;
    entity.speed = 0;
    entity.halfWidth = 0.62;
    entity.halfLength = 0.62;
    entity.height = y + 0.6;
    entity.jumpable = false;
    entity.shadowWidth = 0;
    entity.wheelKind = null;
    entity.collectT = -1;
    entity.spin = Math.random() * Math.PI * 2;
    entity.nearMissed = false;
    return entity;
  }

  spawnDecor(key: string, x: number, z: number): Entity | null {
    const entity = this.acquire();
    if (!entity) return null;
    entity.active = true;
    entity.key = key;
    entity.role = "decor";
    entity.x = x;
    entity.y = 0;
    entity.z = z;
    entity.speed = 0;
    entity.halfWidth = 0;
    entity.halfLength = 0;
    entity.height = 0;
    entity.jumpable = true;
    entity.shadowWidth = 0;
    entity.wheelKind = null;
    entity.collectT = -1;
    entity.spin = 0;
    entity.nearMissed = false;
    return entity;
  }

  clear(): void {
    for (const entity of this.entities) entity.active = false;
  }

  setCastShadow(enabled: boolean): void {
    for (const key of ["sedan", "suv", "sports", "van", "pickup", "truck", "barricade", "laneClosure"]) {
      this.sets.get(key)?.setCastShadow(enabled);
    }
  }

  /**
   * Advances entities, renders them, and reports what left the play area. `scroll` is the
   * distance the world moved this frame.
   */
  update(dt: number, scroll: number, shadows: GroundShadows): void {
    for (const set of this.sets.values()) set.begin();
    this.coinGlow.begin();

    for (const entity of this.entities) {
      if (!entity.active) continue;
      entity.z += scroll - entity.speed * dt;
      if (entity.z > DESPAWN_Z) {
        entity.active = false;
        continue;
      }

      if (entity.role === "coin") {
        entity.spin += dt * 3.4;
        if (entity.collectT >= 0) {
          entity.collectT += dt * 3.4;
          if (entity.collectT >= 1) {
            entity.active = false;
            continue;
          }
        }
      } else if (entity.role === "traffic" && entity.driftTarget !== 0) {
        // Lane-drifting traffic: eased so the player always has time to react.
        const step = dt * 1.9;
        entity.laneDrift += THREE.MathUtils.clamp(entity.driftTarget - entity.laneDrift, -step, step);
      }

      const set = this.sets.get(entity.key);
      if (!set) continue;
      const x = entity.x + entity.laneDrift;

      if (entity.role === "coin") {
        const pop = entity.collectT >= 0 ? 1 + entity.collectT * 1.5 : 1;
        const lift = entity.collectT >= 0 ? entity.collectT * 1.4 : 0;
        set.push(x, entity.y + lift, entity.z, entity.spin, pop, WHITE);
        this.coinGlow.push(x, entity.y + lift, entity.z - 0.05, 0, pop * 1.1, WHITE);
        continue;
      }

      TINT.setHex(entity.color, THREE.SRGBColorSpace);
      set.push(x, entity.y, entity.z, 0, 1, TINT);

      if (entity.shadowWidth > 0) {
        shadows.push(x, entity.z, entity.shadowWidth, entity.halfLength * 2.6);
      }

      if (entity.wheelKind) {
        const model = vehicleModels().get(entity.wheelKind)!;
        entity.spin += (entity.speed / 0.4) * dt;
        POS.set(x, 0, entity.z);
        QUAT.identity();
        const detailed = entity.z > RIM_LOD_Z;
        for (const spec of model.wheels) {
          this.wheels.push(spec, POS, QUAT, entity.spin, 0, WHEEL_GREY, null, detailed);
        }
      }
    }

    for (const set of this.sets.values()) set.end();
    this.coinGlow.end();
  }

  dispose(): void {
    for (const set of this.sets.values()) set.dispose();
    this.coinGlow.dispose();
  }
}
