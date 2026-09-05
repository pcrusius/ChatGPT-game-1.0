import { SKINS, STORAGE_KEY, type SkinId } from "./config";
import type { QualityLevel } from "../core/quality";

export interface MissionProgress {
  distance: number;
  coins: number;
  jumps: number;
  nearMisses: number;
  topSpeed: number;
}

export interface SaveData {
  coins: number;
  purchasedSkins: SkinId[];
  selectedSkin: SkinId;
  highScore: number;
  bestDistance: number;
  runs: number;
  sound: boolean;
  music: boolean;
  quality: QualityLevel | "auto";
  missions: Record<string, number>;
  claimed: string[];
}

export interface MissionDef {
  id: string;
  label: string;
  target: number;
  reward: number;
  metric: keyof MissionProgress;
  /** Whether progress accumulates across runs or must be achieved in one run. */
  perRun: boolean;
}

export const MISSIONS: MissionDef[] = [
  { id: "drive1k", label: "Drive 1 000 m in one run", target: 1000, reward: 40, metric: "distance", perRun: true },
  { id: "coins25", label: "Collect 25 coins in one run", target: 25, reward: 30, metric: "coins", perRun: true },
  { id: "jump3", label: "Clear 3 jumps in one run", target: 3, reward: 20, metric: "jumps", perRun: true },
  { id: "near3", label: "Score 3 near misses in one run", target: 3, reward: 25, metric: "nearMisses", perRun: true },
  { id: "speed85", label: "Reach 300 km/h", target: 85, reward: 50, metric: "topSpeed", perRun: true },
  { id: "coins200", label: "Bank 200 coins in total", target: 200, reward: 60, metric: "coins", perRun: false },
];

const DEFAULT_SAVE: SaveData = {
  coins: 0,
  purchasedSkins: ["red"],
  selectedSkin: "red",
  highScore: 0,
  bestDistance: 0,
  runs: 0,
  sound: true,
  music: true,
  quality: "auto",
  missions: {},
  claimed: [],
};

/** localStorage-backed save. Reads are validated because saved data can be arbitrarily stale. */
export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SAVE, purchasedSkins: ["red"], missions: {}, claimed: [] };
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const known = new Set(SKINS.map((s) => s.id));
    const purchased = Array.isArray(parsed.purchasedSkins)
      ? parsed.purchasedSkins.filter((id) => known.has(id))
      : [];
    if (!purchased.includes("red")) purchased.push("red");
    const selected =
      typeof parsed.selectedSkin === "string" && purchased.includes(parsed.selectedSkin)
        ? parsed.selectedSkin
        : "red";
    return {
      coins: Math.max(0, Math.floor(parsed.coins ?? 0)),
      purchasedSkins: purchased,
      selectedSkin: selected,
      highScore: Math.max(0, Math.floor(parsed.highScore ?? 0)),
      bestDistance: Math.max(0, Math.floor(parsed.bestDistance ?? 0)),
      runs: Math.max(0, Math.floor(parsed.runs ?? 0)),
      sound: parsed.sound !== false,
      music: parsed.music !== false,
      quality: parsed.quality ?? "auto",
      missions: typeof parsed.missions === "object" && parsed.missions ? parsed.missions : {},
      claimed: Array.isArray(parsed.claimed) ? parsed.claimed : [],
    };
  } catch {
    return { ...DEFAULT_SAVE, purchasedSkins: ["red"], missions: {}, claimed: [] };
  }
}

export function persist(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch {
    // Private browsing or a full quota; the run still plays, it just will not be remembered.
  }
}

/**
 * Folds a finished run into mission progress and returns any missions completed by it, so the
 * UI can call them out and award coins once.
 */
export function updateMissions(save: SaveData, run: MissionProgress): MissionDef[] {
  const completed: MissionDef[] = [];
  for (const mission of MISSIONS) {
    if (save.claimed.includes(mission.id)) continue;
    const value = mission.perRun
      ? run[mission.metric]
      : (save.missions[mission.id] ?? 0) + run[mission.metric];
    if (!mission.perRun) save.missions[mission.id] = value;
    else save.missions[mission.id] = Math.max(save.missions[mission.id] ?? 0, value);
    if (value >= mission.target) {
      save.claimed.push(mission.id);
      save.coins += mission.reward;
      completed.push(mission);
    }
  }
  return completed;
}

export function missionValue(save: SaveData, mission: MissionDef): number {
  return Math.min(mission.target, save.missions[mission.id] ?? 0);
}
