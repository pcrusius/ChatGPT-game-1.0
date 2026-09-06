// Records a deterministic gameplay video, frame by frame.
//   node tools/demo.mjs <url> <outFile.mp4>
//
// This box has no GPU: a real-time screen recording of the game would be a slideshow of
// SwiftShader frames. So the render loop is driven by hand instead — the simulation is stepped
// at a fixed 1/30 s, one frame is rendered, one PNG is captured — and the stills are assembled
// into a 30 fps video. The motion is exactly what the game produces; only the wall-clock time
// taken to draw it is different.
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const url = process.argv[2] ?? "http://localhost:4173/";
const outFile = process.argv[3] ?? "/tmp/demo.mp4";
const frameDir = "/tmp/demo-frames";
rmSync(frameDir, { recursive: true, force: true });
mkdirSync(frameDir, { recursive: true });

const FPS = 24;
const DT = 1 / FPS;

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
await page.setViewport({ width: 960, height: 540, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`CONSOLE ${m.text()}`));

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() =>
  localStorage.setItem(
    "apex-rush-save-v2",
    JSON.stringify({
      coins: 340,
      purchasedSkins: ["red", "blue", "black"],
      selectedSkin: "red",
      highScore: 8200,
      bestDistance: 2400,
      runs: 12,
      quality: "high",
      missions: { coins: 90, distance: 2400, nearMisses: 6, jumps: 18 },
      claimed: [],
      sound: false,
      music: false,
    }),
  ),
);
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 20000 });

await page.evaluate((dt) => {
  const g = window.__APEX__.game;
  g.stop();
  window.__tick = (drive, i) => {
    if (drive) drive(g, i);
    if (g.state === "playing" || g.state === "crashed") g.simulate(dt);
    else g.idle(dt);
    g.renderer.render(g.scene, g.rig.camera);
  };
  const fade = document.createElement("div");
  fade.style.cssText =
    "position:fixed;inset:0;background:#000;opacity:0;z-index:9999;pointer-events:none";
  document.body.appendChild(fade);
  window.__fade = (alpha) => {
    fade.style.opacity = String(alpha);
  };
}, DT);

// Autopilot: hold the emptiest lane, jump what can be jumped, and take coin lines when free.
const AUTOPILOT = `(g, i) => {
  if (g.state !== "playing") return;
  const solid = g.field.entities.filter((e) => e.active && e.role !== "coin" && !e.jumpable && e.z > -52 && e.z < -4);
  const jumpable = g.field.entities.filter((e) => e.active && e.jumpable && e.role === "obstacle" && e.z > -30 && e.z < -4);
  const lane = Math.round(g.lanePosition / 3.6);
  const inLane = (e) => Math.round((e.x + e.laneDrift) / 3.6) === lane;
  const hop = jumpable.find((e) => inLane(e) && e.z > -18);
  if (hop) { g.input("jump"); return; }
  const threat = solid.find(inLane);
  if (threat) {
    const blocked = new Set([...solid, ...jumpable].map((e) => Math.round((e.x + e.laneDrift) / 3.6)));
    for (const next of [lane - 1, lane + 1, lane - 1]) {
      if (next < -1 || next > 1 || blocked.has(next)) continue;
      g.input(next < lane ? "left" : "right");
      return;
    }
    return;
  }
  // Nothing in the way: drift toward the nearest coin line.
  if (i % 12 !== 0) return;
  const coin = g.field.entities.find((e) => e.active && e.role === "coin" && e.z > -70 && e.z < -20);
  if (!coin) return;
  const target = Math.round(coin.x / 3.6);
  if (target === lane) return;
  const blocked = new Set([...solid, ...jumpable].map((e) => Math.round((e.x + e.laneDrift) / 3.6)));
  const step = target < lane ? lane - 1 : lane + 1;
  if (!blocked.has(step)) g.input(step < lane ? "left" : "right");
}`;

let frame = 0;
const shoot = async () => {
  // JPEG frames: PNG encoding of a thousand stills costs more wall clock than the rendering.
  await page.screenshot({
    path: `${frameDir}/${String(frame).padStart(5, "0")}.jpg`,
    type: "jpeg",
    quality: 93,
    optimizeForSpeed: true,
  });
  frame += 1;
};

/** Renders `seconds` of the given scene, one captured frame per simulated frame. */
async function record(seconds, drive = null, label = "") {
  const frames = Math.round(seconds * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((d, index) => window.__tick(d ? eval(d) : null, index), drive, i);
    await shoot();
  }
  if (label) console.log(`${label}: ${frames} frames (total ${frame})`);
}

/** Dips to black and back, so a jump to a different part of the road reads as a cut. */
async function dip(direction) {
  const frames = 5;
  for (let i = 1; i <= frames; i++) {
    const alpha = direction === "out" ? i / frames : 1 - i / frames;
    await page.evaluate((a) => window.__fade(a), alpha);
    await page.evaluate((index) => window.__tick(null, index), i);
    await shoot();
  }
}

/**
 * Drives the run forward without drawing until the odometer reaches `metres`. Themes are keyed
 * to distance, so this is how a section can start just before a cross-fade: forcing the theme
 * instead would snap the whole world over in one frame and misrepresent the game.
 *
 * A crash restarts the run, which puts the odometer back to zero, so the same autopilot that
 * flies the recorded sections is used here — a weaker one never gets past the first kilometre.
 */
async function driveTo(metres, drive = AUTOPILOT) {
  const reached = await page.evaluate(
    (target, code) => {
      const g = window.__APEX__.game;
      const pilot = eval(code);
      if (g.state !== "playing") window.__APEX__.startRun();
      for (let i = 0; i < 120000 && g.distance < target; i++) {
        pilot(g, i);
        g.simulate(1 / 60);
        if (g.state !== "playing") window.__APEX__.startRun();
      }
      return Math.round(g.distance);
    },
    metres,
    drive,
  );
  console.log(`drove to ${reached} m (wanted ${metres})`);
  if (reached < metres - 5) throw new Error(`autopilot stalled at ${reached} m of ${metres} m`);
}

// --- Menu, garage, skin change.
await page.evaluate(() => window.__APEX__.openMenu());
await record(1.4, null, "menu");
await page.evaluate(() => window.__APEX__.openGarage());
await record(1.2, null, "garage");
await page.evaluate(() => document.querySelectorAll("#skin-swatches .swatch")[2].click());
await record(1.5, null, "garage midnight");
await page.evaluate(() => document.querySelectorAll("#skin-swatches .swatch")[0].click());
await record(0.9, null, "garage crimson");

// --- Each leg starts just short of a theme boundary, so the 260 m cross-fade plays on camera.
await dip("out");
await driveTo(1150);
await dip("in");
await record(6.5, AUTOPILOT, "coast into desert");

await dip("out");
await driveTo(2650);
await dip("in");
await record(6.5, AUTOPILOT, "desert into night");

await dip("out");
await driveTo(4100);
await dip("in");
await record(6.0, AUTOPILOT, "night into dawn");

// --- Crash and the game over screen.
await record(2.6, `(g) => {
  if (g.state !== "playing") return;
  const solid = g.field.entities.find((e) => e.active && e.role !== "coin" && !e.jumpable && e.z > -60 && e.z < -6);
  if (!solid) return;
  const lane = Math.round((solid.x + solid.laneDrift) / 3.6);
  const mine = Math.round(g.lanePosition / 3.6);
  if (lane < mine) g.input("left");
  else if (lane > mine) g.input("right");
}`, "crash");
await record(1.8, null, "game over");

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();

const ff = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-framerate", String(FPS),
    "-i", `${frameDir}/%05d.jpg`,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "20",
    "-movflags", "+faststart",
    outFile,
  ],
  { encoding: "utf8" },
);
if (ff.status !== 0) {
  console.error(ff.stderr?.slice(-2000));
  process.exit(1);
}
console.log(`wrote ${outFile} (${frame} frames, ${(frame / FPS).toFixed(1)} s)`);
