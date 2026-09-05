import * as THREE from "three";

/**
 * Procedural textures. Everything is generated once on a canvas at boot, which keeps the repo
 * free of binary assets and lets the highway surface bake its own lane markings.
 */

function canvas(size: number, height = size): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement("canvas");
  el.width = size;
  el.height = height;
  const ctx = el.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  return [el, ctx];
}

/** Deterministic hash noise so textures are identical on every load. */
function hash(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 69069;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    amp *= 0.5;
    freq *= 2;
  }
  return value;
}

/**
 * The full highway surface in one tile: asphalt, worn wheel tracks, dashed lane lines, solid
 * edge lines, rumble strips and gravel shoulders. Baking the markings means they scroll with
 * the asphalt and can never gap or pop between segments.
 */
export interface RoadTextureLayout {
  /** World metres spanned horizontally by the texture (road + both shoulders). */
  totalWidth: number;
  /** World metres spanned vertically by one tile. */
  tileLength: number;
  roadWidth: number;
  laneWidth: number;
  laneCount: number;
  shoulderWidth: number;
}

export function makeRoadTexture(layout: RoadTextureLayout, resolution = 1024): THREE.Texture {
  const [el, ctx] = canvas(resolution, resolution);
  const { totalWidth, tileLength, roadWidth, laneWidth, laneCount } = layout;
  const pxPerMX = resolution / totalWidth;
  const pxPerMY = resolution / tileLength;
  const toU = (x: number) => (x + totalWidth / 2) * pxPerMX;

  const halfRoad = roadWidth / 2;
  const laneEdge = (laneWidth * laneCount) / 2;

  // Asphalt base with fine grain plus wide tonal drift.
  const image = ctx.createImageData(resolution, resolution);
  const data = image.data;
  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const worldX = x / pxPerMX - totalWidth / 2;
      const i = (y * resolution + x) * 4;
      const grain = fbm(x * 0.22, y * 0.22, 7, 3);
      const drift = fbm(x * 0.012, y * 0.012, 21, 3);
      let r: number;
      let g: number;
      let b: number;
      if (Math.abs(worldX) <= halfRoad) {
        // Slightly warm mid grey; darker in the wheel tracks of each lane.
        let base = 92 + drift * 26 + grain * 30;
        for (let lane = 0; lane < laneCount; lane++) {
          const centre = (lane - (laneCount - 1) / 2) * laneWidth;
          const track = Math.min(
            Math.abs(worldX - (centre - 0.78)),
            Math.abs(worldX - (centre + 0.78)),
          );
          if (track < 0.42) base -= (1 - track / 0.42) * 16;
        }
        r = base * 1.02;
        g = base;
        b = base * 1.04;
      } else {
        // Compacted gravel shoulder.
        const base = 118 + drift * 30 + grain * 46;
        r = base * 1.06;
        g = base * 0.98;
        b = base * 0.84;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Sealed crack repairs, kept small and high frequency so tiling stays unobtrusive.
  ctx.strokeStyle = "rgba(62,62,66,0.3)";
  ctx.lineWidth = Math.max(1, pxPerMX * 0.035);
  for (let i = 0; i < 34; i++) {
    const sx = toU(-halfRoad + hash(i, 3, 91) * roadWidth);
    const sy = hash(i, 9, 13) * resolution;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    let cx = sx;
    let cy = sy;
    for (let s = 0; s < 3; s++) {
      cx += (hash(i, s, 55) - 0.5) * pxPerMX * 0.5;
      cy += (hash(i, s, 77) - 0.4) * pxPerMY * 0.5;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Rumble strips outboard of the solid edge lines.
  const rumbleInner = halfRoad - 0.62;
  for (const side of [-1, 1]) {
    const x0 = toU(side < 0 ? -halfRoad : rumbleInner);
    const w = 0.62 * pxPerMX;
    const period = 0.24 * pxPerMY;
    for (let y = 0; y < resolution; y += period) {
      ctx.fillStyle = "rgba(46,46,50,0.42)";
      ctx.fillRect(x0, y, w, period * 0.4);
      ctx.fillStyle = "rgba(158,158,163,0.13)";
      ctx.fillRect(x0, y + period * 0.4, w, period * 0.22);
    }
  }

  // Solid edge lines.
  ctx.fillStyle = "#e9edf2";
  const edgeW = 0.18 * pxPerMX;
  for (const side of [-1, 1]) {
    ctx.fillRect(toU(side * laneEdge) - edgeW / 2, 0, edgeW, resolution);
  }

  // Dashed lane dividers: three whole cycles per tile so the seam is invisible.
  const dashW = 0.18 * pxPerMX;
  const cycles = 3;
  const cyclePx = resolution / cycles;
  const dashPx = cyclePx * 0.52;
  for (let lane = 1; lane < laneCount; lane++) {
    const x = (lane - laneCount / 2) * laneWidth;
    for (let c = 0; c < cycles; c++) {
      const y = c * cyclePx + (cyclePx - dashPx) / 2;
      ctx.fillRect(toU(x) - dashW / 2, y, dashW, dashPx);
    }
  }

  // Weather the paint so it does not read as freshly printed vector art.
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 900; i++) {
    const x = hash(i, 1, 401) * resolution;
    const y = hash(i, 2, 402) * resolution;
    ctx.fillStyle = `rgba(90,92,96,${0.05 + hash(i, 3, 403) * 0.2})`;
    ctx.fillRect(x, y, 2 + hash(i, 4, 404) * 5, 2 + hash(i, 5, 405) * 5);
  }
  ctx.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Tangent-space normal map derived from noise; gives asphalt and terrain a bit of tooth. */
export function makeNoiseNormal(size = 256, strength = 1.6, scale = 0.09): THREE.Texture {
  const [el, ctx] = canvas(size);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const height = (x: number, y: number) =>
    fbm(((x + size) % size) * scale, ((y + size) % size) * scale, 3, 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (height(x + 1, y) - height(x - 1, y)) * strength;
      const dy = (height(x, y + 1) - height(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Emissive window grid for the night skyline. Lit cells are irregular on purpose. */
export function makeWindowTexture(size = 256): THREE.Texture {
  const [el, ctx] = canvas(size);
  ctx.fillStyle = "#05070f";
  ctx.fillRect(0, 0, size, size);
  const cols = 8;
  const rows = 16;
  const cw = size / cols;
  const rh = size / rows;
  const palette = ["#ffd9a0", "#ffe9c4", "#a8d8ff", "#cfe6ff", "#ffb877"];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = hash(c, r, 133) > 0.42;
      if (!lit) continue;
      ctx.fillStyle = palette[Math.floor(hash(c, r, 17) * palette.length)];
      ctx.globalAlpha = 0.55 + hash(c, r, 29) * 0.45;
      ctx.fillRect(c * cw + cw * 0.22, r * rh + rh * 0.22, cw * 0.56, rh * 0.44);
    }
  }
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(el);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft round sprite used by particles and by every fake light bloom in the game. */
export function makeGlowTexture(size = 128, hardness = 0.16): THREE.Texture {
  const [el, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * hardness, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(0.7, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Vertical light shaft for headlight cones and neon bars. */
export function makeStreakTexture(size = 128): THREE.Texture {
  const [el, ctx] = canvas(size);
  const g = ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const fade = ctx.createLinearGradient(0, 0, 0, size);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Stylised foliage card: a blob of leaves with soft alpha, used for distant vegetation. */
export function makeFoliageTexture(size = 128): THREE.Texture {
  const [el, ctx] = canvas(size);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const a = hash(i, 1, 900) * Math.PI * 2;
    const r = Math.pow(hash(i, 2, 901), 0.6) * size * 0.42;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r * 0.85;
    const rad = size * (0.05 + hash(i, 3, 902) * 0.07);
    const shade = 120 + hash(i, 4, 903) * 90;
    ctx.fillStyle = `rgba(${Math.floor(shade * 0.42)},${Math.floor(shade)},${Math.floor(shade * 0.5)},0.95)`;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(el);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export { fbm as noise2d };
