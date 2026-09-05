import * as THREE from "three";
import {
  DRAW_DISTANCE,
  ROAD_BEHIND,
  ROAD_LENGTH,
  ROAD_TEXTURE_LENGTH,
  ROAD_WIDTH,
  SHOULDER_WIDTH,
} from "../game/config";
import { PartBuilder, box, mergeAll, roundedBox, taperedBox, tubeX } from "../render/geom";
import type { Materials } from "../render/materials";
import type { QualitySettings } from "../core/quality";
import type { BlendedTheme } from "./themes";

const POS = new THREE.Vector3();
const QUAT = new THREE.Quaternion();
const SCALE = new THREE.Vector3(1, 1, 1);
const MAT = new THREE.Matrix4();
const EULER = new THREE.Euler();

/**
 * A row of identical props repeating along the road at fixed spacing, drawn as one instanced
 * mesh. Slots wrap in place, so nothing is ever created or destroyed while driving.
 */
class StripField {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly slots: { z: number; x: number; y: number; yaw: number }[] = [];
  private readonly span: number;

  constructor(
    parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[],
    spacing: number,
    lateral: number[],
    height: number,
    options: { yawOutward?: boolean; from?: number; to?: number } = {},
  ) {
    const from = options.from ?? -DRAW_DISTANCE;
    const to = options.to ?? ROAD_BEHIND * 0.5;
    const rows = Math.ceil((to - from) / spacing);
    this.span = rows * spacing;
    for (let r = 0; r < rows; r++) {
      for (const x of lateral) {
        this.slots.push({
          z: from + r * spacing,
          x,
          y: height,
          yaw: options.yawOutward ? (x > 0 ? 0 : Math.PI) : 0,
        });
      }
    }
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, this.slots.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
    }
  }

  addTo(parent: THREE.Object3D): void {
    for (const mesh of this.meshes) parent.add(mesh);
  }

  setCastShadow(enabled: boolean): void {
    for (const mesh of this.meshes) mesh.castShadow = enabled;
  }

  setVisible(visible: boolean): void {
    for (const mesh of this.meshes) mesh.visible = visible;
  }

  update(scroll: number): void {
    const wrapped = ((scroll % this.span) + this.span) % this.span;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      let z = slot.z + wrapped;
      if (z > ROAD_BEHIND * 0.5) z -= this.span;
      POS.set(slot.x, slot.y, z);
      EULER.set(0, slot.yaw, 0);
      QUAT.setFromEuler(EULER);
      MAT.compose(POS, QUAT, SCALE);
      for (const mesh of this.meshes) mesh.setMatrixAt(i, MAT);
    }
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
  }
}

/**
 * Sparse landmark props (gantries, signs) that appear every few hundred metres. Too few to
 * justify instancing overhead bookkeeping, but still recycled rather than rebuilt.
 */
class LandmarkField {
  private readonly items: THREE.Object3D[] = [];
  private readonly baseZ: number[] = [];
  private readonly span: number;

  constructor(make: (index: number) => THREE.Object3D, count: number, spacing: number) {
    this.span = count * spacing;
    for (let i = 0; i < count; i++) {
      const object = make(i);
      object.position.z = -DRAW_DISTANCE + i * spacing;
      this.baseZ.push(object.position.z);
      this.items.push(object);
    }
  }

  addTo(parent: THREE.Object3D): void {
    for (const item of this.items) parent.add(item);
  }

  update(scroll: number): void {
    const wrapped = ((scroll % this.span) + this.span) % this.span;
    for (let i = 0; i < this.items.length; i++) {
      let z = this.baseZ[i] + wrapped;
      if (z > 30) z -= this.span;
      this.items[i].position.z = z;
    }
  }
}

/**
 * The highway itself: one textured surface whose baked markings scroll with it, plus instanced
 * guardrails, reflectors, street lighting and overhead gantries.
 */
export class Road {
  readonly group = new THREE.Group();
  private readonly surface: THREE.Mesh;
  private readonly shoulderCurbs: THREE.Mesh;
  private readonly guardrail: StripField;
  private readonly reflectors: StripField;
  private readonly lamps: StripField;
  private readonly lampPoolField: StripField;
  private readonly signs: StripField;
  private readonly gantries: LandmarkField;
  private readonly gantryGroup = new THREE.Group();
  private readonly materials: Materials;
  private readonly lampPoolMaterial: THREE.MeshBasicMaterial;

  constructor(materials: Materials, quality: QualitySettings) {
    this.materials = materials;
    this.group.name = "road";

    const totalWidth = ROAD_WIDTH + SHOULDER_WIDTH * 2;
    const surfaceGeo = new THREE.PlaneGeometry(totalWidth, ROAD_LENGTH, 1, 1);
    surfaceGeo.rotateX(-Math.PI / 2);
    this.surface = new THREE.Mesh(surfaceGeo, materials.road);
    this.surface.position.z = ROAD_BEHIND - ROAD_LENGTH / 2;
    this.surface.receiveShadow = quality.shadows;
    this.surface.name = "road-surface";
    materials.roadMap.repeat.set(1, ROAD_LENGTH / ROAD_TEXTURE_LENGTH);
    this.group.add(this.surface);

    // Raised concrete curb between shoulder and verge; sells the road as built, not painted on.
    const curbParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const curb = box(0.5, 0.26, ROAD_LENGTH);
      curb.translate(side * (totalWidth / 2 + 0.16), 0.09, 0);
      curbParts.push(curb);
    }
    this.shoulderCurbs = new THREE.Mesh(mergeAll(curbParts), materials.concrete);
    this.shoulderCurbs.position.z = ROAD_BEHIND - ROAD_LENGTH / 2;
    this.shoulderCurbs.receiveShadow = false;
    this.group.add(this.shoulderCurbs);

    const railX = totalWidth / 2 + 0.65;

    // Guardrail: W-beam plus post, merged into one instanced unit per 6 m bay.
    const railParts = new PartBuilder<"metal" | "post">();
    railParts.add("metal", (() => {
      const beam = box(0.09, 0.34, 6.02);
      beam.translate(0, 0.62, 0);
      return beam;
    })());
    railParts.add("metal", (() => {
      const lip = box(0.13, 0.06, 6.02);
      lip.translate(0, 0.78, 0);
      return lip;
    })());
    railParts.add("post", (() => {
      const post = box(0.14, 0.66, 0.14);
      post.translate(0, 0.33, -2.9);
      return post;
    })());
    const railGeo = railParts.build();
    this.guardrail = new StripField(
      [
        { geometry: railGeo.get("metal")!, material: materials.metalRail },
        { geometry: railGeo.get("post")!, material: materials.darkMetal },
      ],
      6,
      [railX, -railX],
      0,
    );
    this.guardrail.addTo(this.group);

    // Post reflectors, every second bay.
    const reflectorGeo = box(0.06, 0.13, 0.05);
    this.reflectors = new StripField(
      [{ geometry: reflectorGeo, material: materials.reflectorAmber }],
      12,
      [railX - 0.07, -railX + 0.07],
      0.82,
    );
    this.reflectors.addTo(this.group);

    // Street lighting: mast, a solid boom and a luminaire with a lit lens. The boom has to read
    // as a boom against a bright sky, otherwise the head looks like a slab floating in the air.
    const lampParts = new PartBuilder<"pole" | "head">();
    lampParts.add("pole", (() => {
      const base = taperedBox(0.34, 0.26, 0.55, 0.34, 0.26);
      base.translate(0, 0.27, 0);
      return base;
    })());
    lampParts.add("pole", (() => {
      const mast = taperedBox(0.2, 0.13, 6.7, 0.2, 0.13);
      mast.translate(0, 3.45, 0);
      return mast;
    })());
    const BOOM_SEGMENTS = 4;
    const BOOM_REACH = 2.0;
    for (let i = 0; i < BOOM_SEGMENTS; i++) {
      const t = i / BOOM_SEGMENTS;
      const next = (i + 1) / BOOM_SEGMENTS;
      lampParts.add("pole", (() => {
        // Each segment spans one step of a quarter-circle sweep from vertical to horizontal.
        const x0 = -BOOM_REACH * (1 - Math.cos(t * Math.PI * 0.5));
        const x1 = -BOOM_REACH * (1 - Math.cos(next * Math.PI * 0.5));
        const y0 = 6.8 + 0.62 * Math.sin(t * Math.PI * 0.5);
        const y1 = 6.8 + 0.62 * Math.sin(next * Math.PI * 0.5);
        const dx = x1 - x0;
        const dy = y1 - y0;
        const length = Math.hypot(dx, dy);
        const width = 0.17 - t * 0.045;
        const seg = taperedBox(width, width * 0.92, length + 0.03, width, width * 0.92);
        seg.rotateZ(Math.atan2(dy, dx) - Math.PI / 2);
        seg.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
        return seg;
      })());
    }
    lampParts.add("pole", (() => {
      const housing = taperedBox(0.46, 0.34, 0.2, 0.92, 0.66);
      housing.translate(-BOOM_REACH - 0.34, 7.36, 0);
      return housing;
    })());
    lampParts.add("head", (() => {
      const lens = taperedBox(0.34, 0.26, 0.07, 0.74, 0.54);
      lens.translate(-BOOM_REACH - 0.34, 7.23, 0);
      return lens;
    })());
    const lampGeo = lampParts.build();
    this.lamps = new StripField(
      [
        { geometry: lampGeo.get("pole")!, material: materials.darkMetal },
        { geometry: lampGeo.get("head")!, material: materials.lampGlass },
      ],
      46,
      [railX + 1.1, -railX - 1.1],
      0,
      { yawOutward: true },
    );
    this.lamps.addTo(this.group);

    // Additive pool of light on the asphalt under each lamp; fades in with the night theme.
    this.lampPoolMaterial = new THREE.MeshBasicMaterial({
      map: materials.glow,
      color: 0xffdca8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const poolGeo = new THREE.PlaneGeometry(13, 22);
    poolGeo.rotateX(-Math.PI / 2);
    this.lampPoolField = new StripField(
      [{ geometry: poolGeo, material: this.lampPoolMaterial }],
      46,
      [railX - 4.5, -railX + 4.5],
      0.045,
    );
    this.lampPoolField.addTo(this.group);

    // Roadside distance signs.
    const signParts = new PartBuilder<"post" | "face">();
    signParts.pair("post", () => box(0.1, 2.6, 0.1), 0.62, 1.3, 0);
    signParts.add("face", (() => {
      const face = box(1.9, 1.15, 0.09);
      face.translate(0, 3.1, 0);
      return face;
    })());
    const signGeo = signParts.build();
    this.signs = new StripField(
      [
        { geometry: signGeo.get("post")!, material: materials.darkMetal },
        { geometry: signGeo.get("face")!, material: materials.signFace },
      ],
      120,
      [railX + 2.4, -railX - 2.4],
      0,
      { yawOutward: true },
    );
    this.signs.addTo(this.group);

    // Overhead gantries.
    this.group.add(this.gantryGroup);
    this.gantries = new LandmarkField(() => this.makeGantry(), 3, 210);
    this.gantries.addTo(this.gantryGroup);

    this.setQuality(quality);
  }

  private makeGantry(): THREE.Group {
    const group = new THREE.Group();
    const half = ROAD_WIDTH / 2 + SHOULDER_WIDTH + 1.4;
    const structure = new PartBuilder<"s">();
    structure.pair("s", () => roundedBox(0.42, 7.2, 0.42, 0.08, 1), half, 3.6, 0);
    structure.pair("s", () => taperedBox(0.8, 0.5, 0.4, 0.8, 0.5), half, 0.2, 0);
    // Truss: two chords and a zig-zag web.
    structure.add("s", (() => {
      const chord = tubeX(0.11, half * 2);
      chord.translate(0, 7.05, 0);
      return chord;
    })());
    structure.add("s", (() => {
      const chord = tubeX(0.11, half * 2);
      chord.translate(0, 6.15, 0);
      return chord;
    })());
    const bays = 12;
    for (let i = 0; i < bays; i++) {
      const x = -half + ((i + 0.5) / bays) * half * 2;
      structure.add("s", (() => {
        const web = roundedBox(0.07, 1.05, 0.07, 0.02, 1);
        web.rotateZ(i % 2 === 0 ? 0.55 : -0.55);
        web.translate(x, 6.6, 0);
        return web;
      })());
    }
    const built = structure.build();
    const frame = new THREE.Mesh(built.get("s")!, this.materials.darkMetal);
    group.add(frame);

    // Two overhead sign panels with a simple painted legend block.
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(
        roundedBox(5.4, 2.3, 0.14, 0.08, 1),
        this.materials.signFace,
      );
      panel.position.set(side * 3.6, 5.0, 0.1);
      group.add(panel);
      const legend = new THREE.Mesh(roundedBox(4.2, 0.34, 0.04, 0.02, 1), this.materials.concrete);
      legend.position.set(side * 3.6, 5.4, 0.19);
      group.add(legend);
      const legend2 = new THREE.Mesh(roundedBox(2.6, 0.28, 0.04, 0.02, 1), this.materials.concrete);
      legend2.position.set(side * 3.6, 4.85, 0.19);
      group.add(legend2);
    }
    return group;
  }

  setQuality(quality: QualitySettings): void {
    this.surface.receiveShadow = quality.shadows;
    this.guardrail.setCastShadow(false);
    this.lamps.setVisible(quality.level !== "low");
    this.lampPoolField.setVisible(quality.level !== "low");
    this.signs.setVisible(quality.level !== "low");
    this.gantryGroup.visible = quality.level !== "low";
    this.materials.roadMap.anisotropy = quality.anisotropy;
  }

  applyTheme(theme: BlendedTheme): void {
    this.lampPoolMaterial.opacity = theme.nightFactor * 0.5;
  }

  /**
   * `scroll` is total distance travelled. The surface uses texture offset so markings never
   * pop, and every instanced field wraps against its own span.
   */
  update(scroll: number): void {
    this.materials.roadMap.offset.y = -(scroll / ROAD_TEXTURE_LENGTH);
    this.materials.asphaltNormal.offset.y =
      -(scroll * this.materials.asphaltNormal.repeat.y) / ROAD_LENGTH;
    this.guardrail.update(scroll);
    this.reflectors.update(scroll);
    this.lamps.update(scroll);
    this.lampPoolField.update(scroll);
    this.signs.update(scroll);
    this.gantries.update(scroll);
  }

  dispose(): void {
    this.surface.geometry.dispose();
    this.shoulderCurbs.geometry.dispose();
    this.guardrail.dispose();
    this.reflectors.dispose();
    this.lamps.dispose();
    this.lampPoolField.dispose();
    this.signs.dispose();
    this.lampPoolMaterial.dispose();
  }
}

export { StripField, LandmarkField };
