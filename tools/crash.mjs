// Records the moment of impact, frame by frame, so the crash can be judged.
//   node tools/crash.mjs <url> <outFile.mp4> [--flat]
//
// Steps the simulation by hand at a fixed dt, exactly as tools/demo.mjs does, because this box
// renders through SwiftShader and real-time capture would drop most of the frames that matter.
// `--flat` zeroes the recoil offsets every frame, reproducing the pre-fix behaviour for an A/B.
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const url = process.argv[2] ?? "http://localhost:4173/";
const outFile = process.argv[3] ?? "/tmp/crash.mp4";
const flat = process.argv.includes("--flat");
const frameDir = "/tmp/crash-frames";
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
await page.evaluate(() => localStorage.setItem("apex-rush-save-v2", JSON.stringify({
  coins: 340, purchasedSkins: ["red"], selectedSkin: "red", highScore: 8200,
  bestDistance: 2400, runs: 12, quality: "high", missions: {}, claimed: [],
  sound: false, music: false,
})));
await page.reload({ waitUntil: "networkidle0" });
await page.waitForFunction("window.__APEX__ !== undefined", { timeout: 20000 });

await page.evaluate(
  ({ dt, flat }) => {
    const g = window.__APEX__.game;
    g.stop();
    if (flat) {
      // Reproduce the pre-fix crash exactly: the entity field and the world both froze at the
      // instant of impact, so nothing but the camera kick moved.
      const field = g.field.update.bind(g.field);
      g.field.update = (d, scroll, shadows) =>
        field(d, g.state === "crashed" ? 0 : scroll, shadows);
      const world = g.world.update.bind(g.world);
      let frozen = null;
      g.world.update = (dist, d, cz) => {
        if (g.state !== "crashed") {
          frozen = null;
          return world(dist, d, cz);
        }
        if (frozen === null) frozen = dist;
        return world(frozen, d, cz);
      };
    }
    window.__tick = (i) => {
      // Aim at the nearest solid hazard and hold that lane until it lands.
      if (g.state === "playing") {
        const target = g.field.entities
          .filter((e) => e.active && e.role !== "coin" && e.role !== "decor" && !e.jumpable && e.z < -14)
          .sort((a, b) => b.z - a.z)[0];
        if (target && g.player.laneT >= 1) {
          const lane = Math.round(g.lanePosition / 3.6);
          const want = Math.round((target.x + target.laneDrift) / 3.6);
          if (want !== lane) g.input(want < lane ? "left" : "right");
        }
      }
      if (g.state === "playing" || g.state === "crashed") g.simulate(dt);
      // Pre-fix behaviour: the car stayed pinned at z=0 with no lateral shove.
      if (flat && g.state === "crashed") {
        g.player.crashPush = 0;
        g.player.crashSlide = 0;
        g.player.group.position.x = g.player.x;
        g.player.group.position.z = 0;
        // Struck objects used to keep the angle they were placed at.
        for (const e of g.field.entities) {
          e.yaw = 0;
          e.yawVel = 0;
        }
      }
      g.renderer.render(g.scene, g.rig.camera);
      return g.state;
    };
    // The game-over card is held back by a wall-clock timer, and stepping the simulation by hand
    // runs far slower than wall clock, so the card would cover the whole tumble. Hiding it keeps
    // the subject of the recording visible.
    const css = document.createElement("style");
    css.textContent = "#screen-over{display:none !important}";
    document.head.appendChild(css);
    window.__APEX__.startRun();
  },
  { dt: DT, flat },
);

// Run until impact, then keep rolling so the aftermath is on film.
let frame = 0;
let crashedAt = -1;
const shoot = async () => {
  await page.screenshot({
    path: `${frameDir}/${String(frame++).padStart(4, "0")}.jpg`,
    type: "jpeg",
    quality: 92,
    optimizeForSpeed: true,
  });
};

// Capturing every frame of the approach would cost more wall clock than it is worth, so filming
// starts once a hazard the car cannot avoid is close, giving a short, consistent run-in.
let approach = 0;
for (let i = 0; i < 1400; i++) {
  const state = await page.evaluate((n) => window.__tick(n), i);
  if (crashedAt < 0 && state === "crashed") crashedAt = frame;
  if (crashedAt < 0) {
    const imminent = await page.evaluate(() => {
      const g = window.__APEX__.game;
      const lane = Math.round(g.lanePosition / 3.6);
      return g.field.entities.some(
        (e) =>
          e.active && !e.jumpable && e.role !== "coin" && e.role !== "decor" &&
          Math.round((e.x + e.laneDrift) / 3.6) === lane && e.z > -34 && e.z < -4,
      );
    });
    if (!imminent) continue;
    if (approach++ > FPS * 0.5) continue;
  }
  await shoot();
  if (crashedAt >= 0 && frame - crashedAt > FPS * 2.2) break;
}

if (crashedAt < 0) throw new Error("never crashed");
console.log(`impact at step ${crashedAt}, ${frame} frames captured`);
console.log(errors.length ? `PROBLEMS:\n${errors.join("\n")}` : "no page errors");
await browser.close();

spawnSync(
  "ffmpeg",
  ["-y", "-framerate", String(FPS), "-i", `${frameDir}/%04d.jpg`,
   "-vf", "scale=960:540", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", outFile],
  { stdio: "inherit" },
);
console.log(outFile);
