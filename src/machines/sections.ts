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
  /** Factory parts removed while the deck is present (the Home Run Ramp mouth takes the mid-right bumper's spot). */
  displaces: ['bumper-mid'],
  /** Free fixed bumpers (count as bumpers for ALL-bumper modifiers). */
  // V2.2: four bumpers in a staggered diamond (top / left / right / lower-middle) so a ball ricochets
  // between them (gaps 1.3–1.5 = about two ball diameters). The V2.1 shallow row (6.6/10/13.4 at y≈-4.4)
  // played as three independent targets. EXPERIMENTAL geometry; see docs/V2_2_UPPER_DECK_RALLY.md.
  bumpers: [
    { id: 'deck-bumper-t', x: 10, y: -5.9, r: 0.9 },
    { id: 'deck-bumper-l', x: 7.4, y: -4.5, r: 0.9 },
    { id: 'deck-bumper-r', x: 12.6, y: -4.5, r: 0.9 },
    { id: 'deck-bumper-b', x: 10, y: -2.7, r: 0.9 },
  ],
  /**
   * V2.2: one slingshot on each side wall, low enough to leave the deck mounts above them and the sloped floor
   * (and so both return gaps) open beneath. Each kicks inward and a little up, back across the diamond.
   * `tilt` = upward component of the kick direction before normalizing (0 = straight inward).
   */
  slings: { y0: -3.7, y1: -1.1, depth: 0.95, tilt: 0.6, points: 100, kick: 17 },
  bumperPoints: 200,
  bumperKick: 15,
  /** Deck turf tint over the table turf so it reads as a separate level (theme turf + this). */
  tint: 'rgba(20,40,90,0.22)',
  /** Painted floor label. */
  label: 'UPPER DECK',
  labelAlpha: 0.16,
};

/**
 * The free Home Run Ramp: an aimable skill shot. Its mouth faces the batter in the right mid-field (where the
 * factory mid-right bumper stood; the Upper Deck displaces that bumper, as the Long Loop already does), between
 * the Overpass and Long Loop mouths with ball-sized clearance to both. A hit aimed ~25–35° right arrives at
 * ~20 u/s, far above the climb. The raised ride runs up the right mid-field inside the lane rail, crosses the
 * top-right corner, climbs the deck's right wall and releases along the deck top across the center bumper.
 * Payout deliberately below a bought ramp (8 × 1,000): one completion award, no checkpoints.
 * (Nov 20 playtest: the first version's mouth at the top of the right alley couldn't be aimed at from the bat.)
 */
export const HOME_RUN_RAMP: RampDef = {
  type: 'ramp',
  id: 'hr-ramp',
  name: 'HOME RUN',
  powerCost: 0,
  path: [
    { x: 16.15, y: 16.85 }, { x: 16.6, y: 15.4 }, { x: 16.8, y: 13.2 }, { x: 16.75, y: 9.5 }, { x: 16.6, y: 5.5 },
    // V2.2: the raised climb runs just outside the deck's right wall, so it no longer hides the right deck sling
    { x: 17.2, y: 2.4 }, { x: 18.4, y: 0.3 }, { x: 19.55, y: -1.6 }, { x: 19.65, y: -4.5 }, { x: 19.3, y: -6.9 },
    { x: 18.2, y: -8.15 }, { x: 16.9, y: -8.2 },
    // V2.1/V2.2: the release heads just below level (~3°) into the top of the deck; exitSpread fans it ±31°
    { x: 15.9, y: -7.9 }, { x: 15.0, y: -7.85 },
  ],
  // Wider than the bought ramps' 1.5–1.6 so it reads as the deck's front door; posts still clear the
  // Overpass and Long Loop mouth posts by more than a ball diameter.
  mouthWidth: 1.9,
  climb: 3,
  climbDecel: 12,
  minRide: 10,
  maxRide: 18,
  exitMin: 9,
  exitMax: 12,
  // V2.2 (designer-approved): 3,000 on completion (was 1,000), plus Upper Deck Rally for the ball that rode it.
  // No checkpoints, by design: Home Run pays for what happens upstairs; bought ramps pay during the ride.
  points: 3000,
  deckRally: true,
  // V2.1: each ride's release fans ±0.55 rad (±31°) around the ~13° down-left heading at 12 u/s ±15%
  // (10.2–13.8). Steep → right deck bumper/site, middle → center bumper, flat → left bumper/site.
  // Measured (scripts/flow-diagnostics.ts, 90 rides): first deck contact L/C/R ≈ 29/46/18 %, ~4% miss the
  // deck bumpers and drop straight out through the left gap (was 0/100/0).
  exitSpread: { angle: 0.55, speed: 0.15 },
};

/**
 * V2.2 Upper Deck Rally (factor lowered 2 → 1.5 by Hayden, Nov 22: it made ~58% of a strong run's points): a ball that completes the Home Run Ramp scores ×`factor` on
 * every upper-deck bumper and deck sling contact (structural ones and bought bumpers on the deck mounts) until
 * that ball crosses back down onto the main table, drains or is removed. Per ball; never global.
 * The factor applies to the contact's own (modified) points; the global multiplier is applied once, after.
 * `hysteresis`: the ball must be this far past the top rail line (y = railY) before it counts as having
 * changed level, so a ball skimming the gap edge doesn't flicker in and out.
 */
export const DECK_RALLY = { factor: 1.5, hysteresis: 0.45 };
/** Player-facing "×1.5" (copy everywhere reads from the factor). */
export const rallyLabel = () => `×${DECK_RALLY.factor}`;

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
