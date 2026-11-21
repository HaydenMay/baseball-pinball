# V2.1 — Machine-wide ball variety: audit, changes, evidence

**Scope:** build-test (`/build-test/`, and the Upper Deck under `?v2=1`).
**Untouched:**
- `stable`, and `/`, `/1`, `/2`, `/3`. The golden replay is green, and no original-map ramp or scoop opts in (there's a test for this).
- Batting: timing, contact, aim mapping, exit speed and the batter.
- Bumpers, walls, slings and targets.
- Scoring, targets, Power, weights and the shop.
- Camera rules.

**Tool:** `node --experimental-strip-types scripts/flow-diagnostics.ts [trials] [only=key,...] [json]`
- It runs deterministic headless releases for every scripted exit, with sim seed = trial index and entry speed swept from 12 to 22.
- It follows each ball until it is back in the bat zone (y > 21), drains, or 10 s pass.
- It reports first contacts, distinct first-3 contact sequences, the machine groups reached, Upper Deck L/C/R first contact, return gaps, time aloft, recatches, and drains before the bat.

## 1. Audit: repeatable movement sources

| Source | Before | Cause | Finding or hypothesis |
|---|---|---|---|
| **Home Run Ramp release** | fixed point and heading; speed always 12 | The ride speed clamps to `maxRide` 18, so the exit clamps to `exitMax` 12 every ride. No RNG. | **Finding:** 60/60 rides hit the center deck bumper first, with only 8 distinct first-3 contact sequences. |
| **Upper Deck geometry** | a large center bumper (r 1.0) sat right in the release lane; the side bumpers sat low near the floor | geometry funnel | **Finding:** release-variety sweeps alone still gave about 60–75% center, and fast releases flew over everything and dropped straight out of the left gap (a "missed bonus"). |
| **Turbo exit** | fixed heading; speed clamped | fixed exit | **Finding:** 100% hit the right bumper first. That's the signature Turbo → upper bumpers flow, so it should be kept, just less identical. |
| **Overpass / Long Loop drop** | fixed drop heading | fixed exit | **Finding:** both are return feeds. The ball lands mid-field and rolls to the bat with **no contacts in between**. Overpass arrived center 98% of the time; Long Loop arrived right. |
| **Glove Scoop eject** | ±0.1 rad, ±8% | small spread, and the eject is aimed at the right cluster | **Finding:** with a cluster at `cluster-r`, 100% of first contacts were cluster-b. With the glove alone, 100% were the right bumper, with 17 distinct sequences. |
| **Splitter launch** | ±0.12 rad, ±8% | already varied | **Finding:** 41 distinct sequences, with first contacts spread over 4 parts. No change needed. |
| Bumpers, slings, walls, targets, gates | — | real physics | No invisible RNG added. A bot traffic review over 3 loadouts × 200 balls found no new traps. |
| **Glove cup** (pre-existing) | — | a ball that falls back into the cup during its 2.5 s recatch delay rattles there, then gets caught | **Finding:** 23–107 "bursts" (8+ cup contacts within 1 s) per 200 balls, the same or fewer after V2.1. **Not changed:** fixing it would change catch-scoring cadence, which is out of scope. It's logged as an open question. |

## 2. What changed (all values EXPERIMENTAL and named)

### Mechanism hook (no behavior change by itself)
- `RampDef.exitSpread { angle, speed }` (in `src/machines/mechanisms.ts`):
  - Each completed ride turns the exit heading by up to ±`angle` radians and scales its speed by up to ±`speed` (a fraction).
  - It uses the sim's seeded RNG, exactly two draws per completed ride, and only on ramps that opt in.
  - Rides, checkpoints and scoring are untouched.
- `ScoopDef.ejectSpread`: it defaults to `SCOOP_EJECT_SPREAD = { angle: 0.1, speed: 0.08 }`, which reproduces the old formula bit for bit.

### Per mechanism

| Mechanism | Value | Why |
|---|---|---|
| **Home Run Ramp** `HOME_RUN_RAMP.exitSpread` | `{ angle: 0.55, speed: 0.15 }`, i.e. ±31° around a ~13° down-left release, 10.2–13.8 u/s | The release works like a launcher: steep shots land right, the middle of the fan meets the center bumper, flat shots go left. |
| Home Run path end | now dips (`…(15.9, −7.9), (15.0, −7.7)`) | It released skimming the roof. Now it heads into the deck. |
| **Upper Deck bumpers** (free fixtures) | a row: L (6.6, −4.4), C (10, −4.3) r 0.8, R (13.4, −4.4), each r 0.95 except C | Before: low pair at (7.2, −2.8)/(12.8, −2.8) plus a big center bumper (10, −5.4) r 1.0 that caught everything. Each now sits under one part of the fan. |
| **Deck mount sites** | `deck-l` (3.4, −5.6), `deck-r` (16.6, −5.6) (were ±4.0, −4.8) | This keeps a ball-sized gap to the new bumper row for the cluster and bonus bumper. |
| **Turbo** `TURBO_EXIT_SPREAD` | `{ angle: 0.1, speed: 0.04 }` | Small on purpose. It still feeds the right bumper about 93% of the time, by a varied route. |
| **Overpass** `OVERPASS_EXIT_SPREAD` | `{ angle: 0.45, speed: 0.15 }` | The feed back to the bat now arrives in different places. There's nothing on its path to hit, so this mostly changes where the return arrives. |
| **Long Loop** `LOOP_EXIT_SPREAD` | `{ angle: 0.4, speed: 0.15 }` | Same reasoning as the Overpass. |
| **Glove Scoop** `GLOVE_EJECT_SPREAD` | `{ angle: 0.3, speed: 0.15 }` (was ±0.1, ±8%) | The relaunch now reaches the left-side bumpers and the top bumpers, not just its aim point. |
| Splitter | unchanged | It already varied. |

### Deliberately not randomized
- Bat timing, contact, aim, exit speed and batter movement.
- Every bumper, sling, wall, target, gate and lane contact.
- Ride speeds, checkpoints and every point value.
- The camera.

## 3. Evidence: before vs after (`flow-diagnostics`, 60 releases each)

| Source (loadout) | First contact | Distinct first-3 sequences | Other |
|---|---|---|---|
| **Home Run** (starter + deck) | before: center bumper 100% · after: C 47 / L 30 / R 17, about 5% miss the deck bumpers | 8 → 49 | Deck first contact L/C/R: 0/100/0 → **30/47/17**. Deck areas reached: L 5→42%, R 5→42%. Return gaps L/R 52/48 → 45/55. Time aloft 5.7 → 4.1 s. 0 drains. |
| **Home Run** (bumper-heavy deck) | same as above | 8 → 48 | Left deck reached 52→70%. Installed parts reached 97→65%: the old fixed groove happened to clip `bonus@deck-l` on nearly every ride. |
| **Home Run** (ramp-heavy) | same as above | 8 → 47 | Left table 53→62%. |
| **Turbo** | right bumper 100 → 93% | 20 → 36 | Left table reached 28→55%. 0 drains. |
| **Overpass** | no contacts either way | — | Bat-zone arrival L/C/R 2/98/0 → **12/88/0**. 0 drains. |
| **Long Loop** | no contacts either way | — | Arrival C/R 3/70 → **8/65**. 0 drains after a completed ride. The old "23% drains" were slow entries that rolled back, which the tool used to miscount. |
| **Glove + cluster** | cluster-b 100 → 80% (a 15, c 5) | 13 → 25 | Recatch 2 → 7%. |
| **Glove only** | right bumper 100 → 65% (top-left 17, left 7, rail 7) | 17 → 35 | Left table 18 → 48%. Recatch 5% → 5%. |
| **Splitter** | unchanged | 41 | — |

### Seeded bot (200 balls × 40 ms timing error, deck on, seeds 1–3)

| Loadout | Bat hits per ball, before → after | Score per ball, before → after |
|---|---|---|
| Ramps (Turbo, Overpass, Long Loop + deck mounts) | 24.3 / 25.3 / 21.7 → 20.8 / 22.8 / 21.1 | 25.7k / 27.4k / 23.9k → 22.0k / 26.0k / 25.4k, about −2% on average |
| Glove (glove + cluster + deck-l), seed 1 | 41.9 → 38.0 | 23.2k → 19.7k |
| Mixed (Turbo, glove, splitter, deck bonus ×2, spinner) | **170 / 147 / 171 → 91 / 108 / 86** | **110k / 92k / 107k → 54k / 62k / 50k** |

- **Drains within 4 s of a scripted release** (3 seeds, Overpass + glove + Turbo + Home Run): 53 + 107 + 59 + 0 → 44 + 87 + 22 + 7. **Fewer overall.**
- **Drains before the next bat contact after a deck return** (mixed, seeds 1–2): 2.8% → 4.9% of returns. That's about one extra lost ball per 50 deck returns.

**Why the mixed loadout dropped:** I isolated it by turning parts off. Only the deck geometry change (without any spreads) already gives 86 hits per ball. In the old deck, every Home Run ride hit the center bumper and came back down the same groove, and the bot's fixed swing sent it straight back up the ramp. That repeating loop is what V2.1 targets. A human may not have repeated it that reliably, so the real pace change for players is **uncertain**. The number to watch in playtest is how a deck-plus-glove build feels in innings 3–5. Per the handoff, I didn't compensate with points or targets.

## 4. Tests
`tests/ball-variety.test.ts` (8 tests):
- Only scripted exits opt in, and every original-map ramp and scoop keeps the old behavior.
- Spreads stay modest (≤ 0.6 rad, ≤ 20%).
- Seed replay is identical, and different seeds give different releases.
- RNG draw order: exactly 2 draws per spread ride.
- Home Run rides reach L, C and R (each ≥ 10%, C < 70%) with one 1,000 award per ride and no drains.
- Turbo still pays 8 checkpoints and feeds the right bumper ≥ 80% of the time.
- Overpass and Long Loop always reach the bat zone, with spread arrivals.
- The glove eject stays inside its spread and catch pays once.
- Splitter multiball with a ball in the deck: unique ball IDs, calm camera.

Upper Deck tests from V2 still pass, unchanged.

## 5. Mobile captures (390×844 @2×, `?v2=1`)
- `hr_fan_{classic,toxic}.png`: the same aimed Home Run shot with three sim seeds gives three different deck chains.
- `hr_rides.gif`: three seeded rides in a row.
- `glove_{classic,toxic}.png`: three seeded relaunches.
- `multiball_deck_{classic,toxic}.png`: three balls (IDs 1, 2, 3) with one in the deck. Zoom 0.785, no scroll, no page errors.

## 6. Open questions
- **Mixed-build score pace:** it halved on the bot after the loop broke. Play a deck + glove + splitter run and see whether innings 4–5 still feel strong.
- **Deck returns:** about 2 points more drains per return. If that's felt, the next lever is the gap positions or a small guide at the gap exits (geometry, not RNG).
- **Overpass / Long Loop:** variety there is limited to where the feed arrives, because nothing is on their drop paths. Adding a target on the drop path would be new content, so it's out of scope.
- **Glove cup rattle** during the recatch delay is pre-existing and unchanged.
