import { UPPER_DECK } from '../machines/sections.ts';
/**
 * Art for the special mechanisms (ramps, scoop, splitter, gate). Everything is drawn from the same
 * layout data the physics uses, and every VFX color comes from theme tokens.
 *
 * Ramps are drawn ABOVE floor balls as see-through glass channels with chrome rails, so a ball
 * rolling underneath stays visible and a ball on top is drawn larger with a far shadow.
 */
import { config } from '../config.ts';
import { dropLanding, rampAt, rampHeight, type Pt, type RampPath, type SpinnerDef } from '../machines/mechanisms.ts';
import { scoopArc, splitterPoly } from '../physics/board.ts';
import type { Simulation, SimEvent } from '../physics/sim.ts';
import { drawGlow, readableSize, underlay, VFX_TEXT } from './vfx.ts';
import { BROADCAST_CLASSIC, derived, rgba, type Materials, type Theme } from './theme.ts';
import type { MultGateDef } from '../machines/mechanisms.ts';

const W_TABLE = 20;

/** Materials for the static pass (set at the start of drawMachinesFloorStatic). */
let mat: Materials = BROADCAST_CLASSIC.m;
import { drawBaseball, type GameView } from './game.ts';

const FONT = '"Barlow Condensed", "Arial Narrow", sans-serif';
const RAIL = config.ball.radius + 0.2;

function poly(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

function offsetLine(r: RampPath, d: number): Pt[] {
  return r.pts.map((p, i) => {
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: p.x + (-(b.y - a.y) / l) * d, y: p.y + ((b.x - a.x) / l) * d };
  });
}

/** Shadow offset for a point at visual height h (matches the raised ball's shadow). */
const lift = (h: number) => ({ x: h * 0.45, y: h * 0.6 });

// ───────────────────────── static (pre-rendered) ─────────────────────────

/** Floor-level parts drawn into the static layer, plus the raised ramp layer. */
export function drawMachinesFloorStatic(ctx: CanvasRenderingContext2D, view: GameView) {
  const L = view.layout;
  mat = view.theme.m;
  for (const s of L.scoops) drawScoopStatic(ctx, s);
  for (const s of L.splitters) drawSplitterStatic(ctx, s);
  for (const g of L.gates) drawGateStatic(ctx, g, view.theme);
  for (const r of L.ramps) drawRampMouthFloor(ctx, r);
  for (const sp of L.spinners) drawSpinnerStatic(ctx, sp);
  for (const g of L.multGates) drawMultGateStatic(ctx, g);
  for (const r of L.ramps) if (r.def.exit?.mode === 'drop') drawLandingMarker(ctx, r, view.theme);

  // Raised ramps go in their own layer, composited above floor balls each frame.
  const rl = view.rampLayer.getContext('2d')!;
  rl.setTransform(1, 0, 0, 1, 0, 0);
  rl.clearRect(0, 0, view.rampLayer.width, view.rampLayer.height);
  view.layerTransform(rl);
  for (const r of L.ramps) drawRampRaised(rl, r, view.theme);
}

function drawRampMouthFloor(ctx: CanvasRenderingContext2D, r: RampPath) {
  // dark entrance apron on the turf in front of the mouth
  const e = r.entryDir, m = r.mouth;
  const g = ctx.createLinearGradient(m.x - e.x * 1.2, m.y - e.y * 1.2, m.x, m.y);
  g.addColorStop(0, 'rgba(6,12,24,0)');
  g.addColorStop(1, 'rgba(6,12,24,0.55)');
  ctx.fillStyle = g;
  const n = r.mouthNormal, h = r.def.mouthWidth / 2;
  poly(ctx, [
    { x: m.x + n.x * h, y: m.y + n.y * h },
    { x: m.x - n.x * h, y: m.y - n.y * h },
    { x: m.x - n.x * h - e.x * 1.2, y: m.y - n.y * h - e.y * 1.2 },
    { x: m.x + n.x * h - e.x * 1.2, y: m.y + n.y * h - e.y * 1.2 },
  ]);
  ctx.fill();
  for (const p of r.posts) drawChromePost(ctx, p.x, p.y, 0.22);
}

function drawRampRaised(ctx: CanvasRenderingContext2D, r: RampPath, th: Theme) {
  const hs = r.cum.map(s => rampHeight(r, s));
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // shadow on the field, displaced by height
  ctx.strokeStyle = 'rgba(0,0,0,0.26)';
  ctx.lineWidth = RAIL * 2 + 0.1;
  ctx.beginPath();
  r.pts.forEach((p, i) => {
    const o = lift(hs[i]);
    if (i === 0) ctx.moveTo(p.x + o.x, p.y + o.y);
    else ctx.lineTo(p.x + o.x, p.y + o.y);
  });
  ctx.stroke();
  // support struts
  ctx.strokeStyle = '#3a4656';
  ctx.lineWidth = 0.1;
  for (let s = 1.5; s < r.length - 1; s += 2.6) {
    const h = rampHeight(r, s);
    if (h < 0.5) continue;
    const { p } = rampAt(r, s), o = lift(h);
    for (const side of [-1, 1]) {
      const q = offsetLine(r, side * RAIL);
      const i = Math.min(q.length - 1, r.cum.findIndex(c => c >= s));
      ctx.beginPath();
      ctx.moveTo(q[i].x, q[i].y);
      ctx.lineTo(q[i].x + o.x, q[i].y + o.y);
      ctx.stroke();
    }
    void p;
  }
  // see-through glass floor
  ctx.strokeStyle = derived(th).glass;
  ctx.lineWidth = RAIL * 2;
  poly(ctx, r.pts);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = RAIL * 0.7;
  poly(ctx, offsetLine(r, -RAIL * 0.35));
  ctx.stroke();
  // chrome side rails (dark edge, metal, highlight)
  for (const side of [-1, 1]) {
    const q = offsetLine(r, side * RAIL);
    ctx.strokeStyle = '#0f1826';
    ctx.lineWidth = 0.17;
    poly(ctx, q);
    ctx.stroke();
    ctx.strokeStyle = '#c9d3df';
    ctx.lineWidth = 0.1;
    poly(ctx, q);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 0.03;
    poly(ctx, q);
    ctx.stroke();
  }
  // static chevrons along the ride
  ctx.strokeStyle = derived(th).chevronStatic;
  ctx.lineWidth = 0.07;
  for (let s = 1.2; s < r.length - 0.8; s += 1.5) chevron(ctx, r, s, 0.2);
  // mouth arch + name plate
  const [a, b] = r.posts;
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.16;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  const plate = { x: r.mouth.x + r.entryDir.x * 0.75, y: r.mouth.y + r.entryDir.y * 0.75 };
  ctx.save();
  ctx.translate(plate.x, plate.y);
  ctx.fillStyle = '#0d1a33e6';
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.roundRect(-1.35, -0.33, 2.7, 0.66, 0.14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffe8a8';
  ctx.font = `italic 800 0.56px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(r.def.name, 0, 0.02);
  ctx.restore();
  const ex = r.exit, en = { x: -r.exitDir.y, y: r.exitDir.x };
  if (r.def.exit?.mode === 'drop') {
    // open end: rails stop short with gold caps, the ball visibly leaves the raised level here
    ctx.fillStyle = mat.trim;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(ex.x + en.x * RAIL * side, ex.y + en.y * RAIL * side, 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(th.jackpotAccent, 0.8);
    ctx.lineWidth = 0.08;
    const tip = { x: ex.x + r.exitDir.x * 0.25, y: ex.y + r.exitDir.y * 0.25 };
    ctx.beginPath();
    ctx.moveTo(tip.x - r.exitDir.x * 0.3 + en.x * 0.28, tip.y - r.exitDir.y * 0.3 + en.y * 0.28);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(tip.x - r.exitDir.x * 0.3 - en.x * 0.28, tip.y - r.exitDir.y * 0.3 - en.y * 0.28);
    ctx.stroke();
  } else {
    ctx.strokeStyle = '#c9d3df';
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(ex.x + en.x * RAIL, ex.y + en.y * RAIL);
    ctx.lineTo(ex.x - en.x * RAIL, ex.y - en.y * RAIL);
    ctx.stroke();
  }
  if (r.cpS.length) for (let i = 0; i < r.cpS.length; i++) drawCheckpointBar(ctx, r, i);
  else if (r.gateS > 0) drawRampGateArch(ctx, r);
}

/** A checkpoint: a thin lamp bar across the channel (static part; lamps are drawn live). The finish is wider. */
function drawCheckpointBar(ctx: CanvasRenderingContext2D, r: RampPath, i: number) {
  const { p, t } = rampAt(r, r.cpS[i]);
  const n = { x: -t.y, y: t.x }, last = i === r.cpS.length - 1, w = RAIL + (last ? 0.2 : 0.08);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#05080f';
  ctx.lineWidth = last ? 0.26 : 0.18;
  ctx.beginPath();
  ctx.moveTo(p.x + n.x * w, p.y + n.y * w);
  ctx.lineTo(p.x - n.x * w, p.y - n.y * w);
  ctx.stroke();
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.045;
  ctx.stroke();
  if (last) for (const side of [-1, 1]) drawChromePost(ctx, p.x + n.x * w * side, p.y + n.y * w * side, 0.15);
}

/** The mid-ramp scoring gate: an arch over the channel with a lamp bar. */
function drawRampGateArch(ctx: CanvasRenderingContext2D, r: RampPath) {
  const { p, t } = rampAt(r, r.gateS);
  const n = { x: -t.y, y: t.x }, w = RAIL + 0.22;
  ctx.save();
  ctx.translate(0.25, 0.32);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.34;
  ctx.beginPath();
  ctx.moveTo(p.x + n.x * w, p.y + n.y * w);
  ctx.lineTo(p.x - n.x * w, p.y - n.y * w);
  ctx.stroke();
  ctx.restore();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0d1a33';
  ctx.lineWidth = 0.36;
  ctx.beginPath();
  ctx.moveTo(p.x + n.x * w, p.y + n.y * w);
  ctx.lineTo(p.x - n.x * w, p.y - n.y * w);
  ctx.stroke();
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  for (const side of [-1, 1]) drawChromePost(ctx, p.x + n.x * w * side, p.y + n.y * w * side, 0.17);
}

/** Painted ring where a drop-exit ball lands (mid exit speed). */
function drawLandingMarker(ctx: CanvasRenderingContext2D, r: RampPath, th: Theme) {
  const color = th.energyPrimary;
  const { p } = dropLanding(r, (r.def.exitMin + r.def.exitMax) / 2, config.gravity);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.15, 0.12]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 0.62, 0, Math.PI * 2);
  underlay(ctx, th, 0.16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(p.x, p.y, 0.12, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawSpinnerStatic(ctx: CanvasRenderingContext2D, sp: SpinnerDef) {
  ctx.strokeStyle = '#3a4656';
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(sp.a.x, sp.a.y);
  ctx.lineTo(sp.b.x, sp.b.y);
  ctx.stroke();
  for (const q of [sp.a, sp.b]) drawChromePost(ctx, q.x, q.y, 0.12);
}

function chevron(ctx: CanvasRenderingContext2D, r: RampPath, s: number, size: number, outline?: Theme) {
  const { p, t } = rampAt(r, s);
  const n = { x: -t.y, y: t.x };
  ctx.beginPath();
  ctx.moveTo(p.x - t.x * size + n.x * size * 1.3, p.y - t.y * size + n.y * size * 1.3);
  ctx.lineTo(p.x + t.x * size * 0.6, p.y + t.y * size * 0.6);
  ctx.lineTo(p.x - t.x * size - n.x * size * 1.3, p.y - t.y * size - n.y * size * 1.3);
  if (outline) underlay(ctx, outline, ctx.lineWidth * 2.4);
  ctx.stroke();
}

function drawChromePost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.arc(x + 0.08, y + 0.12, r * 1.15, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r * 1.2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#aab4c2');
  g.addColorStop(1, '#3a4252');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = mat.trim;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

function drawScoopStatic(ctx: CanvasRenderingContext2D, s: import('../machines/mechanisms.ts').ScoopDef) {
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(s.x + 0.2, s.y + 0.3, s.cupR * 1.35, s.cupR * 1.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // pocket
  const pg = ctx.createRadialGradient(s.x, s.y, 0.1, s.x, s.y, s.cupR);
  pg.addColorStop(0, '#5a2f10');
  pg.addColorStop(1, '#2b1607');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(s.x, s.y, s.cupR, 0, Math.PI * 2);
  ctx.fill();
  // finger lobes on the closed side
  const lob = ctx.createRadialGradient(s.x - 0.3, s.y - 0.3, 0.1, s.x, s.y, s.cupR * 1.5);
  lob.addColorStop(0, '#e6a862');
  lob.addColorStop(0.7, '#a8652a');
  lob.addColorStop(1, '#5e3412');
  ctx.fillStyle = lob;
  const back = s.mouthAngle + Math.PI;
  for (let i = -2; i <= 2; i++) {
    const a = back + i * 0.42;
    ctx.beginPath();
    ctx.ellipse(s.x + Math.cos(a) * (s.cupR + 0.12), s.y + Math.sin(a) * (s.cupR + 0.12), 0.24, 0.36, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // leather cup wall following the collision arc
  ctx.lineCap = 'round';
  ctx.strokeStyle = lob;
  ctx.lineWidth = 0.32;
  poly(ctx, scoopArc(s));
  ctx.stroke();
  ctx.strokeStyle = '#f0d2a0';
  ctx.lineWidth = 0.045;
  ctx.setLineDash([0.09, 0.09]);
  poly(ctx, scoopArc(s, s.cupR + 0.02));
  ctx.stroke();
  ctx.setLineDash([]);
  // gold rim at the lips of the opening
  for (const a of [s.mouthAngle + s.mouthHalf, s.mouthAngle - s.mouthHalf]) drawChromePost(ctx, s.x + Math.cos(a) * s.cupR, s.y + Math.sin(a) * s.cupR, 0.14);
}

function drawSplitterStatic(ctx: CanvasRenderingContext2D, s: import('../machines/mechanisms.ts').SplitterDef) {
  const pts = splitterPoly(s);
  ctx.save();
  ctx.translate(0.1, 0.16);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  poly(ctx, pts);
  ctx.fill();
  ctx.restore();
  const g = ctx.createLinearGradient(0, s.y - s.hh - 0.35, 0, s.y + s.hh);
  g.addColorStop(0, mat.splitterFace[0]);
  g.addColorStop(1, mat.splitterFace[1]);
  ctx.fillStyle = g;
  poly(ctx, pts);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.07;
  ctx.stroke();
  ctx.fillStyle = '#ffe8a8';
  ctx.font = `italic 800 0.5px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MULTI', s.x, s.y + 0.03);
  // launch hatch (dark well with a chrome rim)
  const h = s.hatch;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.arc(h.x + 0.06, h.y + 0.1, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9d3df';
  ctx.beginPath();
  ctx.arc(h.x, h.y, 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#060b16';
  ctx.beginPath();
  ctx.arc(h.x, h.y, 0.38, 0, Math.PI * 2);
  ctx.fill();
}

function drawGateStatic(ctx: CanvasRenderingContext2D, g: import('../machines/mechanisms.ts').GateDef, th: Theme) {
  // floor arrow showing which way through scores
  const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  ctx.strokeStyle = derived(th).gateArrow;
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const o = 0.35 + i * 0.5;
    const p = { x: c.x - g.dir.x * o, y: c.y - g.dir.y * o }, n = { x: -g.dir.y, y: g.dir.x };
    ctx.beginPath();
    ctx.moveTo(p.x - g.dir.x * 0.22 + n.x * 0.32, p.y - g.dir.y * 0.22 + n.y * 0.32);
    ctx.lineTo(p.x + g.dir.x * 0.1, p.y + g.dir.y * 0.1);
    ctx.lineTo(p.x - g.dir.x * 0.22 - n.x * 0.32, p.y - g.dir.y * 0.22 - n.y * 0.32);
    ctx.stroke();
  }
  // light bar between the posts: the gate itself
  ctx.strokeStyle = '#0d1a33';
  ctx.lineWidth = 0.22;
  ctx.beginPath();
  ctx.moveTo(g.a.x, g.a.y);
  ctx.lineTo(g.b.x, g.b.y);
  ctx.stroke();
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.12, 0.1]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (g.posts !== false) for (const p of [g.a, g.b]) drawChromePost(ctx, p.x, p.y, g.postR + 0.06);
  ctx.fillStyle = '#ffe8a8';
  ctx.font = `italic 800 0.4px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${g.label ?? 'GATE'} ↑ +${g.points}`, c.x, c.y + (g.posts === false ? 0.55 : 1.05));
}

/** Multiplier gate: a lamp bar across the top of the alley with an "×" badge (sensor only, no collision). */
function drawMultGateStatic(ctx: CanvasRenderingContext2D, g: MultGateDef) {
  const y = g.a.y;
  // alley span only (the sensor reaches a touch past the rail so angled exits still count)
  const x0 = g.side === 'left' ? 0.68 : W_TABLE - 2.75, x1 = g.side === 'left' ? 2.75 : W_TABLE - 0.68;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#05080f';
  ctx.lineWidth = 0.26;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.strokeStyle = rgba(mat.multGlow, 0.55);
  ctx.lineWidth = 0.08;
  ctx.setLineDash([0.16, 0.12]);
  ctx.stroke();
  ctx.setLineDash([]);
  // badge just above the bar, in the alley mouth (the lane spinner mount sits below at y=5.6)
  const c = { x: (x0 + x1) / 2, y: y - 0.5 };
  ctx.fillStyle = '#05080f';
  ctx.beginPath();
  ctx.arc(c.x, c.y, 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = mat.trim;
  ctx.lineWidth = 0.05;
  ctx.stroke();
  ctx.fillStyle = mat.multGlow;
  ctx.font = `italic 800 0.42px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('×', c.x, c.y + 0.02);
}

// ───────────────────────── dynamic ─────────────────────────

export function drawMachinesFloorDynamic(ctx: CanvasRenderingContext2D, view: GameView, sim: Simulation) {
  const th = view.theme, L = view.layout, t = view.time;
  ctx.globalCompositeOperation = 'lighter';
  for (const r of L.ramps) {
    // inviting pulse in front of each mouth; bright when entered
    const lit = view.lit.get(r.def.id + '-mouth') ?? 0;
    const m = r.mouth, e = r.entryDir;
    drawGlow(ctx, lit > 0 ? th.energyPrimary : th.jackpotAccent, m.x - e.x * 0.4, m.y - e.y * 0.4, 1.1, 0.16 + 0.1 * Math.sin(t * 3) + lit * 1.5);
  }
  for (const s of L.scoops) {
    const held = sim.balls.find(b => b.held?.scoop === s);
    const lit = view.lit.get(s.id) ?? 0;
    drawGlow(ctx, th.machineGlow, s.x, s.y, s.cupR * 2, 0.15 + (held ? 0.35 + 0.2 * Math.sin(t * 18) : 0) + lit * 1.2);
  }
  for (const s of L.splitters) {
    const st = sim.splitters.get(s.id);
    const lit = view.lit.get(s.id) ?? 0;
    if (lit > 0) drawGlow(ctx, th.energySecondary, s.x, s.y, 1.6, lit * 2);
    if (st?.launchAt !== null && st?.launchAt !== undefined) drawGlow(ctx, th.energySecondary, s.hatch.x, s.hatch.y, 1.4, 0.6 + 0.4 * Math.sin(t * 40));
  }
  for (const g of L.multGates) {
    const lit = view.lit.get(g.id) ?? 0;
    const x0 = g.side === 'left' ? 0.68 : W_TABLE - 2.75, x1 = g.side === 'left' ? 2.75 : W_TABLE - 0.68;
    const cx = (x0 + x1) / 2;
    drawGlow(ctx, th.m.multGlow, cx, g.a.y - 0.5, 0.7 + lit * 1.4, 0.2 + 0.08 * Math.sin(t * 4 + cx) + lit * 2.2);
    if (lit > 0) {
      ctx.strokeStyle = rgba(th.m.multGlow, Math.min(1, lit * 2.5));
      ctx.lineWidth = 0.12;
      ctx.beginPath();
      ctx.moveTo(x0, g.a.y);
      ctx.lineTo(x1, g.a.y);
      ctx.stroke();
    }
  }
  for (const g of L.gates) {
    const lit = view.lit.get(g.id) ?? 0;
    const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
    drawGlow(ctx, lit > 0 ? th.energyPrimary : th.jackpotAccent, c.x, c.y, 1.0 + lit, 0.18 + 0.08 * Math.sin(t * 3) + lit * 2);
  }
  ctx.globalCompositeOperation = 'source-over';

  // spinners: the flap turns while it has spins left
  for (const sp of L.spinners) {
    const left = sim.spinners.get(sp.id) ?? 0;
    const st = view.spin.get(sp.id) ?? { angle: 0 };
    if (left > 0) {
      const rate = 14; // spins per second
      const used = Math.min(left, rate * view.lastDt);
      sim.spinners.set(sp.id, left - used);
      st.angle += used * Math.PI * 2;
    }
    view.spin.set(sp.id, st);
    const c = { x: (sp.a.x + sp.b.x) / 2, y: (sp.a.y + sp.b.y) / 2 };
    const L2 = Math.hypot(sp.b.x - sp.a.x, sp.b.y - sp.a.y), u = { x: (sp.b.x - sp.a.x) / L2, y: (sp.b.y - sp.a.y) / L2 };
    const w = Math.abs(Math.cos(st.angle)) * 0.28 + 0.03;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.atan2(u.y, u.x));
    ctx.fillStyle = left > 0 ? th.impactCore : '#d5dde8';
    ctx.fillRect(-L2 / 2 + 0.15, -w / 2, L2 - 0.3, w);
    ctx.fillStyle = th.jackpotAccent;
    ctx.fillRect(-0.12, -w / 2, 0.24, w);
    ctx.restore();
    if (left > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, th.energyPrimary, c.x, c.y, 1.1, Math.min(1, left / 6) * 0.8);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // bank progress lamps on each target face
  for (const bank of L.banks) {
    const done = sim.banks.get(bank.id);
    const flash = view.lit.get(bank.id) ?? 0;
    for (const id of bank.targetIds) {
      const t = L.boxTargets.find(t => t.id === id);
      if (!t) continue;
      const on = done?.has(id) || flash > 0;
      const lx = t.x + t.face.x * (t.hw + 0.28), ly = t.y;
      ctx.fillStyle = on ? th.jackpotAccent : th.lampOff;
      ctx.beginPath();
      ctx.arc(lx, ly, 0.13, 0, Math.PI * 2);
      ctx.fill();
      if (on) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, flash > 0 ? th.impactCore : th.jackpotAccent, lx, ly, 0.55 + flash, 0.7 + flash);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  for (const s of L.scoops) {
    const held = sim.balls.find(b => b.held?.scoop === s);
    if (held?.held) {
      // hold timer ring
      const k = held.held.t / s.holdSeconds;
      ctx.strokeStyle = th.energyPrimary;
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.cupR + 0.32, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
      underlay(ctx, th, 0.2);
      ctx.stroke();
    }
  }
  for (const s of L.splitters) {
    const st = sim.splitters.get(s.id);
    if (!st) continue;
    const cooling = sim.time < st.readyAt;
    for (let i = 0; i < s.hitsToArm; i++) {
      const x = s.x + (i - (s.hitsToArm - 1) / 2) * 0.42, y = s.y - s.hh - 0.02;
      const on = i < st.charge || st.launchAt !== null;
      ctx.fillStyle = cooling ? '#3a4458' : on ? th.energySecondary : th.lampOffSecondary;
      ctx.beginPath();
      ctx.arc(x, y, 0.11, 0, Math.PI * 2);
      ctx.fill();
      if (on && !cooling) {
        ctx.globalCompositeOperation = 'lighter';
        drawGlow(ctx, th.energySecondary, x, y, 0.45, 0.8);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // hatch doors part while it fires
    const open = st.launchAt !== null ? Math.min(1, 1 - (st.launchAt - sim.time) / 0.35) : Math.max(0, (view.lit.get(s.id + '-hatch') ?? 0) / 0.4);
    ctx.fillStyle = '#4c5666';
    const hw = 0.38 * (1 - open);
    if (hw > 0.01) {
      ctx.fillRect(s.hatch.x - 0.38, s.hatch.y - 0.3, hw, 0.6);
      ctx.fillRect(s.hatch.x + 0.38 - hw, s.hatch.y - 0.3, hw, 0.6);
    }
  }
}

/** Raised ramp layer (pre-rendered) + ramp lights, drawn above floor balls. */
export function drawMachinesRaised(ctx: CanvasRenderingContext2D, view: GameView, sim: Simulation) {
  if (!view.layout.ramps.length) return;
  ctx.save();
  view.blitLayer(ctx, view.rampLayer);
  ctx.restore();
  const th = view.theme;
  for (const r of view.layout.ramps) {
    const done = view.lit.get(r.def.id) ?? 0;
    const riders = sim.balls.filter(b => b.ramp?.r === r);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let s = 1.2; s < r.length - 0.8; s += 1.5) {
      // moving light: chevrons just ahead of a riding ball glow; the whole ramp flashes on completion
      let a = done > 0 ? Math.min(1, done * 1.6) : 0;
      for (const b of riders) {
        const d = (s - b.ramp!.s) * b.ramp!.dir;
        if (d > -0.5 && d < 3.5) a = Math.max(a, 1 - Math.abs(d - 1) / 3);
      }
      if (a <= 0.02) continue;
      ctx.globalAlpha = a;
      ctx.strokeStyle = th.energyPrimary;
      ctx.lineWidth = 0.1;
      chevron(ctx, r, s, 0.22, th);
      ctx.globalCompositeOperation = 'lighter';
      const { p } = rampAt(r, s);
      drawGlow(ctx, th.energyPrimary, p.x, p.y, 0.7, a * 0.6);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    if (r.cpS.length) {
      // Checkpoint lamps: dim idle chase; amber once this ride's rider has paid it; white-hot flash on payout.
      const paid = riders.reduce((m, b) => Math.max(m, b.ramp!.dir === 1 ? b.ramp!.cp : 0), 0);
      const chase = Math.floor(view.time * 8) % r.cpS.length;
      for (let i = 0; i < r.cpS.length; i++) {
        const { p, t } = rampAt(r, r.cpS[i]);
        const n = { x: -t.y, y: t.x }, w = RAIL + 0.02;
        const lit = view.lit.get(`${r.def.id}-cp${i}`) ?? 0;
        const color = lit > 0 ? th.impactCore : i < paid || done > 0 ? th.jackpotAccent : i === chase ? th.machineGlow : th.lampOffAccent;
        ctx.fillStyle = color;
        for (const k of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(p.x + n.x * w * k, p.y + n.y * w * k, 0.085, 0, Math.PI * 2);
          ctx.fill();
        }
        if (lit > 0 || i < paid) {
          ctx.globalCompositeOperation = 'lighter';
          drawGlow(ctx, lit > 0 ? th.energySecondary : th.jackpotAccent, p.x, p.y, 0.6 + lit * 2.4, 0.25 + lit * 1.8);
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    } else if (r.gateS > 0) {
      const { p, t } = rampAt(r, r.gateS);
      const n = { x: -t.y, y: t.x }, w = RAIL + 0.22;
      const lit = view.lit.get(r.def.id + '-gate') ?? 0;
      // idle: slow lamp chase on the bar; on a pass: the whole gate blazes
      for (let i = 0; i < 5; i++) {
        const k = (i / 4) * 2 - 1;
        const q = { x: p.x + n.x * w * k * 0.8, y: p.y + n.y * w * k * 0.8 };
        const on = lit > 0 || Math.floor(view.time * 6) % 5 === i;
        ctx.fillStyle = lit > 0 ? th.impactCore : on ? th.jackpotAccent : th.lampOffAccent;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, lit > 0 ? th.energySecondary : th.jackpotAccent, p.x, p.y, 1.1 + lit * 2.2, 0.18 + lit * 1.6);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  drawRideTallies(ctx, view);
}

/** Points paid so far on each ball's current ramp ride (presentation only). */
const rideTally = new Map<number, { ramp: string; value: number; at: number; last: boolean }>();

/** Running ride tally beside each checkpoint ramp: "+3,000" pulsing per checkpoint, then "RIDE +8,000". */
function drawRideTallies(ctx: CanvasRenderingContext2D, view: GameView) {
  for (const [ball, t] of rideTally) {
    const age = view.time - t.at, life = t.last ? 1.1 : 0.9;
    if (age > life) {
      rideTally.delete(ball);
      continue;
    }
    const r = view.layout.ramps.find(r => r.def.id === t.ramp);
    if (!r || !r.cpS.length) continue;
    // anchor: beside the middle of the checkpoint run, on the side facing the table middle
    const mid = rampAt(r, (r.cpS[0] + r.length) / 2);
    let n = { x: -mid.t.y, y: mid.t.x };
    if ((10 - mid.p.x) * n.x + (16 - mid.p.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const x = mid.p.x + n.x * 1.9, y = mid.p.y + n.y * 1.9;
    const pulse = 1 + 0.3 * Math.max(0, 1 - age / 0.12);
    const alpha = Math.min(1, (life - age) / 0.25);
    const th = view.theme;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    const fs = readableSize(ctx, t.last ? 0.62 : 0.5, VFX_TEXT.minTallyPx);
    ctx.font = `italic 800 ${fs.toFixed(3)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = `${t.last ? 'RIDE ' : ''}+${t.value.toLocaleString()}`;
    ctx.lineWidth = 0.14 * (fs / 0.5);
    ctx.strokeStyle = '#05080f';
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = t.last ? th.impactCore : th.jackpotAccent;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
}

/** V2.2 Upper Deck Rally presentation (seconds on screen). */
const DECK_RALLY_UI = { headline: 1.4, tally: 1.1 };

export function onMechanismEvent(view: GameView, e: SimEvent) {
  const th = view.theme, v = view.vfx, L = view.layout;
  if (e.type === 'deckRally') {
    // V2.2: modest feedback — one headline on arrival, a small tally when the ball goes back downstairs
    if (e.phase === 'start') {
      v.flash(e.x, e.y, 2.2, th.jackpotAccent, 0.35);
      // the player route shows a big HOME RUN banner instead (juice.ts); this in-world headline is the fallback
      if (!view.bigMoments) v.flicker(10, UPPER_DECK.roofY + 1.1, 'HOME RUN!  RALLY ×2', th.jackpotAccent, DECK_RALLY_UI.headline);
    } else if (e.reason === 'returned' && e.gained) {
      v.flicker(e.x, e.y + 0.9, `RALLY +${e.gained.toLocaleString()}`, th.energySecondary, DECK_RALLY_UI.tally);
    }
    return;
  }
  if (e.type === 'mult') {
    const amount = `+${(e.gain / 10).toFixed(1)}×`;
    if (e.source === 'gate') {
      const g = L.multGates.find(g => g.id === e.id)!;
      const inward = g.side === 'left' ? 1 : -1;
      view.lit.set(e.id, 0.4);
      v.flash(e.x, e.y, 1.8, th.m.multGlow, 0.3);
      v.flash(e.x, e.y, 0.7, th.impactCore, 0.1);
      v.ring(e.x, e.y - 0.5, 0.3, 1.5, th.m.multGlow, 0.35, false, 0.1);
      v.sparks(e.x, e.y, 10, 7, th.m.multGlow);
      // number just inside the table from the alley, never over the alley itself
      v.flicker(e.x + inward * 2.3, e.y + 0.9, amount, th.m.multGlow);
    } else {
      v.ring(e.x, e.y, 0.4, 1.6, th.m.multGlow, 0.35, true, 0.1);
      v.flicker(e.x, e.y + 1.4, amount, th.m.multGlow);
    }
    return;
  }
  if (e.type === 'ramp') {
    const r = L.ramps.find(r => r.def.id === e.id)!;
    if (e.phase === 'enter') {
      view.lit.set(e.id + '-mouth', 0.4);
      v.flash(r.mouth.x, r.mouth.y, 1.2, th.energyPrimary, 0.2);
    } else if (e.phase === 'complete' && r.cpS.length) {
      // Checkpoint ramps: the finish checkpoint already did the flourish; just light the whole ramp.
      view.lit.set(e.id, 0.6);
    } else if (e.phase === 'complete') {
      view.lit.set(e.id, 0.8);
      v.flash(e.x, e.y, 1.6, th.energyPrimary, 0.3);
      v.ring(e.x, e.y, 0.3, 1.6, th.energyPrimary, 0.3);
      v.sparks(e.x, e.y, 10, 8, th.impactCore, r.exitDir.x, r.exitDir.y, 0.8);
      v.flicker(e.x + 0.9, e.y - 0.5, '+' + e.points, th.jackpotAccent);
    } else if (e.phase === 'land') {
      v.ring(e.x, e.y, 0.2, 1.1, th.energyPrimary, 0.3, false, 0.08);
      v.sparks(e.x, e.y, 8, 4, th.impactCore);
    } else {
      v.flash(e.x, e.y, 0.8, th.machineGlow, 0.15);
    }
  } else if (e.type === 'rampCheckpoint') {
    const r = L.ramps.find(r => r.def.id === e.id)!;
    const { t } = rampAt(r, r.cpS[e.index]);
    const last = e.index === e.count - 1;
    view.lit.set(`${e.id}-cp${e.index}`, 0.28);
    // One running tally per ramp (presentation only): pulses on every checkpoint instead of 8 stacked labels.
    const prev = rideTally.get(e.ball);
    const tally = (e.index === 0 || !prev ? 0 : prev.value) + e.points;
    rideTally.set(e.ball, { ramp: e.id, value: tally, at: view.time, last });
    v.flash(e.x, e.y, last ? 2.2 : 1.1, th.energySecondary, last ? 0.32 : 0.18);
    v.sparks(e.x, e.y, last ? 14 : 5, last ? 9 : 6, th.jackpotAccent);
    // number beside the ramp on the side facing the table middle, never on the ball's path
    let side = { x: -t.y, y: t.x };
    if ((10 - e.x) * side.x + (16 - e.y) * side.y < 0) side = { x: -side.x, y: -side.y };
    void side;
    if (last) v.ring(e.x, e.y, 0.4, 2.4, th.jackpotAccent, 0.45, true, 0.13);
  } else if (e.type === 'rampGate') {
    const r = L.ramps.find(r => r.def.id === e.id)!;
    const { t } = rampAt(r, r.gateS);
    view.lit.set(e.id + '-gate', 0.6);
    v.flash(e.x, e.y, 2.4, th.energySecondary, 0.35);
    v.flash(e.x, e.y, 0.9, th.impactCore, 0.1);
    v.ring(e.x, e.y, 0.5, 2.3, th.jackpotAccent, 0.45, true, 0.13);
    v.sparks(e.x, e.y, 18, 10, th.jackpotAccent);
    // number beside the ramp (perpendicular), never on the ball's path
    let side = { x: -t.y, y: t.x };
    // put the number on the side facing the middle of the table, clear of rails and banners
    if ((10 - e.x) * side.x + (16 - e.y) * side.y < 0) side = { x: -side.x, y: -side.y };
    v.flicker(e.x + side.x * 1.3, e.y + side.y * 1.3 + 0.2, '+' + e.points.toLocaleString(), th.jackpotAccent);
  } else if (e.type === 'bank') {
    const bank = L.banks.find(b => b.id === e.id)!;
    view.lit.set(e.id, 0.7);
    const ts = bank.targetIds.map(id => L.boxTargets.find(t => t.id === id)!).filter(Boolean);
    const cx = ts.reduce((a, t) => a + t.x, 0) / ts.length, cy = ts.reduce((a, t) => a + t.y, 0) / ts.length;
    const fx = cx + ts[0].face.x * 2.2;
    for (const t of ts) v.targetHit(t.x + t.face.x * t.hw, t.y, -t.face.x, 0, true);
    v.flicker(fx, cy, `${bank.name} +${e.points.toLocaleString()}`, th.jackpotAccent);
  } else if (e.type === 'machine' && e.kind === 'spinner') {
    const sp = L.spinners.find(s => s.id === e.id)!;
    v.flicker((sp.a.x + sp.b.x) / 2, (sp.a.y + sp.b.y) / 2 + 0.8, '+' + e.points.toLocaleString(), th.impactCore);
  } else if (e.type === 'scoop') {
    const s = L.scoops.find(s => s.id === e.id)!;
    if (e.phase === 'catch') {
      view.lit.set(e.id, 0.35);
      v.flash(s.x, s.y, 1.6, th.machineGlow, 0.25);
      v.flicker(s.x, s.y - s.cupR - 0.5, '+' + e.points);
    } else {
      view.lit.set(e.id, 0.25);
      const dx = Math.cos(s.ejectAngle), dy = Math.sin(s.ejectAngle);
      v.flash(s.x, s.y, 1.3, th.impactCore, 0.12);
      v.ring(s.x, s.y, 0.4, 1.8, th.machineGlow, 0.3, true);
      v.sparks(s.x + dx * 0.6, s.y + dy * 0.6, 12, 9, th.machineGlow, dx, dy, 0.5);
    }
  } else if (e.type === 'multiball') {
    const s = L.splitters.find(s => s.id === e.id)!;
    view.lit.set(e.id + '-hatch', 0.4);
    v.flash(s.hatch.x, s.hatch.y, 2.2, th.energySecondary, 0.35);
    v.ring(s.hatch.x, s.hatch.y, 0.4, 2.4, th.energySecondary, 0.45, true, 0.14);
    v.sparks(s.hatch.x, s.hatch.y, 16, 9, th.energySecondary);
    v.flicker(s.hatch.x, s.hatch.y - 0.9, 'MULTIBALL', th.jackpotAccent);
  } else if (e.type === 'machine' && e.kind === 'splitter') {
    const s = L.splitters.find(s => s.id === e.id)!;
    view.lit.set(e.id, 0.4);
    v.targetHit(s.x, s.y + s.hh, 0, -1);
    v.flicker(s.x, s.y + s.hh + 0.6, '+' + e.points);
  } else if (e.type === 'machine' && e.kind === 'gate') {
    const g = L.gates.find(g => g.id === e.id)!;
    view.lit.set(e.id, 0.5);
    const c = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
    v.flash(c.x, c.y, 1.3, th.energyPrimary, 0.25);
    v.ring(c.x, c.y, 0.3, 1.3, th.energyPrimary, 0.25);
    v.flicker(c.x, c.y - 0.6, '+' + e.points, th.impactCore);
  }
}

void drawBaseball;
