import * as THREE from "three";

export type ThemeId = "coastal" | "desert" | "night";

/** Weighted scenery mix for a theme. Keys map to prop types registered by the scenery system. */
export type PropMix = { type: string; weight: number }[];

export interface Theme {
  id: ThemeId;
  name: string;
  /** Sky dome gradient. */
  skyTop: number;
  skyHorizon: number;
  skyGround: number;
  sunColor: number;
  /** Direction the sun sits in, used for both the sky disc and the directional light. */
  sunDirection: THREE.Vector3;
  /**
   * Direction the shading light comes from. Deliberately separate from `sunDirection`: the sun
   * disc looks best ahead of the player, but the chase camera only ever sees the car's rear, so
   * the key light has to come from behind to keep bodywork lit.
   */
  lightDirection: THREE.Vector3;
  sunSize: number;
  /** Multiplier on the atmospheric bloom around the sun disc. */
  halo: number;
  starIntensity: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;

  sunIntensity: number;
  sunLightColor: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  /** Cool fill from the opposite side; keeps shadowed bodywork from going flat black. */
  fillColor: number;
  fillIntensity: number;
  exposure: number;

  terrainNear: number;
  terrainFar: number;
  roadTint: number;
  leaf: number;
  rock: number;
  ocean: number;
  oceanVisible: boolean;
  /** 0 = full daylight, 1 = night; drives emissive strength and headlights. */
  nightFactor: number;

  props: PropMix;
  ridgeColor: number;
  ridgeHeight: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  coastal: {
    id: "coastal",
    name: "Pacific Coast",
    skyTop: 0x1f6fd0,
    skyHorizon: 0xcfe9ff,
    skyGround: 0x9fc4d8,
    sunColor: 0xfff6d8,
    sunDirection: new THREE.Vector3(-0.42, 0.55, -0.72).normalize(),
    lightDirection: new THREE.Vector3(-0.55, 0.78, 0.5).normalize(),
    sunSize: 0.022,
    halo: 0.9,
    starIntensity: 0,
    fogColor: 0xc9e2f4,
    fogNear: 75,
    fogFar: 260,

    sunIntensity: 2.6,
    sunLightColor: 0xfff3dd,
    ambientSky: 0x9dc9ff,
    ambientGround: 0x5c7a4e,
    ambientIntensity: 1.15,
    fillColor: 0x86b6ff,
    fillIntensity: 0.35,
    exposure: 1.05,

    terrainNear: 0x64944a,
    terrainFar: 0x4a7f57,
    roadTint: 0xffffff,
    leaf: 0x43a047,
    rock: 0x9b9184,
    ocean: 0x1683c4,
    oceanVisible: true,
    nightFactor: 0,

    props: [
      { type: "palm", weight: 4 },
      { type: "bush", weight: 3 },
      { type: "pine", weight: 2 },
      { type: "rock", weight: 2 },
      { type: "lamp", weight: 2 },
      { type: "billboard", weight: 1 },
    ],
    ridgeColor: 0x6f8fa8,
    ridgeHeight: 1,
  },

  desert: {
    id: "desert",
    name: "Mesa Sunset",
    skyTop: 0x2b3f8f,
    skyHorizon: 0xff9d4a,
    skyGround: 0xb4643a,
    sunColor: 0xffd08a,
    sunDirection: new THREE.Vector3(0.34, 0.13, -0.93).normalize(),
    lightDirection: new THREE.Vector3(0.62, 0.44, 0.65).normalize(),
    sunSize: 0.042,
    halo: 1.5,
    starIntensity: 0.08,
    fogColor: 0xe89a5c,
    fogNear: 60,
    fogFar: 235,

    sunIntensity: 3.1,
    sunLightColor: 0xffb063,
    ambientSky: 0xff9f5e,
    ambientGround: 0x6b3f26,
    ambientIntensity: 0.95,
    fillColor: 0x5a5fb0,
    fillIntensity: 0.5,
    exposure: 1,

    terrainNear: 0xc08a52,
    terrainFar: 0xa96f42,
    roadTint: 0xf5d8c0,
    leaf: 0x8a9a4a,
    rock: 0xb06a3c,
    ocean: 0xc08a52,
    oceanVisible: false,
    nightFactor: 0.25,

    props: [
      { type: "cactus", weight: 4 },
      { type: "mesa", weight: 3 },
      { type: "rock", weight: 3 },
      { type: "bush", weight: 2 },
      { type: "lamp", weight: 1 },
      { type: "billboard", weight: 1 },
    ],
    ridgeColor: 0x8d5335,
    ridgeHeight: 1.25,
  },

  night: {
    id: "night",
    name: "Neon Mile",
    skyTop: 0x03040e,
    skyHorizon: 0x1b2a55,
    skyGround: 0x080a16,
    sunColor: 0xe6ecff,
    sunDirection: new THREE.Vector3(0.5, 0.42, -0.76).normalize(),
    lightDirection: new THREE.Vector3(0.4, 0.72, 0.57).normalize(),
    sunSize: 0.008,
    halo: 0.22,
    starIntensity: 1,
    fogColor: 0x0a1024,
    fogNear: 45,
    fogFar: 205,

    sunIntensity: 0.5,
    sunLightColor: 0x9fb4ff,
    ambientSky: 0x2b3f7a,
    ambientGround: 0x0d1020,
    ambientIntensity: 0.8,
    fillColor: 0xff3fa0,
    fillIntensity: 0.45,
    exposure: 1.1,

    terrainNear: 0x1a1f2e,
    terrainFar: 0x141827,
    roadTint: 0x8f9bb5,
    leaf: 0x1f4a2e,
    rock: 0x2a2f3d,
    ocean: 0x0d1b3a,
    oceanVisible: false,
    nightFactor: 1,

    props: [
      { type: "tower", weight: 5 },
      { type: "neonSign", weight: 3 },
      { type: "lamp", weight: 3 },
      { type: "billboard", weight: 2 },
      { type: "bush", weight: 1 },
    ],
    ridgeColor: 0x141a30,
    ridgeHeight: 0.85,
  },
};

export const THEME_ORDER: ThemeId[] = ["coastal", "desert", "night"];

/** Metres of driving before the next theme starts blending in. */
export const THEME_LENGTH = 1500;
export const THEME_BLEND = 260;

const scratchA = new THREE.Color();
const scratchB = new THREE.Color();

/**
 * Linear blend of two themes. Everything a theme controls is numeric so a transition is a
 * single interpolation with no scene rebuild.
 */
export interface BlendedTheme {
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  skyGround: THREE.Color;
  sunColor: THREE.Color;
  sunDirection: THREE.Vector3;
  lightDirection: THREE.Vector3;
  sunSize: number;
  halo: number;
  starIntensity: number;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
  sunIntensity: number;
  sunLightColor: THREE.Color;
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
  ambientIntensity: number;
  fillColor: THREE.Color;
  fillIntensity: number;
  exposure: number;
  terrainNear: THREE.Color;
  terrainFar: THREE.Color;
  roadTint: THREE.Color;
  leaf: THREE.Color;
  rock: THREE.Color;
  ocean: THREE.Color;
  oceanOpacity: number;
  nightFactor: number;
  ridgeColor: THREE.Color;
  ridgeHeight: number;
}

export function makeBlend(): BlendedTheme {
  return {
    skyTop: new THREE.Color(),
    skyHorizon: new THREE.Color(),
    skyGround: new THREE.Color(),
    sunColor: new THREE.Color(),
    sunDirection: new THREE.Vector3(),
    lightDirection: new THREE.Vector3(),
    sunSize: 0,
    halo: 1,
    starIntensity: 0,
    fogColor: new THREE.Color(),
    fogNear: 0,
    fogFar: 0,
    sunIntensity: 0,
    sunLightColor: new THREE.Color(),
    ambientSky: new THREE.Color(),
    ambientGround: new THREE.Color(),
    ambientIntensity: 0,
    fillColor: new THREE.Color(),
    fillIntensity: 0,
    exposure: 1,
    terrainNear: new THREE.Color(),
    terrainFar: new THREE.Color(),
    roadTint: new THREE.Color(),
    leaf: new THREE.Color(),
    rock: new THREE.Color(),
    ocean: new THREE.Color(),
    oceanOpacity: 0,
    nightFactor: 0,
    ridgeColor: new THREE.Color(),
    ridgeHeight: 1,
  };
}

function lerpColor(out: THREE.Color, a: number, b: number, t: number): void {
  scratchA.setHex(a, THREE.SRGBColorSpace);
  scratchB.setHex(b, THREE.SRGBColorSpace);
  out.copy(scratchA).lerp(scratchB, t);
}

export function blendThemes(a: Theme, b: Theme, t: number, out: BlendedTheme): BlendedTheme {
  const mix = THREE.MathUtils.smoothstep(t, 0, 1);
  lerpColor(out.skyTop, a.skyTop, b.skyTop, mix);
  lerpColor(out.skyHorizon, a.skyHorizon, b.skyHorizon, mix);
  lerpColor(out.skyGround, a.skyGround, b.skyGround, mix);
  lerpColor(out.sunColor, a.sunColor, b.sunColor, mix);
  out.sunDirection.copy(a.sunDirection).lerp(b.sunDirection, mix).normalize();
  out.lightDirection.copy(a.lightDirection).lerp(b.lightDirection, mix).normalize();
  out.sunSize = THREE.MathUtils.lerp(a.sunSize, b.sunSize, mix);
  out.halo = THREE.MathUtils.lerp(a.halo, b.halo, mix);
  out.starIntensity = THREE.MathUtils.lerp(a.starIntensity, b.starIntensity, mix);
  lerpColor(out.fogColor, a.fogColor, b.fogColor, mix);
  out.fogNear = THREE.MathUtils.lerp(a.fogNear, b.fogNear, mix);
  out.fogFar = THREE.MathUtils.lerp(a.fogFar, b.fogFar, mix);
  out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, mix);
  lerpColor(out.sunLightColor, a.sunLightColor, b.sunLightColor, mix);
  lerpColor(out.ambientSky, a.ambientSky, b.ambientSky, mix);
  lerpColor(out.ambientGround, a.ambientGround, b.ambientGround, mix);
  out.ambientIntensity = THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, mix);
  lerpColor(out.fillColor, a.fillColor, b.fillColor, mix);
  out.fillIntensity = THREE.MathUtils.lerp(a.fillIntensity, b.fillIntensity, mix);
  out.exposure = THREE.MathUtils.lerp(a.exposure, b.exposure, mix);
  lerpColor(out.terrainNear, a.terrainNear, b.terrainNear, mix);
  lerpColor(out.terrainFar, a.terrainFar, b.terrainFar, mix);
  lerpColor(out.roadTint, a.roadTint, b.roadTint, mix);
  lerpColor(out.leaf, a.leaf, b.leaf, mix);
  lerpColor(out.rock, a.rock, b.rock, mix);
  lerpColor(out.ocean, a.ocean, b.ocean, mix);
  out.oceanOpacity = THREE.MathUtils.lerp(a.oceanVisible ? 1 : 0, b.oceanVisible ? 1 : 0, mix);
  out.nightFactor = THREE.MathUtils.lerp(a.nightFactor, b.nightFactor, mix);
  lerpColor(out.ridgeColor, a.ridgeColor, b.ridgeColor, mix);
  out.ridgeHeight = THREE.MathUtils.lerp(a.ridgeHeight, b.ridgeHeight, mix);
  return out;
}
