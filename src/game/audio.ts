/**
 * All audio is synthesised with WebAudio, so the repository carries no sound files and there
 * are no licensing questions. Engine and wind are continuous nodes whose parameters follow the
 * car; one-shots are short envelopes on pooled oscillators.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;

  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSub: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private padOscs: OscillatorNode[] = [];

  private soundOn = true;
  private musicOn = true;
  private started = false;

  get soundEnabled(): boolean {
    return this.soundOn;
  }

  get musicEnabled(): boolean {
    return this.musicOn;
  }

  /** Must be called from a user gesture; browsers block audio otherwise. */
  unlock(): void {
    if (this.started) {
      void this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.started = true;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.soundOn ? 0.85 : 0;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.16 : 0;
    this.musicBus.connect(this.master);

    // Pink-ish noise used by wind, tyres and crashes.
    const length = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.03 * white) / 1.03;
      data[i] = last * 3.2;
    }

    this.buildEngine();
    this.buildWind();
    this.buildPad();
  }

  private buildEngine(): void {
    if (!this.ctx || !this.sfxBus) return;
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 6;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    // Sawtooth for the harmonic edge, a square sub for body.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 70;
    this.engineSub = ctx.createOscillator();
    this.engineSub.type = "square";
    this.engineSub.frequency.value = 35;

    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    this.engineOsc.connect(this.engineFilter);
    this.engineSub.connect(subGain).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
    this.engineOsc.start();
    this.engineSub.start();
  }

  private buildWind(): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.7;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    source.connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);
    source.start();
  }

  /** Slow ambient pad; the "music" toggle controls this bus. */
  private buildPad(): void {
    if (!this.ctx || !this.musicBus) return;
    const ctx = this.ctx;
    const chord = [55, 82.5, 110, 164.8];
    for (const freq of chord) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0.22;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain).connect(gain.gain);
      osc.connect(gain).connect(this.musicBus);
      osc.start();
      lfo.start();
      this.padOscs.push(osc);
    }
  }

  setSound(enabled: boolean): void {
    this.soundOn = enabled;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(enabled ? 0.85 : 0, this.ctx.currentTime, 0.05);
    }
  }

  setMusic(enabled: boolean): void {
    this.musicOn = enabled;
    if (this.musicBus && this.ctx) {
      this.musicBus.gain.setTargetAtTime(enabled ? 0.16 : 0, this.ctx.currentTime, 0.2);
    }
  }

  /** Engine and wind follow speed; `throttle` drops the engine out on menus and crashes. */
  updateDrive(speedRatio: number, throttle: number): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.windGain) return;
    const t = this.ctx.currentTime;
    const rpm = 68 + speedRatio * 128;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineSub?.frequency.setTargetAtTime(rpm * 0.5, t, 0.08);
    this.engineFilter?.frequency.setTargetAtTime(560 + speedRatio * 1500, t, 0.1);
    this.engineGain.gain.setTargetAtTime(throttle * 0.16, t, 0.12);
    this.windGain.gain.setTargetAtTime(throttle * speedRatio * 0.075, t, 0.2);
    this.windFilter?.frequency.setTargetAtTime(420 + speedRatio * 900, t, 0.2);
  }

  private tone(
    freq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.ctx || !this.sfxBus) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), t + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(duration: number, volume: number, freq: number, q = 1): void {
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter).connect(gain).connect(this.sfxBus);
    source.start(t);
    source.stop(t + duration + 0.02);
  }

  coin(streak: number): void {
    const base = 880 * Math.pow(1.0595, Math.min(streak, 12));
    this.tone(base, base * 1.5, 0.13, "triangle", 0.16);
    this.tone(base * 2, base * 3, 0.09, "sine", 0.07, 0.02);
  }

  jump(): void {
    this.tone(240, 520, 0.18, "sawtooth", 0.1);
    this.noise(0.14, 0.06, 900, 0.8);
  }

  land(strength: number): void {
    this.tone(150, 60, 0.22, "square", 0.09 * strength);
    this.noise(0.3, 0.12 * strength, 340, 0.6);
  }

  crash(): void {
    this.noise(0.9, 0.4, 260, 0.4);
    this.noise(0.5, 0.24, 1400, 0.6);
    this.tone(180, 40, 0.7, "sawtooth", 0.2);
  }

  nearMiss(): void {
    this.noise(0.24, 0.14, 1700, 1.6);
  }

  click(): void {
    this.tone(660, 660, 0.05, "square", 0.06);
  }

  purchase(): void {
    this.tone(523, 523, 0.1, "triangle", 0.12);
    this.tone(659, 659, 0.1, "triangle", 0.12, 0.09);
    this.tone(784, 784, 0.18, "triangle", 0.13, 0.18);
  }

  milestone(): void {
    this.tone(740, 1100, 0.16, "triangle", 0.1);
    this.tone(1100, 1480, 0.16, "sine", 0.07, 0.08);
  }
}
