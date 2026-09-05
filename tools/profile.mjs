// Headless profiling harness. Boots the built game in Chrome, runs a scripted session and
// reports frame timing plus three.js renderer statistics.
//
//   node tools/profile.mjs [url] [label]
//
// Rendering is software (SwiftShader) in CI-like environments, so absolute FPS is pessimistic.
// Draw calls, triangles and relative frame cost are hardware independent and are the numbers
// worth comparing between revisions.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:4173/";
const label = process.argv[3] ?? "run";
const SAMPLE_MS = 12000;

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
page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text());
});

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => localStorage.setItem("apex-rush-save-v2", JSON.stringify({
  coins: 500, purchasedSkins: ["red"], selectedSkin: "red", highScore: 0,
})));
await page.reload({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

await page.evaluate(() => {
  const api = window.__APEX__;
  if (!api) throw new Error("window.__APEX__ missing; cannot profile");
  api.startRun();
});

// Drive the car so obstacle spawning, collisions and effects are all exercised.
const driver = (async () => {
  const keys = ["ArrowLeft", "ArrowRight", "Space", "ArrowRight", "ArrowLeft", "Space"];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press(keys[i % keys.length]).catch(() => {});
    await new Promise((r) => setTimeout(r, 280));
  }
})();

const result = await page.evaluate(async (sampleMs) => {
  const frames = [];
  let last = performance.now();
  const start = last;
  await new Promise((resolve) => {
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      if (now - start >= sampleMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  frames.shift();
  const sorted = [...frames].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;

  const api = window.__APEX__;
  const renderer = api.game.renderer;
  const info = renderer.info;
  let sceneObjects = 0;
  let sceneMeshes = 0;
  api.game.scene.traverse((o) => {
    sceneObjects += 1;
    if (o.isMesh || o.isInstancedMesh || o.isPoints) sceneMeshes += 1;
  });

  return {
    frames: frames.length,
    meanMs: +mean.toFixed(2),
    medianMs: +pick(0.5).toFixed(2),
    p95Ms: +pick(0.95).toFixed(2),
    worstMs: +sorted[sorted.length - 1].toFixed(2),
    fpsMean: +(1000 / mean).toFixed(1),
    fpsP95: +(1000 / pick(0.95)).toFixed(1),
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length ?? 0,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    sceneObjects,
    sceneMeshes,
    state: api.game.state,
    score: Math.floor(api.game.score ?? 0),
  };
}, SAMPLE_MS);

await driver.catch(() => {});

console.log(`\n=== ${label} (${url}) — 1600x900 @ DPR 1, SwiftShader ===`);
for (const [k, v] of Object.entries(result)) console.log(`${k.padEnd(14)} ${v}`);
console.log("");

await browser.close();
