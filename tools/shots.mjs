// Captures screenshots of the game at a scripted set of states.
//   node tools/shots.mjs <url> <outDir> [state=...]
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
      quality: "high",
      missions: {},
      claimed: [],
    }),
  ),
);
await page.reload({ waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));

const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`shot ${name}`);
};

await shot("01_menu");

await page.evaluate(() => window.__APEX__.openGarage());
await new Promise((r) => setTimeout(r, 2500));
await shot("02_garage_crimson");
await page.evaluate(() => {
  document.querySelectorAll("#skin-swatches .swatch")[3].click();
});
await new Promise((r) => setTimeout(r, 2500));
await shot("03_garage_gold");

await page.evaluate(() => window.__APEX__.startRun());
await new Promise((r) => setTimeout(r, 4000));
await shot("04_coastal");

for (const [theme, name] of [
  ["coastal", "05_coastal_far"],
  ["desert", "06_desert"],
  ["night", "07_night"],
]) {
  await page.evaluate((t) => window.__APEX__.game.forceTheme(t), theme);
  await new Promise((r) => setTimeout(r, 4500));
  await shot(name);
}

await page.evaluate(() => window.__APEX__.game.input("jump"));
await new Promise((r) => setTimeout(r, 500));
await shot("08_jump");

console.log(errors.length ? `\nERRORS:\n${errors.join("\n")}` : "\nno console errors");
await browser.close();
