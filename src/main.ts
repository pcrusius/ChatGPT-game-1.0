import "./style.css";
import { SKINS } from "./game/config";
import { Game } from "./game/game";
import { loadSave, writeSave } from "./game/storage";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;

const hud = document.getElementById("hud") as HTMLDivElement;
const hudScore = document.getElementById("hud-score") as HTMLDivElement;
const hudCoins = document.getElementById("hud-coins") as HTMLDivElement;
const hudSpeed = document.getElementById("hud-speed") as HTMLDivElement;

const startScreen = document.getElementById("start-screen") as HTMLDivElement;
const startBest = document.getElementById("start-best") as HTMLParagraphElement;
const playBtn = document.getElementById("play-btn") as HTMLButtonElement;
const garageBtn = document.getElementById("garage-btn") as HTMLButtonElement;

const garageScreen = document.getElementById("garage-screen") as HTMLDivElement;
const garageBank = document.getElementById("garage-bank") as HTMLParagraphElement;
const skinGrid = document.getElementById("skin-grid") as HTMLDivElement;
const garageBackBtn = document.getElementById("garage-back-btn") as HTMLButtonElement;

const gameoverScreen = document.getElementById("gameover-screen") as HTMLDivElement;
const overScore = document.getElementById("over-score") as HTMLDivElement;
const overCoins = document.getElementById("over-coins") as HTMLDivElement;
const overBest = document.getElementById("over-best") as HTMLDivElement;
const retryBtn = document.getElementById("retry-btn") as HTMLButtonElement;
const menuBtn = document.getElementById("menu-btn") as HTMLButtonElement;

let save = loadSave();
let bankedThisRun = 0;

function show(element: HTMLElement, visible: boolean): void {
  element.classList.toggle("hidden", !visible);
}

const game = new Game(canvas, save.selectedSkin, {
  onHud(score, coins, speedKmh) {
    hudScore.textContent = score.toLocaleString();
    hudCoins.textContent = String(coins);
    hudSpeed.innerHTML = `${Math.round(speedKmh)}<span class="hud-unit">KM/H</span>`;
  },
  onCoinBanked(runTotal) {
    const delta = runTotal - bankedThisRun;
    if (delta <= 0) return;
    bankedThisRun = runTotal;
    save.coins += delta;
    writeSave(save);
  },
  onGameOver(stats) {
    if (stats.score > save.highScore) {
      save.highScore = stats.score;
      writeSave(save);
    }
    overScore.textContent = stats.score.toLocaleString();
    overCoins.textContent = String(stats.coins);
    overBest.textContent = save.highScore.toLocaleString();
    show(hud, false);
    show(gameoverScreen, true);
  },
});

function refreshMenuMeta(): void {
  startBest.textContent = `HIGH SCORE ${save.highScore.toLocaleString()} · BANK ${save.coins.toLocaleString()}`;
  garageBank.textContent = `BANK ${save.coins.toLocaleString()} COINS`;
}

function renderGarage(): void {
  skinGrid.replaceChildren();
  for (const skin of SKINS) {
    const owned = save.purchasedSkins.includes(skin.id);
    const selected = save.selectedSkin === skin.id;

    const card = document.createElement("button");
    card.className = `skin-card${selected ? " selected" : ""}`;
    card.type = "button";

    const swatch = document.createElement("div");
    swatch.className = "swatch";
    swatch.style.background = `linear-gradient(90deg, #${skin.paint.toString(16).padStart(6, "0")}, #${skin.stripe
      .toString(16)
      .padStart(6, "0")})`;
    card.appendChild(swatch);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = skin.name;
    card.appendChild(name);

    const price = document.createElement("div");
    price.className = "price";
    if (selected) price.textContent = "SELECTED";
    else if (owned) price.textContent = "Tap to equip";
    else price.textContent = `${skin.price} coins`;
    card.appendChild(price);

    if (!owned && save.coins < skin.price) {
      card.disabled = true;
      price.textContent = `${skin.price} coins — need ${skin.price - save.coins} more`;
    }

    card.addEventListener("click", () => {
      game.audio.resume();
      if (!save.purchasedSkins.includes(skin.id)) {
        if (save.coins < skin.price) return;
        save.coins -= skin.price;
        save.purchasedSkins.push(skin.id);
      }
      save.selectedSkin = skin.id;
      writeSave(save);
      game.setSkin(skin.id);
      refreshMenuMeta();
      renderGarage();
    });

    skinGrid.appendChild(card);
  }
}

function openMenu(): void {
  game.showMenu();
  show(startScreen, true);
  show(garageScreen, false);
  show(gameoverScreen, false);
  show(hud, false);
  refreshMenuMeta();
}

function openGarage(): void {
  game.showGarage();
  show(startScreen, false);
  show(gameoverScreen, false);
  show(hud, false);
  show(garageScreen, true);
  refreshMenuMeta();
  renderGarage();
}

function startRun(): void {
  bankedThisRun = 0;
  save = loadSave();
  game.setSkin(save.selectedSkin);
  show(startScreen, false);
  show(garageScreen, false);
  show(gameoverScreen, false);
  show(hud, true);
  game.startRun();
}

playBtn.addEventListener("click", () => {
  game.audio.resume();
  startRun();
});
garageBtn.addEventListener("click", () => {
  game.audio.resume();
  openGarage();
});
garageBackBtn.addEventListener("click", openMenu);
retryBtn.addEventListener("click", startRun);
menuBtn.addEventListener("click", openMenu);

window.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "ArrowLeft":
    case "KeyA":
      event.preventDefault();
      game.input("left");
      break;
    case "ArrowRight":
    case "KeyD":
      event.preventDefault();
      game.input("right");
      break;
    case "Space":
      event.preventDefault();
      game.input("jump");
      break;
    case "KeyR":
      if (game.state === "crashed") startRun();
      break;
    case "Enter":
      if (game.state === "menu") startRun();
      break;
    default:
      break;
  }
});

openMenu();
game.start();
