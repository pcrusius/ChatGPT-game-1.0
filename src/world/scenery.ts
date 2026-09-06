import * as THREE from "three";
import { DRAW_DISTANCE, ROAD_WIDTH, SHOULDER_WIDTH } from "../game/config";
import { PartBuilder, roundedBox, taperedBox } from "../render/geom";
import type { Materials } from "../render/materials";
import type { QualitySettings } from "../core/quality";
import type { PropMix } from "./themes";

const POS = new THREE.Vector3();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3();
const MAT = new THREE.Matrix4();
const EULER = new THREE.Euler();

interface PropDef {
  name: string;
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  minLateral: number;
  maxLateral: number;
  minScale: number;
  maxScale: number;
  capacity: number;
  /**
   * Radius of the soft dark patch laid under the prop, in the prop's own units. Without one a
   * prop reads as hovering, because the roadside terrain takes no real shadows. Omit for props
   * so large or so distant that the patch would never be visible.
   */
  contact?: number;
}

interface Slot {
  baseZ: number;
  side: 1 | -1;
  prop: number;
  lateral: number;
  scale: number;
  yaw: number;
  seed: number;
}

const ROADSIDE = ROAD_WIDTH / 2 + SHOULDER_WIDTH + 3.5;
const ROW_SPACING = 13;
const PER_ROW = 4;

/** Deterministic per-slot randomness so a recycled slot looks new without allocating. */
function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Themed roadside scenery. Every prop type is a pair of instanced meshes; slots are recycled
 * far out in the fog, and a slot picks a new prop from the active theme's mix when it wraps,
 * which is what makes theme transitions dissolve rather than pop.
 */
export class Scenery {
  readonly group = new THREE.Group();
  private readonly defs: PropDef[] = [];
  private readonly meshes: THREE.InstancedMesh[][] = [];
  private readonly counts: number[] = [];
  private readonly slots: Slot[] = [];
  private readonly span: number;
  private contactMaterial: THREE.Material | null = null;
  private mix: PropMix = [];
  private mixTotal = 0;
  private density = 1;

  constructor(materials: Materials, quality: QualitySettings) {
    this.group.name = "scenery";
    this.registerProps(materials);

    const rows = Math.ceil((DRAW_DISTANCE + 60) / ROW_SPACING);
    this.span = rows * ROW_SPACING;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < PER_ROW; i++) {
        this.slots.push({
          baseZ: -DRAW_DISTANCE + r * ROW_SPACING + (i % 2) * (ROW_SPACING / 2),
          side: i < PER_ROW / 2 ? 1 : -1,
          prop: -1,
          lateral: 0,
          scale: 1,
          yaw: 0,
          seed: r * PER_ROW + i + 1,
        });
      }
    }

    for (const def of this.defs) {
      const group: THREE.InstancedMesh[] = [];
      for (const part of def.parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, def.capacity);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.count = 0;
        this.group.add(mesh);
        group.push(mesh);
      }
      this.meshes.push(group);
      this.counts.push(0);
    }
    this.setQuality(quality);
  }

  private add(def: PropDef): void {
    if (def.contact && this.contactMaterial) {
      const patch = new THREE.PlaneGeometry(def.contact * 2, def.contact * 2);
      patch.rotateX(-Math.PI / 2);
      patch.translate(0, 0.02, 0);
      def.parts = [...def.parts, { geometry: patch, material: this.contactMaterial }];
    }
    this.defs.push(def);
  }

  private index(name: string): number {
    return this.defs.findIndex((d) => d.name === name);
  }

  private registerProps(m: Materials): void {
    this.contactMaterial = m.contactShadow;
    // --- Palm: curved trunk with a crown of drooping fronds.
    {
      // Trunk leans gently and tapers; the lean is baked in so instances stay one draw call.
      const segments = 6;
      const trunk = new PartBuilder<"t">();
      let tipX = 0;
      let tipY = 0;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const radius = 0.24 - t * 0.09;
        const lean = Math.sin(t * 1.15) * 0.95;
        const y = 0.5 + i * 0.92;
        tipX = lean;
        tipY = y + 0.46;
        trunk.add("t", (() => {
          const seg = taperedBox(radius, radius * 0.86, 0.98, radius, radius * 0.86);
          seg.rotateZ(-Math.cos(t * 1.15) * 0.2);
          seg.translate(lean, y, 0);
          return seg;
        })());
      }
      const fronds = new PartBuilder<"f">();
      const frondCount = 9;
      for (let i = 0; i < frondCount; i++) {
        const a = (i / frondCount) * Math.PI * 2;
        const droop = 0.5 + (i % 3) * 0.22;
        fronds.add("f", (() => {
          // Long tapered blade laid outward from the crown, then drooped at the tip.
          const frond = taperedBox(0.5, 0.06, 2.9, 0.08, 0.04);
          frond.translate(0, 1.45, 0);
          frond.rotateZ(Math.PI / 2 - droop);
          frond.rotateY(a);
          frond.translate(tipX, tipY, 0);
          return frond;
        })());
      }
      fronds.add("f", (() => {
        const crown = new THREE.IcosahedronGeometry(0.34, 0);
        crown.translate(tipX, tipY, 0);
        return crown;
      })());
      this.add({
        name: "palm",
        contact: 1.15,
        parts: [
          { geometry: trunk.build().get("t")!, material: m.trunk },
          { geometry: fronds.build().get("f")!, material: m.leaf },
        ],
        minLateral: 2,
        maxLateral: 16,
        minScale: 0.85,
        maxScale: 1.4,
        capacity: 26,
      });
    }

    // --- Pine: stacked cones.
    {
      const trunk = taperedBox(0.24, 0.18, 1.6, 0.24, 0.18);
      trunk.translate(0, 0.8, 0);
      const canopy = new PartBuilder<"c">();
      for (let i = 0; i < 3; i++) {
        canopy.add("c", (() => {
          const cone = new THREE.ConeGeometry(1.7 - i * 0.42, 2.3 - i * 0.35, 7);
          cone.translate(0, 2.0 + i * 1.35, 0);
          return cone;
        })());
      }
      this.add({
        name: "pine",
        contact: 1.7,
        parts: [
          { geometry: trunk, material: m.trunk },
          { geometry: canopy.build().get("c")!, material: m.leaf },
        ],
        minLateral: 4,
        maxLateral: 26,
        minScale: 0.85,
        maxScale: 1.6,
        capacity: 26,
      });
    }

    // --- Bush: a clump of low-poly blobs.
    {
      const bush = new PartBuilder<"b">();
      for (let i = 0; i < 3; i++) {
        bush.add("b", (() => {
          // Barely flattened: squashed blobs read as green puddles on the verge rather than
          // as shrubs, which is how they looked in the first pass.
          const blob = new THREE.IcosahedronGeometry(0.58 - i * 0.09, 0);
          blob.scale(1.1, 1.02, 1.05);
          blob.translate((i - 1) * 0.44, 0.52 + (i % 2) * 0.2, (i - 1) * 0.28);
          return blob;
        })());
      }
      this.add({
        name: "bush",
        contact: 1.35,
        parts: [{ geometry: bush.build().get("b")!, material: m.leaf }],
        minLateral: 1,
        maxLateral: 22,
        minScale: 0.7,
        maxScale: 1.5,
        capacity: 34,
      });
    }

    // --- Rock: faceted boulder.
    {
      const rock = new THREE.IcosahedronGeometry(1, 0);
      rock.scale(1.3, 0.85, 1.1);
      rock.translate(0, 0.6, 0);
      this.add({
        name: "rock",
        contact: 1.5,
        parts: [{ geometry: rock, material: m.rock }],
        minLateral: 5,
        maxLateral: 34,
        minScale: 0.55,
        maxScale: 1.15,
        capacity: 30,
      });
    }

    // --- Cactus: trunk with two raised arms.
    {
      const cactus = new PartBuilder<"c">();
      cactus.add("c", (() => {
        const body = new THREE.CapsuleGeometry(0.34, 2.5, 4, 8);
        body.translate(0, 1.6, 0);
        return body;
      })());
      for (const side of [-1, 1]) {
        cactus.add("c", (() => {
          const arm = new THREE.CapsuleGeometry(0.2, 0.9, 3, 6);
          arm.rotateZ((side * Math.PI) / 2);
          arm.translate(side * 0.55, 1.5 + (side > 0 ? 0.3 : 0), 0);
          return arm;
        })());
        cactus.add("c", (() => {
          const up = new THREE.CapsuleGeometry(0.2, 1.0, 3, 6);
          up.translate(side * 1.0, 2.1 + (side > 0 ? 0.3 : 0), 0);
          return up;
        })());
      }
      this.add({
        name: "cactus",
        contact: 1.0,
        parts: [{ geometry: cactus.build().get("c")!, material: m.leaf }],
        minLateral: 2,
        maxLateral: 24,
        minScale: 0.8,
        maxScale: 1.5,
        capacity: 24,
      });
    }

    // --- Mesa: layered desert butte, kept far from the road.
    {
      const mesa = new PartBuilder<"m">();
      mesa.add("m", (() => {
        const base = new THREE.CylinderGeometry(9, 12, 7, 7, 1);
        base.translate(0, 3.5, 0);
        return base;
      })());
      mesa.add("m", (() => {
        const cap = new THREE.CylinderGeometry(6.4, 8.6, 5, 7, 1);
        cap.translate(1.2, 9, 0.6);
        return cap;
      })());
      mesa.add("m", (() => {
        const top = new THREE.CylinderGeometry(3.4, 5.6, 3.4, 6, 1);
        top.translate(-0.8, 12.8, -0.5);
        return top;
      })());
      this.add({
        name: "mesa",
        parts: [{ geometry: mesa.build().get("m")!, material: m.rock }],
        minLateral: 46,
        maxLateral: 120,
        minScale: 0.9,
        maxScale: 2.6,
        capacity: 14,
      });
    }

    // --- Tower: city block with an emissive window grid.
    {
      const shell = taperedBox(1, 0.92, 1, 1, 0.92);
      shell.translate(0, 0.5, 0);
      const windows = new PartBuilder<"w">();
      for (const [dx, dz, rot] of [
        [0.505, 0, Math.PI / 2],
        [-0.505, 0, Math.PI / 2],
        [0, 0.505, 0],
        [0, -0.505, 0],
      ] as const) {
        windows.add("w", (() => {
          const panel = new THREE.PlaneGeometry(0.9, 0.94);
          panel.rotateY(rot + (dx < 0 || dz < 0 ? Math.PI : 0));
          panel.translate(dx, 0.5, dz);
          return panel;
        })());
      }
      const crown = roundedBox(0.4, 0.1, 0.4, 0.03, 1);
      crown.translate(0, 1.02, 0);
      this.add({
        name: "tower",
        parts: [
          { geometry: shell, material: m.building },
          { geometry: windows.build().get("w")!, material: m.buildingWindows },
          { geometry: crown, material: m.darkMetal },
        ],
        minLateral: 34,
        maxLateral: 150,
        minScale: 12,
        maxScale: 46,
        capacity: 30,
      });
    }

    // --- Neon sign: lit frame on a mast.
    {
      const mast = taperedBox(0.24, 0.18, 6, 0.24, 0.18);
      mast.translate(0, 3, 0);
      const frame = new PartBuilder<"n">();
      frame.add("n", (() => {
        const bar = roundedBox(3.4, 0.28, 0.16, 0.08, 1);
        bar.translate(0, 7.2, 0);
        return bar;
      })());
      frame.add("n", (() => {
        const bar = roundedBox(3.4, 0.28, 0.16, 0.08, 1);
        bar.translate(0, 5.5, 0);
        return bar;
      })());
      frame.add("n", (() => {
        const ring = new THREE.TorusGeometry(0.72, 0.11, 5, 14);
        ring.translate(0, 6.35, 0);
        return ring;
      })());
      this.add({
        name: "neonSign",
        contact: 0.6,
        parts: [
          { geometry: mast, material: m.darkMetal },
          { geometry: frame.build().get("n")!, material: m.neon },
        ],
        minLateral: 6,
        maxLateral: 24,
        minScale: 0.9,
        maxScale: 1.6,
        capacity: 18,
      });
    }

    // --- Billboard: twin posts, a dark frame and printed artwork on both faces.
    {
      const posts = new PartBuilder<"p">();
      posts.pair("p", () => roundedBox(0.26, 5.4, 0.26, 0.05, 1), 1.7, 2.7, 0);
      const face = roundedBox(6.4, 3.2, 0.2, 0.08, 1);
      face.translate(0, 6.6, 0);
      const trim = roundedBox(6.8, 0.22, 0.3, 0.08, 1);
      trim.translate(0, 8.35, 0);
      // Slots are yawed at random, so the artwork is printed back to back.
      const art = new PartBuilder<"a">();
      for (const facing of [1, -1]) {
        art.add("a", (() => {
          const panel = new THREE.PlaneGeometry(6.05, 2.9);
          if (facing < 0) panel.rotateY(Math.PI);
          panel.translate(0, 6.6, facing * 0.11);
          return panel;
        })());
      }
      this.add({
        name: "billboard",
        contact: 0.8,
        parts: [
          { geometry: posts.build().get("p")!, material: m.darkMetal },
          { geometry: face, material: m.darkMetal },
          { geometry: art.build().get("a")!, material: m.poster },
          { geometry: trim, material: m.concrete },
        ],
        minLateral: 8,
        maxLateral: 30,
        minScale: 0.85,
        maxScale: 1.3,
        capacity: 12,
      });
    }

    // --- Lamp-lit verge hillock, used to break up flat terrain in every theme.
    {
      const mound = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      mound.scale(1, 0.42, 1.4);
      // Sunk a little so the rim blends into the verge instead of standing on it as a hard edge.
      mound.translate(0, -0.07, 0);
      this.add({
        name: "lamp",
        parts: [{ geometry: mound, material: m.terrainFar }],
        // Kept well back: a 20 m mound beside the shoulder reads as a green wall, not a hill.
        minLateral: 26,
        maxLateral: 90,
        minScale: 6,
        maxScale: 22,
        capacity: 26,
      });
    }
  }

  setQuality(quality: QualitySettings): void {
    this.density = quality.sceneryDensity;
    this.assignAll();
  }

  setMix(mix: PropMix): void {
    this.mix = mix;
    this.mixTotal = mix.reduce((sum, entry) => sum + entry.weight, 0);
    if (this.slots.every((slot) => slot.prop === -1)) this.assignAll();
  }

  /** Re-rolls every slot at once; used on theme reset and when density changes. */
  assignAll(): void {
    for (const slot of this.slots) this.assign(slot);
  }

  private assign(slot: Slot): void {
    slot.seed += 7.13;
    if (this.mixTotal === 0 || rand(slot.seed, 1) > this.density) {
      slot.prop = -1;
      return;
    }
    let pick = rand(slot.seed, 2) * this.mixTotal;
    let chosen = this.mix[0];
    for (const entry of this.mix) {
      pick -= entry.weight;
      if (pick <= 0) {
        chosen = entry;
        break;
      }
    }
    const index = this.index(chosen.type);
    slot.prop = index;
    if (index < 0) return;
    const def = this.defs[index];
    slot.lateral =
      slot.side * (ROADSIDE + def.minLateral + rand(slot.seed, 3) * (def.maxLateral - def.minLateral));
    slot.scale = def.minScale + rand(slot.seed, 4) * (def.maxScale - def.minScale);
    slot.yaw = rand(slot.seed, 5) * Math.PI * 2;
  }

  update(scroll: number): void {
    this.counts.fill(0);
    const wrapped = ((scroll % this.span) + this.span) % this.span;
    for (const slot of this.slots) {
      let z = slot.baseZ + wrapped;
      if (z > 40) {
        z -= this.span;
        // A slot only re-rolls while it is far away in the fog, so theme changes dissolve.
        this.assign(slot);
      }
      if (slot.prop < 0) continue;
      const index = slot.prop;
      const count = this.counts[index];
      const def = this.defs[index];
      if (count >= def.capacity) continue;
      this.counts[index] = count + 1;
      POS.set(slot.lateral, 0, z);
      EULER.set(0, slot.yaw, 0);
      QUAT.setFromEuler(EULER);
      SCALE.setScalar(slot.scale);
      MAT.compose(POS, QUAT, SCALE);
      for (const mesh of this.meshes[index]) mesh.setMatrixAt(count, MAT);
    }
    for (let i = 0; i < this.defs.length; i++) {
      for (const mesh of this.meshes[i]) {
        mesh.count = this.counts[i];
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const group of this.meshes) {
      for (const mesh of group) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
    }
  }
}
