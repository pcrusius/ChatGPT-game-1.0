// Fast iteration helper: garage close-ups of the player car from a few angles.
//   node tools/car.mjs <url> <outDir> [skinIndex]
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:4173/";
const outDir = process.argv[3] ?? "/tmp/car";
const skinIndex = Number(process.argv[4] ?? 0);
mkdirSync(outDir, { recursive: true });

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
await page.setViewport({ width: 1100, height: 620, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`CONSOLE ${m.text()}`));

await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() =>
  localStorage.setItem(
    "apex-rush-save-v2",
    JSON.stringify({
      coins: 900,
      purchasedSkins: ["red", "blue", "black", "gold"],
      selectedSkin: "red",
      quality: "high",
      missions: {},
      claimed: [],
    }),
  ),
);
await page.reload({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1800));

// Park the car and drive the camera by hand so each angle is reproducible.
await page.evaluate((skin) => {
  const api = window.__APEX__;
  // Through the UI, so the skin swatches exist and a chosen skin is applied for real.
  api.openGarage();
  const swatches = document.querySelectorAll("#skin-swatches .swatch");
  if (skin > 0) swatches[skin].click();
  api.game.forceTheme("coastal");
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  document.getElementById("hud").classList.add("hidden");
}, skinIndex);
await new Promise((r) => setTimeout(r, 1200));

const angles = [
  { name: "front34", pos: [-6.2, 2.0, -6.4], look: [2.4, 0.62, 0] },
  { name: "rear34", pos: [8.6, 2.2, 5.6], look: [2.4, 0.62, 0] },
  { name: "side", pos: [2.4, 1.35, 8.4], look: [2.4, 0.62, 0] },
  { name: "front", pos: [2.4, 1.15, -8.2], look: [2.4, 0.6, 0] },
  { name: "top34", pos: [-4.4, 5.2, -5.2], look: [2.4, 0.5, 0] },
];

for (const angle of angles) {
  await page.evaluate((a) => {
    const cam = window.__APEX__.game.rig.camera;
    window.__APEX__.game.rig.setMode("frozen");
    cam.position.set(...a.pos);
    cam.lookAt(...a.look);
    cam.fov = 34;
    cam.updateProjectionMatrix();
  }, angle);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${outDir}/${angle.name}.png` });
  console.log(`shot ${angle.name}`);
}

console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "no console errors");
await browser.close();
