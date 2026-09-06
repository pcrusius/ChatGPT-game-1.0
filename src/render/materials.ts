import * as THREE from "three";
import {
  makeFoliageTexture,
  makeGlowTexture,
  makeNoiseNormal,
  makePosterTexture,
  makeRoadTexture,
  makeStreakTexture,
  makeWindowTexture,
} from "./textures";
import {
  LANE_COUNT,
  LANE_WIDTH,
  ROAD_TEXTURE_LENGTH,
  ROAD_WIDTH,
  SHOULDER_WIDTH,
} from "../game/config";
import type { QualitySettings } from "../core/quality";

export interface PaintSpec {
  color: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  sheen?: number;
  sheenColor?: number;
}

interface EmissiveBoost {
  material: THREE.MeshStandardMaterial;
  day: number;
  night: number;
}

/**
 * One shared material and texture per role for the whole game. Nothing in the update loop
 * creates or clones a material, which keeps program count and batching stable.
 */
export class Materials {
  readonly roadMap: THREE.Texture;
  readonly asphaltNormal: THREE.Texture;
  readonly windowMap: THREE.Texture;
  readonly posterMap: THREE.Texture;
  readonly glow: THREE.Texture;
  readonly contactShadow: THREE.MeshBasicMaterial;
  readonly streak: THREE.Texture;
  readonly foliage: THREE.Texture;

  readonly road: THREE.MeshStandardMaterial;
  readonly terrainNear: THREE.MeshStandardMaterial;
  readonly terrainFar: THREE.MeshStandardMaterial;
  readonly ridge: THREE.MeshStandardMaterial;
  readonly ocean: THREE.MeshStandardMaterial;
  readonly concrete: THREE.MeshStandardMaterial;
  readonly metalRail: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  readonly rock: THREE.MeshStandardMaterial;
  readonly trunk: THREE.MeshStandardMaterial;
  readonly leaf: THREE.MeshStandardMaterial;
  readonly building: THREE.MeshStandardMaterial;
  readonly buildingWindows: THREE.MeshStandardMaterial;
  readonly signFace: THREE.MeshStandardMaterial;
  readonly signWarning: THREE.MeshStandardMaterial;
  readonly poster: THREE.MeshStandardMaterial;
  readonly cone: THREE.MeshStandardMaterial;
  readonly coneStripe: THREE.MeshStandardMaterial;
  readonly barrierBody: THREE.MeshStandardMaterial;
  readonly barrierStripe: THREE.MeshStandardMaterial;
  readonly coin: THREE.MeshStandardMaterial;

  readonly glass: THREE.MeshPhysicalMaterial;
  readonly glassSimple: THREE.MeshStandardMaterial;
  readonly chrome: THREE.MeshStandardMaterial;
  readonly trim: THREE.MeshStandardMaterial;
  readonly carbon: THREE.MeshStandardMaterial;
  readonly tire: THREE.MeshStandardMaterial;
  readonly rim: THREE.MeshStandardMaterial;
  readonly brake: THREE.MeshStandardMaterial;

  readonly headlight: THREE.MeshStandardMaterial;
  readonly taillight: THREE.MeshStandardMaterial;
  readonly reflectorAmber: THREE.MeshStandardMaterial;
  readonly reflectorRed: THREE.MeshStandardMaterial;
  readonly warningLamp: THREE.MeshStandardMaterial;
  readonly neon: THREE.MeshStandardMaterial;
  readonly lampGlass: THREE.MeshStandardMaterial;

  readonly additiveWhite: THREE.SpriteMaterial;

  private readonly emissiveBoosts: EmissiveBoost[] = [];
  private readonly paints = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly trafficPaints = new Map<number, THREE.MeshStandardMaterial>();
  private readonly disposables: { dispose(): void }[] = [];

  constructor(quality: QualitySettings) {
    const track = <T extends { dispose(): void }>(x: T): T => {
      this.disposables.push(x);
      return x;
    };

    this.roadMap = track(
      makeRoadTexture(
        {
          totalWidth: ROAD_WIDTH + SHOULDER_WIDTH * 2,
          tileLength: ROAD_TEXTURE_LENGTH,
          roadWidth: ROAD_WIDTH,
          laneWidth: LANE_WIDTH,
          laneCount: LANE_COUNT,
          shoulderWidth: SHOULDER_WIDTH,
        },
        quality.level === "low" ? 512 : 1024,
      ),
    );
    this.roadMap.anisotropy = quality.anisotropy;
    this.asphaltNormal = track(makeNoiseNormal(256, 1.1, 0.12));
    this.asphaltNormal.repeat.set(14, 48);
    this.asphaltNormal.anisotropy = quality.anisotropy;
    this.windowMap = track(makeWindowTexture());
    this.posterMap = track(makePosterTexture(quality.level === "low" ? 256 : 512));
    this.glow = track(makeGlowTexture());
    this.streak = track(makeStreakTexture());
    this.foliage = track(makeFoliageTexture());

    const std = (params: THREE.MeshStandardMaterialParameters) =>
      track(new THREE.MeshStandardMaterial(params));
    /** Registers an emissive material whose intensity ramps up in the night theme. */
    const emissive = (
      params: THREE.MeshStandardMaterialParameters,
      day: number,
      night: number,
    ): THREE.MeshStandardMaterial => {
      const material = std({ ...params, emissiveIntensity: day });
      this.emissiveBoosts.push({ material, day, night });
      return material;
    };

    this.road = std({
      map: this.roadMap,
      normalMap: quality.level === "low" ? null : this.asphaltNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.84,
      metalness: 0.02,
      envMapIntensity: 0.4,
    });
    this.terrainNear = std({ color: 0x4f7f3c, roughness: 0.96, metalness: 0 });
    this.terrainFar = std({ color: 0x3d6b46, roughness: 1, metalness: 0, flatShading: true });
    // Horizon ridges are single-sided sheets seen from both directions.
    this.ridge = std({
      color: 0x6f8fa8,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.ocean = std({ color: 0x1567a6, roughness: 0.14, metalness: 0.4, envMapIntensity: 1.6 });
    this.concrete = std({ color: 0xb5b2aa, roughness: 0.8, metalness: 0.03 });
    this.metalRail = std({ color: 0xc6cbd1, roughness: 0.4, metalness: 0.85, envMapIntensity: 1.1 });
    this.darkMetal = std({ color: 0x474c55, roughness: 0.52, metalness: 0.72 });
    this.rock = std({ color: 0x8b8175, roughness: 0.94, metalness: 0.02, flatShading: true });
    this.trunk = std({ color: 0x6a4a30, roughness: 0.9, metalness: 0 });
    this.leaf = std({ color: 0x3f9145, roughness: 0.84, metalness: 0, flatShading: true });
    this.building = std({ color: 0x2a2f3e, roughness: 0.72, metalness: 0.2, flatShading: true });
    this.buildingWindows = emissive(
      {
        color: 0x0d1119,
        emissive: 0xffd9a0,
        emissiveMap: this.windowMap,
        roughness: 0.34,
        metalness: 0.32,
      },
      0.12,
      1.35,
    );
    this.signFace = std({ color: 0x1c6b40, roughness: 0.62, metalness: 0.05 });
    this.signWarning = std({ color: 0xf0a417, roughness: 0.62, metalness: 0.05 });
    this.poster = std({ map: this.posterMap, roughness: 0.66, metalness: 0.04 });
    this.cone = std({ color: 0xf25a1c, roughness: 0.74, metalness: 0.02 });
    this.coneStripe = std({ color: 0xf3f3f0, roughness: 0.62, metalness: 0.02 });
    this.barrierBody = std({ color: 0xe6e2d9, roughness: 0.76, metalness: 0.03 });
    this.barrierStripe = std({ color: 0xef5a1e, roughness: 0.72, metalness: 0.03 });
    // Emissive lifts the coin out of the road at distance, but it is flat light: past about a
    // quarter it swamps the struck relief and every coin turns into an orange circle. The night
    // value is the smallest that still reads against unlit asphalt.
    this.coin = emissive(
      { color: 0xffd257, emissive: 0xffa11a, roughness: 0.14, metalness: 1, envMapIntensity: 2.4 },
      0.22,
      0.36,
    );

    this.glass =
      quality.level === "low"
        ? (track(
            new THREE.MeshPhysicalMaterial({
              color: 0x0d1116,
              roughness: 0.22,
              metalness: 0.4,
            }),
          ) as THREE.MeshPhysicalMaterial)
        : track(
            new THREE.MeshPhysicalMaterial({
              color: 0x0b0f14,
              roughness: 0.08,
              metalness: 0.35,
              clearcoat: 1,
              clearcoatRoughness: 0.05,
              envMapIntensity: 2.1,
              reflectivity: 0.9,
            }),
          );
    this.glassSimple = std({
      color: 0x121820,
      roughness: 0.14,
      metalness: 0.55,
      envMapIntensity: 1.4,
    });
    this.chrome = std({ color: 0xdfe4ea, roughness: 0.14, metalness: 1, envMapIntensity: 1.7 });
    this.trim = std({ color: 0x1a1c20, roughness: 0.58, metalness: 0.28 });
    this.carbon = std({ color: 0x14161a, roughness: 0.34, metalness: 0.62, envMapIntensity: 1.1 });
    this.tire = std({ color: 0x15161a, roughness: 0.88, metalness: 0.05 });
    // Rim and brake colour comes from per-instance colour, so the base stays white. Fully
    // metallic rims only reflect the inside of the wheel arch, which is black, so the finish is
    // deliberately part-diffuse: the spokes have to read against the tyre.
    this.rim = std({ color: 0xffffff, roughness: 0.34, metalness: 0.55, envMapIntensity: 1.5 });
    this.brake = std({ color: 0xffffff, roughness: 0.5, metalness: 0.5 });

    this.headlight = emissive(
      { color: 0xf2f6ff, emissive: 0xdceaff, roughness: 0.1, metalness: 0.2 },
      0.55,
      2.6,
    );
    this.taillight = emissive(
      { color: 0x5c0a0a, emissive: 0xff1f22, roughness: 0.24, metalness: 0.1 },
      1.1,
      2.8,
    );
    this.reflectorAmber = emissive(
      { color: 0x6b4300, emissive: 0xffab1f, roughness: 0.3, metalness: 0.2 },
      0.5,
      2.2,
    );
    this.reflectorRed = emissive(
      { color: 0x5a0d0d, emissive: 0xff3b2f, roughness: 0.3, metalness: 0.2 },
      0.45,
      2,
    );
    this.warningLamp = emissive(
      { color: 0x6b5200, emissive: 0xffc21f, roughness: 0.3, metalness: 0.15 },
      0.9,
      2.4,
    );
    this.neon = emissive(
      { color: 0x102030, emissive: 0x3fe6ff, roughness: 0.3, metalness: 0.2 },
      0.2,
      3,
    );
    this.lampGlass = emissive(
      { color: 0x2a2a26, emissive: 0xffe6b0, roughness: 0.3, metalness: 0.2 },
      0.1,
      2.6,
    );

    // Soft dark patch laid flat under roadside props. Without it nothing reads as touching the
    // ground and every rock and bush looks pasted onto the terrain.
    this.contactShadow = track(
      new THREE.MeshBasicMaterial({
        map: this.glow,
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        fog: true,
      }),
    );

    this.additiveWhite = track(
      new THREE.SpriteMaterial({
        map: this.glow,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
  }

  /** Hero paint for the player car: physical with clearcoat, cached per skin. */
  paintFor(id: string, spec: PaintSpec): THREE.MeshPhysicalMaterial {
    const existing = this.paints.get(id);
    if (existing) return existing;
    const material = new THREE.MeshPhysicalMaterial({
      color: spec.color,
      metalness: spec.metalness,
      roughness: spec.roughness,
      clearcoat: spec.clearcoat,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.35,
      sheen: spec.sheen ?? 0,
      sheenColor: new THREE.Color(spec.sheenColor ?? 0xffffff),
      sheenRoughness: 0.4,
    });
    this.paints.set(id, material);
    this.disposables.push(material);
    return material;
  }

  /** Cheaper paint for traffic, cached per colour so the palette never duplicates materials. */
  trafficPaint(color: number): THREE.MeshStandardMaterial {
    const existing = this.trafficPaints.get(color);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.34,
      envMapIntensity: 1.05,
    });
    this.trafficPaints.set(color, material);
    this.disposables.push(material);
    return material;
  }

  /**
   * Blends every theme-dependent material property. Called only while a theme transition is in
   * flight, so steady-state frames do no material work at all.
   */
  applyTheme(params: {
    nightFactor: number;
    terrainNear: THREE.Color;
    terrainFar: THREE.Color;
    ocean: THREE.Color;
    leaf: THREE.Color;
    rock: THREE.Color;
    roadTint: THREE.Color;
  }): void {
    for (const boost of this.emissiveBoosts) {
      boost.material.emissiveIntensity = THREE.MathUtils.lerp(
        boost.day,
        boost.night,
        params.nightFactor,
      );
    }
    this.terrainNear.color.copy(params.terrainNear);
    this.terrainFar.color.copy(params.terrainFar);
    this.ocean.color.copy(params.ocean);
    this.leaf.color.copy(params.leaf);
    this.rock.color.copy(params.rock);
    this.road.color.copy(params.roadTint);
  }

  setQuality(quality: QualitySettings): void {
    this.road.normalMap = quality.level === "low" ? null : this.asphaltNormal;
    this.road.needsUpdate = true;
    this.roadMap.anisotropy = quality.anisotropy;
    this.asphaltNormal.anisotropy = quality.anisotropy;
    const clearcoat = quality.level === "low" ? 0 : 1;
    this.glass.clearcoat = clearcoat;
    for (const paint of this.paints.values()) {
      paint.clearcoat = clearcoat > 0 ? paint.clearcoat || 1 : 0;
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.paints.clear();
    this.trafficPaints.clear();
  }
}
