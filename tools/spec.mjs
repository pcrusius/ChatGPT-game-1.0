// Behaviour spec for the game, run in a real browser against the production build.
//
//   node tools/spec.mjs [url]
//
// This box has no GPU, so rendering a frame takes about a second under SwiftShader. The render
// loop is therefore stopped and the simulation is stepped directly at a fixed timestep, which is
// both fast and deterministic. UI hooks, persistence and DOM state are exercised for real.
//
// Each scenario boots a fresh page with a known save file so that one scenario cannot leak state
// into the next.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:4173/";
const LANE_WIDTH = 3.6;

const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: "new",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--mute-audio",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 500, deviceScaleFactor: 1 });

const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`console error: ${m.text()}`));

const results = [];
let failures = 0;
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
}

const HELPERS = `
  // Steps the simulation without rendering, so a scenario runs in milliseconds instead of
  // minutes. Bypasses frame() only to skip the draw; all game logic is the real thing.
  window.__step = (frames, dt = 1 / 60) => {
    for (let i = 0; i < frames; i++) window.__APEX__.game.simulate(dt);
  };
  // Steps only while the run is alive, so a scenario never silently continues past a crash.
  window.__stepAlive = (frames, dt = 1 / 60) => {
    const g = window.__APEX__.game;
    for (let i = 0; i < frames; i++) {
      if (g.state !== "playing") return false;
      g.simulate(dt);
    }
    return true;
  };
`;

async function boot(save) {
  await page.goto(url, { waitUntil: "networkidle0" });
  await page.evaluate((s) => {
    if (s) localStorage.setItem("apex-rush-save-v2", JSON.stringify(s));
    else localStorage.removeItem("apex-rush-save-v2");
  }, save ?? null);
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 15000 });
  await page.evaluate(HELPERS);
  await page.evaluate(() => window.__APEX__.game.stop());
}

const visible = (id) =>
  page.evaluate((i) => !document.getElementById(i).classList.contains("hidden"), id);

// =============================================================== menu and run lifecycle

await boot();
check("boots into the menu", (await page.evaluate(() => window.__APEX__.game.state)) === "menu");
check("menu screen is shown", await visible("screen-menu"));
check("HUD is hidden in the menu", !(await visible("hud")));

await page.evaluate(() => window.__APEX__.startRun());
check("run starts", (await page.evaluate(() => window.__APEX__.game.state)) === "playing");
check("HUD is shown while playing", await visible("hud"));
check("menu is hidden while playing", !(await visible("screen-menu")));

const early = await page.evaluate(() => {
  window.__step(180);
  const g = window.__APEX__.game;
  return { distance: g.distance, speed: g.speed };
});
check("distance accumulates", early.distance > 50, `${early.distance.toFixed(0)} m in 3 s`);
check("speed ramps up", early.speed > 0.4, `speed=${early.speed.toFixed(1)}`);

// =============================================================== controls
// Obstacles are cleared each step so a stray collision cannot mask a control problem.

await boot();
const controls = await page.evaluate((laneWidth) => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  const clear = () => {
    for (const e of g.field.entities) if (e.role !== "coin") e.active = false;
  };
  const run = (n) => {
    for (let i = 0; i < n; i++) {
      clear();
      g.simulate(1 / 60);
    }
  };

  run(30);
  const start = g.lanePosition;
  g.input("left");
  run(40);
  const left = g.lanePosition;
  g.input("right");
  run(40);
  g.input("right");
  run(40);
  const right = g.lanePosition;
  g.input("right");
  run(40);
  const clamped = g.lanePosition;

  g.input("jump");
  run(6);
  const rising = g.player.y;
  run(14);
  const peak = g.player.y;
  run(120);
  const landed = { y: g.player.y, airborne: g.player.airborne };

  // A second jump must not be possible mid-air.
  g.input("jump");
  run(8);
  const midAirY = g.player.y;
  g.input("jump");
  run(2);
  const doubleJumpBlocked = g.player.y >= midAirY - 0.5;
  run(140);

  return { start, left, right, clamped, rising, peak, landed, doubleJumpBlocked, laneWidth };
}, LANE_WIDTH);

check("left input changes lane", Math.abs(controls.left - (controls.start - LANE_WIDTH)) < 0.05,
  `${controls.start.toFixed(1)} -> ${controls.left.toFixed(1)}`);
check("right input changes lane", Math.abs(controls.right - LANE_WIDTH) < 0.05,
  `-> ${controls.right.toFixed(1)}`);
check("outside lane is clamped", Math.abs(controls.clamped - controls.right) < 0.01,
  `x=${controls.clamped.toFixed(2)}`);
check("jump leaves the ground", controls.rising > 0.1, `y=${controls.rising.toFixed(2)}`);
check("jump clears obstacle height", controls.peak > 0.9, `peak y=${controls.peak.toFixed(2)}`);
check("jump lands again", controls.landed.y < 0.02 && !controls.landed.airborne,
  `y=${controls.landed.y.toFixed(3)}`);
check("no double jump", controls.doubleJumpBlocked);

// Keyboard bindings go through the real listeners.
await boot();
await page.evaluate(() => window.__APEX__.startRun());
const keys = await page.evaluate(async () => {
  const g = window.__APEX__.game;
  for (const e of g.field.entities) e.active = false;
  const out = {};
  const press = (code) =>
    window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
  const release = (code) =>
    window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
  const settle = () => {
    for (let i = 0; i < 40; i++) {
      for (const e of g.field.entities) if (e.role !== "coin") e.active = false;
      g.simulate(1 / 60);
    }
  };
  press("KeyA");
  release("KeyA");
  settle();
  out.a = g.lanePosition;
  press("KeyD");
  release("KeyD");
  settle();
  press("KeyD");
  release("KeyD");
  settle();
  out.d = g.lanePosition;
  press("Space");
  release("Space");
  for (let i = 0; i < 10; i++) g.simulate(1 / 60);
  out.space = g.player.y;
  for (let i = 0; i < 140; i++) g.simulate(1 / 60);
  press("Escape");
  release("Escape");
  out.escape = g.state;
  press("Escape");
  release("Escape");
  out.escapeAgain = g.state;
  return out;
});
check("A steers left", keys.a < -LANE_WIDTH + 0.1, `x=${keys.a.toFixed(1)}`);
check("D steers right", keys.d > LANE_WIDTH - 0.1, `x=${keys.d.toFixed(1)}`);
check("Space jumps", keys.space > 0.1, `y=${keys.space.toFixed(2)}`);
check("Escape pauses", keys.escape === "paused", keys.escape);
check("Escape resumes", keys.escapeAgain === "playing", keys.escapeAgain);

// =============================================================== pause

await boot();
const pause = await page.evaluate(() => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  window.__step(60);
  g.pause();
  const shown = !document.getElementById("screen-pause").classList.contains("hidden");
  const d0 = g.distance;
  window.__step(60);
  const frozen = Math.abs(g.distance - d0) < 1e-6;
  const inputIgnored = (() => {
    const x = g.lanePosition;
    g.input("left");
    window.__step(30);
    return Math.abs(g.lanePosition - x) < 1e-6;
  })();
  g.resume();
  return { paused: g.state === "playing", shown, frozen, inputIgnored, resumed: g.state };
});
check("pause screen is shown", pause.shown);
check("simulation is frozen while paused", pause.frozen);
check("input is ignored while paused", pause.inputIgnored);
check("resume returns to playing", pause.resumed === "playing", pause.resumed);

// =============================================================== coins and scoring

await boot();
const scoring = await page.evaluate(() => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  // Steer coins onto the car rather than hoping to drive through them, and clear solids so the
  // run survives long enough to bank a streak.
  let hudCoins = "";
  for (let i = 0; i < 3000 && g.coins < 12; i++) {
    for (const e of g.field.entities) {
      if (!e.active) continue;
      if (e.role === "coin") {
        if (e.collectT < 0 && e.z > -40) {
          e.x = g.player.x;
          e.laneDrift = 0;
          e.y = g.player.y + 0.9;
        }
      } else {
        e.active = false;
      }
    }
    g.simulate(1 / 60);
    hudCoins = document.getElementById("hud-coins").textContent;
  }
  return {
    coins: g.coins,
    score: g.score,
    hudCoins,
    hudScore: document.getElementById("hud-score").textContent,
    hudSpeed: Number(document.getElementById("hud-speed").textContent),
    multiplier: document.getElementById("hud-multiplier").textContent,
    alive: g.state === "playing",
  };
});
check("coins are collectable", scoring.coins >= 12, `coins=${scoring.coins}`);
check("score accumulates", scoring.score > 0, `score=${scoring.score.toFixed(0)}`);
check("HUD coin counter tracks pickups", scoring.hudCoins === String(scoring.coins),
  `hud=${scoring.hudCoins} game=${scoring.coins}`);
check("HUD score is populated", scoring.hudScore !== "0", `hud=${scoring.hudScore}`);
check("HUD speed is populated", scoring.hudSpeed > 100, `${scoring.hudSpeed} kph`);
check("HUD multiplier is populated", /^×\d/.test(scoring.multiplier), scoring.multiplier);

// =============================================================== crash, game over, restart

await boot();
const crash = await page.evaluate(() => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  // Steer into the first solid thing ahead instead of waiting for bad luck.
  for (let i = 0; i < 6000; i++) {
    if (g.state === "crashed") break;
    const solid = g.field.entities.find(
      (e) => e.active && e.role !== "coin" && !e.jumpable && e.z > -60 && e.z < -6,
    );
    if (solid) {
      const lane = Math.round((solid.x + solid.laneDrift) / 3.6);
      const mine = Math.round(g.lanePosition / 3.6);
      if (lane < mine) g.input("left");
      else if (lane > mine) g.input("right");
    }
    g.simulate(1 / 60);
  }
  return { state: g.state, result: g.result(), speed: g.speed };
});
check("hitting a solid obstacle crashes", crash.state === "crashed", `state=${crash.state}`);
check("run result is populated", crash.result.score > 0 && crash.result.distance > 0,
  JSON.stringify(crash.result));

await new Promise((r) => setTimeout(r, 1400));
check("game over screen appears", await visible("screen-over"));
const over = await page.evaluate(() => ({
  score: document.getElementById("over-score").textContent,
  best: document.getElementById("over-best").textContent,
  distance: document.getElementById("over-distance").textContent,
  record: !document.getElementById("over-record").classList.contains("hidden"),
  saved: JSON.parse(localStorage.getItem("apex-rush-save-v2")),
}));
check("game over shows the run score", over.score !== "0" && over.score !== "", over.score);
check("game over shows the distance", /\d+ m/.test(over.distance), over.distance);
check("first run is flagged as a new record", over.record);
check("high score matches the run", over.best === over.score, `${over.best} vs ${over.score}`);
check("high score persisted", over.saved.highScore > 0, `saved=${over.saved.highScore}`);
check("run count persisted", over.saved.runs === 1, `runs=${over.saved.runs}`);

await page.keyboard.press("KeyR");
const restarted = await page.evaluate(() => {
  const g = window.__APEX__.game;
  return { state: g.state, distance: g.distance, score: g.score, coins: g.coins };
});
check("R restarts from game over", restarted.state === "playing", restarted.state);
check("restart resets the run",
  restarted.distance < 5 && restarted.score === 0 && restarted.coins === 0,
  JSON.stringify(restarted));

// A second, weaker run must not be announced as a record.
const second = await page.evaluate(async () => {
  const g = window.__APEX__.game;
  const best = window.__APEX__.save.highScore;
  g.crash?.(0) ?? g.input("jump");
  window.__step(240);
  return { best, record: !document.getElementById("over-record").classList.contains("hidden"),
    state: g.state };
});
check("a weaker run is not a record", !second.record, `best=${second.best} state=${second.state}`);

// =============================================================== persistence

const carried = await page.evaluate(() => JSON.parse(localStorage.getItem("apex-rush-save-v2")));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 15000 });
const reloaded = await page.evaluate(() => ({
  save: window.__APEX__.save,
  coins: document.getElementById("menu-coins").textContent,
  high: document.getElementById("menu-high").textContent,
}));
check("coins survive a reload", reloaded.save.coins === carried.coins,
  `${carried.coins} -> ${reloaded.save.coins}`);
check("high score survives a reload", reloaded.save.highScore === carried.highScore,
  `${carried.highScore} -> ${reloaded.save.highScore}`);
check("menu shows the stored coin total", reloaded.coins === String(carried.coins), reloaded.coins);
check("menu shows the stored high score",
  reloaded.high === carried.highScore.toLocaleString(), reloaded.high);

// =============================================================== garage economy

await boot({
  coins: 60,
  purchasedSkins: ["red"],
  selectedSkin: "red",
  highScore: 0,
  quality: "high",
});
await page.evaluate(() => window.__APEX__.openGarage());
check("garage opens", await visible("screen-garage"));

const garage = await page.evaluate(() => {
  const price = document.getElementById("skin-price");
  const buy = document.getElementById("btn-buy");
  const next = document.getElementById("skin-next");
  const out = {
    redLabel: price.textContent,
    firstName: document.getElementById("skin-name").textContent,
  };

  next.click(); // Blue, 50 coins, affordable with 60.
  out.blueName = document.getElementById("skin-name").textContent;
  out.bluePrice = price.textContent;
  out.blueBuyEnabled = !buy.disabled;
  buy.click();
  out.coinsAfterBuy = window.__APEX__.save.coins;
  out.selectedAfterBuy = window.__APEX__.save.selectedSkin;
  out.owned = [...window.__APEX__.save.purchasedSkins];
  out.wallet = document.getElementById("garage-wallet").textContent;
  out.blueLabelAfterBuy = price.textContent;

  next.click(); // Black, 120 coins, unaffordable with 10 left.
  out.blackName = document.getElementById("skin-name").textContent;
  out.blackDisabled = buy.disabled;
  out.blackLabel = buy.textContent;
  buy.click();
  out.coinsAfterBlockedBuy = window.__APEX__.save.coins;
  out.ownedAfterBlockedBuy = [...window.__APEX__.save.purchasedSkins];

  next.click(); // Gold, the last skin, then wrap back to red.
  out.goldName = document.getElementById("skin-name").textContent;
  next.click();
  out.wrapped = document.getElementById("skin-name").textContent;
  return out;
});
check("owned and selected skin reads as selected", garage.redLabel === "Selected", garage.redLabel);
check("blue skin costs 50", garage.bluePrice === "50 coins", `${garage.blueName}: ${garage.bluePrice}`);
check("affordable skin can be bought", garage.blueBuyEnabled);
check("purchase deducts the price", garage.coinsAfterBuy === 10, `coins=${garage.coinsAfterBuy}`);
check("purchase unlocks and selects the skin",
  garage.owned.includes("blue") && garage.selectedAfterBuy === "blue", JSON.stringify(garage.owned));
check("wallet updates after purchase", garage.wallet === "10", garage.wallet);
check("bought skin now reads as selected", garage.blueLabelAfterBuy === "Selected",
  garage.blueLabelAfterBuy);
check("unaffordable skin is not purchasable", garage.blackDisabled, garage.blackLabel);
check("unaffordable skin explains why", garage.blackLabel === "Not enough coins", garage.blackLabel);
check("blocked purchase changes nothing",
  garage.coinsAfterBlockedBuy === 10 && !garage.ownedAfterBlockedBuy.includes("black"),
  JSON.stringify(garage.ownedAfterBlockedBuy));
check("skin carousel wraps around", garage.wrapped === garage.firstName,
  `${garage.goldName} -> ${garage.wrapped}, expected ${garage.firstName}`);

await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 15000 });
const afterReload = await page.evaluate(() => window.__APEX__.save);
check("purchase survives a reload",
  afterReload.purchasedSkins.includes("blue") &&
    afterReload.selectedSkin === "blue" &&
    afterReload.coins === 10,
  JSON.stringify({ owned: afterReload.purchasedSkins, sel: afterReload.selectedSkin, c: afterReload.coins }));

// =============================================================== settings

await boot();
const settings = await page.evaluate(() => {
  window.__APEX__.game.stop();
  window.__APEX__.openSettings();
  const out = { shown: !document.getElementById("screen-settings").classList.contains("hidden") };
  document.querySelector('#quality-group button[data-quality="low"]').click();
  out.low = window.__APEX__.game.currentQuality;
  document.querySelector('#quality-group button[data-quality="high"]').click();
  out.high = window.__APEX__.game.currentQuality;
  out.savedQuality = JSON.parse(localStorage.getItem("apex-rush-save-v2")).quality;

  const themeName = () => {
    window.__APEX__.game.simulate(1 / 60);
    return window.__APEX__.game.world.currentThemeName;
  };
  document.querySelector('#theme-group button[data-theme="coastal"]').click();
  out.coastal = themeName();
  document.querySelector('#theme-group button[data-theme="desert"]').click();
  out.desert = themeName();
  document.querySelector('#theme-group button[data-theme="night"]').click();
  out.night = themeName();

  const sound = document.getElementById("toggle-sound");
  const music = document.getElementById("toggle-music");
  sound.click();
  music.click();
  const saved = JSON.parse(localStorage.getItem("apex-rush-save-v2"));
  out.soundOff = sound.textContent === "Off" && saved.sound === false;
  out.musicOff = music.textContent === "Off" && saved.music === false;

  const node = document.getElementById("debug-overlay");
  window.__APEX__.game.toggleDebug();
  out.debugOn = node.style.display === "block";
  window.__APEX__.game.toggleDebug();
  out.debugOff = node.style.display === "none";
  return out;
});
check("settings screen opens", settings.shown);
check("low quality applies", settings.low === "low", settings.low);
check("high quality applies", settings.high === "high", settings.high);
check("quality is persisted", settings.savedQuality === "high", settings.savedQuality);
check("coastal theme can be forced", settings.coastal === "Pacific Coast", settings.coastal);
check("desert theme can be forced", settings.desert === "Mesa Sunset", settings.desert);
check("night theme can be forced", settings.night === "Neon Mile", settings.night);
check("sound can be switched off and is persisted", settings.soundOff);
check("music can be switched off and is persisted", settings.musicOff);
check("debug overlay toggles on", settings.debugOn);
check("debug overlay toggles off", settings.debugOff);

// =============================================================== themes cycle on distance

await boot();
const themes = await page.evaluate(() => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  const seen = [];
  for (let i = 0; i < 40000; i++) {
    for (const e of g.field.entities) if (e.role !== "coin") e.active = false;
    g.simulate(1 / 60);
    const name = g.world.currentThemeName;
    if (seen[seen.length - 1] !== name) seen.push(name);
    if (seen.length >= 3) break;
  }
  return { seen, distance: Math.round(g.distance) };
});
check("themes advance with distance", themes.seen.length >= 3,
  `${themes.seen.join(" -> ")} by ${themes.distance} m`);

// =============================================================== survivability

// The director promises never to seal every lane. Walk a long run and group solid obstacles into
// hazards: anything within one lane-change of forward travel has to be cleared by a single lane
// choice, so a hazard covering all three lanes would be an unavoidable death.
const survivable = await page.evaluate(() => {
  const g = window.__APEX__.game;
  window.__APEX__.startRun();
  const GROUP_Z = 16;
  let sealed = 0;
  let hazards = 0;
  const seen = new Set();
  for (let i = 0; i < 40000; i++) {
    g.simulate(1 / 60);
    if (g.state !== "playing") window.__APEX__.startRun();
    if (i % 10 !== 0) continue;

    const solids = g.field.entities
      .filter((e) => e.active && e.role !== "coin" && !e.jumpable && e.z > -200 && e.z < -6)
      .sort((a, b) => a.z - b.z);

    let group = [];
    const flush = () => {
      if (!group.length) return;
      const key = Math.round(g.distance - group[0].z);
      if (!seen.has(key)) {
        seen.add(key);
        hazards += 1;
        const lanes = new Set(group.map((e) => Math.round((e.x + e.laneDrift) / 3.6)));
        if (lanes.size >= 3) sealed += 1;
      }
      group = [];
    };
    for (const e of solids) {
      if (group.length && e.z - group[group.length - 1].z > GROUP_Z) flush();
      group.push(e);
    }
    flush();
  }
  return { sealed, hazards, distance: Math.round(g.distance) };
});
check("no hazard ever seals all three lanes", survivable.sealed === 0,
  `${survivable.sealed} sealed of ${survivable.hazards} hazards`);
check("the spawner produced enough hazards to be meaningful", survivable.hazards > 100,
  `${survivable.hazards} hazards`);

// =============================================================== report

console.log("");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
if (problems.length) {
  console.log("\nbrowser errors:");
  for (const p of problems) console.log(`  ${p}`);
}
console.log(`\n${results.length - failures}/${results.length} checks passed`);
if (problems.length) console.log(`${problems.length} browser error(s)`);

await browser.close();
process.exit(failures > 0 || problems.length > 0 ? 1 : 0);
