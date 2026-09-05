import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Geometry helpers used to author models as many small primitives that are then merged into a
 * handful of buffers. Merging happens once at load; the game loop only ever draws the result.
 */

const KEEP = ["position", "normal", "uv"] as const;

/**
 * mergeGeometries requires identical attribute sets, so strip everything unusual and drop the
 * index. Non-indexed also preserves each primitive's own hard normals across the merge.
 */
function normalize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  for (const name of KEEP) {
    const attr = flat.getAttribute(name);
    if (attr) {
      out.setAttribute(name, attr);
    } else if (name === "uv") {
      const count = flat.getAttribute("position").count;
      out.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    } else if (name === "normal") {
      out.computeVertexNormals();
    }
  }
  if (!out.getAttribute("normal")) out.computeVertexNormals();
  return out;
}

export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 1) return normalize(parts[0]);
  const merged = mergeGeometries(parts.map(normalize), false);
  if (!merged) throw new Error("geometry merge failed");
  return merged;
}

/** Accumulates primitives per material role and merges each role into one buffer. */
export class PartBuilder<Role extends string> {
  private readonly buckets = new Map<Role, THREE.BufferGeometry[]>();

  add(role: Role, geo: THREE.BufferGeometry, transform?: (g: THREE.BufferGeometry) => void): this {
    if (transform) transform(geo);
    const bucket = this.buckets.get(role);
    if (bucket) bucket.push(geo);
    else this.buckets.set(role, [geo]);
    return this;
  }

  /** Convenience: place a primitive without composing a matrix by hand. */
  at(
    role: Role,
    geo: THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rot?: { x?: number; y?: number; z?: number },
  ): this {
    if (rot?.x) geo.rotateX(rot.x);
    if (rot?.y) geo.rotateY(rot.y);
    if (rot?.z) geo.rotateZ(rot.z);
    geo.translate(x, y, z);
    return this.add(role, geo);
  }

  /**
   * Places a primitive on both sides of the centreline. Geometry is rebuilt rather than
   * negatively scaled, since a mirror matrix would flip winding order and break backface
   * culling. Y and Z rotations are negated so angled parts splay outward symmetrically.
   */
  pair(
    role: Role,
    make: () => THREE.BufferGeometry,
    x: number,
    y: number,
    z: number,
    rot?: { x?: number; y?: number; z?: number },
  ): this {
    this.at(role, make(), x, y, z, rot);
    return this.at(role, make(), -x, y, z, {
      x: rot?.x,
      y: rot?.y ? -rot.y : undefined,
      z: rot?.z ? -rot.z : undefined,
    });
  }

  build(): Map<Role, THREE.BufferGeometry> {
    const out = new Map<Role, THREE.BufferGeometry>();
    for (const [role, parts] of this.buckets) out.set(role, mergeAll(parts));
    this.buckets.clear();
    return out;
  }
}

/** Rounded rectangle path, the basis of every soft-edged box in the game. */
function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const radius = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4);
  const x = w / 2;
  const y = h / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + radius, -y);
  shape.lineTo(x - radius, -y);
  shape.quadraticCurveTo(x, -y, x, -y + radius);
  shape.lineTo(x, y - radius);
  shape.quadraticCurveTo(x, y, x - radius, y);
  shape.lineTo(-x + radius, y);
  shape.quadraticCurveTo(-x, y, -x, y - radius);
  shape.lineTo(-x, -y + radius);
  shape.quadraticCurveTo(-x, -y, -x + radius, -y);
  return shape;
}

/** Box with rounded vertical edges and a bevelled cap, centred on the origin. */
/**
 * Plain 12-triangle box. Used for small or distant props where a bevel costs 48 extra triangles
 * and is never more than a pixel wide on screen.
 */
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

export function roundedBox(w: number, h: number, d: number, r = 0.06, curve = 2): THREE.BufferGeometry {
  const bevel = Math.min(r, d / 2 - 1e-3);
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth: Math.max(d - bevel * 2, 1e-3),
    bevelEnabled: bevel > 1e-3,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 1,
    curveSegments: curve,
  });
  geo.translate(0, 0, -(d - bevel * 2) / 2);
  return geo;
}

/**
 * Extrudes a side-view profile given as [z, y] pairs into a solid of the requested width.
 * This is how car bodies, guardrails and barriers get their silhouettes.
 */
export function profileSolid(
  points: readonly [number, number][],
  width: number,
  bevel = 0.05,
  curve = 1,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const b = Math.min(bevel, width / 2 - 1e-3);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(width - b * 2, 1e-3),
    bevelEnabled: b > 1e-3,
    bevelSize: b,
    bevelThickness: b,
    bevelSegments: 1,
    curveSegments: curve,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate((width - b * 2) / 2, 0, 0);
  return geo;
}

/** Trapezoidal slab: a box whose top face is narrower/shorter than its base. */
export function taperedBox(
  bottomW: number,
  topW: number,
  height: number,
  bottomD: number,
  topD: number,
  topShift = 0,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(1, height, 1, 1, 1, 1);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const top = y > 0;
    pos.setX(i, pos.getX(i) * (top ? topW : bottomW));
    pos.setZ(i, pos.getZ(i) * (top ? topD : bottomD) + (top ? topShift : 0));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Partial tube used for wheel arches and rounded fender lips. */
export function arch(radius: number, thickness: number, width: number, arcDeg = 200): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(radius, thickness, 5, 16, THREE.MathUtils.degToRad(arcDeg));
  // Centre the arc on +Y, then swing the ring into the ZY plane so it spans the wheel.
  geo.rotateZ(THREE.MathUtils.degToRad(-(arcDeg - 180) / 2));
  geo.rotateY(Math.PI / 2);
  // Only the tube thickness lies along X, so scaling X sets the arch width.
  geo.scale(width / (thickness * 2), 1, 1);
  return geo;
}

/** Cylinder aligned to the X axis, for exhausts, axles and rails. */
export function tubeX(radius: number, length: number, segments = 10): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segments, 1);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

/** Cylinder aligned to the Z axis, for lights, intakes and sign posts. */
export function tubeZ(radius: number, length: number, segments = 10): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, length, segments, 1);
  geo.rotateX(Math.PI / 2);
  return geo;
}

export interface LoftSection {
  z: number;
  /** Cross-section outline in the XY plane, wound consistently across all sections. */
  pts: [number, number][];
}

/**
 * Superellipse cross-section: a rectangle with adjustable corner softness and a taper toward
 * the top. Car bodies are authored as a stack of these, which yields smooth shoulders and
 * haunches that a box-and-cylinder model cannot reach.
 */
export function superSection(
  halfWidth: number,
  yBottom: number,
  yTop: number,
  topInset = 0.15,
  exponent = 3.2,
  segments = 14,
): [number, number][] {
  const centre = (yBottom + yTop) / 2;
  const half = (yTop - yBottom) / 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const cx = Math.cos(theta);
    const cy = Math.sin(theta);
    const power = 2 / exponent;
    const sx = Math.sign(cx) * Math.abs(cx) ** power;
    const sy = Math.sign(cy) * Math.abs(cy) ** power;
    const taper = 1 - topInset * Math.max(0, sy);
    pts.push([sx * halfWidth * taper, centre + sy * half]);
  }
  return pts;
}

/** Builds a smooth-shaded tube through a stack of cross-sections. */
export function loft(
  sections: readonly LoftSection[],
  options: { from?: number; to?: number; capStart?: boolean; capEnd?: boolean } = {},
): THREE.BufferGeometry {
  const from = options.from ?? 0;
  const to = options.to ?? sections.length - 1;
  const used = sections.slice(from, to + 1);
  const ring = used[0].pts.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (const section of used) {
    for (const [x, y] of section.pts) positions.push(x, y, section.z);
  }
  for (let s = 0; s < used.length - 1; s++) {
    const a = s * ring;
    const b = (s + 1) * ring;
    for (let i = 0; i < ring; i++) {
      const j = (i + 1) % ring;
      // Wound so the surface normal points radially outward for counter-clockwise sections.
      indices.push(a + i, b + j, b + i);
      indices.push(a + i, a + j, b + j);
    }
  }

  const cap = (sectionIndex: number, flip: boolean) => {
    const section = used[sectionIndex];
    let cx = 0;
    let cy = 0;
    for (const [x, y] of section.pts) {
      cx += x;
      cy += y;
    }
    const centre = positions.length / 3;
    positions.push(cx / ring, cy / ring, section.z);
    const base = sectionIndex * ring;
    for (let i = 0; i < ring; i++) {
      const j = (i + 1) % ring;
      if (flip) indices.push(centre, base + j, base + i);
      else indices.push(centre, base + i, base + j);
    }
  };
  if (options.capStart !== false) cap(0, true);
  if (options.capEnd !== false) cap(used.length - 1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const count = positions.length / 3;
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  return geo;
}

export function disposeGeometries(map: Map<string, THREE.BufferGeometry>): void {
  for (const geo of map.values()) geo.dispose();
}
