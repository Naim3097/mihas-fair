// Sounds for the hall, made on the spot from oscillators and filtered noise: nothing to download, nothing to
// license, and everything in tune with everything else. Same rules as Mission X's sfx.ts: silent until the
// player has touched the page, quiet by design, and a failing sound is never worth an error.
export type Sound = 'step' | 'jump' | 'land' | 'swing' | 'hit' | 'crit' | 'hurt' | 'dodge' | 'dash' | 'cast' | 'ultimate' | 'slam' | 'projectile' | 'impact' | 'heal' | 'shield' | 'kill' | 'death' | 'levelup' | 'denied' | 'slowmo' | 'slowmo-end' | 'lock' | 'blocked';

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<Sound, number>();
  muted = false;

  /** Called from the first gesture: from then on sounds may play. Safe to call again. */
  unlock(): void {
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 4;
        this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
        this.master.connect(comp).connect(this.ctx.destination);
        const len = Math.floor(this.ctx.sampleRate * 1.2);
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch { this.ctx = null; }
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { if (!this.muted) void this.ctx?.resume(); }

  play(name: Sound, power = 1): void {
    const c = this.ctx, out = this.master;
    if (this.muted || !c || !out || c.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last.get(name) ?? 0) < 45) return;
    this.last.set(name, now);
    const t = c.currentTime + 0.003, p = Math.max(0.2, Math.min(2, power));
    try {
      switch (name) {
        case 'step': this.noise(t, 0.05, 0.05 * p, 'lowpass', 700, 0.7); break;
        case 'jump': this.tone(t, 240, 520, 0.13, 0.05, 'sine'); break;
        case 'land': this.tone(t, 110, 45, 0.16, 0.12 * p, 'sine'); this.noise(t, 0.07, 0.06 * p, 'lowpass', 500); break;
        case 'swing': this.noise(t, 0.14, 0.07, 'bandpass', 700, 1.2, 2600); break;
        case 'hit': this.noise(t, 0.08, 0.13, 'lowpass', 1600); this.tone(t, 160, 60, 0.11, 0.1, 'sine'); break;
        case 'crit': this.noise(t, 0.1, 0.16, 'lowpass', 2200); this.tone(t, 170, 50, 0.16, 0.12, 'sine'); this.tone(t + 0.02, 1400, 900, 0.14, 0.06, 'triangle'); break;
        case 'hurt': this.tone(t, 130, 70, 0.22, 0.09, 'sawtooth'); this.noise(t, 0.09, 0.08, 'lowpass', 900); break;
        case 'blocked': this.tone(t, 880, 660, 0.12, 0.06, 'triangle'); this.noise(t, 0.05, 0.05, 'highpass', 2000); break;
        case 'dodge': this.noise(t, 0.2, 0.05, 'highpass', 1200); break;
        case 'dash': this.noise(t, 0.24, 0.09, 'bandpass', 500, 1, 3200); this.tone(t, 300, 900, 0.18, 0.03, 'sine'); break;
        case 'cast': this.tone(t, 660, 660, 0.3, 0.04, 'sine'); this.tone(t, 664, 664, 0.3, 0.04, 'sine'); this.tone(t, 880, 1320, 0.25, 0.04, 'triangle'); break;
        case 'ultimate':
          for (const f of [130.8, 164.8, 196]) this.tone(t, f, f, 1.3, 0.06, 'sawtooth', 900);
          this.tone(t, 55, 55, 0.9, 0.12, 'sine'); this.noise(t, 1.0, 0.07, 'bandpass', 300, 0.6, 2400);
          break;
        case 'slam': this.tone(t, 75, 28, 0.45, 0.22 * p, 'sine'); this.noise(t, 0.35, 0.16 * p, 'lowpass', 320); break;
        case 'projectile': this.tone(t, 900, 1500, 0.09, 0.035, 'triangle'); break;
        case 'impact': this.noise(t, 0.07, 0.08, 'bandpass', 2000, 1); this.tone(t, 500, 200, 0.08, 0.04, 'sine'); break;
        case 'heal': [523.3, 659.3, 784].forEach((f, i) => this.tone(t + i * 0.09, f, f, 0.35, 0.045, 'sine')); break;
        case 'shield': this.tone(t, 392, 440, 0.35, 0.05, 'triangle'); this.tone(t + 0.05, 587, 587, 0.3, 0.03, 'sine'); break;
        case 'kill': this.tone(t, 880, 220, 0.28, 0.06, 'triangle'); this.noise(t, 0.12, 0.07, 'lowpass', 1200); break;
        case 'death': this.tone(t, 220, 55, 0.9, 0.1, 'sawtooth', 1200); this.noise(t, 0.3, 0.06, 'lowpass', 400); break;
        case 'levelup': [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(t + i * 0.1, f, f, i === 3 ? 0.7 : 0.3, 0.07, 'triangle')); break;
        case 'denied': this.tone(t, 200, 200, 0.07, 0.05, 'square'); this.tone(t + 0.1, 180, 180, 0.09, 0.05, 'square'); break;
        case 'slowmo': this.tone(t, 440, 110, 0.7, 0.06, 'sine'); break;
        case 'slowmo-end': this.tone(t, 110, 440, 0.4, 0.05, 'sine'); break;
        case 'lock': this.tone(t, 1000, 1000, 0.05, 0.04, 'sine'); this.tone(t + 0.06, 1300, 1300, 0.06, 0.04, 'sine'); break;
      }
    } catch { /* a sound that fails is not worth a word */ }
  }

  private tone(at: number, from: number, to: number, dur: number, gain: number, type: Wave, lowpass?: number): void {
    const c = this.ctx!, osc = c.createOscillator(), env = c.createGain();
    osc.type = type; osc.frequency.setValueAtTime(from, at);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur * 0.9);
    env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(gain, at + 0.01); env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc;
    if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; osc.connect(f); node = f; }
    node.connect(env).connect(this.master!);
    osc.start(at); osc.stop(at + dur + 0.03);
  }

  private noise(at: number, dur: number, gain: number, type: BiquadFilterType, freq: number, q = 0.8, sweepTo?: number): void {
    const c = this.ctx!, src = c.createBufferSource(), f = c.createBiquadFilter(), env = c.createGain();
    src.buffer = this.noiseBuf; src.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, at); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    env.gain.setValueAtTime(0.0001, at); env.gain.exponentialRampToValueAtTime(gain, at + 0.008); env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(env).connect(this.master!);
    src.start(at); src.stop(at + dur + 0.03);
  }

  dispose(): void { void this.ctx?.close(); this.ctx = null; }
}
