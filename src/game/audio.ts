export class AudioFx {
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    return this.ctx;
  }

  resume(): void {
    void this.ensure()?.resume();
  }

  private beep(freq: number, duration: number, type: OscillatorType, gain = 0.05): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  coin(): void {
    this.beep(980, 0.08, "triangle", 0.04);
    this.beep(1320, 0.1, "sine", 0.03);
  }

  jump(): void {
    this.beep(220, 0.12, "square", 0.03);
  }

  crash(): void {
    this.beep(80, 0.35, "sawtooth", 0.07);
    this.beep(140, 0.22, "square", 0.04);
  }
}
