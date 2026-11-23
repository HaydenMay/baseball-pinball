/**
 * Tiny synthesized sound set (WebAudio, no files). Each sound is rate-limited so rapid repeat hits
 * don't turn into noise, and the total number of voices is capped. Audio starts on the first user
 * gesture (Ready), as browsers require.
 */
import type { SimEvent } from '../physics/sim.ts';
import type { MomentKind } from './juice.ts';
import { SOUND_SET, type SampleId } from './sound-set.ts';

type Voice = { t: number };

export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private last = new Map<string, number>();
  private voices: Voice[] = [];
  /** Player route: recorded samples (sound-set.ts) replace the synth where one is loaded. */
  useSamples = false;
  /** Base URL of public/ (the app root), set by main.ts. */
  sampleRoot = './';
  private samples = new Map<SampleId, AudioBuffer>();
  private loading = false;

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
    this.loadSamples();
  }

  private loadSamples() {
    if (!this.useSamples || this.loading || !this.ctx) return;
    this.loading = true;
    for (const [id, def] of Object.entries(SOUND_SET) as [SampleId, (typeof SOUND_SET)[SampleId]][]) {
      fetch(this.sampleRoot + 'sounds/' + def.file)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then(b => this.ctx!.decodeAudioData(b))
        .then(buf => this.samples.set(id, buf))
        .catch(() => {
          /* missing or undecodable: that event keeps its synth sound */
        });
    }
  }

  /** Play a recorded sample; false when it isn't loaded (caller falls back to synth) or is rate-limited. */
  play(id: SampleId, rate = 1): boolean {
    const buf = this.samples.get(id);
    if (!buf || !this.ctx) return false;
    const def = SOUND_SET[id];
    if (!this.ok('s-' + id, def.gap)) return true;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * def.vary);
    // samples are mastered loud (-14 LUFS); the synth master is 0.32, so scale to sit with it
    g.gain.value = def.vol * 1.6;
    src.connect(g).connect(this.master!);
    src.start();
    this.voices.push({ t: this.ctx.currentTime + buf.duration });
    return true;
  }

  /** Shop purchase, menu taps, reroll (no sim event). Menu taps and reroll stay silent without samples. */
  ui(id: 'buy' | 'ui' | 'reroll') {
    if (!this.ctx || this.muted) return;
    if (this.play(id)) return;
    if (id === 'buy' && this.ok('buy', 0.15)) [1319, 1760].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.25, i * 0.08));
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
        if (this.play('bat', e.sweet ? 1.12 : 1)) break;
        if (this.ok('bat', 0.05)) {
          // sweet spot: brighter, longer crack (the sound teaches the timing)
          this.noise(e.sweet ? 0.09 : 0.06, e.sweet ? 1 : 0.9, e.sweet ? 2600 : 1500);
          this.tone(e.sweet ? 320 : 180, e.sweet ? 0.12 : 0.08, 'triangle', 0.5);
        }
        break;
      case 'swing':
        // short whoosh: a swing is never silent
        if (this.play('swing')) break;
        if (this.ok('swing', 0.1)) this.noise(0.09, 0.22, 2200);
        break;
      case 'serve':
        // the pitch leaving the mound
        if (this.ok('serve', 0.3)) this.tone(320, 0.06, 'sine', 0.2, 0, 180);
        break;
      case 'deckRally':
        if (e.phase === 'end' && (e.gained ?? 0) > 0 && this.play('rallyEnd')) break;
        if (e.phase === 'end' && (e.gained ?? 0) > 0 && this.ok('rallyEnd', 0.3)) {
          const dings = Math.min(6, Math.max(1, Math.round((e.gained ?? 0) / 1000)));
          for (let i = 0; i < dings; i++) this.tone(1319, 0.08, 'triangle', 0.2, i * 0.07);
        }
        break;
      case 'machine':
        // Upper Deck parts sit above y 0: their bumpers get the higher-pitched punch
        if (e.kind === 'bumper' && this.play(e.y < 0 ? 'deckBumper' : 'bumper')) break;
        if (e.kind === 'sling' && this.play('sling')) break;
        if (e.kind === 'splitter' && this.play('splitter')) break;
        if (e.kind === 'target' && this.play('target')) break;
        if (e.kind === 'jackpot' && this.play('jackpot')) break;
        if (e.kind === 'gate' && this.play('gate')) break;
        if (e.kind === 'lane' && this.play('lane')) break;
        if (e.kind === 'spinner' && this.samples.has('spinner')) {
          for (let i = 0; i < Math.min(6, e.spins ?? 1); i++) setTimeout(() => this.play('spinner'), i * 40);
          break;
        }
        if (e.kind === 'bumper' && this.ok('bumper', 0.06)) this.tone(220, 0.09, 'square', 0.18, 0, 140);
        else if ((e.kind === 'target' || e.kind === 'splitter') && this.ok('target', 0.06)) this.tone(660, 0.07, 'triangle', 0.25);
        else if (e.kind === 'jackpot' && this.ok('jackpot', 0.2)) [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.3, i * 0.06));
        else if (e.kind === 'sling' && this.ok('sling', 0.08)) this.tone(300, 0.07, 'sawtooth', 0.12, 0, 520);
        else if (e.kind === 'gate' && this.ok('gate', 0.12)) [880, 1320].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.28, i * 0.05));
        else if (e.kind === 'spinner' && this.ok('spinner', 0.1)) for (let i = 0; i < Math.min(8, e.spins ?? 1); i++) this.tone(1500, 0.025, 'square', 0.06, i * 0.035);
        else if (e.kind === 'lane' && this.ok('lane', 0.1)) this.tone(988, 0.08, 'sine', 0.18);
        break;
      case 'rampCheckpoint': {
        // sample: the blip climbs a semitone per checkpoint; the finish plays the full-ride flourish
        if (e.index === e.count - 1 ? this.play('ride') : this.play('checkpoint', Math.pow(2, e.index / 12))) break;
        // ascending scale up the ride: each checkpoint one step higher, the finish a full chord
        const f = 523 * Math.pow(2, (e.index * 2) / 12);
        if (e.index === e.count - 1) [f, f * 1.25, f * 1.5, f * 2].forEach((x, i) => this.tone(x, 0.2, 'triangle', 0.3, i * 0.05));
        else this.tone(f, 0.09, 'triangle', 0.26, 0, f * 1.02);
        break;
      }
      case 'rampGate':
        // the signature reward: bright rising chime
        if (this.ok('rampGate', 0.15)) [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.32, i * 0.055));
        break;
      case 'ramp':
        if (e.phase === 'enter' && this.play('ramp')) break;
        if (e.phase === 'complete' && this.play('ride')) break;
        if (e.phase === 'enter' && this.ok('rampIn', 0.2)) this.tone(200, 0.35, 'sawtooth', 0.08, 0, 600);
        else if (e.phase === 'complete' && this.ok('rampDone', 0.2)) this.tone(440, 0.25, 'triangle', 0.25, 0, 880);
        else if (e.phase === 'land' && this.ok('land', 0.1)) {
          this.tone(110, 0.12, 'sine', 0.5, 0, 60);
          this.noise(0.05, 0.3, 300);
        }
        break;
      case 'scoop':
        if (e.phase === 'catch' && this.play('scoop')) break;
        if (e.phase === 'catch' && this.ok('catch', 0.2)) {
          this.tone(140, 0.14, 'sine', 0.6, 0, 90);
          [523, 784].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.22, 0.08 + i * 0.07));
        } else if (e.phase === 'eject' && this.ok('eject', 0.2)) this.tone(260, 0.18, 'sawtooth', 0.15, 0, 900);
        break;
      case 'bank':
        if (this.play('bank')) break;
        if (this.ok('bank', 0.2)) [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, i * 0.07));
        break;
      case 'multiball':
        if (this.play('multiball')) break;
        if (this.ok('multi', 0.3)) [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'sawtooth', 0.14, i * 0.08));
        break;
      case 'mult': {
        // "level up" blip that climbs with the multiplier, so stacking it sounds like progress
        // sample: the power-up rises with the multiplier (×1.1 → ×3.0 climbs about an octave)
        if (this.play('mult', Math.min(2, Math.pow(2, (e.total - 10) / 20)))) break;
        if (!this.ok('mult', 0.08)) break;
        const f = Math.min(1600, 520 * Math.pow(1.06, e.total - 10));
        this.tone(f, 0.09, 'square', 0.1, 0, f * 1.5);
        this.tone(f * 2, 0.14, 'triangle', 0.18, 0.06);
        break;
      }
      case 'runners':
        if (e.phase === 'stranded' && e.onBase > 0) this.play('stranded');
        break;
      case 'drain':
        if (e.strike && this.play('strike')) break;
        if (e.strike && this.ok('drain', 0.3)) this.tone(220, 0.5, 'triangle', 0.3, 0, 70);
        break;
    }
  }

  /** Stingers for big moments (see juice.ts). Synth placeholders until the sample set lands. */
  moment(kind: MomentKind) {
    if (!this.ctx || this.muted) return;
    const arp = (notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.2) => notes.forEach((f, i) => this.tone(f, dur, type, vol, i * step));
    switch (kind) {
      case 'homeRun':
        if (this.play('homeRun')) break;
        // ballpark-organ "charge!" run
        if (this.ok('m-hr', 0.5)) {
          arp([392, 523, 659, 784], 0.11, 'square', 0.12, 0.14);
          this.tone(659, 0.16, 'square', 0.12, 0.5);
          this.tone(784, 0.4, 'square', 0.14, 0.66);
        }
        break;
      case 'runComplete':
        if (this.play('runComplete')) break;
        if (this.play('cleared')) break;
        if (this.ok('m-clear', 0.5)) {
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.3, i * 0.09));
          [523, 659, 784, 1046].forEach(f => this.tone(f, 0.7, 'triangle', 0.16, 0.42));
        }
        break;
      case 'cleared':
        if (this.play('cleared')) break;
        if (this.ok('m-clear', 0.5)) {
          arp([523, 659, 784, 1046], 0.09, 'triangle', 0.3, 0.22);
          [523, 659, 784, 1046].forEach(f => this.tone(f, 0.7, 'triangle', 0.16, 0.42));
        }
        break;
      case 'calledHit':
        if (this.play('calledHit')) break;
        if (this.ok('m-called', 0.4)) [784, 988, 1319].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.25, i * 0.07));
        break;
      case 'calledMiss':
        if (this.play('calledMiss')) break;
        if (this.ok('m-miss', 0.4)) this.tone(330, 0.2, 'triangle', 0.18, 0, 220);
        break;
      case 'driveIn':
        if (this.play('driveIn')) break;
        if (this.ok('m-drive', 0.3)) [523, 784].forEach((f, i) => this.tone(f, 0.12, 'square', 0.14, i * 0.06));
        break;
      case 'hotMove':
        if (this.play('hotMove')) break;
        // the hot spot jumped: two quick rising pings
        if (this.ok('m-hot', 0.5)) [988, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.14, i * 0.08));
        break;
      case 'foul':
        if (this.ok('m-foul', 0.4)) this.tone(600, 0.18, 'sine', 0.25, 0, 900);
        break;
      case 'gameOver':
        if (this.play('gameOver')) break;
        if (this.ok('m-over', 0.5)) arp([392, 370, 349, 262], 0.22, 'triangle', 0.28, 0.3);
        break;
      case 'sweet':
        if (this.play('sweet')) break;
        if (this.ok('m-sweet', 0.2)) this.tone(1568, 0.16, 'sine', 0.2, 0.03);
        break;
      default:
        break; // strike/jackpot/multiball/bank already have event sounds
    }
  }
}
