/**
 * Tiny synthesized sound set (WebAudio, no files). Each sound is rate-limited so rapid repeat hits
 * don't turn into noise, and the total number of voices is capped. Audio starts on the first user
 * gesture (Ready), as browsers require.
 */
import type { SimEvent } from '../physics/sim.ts';

type Voice = { t: number };

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private last = new Map<string, number>();
  private voices: Voice[] = [];

  constructor() {
    try {
      this.muted = localStorage.getItem('bp-muted') === '1';
    } catch {
      /* storage unavailable */
    }
  }

  /** Call from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.32;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('bp-muted', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.32;
  }

  private ok(key: string, minGap: number) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(key) ?? -1) < minGap) return false;
    this.voices = this.voices.filter(v => v.t > now);
    if (this.voices.length > 10) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
    const c = this.ctx!, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.voices.push({ t: t + dur });
  }

  private noise(dur: number, vol: number, hp = 800) {
    const c = this.ctx!, t = c.currentTime;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'highpass';
    f.frequency.value = hp;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    this.voices.push({ t: t + dur });
  }

  onEvent(e: SimEvent) {
    if (!this.ctx) return;
    switch (e.type) {
      case 'bat':
        if (this.ok('bat', 0.05)) {
          this.noise(0.06, 0.9, 1500);
          this.tone(180, 0.08, 'triangle', 0.5);
        }
        break;
      case 'machine':
        if (e.kind === 'bumper' && this.ok('bumper', 0.06)) this.tone(220, 0.09, 'square', 0.18, 0, 140);
        else if ((e.kind === 'target' || e.kind === 'splitter') && this.ok('target', 0.06)) this.tone(660, 0.07, 'triangle', 0.25);
        else if (e.kind === 'jackpot' && this.ok('jackpot', 0.2)) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, i * 0.06));
        else if (e.kind === 'sling' && this.ok('sling', 0.08)) this.tone(300, 0.07, 'sawtooth', 0.12, 0, 520);
        else if (e.kind === 'gate' && this.ok('gate', 0.12)) [880, 1320].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.28, i * 0.05));
        else if (e.kind === 'spinner' && this.ok('spinner', 0.1)) for (let i = 0; i < Math.min(8, e.spins ?? 1); i++) this.tone(1500, 0.025, 'square', 0.06, i * 0.035);
        else if (e.kind === 'lane' && this.ok('lane', 0.1)) this.tone(988, 0.08, 'sine', 0.18);
        break;
      case 'rampGate':
        // the signature reward: bright rising chime
        if (this.ok('rampGate', 0.15)) [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.32, i * 0.055));
        break;
      case 'ramp':
        if (e.phase === 'enter' && this.ok('rampIn', 0.2)) this.tone(200, 0.35, 'sawtooth', 0.08, 0, 600);
        else if (e.phase === 'complete' && this.ok('rampDone', 0.2)) this.tone(440, 0.25, 'triangle', 0.25, 0, 880);
        else if (e.phase === 'land' && this.ok('land', 0.1)) {
          this.tone(110, 0.12, 'sine', 0.5, 0, 60);
          this.noise(0.05, 0.3, 300);
        }
        break;
      case 'scoop':
        if (e.phase === 'catch' && this.ok('catch', 0.2)) {
          this.tone(140, 0.14, 'sine', 0.6, 0, 90);
          [523, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.22, 0.08 + i * 0.07));
        } else if (e.phase === 'eject' && this.ok('eject', 0.2)) this.tone(260, 0.18, 'sawtooth', 0.15, 0, 900);
        break;
      case 'bank':
        if (this.ok('bank', 0.2)) [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, i * 0.07));
        break;
      case 'multiball':
        if (this.ok('multi', 0.3)) [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.14, i * 0.08));
        break;
      case 'drain':
        if (e.strike && this.ok('drain', 0.3)) this.tone(220, 0.5, 'triangle', 0.3, 0, 70);
        break;
    }
  }
}
