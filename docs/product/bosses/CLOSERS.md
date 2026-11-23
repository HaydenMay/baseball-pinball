# Closers (boss rules)

One rule per inning's Closer (C3, C6, C9, C12, C15), on the player route. Code: `src/core/bosses.ts` (data), `Simulation.setBoss` / `hotFactor` (rule), `GameView.drawHotCorner` + status strip + `hotMove` moment (presentation). Approval state per Closer below.

## Closer 1 (C3): HOT CORNER (approved by Hayden, Nov 22)
- **Rule:** one scoring part pays **×3**, every other way to score pays **×0.8**. Every **15 live seconds** the hot spot jumps somewhere else (never to the same spot twice in a row).
- **Spots:** each bumper (incl. glove, Upper Deck and bought bumpers), each ramp (incl. Home Run; checkpoints count), the scoop, the Jackpot, and three groups: all targets, all slings, all top lanes. Bat and sweet-spot points are "everything else" (×0.8).
- **Math order:** part's own points after its boosts → × Hot Corner (×3 / ×0.8, rounded) → × Rally (deck parts) → × global multiplier. Generators and the multiplier are untouched.
- **Timer:** counts only during live play; holds between pitches. Saved with a mid-challenge resume (spot, seconds left, RNG).
- **Telegraph:** card before the first pitch ("CLOSER · HOT CORNER" + the rule); a dashed neon ring and a ×3 tag on the hot part(s), blinking for the last 3 s; strip shows "×3 BUMPER 14s"; when it moves: "HOT CORNER / SLINGS ×3" banner, two quick pings, bulb chase.
- **Counterplay:** aim at the hot part (move + timing), or just out-score the 20% tax. Works for every build because the spot moves across part types.
- **Tuning:** `HOT_CORNER` (hot 3, cold 0.8, seconds 15, warnSeconds 3).
- **Tests:** `tests/bosses.test.ts`.

## Closer 2 (C6): SMALL BALL (approved Nov 22)
- **Rule:** the multiplier is frozen for the whole challenge (no gate, generator or sweet-spot gains). Sweet spots pay **×3** their bonus (750 at base).
- **Telegraph:** card; strip "SMALL BALL · SWEET ×3"; LOCKED badge on the multiplier plaque.
- **Counterplay:** raw points, centered hits. Hurts multiplier-generator builds most. `SMALL_BALL`.

## Closer 3 (C9): CALLED SHOT (approved Nov 22)
- **Rule:** at each pitch a part is called (any spot Hot Corner can use except slings and lanes). The first scoring contact after the bat decides it: the called part → the whole rest of that pitch scores **×2**; anything else → call missed (no penalty).
- **Telegraph:** cyan dashed ring + CALLED tag on the part until it resolves; strip "CALLED: GLOVE" → "CALLED SHOT ×2" / "CALL MISSED"; big CALLED SHOT! banner + Jackpot sound on a hit, small MISSED THE CALL on a miss.
- **Note:** upside only, so the bigger target is the pressure. Watch the hit rate in playtests; if calls feel unreachable, bias the call toward parts the bat can aim at. `CALLED_SHOT`.

## Closer 4 (C12): RAIN DELAY (approved Nov 22)
- **Rule:** the Home Run ramp is closed, so no Rally. The deck stays reachable only by lucky kicks through the gaps.
- **Telegraph:** card; strip "RAIN DELAY"; rain and a dark wash over the Upper Deck; red CLOSED plate under the Home Run mouth.
- **Counterplay:** downstairs builds (ramps, targets, glove, bumpers). Only makes sense once the deck exists (Inning 2+).

## Closer 5 (C15): RUNNERS ON BASE (approved Nov 22)
- **Rule:** nothing banks directly. Every point (at the current multiplier) goes **on base**. The next bat contact **drives them in ×1.5**; when the last ball drains they're **stranded at ×0.5**. No timer (Hayden: you don't control when the ball comes back).
- **Telegraph:** card; strip "ON BASE 3,240"; DRIVEN IN! +N banner + chime on each drive-in; STRANDED +N popup at the drain.
- **Note:** the challenge only clears on banked points, so a big rally must come back to the bat. `RUNNERS`.

## Order and randomizing
Fixed order (Hayden, Nov 22). `RANDOMIZE_CLOSERS` in `src/core/bosses.ts` shuffles Closers 2–5 per run (seeded); Inning 1 stays Hot Corner as the teaching boss.

## Ideas not used (Nov 22)
Two-Strike Count, Ace on the Mound (bumpers half), The Shift, Pitch Clock (rejected: a timer on bat contact punishes bounces you can't control), Juiced Bumpers (bumper kick ×1.5, changes physics), Blackout. Pitch types rejected as boss material (only the first contact of each ball).
