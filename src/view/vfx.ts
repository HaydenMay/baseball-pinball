/**
 * Mechanism-localized effects. Everything here is procedural and tinted from theme tokens.
 * Effects stay attached to the object that was hit and are short-lived so the ball stays visible.
 */
import type { Theme } from './theme.ts';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; kind: 'spark' | 'frag' };
type Ring = { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; stitch: boolean; width: number };
type Flicker = { x: number; y: number; text: string; life: number; max: number; color: string };
type Flash = { x: number; y: number; r: number; life: number; max: number; color: string };

/** Glow sprites cached by color. Bounded so theme switches can't grow it without limit. */
const glowCache = new Map<string, HTMLCanvasElement>();
export const GLOW_CACHE_MAX = 48;
export function glowCacheSize() {
  return glowCache.size;
}
/** Soft radial sprite in a given color, drawn with additive blending. */
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  if (glowCache.size >= GLOW_CACHE_MAX) glowCache.delete(glowCache.keys().next().value!);
  c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.25, color + 'aa');
  grad.addColorStop(0.6, color + '33');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}

/**
 * Contrast underlay: if the theme defines energyOutline, stroke the current path with it first
 * (wider, normal blending) so a bright stroke stays legible on the green turf. No-op otherwise.
 */
export function underlay(ctx: CanvasRenderingContext2D, theme: Theme, width: number) {
  if (!theme.energyOutline) return;
  const s = ctx.strokeStyle, w = ctx.lineWidth, op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = theme.energyOutline;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.strokeStyle = s;
  ctx.lineWidth = w;
  ctx.globalCompositeOperation = op;
}

export function drawGlow(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, r: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

export class Vfx {
  particles: Particle[] = [];
  rings: Ring[] = [];
  flickers: Flicker[] = [];
  flashes: Flash[] = [];
  theme: Theme;
  constructor(theme: Theme) {
    this.theme = theme;
  }

  sparks(x: number, y: number, n: number, speed: number, color: string, dirX = 0, dirY = 0, spread = Math.PI) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = dirX || dirY ? base + (Math.random() - 0.5) * spread * 2 : Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      const max = 0.22 + Math.random() * 0.25;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: 0.05 + Math.random() * 0.05, kind: 'spark' });
    }
  }

  fragments(x: number, y: number, n: number, color: string, dirX: number, dirY: number) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      const a = base + (Math.random() - 0.5) * 1.8;
      const s = 3 + Math.random() * 5;
      const max = 0.35 + Math.random() * 0.25;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: max, max, color, size: 0.08 + Math.random() * 0.08, kind: 'frag' });
    }
  }

  ring(x: number, y: number, r0: number, r1: number, color: string, dur: number, stitch = false, width = 0.12) {
    this.rings.push({ x, y, r0, r1, life: dur, max: dur, color, stitch, width });
  }

  flash(x: number, y: number, r: number, color: string, dur: number) {
    this.flashes.push({ x, y, r, life: dur, max: dur, color });
  }

  flicker(x: number, y: number, text: string, color = this.theme.jackpotAccent) {
    this.flickers.push({ x, y, text, life: 0.55, max: 0.55, color });
  }

  /** Big bumper pop: white core, stitched ring, sparks. */
  bumperHit(x: number, y: number, r: number, nx: number, ny: number) {
    const t = this.theme;
    this.flash(x, y, r * 2.4, t.machineGlow, 0.28);
    this.flash(x, y, r * 1.2, t.impactCore, 0.09);
    this.ring(x, y, r * 1.05, r * 2.5, t.energySecondary, 0.38, true, 0.13);
    this.ring(x, y, r * 1.0, r * 1.8, t.machineGlow, 0.22, false, 0.08);
    this.sparks(x - nx * r, y - ny * r, 12, 9, t.machineGlow, -nx, -ny, 1.4);
    this.sparks(x - nx * r, y - ny * r, 5, 7, t.energySecondary, -nx, -ny, 1.1);
  }

  targetHit(x: number, y: number, nx: number, ny: number, jackpot = false) {
    const t = this.theme;
    const c = jackpot ? t.jackpotAccent : t.energyPrimary;
    this.flash(x, y, jackpot ? 2.4 : 1.3, c, 0.22);
    this.flash(x, y, 0.5, t.impactCore, 0.07);
    this.fragments(x, y, jackpot ? 12 : 7, jackpot ? t.jackpotAccent : t.impactCore, -nx || 0, -ny || 1);
    this.sparks(x, y, 6, 6, c, -nx, -ny, 1.2);
  }

  slingHit(x: number, y: number, kx: number, ky: number) {
    const t = this.theme;
    this.flash(x, y, 1.5, t.slingGlow, 0.22);
    this.sparks(x, y, 8, 8, t.energyPrimary, kx, ky, 0.7);
  }

  batHit(x: number, y: number, vx: number, vy: number) {
    const t = this.theme;
    const l = Math.hypot(vx, vy) || 1;
    this.flash(x, y, 1.3, t.energyPrimary, 0.2);
    this.flash(x, y, 0.55, t.impactCore, 0.08);
    this.ring(x, y, 0.3, 1.3, t.energyPrimary, 0.25, false, 0.09);
    this.sparks(x, y, 9, 8, t.impactCore, vx / l, vy / l, 0.5);
  }

  update(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt;
      p.vy *= 1 - 3 * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
    for (const f of this.flickers) {
      f.life -= dt;
      f.y -= dt * 1.2;
    }
    this.flickers = this.flickers.filter(f => f.life > 0);
    for (const f of this.flashes) f.life -= dt;
    this.flashes = this.flashes.filter(f => f.life > 0);
  }

  /** Draw in world coordinates (ctx already transformed). */
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const k = f.life / f.max;
      drawGlow(ctx, f.color, f.x, f.y, f.r * (0.8 + 0.2 * (1 - k)), k * k);
    }
    for (const r of this.rings) {
      const k = 1 - r.life / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      if (r.color === this.theme.energyPrimary || r.color === this.theme.machineGlow) underlay(ctx, this.theme, ctx.lineWidth * 2.2);
      ctx.stroke();
      if (r.stitch) {
        // baseball stitch ticks riding on the ring
        ctx.lineWidth = r.width * 0.55;
        const n = 18;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + k * 0.6;
          const cx = r.x + Math.cos(a) * rad, cy = r.y + Math.sin(a) * rad;
          const tx = -Math.sin(a), ty = Math.cos(a), ox = Math.cos(a), oy = Math.sin(a);
          const s = 0.13;
          ctx.moveTo(cx - ox * s - tx * s * 0.6, cy - oy * s - ty * s * 0.6);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + ox * s - tx * s * 0.6, cy + oy * s - ty * s * 0.6);
        }
        ctx.stroke();
      }
    }
    ctx.lineCap = 'round';
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 14);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const f of this.flickers) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.font = 'italic 800 0.62px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = '#06101dcc';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}
