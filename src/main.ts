import "./style.css";
import { Game, type GameState, type HudState, type RunResult } from "./game/game";
import { AudioEngine } from "./game/audio";
import { SKINS } from "./game/config";
import {
  MISSIONS,
  loadSave,
  missionValue,
  persist,
  updateMissions,
  type SaveData,
} from "./game/storage";
import type { QualityLevel } from "./core/quality";
import type { ThemeId } from "./world/themes";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
};

const canvas = el<HTMLCanvasElement>("scene");
const save: SaveData = loadSave();
const audio = new AudioEngine();
audio.setSound(save.sound);
audio.setMusic(save.music);

const game = new Game(canvas, audio, save.quality);
game.setSkin(save.selectedSkin);

// -------------------------------------------------------------------------------- screens

const screens = {
  menu: el("screen-menu"),
  garage: el("screen-garage"),
  settings: el("screen-settings"),
  over: el("screen-over"),
  pause: el("screen-pause"),
};
const hud = el("hud");
const speedFx = el("speed-fx");

type ScreenName = keyof typeof screens | "none";

function show(name: ScreenName): void {
  for (const [key, node] of Object.entries(screens)) {
    node.classList.toggle("hidden", key !== name);
  }
  hud.classList.toggle("hidden", name !== "none" && name !== "pause");
}

// ------------------------------------------------------------------------------------ HUD

const hudScore = el("hud-score");
const hudCoins = el("hud-coins");
const hudSpeed = el("hud-speed");
const hudSpeedFill = el("hud-speed-fill");
const hudMultiplier = el("hud-multiplier");
const hudTheme = el("hud-theme");
const hudDifficulty = el("hud-difficulty");
const hudStreak = el("hud-streak");
const hudDistance = el("hud-distance");
const toasts = el("toasts");

let lastMultiplier = 1;

game.hooks.onHud = (state: HudState) => {
  hudScore.textContent = state.score.toLocaleString();
  hudCoins.textContent = String(state.coins);
  hudSpeed.textContent = String(state.speedKph);
  hudSpeedFill.style.width = `${Math.min(100, (state.speedKph / 340) * 100)}%`;
  hudDistance.textContent = `${state.distance.toLocaleString()} m`;
  hudTheme.textContent = state.themeName;
  hudDifficulty.textContent = state.difficulty;
  hudStreak.textContent = state.streak > 1 ? `${state.streak} streak` : "collected";
  const label = `×${state.multiplier.toFixed(1)}`;
  if (hudMultiplier.textContent !== label) {
    hudMultiplier.textContent = label;
    if (state.multiplier > lastMultiplier) pulse(hudMultiplier);
    lastMultiplier = state.multiplier;
  }
};

function pulse(node: HTMLElement): void {
  node.classList.remove("pulse");
  // Force a reflow so the animation restarts even on back-to-back triggers.
  void node.offsetWidth;
  node.classList.add("pulse");
}

function toast(text: string, variant: "gold" | "cool" | "hot" = "gold"): void {
  if (toasts.childElementCount > 4) toasts.removeChild(toasts.firstChild!);
  const node = document.createElement("div");
  node.className = `toast toast--${variant}`;
  node.textContent = text;
  toasts.appendChild(node);
  window.setTimeout(() => node.remove(), 950);
}

game.hooks.onCoin = (streak) => {
  pulse(hudCoins);
  if (streak > 0 && streak % 10 === 0) toast(`${streak} coin streak`, "gold");
};

game.hooks.onNearMiss = (bonus) => {
  toast(`Near miss +${bonus}`, "cool");
};

game.hooks.onMilestone = (score) => {
  toast(`${score.toLocaleString()} — multiplier up`, "hot");
  pulse(hudScore);
};

game.hooks.onSpeedFactor = (factor) => {
  speedFx.style.opacity = String(Math.max(0, (factor - 0.35) / 0.65) * 0.85);
};

game.hooks.onQualityChange = (level) => {
  toast(`Graphics set to ${level}`, "cool");
  qualityChoice = level;
  save.quality = level;
  persist(save);
  renderQualityButtons();
};

// ----------------------------------------------------------------------------- menu data

const menuHigh = el("menu-high");
const menuCoins = el("menu-coins");
const menuDistance = el("menu-distance");
const missionList = el("mission-list");

function renderMenu(): void {
  menuHigh.textContent = save.highScore.toLocaleString();
  menuCoins.textContent = String(save.coins);
  menuDistance.textContent = `${save.bestDistance.toLocaleString()} m`;

  missionList.textContent = "";
  for (const mission of MISSIONS) {
    const done = save.claimed.includes(mission.id);
    const value = done ? mission.target : missionValue(save, mission);
    const item = document.createElement("li");
    if (done) item.classList.add("done");
    const row = document.createElement("div");
    row.className = "mission__row";
    const label = document.createElement("span");
    label.textContent = done ? `✓ ${mission.label}` : mission.label;
    const reward = document.createElement("span");
    reward.className = "mission__reward";
    reward.textContent = `+${mission.reward}`;
    row.append(label, reward);
    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("i");
    fill.style.width = `${Math.min(100, (value / mission.target) * 100)}%`;
    bar.appendChild(fill);
    item.append(row, bar);
    missionList.appendChild(item);
  }
}

// -------------------------------------------------------------------------------- garage

const skinName = el("skin-name");
const skinBlurb = el("skin-blurb");
const skinPrice = el("skin-price");
const skinSwatches = el("skin-swatches");
const garageWallet = el("garage-wallet");
const buyButton = el<HTMLButtonElement>("btn-buy");

let previewIndex = Math.max(0, SKINS.findIndex((s) => s.id === save.selectedSkin));

function renderGarage(): void {
  const skin = SKINS[previewIndex];
  const owned = save.purchasedSkins.includes(skin.id);
  const selected = save.selectedSkin === skin.id;

  skinName.textContent = skin.name;
  skinBlurb.textContent = skin.blurb;
  garageWallet.textContent = String(save.coins);

  if (owned) {
    skinPrice.textContent = selected ? "Selected" : "Owned";
    skinPrice.classList.add("owned");
    buyButton.textContent = selected ? "Selected" : "Select";
    buyButton.disabled = selected;
  } else {
    skinPrice.textContent = `${skin.price} coins`;
    skinPrice.classList.remove("owned");
    buyButton.textContent = save.coins >= skin.price ? `Buy · ${skin.price}` : "Not enough coins";
    buyButton.disabled = save.coins < skin.price;
  }

  skinSwatches.textContent = "";
  SKINS.forEach((entry, index) => {
    const dot = document.createElement("button");
    dot.className = "swatch";
    dot.style.background = `#${entry.paint.toString(16).padStart(6, "0")}`;
    dot.title = entry.name;
    if (index === previewIndex) dot.classList.add("active");
    if (!save.purchasedSkins.includes(entry.id)) dot.classList.add("locked");
    dot.addEventListener("click", () => {
      audio.click();
      previewIndex = index;
      game.setSkin(entry.id);
      renderGarage();
    });
    skinSwatches.appendChild(dot);
  });

  game.setSkin(skin.id);
}

el("skin-prev").addEventListener("click", () => {
  audio.click();
  previewIndex = (previewIndex - 1 + SKINS.length) % SKINS.length;
  renderGarage();
});
el("skin-next").addEventListener("click", () => {
  audio.click();
  previewIndex = (previewIndex + 1) % SKINS.length;
  renderGarage();
});

buyButton.addEventListener("click", () => {
  const skin = SKINS[previewIndex];
  const owned = save.purchasedSkins.includes(skin.id);
  if (!owned) {
    if (save.coins < skin.price) return;
    save.coins -= skin.price;
    save.purchasedSkins.push(skin.id);
    audio.purchase();
  } else {
    audio.click();
  }
  save.selectedSkin = skin.id;
  persist(save);
  game.setSkin(skin.id);
  renderGarage();
  renderMenu();
});

// ------------------------------------------------------------------------------ settings

const soundToggle = el<HTMLButtonElement>("toggle-sound");
const musicToggle = el<HTMLButtonElement>("toggle-music");
const qualityGroup = el("quality-group");
const themeGroup = el("theme-group");

let qualityChoice: QualityLevel | "auto" = save.quality;
let themeChoice: ThemeId | "auto" = "auto";

function renderQualityButtons(): void {
  for (const button of qualityGroup.querySelectorAll<HTMLButtonElement>("button")) {
    button.classList.toggle("active", button.dataset.quality === qualityChoice);
  }
  for (const button of themeGroup.querySelectorAll<HTMLButtonElement>("button")) {
    button.classList.toggle("active", button.dataset.theme === themeChoice);
  }
  soundToggle.textContent = save.sound ? "On" : "Off";
  soundToggle.classList.toggle("on", save.sound);
  musicToggle.textContent = save.music ? "On" : "Off";
  musicToggle.classList.toggle("on", save.music);
}

qualityGroup.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest("button");
  const value = target?.dataset.quality as QualityLevel | "auto" | undefined;
  if (!value) return;
  audio.click();
  qualityChoice = value;
  save.quality = value;
  persist(save);
  if (value === "auto") {
    game.setQuality(game.currentQuality);
  } else {
    game.setQuality(value);
    game.lockQuality();
  }
  renderQualityButtons();
});

themeGroup.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest("button");
  const value = target?.dataset.theme as ThemeId | "auto" | undefined;
  if (!value) return;
  audio.click();
  themeChoice = value;
  if (value === "auto") game.clearThemeOverride();
  else game.forceTheme(value);
  renderQualityButtons();
});

soundToggle.addEventListener("click", () => {
  save.sound = !save.sound;
  audio.setSound(save.sound);
  audio.click();
  persist(save);
  renderQualityButtons();
});

musicToggle.addEventListener("click", () => {
  save.music = !save.music;
  audio.setMusic(save.music);
  audio.click();
  persist(save);
  renderQualityButtons();
});

// ----------------------------------------------------------------------------- game over

const overScore = el("over-score");
const overBest = el("over-best");
const overCoins = el("over-coins");
const overTotal = el("over-total");
const overDistance = el("over-distance");
const overNear = el("over-near");
const overJumps = el("over-jumps");
const overRecord = el("over-record");
const overMissions = el("over-missions");

game.hooks.onCrash = (result: RunResult) => {
  save.coins += result.coins;
  save.runs += 1;
  const record = result.score > save.highScore;
  save.highScore = Math.max(save.highScore, result.score);
  save.bestDistance = Math.max(save.bestDistance, result.distance);
  const completed = updateMissions(save, game.missionProgress());
  persist(save);

  overScore.textContent = result.score.toLocaleString();
  overBest.textContent = save.highScore.toLocaleString();
  overCoins.textContent = String(result.coins);
  overTotal.textContent = String(save.coins);
  overDistance.textContent = `${result.distance.toLocaleString()} m`;
  overNear.textContent = String(result.nearMisses);
  overJumps.textContent = String(result.jumps);
  overRecord.classList.toggle("hidden", !record);

  if (completed.length > 0) {
    overMissions.textContent = `Challenge complete: ${completed
      .map((m) => `${m.label} (+${m.reward})`)
      .join(" · ")}`;
    overMissions.classList.remove("hidden");
  } else {
    overMissions.classList.add("hidden");
  }

  renderMenu();
  // Let the crash play out before the panel covers it.
  window.setTimeout(() => {
    if (game.state === "crashed") show("over");
  }, 900);
};

// ------------------------------------------------------------------------- navigation

function openMenu(): void {
  game.showMenu();
  renderMenu();
  show("menu");
}

function openGarage(): void {
  game.showGarage();
  renderGarage();
  show("garage");
}

function openSettings(): void {
  show("settings");
  renderQualityButtons();
}

function startRun(): void {
  audio.unlock();
  game.startRun();
  show("none");
  speedFx.style.opacity = "0";
}

el("btn-play").addEventListener("click", () => {
  audio.unlock();
  audio.click();
  startRun();
});
el("btn-garage").addEventListener("click", () => {
  audio.unlock();
  audio.click();
  openGarage();
});
el("btn-settings").addEventListener("click", () => {
  audio.click();
  openSettings();
});
el("btn-garage-back").addEventListener("click", () => {
  audio.click();
  openMenu();
});
el("btn-settings-back").addEventListener("click", () => {
  audio.click();
  openMenu();
});
el("btn-again").addEventListener("click", () => {
  audio.click();
  startRun();
});
el("btn-over-garage").addEventListener("click", () => {
  audio.click();
  openGarage();
});
el("btn-over-menu").addEventListener("click", () => {
  audio.click();
  openMenu();
});
el("btn-resume").addEventListener("click", () => {
  audio.click();
  game.resume();
  show("none");
});
el("btn-pause-menu").addEventListener("click", () => {
  audio.click();
  openMenu();
});

game.hooks.onStateChange = (state: GameState) => {
  if (state === "paused") show("pause");
};

// ---------------------------------------------------------------------------- controls

const held = new Set<string>();

window.addEventListener("keydown", (event) => {
  const code = event.code;
  if (
    ["ArrowLeft", "ArrowRight", "Space", "KeyA", "KeyD", "KeyR", "Escape", "F3"].includes(code)
  ) {
    event.preventDefault();
  }

  if (code === "F3") {
    game.toggleDebug();
    return;
  }

  if (code === "Escape") {
    if (game.state === "playing") game.pause();
    else if (game.state === "paused") {
      game.resume();
      show("none");
    }
    return;
  }

  if (code === "KeyR") {
    if (game.state === "playing" || game.state === "crashed" || game.state === "paused") startRun();
    return;
  }

  if (game.state !== "playing") {
    // Space doubles as "start" on the menu and game-over screens.
    if (code === "Space") {
      if (game.state === "menu") startRun();
      else if (game.state === "crashed" && game.canRestart) startRun();
    }
    return;
  }

  if (held.has(code)) return;
  held.add(code);
  if (code === "ArrowLeft" || code === "KeyA") game.input("left");
  else if (code === "ArrowRight" || code === "KeyD") game.input("right");
  else if (code === "Space") game.input("jump");
});

window.addEventListener("keyup", (event) => held.delete(event.code));

// Touch: tap left/right thirds to change lane, tap the middle to jump. Desktop remains primary.
let touchStart: { x: number; y: number; t: number } | null = null;
canvas.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, t: performance.now() };
  },
  { passive: true },
);
canvas.addEventListener(
  "touchend",
  (event) => {
    if (!touchStart || game.state !== "playing") return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) game.input(dx > 0 ? "right" : "left");
    else if (dy < -40) game.input("jump");
    else if (performance.now() - touchStart.t < 250) {
      const third = window.innerWidth / 3;
      if (touch.clientX < third) game.input("left");
      else if (touch.clientX > third * 2) game.input("right");
      else game.input("jump");
    }
    touchStart = null;
  },
  { passive: true },
);

window.addEventListener("blur", () => {
  held.clear();
  if (game.state === "playing") game.pause();
});

// ------------------------------------------------------------------------------- boot

renderQualityButtons();
openMenu();
game.start();

(window as unknown as { __APEX__: unknown }).__APEX__ = {
  game,
  startRun,
  openMenu,
  openGarage,
  openSettings,
  save,
};
