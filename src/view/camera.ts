/**
 * V2 fixed-anchor zoom camera (display only; never touches physics, scoring, RNG or timing).
 *
 * Approved rules (designer):
 * - Never pan, track or recenter. One fixed world anchor stays on one fixed screen pixel for the whole
 *   run; the transform only translates as a mathematical consequence of scaling about that anchor.
 * - 100% (scale 1) is the closest view: today's framing. The camera only zooms OUT, and only as far as
 *   needed to keep every live ball (all modes) inside a padded view, then returns to exactly 100%.
 * Agreed refinements (Nov 20):
 * - Anchor = the batter's hands, so the batter never moves on screen and zoom-out reveals the top.
 * - Zoom-in is driven to finish before a returning ball reaches the batting zone.
 * - Batter drag stays world-constant (GameView.cssToWorld is unchanged and zoom-independent).
 * Everything numeric below is EXPERIMENTAL and tuned by playtest.
 */
import { config } from '../config.ts';

/** The rectangle shown at 100% (same as GameView's VIEW). */
export type Rect = { x0: number; y0: number; w: number; h: number };

export const CAMERA = {
  /**
   * The original table (always fully visible at 100% by design). A ball inside it on an axis never asks
   * for zoom on that axis, so ordinary play (incl. balls heading into the drain) stays at exactly 100%.
   */
  home: { x0: 0, y0: 0, x1: 20, y1: 32 },
  /** Fixed world anchor: the batter's hands line, horizontally centered on the table. */
  anchor: { x: 10, y: config.batter.handsY },
  /** Widest allowed zoom (iPhone readability floor). EXPERIMENTAL. */
  minZoom: 0.76,
  /** World units kept between a ball and the view edge. */
  pad: 1.1,
  /** Seconds of velocity lookahead: starts the (slow) zoom-out early for a ball heading out of view. */
  lookahead: 0.3,
  /**
   * Time constants (s). Zoom-out eases (playtest Nov 20: 0.07 felt abrupt → 0.2); zoom-in is gentler.
   * The hard `edgePad` limit below still guarantees a ball never leaves the view while easing out.
   */
  outTau: 0.2,
  /** A ball's center is always kept at least this far (world units) inside the view edge. */
  edgePad: 0.45,
  inTau: 0.22,
  /** Ignore zoom-in targets less than this above the current zoom (prevents hunting). */
  inDeadband: 0.012,
  /** Snap to exactly 1 when this close. */
  snap: 0.002,
  /** A returning ball below this y (world) must see 100%: zoom-in hurries to finish before it. */
  batZoneY: 17,
};

export type CamBall = { x: number; y: number; vx?: number; vy?: number };

/** Visible world rectangle at zoom s for a 100% view `v` scaled about `a`. */
export function visibleRect(v: Rect, s: number, a = CAMERA.anchor): Rect {
  const x0 = a.x - (a.x - v.x0) / s, y0 = a.y - (a.y - v.y0) / s;
  return { x0, y0, w: v.w / s, h: v.h / s };
}

/** Largest zoom (≤ 1) that keeps point p (with padding) inside the view. */
export function zoomFor(v: Rect, p: { x: number; y: number }, pad = CAMERA.pad, a = CAMERA.anchor, home = CAMERA.home) {
  let s = 1;
  const need = (span: number, dist: number) => (dist > span ? span / dist : 1);
  // left / right / top / bottom: only for a ball beyond the original table on that side; then compare the
  // anchor-to-padded-point distance with the 100% span on that side.
  if (p.x < home.x0 && p.x - pad < v.x0) s = Math.min(s, need(a.x - v.x0, a.x - (p.x - pad)));
  if (p.x > home.x1 && p.x + pad > v.x0 + v.w) s = Math.min(s, need(v.x0 + v.w - a.x, p.x + pad - a.x));
  if (p.y < home.y0 && p.y - pad < v.y0) s = Math.min(s, need(a.y - v.y0, a.y - (p.y - pad)));
  if (p.y > home.y1 && p.y + pad > v.y0 + v.h) s = Math.min(s, need(v.y0 + v.h - a.y, p.y + pad - a.y));
  return s;
}

export class Camera {
  zoom = 1;
  /**
   * Playable world bounds (the table now; unlocked annexes extend it). Lookahead never predicts a ball
   * past these: walls bounce it and the drain removes it, so that would only cause false zoom-outs.
   */
  bounds = { x0: 0, y0: 0, x1: 20, y1: 32 };
  /** Last unclamped requirement (for offscreen indicators / metrics). */
  wanted = 1;
  /** Balls that can't fit even at minZoom (indicators should point at them). */
  offscreen: CamBall[] = [];
  /** Metrics for developer analytics. */
  stats = { secondsBelow100: 0, minZoom: 1, changes: 0 };
  private dir = 0;

  view: Rect;
  cfg: typeof CAMERA;
  constructor(view: Rect, cfg = CAMERA) {
    this.view = view;
    this.cfg = cfg;
  }

  /** Target zoom for these live balls (positions + optional velocities). */
  target(balls: CamBall[]) {
    let s = 1;
    for (const b of balls) {
      s = Math.min(s, zoomFor(this.view, b, this.cfg.pad, this.cfg.anchor, this.cfg.home));
      if (b.vx !== undefined && b.vy !== undefined) {
        const B = this.bounds;
        const ahead = {
          x: Math.min(B.x1, Math.max(B.x0, b.x + b.vx * this.cfg.lookahead)),
          y: Math.min(B.y1, Math.max(B.y0, b.y + b.vy * this.cfg.lookahead)),
        };
        s = Math.min(s, zoomFor(this.view, ahead, this.cfg.pad, this.cfg.anchor, this.cfg.home));
      }
    }
    return s;
  }

  /**
   * Advance one display frame. `paused` freezes the camera (no hunting on Ready/menus). With no live
   * balls the camera eases back to 100%.
   */
  update(balls: CamBall[], dt: number, paused = false) {
    if (paused || dt <= 0) return this.zoom;
    const want = this.target(balls);
    this.wanted = want;
    const goal = Math.max(this.cfg.minZoom, want);
    this.offscreen = want < this.cfg.minZoom ? balls.filter(b => zoomFor(this.view, b, 0, this.cfg.anchor, this.cfg.home) < this.cfg.minZoom) : [];
    const prev = this.zoom;
    if (goal < this.zoom) {
      // out: fast, and never slower than needed to keep the ball in view
      this.zoom = goal + (this.zoom - goal) * Math.exp(-dt / this.cfg.outTau);
      if (this.zoom - goal < this.cfg.snap) this.zoom = goal;
    } else if (goal > this.zoom + this.cfg.inDeadband || (goal >= 1 && this.zoom < 1)) {
      // in: gentle, but hurry if a ball is already falling into the batting zone
      const hurry = goal >= 1 && balls.some(b => b.y > this.cfg.batZoneY - 4 && (b.vy ?? 0) > 0);
      const tau = hurry ? this.cfg.inTau / 3 : this.cfg.inTau;
      this.zoom = goal - (goal - this.zoom) * Math.exp(-dt / tau);
    }
    // Never let the easing lag a ball out of view: clamp to what the current positions strictly need.
    let must = 1;
    for (const b of balls) must = Math.min(must, zoomFor(this.view, b, this.cfg.edgePad, this.cfg.anchor, this.cfg.home));
    this.zoom = Math.min(this.zoom, Math.max(this.cfg.minZoom, must));
    if (1 - this.zoom < this.cfg.snap) this.zoom = 1;
    this.zoom = Math.min(1, Math.max(this.cfg.minZoom, this.zoom));
    const d = Math.sign(this.zoom - prev);
    if (d && d !== this.dir) this.stats.changes++;
    if (d) this.dir = d;
    if (this.zoom < 1) this.stats.secondsBelow100 += dt;
    this.stats.minZoom = Math.min(this.stats.minZoom, this.zoom);
    return this.zoom;
  }

  /**
   * Canvas transform (a, d, e, f) for world → backing-store pixels at the current zoom: scale about the
   * anchor, whose pixel position is the same at every zoom.
   */
  transform(ppu: number) {
    const s = this.zoom * ppu;
    const ax = (this.cfg.anchor.x - this.view.x0) * ppu, ay = (this.cfg.anchor.y - this.view.y0) * ppu;
    return { a: s, d: s, e: ax - this.cfg.anchor.x * s, f: ay - this.cfg.anchor.y * s };
  }

  /** Where a world point lands in backing-store pixels. */
  project(ppu: number, p: { x: number; y: number }) {
    const t = this.transform(ppu);
    return { x: t.a * p.x + t.e, y: t.d * p.y + t.f };
  }

  reset() {
    this.zoom = 1;
    this.dir = 0;
    this.offscreen = [];
  }
}

/** Camera inputs from a simulation: every live ball in every mode, at its drawn position. */
export function cameraBalls(sim: { balls: { mode: string; pos: { x: number; y: number }; body: { getLinearVelocity(): { x: number; y: number } } }[] }): CamBall[] {
  return sim.balls.map(b => {
    // ramp/held/drop balls are drawn at `pos`; their Planck body is inactive/stale, so no body velocity
    if (b.mode !== 'field') return { x: b.pos.x, y: b.pos.y };
    const v = b.body.getLinearVelocity();
    return { x: b.pos.x, y: b.pos.y, vx: v.x, vy: v.y };
  });
}
