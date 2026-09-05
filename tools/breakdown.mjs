// Splits a frame into game logic vs. renderer submission and lists the heaviest geometry in the
// scene. Run against a built game:
//
//   node tools/breakdown.mjs [url] [label] [WxH]
//
// This box has no GPU, so raster time comes from SwiftShader and is not representative. The
// logic split and the triangle/draw-call inventory are hardware independent.
import puppeteer from "puppeteer-core";

const url = process.argv[2] ?? "http://localhost:4173/";
const label = process.argv[3] ?? "run";
const [vw, vh] = (process.argv[4] ?? "960x540").split("x").map(Number);

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
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => {
  const save = JSON.stringify({
    coins: 500,
    purchasedSkins: ["red"],
    selectedSkin: "red",
    highScore: 0,
  });
  localStorage.setItem("apex-rush-save-v2", save);
  localStorage.setItem("apex-rush-save", save);
});
await page.reload({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));

const result = await page.evaluate(async () => {
  const api = window.__APEX__;
  const renderer = api.game.renderer;

  // Time spent inside render() is raster + driver; the rest of the frame is our own JS.
  let renderMs = 0;
  const inner = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    const t = performance.now();
    inner(scene, camera);
    renderMs += performance.now() - t;
  };

  const sample = async (ms) => {
    renderMs = 0;
    const deltas = [];
    let last = performance.now();
    const start = last;
    await new Promise((resolve) => {
      const tick = (now) => {
        deltas.push(now - last);
        last = now;
        if (now - start >= ms) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    deltas.shift();
    const frames = deltas.length;
    const total = deltas.reduce((a, b) => a + b, 0);
    return {
      frames,
      frameMs: +(total / frames).toFixed(2),
      renderMs: +(renderMs / frames).toFixed(2),
      logicMs: +((total - renderMs) / frames).toFixed(2),
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  };

  api.startRun();
  await new Promise((r) => setTimeout(r, 2500));
  const play = await sample(8000);

  // Heaviest geometry in the scene, counting instances.
  const heavy = [];
  api.game.scene.traverse((o) => {
    const g = o.geometry;
    if (!g?.attributes?.position) return;
    const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const count = o.isInstancedMesh ? o.count : 1;
    const path = [];
    for (let n = o; n; n = n.parent) if (n.name) path.unshift(n.name);
    heavy.push({
      name: path.join("/") || o.type,
      tris: Math.round(tris),
      count,
      total: Math.round(tris * count),
    });
  });
  heavy.sort((a, b) => b.total - a.total);

  return { play, heavy: heavy.slice(0, 18) };
});

console.log(`\n=== ${label} — ${vw}x${vh} ===`);
console.log("playing:", JSON.stringify(result.play));
console.log("\nheaviest geometry (triangles x instances):");
for (const h of result.heavy) {
  console.log(`  ${String(h.total).padStart(7)}  ${String(h.tris).padStart(6)} x${String(h.count).padEnd(4)} ${h.name}`);
}
console.log("");

await browser.close();
