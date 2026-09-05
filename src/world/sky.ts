import * as THREE from "three";
import type { BlendedTheme } from "./themes";

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

/**
 * Three-stop sky gradient with a soft sun bloom and a star field that fades in at night.
 * One draw call, no textures, and every parameter is a uniform so theme blending is free.
 */
const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vWorld;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform float uHalo;
uniform float uStars;

// Cheap hash-based star field; deterministic and stable as the camera moves.
float stars(vec3 dir) {
  vec3 p = floor(dir * 260.0);
  float h = fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float twinkle = step(0.9975, h);
  float bright = fract(h * 91.7);
  return twinkle * bright;
}

void main() {
  vec3 dir = normalize(vWorld);
  float h = dir.y;

  // Sky: ground haze below the horizon, horizon glow, deep colour at zenith.
  float up = smoothstep(0.0, 0.42, h);
  float down = smoothstep(0.0, -0.18, h);
  vec3 col = mix(uHorizon, uTop, pow(up, 0.72));
  col = mix(col, uGround, down);

  // Sun disc plus a wide atmospheric halo that grounds it in the gradient.
  float sun = max(dot(dir, normalize(uSunDir)), 0.0);
  float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.35, sun);
  float halo = (pow(sun, 26.0) * 0.6 + pow(sun, 5.0) * 0.14) * uHalo;
  col += uSunColor * (disc * 1.6 + halo);

  if (uStars > 0.001) {
    col += vec3(0.85, 0.9, 1.0) * stars(dir) * uStars * smoothstep(-0.02, 0.35, h);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1f6fd0) },
        uHorizon: { value: new THREE.Color(0xcfe9ff) },
        uGround: { value: new THREE.Color(0x9fc4d8) },
        uSunColor: { value: new THREE.Color(0xfff6d8) },
        uSunDir: { value: new THREE.Vector3(0, 1, -1).normalize() },
        uSunSize: { value: 0.03 },
        uHalo: { value: 1 },
        uStars: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.material);
    this.mesh.scale.setScalar(2000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = "sky";
  }

  apply(theme: BlendedTheme): void {
    const u = this.material.uniforms;
    (u.uTop.value as THREE.Color).copy(theme.skyTop);
    (u.uHorizon.value as THREE.Color).copy(theme.skyHorizon);
    (u.uGround.value as THREE.Color).copy(theme.skyGround);
    (u.uSunColor.value as THREE.Color).copy(theme.sunColor);
    (u.uSunDir.value as THREE.Vector3).copy(theme.sunDirection);
    u.uSunSize.value = theme.sunSize;
    u.uHalo.value = theme.halo;
    u.uStars.value = theme.starIntensity;
  }

  follow(x: number, z: number): void {
    this.mesh.position.set(x, 0, z);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
