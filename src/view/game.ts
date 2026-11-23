/**
 * Board presentation: a pre-rendered static layer (turf, chalk, rails, machine bodies) plus a
 * cheap dynamic layer (lit machines, ball, batter, bat, VFX). Shapes come straight from board.ts
 * so the art always matches the collision geometry.
 */
import { config } from '../config.ts';
import { MOUND, OUTER_WALL, lowerWallX, targetPoly, wallChains, type Layout, type Pt, type BoxTarget } from '../physics/board.ts';
import { UPPER_DECK, deckFloorPolygon } from '../machines/sections.ts';
import type { Simulation } from '../physics/sim.ts';
import { checkEligibility } from '../core/swing.ts';
import { drawGlow, readableSize, underlay, Vfx } from './vfx.ts';
import { Camera, cameraBalls, visibleRect, type CamBall, type Rect } from './camera.ts';
import { drawMachinesFloorDynamic, drawMachinesFloorStatic, drawMachinesRaised, onMechanismEvent } from './machines.ts';
import { derived, type Theme } from './theme.ts';
import { JUICE } from './juice.ts';
import { HOT_CORNER } from '../core/bosses.ts';

/** Visible world rectangle (a little beyond the rails for the frame and floodlights). */
export const VIEW = { x0: -0.9, y0: -1.7, w: 21.8, h: 34.1 };

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const LANE_TOP = config.batter.handsY - 1.7;
const BAT_LINE = config.batter.handsY + config.swing.battingLine;
const HOME = { x: 10, y: 28.0 };

function path(ctx: CanvasRenderingContext2D, pts: Pt[], close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  if (close) ctx.closePath();
}

/** White baseball with red stitched seams. */
export function drawBaseball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0, shade = true) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#f3efe4');
  g.addColorStop(1, shade ? '#b9b2a2' : '#e8e2d2');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.97, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = '#d4272e';
  ctx.lineWidth = r * 0.06;
  for (const s of [-1, 1]) {
    const cx = s * r * 1.32, rr = r * 0.95;
    ctx.beginPath();
    ctx.arc(cx, 0, rr, Math.PI - 0.95, Math.PI + 0.95);
    if (s < 0) {
      ctx.beginPath();
      ctx.arc(cx, 0, rr, -0.95, 0.95);
    }
    ctx.stroke();
    // stitch ticks
    ctx.lineWidth = r * 0.05;
    for (let i = -5; i <= 5; i++) {
      const a = (s < 0 ? 0 : Math.PI) + i * 0.16;
      const px = cx + Math.cos(a) * rr, py = Math.sin(a) * rr;
      const tx = -Math.sin(a), ty = Math.cos(a), nx = Math.cos(a), ny = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(px - nx * r * 0.11 + tx * r * 0.05, py - ny * r * 0.11 + ty * r * 0.05);
      ctx.lineTo(px + nx * r * 0.11 + tx * r * 0.05, py + ny * r * 0.11 + ty * r * 0.05);
      ctx.stroke();
    }
    ctx.lineWidth = r * 0.06;
  }
  ctx.restore();
}

/** Floodlight panels beside the Upper Deck (outside its walls; seen when the camera zooms out). */
const DECK_FLOODLIGHTS = [
  { x: -0.55, y: -6.2 },
  { x: 20.55, y: -6.2 },
];

/** Chase bulbs along the outer rail (classic: exactly the old OUTER_WALL spacing). */
function bulbsFor(layout: Pick<Layout, 'sections'>): Pt[] {
  const out: Pt[] = [];
  const pts = wallChains(layout)[0].pts;
  let carry = 0.6;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (b.y > 30.7 && a.y > 30.5) continue;
    let d = carry;
    while (d < len) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += 1.45;
    }
    carry = d - len;
  }
  return out;
}

function playfieldPolygon(): Pt[] {
  return [...OUTER_WALL];
}

export class GameView {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  staticLayer: HTMLCanvasElement;
  ppu = 30;
  /** V2 fixed-anchor zoom camera (null = classic fixed view, byte-for-byte the old path). */
  camera: Camera | null = null;
  /** Dev harness: when set, the camera frames these points instead of the live balls. */
  cameraProbe: CamBall[] | null = null;
  private grain: HTMLCanvasElement | null = null;
  /** Whole-pixel margins of the cached layers beyond the 100% view (0 without the camera). */
  private margin = { l: 0, t: 0, r: 0, b: 0 };
  theme: Theme;
  vfx: Vfx;
  debug = false;
  /** Seconds of "lit" remaining per machine id. */
  lit = new Map<string, number>();
  time = 0;
  lastContact: { x: number; y: number; vx: number; vy: number; angle: number } | null = null;

  layout: Layout;

  constructor(canvas: HTMLCanvasElement, theme: Theme, layout: Layout) {
    this.layout = layout;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.staticLayer = document.createElement('canvas');
    this.theme = theme;
    this.vfx = new Vfx(theme);
  }

  /** Size the backing store to the displayed size × devicePixelRatio (capped) and redraw statics. */
  private cssW = 0;
  resize(cssWidth: number, force = false) {
    this.cssW = cssWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const ppu = Math.max(14, Math.min(70, (cssWidth * dpr) / VIEW.w));
    if (!force && Math.abs(ppu - this.ppu) < 0.01 && this.staticLayer.width) return;
    this.ppu = ppu;
    const w = Math.round(VIEW.w * ppu), h = Math.round(VIEW.h * ppu);
    // The display canvas never changes size for the camera (no reflow on phones): only the transform does.
    this.canvas.width = w;
    this.canvas.height = h;
    // Cached layers cover the widest camera view, padded to whole pixels so 100% blits pixel-exact.
    this.margin = { l: 0, t: 0, r: 0, b: 0 };
    if (this.camera) {
      const ext = visibleRect(VIEW, this.camera.cfg.minZoom, this.camera.cfg.anchor);
      this.margin = {
        l: Math.ceil((VIEW.x0 - ext.x0) * ppu),
        t: Math.ceil((VIEW.y0 - ext.y0) * ppu),
        r: Math.ceil((ext.x0 + ext.w - VIEW.x0 - VIEW.w) * ppu),
        b: Math.ceil((ext.y0 + ext.h - VIEW.y0 - VIEW.h) * ppu),
      };
    }
    const m = this.margin;
    this.staticLayer.width = this.rampLayer.width = w + m.l + m.r;
    this.staticLayer.height = this.rampLayer.height = h + m.t + m.b;
    this.drawStatic();
  }

  /** Turn on the V2 camera (build test with ?v2=1). Rebuilds the layer caches once. */
  enableCamera(cam: Camera) {
    this.camera = cam;
    cam.bounds = { ...this.layout.bounds };
    if (this.cssW) this.resize(this.cssW, true);
  }

  /** World → display-canvas pixels: the classic fixed view, or the camera's anchored zoom. */
  worldTransform(ctx: CanvasRenderingContext2D) {
    if (this.camera && this.camera.zoom !== 1) {
      const t = this.camera.transform(this.ppu);
      ctx.setTransform(t.a, 0, 0, t.d, t.e, t.f);
      return;
    }
    ctx.setTransform(this.ppu, 0, 0, this.ppu, -VIEW.x0 * this.ppu, -VIEW.y0 * this.ppu);
  }

  /** World → cached-layer pixels (the layers include the camera margins). */
  layerTransform(ctx: CanvasRenderingContext2D) {
    ctx.setTransform(this.ppu, 0, 0, this.ppu, -VIEW.x0 * this.ppu + this.margin.l, -VIEW.y0 * this.ppu + this.margin.t);
  }

  /** World rectangle the cached layers cover. */
  layerRect() {
    const m = this.margin, p = this.ppu;
    return { x0: VIEW.x0 - m.l / p, y0: VIEW.y0 - m.t / p, w: VIEW.w + (m.l + m.r) / p, h: VIEW.h + (m.t + m.b) / p };
  }

  /** Composite a cached layer: pixel-exact at 100%, scaled about the anchor otherwise. */
  blitLayer(ctx: CanvasRenderingContext2D, layer: HTMLCanvasElement) {
    if (!this.camera || this.camera.zoom === 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, -this.margin.l, -this.margin.t);
      return;
    }
    this.worldTransform(ctx);
    const r = this.layerRect();
    ctx.drawImage(layer, r.x0, r.y0, r.w, r.h);
  }

  /** Convert a client-space x delta (CSS px) to world units. */
  cssToWorld(dxCss: number, cssWidth: number) {
    return (dxCss / cssWidth) * VIEW.w;
  }

  // ───────────────────────────── static layer ─────────────────────────────
  drawStatic() {
    const ctx = this.staticLayer.getContext('2d')!;
    const W = this.staticLayer.width, H = this.staticLayer.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.layerTransform(ctx);
    this.drawStadium(ctx);
    const poly = playfieldPolygon();

    ctx.save();
    path(ctx, poly);
    ctx.clip();
    this.drawTurf(ctx);
    this.drawInfield(ctx);
    this.drawLaneAndApron(ctx);
    ctx.restore();

    const deck = this.layout.sections.includes('upperDeck');
    if (deck) this.drawDeck(ctx);
    if (!deck) this.drawRails(ctx, poly);
    else
      for (const w of wallChains(this.layout)) {
        if (w.loop) {
          // the solid divider between the two gaps
          ctx.fillStyle = this.theme.m.trimDeep;
          path(ctx, w.pts);
          ctx.fill();
        }
        this.drawRails(ctx, w.loop ? [...w.pts, w.pts[0]] : w.pts);
      }
    // With the Upper Deck the floodlights move out beside the deck (only seen zoomed out).
    this.drawFloodlights(ctx, deck ? DECK_FLOODLIGHTS : undefined);
    this.drawCrest(ctx);
    for (const s of this.layout.slings) this.drawSlingBody(ctx, s.poly, s.face, s.kickDir);
    for (const p of this.layout.posts) this.drawPost(ctx, p.x, p.y, p.r);
    for (const t of this.layout.roundTargets) this.drawBullseye(ctx, t.x, t.y, t.r);
    for (const t of this.layout.boxTargets) this.drawBoxTarget(ctx, t);
    for (const l of this.layout.lanes) this.drawLaneRail(ctx, l.rail);
    drawMachinesFloorStatic(ctx, this);
    for (const b of this.layout.bumpers) {
      if (b.style === 'glove') this.drawGlove(ctx, b.x, b.y, b.r);
      else if (b.style === 'bonus') this.drawBonusBase(ctx, b.x, b.y, b.r);
      else this.drawBumperBase(ctx, b.x, b.y, b.r);
    }
  }

  private drawLaneRail(ctx: CanvasRenderingContext2D, rail: [Pt, Pt]) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.3;
    ctx.beginPath();
    ctx.moveTo(rail[0].x + 0.12, rail[0].y + 0.18);
    ctx.lineTo(rail[1].x + 0.12, rail[1].y + 0.18);
    ctx.stroke();
    const g = ctx.createLinearGradient(rail[0].x - 0.15, 0, rail[0].x + 0.15, 0);
    g.addColorStop(0, '#6f7784');
    g.addColorStop(0.45, '#f4f7fb');
    g.addColorStop(1, '#5b6370');
    ctx.strokeStyle = g;
    ctx.lineWidth = 0.24;
    ctx.beginPath();
    ctx.moveTo(rail[0].x, rail[0].y);
    ctx.lineTo(rail[1].x, rail[1].y);
    ctx.stroke();
    for (const p of rail) {
      ctx.fillStyle = this.theme.m.trim;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBonusBase(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + 0.18, y + 0.28, r * 1.2, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    const s = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    s.addColorStop(0, this.theme.m.bonusRim[0]);
    s.addColorStop(0.5, this.theme.m.bonusRim[1]);
    s.addColorStop(1, this.theme.m.bonusRim[2]);
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    const b = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    b.addColorStop(0, this.theme.m.bonusBody[0]);
    b.addColorStop(0.7, this.theme.m.bonusBody[1]);
    b.addColorStop(1, this.theme.m.bonusBody[2]);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawGlove(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + 0.2, y + 0.32, r * 1.18, r * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // gold ring base
    const s = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    s.addColorStop(0, '#fbe3a6');
    s.addColorStop(0.5, '#b8862f');
    s.addColorStop(1, '#5c3f14');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    // leather mitt: palm + four finger lobes + thumb
    const leather = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r * 1.1);
    leather.addColorStop(0, '#e2a35c');
    leather.addColorStop(0.7, '#a8652a');
    leather.addColorStop(1, '#5e3412');
    ctx.fillStyle = leather;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.1, r * 0.78, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 - 0.75 + i * 0.5;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.2, r * 0.32, a + Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x + r * 0.7, y + r * 0.25, r * 0.18, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // pocket + laces
    ctx.fillStyle = '#7a4318';
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.12, r * 0.42, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f0d2a0';
    ctx.lineWidth = 0.05;
    ctx.setLineDash([0.08, 0.08]);
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.12, r * 0.55, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawStadium(ctx: CanvasRenderingContext2D) {
    // Everything is laid out on the 100% VIEW (identical pixels to the classic view); the camera's
    // extra margin only gets the same backdrop continued plus its own crowd, drawn after.
    const { x0, y0, w, h } = VIEW;
    const L = this.layerRect();
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, this.theme.m.backdrop[0]);
    g.addColorStop(0.5, this.theme.m.backdrop[1]);
    g.addColorStop(1, this.theme.m.backdrop[2]);
    ctx.fillStyle = g;
    ctx.fillRect(L.x0, L.y0, L.w, L.h);
    // stands suggestion below the angled walls: soft out-of-focus crowd bokeh (static, cheap)
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 70; i++) {
        const y = 22 + rnd() * 11;
        const wallX = lowerWallX(Math.min(y, 30.6));
        const x = side < 0 ? x0 + rnd() * (wallX - x0 - 0.6) : 20 - wallX + 0.6 + rnd() * (wallX - x0 - 0.6);
        const crowd = this.theme.m.crowd;
        const hue = crowd[Math.floor(rnd() * crowd.length)];
        ctx.globalAlpha = 0.12 + rnd() * 0.16;
        ctx.fillStyle = hue;
        ctx.beginPath();
        ctx.arc(x, y, 0.18 + rnd() * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    if (L.w > w + 1e-6 || L.h > h + 1e-6) this.drawOuterStands(ctx, L);
    // floodlight bloom at the top corners
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, this.theme.m.floodlight, 0.5, -0.8, 7.5, 0.35);
    drawGlow(ctx, this.theme.m.floodlight, 19.5, -0.8, 7.5, 0.35);
    drawGlow(ctx, this.theme.cabinetGlow, 10, 33, 9, 0.18);
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Camera margin (outside the 100% view): upper-deck stands so a zoom-out looks finished, not void. */
  private drawOuterStands(ctx: CanvasRenderingContext2D, L: Rect) {
    let seed = 1913;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crowd = this.theme.m.crowd;
    const inView = (x: number, y: number) => x > VIEW.x0 && x < VIEW.x0 + VIEW.w && y > VIEW.y0 && y < VIEW.y0 + VIEW.h;
    // strictly outside the 100% view (even-odd clip), so the classic framing stays pixel-identical
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.x0, L.y0, L.w, L.h);
    ctx.rect(VIEW.x0, VIEW.y0, VIEW.w, VIEW.h);
    ctx.clip('evenodd');
    const n = Math.round((L.w * L.h - VIEW.w * VIEW.h) * 0.55);
    for (let i = 0; i < n; i++) {
      const x = L.x0 + rnd() * L.w, y = L.y0 + rnd() * L.h;
      if (inView(x, y)) continue;
      // denser and brighter higher up: rows of stands
      const up = 1 - Math.min(1, Math.max(0, (y - L.y0) / (VIEW.y0 + 6 - L.y0)));
      ctx.globalAlpha = 0.08 + rnd() * 0.12 + up * 0.08;
      ctx.fillStyle = crowd[Math.floor(rnd() * crowd.length)];
      ctx.beginPath();
      ctx.arc(x, y, 0.16 + rnd() * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** V2 Upper Deck floor: the table's turf continued up, tinted as its own level, with painted seat rows. */
  private drawDeck(ctx: CanvasRenderingContext2D) {
    const d = UPPER_DECK;
    ctx.save();
    path(ctx, deckFloorPolygon());
    ctx.clip();
    const g = ctx.createLinearGradient(0, d.roofY, 0, d.railY);
    g.addColorStop(0, this.theme.m.turf[2]);
    g.addColorStop(1, this.theme.m.turf[0]);
    ctx.fillStyle = g;
    ctx.fillRect(d.wallX0 - 1, d.roofY - 1, d.wallX1 - d.wallX0 + 2, d.railY - d.roofY + 2);
    for (let x = 0; x < 20; x += 3.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, d.roofY - 1, 1.6, d.railY - d.roofY + 2);
    }
    ctx.fillStyle = d.tint;
    ctx.fillRect(d.wallX0 - 1, d.roofY - 1, d.wallX1 - d.wallX0 + 2, d.railY - d.roofY + 2);
    // seat-row arcs (paint only)
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.06;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(10, 6, 12.6 + i * 0.9, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
    }
    ctx.globalAlpha = d.labelAlpha;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 800 0.9px ${FONT}`;
    ctx.fillText(d.label, 10, d.roofY + 1.15);
    ctx.globalAlpha = 1;
    this.fillGrain(ctx);
    ctx.restore();
  }

  private drawTurf(ctx: CanvasRenderingContext2D) {
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, this.theme.m.turf[0]);
    g.addColorStop(0.45, this.theme.m.turf[1]);
    g.addColorStop(1, this.theme.m.turf[2]);
    ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 22, 35);
    // mowing stripes
    for (let x = 0; x < 20; x += 3.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      ctx.fillRect(x, -1, 1.6, 35);
    }
    for (let y = 0; y < 32; y += 3.2) {
      ctx.fillStyle = 'rgba(0,0,0,0.035)';
      ctx.fillRect(-1, y, 22, 1.6);
    }
    // stadium light pool from the top, darker edges (2.5D depth cue)
    const r = ctx.createRadialGradient(10, 9, 1, 10, 12, 19);
    r.addColorStop(0, 'rgba(255,240,200,0.10)');
    r.addColorStop(0.6, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,10,20,0.45)');
    ctx.fillStyle = r;
    ctx.fillRect(-1, -1, 22, 35);
    this.fillGrain(ctx);
  }

  /** Turf grain over the current clip (pixel space, phase locked to the 100% view's pixel grid). */
  private fillGrain(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Generated once per view and reused on every static redraw (theme switch, layout change, camera
    // resize), so redraws never consume extra Math.random and never change the grain.
    if (!this.grain) {
      const n = document.createElement('canvas');
      n.width = n.height = 96;
      const ng = n.getContext('2d')!;
      const img = ng.createImageData(96, 96);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() < 0.5 ? 0 : 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = Math.random() * 16;
      }
      ng.putImageData(img, 0, 0);
      this.grain = n;
    }
    const pat = ctx.createPattern(this.grain, 'repeat')!;
    // keep the grain's tiling phase on the 100% view's pixel grid (identical to the classic view)
    pat.setTransform(new DOMMatrix().translate(this.margin.l, this.margin.t));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, this.staticLayer.width, this.staticLayer.height);
    ctx.restore();
  }

  private drawInfield(ctx: CanvasRenderingContext2D) {
    // infield skin arc around home plate
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = this.theme.m.infield;
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.arc(HOME.x, HOME.y, 13.6, Math.PI * 1.17, Math.PI * 1.83);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#e9dcc0';
    ctx.lineWidth = 0.05;
    for (const rr of [13.12, 14.08]) {
      ctx.beginPath();
      ctx.arc(HOME.x, HOME.y, rr, Math.PI * 1.17, Math.PI * 1.83);
      ctx.stroke();
    }
    ctx.restore();
    // foul lines from home plate
    ctx.strokeStyle = 'rgba(245,240,225,0.6)';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(HOME.x, HOME.y);
    ctx.lineTo(HOME.x - 14, HOME.y - 14);
    ctx.moveTo(HOME.x, HOME.y);
    ctx.lineTo(HOME.x + 14, HOME.y - 14);
    ctx.stroke();
    // jackpot lane arrows painted up the center, through the bullseye gate (paint only)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.13;
    for (let i = 0; i < 4; i++) {
      const y = 9.4 - i * 1.25;
      ctx.strokeStyle = derived(this.theme).paintedArrow(0.16 + i * 0.07);
      ctx.beginPath();
      ctx.moveTo(9.45, y + 0.4);
      ctx.lineTo(10, y);
      ctx.lineTo(10.55, y + 0.4);
      ctx.stroke();
    }
    // pitcher's mound (serve point): decorative, no collision
    const m = ctx.createRadialGradient(MOUND.x - 0.3, MOUND.y - 0.3, 0.1, MOUND.x, MOUND.y, MOUND.r);
    m.addColorStop(0, this.theme.m.mound[0]);
    m.addColorStop(0.75, this.theme.m.mound[1]);
    m.addColorStop(1, this.theme.m.mound[2]);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(MOUND.x + 0.1, MOUND.y + 0.15, MOUND.r, MOUND.r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = m;
    ctx.beginPath();
    ctx.arc(MOUND.x, MOUND.y, MOUND.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4efe2';
    ctx.fillRect(MOUND.x - 0.34, MOUND.y - 0.5, 0.68, 0.14);
  }

  private drawLaneAndApron(ctx: CanvasRenderingContext2D) {
    // apron / batter's dirt below the batting line down to the drain
    const a = ctx.createLinearGradient(0, BAT_LINE, 0, 32.5);
    a.addColorStop(0, this.theme.m.apron[0]);
    a.addColorStop(0.55, this.theme.m.apron[1]);
    a.addColorStop(1, this.theme.m.apron[2]);
    ctx.fillStyle = a;
    ctx.fillRect(-1, BAT_LINE, 22, 34 - BAT_LINE);
    // home plate + batter's boxes
    ctx.strokeStyle = 'rgba(245,240,225,0.7)';
    ctx.lineWidth = 0.07;
    ctx.strokeRect(HOME.x - 2.3, HOME.y - 0.95, 1.5, 1.9);
    ctx.strokeRect(HOME.x + 0.8, HOME.y - 0.95, 1.5, 1.9);
    ctx.fillStyle = '#f7f3ea';
    path(ctx, [{ x: HOME.x - 0.42, y: HOME.y - 0.4 }, { x: HOME.x + 0.42, y: HOME.y - 0.4 }, { x: HOME.x + 0.42, y: HOME.y }, { x: HOME.x, y: HOME.y + 0.42 }, { x: HOME.x - 0.42, y: HOME.y }]);
    ctx.fill();
    // drain mouth shadow + danger tint
    const d = ctx.createLinearGradient(0, 29.6, 0, 32.5);
    d.addColorStop(0, 'rgba(5,8,16,0)');
    d.addColorStop(1, 'rgba(5,8,16,0.95)');
    ctx.fillStyle = d;
    ctx.fillRect(-1, 29.6, 22, 3);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#ff2d3a', 10, 32.6, 4.2, 0.22);
    ctx.globalCompositeOperation = 'source-over';

    // batter movement lane: bright turf band, chalk edges, clear of all machinery
    const l = ctx.createLinearGradient(0, LANE_TOP, 0, BAT_LINE);
    l.addColorStop(0, this.theme.m.laneTurf[0]);
    l.addColorStop(1, this.theme.m.laneTurf[1]);
    ctx.fillStyle = l;
    ctx.fillRect(-1, LANE_TOP, 22, BAT_LINE - LANE_TOP);
    for (let x = 0; x < 20; x += 1.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      ctx.fillRect(x, LANE_TOP, 0.6, BAT_LINE - LANE_TOP);
    }
    ctx.fillStyle = 'rgba(245,240,225,0.5)';
    ctx.fillRect(-1, LANE_TOP - 0.04, 22, 0.06);
    ctx.fillStyle = 'rgba(250,247,238,0.9)';
    ctx.fillRect(-1, BAT_LINE - 0.05, 22, 0.1);
    // painted travel chevrons at the lane ends
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const cy = (LANE_TOP + BAT_LINE) / 2;
    for (const [x, dir] of [[3.6, -1], [4.3, -1], [16.4, 1], [15.7, 1]] as const) {
      path(ctx, [{ x: x + dir * 0.3, y: cy }, { x: x - dir * 0.15, y: cy - 0.42 }, { x: x - dir * 0.15 - dir * 0.0, y: cy - 0.2 }, { x: x + dir * 0.05, y: cy }, { x: x - dir * 0.15, y: cy + 0.2 }, { x: x - dir * 0.15, y: cy + 0.42 }]);
      ctx.fill();
    }
  }

  private drawRails(ctx: CanvasRenderingContext2D, poly: Pt[]) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const rail = poly; // open chain (bottom left lip → top → bottom right lip)
    // drop shadow onto turf
    ctx.save();
    ctx.translate(0.14, 0.2);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.75;
    path(ctx, rail, false);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = this.theme.m.railEdge;
    ctx.lineWidth = 0.78;
    path(ctx, rail, false);
    ctx.stroke();
    const metal = ctx.createLinearGradient(-1, -1, 21, 33);
    const stops = this.theme.m.railMetal;
    stops.forEach((c, i) => metal.addColorStop(i / (stops.length - 1), c));
    ctx.strokeStyle = metal;
    ctx.lineWidth = 0.48;
    path(ctx, rail, false);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,225,0.85)';
    ctx.lineWidth = 0.07;
    ctx.save();
    ctx.translate(-0.06, -0.06);
    path(ctx, rail, false);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,24,6,0.6)';
    ctx.lineWidth = 0.05;
    ctx.save();
    ctx.translate(0.1, 0.1);
    path(ctx, rail, false);
    ctx.stroke();
    ctx.restore();
  }

  /** Bulb positions along the rail (drawn dynamically so they can chase). */
  /** Placement/target previews drawn over the board between challenges. */
  highlights: { x: number; y: number; r: number }[] = [];
  highlightLabel = '';
  /** Spinner flap angles (visual only). */
  spin = new Map<string, { angle: number }>();
  lastDt = 0;
  /** Pre-rendered raised ramp structures (drawn above floor balls). */
  rampLayer = document.createElement('canvas');
  bulbs: Pt[] = bulbsFor({ sections: [] });

  private drawFloodlights(ctx: CanvasRenderingContext2D, at: { x: number; y: number }[] = [{ x: 1.6, y: -1.55 }, { x: 18.4, y: -1.55 }]) {
    for (const { x: cx, y } of at) {
      const x = cx - 1.35;
      ctx.fillStyle = this.theme.m.floodPanel;
      ctx.strokeStyle = this.theme.m.trimDeep;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.roundRect(x, y, 2.7, 1.2, 0.15);
      ctx.fill();
      ctx.stroke();
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 5; c++) {
          const bx = x + 0.32 + c * 0.51, by = y + 0.33 + r * 0.54;
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, this.theme.m.floodBulb, bx, by, 0.55, 0.55);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#fffaf0';
          ctx.beginPath();
          ctx.arc(bx, by, 0.17, 0, Math.PI * 2);
          ctx.fill();
        }
    }
  }

  /** Crossed bats, baseball and stars above the jackpot, in the frame (no collision). */
  private drawCrest(ctx: CanvasRenderingContext2D) {
    const cx = 10, cy = -0.7;
    for (const sgn of [-1, 1]) {
      ctx.save();
      ctx.translate(cx, cy + 0.15);
      ctx.rotate(sgn * 0.62);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.save();
      ctx.translate(0.08, 0.1);
      batShape(ctx, 2.4, true);
      ctx.fill();
      ctx.restore();
      const g = ctx.createLinearGradient(-0.2, 0, 0.2, 0);
      g.addColorStop(0, '#f8d9a0');
      g.addColorStop(0.5, '#d49b52');
      g.addColorStop(1, '#8a5826');
      ctx.fillStyle = g;
      batShape(ctx, 2.4, true);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, '#fff1d0', cx, cy, 1.6, 0.35);
    ctx.globalCompositeOperation = 'source-over';
    drawBaseball(ctx, cx, cy, 0.68, 0.4);
    ctx.fillStyle = this.theme.jackpotAccent;
    for (const [x, y, r] of [[7.9, -0.95, 0.24], [12.1, -0.95, 0.24], [10, -1.55, 0]] as const) {
      if (!r) continue;
      star(ctx, x, y, r, r * 0.45);
      ctx.fill();
    }
  }

  private drawSlingBody(ctx: CanvasRenderingContext2D, poly: Pt[], face: [Pt, Pt], k: Pt) {
    ctx.save();
    ctx.translate(0.1, 0.16);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    path(ctx, poly);
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(face[0].x, face[0].y, face[0].x - k.x, face[0].y - k.y);
    g.addColorStop(0, this.theme.slingBody);
    g.addColorStop(1, this.theme.slingDeep);
    ctx.fillStyle = g;
    path(ctx, poly);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#d6e3f5';
    ctx.lineWidth = 0.08;
    ctx.stroke();
    // bright kick face rubber
    ctx.strokeStyle = this.theme.slingFace;
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(face[0].x, face[0].y);
    ctx.lineTo(face[1].x, face[1].y);
    ctx.stroke();
  }

  /** Chevrons on the sling, pointing the kick direction. Drawn dynamically (they light up). */
  private drawSlingChevrons(ctx: CanvasRenderingContext2D, face: [Pt, Pt], k: Pt, glow: number) {
    const mx = (face[0].x + face[1].x) / 2, my = (face[0].y + face[1].y) / 2;
    const tx = face[1].x - face[0].x, ty = face[1].y - face[0].y, tl = Math.hypot(tx, ty);
    const ux = tx / tl, uy = ty / tl;
    // chevrons sit inside the sling body, behind the face
    const nx = -k.x, ny = -k.y;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = glow > 0.05 ? '#ffffff' : 'rgba(225,238,255,0.8)';
    ctx.lineWidth = 0.08;
    for (let i = 0; i < 2; i++) {
      const off = -0.55 + i * 0.85;
      const cx = mx + ux * off + nx * 0.18, cy = my + uy * off + ny * 0.18;
      ctx.beginPath();
      ctx.moveTo(cx - k.x * 0.09 + ux * 0.2, cy - k.y * 0.09 + uy * 0.2);
      ctx.lineTo(cx + k.x * 0.12, cy + k.y * 0.12);
      ctx.lineTo(cx - k.x * 0.09 - ux * 0.2, cy - k.y * 0.09 - uy * 0.2);
      ctx.stroke();
    }
  }

  private drawPost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(x + 0.08, y + 0.12, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r * 1.2);
    g.addColorStop(0, this.theme.m.postMetal[0]);
    g.addColorStop(0.5, this.theme.m.postMetal[1]);
    g.addColorStop(1, this.theme.m.postMetal[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20293a';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBullseye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x + 0.1, y + 0.18, r * 1.15, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.theme.m.trimDeep;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    const red = this.theme.m.targetRing;
    const rings = [red, '#f8f4ea', red, '#f8f4ea', red];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, r * (1 - i * 0.19), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawBoxTarget(ctx: CanvasRenderingContext2D, t: BoxTarget) {
    const poly = targetPoly(t);
    ctx.save();
    ctx.translate(0.1, 0.15);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    path(ctx, poly);
    ctx.fill();
    ctx.restore();
    if (t.style === 'jackpot') {
      const g = ctx.createLinearGradient(0, t.y - t.hh, 0, t.y + t.hh + 0.25);
      g.addColorStop(0, this.theme.m.jackpotBanner[0]);
      g.addColorStop(1, this.theme.m.jackpotBanner[1]);
      ctx.fillStyle = g;
      ctx.lineJoin = 'round';
      path(ctx, poly);
      ctx.fill();
      ctx.strokeStyle = this.theme.m.jackpotBorder;
      ctx.lineWidth = 0.1;
      ctx.stroke();
      // laurels
      ctx.strokeStyle = this.theme.m.jackpotLaurel;
      ctx.lineWidth = 0.07;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const lx = t.x + s * (t.hw + 0.22 + i * 0.05), ly = t.y + 0.3 - i * 0.28;
          ctx.beginPath();
          ctx.ellipse(lx, ly, 0.08, 0.17, s * 0.6, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.font = `italic 800 0.78px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.theme.m.jackpotTextShadow;
      ctx.fillText('JACKPOT', t.x + 0.03, t.y + 0.07);
      ctx.fillStyle = '#fff6e0';
      ctx.fillText('JACKPOT', t.x, t.y + 0.03);
      return;
    }
    // wall target panel
    const metal = ctx.createLinearGradient(t.x - 0.5, 0, t.x + 0.5, 0);
    metal.addColorStop(0, this.theme.m.panelMetal[0]);
    metal.addColorStop(0.5, this.theme.m.panelMetal[1]);
    metal.addColorStop(1, this.theme.m.panelMetal[2]);
    ctx.fillStyle = metal;
    path(ctx, poly);
    ctx.fill();
    const fx = t.x + t.face.x * t.hw; // front face x
    const panelX = Math.min(fx, fx - t.face.x * 0.55);
    if (t.style === 'card') {
      ctx.fillStyle = '#f5f1e6';
      ctx.fillRect(panelX, t.y - t.hh + 0.08, 0.55, t.hh * 2 - 0.16);
      // tiny batter silhouette
      ctx.fillStyle = '#1d3a73';
      const sx = panelX + 0.28, sy = t.y;
      ctx.beginPath();
      ctx.arc(sx, sy - 0.32, 0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d3a73';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 0.22);
      ctx.lineTo(sx, sy + 0.1);
      ctx.lineTo(sx - 0.12, sy + 0.38);
      ctx.moveTo(sx, sy + 0.1);
      ctx.lineTo(sx + 0.12, sy + 0.38);
      ctx.moveTo(sx - 0.15, sy - 0.15);
      ctx.lineTo(sx + 0.2, sy - 0.38);
      ctx.stroke();
    } else {
      ctx.fillStyle = this.theme.m.starPanel;
      ctx.fillRect(panelX, t.y - t.hh + 0.08, 0.55, t.hh * 2 - 0.16);
      ctx.fillStyle = this.theme.m.starFill;
      star(ctx, panelX + 0.275, t.y, 0.22, 0.1);
      ctx.fill();
    }
  }

  private drawBumperBase(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x + 0.2, y + 0.32, r * 1.18, r * 1.08, 0, 0, Math.PI * 2);
    ctx.fill();
    // chrome skirt
    const s = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    s.addColorStop(0, this.theme.m.bumperSkirt[0]);
    s.addColorStop(0.5, this.theme.m.bumperSkirt[1]);
    s.addColorStop(1, this.theme.m.bumperSkirt[2]);
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, Math.PI * 2);
    ctx.fill();
    // red body
    const b = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    b.addColorStop(0, this.theme.m.bumperBody[0]);
    b.addColorStop(0.7, this.theme.m.bumperBody[1]);
    b.addColorStop(1, this.theme.m.bumperBody[2]);
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ───────────────────────────── dynamic layer ─────────────────────────────
  /** Big-moment bulb chase set by the main loop from Juice (null = normal attract chase). */
  bulbChase: { color: string; left: number } | null = null;
  /** Closer rule Hot Corner: where the ×3 is (set each frame by main.ts; null = no rule). */
  hot: { spots: { x: number; y: number; r: number }[]; left: number } | null = null;
  /** Player route: big moments get a DOM banner (juice.ts), so in-world headlines are skipped. */
  bigMoments = false;
  /** Where the WHIFF tag appears (updated each frame from the batter's hands). */
  private whiffAt = { x: 10, y: 24 };

  onSimEvent(e: import('../physics/sim.ts').SimEvent) {
    const t = this.theme;
    if (e.type === 'machine') {
      if (e.kind === 'bumper') {
        const b = this.layout.bumpers.find(b => b.id === e.id)!;
        this.lit.set(e.id, 0.45);
        this.vfx.bumperHit(b.x, b.y, b.r, -e.nx, -e.ny);
        this.vfx.flicker(b.x, b.y - b.r - 0.35, '+' + e.points);
      } else if (e.kind === 'target' || e.kind === 'jackpot') {
        this.lit.set(e.id, e.kind === 'jackpot' ? 0.9 : 0.6);
        const rt = this.layout.roundTargets.find(r => r.id === e.id), bt = this.layout.boxTargets.find(r => r.id === e.id);
        const p = rt ? { x: rt.x, y: rt.y } : bt ? { x: bt.x + bt.face.x * bt.hw, y: bt.y + bt.face.y * bt.hh } : { x: e.x, y: e.y };
        this.vfx.targetHit(p.x, p.y, -e.nx, -e.ny, e.kind === 'jackpot');
        this.vfx.flicker(p.x + (bt ? bt.face.x * 0.8 : 0), p.y - 0.6 + (bt?.style === 'jackpot' ? 1.4 : 0), '+' + e.points, e.kind === 'jackpot' ? t.jackpotAccent : t.impactCore);
      } else if (e.kind === 'sling') {
        const s = this.layout.slings.find(s => s.id === e.id)!;
        this.lit.set(e.id, 0.35);
        this.vfx.slingHit(e.x, e.y, s.kickDir.x, s.kickDir.y);
        if (e.points) this.vfx.flicker(e.x + s.kickDir.x * 0.8, e.y - 0.5, '+' + e.points, t.impactCore, 0.4);
      } else if (e.kind === 'lane') {
        this.lit.set(e.id, 1.0);
        const l = this.layout.lanes.find(l => l.id === e.id)!;
        this.vfx.flash(l.sensor.x, l.sensor.y, 1.0, t.energyPrimary, 0.25);
        this.vfx.flicker(l.sensor.x, l.sensor.y - 0.7, '+' + e.points, t.impactCore);
      } else if (e.kind === 'post') {
        this.lit.set(e.id, 0.25);
        this.vfx.sparks(e.x - e.nx * 0.24, e.y - e.ny * 0.24, 4, 5, t.machineGlow);
      } else {
        onMechanismEvent(this, e);
      }
    } else if (e.type === 'bat') {
      this.vfx.batHit(e.x, e.y, e.contact.velocity.x, e.contact.velocity.y);
      this.lastContact = { x: e.x, y: e.y, vx: e.contact.velocity.x, vy: e.contact.velocity.y, angle: e.contact.angle };
      this.lit.set('bat', 0.18);
      if (e.sweet) {
        this.vfx.flash(e.x, e.y, 2.2, t.impactCore, 0.16);
        this.vfx.ring(e.x, e.y, 0.5, 2.4, t.energyPrimary, 0.32, true, 0.14);
      }
    } else if (e.type === 'whiff') {
      this.vfx.flicker(this.whiffAt.x, this.whiffAt.y, 'WHIFF', t.m.trimDeep, 0.45);
    } else if (e.type === 'serve') {
      this.trails.clear();
      this.lit.set('mound', 0.4);
    } else {
      onMechanismEvent(this, e);
    }
  }

  draw(sim: Simulation, dt: number) {
    const ctx = this.ctx;
    this.time += dt;
    this.lastDt = dt;
    for (const [k, v] of this.lit) {
      if (v - dt <= 0) this.lit.delete(k);
      else this.lit.set(k, v - dt);
    }
    this.vfx.update(dt);
    if (this.camera) {
      const live = sim.rules.phase === 'live';
      this.camera.update(this.cameraProbe ?? (live ? cameraBalls(sim) : []), dt, dt <= 0);
    }
    this.blitLayer(ctx, this.staticLayer);
    this.worldTransform(ctx);

    this.drawBulbs(ctx);
    this.drawMachinesDynamic(ctx);
    this.drawHotCorner(ctx);
    drawMachinesFloorDynamic(ctx, this, sim);
    this.drawBatter(ctx, sim);
    this.drawBalls(ctx, sim, dt, 'floor');
    // raised mechanisms sit above floor balls, so a ball passing under a ramp stays visible through the glass
    drawMachinesRaised(ctx, this, sim);
    this.drawBalls(ctx, sim, dt, 'raised');
    this.vfx.draw(ctx);
    if (this.highlights.length) this.drawHighlights(ctx);
    if (this.camera) this.drawCameraAids(ctx);
    if (this.debug) this.drawDebug(ctx, sim);
  }

  /** Offscreen indicators (safety net past the zoom floor) and dev probe markers. */
  private drawCameraAids(ctx: CanvasRenderingContext2D) {
    const cam = this.camera!;
    const r = visibleRect(VIEW, cam.zoom, cam.cfg.anchor);
    const inset = 0.7 / cam.zoom;
    for (const b of cam.offscreen) {
      const x = Math.min(r.x0 + r.w - inset, Math.max(r.x0 + inset, b.x)), y = Math.min(r.y0 + r.h - inset, Math.max(r.y0 + inset, b.y));
      const a = Math.atan2(b.y - y, b.x - x);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = this.theme.energyPrimary;
      ctx.beginPath();
      ctx.moveTo(0.45 / cam.zoom, 0);
      ctx.lineTo(-0.3 / cam.zoom, -0.32 / cam.zoom);
      ctx.lineTo(-0.3 / cam.zoom, 0.32 / cam.zoom);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    if (this.cameraProbe) {
      ctx.strokeStyle = '#ff3df0';
      ctx.lineWidth = 0.12;
      for (const p of this.cameraProbe) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 0.32, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * Switch palette. Re-renders the cached static and ramp layers once and recolors future effect
   * spawns; nothing is recomputed per frame.
   */
  setTheme(theme: Theme) {
    this.theme = theme;
    this.vfx.theme = theme;
    this.drawStatic();
  }

  /** Swap in a rebuilt machine (build-test installs) and redraw the static layers. */
  setLayout(layout: Layout) {
    this.layout = layout;
    this.bulbs = bulbsFor(layout);
    if (this.camera) this.camera.bounds = { ...layout.bounds };
    this.lit.clear();
    this.spin.clear();
    this.drawStatic();
  }

  private drawHighlights(ctx: CanvasRenderingContext2D) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
    ctx.save();
    for (const h of this.highlights) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, this.theme.energyPrimary, h.x, h.y, h.r * 1.8, 0.35 + pulse * 0.35);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = this.theme.energyPrimary;
      ctx.lineWidth = 0.1;
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineDashOffset = -this.time * 0.8;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r + pulse * 0.15, 0, Math.PI * 2);
      underlay(ctx, this.theme, 0.22);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (this.highlightLabel && this.highlights.length) {
      const top = this.highlights.reduce((a, h) => (h.y - h.r < a.y - a.r ? h : a));
      // keep the whole label on the table: shrink long labels to fit, then clamp the center by its width
      const maxW = VIEW.w - 0.8;
      let fs = 0.62;
      ctx.font = `italic 800 ${fs}px ${FONT}`;
      const raw = ctx.measureText(this.highlightLabel).width + 0.6;
      if (raw > maxW) {
        fs *= maxW / raw;
        ctx.font = `italic 800 ${fs.toFixed(3)}px ${FONT}`;
      }
      const w = Math.min(raw, maxW);
      const x0 = VIEW.x0 + 0.4 + w / 2, x1 = VIEW.x0 + VIEW.w - 0.4 - w / 2;
      const y = Math.max(0.2, top.y - top.r - 0.55), x = Math.min(x1, Math.max(x0, top.x));
      ctx.fillStyle = '#06101ee6';
      ctx.strokeStyle = this.theme.energyPrimary;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 0.42, w, 0.8, 0.18);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.highlightLabel, x, y);
    }
    ctx.restore();
  }

  private drawBulbs(ctx: CanvasRenderingContext2D) {
    const t = this.time;
    ctx.globalCompositeOperation = 'lighter';
    const boost = this.bulbChase;
    this.bulbs.forEach((b, i) => {
      if (boost) {
        // big-moment light show: fast chase in the moment's color, brighter and larger
        const c = 0.5 + 0.5 * Math.sin(t * 3 * JUICE.chaseSpeed - i * 0.9);
        drawGlow(ctx, boost.color, b.x, b.y, 0.7, 0.25 + c * 0.6);
        return;
      }
      const chase = 0.5 + 0.5 * Math.sin(t * 3 - i * 0.55);
      drawGlow(ctx, this.theme.railLight, b.x, b.y, 0.42, 0.22 + chase * 0.2);
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.theme.railBulb;
    for (const b of this.bulbs) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Hot Corner marker: a pulsing neon ring and a ×3 tag on each hot part; flashes before it moves. */
  private drawHotCorner(ctx: CanvasRenderingContext2D) {
    const h = this.hot;
    if (!h) return;
    const th = this.theme;
    const warn = h.left <= HOT_CORNER.warnSeconds;
    const blink = warn ? (Math.sin(this.time * 18) > 0 ? 1 : 0.25) : 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    const fs = readableSize(ctx, 0.7, 16);
    const labelled: { x: number; y: number }[] = [];
    for (const sp of h.spots) {
      const R = sp.r + 0.35 + pulse * 0.15;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, th.jackpotAccent, sp.x, sp.y, R * 1.4, 0.35 * blink);
      ctx.strokeStyle = th.jackpotAccent;
      ctx.lineWidth = 0.16;
      ctx.globalAlpha = 0.9 * blink;
      ctx.setLineDash([0.45, 0.3]);
      ctx.lineDashOffset = -this.time * 2;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = blink;
      ctx.font = `italic 900 ${fs.toFixed(3)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = '#000000';
      const ty = sp.y - R - fs * 0.6;
      // one tag per cluster (a bank of three targets gets one ×3, not three)
      if (!labelled.some(l => Math.hypot(l.x - sp.x, l.y - sp.y) < 2.2)) {
        labelled.push(sp);
        ctx.strokeText(`×${HOT_CORNER.hot}`, sp.x, ty);
        ctx.fillStyle = th.jackpotAccent;
        ctx.fillText(`×${HOT_CORNER.hot}`, sp.x, ty);
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawMachinesDynamic(ctx: CanvasRenderingContext2D) {
    const th = this.theme;
    // bumpers: amber light segments + baseball cap, lit on hit
    for (const b of this.layout.bumpers) {
      const lit = Math.min(1, (this.lit.get(b.id) ?? 0) / 0.3);
      if (b.style === 'glove') {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, th.machineGlow, b.x, b.y, b.r * (1.8 + lit), 0.2 + lit * 0.9);
        if (lit > 0) drawGlow(ctx, th.impactCore, b.x, b.y + 0.1, b.r * 0.8, lit * 0.6);
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      const idle = 0.35 + 0.1 * Math.sin(this.time * 2 + b.x);
      const glowC = b.style === 'bonus' ? th.energySecondary : th.machineGlow;
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, glowC, b.x, b.y, b.r * (1.9 + lit * 0.8), idle * 0.35 + lit * 0.9);
      if (th.neon) {
        // neon tube ring: always on, breathes, flares on a hit
        const ring = b.style === 'bonus' ? th.energyPrimary : th.energySecondary;
        ctx.strokeStyle = ring;
        ctx.globalAlpha = Math.min(1, (0.45 + 0.15 * Math.sin(this.time * 3 + b.y)) * th.neon + lit * 0.5);
        ctx.lineWidth = 0.14 + lit * 0.08;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 1.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        drawGlow(ctx, ring, b.x, b.y, b.r * 1.5, 0.18 * th.neon);
      }
      ctx.globalCompositeOperation = 'source-over';
      // light segments around the red body
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        ctx.fillStyle = lit > 0.05 ? th.impactCore : th.machineGlow;
        ctx.globalAlpha = 0.55 + lit * 0.45;
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(a) * b.r * 0.86, b.y + Math.sin(a) * b.r * 0.86, b.r * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const squash = 1 - lit * 0.08; // cap dips when it fires
      drawBaseball(ctx, b.x, b.y - 0.1 * squash, b.r * 0.7 * squash, 0.5 + b.x);
      if (b.style === 'bonus') {
        ctx.fillStyle = th.jackpotAccent;
        star(ctx, b.x, b.y - 0.1 * squash, b.r * 0.32, b.r * 0.14);
        ctx.fill();
      }
      if (lit > 0) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, th.impactCore, b.x, b.y - 0.1, b.r * 0.9, lit * 0.6);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // targets lit overlays
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.layout.roundTargets) {
      const lit = this.lit.get(t.id) ?? 0;
      if (lit > 0) drawGlow(ctx, th.energyPrimary, t.x, t.y, t.r * 3, Math.min(1, lit * 2));
    }
    for (const t of this.layout.boxTargets) {
      const lit = this.lit.get(t.id) ?? 0;
      const fx = t.x + t.face.x * t.hw * 0.6, fy = t.y + t.face.y * t.hh * 0.6;
      if (t.style === 'jackpot') drawGlow(ctx, th.jackpotAccent, fx, fy, 2.6, 0.18 + Math.min(1, lit * 1.5));
      else if (lit > 0) drawGlow(ctx, th.energyPrimary, fx, fy, 1.4, Math.min(1, lit * 2));
    }
    for (const p of this.layout.posts) {
      const lit = this.lit.get(p.id) ?? 0;
      if (lit > 0) drawGlow(ctx, th.machineGlow, p.x, p.y, 0.8, lit * 3);
    }
    const mound = this.lit.get('mound') ?? 0;
    if (mound > 0) drawGlow(ctx, th.energyPrimary, MOUND.x, MOUND.y, 2, mound * 1.5);
    // slingshots: idle electric-blue breathe, bright pulse on kick
    for (const s of this.layout.slings) {
      const lit = Math.min(1, (this.lit.get(s.id) ?? 0) / 0.2);
      const mx = (s.face[0].x + s.face[1].x) / 2, my = (s.face[0].y + s.face[1].y) / 2;
      drawGlow(ctx, th.slingGlow, mx, my, 1.6 + lit, 0.25 + 0.06 * Math.sin(this.time * 2.5) + lit * 0.85);
      if (th.neon) {
        // neon outline along the sling body
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = th.slingGlow;
        ctx.lineWidth = 0.1;
        ctx.globalAlpha = (0.45 + 0.12 * Math.sin(this.time * 2.5)) * th.neon + lit * 0.4;
        ctx.beginPath();
        s.poly.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      if (lit > 0) {
        ctx.strokeStyle = th.energyPrimary;
        ctx.lineWidth = 0.12 + lit * 0.12;
        ctx.globalAlpha = lit;
        ctx.beginPath();
        ctx.moveTo(s.face[0].x, s.face[0].y);
        ctx.lineTo(s.face[1].x, s.face[1].y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const l of this.layout.lanes) {
      const lit = Math.min(1, (this.lit.get(l.id) ?? 0) / 0.5);
      const x = l.sensor.x;
      for (let i = 0; i < 4; i++) {
        const y = l.rail[0].y + 0.9 + i * 1.0;
        const wave = (Math.sin(this.time * (4 + lit * 10) - i * 1.3) + 1) / 2;
        const a = 0.18 + wave * 0.25 + lit * 0.6;
        ctx.globalCompositeOperation = 'lighter';
        if (lit > 0 || wave > 0.7) drawGlow(ctx, lit > 0 ? th.energyPrimary : th.machineGlow, x, y, 0.6, a * 0.7);
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = lit > 0 ? th.energyPrimary : th.machineGlow;
        ctx.globalAlpha = Math.min(1, a + 0.15);
        ctx.lineWidth = 0.11;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 0.32, y - 0.17);
        ctx.lineTo(x, y + 0.13);
        ctx.lineTo(x + 0.32, y - 0.17);
        underlay(ctx, th, 0.24);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    for (const s of this.layout.slings) this.drawSlingChevrons(ctx, s.face, s.kickDir, this.lit.get(s.id) ?? 0);
  }

  private drawBatter(ctx: CanvasRenderingContext2D, sim: Simulation) {
    const hands = sim.hands;
    this.whiffAt = { x: hands.x, y: hands.y - 1.6 };
    const S = 1.45; // batter art scale (cosmetic only; collision comes from config.swing)
    const bx = sim.batterBodyX, by = config.batter.handsY + 0.42;
    const angle = sim.batAngle;
    const state = sim.swingState;
    const batOnTop = Math.sin(angle) < -0.15;

    // swing smear (purely visual, attached to the bat)
    if (state === 'active') {
      const prev = angle + (config.swing.restAngle - config.swing.endAngle) * 0.14;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(hands.x, hands.y, 0.4, hands.x, hands.y, config.swing.length + 0.1);
      g.addColorStop(0, this.theme.energyPrimary + '00');
      g.addColorStop(0.7, this.theme.energyPrimary + '22');
      g.addColorStop(1, this.theme.energyPrimary + '66');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hands.x, hands.y);
      ctx.arc(hands.x, hands.y, config.swing.length + 0.1, angle, Math.min(prev, config.swing.restAngle));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ground shadow + batter's circle
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(bx + 0.25, by + 0.45, 0.62 * S, 0.4 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!batOnTop) this.drawBat(ctx, hands.x, hands.y, angle);

    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(S, S);
    const hx = (hands.x - bx) / S, hy = (hands.y - by) / S;
    // cleats + legs
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#d7dbe2';
      ctx.beginPath();
      ctx.ellipse(s * 0.25, 0.32, 0.16, 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#16203a';
      ctx.beginPath();
      ctx.ellipse(s * 0.27, 0.52, 0.13, 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // jersey, seen from behind
    const j = ctx.createLinearGradient(-0.5, -0.4, 0.5, 0.4);
    j.addColorStop(0, '#ffffff');
    j.addColorStop(1, '#c3c8d2');
    ctx.fillStyle = j;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.5, 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#c4222b';
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.46, 0.12);
    ctx.quadraticCurveTo(0, 0.3, 0.46, 0.12);
    ctx.stroke();
    ctx.fillStyle = '#c4222b';
    ctx.font = `italic 800 0.34px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('17', 0, 0.06);
    // arms reaching to the hands
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const sx = s * 0.4, sy = -0.12;
      ctx.strokeStyle = '#eef0f4';
      ctx.lineWidth = 0.17;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + hx) / 2, sy - 0.12, hx - 0.03 * s, hy + 0.02);
      ctx.stroke();
      ctx.strokeStyle = '#c4222b';
      ctx.lineWidth = 0.18;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (hx - sx) * 0.16, sy + (hy - sy) * 0.16);
      ctx.stroke();
    }
    // helmet
    const hg = ctx.createRadialGradient(-0.1, -0.38, 0.03, 0, -0.28, 0.3);
    hg.addColorStop(0, '#ff7b70');
    hg.addColorStop(0.55, '#d0202b');
    hg.addColorStop(1, '#740b12');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(0, -0.28, 0.27, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c1118';
    ctx.beginPath();
    ctx.ellipse(0.02, -0.52, 0.19, 0.07, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#9e131b';
    ctx.beginPath();
    ctx.ellipse(-0.25, -0.24, 0.08, 0.12, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.ellipse(-0.1, -0.38, 0.08, 0.04, -0.6, 0, Math.PI * 2);
    ctx.fill();
    // batting gloves
    ctx.fillStyle = '#1d2b4a';
    ctx.beginPath();
    ctx.arc(hx, hy, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (batOnTop) this.drawBat(ctx, hands.x, hands.y, angle);
  }

  private drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
    const L = config.swing.length;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.save();
    ctx.translate(0.1, 0.14);
    batShape(ctx, L);
    ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, -0.14, 0, 0.14);
    g.addColorStop(0, '#f5d39b');
    g.addColorStop(0.5, '#d9a35d');
    g.addColorStop(1, '#8c5b2a');
    ctx.fillStyle = g;
    batShape(ctx, L);
    ctx.fill();
    const lit = this.lit.get('bat') ?? 0;
    if (lit > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = lit * 4;
      ctx.fillStyle = this.theme.energyPrimary;
      batShape(ctx, L);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = '#3a2614';
    ctx.beginPath();
    ctx.arc(0.02, 0, 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Per-ball trails, keyed by ball id. */
  trails = new Map<number, { pts: Pt[]; rot: number }>();

  /** Draw floor balls or raised (ramp) balls. Raised balls are drawn larger with a far shadow. */
  private drawBalls(ctx: CanvasRenderingContext2D, sim: Simulation, dt: number, layer: 'floor' | 'raised') {
    const r = config.ball.radius;
    if (!sim.balls.length) {
      if (layer === 'floor' && sim.rules.phase !== 'over') {
        // waiting on Ready: the next pitch sits on the mound
        this.trails.clear();
        const p = { x: config.pitch.x, y: config.pitch.y };
        this.drawOneBall(ctx, p, { x: 0, y: 0 }, 0, 0);
        ctx.strokeStyle = this.theme.energyPrimary;
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(this.time * 5);
        ctx.lineWidth = 0.06;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 0.18, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      return;
    }
    const live = new Set(sim.balls.map(b => b.id));
    for (const id of this.trails.keys()) if (!live.has(id)) this.trails.delete(id);
    for (const b of sim.balls) {
      const raised = b.mode === 'ramp' || b.mode === 'drop';
      if ((layer === 'raised') !== raised) continue;
      let v = { x: 0, y: 0 };
      if (b.mode === 'field') {
        const bv = b.body.getLinearVelocity();
        v = { x: bv.x, y: bv.y };
      } else if (b.mode === 'ramp' || b.mode === 'drop') {
        const prev = this.trails.get(b.id)?.pts.at(-1);
        if (prev && dt > 0) v = { x: (b.pos.x - prev.x) / dt, y: (b.pos.y - prev.y) / dt };
      }
      let tr = this.trails.get(b.id);
      if (!tr) this.trails.set(b.id, (tr = { pts: [], rot: 0 }));
      const speed = Math.hypot(v.x, v.y);
      tr.rot += ((speed * dt) / r) * 0.5;
      tr.pts.push({ ...b.pos });
      if (tr.pts.length > 14) tr.pts.shift();
      if (b.mode === 'held') {
        // tucked in the glove: drawn by the scoop, plus a gentle pulse here
        this.drawOneBall(ctx, b.pos, v, tr.rot, 0, 0.9);
        continue;
      }
      if (tr.pts.length > 2 && speed > 6) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        const k = Math.min(1, (speed - 6) / 18);
        for (let i = 1; i < tr.pts.length; i++) {
          const a = tr.pts[i - 1], c = tr.pts[i], f = i / tr.pts.length;
          if (Math.hypot(c.x - a.x, c.y - a.y) > 1.5) continue; // no streak across a release jump
          ctx.strokeStyle = this.theme.ballTrail;
          ctx.globalAlpha = f * 0.55 * k;
          ctx.lineWidth = r * 1.6 * f * (1 + b.height * 0.3);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (b.deckRally) this.drawRallyHalo(ctx, b.pos, b.height);
      this.drawOneBall(ctx, b.pos, v, tr.rot, b.height);
    }
  }

  /** V2.2: a ball with Upper Deck Rally wears a pulsing gold ring (theme jackpot accent). */
  private drawRallyHalo(ctx: CanvasRenderingContext2D, p: Pt, height: number) {
    const r = config.ball.radius * (1 + height * 0.25);
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, this.theme.jackpotAccent, p.x, p.y, r * 2.6, 0.22 + 0.18 * pulse);
    ctx.strokeStyle = this.theme.jackpotAccent;
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 0.16 + 0.05 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawOneBall(ctx: CanvasRenderingContext2D, p: Pt, v: Pt, rot: number, height: number, scale = 1) {
    const r = config.ball.radius * scale * (1 + height * 0.28);
    // shadow falls further away the higher the ball is
    ctx.fillStyle = `rgba(0,0,0,${0.42 - height * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(p.x + 0.12 + height * 0.45, p.y + 0.18 + height * 0.6, r * (1.05 + height * 0.2), r * (0.9 + height * 0.15), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, height > 0.05 ? this.theme.energyPrimary : '#ffffff', p.x, p.y, r * 2.6, 0.22 + height * 0.25);
    ctx.globalCompositeOperation = 'source-over';
    drawBaseball(ctx, p.x, p.y, r, Math.atan2(v.y, v.x) + rot);
  }

  private drawDebug(ctx: CanvasRenderingContext2D, sim: Simulation) {
    const c = config.swing, h = sim.hands, a = sim.batAngle;
    const reach = c.radius + config.ball.radius + c.tolerance;
    ctx.save();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = sim.swingState === 'active' ? '#00ff88' : '#ff4466';
    ctx.lineCap = 'round';
    const ax = h.x + Math.cos(a) * c.minReach, ay = h.y + Math.sin(a) * c.minReach;
    const bx = h.x + Math.cos(a) * c.length, by = h.y + Math.sin(a) * c.length;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = (reach - config.ball.radius) * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#ffee00';
    ctx.beginPath();
    ctx.moveTo(0, h.y + c.battingLine);
    ctx.lineTo(20, h.y + c.battingLine);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.x, h.y, c.length + reach - config.ball.radius, 0, Math.PI * 2);
    ctx.setLineDash([0.15, 0.15]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (this.lastContact) {
      const l = this.lastContact;
      ctx.strokeStyle = '#00ffff';
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x + l.vx * 0.2, l.y + l.vy * 0.2);
      ctx.stroke();
    }
    if (sim.ball) {
      const p = sim.ball.getPosition(), v = sim.ball.getLinearVelocity();
      const el = checkEligibility({ t: sim.swingT, dt: 0, hands: h, ball: p, vel: v, ballRadius: config.ball.radius, alreadyHitThisSwing: sim.balls[0]?.hitSwingId === sim.swingId });
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 0.5px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`swing:${sim.swingState} elig:${el} v:${Math.hypot(v.x, v.y).toFixed(1)}`, 0.9, 31.2);
    }
    ctx.restore();
  }
}

/** Tapered bat along +x from the knob (vertical along -y when `vertical`). */
function batShape(ctx: CanvasRenderingContext2D, L: number, vertical = false) {
  if (vertical) {
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-L * 0.45, 0);
    batShape(ctx, L);
    ctx.restore();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(0, -0.05);
  ctx.lineTo(L * 0.38, -0.055);
  ctx.quadraticCurveTo(L * 0.6, -0.08, L * 0.78, -0.125);
  ctx.lineTo(L - 0.12, -0.13);
  ctx.arc(L - 0.12, 0, 0.13, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(L * 0.78, 0.125);
  ctx.quadraticCurveTo(L * 0.6, 0.08, L * 0.38, 0.055);
  ctx.lineTo(0, 0.05);
  ctx.closePath();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}
