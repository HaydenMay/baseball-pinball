/**
 * Playfield neon (Night Game): glowing tubes along the walls, lane guides, ramp rails, targets and gates,
 * baked into the cached table layers (one-time cost). Hits flare on top in the per-frame pass.
 * Colors and sizes live in the theme's `neonKit`; a theme without one draws no tubes (Day look).
 */
export type NeonKit = {
  /** Outer walls and Upper Deck walls. */
  rail: string;
  /** Lane guides (the short rails over the top lanes). */
  lane: string;
  /** Ramp side rails. */
  ramp: string;
  /** Round and box targets (the jackpot keeps its gold). */
  target: string;
  /** Scoring gates. */
  gate: string;
  /** Hot white core down the middle of every tube. */
  core: string;
  /** Tube width and glow radius (world units). */
  width: number;
  glow: number;
  /** Tube opacity (0..1): turn the whole table's neon up or down. */
  strength: number;
};

/** Stroke whatever `draw` traces as a neon tube: soft colored glow, colored tube, white-hot core. */
export function neonTube(ctx: CanvasRenderingContext2D, kit: NeonKit, color: string, draw: () => void, width = kit.width) {
  const k = Math.abs(ctx.getTransform().a) || 1; // shadowBlur is in device pixels
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = kit.strength;
  ctx.shadowColor = color;
  ctx.shadowBlur = kit.glow * k;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  draw();
  ctx.stroke();
  ctx.stroke(); // a second pass thickens the glow
  ctx.shadowBlur = 0;
  ctx.globalAlpha = kit.strength * 0.9;
  ctx.strokeStyle = kit.core;
  ctx.lineWidth = width * 0.38;
  draw();
  ctx.stroke();
  ctx.restore();
}
