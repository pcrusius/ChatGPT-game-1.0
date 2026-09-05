export type QualityLevel = "low" | "medium" | "high";

export interface QualitySettings {
  level: QualityLevel;
  maxPixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  sceneryDensity: number;
  maxParticles: number;
  speedStreaks: boolean;
  anisotropy: number;
}

const PRESETS: Record<QualityLevel, Omit<QualitySettings, "level">> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    sceneryDensity: 0.45,
    maxParticles: 160,
    speedStreaks: false,
    anisotropy: 1,
  },
  medium: {
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    sceneryDensity: 0.75,
    maxParticles: 320,
    speedStreaks: true,
    anisotropy: 4,
  },
  high: {
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 1536,
    sceneryDensity: 1,
    maxParticles: 480,
    speedStreaks: true,
    anisotropy: 8,
  },
};

export function settingsFor(level: QualityLevel): QualitySettings {
  return { level, ...PRESETS[level] };
}

/**
 * Picks a starting tier from cheap signals. The adaptive monitor below is what actually
 * protects the frame rate; this only avoids opening on a tier that is obviously wrong.
 */
export function detectQuality(): QualityLevel {
  const cores = navigator.hardwareConcurrency ?? 4;
  const dpr = window.devicePixelRatio || 1;
  const pixels = window.innerWidth * window.innerHeight * Math.min(dpr, 1.5) ** 2;

  if (cores <= 4 || pixels > 4_200_000) return "medium";
  if (cores >= 8) return "high";
  return "medium";
}

/**
 * Watches frame time and drops a tier when the game is persistently below target, so a slow
 * machine degrades instead of stuttering. Only ever steps down, to avoid oscillation.
 */
export class AdaptiveQuality {
  private accumulator = 0;
  private frames = 0;
  private slowWindows = 0;
  private enabled = true;

  constructor(
    private level: QualityLevel,
    private readonly onDowngrade: (next: QualityLevel) => void,
  ) {}

  setLevel(level: QualityLevel): void {
    this.level = level;
    this.slowWindows = 0;
    this.accumulator = 0;
    this.frames = 0;
  }

  disable(): void {
    this.enabled = false;
  }

  update(dt: number): void {
    if (!this.enabled || this.level === "low") return;
    this.accumulator += dt;
    this.frames += 1;
    if (this.accumulator < 2) return;

    const avgFps = this.frames / this.accumulator;
    this.accumulator = 0;
    this.frames = 0;

    if (avgFps < 45) {
      this.slowWindows += 1;
      if (this.slowWindows >= 2) {
        const next: QualityLevel = this.level === "high" ? "medium" : "low";
        this.level = next;
        this.slowWindows = 0;
        this.onDowngrade(next);
      }
    } else {
      this.slowWindows = 0;
    }
  }
}
