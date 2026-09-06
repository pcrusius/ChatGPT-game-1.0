import * as THREE from "three";
import {
  PartBuilder,
  arch,
  loft,
  mergeAll,
  roundedBox,
  superSection,
  taperedBox,
  tubeX,
  tubeZ,
  type LoftSection,
} from "./geom";
import type { Materials } from "./materials";

/**
 * All vehicles are authored as many small primitives and merged, at module load, into one
 * buffer per material role. A car therefore costs a handful of draw calls instead of dozens,
 * and every wheel in the scene is drawn by the shared instanced WheelSystem below.
 */

export type CarRole = "paint" | "accent" | "glass" | "trim" | "carbon" | "chrome" | "head" | "tail";

export interface WheelSpec {
  x: number;
  z: number;
  radius: number;
  width: number;
}

export interface VehicleModel {
  roles: Map<CarRole, THREE.BufferGeometry>;
  wheels: WheelSpec[];
  halfLength: number;
  halfWidth: number;
  height: number;
  /** Whether this model deserves the expensive clearcoat paint and caliper detail. */
  hero: boolean;
}

const section = (
  z: number,
  halfWidth: number,
  yBottom: number,
  yTop: number,
  inset = 0.16,
  exponent = 3.2,
): LoftSection => ({ z, pts: superSection(halfWidth, yBottom, yTop, inset, exponent) });

// ---------------------------------------------------------------------------------------------
// Player supercar
// ---------------------------------------------------------------------------------------------

/**
 * Mid-engine exotic: cab-forward greenhouse, wide rear haunches, low nose, 4.5 m long and
 * 1.2 m tall. Built as a lofted tub so the shoulders and haunches read as one smooth surface.
 */
function buildSupercar(): VehicleModel {
  const b = new PartBuilder<CarRole>();

  const body: LoftSection[] = [
    section(-2.26, 0.62, 0.3, 0.44, 0.4, 2.6),
    section(-2.1, 0.82, 0.24, 0.56, 0.34, 2.8),
    section(-1.78, 0.94, 0.2, 0.655, 0.24),
    section(-1.4, 0.97, 0.2, 0.7, 0.2),
    section(-1.02, 0.88, 0.19, 0.66, 0.17),
    section(-0.5, 0.86, 0.19, 0.755, 0.14),
    section(0.22, 0.89, 0.19, 0.82, 0.14),
    section(0.9, 0.965, 0.2, 0.89, 0.16),
    section(1.44, 1.0, 0.22, 0.935, 0.18),
    section(1.92, 0.955, 0.24, 0.92, 0.22),
    section(2.18, 0.84, 0.28, 0.86, 0.32, 2.8),
    section(2.26, 0.68, 0.32, 0.74, 0.44, 2.6),
  ];
  b.add("paint", loft(body));

  // Greenhouse: glass windshield, painted roof panel, glass rear screen.
  const cabin: LoftSection[] = [
    section(-0.9, 0.6, 0.7, 0.78, 0.2, 2.6),
    section(-0.56, 0.655, 0.74, 0.99, 0.26),
    section(-0.14, 0.645, 0.78, 1.2, 0.3),
    section(0.34, 0.625, 0.8, 1.2, 0.32),
    section(0.74, 0.615, 0.82, 1.1, 0.3),
    section(1.02, 0.57, 0.86, 0.94, 0.32, 2.6),
  ];
  b.add("glass", loft(cabin, { from: 0, to: 2, capEnd: false }));
  b.add("paint", loft(cabin, { from: 2, to: 3, capStart: false, capEnd: false }));
  b.add("glass", loft(cabin, { from: 3, to: 5, capStart: false }));

  // Window surround / beltline trim.
  b.pair("trim", () => roundedBox(0.05, 0.06, 1.7, 0.02), 0.63, 0.79, 0.06);

  // Body-coloured fender lips. The tub cannot be cut open for a wheel arch, so the arch is
  // added over the tyre instead: it covers the top of the wheel the way a fender does and
  // stops the tyre reading as a black ring stuck to the flank.
  b.pair("paint", () => arch(0.395, 0.058, 0.38, 172), 0.74, 0.35, -1.4);
  b.pair("paint", () => arch(0.42, 0.062, 0.43, 172), 0.78, 0.375, 1.44);
  // Dark inner arch behind the lip, so the gap above the tyre reads as shadow, not sky. Kept
  // narrower than the tyre and inside the lip: any of it that clears both turns back into the
  // black horseshoe stuck over the wheel that the lip was added to get rid of.
  b.pair("trim", () => arch(0.335, 0.033, 0.2, 150), 0.68, 0.35, -1.4);
  b.pair("trim", () => arch(0.358, 0.036, 0.24, 150), 0.72, 0.375, 1.44);

  // Front end: splitter, canards, lower intakes, grille.
  b.at("carbon", roundedBox(1.66, 0.09, 0.5, 0.04), 0, 0.18, -2.02);
  b.pair("carbon", () => roundedBox(0.3, 0.05, 0.22, 0.02), 0.72, 0.3, -2.1, { z: 0.12 });
  b.pair("trim", () => taperedBox(0.24, 0.19, 0.26, 0.1, 0.08), 0.56, 0.35, -1.98);
  b.at("trim", taperedBox(0.42, 0.34, 0.16, 0.1, 0.07), 0, 0.4, -2.16);
  b.pair("trim", () => roundedBox(0.12, 0.075, 0.34, 0.03), 0.83, 0.5, -1.72, { y: 0.14 });

  // Headlights: slim angular units with a chrome eyebrow.
  b.pair("head", () => taperedBox(0.34, 0.3, 0.12, 0.1, 0.07, -0.02), 0.55, 0.585, -2.0, {
    z: 0.1,
  });
  b.pair("chrome", () => roundedBox(0.36, 0.035, 0.14, 0.015), 0.55, 0.655, -2.0, { z: 0.1 });

  // Hood vents and cowl.
  b.pair("trim", () => roundedBox(0.34, 0.03, 0.3, 0.02), 0.42, 0.665, -1.42);
  b.at("trim", roundedBox(1.1, 0.03, 0.12, 0.02), 0, 0.69, -0.98);

  // Side sills and intake blades.
  b.pair("carbon", () => roundedBox(0.1, 0.13, 1.9, 0.04), 0.86, 0.235, 0.16);
  b.pair("trim", () => taperedBox(0.1, 0.08, 0.3, 0.34, 0.22), 0.92, 0.5, 0.86);

  // Mirrors on slim stalks, set low and outboard like a modern exotic.
  b.pair("trim", () => tubeX(0.024, 0.14), 0.94, 0.76, -0.72);
  b.pair("accent", () => roundedBox(0.12, 0.08, 0.19, 0.035), 1.02, 0.78, -0.72, { y: 0.22 });

  // Engine deck: louvre slats behind the cabin.
  for (let i = 0; i < 5; i++) {
    b.at("trim", roundedBox(0.86, 0.025, 0.1, 0.012), 0, 0.895 - i * 0.004, 1.16 + i * 0.13, {
      x: -0.16,
    });
  }

  // Rear wing on swan-neck stays.
  b.pair("carbon", () => taperedBox(0.06, 0.05, 0.26, 0.13, 0.1), 0.5, 1.0, 1.88);
  b.at("carbon", taperedBox(1.42, 1.34, 0.055, 0.44, 0.36, -0.05), 0, 1.13, 1.88, { x: -0.1 });
  b.pair("carbon", () => taperedBox(0.045, 0.045, 0.2, 0.4, 0.26), 0.71, 1.16, 1.9);

  // Rear fascia: slim light blade across painted bodywork, outer clusters, low dark vent.
  b.at("chrome", roundedBox(1.02, 0.018, 0.05, 0.008), 0, 0.815, 2.245);
  b.at("tail", roundedBox(0.94, 0.05, 0.05, 0.018), 0, 0.785, 2.25);
  b.pair("tail", () => roundedBox(0.12, 0.14, 0.05, 0.03), 0.55, 0.65, 2.24);
  b.at("trim", taperedBox(0.98, 0.86, 0.22, 0.06, 0.05), 0, 0.5, 2.2);

  // Diffuser with fins and twin exhausts.
  b.at("carbon", taperedBox(1.5, 1.34, 0.24, 0.22, 0.16), 0, 0.29, 2.1);
  for (let i = -2; i <= 2; i++) {
    b.at("carbon", roundedBox(0.05, 0.19, 0.34, 0.02), i * 0.3, 0.3, 2.08);
  }
  b.pair("chrome", () => tubeZ(0.058, 0.2), 0.42, 0.42, 2.24);

  // Small low reflectors, deliberately dim next to the light blade.
  b.pair("trim", () => roundedBox(0.11, 0.045, 0.04, 0.012), 0.6, 0.4, 2.24);

  return {
    roles: b.build(),
    wheels: [
      { x: 0.74, z: -1.4, radius: 0.35, width: 0.28 },
      { x: -0.74, z: -1.4, radius: 0.35, width: 0.28 },
      { x: 0.78, z: 1.44, radius: 0.375, width: 0.33 },
      { x: -0.78, z: 1.44, radius: 0.375, width: 0.33 },
    ],
    halfLength: 2.3,
    halfWidth: 1.02,
    height: 1.3,
    hero: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Traffic archetypes
// ---------------------------------------------------------------------------------------------

interface TrafficSpec {
  body: LoftSection[];
  cabin: LoftSection[];
  /** z of the rear face, where the tail lights and bumper go. */
  rearZ: number;
  rearHalfWidth: number;
  tailY: number;
  frontZ: number;
  headY: number;
  wheels: WheelSpec[];
  /** Extra boxy volume, e.g. a pickup bed wall or a van cargo box. */
  extras?: (b: PartBuilder<CarRole>) => void;
  hasHeadlights?: boolean;
}

function buildTraffic(spec: TrafficSpec): VehicleModel {
  const b = new PartBuilder<CarRole>();
  b.add("paint", loft(spec.body));
  b.add("glass", loft(spec.cabin));

  // Bumpers, sills and wheel arch trim keep the silhouette from reading as a single blob.
  const first = spec.body[0];
  const last = spec.body[spec.body.length - 1];
  b.at("trim", roundedBox(spec.rearHalfWidth * 1.85, 0.2, 0.16, 0.05), 0, 0.42, spec.rearZ + 0.03);
  b.at("trim", roundedBox(spec.rearHalfWidth * 1.8, 0.18, 0.16, 0.05), 0, 0.42, spec.frontZ - 0.03);
  b.pair(
    "trim",
    () => roundedBox(0.08, 0.12, Math.abs(last.z - first.z) * 0.62, 0.03),
    spec.rearHalfWidth * 0.94,
    0.3,
    (spec.frontZ + spec.rearZ) / 2,
  );
  for (const wheel of spec.wheels) {
    if (wheel.x < 0) continue;
    b.pair(
      "trim",
      () => roundedBox(0.06, wheel.radius * 0.8, wheel.radius * 2.7, 0.02),
      Math.abs(wheel.x) + 0.06,
      wheel.radius,
      wheel.z,
    );
  }

  // Tail lights: the only lights the player ever sees on traffic, so they carry the detail.
  b.pair(
    "tail",
    () => roundedBox(0.34, 0.16, 0.07, 0.03),
    spec.rearHalfWidth * 0.66,
    spec.tailY,
    spec.rearZ + 0.02,
  );
  if (spec.hasHeadlights !== false) {
    b.pair(
      "head",
      () => roundedBox(0.32, 0.13, 0.07, 0.03),
      spec.rearHalfWidth * 0.66,
      spec.headY,
      spec.frontZ - 0.02,
    );
  }
  spec.extras?.(b);

  return {
    roles: b.build(),
    wheels: spec.wheels,
    halfLength: Math.max(Math.abs(spec.frontZ), Math.abs(spec.rearZ)) + 0.06,
    halfWidth: spec.rearHalfWidth + 0.05,
    height: 1.6,
    hero: false,
  };
}

function buildSedan(): VehicleModel {
  return buildTraffic({
    body: [
      section(-2.24, 0.66, 0.3, 0.62, 0.34, 2.8),
      section(-2.0, 0.83, 0.24, 0.76, 0.26),
      section(-1.5, 0.88, 0.22, 0.82, 0.2),
      section(-0.6, 0.9, 0.22, 0.86, 0.18),
      section(0.5, 0.9, 0.22, 0.87, 0.18),
      section(1.5, 0.88, 0.22, 0.84, 0.2),
      section(2.06, 0.83, 0.26, 0.8, 0.26),
      section(2.28, 0.68, 0.3, 0.7, 0.36, 2.8),
    ],
    cabin: [
      section(-1.02, 0.66, 0.8, 0.88, 0.2, 2.6),
      section(-0.66, 0.72, 0.84, 1.24, 0.24),
      section(0.2, 0.74, 0.86, 1.35, 0.26),
      section(0.94, 0.72, 0.86, 1.3, 0.26),
      section(1.42, 0.66, 0.84, 1.0, 0.28, 2.6),
    ],
    rearZ: 2.28,
    rearHalfWidth: 0.9,
    tailY: 0.78,
    frontZ: -2.24,
    headY: 0.66,
    wheels: [
      { x: 0.86, z: -1.44, radius: 0.34, width: 0.26 },
      { x: -0.86, z: -1.44, radius: 0.34, width: 0.26 },
      { x: 0.86, z: 1.5, radius: 0.34, width: 0.26 },
      { x: -0.86, z: 1.5, radius: 0.34, width: 0.26 },
    ],
  });
}

function buildSuv(): VehicleModel {
  return buildTraffic({
    body: [
      section(-2.3, 0.76, 0.36, 0.98, 0.24, 3),
      section(-2.06, 0.92, 0.3, 1.12, 0.18),
      section(-1.5, 0.96, 0.28, 1.2, 0.14),
      section(-0.4, 0.98, 0.28, 1.24, 0.12),
      section(0.9, 0.98, 0.28, 1.24, 0.12),
      section(1.9, 0.96, 0.3, 1.2, 0.14),
      section(2.34, 0.86, 0.34, 1.1, 0.22, 3),
    ],
    cabin: [
      section(-1.16, 0.74, 1.12, 1.2, 0.16, 2.8),
      section(-0.82, 0.84, 1.16, 1.62, 0.18),
      section(0.4, 0.86, 1.18, 1.72, 0.18),
      section(1.6, 0.84, 1.18, 1.68, 0.2),
      section(2.0, 0.76, 1.16, 1.5, 0.24, 2.8),
    ],
    rearZ: 2.34,
    rearHalfWidth: 0.98,
    tailY: 1.16,
    frontZ: -2.3,
    headY: 0.98,
    wheels: [
      { x: 0.93, z: -1.52, radius: 0.42, width: 0.3 },
      { x: -0.93, z: -1.52, radius: 0.42, width: 0.3 },
      { x: 0.93, z: 1.56, radius: 0.42, width: 0.3 },
      { x: -0.93, z: 1.56, radius: 0.42, width: 0.3 },
    ],
    extras: (b) => {
      b.at("trim", roundedBox(1.0, 0.06, 1.9, 0.03), 0, 1.76, 0.3);
      b.pair("trim", () => roundedBox(0.07, 0.09, 1.9, 0.03), 0.4, 1.79, 0.3);
    },
  });
}

function buildSportsTraffic(): VehicleModel {
  return buildTraffic({
    body: [
      section(-2.1, 0.62, 0.28, 0.5, 0.36, 2.6),
      section(-1.9, 0.8, 0.22, 0.62, 0.28),
      section(-1.4, 0.86, 0.2, 0.68, 0.2),
      section(-0.5, 0.84, 0.2, 0.74, 0.16),
      section(0.6, 0.88, 0.2, 0.82, 0.16),
      section(1.5, 0.9, 0.22, 0.86, 0.2),
      section(2.0, 0.84, 0.26, 0.82, 0.28),
      section(2.16, 0.68, 0.3, 0.7, 0.4, 2.6),
    ],
    cabin: [
      section(-0.82, 0.6, 0.7, 0.78, 0.2, 2.6),
      section(-0.44, 0.66, 0.74, 1.02, 0.26),
      section(0.24, 0.64, 0.78, 1.12, 0.3),
      section(0.86, 0.62, 0.8, 1.02, 0.3),
      section(1.14, 0.56, 0.84, 0.9, 0.32, 2.6),
    ],
    rearZ: 2.16,
    rearHalfWidth: 0.88,
    tailY: 0.72,
    frontZ: -2.1,
    headY: 0.56,
    wheels: [
      { x: 0.84, z: -1.36, radius: 0.34, width: 0.28 },
      { x: -0.84, z: -1.36, radius: 0.34, width: 0.28 },
      { x: 0.86, z: 1.4, radius: 0.36, width: 0.34 },
      { x: -0.86, z: 1.4, radius: 0.36, width: 0.34 },
    ],
    extras: (b) => {
      b.pair("carbon", () => roundedBox(0.05, 0.12, 0.16, 0.02), 0.62, 0.94, 1.72);
      b.at("carbon", roundedBox(1.42, 0.05, 0.22, 0.02), 0, 1.02, 1.72);
    },
  });
}

function buildVan(): VehicleModel {
  return buildTraffic({
    body: [
      section(-2.5, 0.82, 0.32, 1.1, 0.2, 3),
      section(-2.24, 0.96, 0.28, 1.3, 0.14),
      section(-1.7, 1.0, 0.26, 1.9, 0.1),
      section(0, 1.0, 0.26, 2.1, 0.08),
      section(1.9, 1.0, 0.26, 2.08, 0.08),
      section(2.6, 0.98, 0.28, 2.0, 0.12),
      section(2.72, 0.9, 0.32, 1.86, 0.2, 3),
    ],
    cabin: [
      section(-2.22, 0.9, 1.24, 1.34, 0.12, 3),
      section(-1.96, 0.94, 1.3, 1.86, 0.12),
      section(-1.72, 0.96, 1.32, 1.92, 0.12),
    ],
    rearZ: 2.72,
    rearHalfWidth: 1.0,
    tailY: 1.5,
    frontZ: -2.5,
    headY: 0.86,
    wheels: [
      { x: 0.95, z: -1.7, radius: 0.4, width: 0.3 },
      { x: -0.95, z: -1.7, radius: 0.4, width: 0.3 },
      { x: 0.95, z: 1.72, radius: 0.4, width: 0.3 },
      { x: -0.95, z: 1.72, radius: 0.4, width: 0.3 },
    ],
    extras: (b) => {
      // Cargo-box side panel seams and rear doors.
      b.pair("trim", () => roundedBox(0.05, 1.3, 2.9, 0.02), 1.0, 1.2, 0.5);
      b.at("trim", roundedBox(1.7, 1.5, 0.06, 0.03), 0, 1.15, 2.72);
      b.pair("glass", () => roundedBox(0.42, 0.5, 0.05, 0.02), 0.42, 1.5, 2.73);
    },
  });
}

function buildPickup(): VehicleModel {
  return buildTraffic({
    body: [
      section(-2.6, 0.8, 0.38, 0.92, 0.22, 3),
      section(-2.36, 0.94, 0.32, 1.06, 0.16),
      section(-1.8, 0.98, 0.3, 1.14, 0.12),
      section(-0.5, 0.98, 0.3, 1.2, 0.12),
      section(0.3, 0.98, 0.3, 1.16, 0.12),
      section(2.5, 0.98, 0.3, 1.12, 0.12),
      section(2.7, 0.86, 0.34, 1.04, 0.22, 3),
    ],
    cabin: [
      section(-1.5, 0.78, 1.1, 1.2, 0.16, 2.8),
      section(-1.2, 0.88, 1.14, 1.66, 0.18),
      section(-0.1, 0.88, 1.16, 1.74, 0.18),
      section(0.34, 0.8, 1.14, 1.5, 0.22, 2.8),
    ],
    rearZ: 2.7,
    rearHalfWidth: 0.98,
    tailY: 1.02,
    frontZ: -2.6,
    headY: 0.94,
    wheels: [
      { x: 0.95, z: -1.7, radius: 0.44, width: 0.32 },
      { x: -0.95, z: -1.7, radius: 0.44, width: 0.32 },
      { x: 0.95, z: 1.78, radius: 0.44, width: 0.32 },
      { x: -0.95, z: 1.78, radius: 0.44, width: 0.32 },
    ],
    extras: (b) => {
      // Bed walls and tailgate.
      b.pair("paint", () => roundedBox(0.1, 0.5, 2.2, 0.04), 0.93, 1.36, 1.5);
      b.at("paint", roundedBox(1.88, 0.5, 0.1, 0.04), 0, 1.36, 2.6);
      b.at("trim", roundedBox(1.7, 0.05, 2.1, 0.02), 0, 1.18, 1.5);
    },
  });
}

function buildBoxTruck(): VehicleModel {
  return buildTraffic({
    body: [
      section(-3.1, 0.94, 0.44, 1.5, 0.16, 3.2),
      section(-2.86, 1.06, 0.4, 1.72, 0.1),
      section(-2.3, 1.1, 0.38, 2.5, 0.06),
      section(-1.9, 1.14, 0.38, 2.66, 0.04),
      section(2.9, 1.16, 0.4, 2.72, 0.04),
      section(3.1, 1.06, 0.44, 2.6, 0.14, 3.2),
    ],
    cabin: [
      section(-2.84, 1.0, 1.66, 1.78, 0.08, 3.2),
      section(-2.44, 1.04, 1.7, 2.42, 0.08),
      section(-2.28, 1.06, 1.72, 2.46, 0.08),
    ],
    rearZ: 3.1,
    rearHalfWidth: 1.14,
    tailY: 1.0,
    frontZ: -3.1,
    headY: 1.1,
    wheels: [
      { x: 1.08, z: -2.16, radius: 0.5, width: 0.34 },
      { x: -1.08, z: -2.16, radius: 0.5, width: 0.34 },
      { x: 1.08, z: 1.9, radius: 0.5, width: 0.44 },
      { x: -1.08, z: 1.9, radius: 0.5, width: 0.44 },
    ],
    extras: (b) => {
      b.pair("trim", () => roundedBox(0.06, 2.2, 4.6, 0.02), 1.16, 1.6, 0.4);
      b.at("trim", roundedBox(2.1, 2.2, 0.07, 0.03), 0, 1.6, 3.12);
      b.at("carbon", roundedBox(2.2, 0.12, 0.2, 0.04), 0, 0.52, 3.16);
      // Reflective chevrons on the rear door.
      for (let i = -1; i <= 1; i++) {
        b.at("tail", roundedBox(0.5, 0.1, 0.04, 0.02), i * 0.62, 0.72, 3.15);
      }
    },
  });
}

export type VehicleKind = "player" | "sedan" | "suv" | "sports" | "van" | "pickup" | "truck";

let cache: Map<VehicleKind, VehicleModel> | null = null;

export function vehicleModels(): Map<VehicleKind, VehicleModel> {
  if (cache) return cache;
  cache = new Map<VehicleKind, VehicleModel>([
    ["player", buildSupercar()],
    ["sedan", buildSedan()],
    ["suv", buildSuv()],
    ["sports", buildSportsTraffic()],
    ["van", buildVan()],
    ["pickup", buildPickup()],
    ["truck", buildBoxTruck()],
  ]);
  return cache;
}

export const TRAFFIC_KINDS: VehicleKind[] = ["sedan", "suv", "sports", "van", "pickup"];

// ---------------------------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------------------------

/**
 * Tyre revolved around the axle. The profile is an open annulus whose bore is 0.76 of the outer
 * radius: a supercar runs a low-profile tyre, and the tall sidewall the first pass had made the
 * wheel read as a black donut with a small hubcap in it. Radii are normalised to 1 and scaled
 * per wheel by the instance matrix.
 */
function tireGeometry(): THREE.BufferGeometry {
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(0.76, -0.5),
    new THREE.Vector2(0.94, -0.5),
    new THREE.Vector2(0.995, -0.33),
    new THREE.Vector2(0.995, 0.33),
    new THREE.Vector2(0.94, 0.5),
    new THREE.Vector2(0.76, 0.5),
  ];
  const geo = new THREE.LatheGeometry(profile, 20);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

/**
 * Ten-spoke rim, normalised to unit tyre radius: outer lip, dished barrel, hub and spokes that
 * lie in the plane of the wheel. Colour comes from per-instance colour so every skin can have
 * its own finish from one geometry.
 */
function rimGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const lip = new THREE.TorusGeometry(0.755, 0.045, 4, 20);
  lip.rotateY(Math.PI / 2);
  lip.translate(0.3, 0, 0);
  parts.push(lip);

  const barrel = new THREE.CylinderGeometry(0.75, 0.71, 0.88, 20, 1, true);
  barrel.rotateZ(Math.PI / 2);
  barrel.translate(-0.04, 0, 0);
  parts.push(barrel);

  const hub = new THREE.CylinderGeometry(0.21, 0.17, 0.14, 10);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.26, 0, 0);
  parts.push(hub);

  // Solid disc across the back of the barrel: without it the road shows through the wheel.
  const dish = new THREE.CylinderGeometry(0.72, 0.72, 0.03, 20);
  dish.rotateZ(Math.PI / 2);
  dish.translate(-0.4, 0, 0);
  parts.push(dish);

  const spokes = 5;
  for (let i = 0; i < spokes; i++) {
    // Spokes stay in the wheel plane: extend along Y, then rotate about the axle.
    const spoke = taperedBox(0.15, 0.1, 0.62, 0.22, 0.1);
    spoke.translate(0, 0.42, 0);
    spoke.rotateX((i / spokes) * Math.PI * 2);
    spoke.translate(0.22, 0, 0);
    parts.push(spoke);
    const split = taperedBox(0.11, 0.06, 0.56, 0.12, 0.06);
    split.translate(0, 0.44, 0);
    split.rotateX(((i + 0.5) / spokes) * Math.PI * 2);
    split.translate(0.18, 0, 0);
    parts.push(split);
  }
  return mergeAll(parts);
}

/**
 * Brake caliper only; the disc is part of the rim so that the caliper can carry the skin's
 * accent colour on its own. Does not spin with the wheel.
 */
function brakeGeometry(): THREE.BufferGeometry {
  const caliper = roundedBox(0.14, 0.38, 0.18, 0.04);
  caliper.rotateY(Math.PI / 2);
  caliper.translate(0.0, 0.54, -0.12);
  return caliper;
}

const SPIN = new THREE.Quaternion();
const SPIN_AXIS = new THREE.Vector3(1, 0, 0);
/** Turns the wheel around so its spoke face points outboard on the left-hand side. */
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const SCRATCH_QUAT = new THREE.Quaternion();
const SCRATCH_POS = new THREE.Vector3();
const SCRATCH_SCALE = new THREE.Vector3();
const SCRATCH_MATRIX = new THREE.Matrix4();
const SCRATCH_OFFSET = new THREE.Vector3();

/**
 * Every wheel in the scene, drawn from three instanced meshes regardless of how many cars are
 * on screen. Vehicles push their wheel transforms each frame; nothing here allocates.
 */
export class WheelSystem {
  readonly group = new THREE.Group();
  private readonly tires: THREE.InstancedMesh;
  private readonly rims: THREE.InstancedMesh;
  private readonly brakes: THREE.InstancedMesh;
  private count = 0;
  private rimCount = 0;
  private brakeCount = 0;

  /** Wheels close enough to show spokes: the player plus a handful of nearby cars. */
  private readonly rimCapacity = 40;

  constructor(
    private readonly capacity: number,
    materials: Materials,
  ) {
    this.tires = new THREE.InstancedMesh(tireGeometry(), materials.tire, capacity);
    this.rims = new THREE.InstancedMesh(rimGeometry(), materials.rim, this.rimCapacity);
    this.brakes = new THREE.InstancedMesh(brakeGeometry(), materials.brake, 8);
    for (const mesh of [this.tires, this.rims, this.brakes]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
    this.rims.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.rimCapacity * 3).fill(1),
      3,
    );
    this.brakes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24).fill(1), 3);
    this.group.name = "wheels";
  }

  setShadows(enabled: boolean): void {
    this.tires.castShadow = enabled;
    this.rims.castShadow = enabled;
  }

  beginFrame(): void {
    this.count = 0;
    this.rimCount = 0;
    this.brakeCount = 0;
  }

  /**
   * Adds one wheel. `spin` is the shared rotation angle for the vehicle's wheels; `bodyQuat`
   * and `bodyPos` place it in world space.
   */
  push(
    spec: WheelSpec,
    bodyPos: THREE.Vector3,
    bodyQuat: THREE.Quaternion,
    spin: number,
    verticalOffset: number,
    rimColor: THREE.Color,
    brakeColor: THREE.Color | null,
    /** Spokes are a few pixels wide on distant cars, so far wheels get the tyre only. */
    detailed = true,
  ): void {
    if (this.count >= this.capacity) return;
    const slot = this.count++;

    SCRATCH_OFFSET.set(spec.x, spec.radius + verticalOffset, spec.z).applyQuaternion(bodyQuat);
    SCRATCH_POS.copy(bodyPos).add(SCRATCH_OFFSET);
    // Left-side wheels are turned 180 degrees rather than negatively scaled, which would flip
    // winding order; the spin direction is negated to compensate.
    const flip = spec.x < 0;
    SPIN.setFromAxisAngle(SPIN_AXIS, flip ? -spin : spin);
    SCRATCH_QUAT.copy(bodyQuat);
    if (flip) SCRATCH_QUAT.multiply(FLIP_Y);
    SCRATCH_QUAT.multiply(SPIN);
    SCRATCH_SCALE.set(spec.width, spec.radius, spec.radius);
    SCRATCH_MATRIX.compose(SCRATCH_POS, SCRATCH_QUAT, SCRATCH_SCALE);
    this.tires.setMatrixAt(slot, SCRATCH_MATRIX);
    if (detailed && this.rimCount < this.rimCapacity) {
      const rimSlot = this.rimCount++;
      this.rims.setMatrixAt(rimSlot, SCRATCH_MATRIX);
      this.rims.instanceColor!.setXYZ(rimSlot, rimColor.r, rimColor.g, rimColor.b);
    }

    if (brakeColor && this.brakeCount < 8) {
      const brakeSlot = this.brakeCount++;
      // Brakes stay upright: body orientation only, no wheel spin.
      SCRATCH_QUAT.copy(bodyQuat);
      if (flip) SCRATCH_QUAT.multiply(FLIP_Y);
      SCRATCH_SCALE.set(spec.width * 0.5, spec.radius, spec.radius);
      SCRATCH_MATRIX.compose(SCRATCH_POS, SCRATCH_QUAT, SCRATCH_SCALE);
      this.brakes.setMatrixAt(brakeSlot, SCRATCH_MATRIX);
      this.brakes.instanceColor!.setXYZ(brakeSlot, brakeColor.r, brakeColor.g, brakeColor.b);
    }
  }

  endFrame(): void {
    // Instance counts are trimmed to what was actually pushed; unused slots would still run the
    // vertex shader even with a zero-scale matrix.
    this.tires.count = this.count;
    this.rims.count = this.rimCount;
    this.brakes.count = this.brakeCount;
    this.tires.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
    this.rims.instanceColor!.needsUpdate = true;
    this.brakes.instanceMatrix.needsUpdate = true;
    this.brakes.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.tires, this.rims, this.brakes]) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Vehicle instances
// ---------------------------------------------------------------------------------------------

export interface VehicleViewOptions {
  paint: THREE.Material;
  accent?: THREE.Material;
  castShadow?: boolean;
}

/** A drawable vehicle: one group holding a merged mesh per material role. */
export class VehicleView {
  readonly group = new THREE.Group();
  readonly model: VehicleModel;
  readonly rimColor = new THREE.Color(0xffffff);
  brakeColor: THREE.Color | null = null;
  private readonly paintMeshes: THREE.Mesh[] = [];
  private readonly accentMeshes: THREE.Mesh[] = [];

  constructor(model: VehicleModel, materials: Materials, options: VehicleViewOptions) {
    this.model = model;
    const lookup: Record<CarRole, THREE.Material> = {
      paint: options.paint,
      accent: options.accent ?? options.paint,
      glass: model.hero ? materials.glass : materials.glassSimple,
      trim: materials.trim,
      carbon: materials.carbon,
      chrome: materials.chrome,
      head: materials.headlight,
      tail: materials.taillight,
    };
    for (const [role, geometry] of model.roles) {
      const mesh = new THREE.Mesh(geometry, lookup[role]);
      mesh.castShadow = options.castShadow ?? false;
      mesh.receiveShadow = false;
      if (role === "paint") this.paintMeshes.push(mesh);
      if (role === "accent") this.accentMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  setPaint(material: THREE.Material, accent?: THREE.Material): void {
    for (const mesh of this.paintMeshes) mesh.material = material;
    for (const mesh of this.accentMeshes) mesh.material = accent ?? material;
  }

  setShadow(enabled: boolean): void {
    for (const child of this.group.children) {
      (child as THREE.Mesh).castShadow = enabled;
    }
  }

  /** Feeds this vehicle's four wheels into the shared instanced system. */
  pushWheels(wheels: WheelSystem, spin: number, suspension = 0): void {
    for (const spec of this.model.wheels) {
      wheels.push(
        spec,
        this.group.position,
        this.group.quaternion,
        spin,
        suspension,
        this.rimColor,
        this.brakeColor,
      );
    }
  }
}
