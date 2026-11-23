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

## Closers 2–5: not designed yet
Candidates discussed (not approved): Two-Strike Count, Ace on the Mound (bumpers half), Rain Delay (Upper Deck closed), Small Ball (multiplier frozen), Juiced Bumpers (bumper kick ×1.5, changes physics; needs care). Pitch types were considered and rejected as boss material (they only change the first contact of each ball); a mild random pitch spread may come later as polish.
