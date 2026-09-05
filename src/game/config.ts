export const LANE_COUNT = 3;
export const LANE_WIDTH = 3.6;
export const ROAD_WIDTH = LANE_WIDTH * LANE_COUNT + 1.6;
export const SHOULDER_WIDTH = 2.4;

/** Road metres covered by one tile of the baked surface texture. */
export const ROAD_TEXTURE_LENGTH = 24;
/** Length of the single road mesh. Sized to cover the whole fog range with margin. */
export const ROAD_LENGTH = 480;
/** How far ahead of the camera the road mesh extends behind the player. */
export const ROAD_BEHIND = 90;

export const FOG_NEAR = 60;
export const FOG_FAR = 245;
export const DRAW_DISTANCE = 320;

export const START_SPEED = 36;
export const MAX_SPEED = 92;

export const LANE_CHANGE_TIME = 0.2;
export const JUMP_DURATION = 0.66;
export const JUMP_HEIGHT = 2.5;

export const SPAWN_DISTANCE = 205;
export const DESPAWN_Z = 22;
/**
 * Coins float at roughly camera height, so an uncollected one flying past the chase camera
 * fills the screen with gold. They are retired as soon as they are behind the car instead.
 */
export const COIN_DESPAWN_Z = 3;

export const PLAYER_HALF_WIDTH = 0.95;
export const PLAYER_HALF_LENGTH = 2.05;

/** Lateral gap that counts as a near miss when passing traffic. */
export const NEAR_MISS_WINDOW = 1.5;

export const STORAGE_KEY = "apex-rush-save-v2";

export interface SkinDef {
  id: string;
  name: string;
  price: number;
  blurb: string;
  paint: number;
  metalness: number;
  roughness: number;
  clearcoat: number;
  sheen: number;
  sheenColor: number;
  accent: number;
  rim: number;
  caliper: number;
}

export const SKINS: readonly SkinDef[] = [
  {
    id: "red",
    name: "Crimson",
    price: 0,
    blurb: "Track-bred launch livery",
    paint: 0xc4141f,
    metalness: 0.6,
    roughness: 0.2,
    clearcoat: 1,
    sheen: 0.35,
    sheenColor: 0xff7a6a,
    accent: 0x18191c,
    rim: 0x8e959e,
    caliper: 0xd8b12a,
  },
  {
    id: "blue",
    name: "Aero Blue",
    price: 50,
    blurb: "Wind-tunnel pearl finish",
    paint: 0x1449d8,
    metalness: 0.68,
    roughness: 0.17,
    clearcoat: 1,
    sheen: 0.5,
    sheenColor: 0x88c4ff,
    accent: 0x0b1424,
    rim: 0xb9c3cc,
    caliper: 0xd83a2a,
  },
  {
    id: "black",
    name: "Midnight",
    price: 120,
    blurb: "Satin stealth package",
    paint: 0x0e1116,
    metalness: 0.82,
    roughness: 0.13,
    clearcoat: 1,
    sheen: 0.7,
    sheenColor: 0x6f8cc4,
    accent: 0x23262c,
    rim: 0x3a3d44,
    caliper: 0xc0392b,
  },
  {
    id: "gold",
    name: "Apex Gold",
    price: 300,
    blurb: "Champagne metallic, brushed lip",
    paint: 0xbe9445,
    metalness: 1,
    roughness: 0.15,
    clearcoat: 1,
    sheen: 0.4,
    sheenColor: 0xffe6a8,
    accent: 0x1b1710,
    rim: 0xa8874a,
    caliper: 0x2b2e33,
  },
];

export type SkinId = string;

export function skinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function laneX(lane: number): number {
  return (lane - 1) * LANE_WIDTH;
}

/** Palette used for traffic paint; kept short so material caching stays tiny. */
export const TRAFFIC_COLORS = [
  0xd8dde4, 0x2f3b44, 0x1f4f8f, 0x8e1f22, 0x1d6b4a, 0xd6a02a, 0x5b4a8c, 0x2b2f36, 0xb85c1e,
  0x76808c,
];
