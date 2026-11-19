# Playtest report: prototype 02

What was measured, how, and what still needs a human with a real phone.

## How this was tested

- **Automated tests:** `npm test` runs 23 tests covering the 10 required cases in the build prompt, plus swing-arc, aim and anti-trap checks. Mutation-checked: allowing upward hits breaks 3 tests, and removing the batting line breaks 1.
- **Bot playtest:** `npm run bot -- <balls> <timingErrorMs> <seed>`. This is a headless "player" that tracks the ball at keyboard speed, reacts 180 ms after the ball turns downward, and swings with a Gaussian timing error. It's a tuning aid, not a replacement for hands-on play: it predicts the ball path perfectly and never panics.
- **Browser:** the production build ran in headless Chrome at 1366×900 desktop and at 390×844 portrait phone (DPR 3, touch emulated). Ready, move and swing were driven through real `keydown` events and real CDP multi-touch events.

## Measured numbers (300 balls each, seed 7)

| Swing timing error | Survival / ball | Bat hits / ball | Score / ball | Swings that connect | Aim L / C / R | Drains L / C / R | Sling fires / ball | Jackpots / ball |
|---|---|---|---|---|---|---|---|---|
| 35 ms (sharp) | 43.7 s | 13.6 | 2,282 | 83% | 855 / 1750 / 1192 | 58 / 169 / 52 | 1.66 | 0.52 |
| 70 ms (casual) | 22.8 s | 6.7 | 1,055 | 76% | 698 / 538 / 752 | 66 / 157 / 75 | 1.11 | 0.15 |
| 110 ms (sloppy) | 12.3 s | 3.5 | 509 | 69% | 388 / 200 / 450 | 73 / 160 / 67 | 0.70 | 0.08 |

Drain side: "center" means the ball left between x 8.2 and 11.8 (the batter-reachable middle). The sides are escapes past the slings or the batter's reach.

**Straight-pitch timing window:** contact is possible for 248 ms of swing-start times. The earliest swings aim full left, the latest aim full right, and the middle goes straight up. Every valid contact leaves at the same 26 u/s.

**Browser frame timing** (headless Chrome, software GL, so a pessimistic number): about 17.8 ms average frame and 33 ms p95. A real device check is still needed.

**Touch (emulated, 390 px wide):** touch-down moves the batter 0.0. A 60 px drag moves about 3.2 to 3.9 world units, so the full lane is about 170 px of thumb travel. A right-half tap during an active drag starts the swing immediately. Release holds the batter's position, and `scrollY` stays at 0.

## What changed from prototype 01 and why

1. **Bat contact matched what's drawn.** The old hit zone was a 0.44-unit horizontal strip, and aim came from the ball's y-position inside that strip. Now the contact envelope is the bat capsule itself, swept between substeps so a fast bat can't skip the ball. Aim comes from the bat angle at the moment of contact, which is the swing timing. All the spec rules still hold: no collision at rest or during recovery, downward balls only, in front of the batting line, and one hit per swing.
2. **The aim map is centered on measured data.** The first pass skewed hard to the right (1716 right vs 235 left). Contact happens on the leading edge of the bat, so the bat's centerline was still "late" when it touched. The center angle now sits in the middle of the measured contactable range (−1.1 to +0.9 rad).
3. **Bumpers actually kick.** The old post-hit impulse changed velocity by about 0.2 u/s. Pop bumpers now push the ball out at 15+ u/s, applied after the solver step so the solver doesn't overwrite it.
4. **No ball traps.** Wall targets are trapezoids with a top edge that slopes into the table. A stillness watchdog nudges the ball after 1.6 s, and in testing it never had to fire.
5. **Board content.** Four baseball pop bumpers, a glove bumper, a jackpot standup target, three bullseyes, two 3-target wall banks, two side lanes with rollover sensors (a "powered lane" chase light), three posts, and two blue automatic slingshots on the lower angled walls, below the batting line. The center pitch corridor and the batter lane are kept empty.
6. **Physics:** 240 Hz fixed step, bullet CCD, and a 36 u/s speed cap. In the tests, an 80 u/s ball fired in 64 directions never tunneled out.

## Biggest limitations and risks

- **No real phone has been tested yet.** Thumb reach, drag sensitivity (×1.15) and frame rate on a mid-range Android all need a hands-on check.
- **The bot is better than a human at tracking.** Real survival times will be lower than the 35 ms row. Use `playtest.report()` after a real session to compare.
- **The right side gets busier than the left.** The mid-right bumper is the most-hit machine at every skill level. The glove (left) catches fewer balls than that bumper, and the right sling fires less than the left. This is mild, but worth a symmetry pass.
- **The jackpot is hard to reach.** A straight-up hit runs into the center bullseye and then the top bumper. That may be the right reward curve, or it may be too shielded.
- **The center drain dominates** (about 55% of strikes). Mostly these are swings that missed or were never made on balls coming straight down the middle. That's expected, but if it feels unfair, widen the contact tolerance or slow the late-game ball.

## Recommended next iteration

1. Play 20+ balls on a real phone and compare `playtest.report()` with the table above.
2. Tune feel in this order: `swing.exitSpeed`, `gravity`, `bumper.kick`, `swing.tolerance`. All of them are in `src/config.ts` and live-editable through `tune.*` in the console.
3. Do a symmetry pass on the lower-mid machines (glove vs. mid bumper).
4. Decide whether the jackpot should be a precise straight-up reward or more reachable.
