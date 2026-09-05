// Captures screenshots of every screen and every environment theme.
//   node tools/shots.mjs <url> <outDir>
//
// Software rendering needs about a second per frame here, so scenes are warmed up by stepping
// the simulation with drawing switched off and then rendering a single frame for the shot.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:4173/";
const outDir = process.argv[3] ?? "/tmp/shots";
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/opt/google/chrome/chrome",
  headless: "new",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--window-size=1600,900",
    "--mute-audio",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE ${m.text()}`);
});

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() =>
  localStorage.setItem(
    "apex-rush-save-v2",
    JSON.stringify({
      coins: 900,
      purchasedSkins: ["red", "blue", "black", "gold"],
      selectedSkin: "red",
      highScore: 12500,
      bestDistance: 3100,
      runs: 24,
      quality: "high",
      missions: { coins: 180, distance: 3100, nearMisses: 12, jumps: 40 },
      claimed: ["first-1000"],
      sound: true,
      music: true,
    }),
  ),
);
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 20000 });

// Take over the frame loop: step logic without drawing, then draw exactly when a shot is due.
await page.evaluate(() => {
  const g = window.__APEX__.game;
  g.stop();
  window.__warm = (seconds, drive) => {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i++) {
      if (drive) drive(g, i);
      if (g.state === "playing" || g.state === "crashed") g.simulate(1 / 60);
      else g.idle(1 / 60);
    }
  };
  window.__draw = () => {
    g.rig.update(1 / 60, g.player.x, g.player.y, 0, 0, false);
    g.renderer.render(g.scene, g.rig.camera);
  };
});

const shot = async (name) => {
  await page.evaluate(() => window.__draw());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot ${name}`);
};

// ------------------------------------------------------------------------------- menus

await page.evaluate(() => {
  window.__APEX__.openMenu();
  window.__warm(2.5);
});
await shot("01_menu");

await page.evaluate(() => {
  window.__APEX__.openGarage();
  window.__warm(2);
});
await shot("02_garage_crimson");

await page.evaluate(() => {
  document.querySelectorAll("#skin-swatches .swatch")[3].click();
  window.__warm(2);
});
await shot("03_garage_gold");

await page.evaluate(() => {
  document.querySelectorAll("#skin-swatches .swatch")[0].click();
  window.__APEX__.openSettings();
  window.__warm(1);
});
await shot("04_settings");

// ---------------------------------------------------------------------------- gameplay

// Autopilot: pick the emptiest lane and jump low barriers, so shots show a live run rather than
// a car parked against a wall.
const AUTOPILOT = `(g, i) => {
  if (g.state !== "playing") { window.__APEX__.startRun(); return; }
  const ahead = g.field.entities.filter((e) => e.active && e.role !== "coin" && e.z > -46 && e.z < -5);
  const mine = Math.round(g.lanePosition / 3.6);
  const threat = ahead.find((e) => Math.round((e.x + e.laneDrift) / 3.6) === mine);
  if (!threat) return;
  if (threat.jumpable && threat.z > -16) { g.input("jump"); return; }
  const blocked = new Set(ahead.map((e) => Math.round((e.x + e.laneDrift) / 3.6)));
  for (const lane of [mine - 1, mine + 1]) {
    if (lane < -1 || lane > 1 || blocked.has(lane)) continue;
    g.input(lane < mine ? "left" : "right");
    return;
  }
}`;

for (const [theme, seconds, name] of [
  ["coastal", 14, "05_coastal"],
  ["desert", 12, "06_desert"],
  ["night", 12, "07_night"],
]) {
  await page.evaluate(
    (t, s, drive) => {
      const g = window.__APEX__.game;
      if (g.state !== "playing") window.__APEX__.startRun();
      g.forceTheme(t);
      window.__warm(s, eval(drive));
      // Settle: clear the road and let any lane change finish so the hero shot is level.
      window.__warm(0.9, (game) => {
        for (const e of game.field.entities) if (e.role !== "coin") e.active = false;
      });
    },
    theme,
    seconds,
    AUTOPILOT,
  );
  await shot(name);
}

// Mid-jump, in the coastal theme.
await page.evaluate((drive) => {
  const g = window.__APEX__.game;
  g.forceTheme("coastal");
  window.__warm(6, eval(drive));
  g.input("jump");
  window.__warm(0.25);
}, AUTOPILOT);
await shot("08_jump");

// Debug overlay on, so the counters are visible.
await page.evaluate((drive) => {
  const g = window.__APEX__.game;
  g.toggleDebug();
  window.__warm(3, eval(drive));
}, AUTOPILOT);
await shot("09_debug_overlay");
await page.evaluate(() => window.__APEX__.game.toggleDebug());

// ------------------------------------------------------------------------ pause and over

await page.evaluate((drive) => {
  const g = window.__APEX__.game;
  window.__warm(4, eval(drive));
  g.pause();
}, AUTOPILOT);
await shot("10_pause");

await page.evaluate(() => {
  const g = window.__APEX__.game;
  g.resume();
  // Drive into the first solid obstacle ahead.
  for (let i = 0; i < 6000 && g.state === "playing"; i++) {
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
});
await new Promise((r) => setTimeout(r, 1400));
await shot("11_game_over");

console.log(errors.length ? `\nERRORS:\n${errors.join("\n")}` : "\nno console errors");
await browser.close();
