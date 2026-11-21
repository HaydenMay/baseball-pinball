/**
 * V2 Expandable Machine: structural sections that physically grow the table (build-test with ?v2=1 only).
 *
 * Data model (kept separate on purpose):
 *  - section unlocked  → Run.sections (free, granted by progression; never costs Power or money)
 *  - physical fixtures → the section's own walls, free bumpers and free ramp (part of the unlock)
 *  - mount availability → catalog MOUNTS with `section` set are only offered once the section is unlocked
 *  - installed items / Power → unchanged Upgrade System 3.0 rules
 *
 * Pure data, no imports of board/physics values (board.ts builds the walls from this).
 * Every number here is EXPERIMENTAL and meant to be tuned by playtest.
 */
import type { Pt, RampDef } from './mechanisms.ts';

export type SectionId = 'upperDeck';

/** Runtime switch: true only on /build-test/?v2=1 (main.ts sets it before the run starts). */
export const V2 = { enabled: false };

/** Challenge after whose clear each section unlocks (EXPERIMENTAL: designer-agreed starting points). */
export const SECTION_UNLOCKS: Record<SectionId, number> = { upperDeck: 3 };

export type Rect4 = { x0: number; y0: number; x1: number; y1: number };

/**
 * Upper Deck: a playfield above the original top rail.
 * - Two openings in the top rail (`gaps`) connect it to the table: strong shots can go up through them,
 *   and the deck's sloped floor funnels every ball back down through them onto the top bumpers.
 * - A free Home Run Ramp lifts balls from the top of the right alley into the deck.
 * - Fits the camera floor: its roof is kept inside the view at zoom ≈ 0.776 (CAMERA.minZoom 0.76).
 */
export const UPPER_DECK = {
  id: 'upperDeck' as const,
  name: 'Upper Deck',
  /** y of the original top rail (board.ts OUTER_WALL). */
  railY: 0.6,
  /** Openings cut into the top rail (x ranges). Ball diameter is 0.64. */
  gaps: [
    { x0: 3.95, x1: 5.55 },
    { x0: 14.45, x1: 16.05 },
  ],
  /** Deck side walls and roof. */
  wallX0: 1.0,
  wallX1: 19.0,
  roofY: -8.6,
  cornerR: 1.4,
  /** Where the sloped side floors meet the side walls (they fall toward the outer gap edges). */
  sideFloorY: -0.6,
  /** Peak of the center divider between the gaps (falls toward the inner gap edges). */
  tentPeakY: -0.9,
  /** Free fixed bumpers (count as bumpers for ALL-bumper modifiers). */
  bumpers: [
    { id: 'deck-bumper-l', x: 7.2, y: -2.8, r: 0.95 },
    { id: 'deck-bumper-r', x: 12.8, y: -2.8, r: 0.95 },
    { id: 'deck-bumper-c', x: 10, y: -5.4, r: 1.0 },
  ],
  bumperPoints: 200,
  bumperKick: 15,
  /** Deck turf tint over the table turf so it reads as a separate level (theme turf + this). */
  tint: 'rgba(20,40,90,0.22)',
  /** Painted floor label. */
  label: 'UPPER DECK',
  labelAlpha: 0.16,
};

/**
 * The free Home Run Ramp: mouth at the top of the right alley (balls heading up the alley ride it),
 * climbs the deck's right wall and releases along the top of the deck, across the center bumper.
 * Payout deliberately below a bought ramp (8 × 1,000): one completion award, no checkpoints.
 */
export const HOME_RUN_RAMP: RampDef = {
  type: 'ramp',
  id: 'hr-ramp',
  name: 'HOME RUN',
  powerCost: 0,
  path: [
    { x: 18.3, y: 3.9 }, { x: 18.3, y: 2.2 }, { x: 18.25, y: 0.2 }, { x: 18.2, y: -2.5 }, { x: 18.2, y: -5.4 },
    { x: 17.7, y: -7.3 }, { x: 16.4, y: -7.85 }, { x: 15.2, y: -7.9 },
  ],
  mouthWidth: 1.7,
  // Bot traffic: balls cross the alley top upward at ~9.5 u/s (p50); climb 3 rolled half of them back.
  climb: 2.2,
  climbDecel: 10,
  minRide: 9,
  maxRide: 16,
  exitMin: 9,
  exitMax: 12,
  points: 2000,
};

/** Smallest rectangle holding the table plus the unlocked sections (camera bounds, escape check). */
export function boundsFor(sections: readonly SectionId[]): Rect4 {
  const b = { x0: 0, y0: 0, x1: 20, y1: 32 };
  if (sections.includes('upperDeck')) b.y0 = Math.min(b.y0, UPPER_DECK.roofY);
  return b;
}

/** Deck outer wall from the left gap's outer edge, around the deck, to the right gap's outer edge. */
export function deckOutline(): Pt[] {
  const d = UPPER_DECK, [gl, gr] = d.gaps, c = d.cornerR;
  const arc = (cx: number, cy: number, a0: number, a1: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const a = a0 + ((a1 - a0) * i) / 4;
      return { x: +(cx + Math.cos(a) * c).toFixed(3), y: +(cy + Math.sin(a) * c).toFixed(3) };
    });
  return [
    { x: gl.x0, y: d.railY },
    { x: d.wallX0, y: d.sideFloorY },
    ...arc(d.wallX0 + c, d.roofY + c, Math.PI, Math.PI * 1.5),
    ...arc(d.wallX1 - c, d.roofY + c, Math.PI * 1.5, Math.PI * 2),
    { x: d.wallX1, y: d.sideFloorY },
    { x: gr.x1, y: d.railY },
  ];
}

/** Center divider between the two gaps, as a closed loop (its bottom edge is the table's top rail). */
export function deckDivider(): Pt[] {
  const d = UPPER_DECK, [gl, gr] = d.gaps;
  return [{ x: gl.x1, y: d.railY }, { x: 10, y: d.tentPeakY }, { x: gr.x0, y: d.railY }];
}

/** Closed outline of the deck's floor (for drawing): outline + the divider's top. */
export function deckFloorPolygon(): Pt[] {
  const d = deckDivider();
  return [...deckOutline(), d[2], d[1], d[0]];
}
