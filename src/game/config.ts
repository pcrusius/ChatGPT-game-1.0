export const LANE_COUNT = 3;
export const LANE_WIDTH = 3.6;
export const ROAD_WIDTH = LANE_WIDTH * LANE_COUNT + 1.6;
export const SHOULDER_WIDTH = 2.4;

export const START_SPEED = 38;
export const MAX_SPEED = 86;
export const SPEED_GAIN = 0.72;

export const LANE_CHANGE_TIME = 0.22;
export const JUMP_DURATION = 0.58;
export const JUMP_HEIGHT = 2.35;

export const SPAWN_DISTANCE = 170;
export const DESPAWN_Z = 18;

export const PLAYER_HALF_WIDTH = 0.82;
export const PLAYER_HALF_LENGTH = 1.95;

export const STORAGE_KEY = "apex-rush-save-v1";

export const SKINS = [
  {
    id: "red",
    name: "Crimson",
    price: 0,
    paint: 0xc81e24,
    accent: 0x2a0608,
    stripe: 0x141414,
    metalness: 0.62,
  },
  {
    id: "blue",
    name: "Aero Blue",
    price: 50,
    paint: 0x1b5bff,
    accent: 0x07102c,
    stripe: 0xd8e8ff,
    metalness: 0.68,
  },
  {
    id: "black",
    name: "Midnight",
    price: 120,
    paint: 0x16161a,
    accent: 0x2d2d34,
    stripe: 0xc9a227,
    metalness: 0.78,
  },
  {
    id: "gold",
    name: "Apex Gold",
    price: 300,
    paint: 0xd4a017,
    accent: 0x4a3208,
    stripe: 0xfff1c2,
    metalness: 0.9,
  },
] as const;

export type SkinId = (typeof SKINS)[number]["id"];

export function laneX(lane: number): number {
  return (lane - 1) * LANE_WIDTH;
}
