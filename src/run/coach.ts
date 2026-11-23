/**
 * First-time teaching (1.0 scope #8): short, skippable hints shown the first time each idea comes up.
 * Seen tips persist per device (`bp-tips`); Settings can turn tips off or show them again.
 *
 * In play (non-blocking, never pauses the game, never over the upper table):
 *   controls: first pitches: "DRAG to move" (left half) / "TAP to swing" (right half) under the batter.
 *             Each half fades once used; done after both, after the first hit, or after `controlsMaxPitches`.
 * On the next card between pitches (critic: mid-play toasts covered the top bumpers):
 *   aim:      after the first hit: early pulls left, late pushes right, sweet spot.
 *   deck:     once the Upper Deck is on the table: where the Home Run ramp is and what it pays.
 * In the build panel (a dismissible banner): draft (Power), shop (money, tap to preview).
 */
import type { Store } from './save.ts';
import { rallyLabel } from '../machines/sections.ts';

export type TipId = 'controls' | 'aim' | 'deck' | 'draft' | 'shop';

export const COACH = {
  key: 'bp-tips',
  /** Give up on the controls hint after this many pitches (the player clearly found their own way). */
  controlsMaxPitches: 3,
  /** Fade time for hints, ms (matches --coach-fade in style.css). */
  fadeMs: 350,
};

/** Player-facing copy. Small HTML allowed (<b>). */
export const TIPS = {
  controls: {
    left: 'DRAG',
    leftSub: 'left thumb · move',
    right: 'TAP',
    rightSub: 'right thumb · swing',
    keys: '<b>A / D</b> or <b>← →</b> to move · <b>SPACE</b> to swing',
  },
  aim: '<b>AIMING:</b> swing <b>early</b> to pull the ball left, <b>late</b> to push it right. Nail the middle for a <b>SWEET SPOT</b> bonus.',
  deck: `<b>NEW: THE UPPER DECK.</b> Send the ball into the <b>HOME RUN</b> ramp on the right for 3,000 points and <b>${rallyLabel()}</b> on everything upstairs.`,
  draft: '<b>POWER ⚡</b> is your table’s budget: machines use it, boosts don’t. Tap a card to see where it goes.',
  shop: 'Spend <b>$</b> on boosts. Tap a card to see what it powers up on the table. Money you don’t spend carries over.',
};

/** Which tips this device has already seen (pure; storage injected for tests). */
export class TipBook {
  private seen = new Set<string>();
  enabled = true;
  private store: Store | null;
  constructor(store: Store | null = null) {
    this.store = store;
    try {
      const raw = store?.get(COACH.key);
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') this.seen.add(id);
    } catch {
      /* unreadable: start fresh, tips are harmless */
    }
  }
  shouldShow(id: TipId) {
    return this.enabled && !this.seen.has(id);
  }
  has(id: TipId) {
    return this.seen.has(id);
  }
  mark(id: TipId) {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.persist();
  }
  /** "Show tips again". */
  reset() {
    this.seen.clear();
    this.persist();
  }
  private persist() {
    try {
      this.store?.set(COACH.key, JSON.stringify([...this.seen]));
    } catch {
      /* private mode: tips last for this visit */
    }
  }
}

/** Controls-hint progress for one session (pure, testable). */
export class ControlsLesson {
  moved = false;
  swung = false;
  pitches = 0;
  done = false;
  pitch() {
    this.pitches++;
    if (this.pitches > COACH.controlsMaxPitches) this.done = true;
  }
  move() {
    this.moved = true;
    this.check();
  }
  swing() {
    this.swung = true;
    this.check();
  }
  hit() {
    this.done = true;
  }
  private check() {
    if (this.moved && this.swung) this.done = true;
  }
}

/** In-play hint layer over the playfield (pointer-events: none; never blocks input). */
export class Coach {
  readonly book: TipBook;
  private el: HTMLDivElement;
  private ctl: HTMLDivElement;
  private lesson = new ControlsLesson();
  private live = false;
  /** The player has hit the ball, so the aim tip is ready for the next card. */
  private aimEarned = false;
  private touch: boolean;

  constructor(stage: HTMLElement, book: TipBook) {
    this.book = book;
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.el = document.createElement('div');
    this.el.className = 'coach';
    this.el.setAttribute('aria-live', 'polite');
    const c = TIPS.controls;
    this.ctl = document.createElement('div');
    this.ctl.className = `coach-controls ${this.touch ? 'touch' : 'keys'}`;
    this.ctl.innerHTML = this.touch
      ? `<div class="coach-half l"><b>${c.left}</b><span class="coach-arrows">◀ ▶</span><small>${c.leftSub}</small></div><div class="coach-half r"><b>${c.right}</b><span class="coach-ring"></span><small>${c.rightSub}</small></div>`
      : `<div class="coach-pill">${c.keys}</div>`;
    this.ctl.hidden = true;
    this.el.append(this.ctl);
    stage.appendChild(this.el);
  }

  /** A pitch just started (READY pressed). */
  onPitch(deckOpen: boolean) {
    this.live = true;
    if (this.book.shouldShow('controls') && !this.lesson.done) {
      this.lesson.pitch();
      if (this.lesson.done) this.book.mark('controls');
      else this.showControls();
    }
  }
  onMove() {
    if (!this.live || this.ctl.hidden || this.lesson.moved) return;
    this.lesson.move();
    this.ctl.querySelector('.l')?.classList.add('done');
    this.afterControls();
  }
  onSwing() {
    if (!this.live || this.ctl.hidden || this.lesson.swung) return;
    this.lesson.swing();
    this.ctl.querySelector('.r')?.classList.add('done');
    this.afterControls();
  }
  onHit() {
    if (!this.live) return;
    if (!this.ctl.hidden || this.book.shouldShow('controls')) {
      this.lesson.hit();
      this.afterControls();
    }
    if (this.book.shouldShow('aim')) this.aimEarned = true;
  }

  /**
   * Tips that used to pop up over the table mid-play now ride on the next card between pitches:
   * the aim tip after the first hit, the Upper Deck tip once the deck is on the table. One per card.
   */
  cardTip(deckOpen: boolean): string {
    if (this.aimEarned && this.book.shouldShow('aim')) {
      this.book.mark('aim');
      return TIPS.aim;
    }
    if (deckOpen && this.book.shouldShow('deck')) {
      this.book.mark('deck');
      return TIPS.deck;
    }
    return '';
  }
  /** Pitch ended, paused, overlay or title shown: tuck everything away (unfinished lessons resume next pitch). */
  pause() {
    this.live = false;
    this.fade(this.ctl);
  }
  /** Settings changed (tips off, or shown again). */
  refresh() {
    if (!this.book.enabled) this.pause();
    else if (this.book.shouldShow('controls')) this.lesson = new ControlsLesson();
  }

  private showControls() {
    this.ctl.querySelectorAll('.done').forEach(n => n.classList.remove('done'));
    if (this.lesson.moved) this.ctl.querySelector('.l')?.classList.add('done');
    if (this.lesson.swung) this.ctl.querySelector('.r')?.classList.add('done');
    this.ctl.classList.remove('out');
    this.ctl.hidden = false;
  }
  private afterControls() {
    if (!this.lesson.done) return;
    this.book.mark('controls');
    this.fade(this.ctl);
  }
  private fade(el: HTMLElement) {
    if (el.hidden) return;
    el.classList.add('out');
    window.setTimeout(() => {
      if (el.classList.contains('out')) el.hidden = true;
    }, COACH.fadeMs);
  }
}

/** Dismissible banner for the build panel; '' when the tip was already seen or tips are off. */
export function panelTip(book: TipBook | null | undefined, id: 'draft' | 'shop') {
  if (!book?.shouldShow(id)) return '';
  return `<div class="ptip"><p>${TIPS[id]}</p><button data-act="tipok" data-tip="${id}">GOT IT</button></div>`;
}
