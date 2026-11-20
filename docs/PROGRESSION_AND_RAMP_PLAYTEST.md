# Power progression, challenge pacing and eight-checkpoint ramps (Nov 19)

Route: `/build-test/` (theme preview `?theme=toxicThunder`). `/`, `/1`, `/2`, `/3` are unchanged: the golden replay
passes, and the legacy ramps keep their old gate and finish payouts (tested).

This doc is the current reference for Power and targets. The Power and target numbers in
`BUILD_LOOP_PLAYTEST.md` and `UPGRADE_SYSTEM_2_PLAYTEST.md` are superseded.

## Decisions and status

| Item | Status | Value |
| --- | --- | --- |
| Starting max Power | Approved direction | 6 |
| Power growth | Approved direction | +1 permanent max Power per inning (3 challenges), granted when you clear C3, C6 … C24, **before** that clear's free draft is rolled |
| Target seeds C1–C3 | Unchanged | 1,500 / 4,000 / 8,000 |
| Target growth after C3 | **Experimental test value** | ×1.4 per challenge (was ×1.6), configurable in `ECONOMY.targetGrowth` |
| Build-test ramp payout | Owner's concept, initial test value | 8 checkpoints × 1,000 = 8,000 base per full ride (`RAMP_CHECKPOINTS`, data per ramp) |

## A. Power by inning

| Inning | Challenges | Max Power |
| --- | --- | --- |
| 1 | 1–3 | 6 |
| 2 | 4–6 | 7 |
| 3 | 7–9 | 8 |
| 4 | 10–12 | 9 |
| 5 | 13–15 | 10 |
| 6 | 16–18 | 11 |
| 7 | 19–21 | 12 |
| 8 | 22–24 | 13 |
| 9 | 25–27 | 14 |

How the grant works:
- It happens inside `Run.clear()` before the draft is rolled. The new capacity is usable in that very draft: with 6/6
  Power filled, the draft right after the grant offered an installable machine in 28 of 30 seeds (tested).
- **UI:** the free-pick and shop panels show `INNING n UNLOCKED — MAX POWER +1 (n TOTAL)` as one small banner line
  with no animation. Draft, shop and the gameplay strip all show ⚡used/max.
- **Tests cover:**
  - grants exactly at C3, C6 … C24
  - none after C27, none on failure
  - no double grant on a repeated `clear()` or a reroll
  - 14 when entering C25
  - the banner clears on the next challenge

**Mounts vs Power:**
- The 13 mounts can absorb at most **16 Power**: 12 machines, with every other placement in conflict. Found by an
  exhaustive install search.
- 14 Power at C25 therefore still fits.
- **From about inning 6 (11 Power) most mounts are taken**, so free drafts will mostly offer premium upgrades rather
  than machines. In practice that becomes the real limit late. Reported only: no factory hardware was rearranged,
  and there's no selling or replacement.

## B. Targets (×1.6 before, ×1.4 now)

| Challenge | Old ×1.6 | New ×1.4 |
| --- | --- | --- |
| 1 | 1,500 | 1,500 |
| 2 | 4,000 | 4,000 |
| 3 | 8,000 | 8,000 |
| 4 | 12,800 | 11,200 |
| 5 | 20,500 | 15,700 |
| 6 | 32,800 | 22,000 |
| 7 | 52,400 | 30,700 |
| 8 | 83,900 | 43,000 |
| 9 | 134,200 | 60,200 |
| 10 | 214,700 | 84,300 |
| 11 | 343,600 | 118,100 |
| 12 | 549,800 | 165,300 |
| 13 | 879,600 | 231,400 |
| 14 | 1,407,400 | 324,000 |
| 15 | 2,251,800 | 453,600 |
| 16 | 3,602,900 | 635,000 |
| 17 | 5,764,600 | 889,000 |
| 18 | 9,223,400 | 1,244,500 |
| 19 | 14,757,400 | 1,742,400 |
| 20 | 23,611,800 | 2,439,300 |
| 21 | 37,778,900 | 3,415,000 |
| 22 | 60,446,300 | 4,781,000 |
| 23 | 96,714,100 | 6,693,500 |
| 24 | 154,742,500 | 9,370,800 |
| 25 | 247,588,000 | 13,119,200 |
| 26 | 396,140,800 | 18,366,900 |
| 27 | 633,825,300 | 25,713,600 |

There's still no 27-challenge game loop; the table is just the formula.

## C. Ramp checkpoints (Turbo Ramp and Overpass Bridge on /build-test/ only)

**Placement and payout:**
- Eight non-colliding checkpoints sit along the raised path.
- They're evenly spaced from just past the climb crest to the exit, and the last one is the exit.
- **A rollback can only happen on the climb, so a failed entry pays nothing.** That rollback code is unchanged; see
  Surprises.
- Every ride that clears the crest is carried through all eight.

**Replacement, not addition:**
- A full ride is exactly 8 × 1,000 = 8,000 base.
- The old Turbo +600/+1,000 and Overpass +750/+600 are gone on these installs.
- At ×5 global that's 40,000. The multiplier is applied once per checkpoint by `rules.award`.

**Once per ball per ride:**
- Each ride keeps a forward-only pointer to the next checkpoint.
- A huge physics tick pays every crossed checkpoint in order, once each.
- Multiball riders earn their own eight.
- A later legitimate ride pays all eight again.

**Upgrades keep their meaning:**

| Upgrade | Applies to | Result per full ride |
| --- | --- | --- |
| Toll Booth (+500) | the checkpoint nearest the old midpoint gate (key `<id>-gate`); card now reads "+500 on the halfway checkpoint" | 8,500 |
| Nitro (×1.5) | the final checkpoint (key `<id>`); card reads "×1.5 on the final checkpoint (+500 per full ride)" | 8,500 |
| Toll Booth + Nitro | both checkpoints | 9,000 |
| Victory Lap / Parade | completion generator, fires once per full ride after the final checkpoint scores, never per checkpoint | unchanged |

**Presentation:**
- **Static:** eight thin lamp bars across the channel, cached in the ramp layer. The finish bar is wider, with chrome
  posts.
- **Live lamps:** idle chase; amber once paid on the current ride; a white-hot flash on payout.
- **Effects:** a theme-tinted flash and five sparks per checkpoint, plus one ring flourish at the finish (no extra
  points).
- **Tally:** a **single running tally per ramp** (`+1,000 … +7,000`, then `RIDE +8,000`) pulses beside the ramp.
  Eight separate labels stacked into an unreadable column on the short Turbo, so they were replaced.
- **Sound:** a rising note per checkpoint and a chord at the finish.
- **Card copy:** "Full ride: 8 checkpoints × 1,000 = 8,000 base …".

**Payout audit** from real browser rendering at 390×844 (both ramps, both themes): checkpoints fired 0…7 at 1,000
each, and the score went 0 → 8,000 exactly. Screenshots: `docs/screenshots/ramp-checkpoints-overpass.png` and
`ramp-checkpoints-turbo.png`.

## Bot measurements

These come from `scripts/bot-run.ts`: 30 runs per config, up to C15, strategy "any". The bot **does not aim ramps**: it
entered one only about once per 20 challenge attempts. **This is bot data, not a prediction of skilled human clear
rates.** Comparison switches: `BOT_GROWTH`, `BOT_POWER=flat5`, `BOT_RAMPS=legacy`.

**70 ms timing error, seed 7** (clear rate / average seconds to clear):

| Challenge | Old (×1.6, 5⚡, legacy ramps) | Only ×1.4 | Only Power | Only ramps | **Combined** | Combined ×1.5 (alt) |
| --- | --- | --- | --- | --- | --- | --- |
| C3 | 74% / 64 s | 82% / 64 s | 80% / 68 s | 86% / 60 s | **81% / 56 s** | 88% / 67 s |
| C4 | 70% / 84 s | 74% / 70 s | 75% / 73 s | 63% / 71 s | **86% / 58 s** | 61% / 61 s |
| C5 | 57% / 96 s | 71% / 79 s | 40% / 80 s | 53% / 81 s | **79% / 68 s** | 57% / 87 s |
| C6 | 50% / 99 s | 50% / 82 s | 33% / 89 s | 38% / 96 s | **60% / 72 s** | 50% / 111 s |
| C7 | 50% (n=4) | 33% (n=6) | 100% (n=2) | 33% (n=3) | **78% (n=9) / 68 s** | 25% (n=4) |
| Avg challenge reached | 4.5 | 5.1 | 4.4 | 4.7 | **5.5** | 4.5 |
| Machines / Power used / max | 2.7 / 3.7 / 5 | 2.8 / 4.2 / 5 | 3.1 / 4.5 / 6.8 | 2.8 / 4.1 / 5 | **3.8 / 5.5 / 7.1** | 3.2 / 4.6 / 6.9 |
| Ramp share of points | 3.4% | 1.3% | 2.7% | 8.6% | **14.4%** | 9.2% |
| Multiplier best | ×2.6 | ×2.8 | ×4.4 | ×3.1 | **×4.2** | ×3.1 |

Combined, seed 8: reached 4.9 on average; C5 77% (69 s), C8 67% (75 s); ramp share 6.3%.

**Combined at 40 ms timing error (a better player), seed 7:**
- **Clear rates:** C5 75%, C8 79%, C10 86% (n=7), C12 50% (n=4), C15 cleared 1 of 1.
- **Average challenge reached:** 7.3, with 5.0 machines and 6.7 of 7.7 Power used.
- **Clear time:** grows from 23 s (C1) to 52–80 s (C3–C7), then 86–157 s (C9–C15). That's inside the 1–3 minute goal.
- **Ramps:** 49 entries, 38 full rides; ramp share 9.2%.
- **Multiplier:** best ×5.6.

Health checks: there were zero drafts without a usable pick and zero empty shops across every config.

Read-out:
- The three changes compound. Power alone doesn't help the bot (it fills capacity with low-yield picks), ×1.4 alone
  helps a little, and the combination helps most.
- **×1.4 is not trivial for the bot.** Clear times still rise toward 2–2.5 minutes by C11–C15.
- For a skilled human it's a much bigger change: **the C12 target drops from 549,800 to 165,300 and C13 from 879,600
  to 231,400.** Expect the middle innings to feel much easier than the C12–C13 wall you hit. The difficulty now
  arrives in innings 5–6 (C15 453,600; C18 about 1.24M).
- Tested alternative: ×1.5 is clearly harder for the bot (C5 57%). Another option is ×1.45. The approved test value
  stays ×1.4 until human play says otherwise.

Measured ride counts: the "full rides" figure is lower than checkpoints ÷ 8 because an 8,000 ride often clears the
challenge mid-ride. The run stops there, which is correct: challenges clear immediately.

## Surprises

- **Rollbacks** only happen on the climb, before the crest. A ball that enters is either carried all the way or rolls
  out before the first checkpoint. That matches your experience that entered balls always go all the way round.
- **The old midpoint gate** was not a separate skill shot, as you said. Its position is still used, but only to mark
  which checkpoint Toll Booth targets.
- **Mount saturation** around inning 6+ (see A).
- **VFX cost** (headless desktop Chrome at DPR 3, not an iPhone): with both ramps fed a new ride every 0.75 s for 900
  frames, frame cost is p50 0.7 ms and p95 about 3 ms; heap about 5–6 MB. As in the multiplier stress test there was
  one roughly 200 ms outlier frame per run, not investigated. No real-device measurement was made.

## Open balance questions for human playtesting

1. Does ×1.4 make innings 2–4 too easy now that ramps pay 8,000 base and Power grows? Is ×1.45 or ×1.5 the better
   next test?
2. Does a full ride at 8,000 (×multiplier) now outshine the glove scoop by the right amount, or by too much?
3. Should Turbo (2⚡, shorter, easier to reach) and Overpass (3⚡, harder) differ, e.g. 6 × 1,000 versus 8 × 1,250? The
   data supports per-ramp values.
4. When late drafts run out of mounts, should premium upgrades be weighted higher, or should a future pass add
   mounts?
5. Is the running tally the right amount of feedback, or should each checkpoint also show its own "+1,000"?
