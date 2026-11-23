import { rallyLabel } from '../machines/sections.ts';

/**
 * "Big moment" presentation layer (critic report, Nov 22): hit-stop, slow-mo, screen shake, a full-table
 * flash, a bulb-chase light show and a big readable banner. Presentation only: hit-stop and slow-mo scale
 * how much sim time the main loop feeds the fixed-step physics, they never change the physics itself.
 * Banners are DOM text at a fixed CSS size, so they stay readable however far the camera has zoomed out.
 */

export type MomentKind = 'hotMove' | 'calledHit' | 'calledMiss' | 'driveIn' | 'homeRun' | 'jackpot' | 'multiball' | 'bank' | 'cleared' | 'strike' | 'foul' | 'sweet' | 'gameOver' | 'runComplete';

type MomentDef = {
  /** Banner text (empty = no banner). */
  text: string;
  /** Smaller line under the banner (`{n}` = number passed in). */
  sub?: string;
  /** CSS color role for banner text and table flash. */
  color: string;
  /** 'big' = 44 px, 'mid' = 30 px banner. */
  size: 'big' | 'mid';
  /** Seconds the sim is frozen at the start of the moment. */
  stop: number;
  /** Slow-motion after the freeze: [time scale, seconds]. */
  slow?: [number, number];
  /** Screen shake: amplitude in CSS px, seconds. */
  shake?: [number, number];
  /** Full-table flash peak opacity (0 = none). */
  flash: number;
  /** Seconds of fast rail-bulb chase in `color`. */
  chase: number;
  /** Banner hold in seconds (pop-in and fade are extra). */
  hold: number;
  /** Banner vertical position on the stage (CSS %, default --moment-top). Frequent moments sit low, near the bat. */
  top?: number;
};

export const JUICE = {
  /** Freeze on every bat contact (s). */
  batStop: 0.04,
  /** Flash fade (s) and chase speed multiplier. */
  flashFade: 0.25,
  chaseSpeed: 4,
  /** Pause between an end-of-pitch moment and the card that follows it (ms). */
  beatMs: { cleared: 950, strike: 700, foul: 700, gameOver: 900 },
  /** Reduced Effects: shake off, flash and slow-mo toned down. */
  reducedFlash: 0.4,
  moments: {
    hotMove: { text: 'HOT CORNER', sub: '{label} ×3', color: '#ff4fd8', size: 'mid', stop: 0, flash: 0, chase: 0.7, hold: 0.7, top: 20 },
    calledHit: { text: 'CALLED SHOT!', sub: '×2 THIS PITCH', color: '#5cf6ff', size: 'big', stop: 0.08, shake: [3, 0.16], flash: 0.2, chase: 1.2, hold: 0.7 },
    calledMiss: { text: 'MISSED THE CALL', color: '#9aa7b8', size: 'mid', stop: 0, flash: 0, chase: 0, hold: 0.5, top: 20 },
    driveIn: { text: 'DRIVEN IN!', sub: '+{n}', color: '#9fe870', size: 'mid', stop: 0.05, flash: 0.1, chase: 0.6, hold: 0.45, top: 66 },
    homeRun: { text: 'HOME RUN!', sub: `RALLY ${rallyLabel()} UPSTAIRS`, color: '#ffd36b', size: 'big', stop: 0.1, slow: [0.35, 0.45], shake: [4, 0.2], flash: 0.28, chase: 1.6, hold: 0.9 },
    jackpot: { text: 'JACKPOT!', sub: '+{n}', color: '#ffd36b', size: 'big', stop: 0.09, shake: [3, 0.18], flash: 0.22, chase: 1.3, hold: 0.7 },
    multiball: { text: 'MULTIBALL!', color: '#5fe3ff', size: 'big', stop: 0.1, slow: [0.4, 0.35], shake: [4, 0.2], flash: 0.25, chase: 1.6, hold: 0.8 },
    bank: { text: 'BANK COMPLETE', sub: '+{n}', color: '#ff7ad9', size: 'mid', stop: 0.07, shake: [2, 0.14], flash: 0.16, chase: 1.0, hold: 0.6 },
    cleared: { text: 'CLEARED!', color: '#ffd36b', size: 'big', stop: 0.12, slow: [0.3, 0.5], shake: [3, 0.2], flash: 0.3, chase: 1.8, hold: 0.8 },
    strike: { text: 'STRIKE {n}', color: '#ff5a5a', size: 'big', stop: 0, flash: 0.18, chase: 0, hold: 0.5 },
    foul: { text: 'FOUL BALL', sub: 'NO STRIKE · RE-PITCH', color: '#9fe870', size: 'big', stop: 0, flash: 0.12, chase: 0, hold: 0.55 },
    sweet: { text: 'SWEET SPOT!', sub: '+{n}', color: '#5fe3ff', size: 'mid', stop: 0.07, shake: [2, 0.12], flash: 0, chase: 0, hold: 0.35, top: 66 },
    gameOver: { text: 'STRIKE THREE', color: '#ff5a5a', size: 'big', stop: 0, shake: [3, 0.2], flash: 0.22, chase: 0, hold: 0.7 },
    runComplete: { text: 'RUN COMPLETE!', color: '#ffd36b', size: 'big', stop: 0.12, slow: [0.3, 0.6], shake: [4, 0.25], flash: 0.32, chase: 2.4, hold: 1.0 },
  } satisfies Record<MomentKind, MomentDef>,
};

export class Juice {
  /** Reduced Effects setting (no shake, softer flash). */
  reduced = false;
  /** Fast bulb chase for the renderer: color and seconds left. */
  chase: { color: string; left: number } | null = null;
  private stopLeft = 0;
  private slow: { scale: number; left: number } | null = null;
  private shake: { amp: number; left: number; max: number } | null = null;
  private flashEl: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private shakeEl: HTMLElement;
  private bannerTimer = 0;

  constructor(stage: HTMLElement, shakeTarget: HTMLElement) {
    this.shakeEl = shakeTarget;
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'table-flash';
    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'moment';
    this.bannerEl.hidden = true;
    this.bannerEl.setAttribute('aria-live', 'polite');
    stage.append(this.flashEl, this.bannerEl);
  }

  /** How much sim time to advance for `dt` real seconds (0 during hit-stop). */
  timeScale() {
    if (this.stopLeft > 0) return 0;
    return this.slow ? this.slow.scale : 1;
  }

  /** Short freeze (bat contact). */
  hitStop(s = JUICE.batStop) {
    this.stopLeft = Math.max(this.stopLeft, s);
  }

  play(kind: MomentKind, n?: number, label = '') {
    const d: MomentDef = JUICE.moments[kind];
    const fill = (s: string) => s.replace('{n}', n === undefined ? '' : n.toLocaleString()).replace('{label}', label);
    if (d.stop) this.hitStop(d.stop);
    if (d.slow) this.slow = { scale: this.reduced ? Math.max(d.slow[0], 0.6) : d.slow[0], left: d.slow[1] + d.stop };
    if (d.shake && !this.reduced) this.shake = { amp: d.shake[0], left: d.shake[1], max: d.shake[1] };
    if (d.flash) this.flash(d.color, d.flash * (this.reduced ? JUICE.reducedFlash : 1));
    if (d.chase) this.chase = { color: d.color, left: d.chase };
    if (d.text) this.banner(fill(d.text), d.sub ? fill(d.sub) : '', d.color, d.size, d.hold, d.top);
  }

  /** Advance with real (unscaled) frame time. */
  update(dt: number) {
    if (this.stopLeft > 0) this.stopLeft = Math.max(0, this.stopLeft - dt);
    else if (this.slow && (this.slow.left -= dt) <= 0) this.slow = null;
    if (this.chase && (this.chase.left -= dt) <= 0) this.chase = null;
    if (this.shake) {
      this.shake.left -= dt;
      if (this.shake.left <= 0) {
        this.shake = null;
        this.shakeEl.style.transform = '';
      } else {
        const a = this.shake.amp * (this.shake.left / this.shake.max);
        this.shakeEl.style.transform = `translate(${((Math.random() * 2 - 1) * a).toFixed(1)}px, ${((Math.random() * 2 - 1) * a).toFixed(1)}px)`;
      }
    }
  }

  /** A card is opening: take any banner down at once so it never overlaps the card. */
  hideBanner() {
    clearTimeout(this.bannerTimer);
    this.bannerEl.hidden = true;
    this.bannerEl.classList.remove('show', 'out');
  }

  /** Drop everything in flight (new pitch, title, pause). */
  reset() {
    this.stopLeft = 0;
    this.slow = null;
    this.shake = null;
    this.chase = null;
    this.shakeEl.style.transform = '';
    this.bannerEl.hidden = true;
    clearTimeout(this.bannerTimer);
  }

  private flash(color: string, alpha: number) {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = String(alpha);
    void el.offsetWidth;
    el.style.transition = `opacity ${JUICE.flashFade}s ease-out`;
    el.style.opacity = '0';
  }

  private banner(text: string, sub: string, color: string, size: 'big' | 'mid', hold: number, top?: number) {
    const el = this.bannerEl;
    clearTimeout(this.bannerTimer);
    el.className = `moment ${size}`;
    el.style.setProperty('--moment-color', color);
    el.style.top = top === undefined ? '' : `${top}%`;
    el.innerHTML = `<b></b>${sub ? '<small></small>' : ''}`;
    el.querySelector('b')!.textContent = text;
    if (sub) el.querySelector('small')!.textContent = sub;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('show');
    this.bannerTimer = window.setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('out');
      this.bannerTimer = window.setTimeout(() => (el.hidden = true), 300);
    }, (hold + 0.25) * 1000);
  }
}
