/**
 * Procedural sound engine using the Web Audio API — no external assets.
 * All sounds are synthesized from oscillators + gain envelopes.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private musicTimer: number | null = null;
  private musicStep = 0;

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.5 : 0;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    when = 0,
    slideTo?: number,
  ): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, gain: number, when = 0): void {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t0 = this.ctx.currentTime + when;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 800;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  move(): void {
    this.tone(220, 0.05, "square", 0.06);
  }

  rotate(): void {
    this.tone(330, 0.07, "triangle", 0.1, 0, 440);
  }

  lock(): void {
    this.tone(160, 0.08, "sine", 0.12, 0, 90);
    this.noise(0.05, 0.05);
  }

  hardDrop(): void {
    this.tone(180, 0.12, "sawtooth", 0.14, 0, 60);
    this.noise(0.12, 0.12);
  }

  hold(): void {
    this.tone(400, 0.09, "sine", 0.1, 0, 620);
  }

  clear(count: number): void {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < Math.min(count + 1, 4); i++) {
      this.tone(notes[i] as number, 0.14, "triangle", 0.14, i * 0.05);
    }
    if (count >= 4) this.tone(1319, 0.3, "sine", 0.16, 0.2);
  }

  tSpin(): void {
    const notes = [600, 750, 900, 1200];
    notes.forEach((n, i) => this.tone(n, 0.12, "square", 0.1, i * 0.04));
  }

  levelUp(): void {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => this.tone(n, 0.16, "triangle", 0.14, i * 0.08));
  }

  gameOver(): void {
    const notes = [440, 392, 349, 262];
    notes.forEach((n, i) => this.tone(n, 0.3, "sawtooth", 0.12, i * 0.16));
  }

  /** Simple looping arpeggio background music. */
  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const scale = [261.63, 311.13, 349.23, 392.0, 466.16, 523.25, 622.25];
    const pattern = [0, 2, 4, 2, 5, 4, 2, 1];
    const step = (): void => {
      if (!this.enabled) return;
      const idx = pattern[this.musicStep % pattern.length] as number;
      const base = scale[idx] as number;
      this.tone(base, 0.22, "triangle", 0.05);
      if (this.musicStep % 4 === 0) this.tone(base / 2, 0.4, "sine", 0.05);
      this.musicStep++;
    };
    this.musicTimer = window.setInterval(step, 260);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
