# V2 Expandable Machine — playtest notes

Everything V2 lives behind **`/build-test/?v2=1`**. Without `?v2=1`, `/build-test/` is unchanged, and `/`, `/1`, `/2`, `/3` and `stable` are untouched (golden replay tests pass).
Plan once approved: V2 becomes `/build-test/`, and the current version moves to `/build-test-legacy/`.

## Decided by the designer vs experimental

| Decided (designer) | Experimental (tune by playtest) |
|---|---|
| The camera never pans or tracks; it only zooms out, and 100% is the closest view | `CAMERA.minZoom` 0.76 |
| Anchor is the batter's hands (10, 25), so the batter never moves on screen | `outTau` 0.2 (was 0.07; the player asked for slower), `inTau` 0.22, `lookahead` 0.3, `pad` 1.1, `edgePad` 0.45 |
| The view is back to 100% before a returning ball reaches the bat zone | `batZoneY` 17 |
| Batter drag is world-constant (the same swipe gives the same movement at any zoom) | — |
| The Upper Deck unlocks after C3, the Side Chamber after C9; both are free | `SECTION_UNLOCKS` in `src/machines/sections.ts` |
| A free **Home Run Ramp** comes with the Upper Deck, with a smaller payout than a bought ramp | 2,000 per ride (a bought ramp pays 8 × 1,000) |
| Side chamber(s) go in the upper corners | M3 |

## M1 — Camera (`src/view/camera.ts`)
- This is a pure model: it takes every live ball (field, ramp, held and drop, framed at `pos`) and returns one zoom in [0.76, 1].
- Inside the original table (0..20 × 0..32), a ball never asks for zoom, so normal play stays at exactly 100%.
- **Zoom-out** eases with `outTau`. A hard clamp (`edgePad`) still keeps every ball inside the view while it eases.
- **Zoom-in** is gentle, with a deadband. It hurries (`inTau`/3) when a ball is falling toward the bat zone.
- At 100%, a pixel comparison against the classic view was identical apart from one pixel off by 3/255.
- Outside the 100% view, the camera's extra margin shows stadium stands instead of black.

## M2 — Upper Deck (`src/machines/sections.ts`, `board.ts`, `game.ts`)

### Geometry (world units; the table is 20 × 32 and +y points toward the batter)
- **Deck:** x 1.0–19.0, roof at y −8.6 with corner radius 1.4. The whole roof fits the view at zoom ≈ 0.776, above the 0.76 floor, so no offscreen indicator is ever needed for the deck.
- **Gaps:** two openings in the top rail at x 3.95–5.55 and x 14.45–16.05, both at y 0.6.
- **Floor:**
  - The side floors slope from the walls (y −0.6) down to the outer gap edges.
  - A center divider ("tent", peak at y −0.9) slopes down to the inner gap edges. The jackpot crest sits on it.
  - Every ball on the floor rolls into a gap.
- **Physics:** one planck world. The table's left wall runs into the deck outline and back out the right wall as a single chain, and the divider is a closed loop. Classic layouts keep the single `OUTER_WALL` chain.
- **Free fixtures:** three deck bumpers, `deck-bumper-l` (7.2, −2.8), `deck-bumper-r` (12.8, −2.8) and `deck-bumper-c` (10, −5.4), each worth 200.

### Ways in
1. **Home Run Ramp (free):**
   - The mouth is at the top of the right alley (18.3, 3.9), above the right multiplier-gate line, so the gate still counts the ball on its way up.
   - The ramp climbs the deck's right wall and releases the ball along the deck top, heading left across the center bumper.
   - Clearing the climb takes about 6.6 u/s at the mouth. Weaker balls roll back out.
2. **Strong shots through a gap.** A ball rising through either gap enters the deck.

### Way out
- The sloped floor funnels the ball through a gap.
- It then drops onto the top-left/right and left/right factory bumpers and back into normal play.
- No strike is possible in the deck: it sits far from the drain, and the safety bounds grow with the section.

### Mounts
- **Sites:** `deck-l` (4.0, −4.8) and `deck-r` (16.0, −4.8). They're offered only once the deck is unlocked.
- **Machines that fit there today:** the Bonus Bumper and the Triple Bumper Cluster.
- **Power:** these installs cost normal Power. Unlocking spends no Power and no money.
- **Selling:** a deck install sells like any other. The deck stays unlocked, and THIS modifiers on the install go dormant, then wake when a compatible machine goes back on the same site.

### Modifiers
- ALL-bumper cards apply to the deck bumpers.
- THIS-bumper cards can target the deck bumpers once the deck is unlocked.
- Grand Tour (ALL ramps, full rides) and the ramp-to-bumper cross cards (Rally Fuel, Momentum) apply to the Home Run Ramp.
- Express Track (checkpoints) is offered only with a bought checkpoint ramp, because the Home Run Ramp has no checkpoints.

### Progression and UI
- Clearing C3 unlocks the deck before that clear's draft, so deck mounts can be offered straight away.
- The board is rebuilt immediately, and the clear screen and draft header say **"THE MACHINE GREW — UPPER DECK UNLOCKED"**.
- Dev analytics logs a `sectionUnlock` event.

### Measured with the seeded bot (factory build-test table, 300 balls, 40 ms timing error)
- **Visits:** about 0.66 per ball. Time in the deck per visit: p50 3.9 s, p90 4.5 s, max 7.4 s. Nothing got stuck.
- **Home Run Ramp:** 141 entries → 101 full rides and 40 rollbacks. Deck bumper hits: 109. Gap entries: 94.
- **Score per ball, deck vs classic** (seeds 1/2/3): 7,180 / 7,534 / 8,186 vs 7,893 / 6,413 / 6,758, about +9% on average and inside bot noise. Measured only; nothing was rebalanced.

## Phone test steps
1. Open `https://haydenmay.github.io/baseball-pinball/build-test/?v2=1` and clear C1–C3. The C3 clear screen should say the machine grew.
2. **Shortcut:** from a desktop console, run `v2dev.grow()` and then press READY. The deck appears right away.
3. Get the ball up the right alley. It should take the Home Run Ramp, the camera should ease out, and the ball should bounce off the deck bumpers and drop back through a gap. The camera should be at 100% before the ball reaches the batter.
4. Hit a hard shot up the far left or far right. It may go up through a gap.
5. In the draft or shop, place a Bonus Bumper or Cluster on an Upper Deck site, then sell it in Manage Machine.
6. `?camdemo=1` still adds the ghost ball for feeling the zoom.

## Known limitations / next
- **M3:** side chamber(s) in the upper corners, unlocked after C9.
- **M4:** per-section telemetry (entries, time spent, traffic), camera metrics in the report, and Manage Machine labels for section mounts.
- **Exact-center juggle:** a ball dropped exactly on a bumper's center with no sideways speed can bounce on it vertically forever. This is a pre-existing bumper behavior that real play doesn't hit. The tests offset spawn points to avoid it.
