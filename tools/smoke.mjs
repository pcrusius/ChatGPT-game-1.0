// Smoke-tests a deployed build: loads the URL in a real Chrome, drives a run, and reports boot
// time, what the run reached, and anything the page logged or failed to fetch.
//   node tools/smoke.mjs <url> [screenshotDir]
//
// Worth running against a hosted URL rather than localhost, because the failure this catches is
// a bundle linked from the wrong base path, which only shows up when the site is not at the root.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const URL = process.argv[2];
const OUT = process.argv[3] ?? "/tmp/smoke";
mkdirSync(OUT, { recursive: true });

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
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });

const problems = [];
page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => m.type() === "error" && problems.push(`CONSOLE ${m.text()}`));
page.on("requestfailed", (r) => problems.push(`REQUESTFAILED ${r.url()}`));
page.on("response", (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`));

const t0 = Date.now();
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 30000 });
const bootMs = Date.now() - t0;
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${OUT}/start.png` });

// Autopilot copied from tools/demo.mjs: scores lanes by clear road ahead.
const AUTOPILOT = `(g, i) => {
  if (g.state !== "playing") return;
  const lane = Math.round(g.lanePosition / 3.6);
  const laneOf = (e) => Math.round((e.x + e.laneDrift) / 3.6);
  const horizon = g.speed * 2.2 + 40;
  const live = g.field.entities.filter(
    (e) => e.active && e.role !== "coin" && e.z > -horizon && e.z < 8,
  );
  const hop = live.find(
    (e) => e.jumpable && laneOf(e) === lane && e.z > -(g.speed * 0.32 + 6) && e.z < -4,
  );
  if (hop) { g.input("jump"); return; }
  if (g.player.laneT < 1) return;
  const gap = [horizon, horizon, horizon];
  for (const e of live) {
    if (e.z > -4) continue;
    const l = laneOf(e) + 1;
    if (l < 0 || l > 2) continue;
    const cost = e.jumpable ? -e.z + 60 : -e.z;
    if (cost < gap[l]) gap[l] = cost;
  }
  const enterable = (l) =>
    l >= -1 && l <= 1 && !live.some((e) => laneOf(e) === l && e.z > -26 && e.z < 10);
  if (gap[lane + 1] > g.speed * 1.9) {
    if (i % 10 !== 0) return;
    const coin = g.field.entities.find((e) => e.active && e.role === "coin" && e.z > -90 && e.z < -30);
    if (!coin) return;
    const want = Math.round(coin.x / 3.6);
    if (want === lane) return;
    const step = want < lane ? lane - 1 : lane + 1;
    if (enterable(step) && gap[step + 1] > g.speed * 1.6) {
      g.input(step < lane ? "left" : "right");
    }
    return;
  }
  let pick = null;
  for (const next of [lane - 1, lane + 1]) {
    if (!enterable(next)) continue;
    if (gap[next + 1] < gap[lane + 1] + 8) continue;
    if (pick === null || gap[next + 1] > gap[pick + 1]) pick = next;
  }
  if (pick !== null) g.input(pick < lane ? "left" : "right");
}`;

await page.evaluate((drive) => {
  const api = window.__APEX__;
  api.startRun();
  let i = 0;
  const pilot = new Function(`return ${drive}`)();
  window.__PILOT__ = setInterval(() => pilot(api.game, i++), 32);
}, AUTOPILOT);

// Software rasterisation is slow, so give the run real wall-clock time to cover ground.
let last = {};
for (let s = 0; s < 14; s++) {
  await new Promise((r) => setTimeout(r, 1000));
  last = await page.evaluate(() => {
    const g = window.__APEX__.game;
    return {
      state: g.state,
      distance: Math.round(g.distance),
      coins: g.runCoins,
      score: Math.round(g.score),
      speed: Math.round(g.speed * 3.6),
      theme: g.world.themeName,
      draws: g.renderer.info.render.calls,
      tris: g.renderer.info.render.triangles,
    };
  });
  if (last.state !== "playing") break;
}
await page.screenshot({ path: `${OUT}/gameplay.png` });

await page.evaluate(() => clearInterval(window.__PILOT__));
await page.evaluate(() => window.__APEX__.openGarage());
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: `${OUT}/garage.png` });

console.log(`boot to interactive: ${bootMs} ms`);
console.log(`run: ${JSON.stringify(last)}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join("\n")}` : "no page errors, no failed requests");
await browser.close();
