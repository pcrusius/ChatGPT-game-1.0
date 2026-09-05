import * as THREE from "three";
import type { Materials } from "../render/materials";
import type { QualitySettings } from "../core/quality";

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = color;
  vAlpha = aAlpha;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = aSize * (320.0 / max(-view.z, 0.1));
}
`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vColor, tex.a * vAlpha);
}
`;

export type BurstKind =
  | "coin"
  | "dust"
  | "spark"
  | "crash"
  | "landing"
  | "wind"
  | "boost";

/**
 * One pooled particle system for the whole game, drawn in a single additive point-sprite pass.
 * Particle state lives in flat typed arrays; spawning and updating never allocate.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly capacity: number;
  private count = 0;

  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly fade: Float32Array;

  private readonly positionAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly alphaAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;
  private windTimer = 0;

  constructor(materials: Materials, quality: QualitySettings) {
    this.capacity = quality.maxParticles;
    const n = this.capacity;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vz = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.fade = new Float32Array(n);

    const geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(n), 1);
    for (const attr of [this.positionAttr, this.colorAttr, this.sizeAttr, this.alphaAttr]) {
      attr.setUsage(THREE.DynamicDrawUsage);
    }
    geometry.setAttribute("position", this.positionAttr);
    geometry.setAttribute("color", this.colorAttr);
    geometry.setAttribute("aSize", this.sizeAttr);
    geometry.setAttribute("aAlpha", this.alphaAttr);
    geometry.setDrawRange(0, 0);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: materials.glow } },
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = "particles";
  }

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    size: number,
    life: number,
    r: number,
    g: number,
    b: number,
    gravity: number,
    drag: number,
    fade: number,
  ): void {
    // Oldest-wins: when saturated, recycle slot 0 rather than dropping the new effect.
    const i = this.count < this.capacity ? this.count++ : Math.floor(Math.random() * this.capacity);
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grav[i] = gravity;
    this.drag[i] = drag;
    this.fade[i] = fade;
    this.colorAttr.setXYZ(i, r, g, b);
  }

  burst(kind: BurstKind, x: number, y: number, z: number, strength = 1): void {
    switch (kind) {
      case "coin": {
        const n = Math.round(9 * strength);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 2.2 + Math.random() * 3.4;
          this.spawn(
            x, y, z,
            Math.cos(a) * s, 1.6 + Math.random() * 3.4, Math.sin(a) * s * 0.6,
            0.34 + Math.random() * 0.22, 0.42 + Math.random() * 0.2,
            1, 0.82 + Math.random() * 0.18, 0.28,
            -5, 2.6, 1.6,
          );
        }
        break;
      }
      case "dust": {
        const n = Math.round(3 * strength);
        for (let i = 0; i < n; i++) {
          this.spawn(
            x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.2, z,
            (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.1, 3 + Math.random() * 5,
            0.5 + Math.random() * 0.5, 0.4 + Math.random() * 0.3,
            0.62, 0.58, 0.5,
            0.6, 1.8, 1.1,
          );
        }
        break;
      }
      case "spark": {
        const n = Math.round(8 * strength);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          this.spawn(
            x, y, z,
            Math.cos(a) * (3 + Math.random() * 6), Math.random() * 5, Math.sin(a) * 2 + 4,
            0.18 + Math.random() * 0.16, 0.22 + Math.random() * 0.25,
            1, 0.72 + Math.random() * 0.2, 0.24,
            -12, 1.2, 2.4,
          );
        }
        break;
      }
      case "crash": {
        for (let i = 0; i < Math.round(26 * strength); i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 3 + Math.random() * 12;
          const smoke = i % 3 === 0;
          this.spawn(
            x + (Math.random() - 0.5) * 1.4, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.4,
            Math.cos(a) * s, 2 + Math.random() * 9, Math.sin(a) * s * 0.7,
            smoke ? 1.1 + Math.random() * 0.9 : 0.24 + Math.random() * 0.24,
            smoke ? 0.9 + Math.random() * 0.6 : 0.3 + Math.random() * 0.4,
            smoke ? 0.42 : 1,
            smoke ? 0.4 : 0.66 + Math.random() * 0.3,
            smoke ? 0.44 : 0.2,
            smoke ? 1.4 : -14,
            smoke ? 1.4 : 1.1,
            smoke ? 0.9 : 2,
          );
        }
        break;
      }
      case "landing": {
        for (let i = 0; i < Math.round(14 * strength); i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 2 + Math.random() * 5;
          this.spawn(
            x + Math.cos(a) * 0.7, y + 0.1, z + Math.sin(a) * 0.5,
            Math.cos(a) * s, 0.8 + Math.random() * 2.2, Math.sin(a) * s * 0.5 + 4,
            0.55 + Math.random() * 0.65, 0.4 + Math.random() * 0.35,
            0.72, 0.68, 0.6,
            0.8, 2.2, 1.1,
          );
        }
        break;
      }
      case "boost": {
        for (let i = 0; i < Math.round(4 * strength); i++) {
          this.spawn(
            x + (Math.random() - 0.5) * 0.5, y, z,
            (Math.random() - 0.5) * 1.2, Math.random() * 0.8, 6 + Math.random() * 6,
            0.3 + Math.random() * 0.3, 0.25 + Math.random() * 0.2,
            0.5, 0.75, 1,
            0.2, 1.5, 1.8,
          );
        }
        break;
      }
      case "wind": {
        this.spawn(
          x, y, z,
          0, 0, 0,
          0.2 + Math.random() * 0.28, 0.55,
          0.85, 0.9, 1,
          0, 0, 1.4,
        );
        break;
      }
    }
  }

  /** Atmospheric motes streaming past the camera; only at speed, and rate-limited. */
  emitWind(dt: number, speed: number, cameraX: number, cameraZ: number, enabled: boolean): void {
    if (!enabled || speed < 52) return;
    this.windTimer += dt * (speed - 50) * 0.9;
    while (this.windTimer > 1) {
      this.windTimer -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.burst(
        "wind",
        cameraX + side * (3 + Math.random() * 11),
        0.6 + Math.random() * 5.5,
        cameraZ - 62 - Math.random() * 40,
      );
      // Wind motes have no velocity of their own; the world scroll carries them past.
      const i = this.count - 1;
      if (i >= 0) this.vz[i] = speed * 1.35;
    }
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.count) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.count;
        if (i !== last) {
          this.px[i] = this.px[last];
          this.py[i] = this.py[last];
          this.pz[i] = this.pz[last];
          this.vx[i] = this.vx[last];
          this.vy[i] = this.vy[last];
          this.vz[i] = this.vz[last];
          this.life[i] = this.life[last];
          this.maxLife[i] = this.maxLife[last];
          this.size[i] = this.size[last];
          this.grav[i] = this.grav[last];
          this.drag[i] = this.drag[last];
          this.fade[i] = this.fade[last];
          this.colorAttr.setXYZ(
            i,
            this.colorAttr.getX(last),
            this.colorAttr.getY(last),
            this.colorAttr.getZ(last),
          );
        }
        continue;
      }
      const damp = 1 - Math.min(this.drag[i] * dt, 0.95);
      this.vx[i] *= damp;
      this.vz[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.04) {
        this.py[i] = 0.04;
        this.vy[i] *= -0.28;
      }
      const t = this.life[i] / this.maxLife[i];
      this.positionAttr.setXYZ(i, this.px[i], this.py[i], this.pz[i]);
      this.sizeAttr.setX(i, this.size[i] * (0.55 + t * 0.65));
      this.alphaAttr.setX(i, Math.min(1, t * this.fade[i]));
      i++;
    }
    this.points.geometry.setDrawRange(0, this.count);
    this.positionAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }

  clear(): void {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

const SHADOW_POS = new THREE.Vector3();
const SHADOW_SCALE = new THREE.Vector3();
const SHADOW_MAT = new THREE.Matrix4();
const IDENTITY_QUAT = new THREE.Quaternion();

/**
 * Cheap contact shadows for entities that do not cast into the shadow map. All of them are
 * drawn from a single instanced quad.
 */
export class GroundShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshBasicMaterial;
  private count = 0;

  constructor(materials: Materials, capacity = 40) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    this.material = new THREE.MeshBasicMaterial({
      map: materials.glow,
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    this.mesh.name = "contact-shadows";
  }

  begin(): void {
    this.count = 0;
  }

  push(x: number, z: number, width: number, length: number, strength = 1): void {
    if (this.count >= this.mesh.instanceMatrix.count) return;
    SHADOW_POS.set(x, 0.02, z);
    SHADOW_SCALE.set(width * strength, 1, length * strength);
    SHADOW_MAT.compose(SHADOW_POS, IDENTITY_QUAT, SHADOW_SCALE);
    this.mesh.setMatrixAt(this.count++, SHADOW_MAT);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setOpacity(value: number): void {
    this.material.opacity = value;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
