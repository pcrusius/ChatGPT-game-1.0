import * as THREE from "three";

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  color: THREE.Color;
}

const MAX_PARTICLES = 400;

function makeSparkTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class FX {
  readonly group = new THREE.Group();
  private particles: Particle[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);

  constructor() {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.42,
      map: makeSparkTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(this.geometry, material);
    points.frustumCulled = false;
    this.group.add(points);
  }

  burst(origin: THREE.Vector3, color: number, count: number, speed = 8, lift = 1.4): void {
    const tint = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * lift,
        (Math.random() - 0.5) * 2,
      );
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar(speed * (0.35 + Math.random()));
      this.particles.push({
        pos: origin.clone(),
        vel: dir,
        life: 0.5 + Math.random() * 0.35,
        maxLife: 0.85,
        color: tint.clone(),
      });
    }
  }

  clear(): void {
    this.particles.length = 0;
    this.geometry.setDrawRange(0, 0);
  }

  update(dt: number, scrollSpeed: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 7 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.pos.z += scrollSpeed * dt;
      if (p.life <= 0 || p.pos.z > 30) this.particles.splice(i, 1);
    }

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const fade = Math.max(0, p.life / p.maxLife);
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      this.colors[i * 3] = p.color.r * fade;
      this.colors[i * 3 + 1] = p.color.g * fade;
      this.colors[i * 3 + 2] = p.color.b * fade;
    }

    (this.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    this.geometry.setDrawRange(0, this.particles.length);
  }
}
