import * as THREE from "three";
import { DRAW_DISTANCE } from "../game/config";
import type { QualitySettings } from "../core/quality";
import type { Materials } from "../render/materials";
import { Road } from "./road";
import { Scenery } from "./scenery";
import { Sky } from "./sky";
import {
  THEMES,
  THEME_BLEND,
  THEME_LENGTH,
  THEME_ORDER,
  blendThemes,
  makeBlend,
  type BlendedTheme,
  type ThemeId,
} from "./themes";

/** Low-poly silhouette ridge that sits at the fog line and gives the horizon some shape. */
function ridgeGeometry(length: number, peaks: number, height: number, seed: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const step = length / peaks;
  const rand = (i: number) => {
    const x = Math.sin(i * 91.3 + seed * 17.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < peaks; i++) {
    const z0 = -length / 2 + i * step;
    const z1 = z0 + step;
    // Smooth rolling profile: neighbouring peaks are correlated so the skyline reads as hills
    // rather than a saw blade.
    const h0 = height * (0.4 + (rand(i) * 0.4 + rand(i - 1) * 0.2));
    const h1 = height * (0.4 + (rand(i + 1) * 0.4 + rand(i) * 0.2));
    positions.push(z0, 0, 0, z1, 0, 0, z1, h1, 0);
    positions.push(z0, 0, 0, z1, h1, 0, z0, h0, 0);
    const zm = (z0 + z1) / 2;
    const hm = (h0 + h1) * 0.5 * (1 + rand(i + 7) * 0.14);
    positions.push(z0, h0, 0, z1, h1, 0, zm, hm, 0);
  }
  // Authored in the XY plane, then swung so the ridge runs along the road.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  geo.rotateY(Math.PI / 2);
  geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  return geo;
}

/**
 * Owns everything that is not a gameplay entity: sky, lighting, road, terrain and scenery,
 * plus the running theme blend. Nothing here is rebuilt during a run.
 */
export class World {
  readonly group = new THREE.Group();
  readonly sky: Sky;
  readonly road: Road;
  readonly scenery: Scenery;
  readonly theme: BlendedTheme = makeBlend();

  private readonly sun: THREE.DirectionalLight;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly fog: THREE.Fog;
  private readonly terrain: THREE.Mesh;
  private readonly ocean: THREE.Mesh;
  private readonly ridges: THREE.Mesh[] = [];
  private readonly materials: Materials;

  private themeIndex = 0;
  private themeOverride: ThemeId | null = null;
  private activeThemeId: ThemeId = "coastal";
  private blendT = 0;
  private oceanPhase = 0;

  constructor(
    scene: THREE.Scene,
    materials: Materials,
    quality: QualitySettings,
  ) {
    this.materials = materials;
    this.group.name = "world";
    scene.add(this.group);

    this.sky = new Sky();
    this.group.add(this.sky.mesh);

    this.fog = new THREE.Fog(0xc9e2f4, 75, 260);
    scene.fog = this.fog;
    scene.background = null;

    // Three lights total, for every theme. Night is carried by emissive materials instead.
    this.hemisphere = new THREE.HemisphereLight(0x9dc9ff, 0x5c7a4e, 1.15);
    this.group.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xfff3dd, 2.6);
    this.sun.castShadow = quality.shadows;
    this.configureShadow(quality);
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.fill = new THREE.DirectionalLight(0x86b6ff, 0.35);
    // Cheap counter-light from the sun's side, so the nose and far flank keep some shape.
    this.fill.position.set(26, 11, -44);
    this.group.add(this.fill);

    // Ground: one large plane, well beyond the fog line.
    const terrainGeo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    terrainGeo.rotateX(-Math.PI / 2);
    this.terrain = new THREE.Mesh(terrainGeo, materials.terrainNear);
    this.terrain.position.set(0, -0.06, -DRAW_DISTANCE * 0.5);
    this.terrain.receiveShadow = false;
    this.group.add(this.terrain);

    // Ocean: a distant band on the left, faded out in non-coastal themes.
    const oceanGeo = new THREE.PlaneGeometry(900, 1600, 1, 1);
    oceanGeo.rotateX(-Math.PI / 2);
    this.ocean = new THREE.Mesh(oceanGeo, materials.ocean);
    this.ocean.position.set(-430, -3.4, -260);
    this.ocean.receiveShadow = false;
    this.group.add(this.ocean);

    // Two parallax ridges on each side of the road at the fog line.
    const ridgeSpecs: { x: number; height: number; scale: number; seed: number }[] = [
      { x: -230, height: 46, scale: 1, seed: 3 },
      { x: 250, height: 58, scale: 1, seed: 11 },
      { x: -420, height: 78, scale: 1, seed: 23 },
      { x: 430, height: 92, scale: 1, seed: 31 },
    ];
    for (const spec of ridgeSpecs) {
      const mesh = new THREE.Mesh(
        ridgeGeometry(1500, 22, spec.height, spec.seed),
        materials.ridge,
      );
      mesh.position.set(spec.x, -2, -DRAW_DISTANCE * 0.4);
      mesh.frustumCulled = false;
      this.ridges.push(mesh);
      this.group.add(mesh);
    }

    this.road = new Road(materials, quality);
    this.group.add(this.road.group);

    this.scenery = new Scenery(materials, quality);
    this.group.add(this.scenery.group);

    this.resetThemes();
  }

  private configureShadow(quality: QualitySettings): void {
    const camera = this.sun.shadow.camera;
    // Deliberately tight: only the playfield around the car needs shadow coverage.
    camera.left = -16;
    camera.right = 16;
    camera.top = 26;
    camera.bottom = -22;
    camera.near = 1;
    camera.far = 120;
    camera.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.035;
  }

  resetThemes(): void {
    this.themeOverride = null;
    this.themeIndex = 0;
    this.blendT = 0;
    this.activeThemeId = THEME_ORDER[0];
    this.scenery.setMix(THEMES[this.activeThemeId].props);
    this.scenery.assignAll();
    this.applyBlend(0);
  }

  /** Jumps straight to a theme; used by the menu and by debug/testing hooks. */
  forceTheme(id: ThemeId): void {
    this.themeIndex = THEME_ORDER.indexOf(id);
    this.blendT = 0;
    this.activeThemeId = id;
    this.scenery.setMix(THEMES[id].props);
    this.scenery.assignAll();
    this.applyBlend(0);
    this.themeOverride = id;
  }

  get currentThemeName(): string {
    return THEMES[this.activeThemeId].name;
  }

  /** Theme currently contributing most of the look; drives which env map is bound. */
  get dominantTheme(): ThemeId {
    return this.activeThemeId;
  }

  /** Returns to distance-driven theme cycling after a manual override. */
  clearThemeOverride(): void {
    this.themeOverride = null;
  }

  private applyBlend(distanceIntoTheme: number): void {
    const current = THEMES[THEME_ORDER[this.themeIndex % THEME_ORDER.length]];
    const next = THEMES[THEME_ORDER[(this.themeIndex + 1) % THEME_ORDER.length]];
    const blendStart = THEME_LENGTH - THEME_BLEND;
    this.blendT =
      distanceIntoTheme <= blendStart
        ? 0
        : THREE.MathUtils.clamp((distanceIntoTheme - blendStart) / THEME_BLEND, 0, 1);

    const theme = blendThemes(current, next, this.blendT, this.theme);

    this.sky.apply(theme);
    this.fog.color.copy(theme.fogColor);
    this.fog.near = theme.fogNear;
    this.fog.far = theme.fogFar;
    this.sun.color.copy(theme.sunLightColor);
    this.sun.intensity = theme.sunIntensity;
    this.hemisphere.color.copy(theme.ambientSky);
    this.hemisphere.groundColor.copy(theme.ambientGround);
    this.hemisphere.intensity = theme.ambientIntensity;
    this.fill.color.copy(theme.fillColor);
    this.fill.intensity = theme.fillIntensity;

    this.materials.applyTheme({
      nightFactor: theme.nightFactor,
      terrainNear: theme.terrainNear,
      terrainFar: theme.terrainFar,
      ocean: theme.ocean,
      leaf: theme.leaf,
      rock: theme.rock,
      roadTint: theme.roadTint,
    });
    this.road.applyTheme(theme);
    this.ocean.visible = theme.oceanOpacity > 0.02;
    this.materials.ridge.color.copy(theme.ridgeColor);
    for (const ridge of this.ridges) ridge.scale.y = theme.ridgeHeight;

    // Scenery mix follows the dominant theme so recycled slots match what the player sees.
    const dominant = this.blendT > 0.5 ? next : current;
    if (dominant.id !== this.activeThemeId) {
      this.activeThemeId = dominant.id;
      this.scenery.setMix(dominant.props);
    }
  }

  setQuality(quality: QualitySettings): void {
    this.sun.castShadow = quality.shadows;
    this.configureShadow(quality);
    this.road.setQuality(quality);
    this.scenery.setQuality(quality);
    for (const ridge of this.ridges) ridge.visible = quality.level !== "low";
  }

  /**
   * `distance` is metres travelled this run; `dt` drives the small amount of idle animation.
   * Called every frame, allocation free.
   */
  update(distance: number, dt: number, cameraZ: number): void {
    // Theme progression is derived from distance rather than accumulated, so it cannot drift.
    if (this.themeOverride) {
      this.themeIndex = THEME_ORDER.indexOf(this.themeOverride);
      this.applyBlend(0);
    } else {
      this.themeIndex = Math.floor(distance / THEME_LENGTH) % THEME_ORDER.length;
      this.applyBlend(distance % THEME_LENGTH);
    }

    this.road.update(distance);
    this.scenery.update(distance);

    // Keep the sky and the huge background planes centred on the camera.
    this.sky.follow(0, cameraZ);
    this.terrain.position.z = cameraZ - DRAW_DISTANCE * 0.5;
    this.ocean.position.z = cameraZ - 260;
    for (const ridge of this.ridges) ridge.position.z = cameraZ - DRAW_DISTANCE * 0.4;

    // Key light tracks the car so the tight shadow frustum always contains it.
    const dir = this.theme.lightDirection;
    this.sun.position.set(dir.x * 60, dir.y * 60 + 20, cameraZ + dir.z * 60 - 10);
    this.sun.target.position.set(0, 0, cameraZ - 16);

    // Barely-there drift keeps the water from looking like a painted card.
    this.oceanPhase += dt * 0.08;
    this.ocean.position.x = -430 + Math.sin(this.oceanPhase) * 4;
  }

  dispose(): void {
    this.sky.dispose();
    this.road.dispose();
    this.scenery.dispose();
    this.terrain.geometry.dispose();
    this.ocean.geometry.dispose();
    for (const ridge of this.ridges) ridge.geometry.dispose();
  }
}
