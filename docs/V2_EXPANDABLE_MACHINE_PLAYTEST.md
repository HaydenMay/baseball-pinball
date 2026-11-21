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
| A free **Home Run Ramp** comes with the Upper Deck, with a smaller payout than a bought ramp | 1,000 per ride (a bought ramp pays 8 × 1,000); was 2,000, see the bot numbers below |
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
1. **Home Run Ramp (free): the aimed shot.**
   - The mouth faces the batter in the right mid-field at (16.15, 16.85), 1.9 wide. The deck displaces the factory mid-right bumper to make room, just as the Long Loop does.
   - The mouth sits between the Overpass and Long Loop mouths, more than a ball diameter clear of both.
   - A hit aimed about 25–35° right reaches it at about 20 u/s, far more than the climb needs. The aim window is about 7.5° per batter position. With the Long Loop and Overpass also installed, they take some of those shots and the window narrows to about 2.5°.
   - The raised ride runs up the right mid-field inside the lane rail, crosses the top-right corner, climbs the deck's right wall and releases the ball along the deck top, across the center bumper.
   - (v1 put the mouth at the top of the right alley. You couldn't aim at it from the bat, so it moved after playtest.)
2. **Lucky kicks through a gap.** A bat shot loses nearly all of its speed by the top rail, so the gaps work mainly as the deck's exit funnel. Only an occasional bumper kick sends a ball up through one.

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

### Measured with the seeded bot (factory build-test table, 300 balls, 40 ms timing error, seeds 1–3)
- **With the aimable mouth:** about 4.3 Home Run Ramp rides per ball (1,300 per 300 balls), almost no rollbacks, and about 8.8 deck visits per ball. Time in the deck per visit: p50 4.3 s, max 8.8 s. Nothing got stuck.
- **Bat hits per ball:** about 50, vs 31–37 on the classic table. The deck returns balls safely onto the top bumpers, so a ball lives longer.
- **Loop risk:** the bot falls into a loop. A deck return comes back down a consistent path, and the same swing sends it up the ramp again. A human probably won't repeat it that reliably, but this is the number to watch.
- **Score per ball:** classic is about 7,000. With the deck it was about 22,000 at 2,000 per ride, and about 15,800 at 1,000 per ride (the current value). The rest of the increase comes from longer ball life.
- **Not changed** (per the handoff): score targets, other parts or upgrades. The ride payout is the deck's own new number.

## Phone test steps
1. Open `https://haydenmay.github.io/baseball-pinball/build-test/?v2=1` and clear C1–C3. The C3 clear screen should say the machine grew.
2. **Shortcut:** from a desktop console, run `v2dev.grow()` and then press READY. The deck appears right away.
3. Aim a hit about 30° right at the HOME RUN mouth (where the mid-right bumper used to be). It should take the Home Run Ramp, the camera should ease out, and the ball should bounce off the deck bumpers and drop back through a gap. The camera should be at 100% before the ball reaches the batter.
4. Hit a hard shot up the far left or far right. It may go up through a gap.
5. In the draft or shop, place a Bonus Bumper or Cluster on an Upper Deck site, then sell it in Manage Machine.
6. `?camdemo=1` still adds the ghost ball for feeling the zoom.

## Known limitations / next
- **M3:** side chamber(s) in the upper corners, unlocked after C9.
- **M4:** per-section telemetry (entries, time spent, traffic), camera metrics in the report, and Manage Machine labels for section mounts.
- **Exact-center juggle:** a ball dropped exactly on a bumper's center with no sideways speed can bounce on it vertically forever. This is a pre-existing bumper behavior that real play doesn't hit. The tests offset spawn points to avoid it.
