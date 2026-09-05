import { SKINS, STORAGE_KEY, type SkinId } from "./config";

export interface SaveData {
  coins: number;
  purchasedSkins: SkinId[];
  selectedSkin: SkinId;
  highScore: number;
}

function isSkinId(value: string): value is SkinId {
  return SKINS.some((skin) => skin.id === value);
}

function defaultSave(): SaveData {
  return {
    coins: 0,
    purchasedSkins: ["red"],
    selectedSkin: "red",
    highScore: 0,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const save = defaultSave();
    if (typeof parsed.coins === "number" && Number.isFinite(parsed.coins)) {
      save.coins = Math.max(0, Math.floor(parsed.coins));
    }
    if (Array.isArray(parsed.purchasedSkins)) {
      const owned = parsed.purchasedSkins.filter(isSkinId);
      save.purchasedSkins = Array.from(new Set(["red", ...owned]));
    }
    if (typeof parsed.selectedSkin === "string" && isSkinId(parsed.selectedSkin)) {
      save.selectedSkin = parsed.selectedSkin;
    }
    if (!save.purchasedSkins.includes(save.selectedSkin)) {
      save.selectedSkin = "red";
    }
    if (typeof parsed.highScore === "number" && Number.isFinite(parsed.highScore)) {
      save.highScore = Math.max(0, Math.floor(parsed.highScore));
    }
    return save;
  } catch {
    return defaultSave();
  }
}

export function writeSave(save: SaveData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}
