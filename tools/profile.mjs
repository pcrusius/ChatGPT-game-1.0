// Headless profiling harness. Boots a built game in Chrome, plays a scripted session and reports
// the costs that matter, separated by whether they depend on the GPU.
//
//   node tools/profile.mjs [url] [label] [WxH]
//
// This box has no GPU, so rasterisation runs on SwiftShader and absolute frame times are not
// representative of real hardware. Two of the numbers below are hardware independent and are the
// ones worth comparing between revisions:
//
//   jsMs      Time in the game's own JavaScript per frame (update, spawning, collisions).
//   glCalls   WebGL API calls issued per frame. This is the CPU work the browser and driver do
//             on the main thread before the GPU sees anything, and it is what makes a
//             draw-call-bound WebGL game stutter regardless of how fast the GPU is.
//
// rasterMs is SwiftShader software rendering and is reported only for completeness.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:4173/";
const label = process.argv[3] ?? "run";
const [vw, vh] = (process.argv[4] ?? "1280x720").split("x").map(Number);
const SAMPLE_MS = 9000;

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
await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("CONSOLE ERROR:", msg.text());
});

// Time the page's own animation-frame callbacks, so the game's CPU cost can be read directly
// instead of being hidden by the vsync ceiling. Installed before any page script runs.
await page.evaluateOnNewDocument(() => {
  const stats = { samples: [] };
  window.__RAF__ = stats;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      const start = performance.now();
      cb(t);
      stats.samples.push(performance.now() - start);
      if (stats.samples.length > 4000) stats.samples.shift();
    });
});

// Count WebGL traffic. Installed before any page script runs so it sees the whole session.
await page.evaluateOnNewDocument(() => {
  const counters = { draw: 0, state: 0, uniform: 0, total: 0 };
  window.__GLCOUNT__ = counters;
  const draws = new Set(["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]);
  for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof desc?.value !== "function") continue;
      const original = desc.value;
      const isDraw = draws.has(name);
      const isUniform = name.startsWith("uniform");
      const isState =
        name.startsWith("bind") ||
        name.startsWith("vertexAttrib") ||
        name === "useProgram" ||
        name === "enable" ||
        name === "disable" ||
        name === "activeTexture";
      proto[name] = function (...args) {
        counters.total += 1;
        if (isDraw) counters.draw += 1;
        else if (isUniform) counters.uniform += 1;
        else if (isState) counters.state += 1;
        return original.apply(this, args);
      };
    }
  }
});

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => {
  const save = JSON.stringify({
    coins: 500,
    purchasedSkins: ["red"],
    selectedSkin: "red",
    highScore: 0,
  });
  // V1 and V2 use different save keys; seed both so one harness profiles either build.
  localStorage.setItem("apex-rush-save-v2", save);
  localStorage.setItem("apex-rush-save", save);
});
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
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press(keys[i % keys.length]).catch(() => {});
    await new Promise((r) => setTimeout(r, 280));
  }
})();

const result = await page.evaluate(async (sampleMs) => {
  const api = window.__APEX__;
  const renderer = api.game.renderer;
  const gl = renderer.getContext();
  const counters = window.__GLCOUNT__;

  // Force the GPU to finish inside render() so raster time cannot leak into the JS measurement.
  let rasterMs = 0;
  const inner = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const t = performance.now();
    inner(scene, camera);
    gl.finish();
    rasterMs += performance.now() - t;
  };

  const sample = async (ms) => {
    const out = [];
    let t0 = performance.now();
    const s0 = t0;
    await new Promise((resolve) => {
      const tick = (now) => {
        out.push(now - t0);
        t0 = now;
        if (now - s0 >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    out.shift();
    return out;
  };

  const deltas = [];
  const before = { ...counters };
  let last = performance.now();
  const start = last;
  await new Promise((resolve) => {
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (now - start >= sampleMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  deltas.shift();

  const frames = deltas.length;
  const total = deltas.reduce((a, b) => a + b, 0);
  const sorted = [...deltas].sort((a, b) => a - b);
  const info = renderer.info;
  let sceneMeshes = 0;
  api.game.scene.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isPoints) sceneMeshes += 1;
  });

  // Everything except drawing. With render() stubbed the browser has no new pixels to composite,
  // so the frame time left over is the game's own CPU cost and does not depend on the GPU.
  // The harness registers its own animation-frame callback alongside the game's, so roughly half
  // the samples are the harness doing nothing. The upper percentiles are the game's frames.
  const quantile = (xs, q) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : -1;
  };

  // Cost of the game's own animation-frame callback with drawing stubbed out. This is pure
  // JavaScript on the main thread: update, spawning, collisions and instance-buffer writes.
  renderer.render = () => {};
  await sample(2000);
  window.__RAF__.samples.length = 0;
  await sample(3000);
  const raf = window.__RAF__.samples;
  const logicMs = quantile(raf, 0.75);
  const logicP95 = quantile(raf, 0.95);
  renderer.render = inner;

  return {
    frames,
    frameMs: +(total / frames).toFixed(2),
    jsFrameMs: +logicMs.toFixed(2),
    jsFrameP95Ms: +logicP95.toFixed(2),
    rasterMs: +(rasterMs / frames).toFixed(2),
    jsMs: +((total - rasterMs) / frames).toFixed(2),
    worstMs: +sorted[sorted.length - 1].toFixed(2),
    glCalls: Math.round((counters.total - before.total) / frames),
    glDraws: Math.round((counters.draw - before.draw) / frames),
    glUniforms: Math.round((counters.uniform - before.uniform) / frames),
    glStateChanges: Math.round((counters.state - before.state) / frames),
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    programs: info.programs?.length ?? 0,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
    sceneMeshes,
    state: api.game.state,
  };
}, SAMPLE_MS);

await driver.catch(() => {});

console.log(`\n=== ${label} — ${vw}x${vh} @ DPR 1 ===`);
for (const [k, v] of Object.entries(result)) console.log(`${k.padEnd(15)} ${v}`);
console.log("");

await browser.close();
