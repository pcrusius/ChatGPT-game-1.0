import type * as THREE from "three";

/** F3 overlay: frame timing plus the renderer statistics that matter for draw-call budgets. */
export class DebugOverlay {
  private readonly element: HTMLDivElement;
  private visible = false;
  private accumulator = 0;
  private frames = 0;
  private worst = 0;
  private fps = 0;
  private worstShown = 0;

  constructor() {
    this.element = document.createElement("div");
    this.element.id = "debug-overlay";
    this.element.style.display = "none";
    document.body.appendChild(this.element);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.element.style.display = this.visible ? "block" : "none";
  }

  update(dt: number, renderer: THREE.WebGLRenderer, extra: Record<string, string | number>): void {
    this.frames += 1;
    this.accumulator += dt;
    this.worst = Math.max(this.worst, dt);
    if (this.accumulator >= 0.5) {
      this.fps = this.frames / this.accumulator;
      this.worstShown = this.worst;
      this.accumulator = 0;
      this.frames = 0;
      this.worst = 0;
    }
    if (!this.visible) return;

    const info = renderer.info;
    const rows = [
      `FPS ${this.fps.toFixed(0)}  (${(1000 / Math.max(this.fps, 0.001)).toFixed(1)} ms)`,
      `worst ${(this.worstShown * 1000).toFixed(1)} ms`,
      `draw calls ${info.render.calls}`,
      `triangles ${info.render.triangles.toLocaleString()}`,
      `geometries ${info.memory.geometries}  textures ${info.memory.textures}`,
      `programs ${info.programs?.length ?? 0}`,
      `pixel ratio ${renderer.getPixelRatio().toFixed(2)}`,
      ...Object.entries(extra).map(([k, v]) => `${k} ${v}`),
    ];
    this.element.textContent = rows.join("\n");
  }

  get currentFps(): number {
    return this.fps;
  }
}
