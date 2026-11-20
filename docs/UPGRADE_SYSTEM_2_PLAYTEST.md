# Upgrade System 2.0: playtest notes (Nov 19)

Route: `/build-test/` (theme preview: `/build-test/?theme=toxicThunder`). `/`, `/1`, `/2`, `/3` are unchanged: the
golden replay of the original table still passes, and no legacy map can produce a multiplier.

## Approved rules (implemented as specified)

- **Global challenge multiplier** starts at ×1.0 each challenge. It's stored as integer tenths (`rules.multTenths`), so the
  readout never shows float noise.
  - It's applied exactly once, at the central scoring boundary (`GameRules.award`):
    `awarded = round((base + Σadd) × Πmul × global)`.
  - This covers every ordinary source: bat hits, bumpers, targets, jackpot, lanes, slings, spinners, ramp gates and
    finishes, scoops, banks and splitter hits.
  - **Bat hits follow the global multiplier**, which is the default choice.
  - A gain affects later scoring only. The event that triggers it scores at the old value.
  - It **persists across all three strikes within the same challenge**, including the next Ready/serve; a drain (including the final multiball ball) does not reset it. It resets to ×1.0 when a new challenge/run begins.
  - No cap, and points banked before a drain stay banked.
- **Multiplier Gate** is a physical machine, chosen in the free draft. It costs 1 Power, and you pick the left or
  right alley top. Owning both costs 2 Power.
  - It's a sensor line at y=4.75 across the top of each side alley, under the start of the lane rail. It has no
    collision body, so it can't block or trap a ball, and it coexists with the lane spinner mount (y=5.6) and the
    rollover lanes.
  - **One proc per real traversal, in either direction.** The ball must be clearly on one side of a 0.15-unit dead
    band, then clearly on the other side, while inside the opening.
  - Resting on the line, jitter, crossing outside the opening and ramp or scoop teleports never count. There's no
    cooldown, so every legitimate later pass counts.
  - Each pass adds +0.1×, plus +0.1× per **Express Lane** on that gate (0.1 → 0.2 → 0.3). Upgrades raise the payout,
    never how often it procs. Left and right are upgraded separately.
  - Gates award no points.
- **Feedback:**
  - On the table: the gate flashes in the theme's `multGlow` color, a "+0.1×" (or the upgraded amount) pops just
    inside the table, and a rising blip plays that climbs in pitch with the multiplier.
  - Top-right plaque (from the reference GIF): the value flips, the window border lights up, the plaque bumps 7%, rays
    burst behind it and it settles in about 0.9 s. A new proc restarts the animation, so there's never a backlog.
  - The readout is always the live value, including during multiball and after a reset. Plaque colors come from the
    theme: `multGlow` and `multStitch` (Classic red-orange and red; Toxic lime and violet).
- **Reward/shop split:**
  - **Draft** (free, pick 1 of 3): physical machines that fit right now, plus premium upgrades. Premium upgrades always
    have a factory-bumper target, so even at full Power there's a usable pick (tested over 60 seeds).
  - **Shop:** modifiers only. A machine can't be sold there, even if it's injected (tested through 8 rerolls × 40 seeds).
  - Power is still installation capacity, and modifiers cost no Power.

## Multiplier sources

Each modifier is tied to one part, so a copy raises the payout, never the frequency.

| Modifier | Where | Condition | Payout |
| --- | --- | --- | --- |
| Multiplier Gate (machine, ⚡1) | Draft | each pass through that gate | +0.1× |
| Express Lane | Shop + Draft | each pass through that gate | +0.1× more |
| Sweet Spot | Shop | every 5 hits on ONE named bumper | +0.1× |
| Hall of Fame | Draft | every 5 hits on ONE named bumper | +0.2× |
| Victory Lap | Shop | each completed ride on that ramp (not entry, not rollback) | +0.1× |
| Victory Parade | Draft | each completed ride on that ramp | +0.2× |
| Pennant | Shop | each completion of that target bank | +0.2× |
| Pennant Race | Draft | each completion of that target bank | +0.4× |

- Bumper targets are single, named bumpers: the 5 factory pops, the glove bumper or an installed bonus bumper. There
  are no groups, so nothing is double-counted.
- Copies with the same cadence share one counter and add their payouts. For example, Sweet Spot + Hall of Fame on one
  bumper pays +0.3× every 5th hit.
- New premium point upgrades (draft only): MVP (×2 on one bumper) and Clutch (+1,000 bank bonus).
- All earlier modifiers stay in the shop unchanged.

## Experimental knobs (not approved balance)

- Bumper cadence is `BUMPER_GEN_EVERY = 5` (`catalog.ts`). Every payout amount and price above is a test value.
- **Generator counter lifetime** (experimental): progress toward "every 5 hits" carries across strikes within a
  challenge and resets at the next challenge, the same as bank and splitter progress. The global multiplier
  now also persists across strikes within a challenge.
- Draft machine share is `draftMachineShare = 0.6` (`economy.ts`). The gate costs $6; the shop never sells it.
- Gate line position and size: y=4.75, from the wall to 0.1 past the rail, with a 0.15 dead band.

## Bot measurements

> The following bot figures are from the earlier strike-reset build (before challenge-long multiplier persistence). They are retained as historical comparisons, not new balance results.

These come from `scripts/bot-run.ts` with 70 ms timing error and 30 runs per strategy, to challenge 5. The bot doesn't
aim for alleys or bumpers, so it understates skilled gate play.

| Strategy | C3 clear | C4 clear | C5 clear | Avg peak × per strike | Best × | Gain by source (tenths) |
| --- | --- | --- | --- | --- | --- | --- |
| any | 81% | 67% | 43% | ×1.04 | ×2.30 | gate 37, bumper 41, ramp 17, bank 10 |
| gate | 78% | 76% | 50% | ×1.06 | ×1.90 | gate 84, bumper 60, ramp 6, bank 6 |
| nogate | 81% | 55% | 67% | ×1.03 | ×1.80 | bumper 49, bank 16, ramp 6 |
| bumper | 78% | 71% | 73% | ×1.07 | ×2.50 | bumper 165, gate 4 |
| objective | 78% | 48% | 60% | ×1.04 | ×1.90 | ramp 26, bumper 38, bank 18, gate 25 |

Samples are small (10–21 attempts at C4–C5), so read these as trends. The average peak is low because upgrades arrive
one per challenge and early strikes have nothing.

Rates per live minute with both gates preinstalled (41 bot-minutes):

| Part | Hits per minute |
| --- | --- |
| bumper-mid | 10.0 |
| glove | 5.9 |
| bumper-right | 3.2 |
| bumper-left | 3.1 |
| bumper-top-r | 1.8 |
| bumper-top-l | 1.5 |
| lane rollovers | ~1 per side |
| **each gate** | ~0.75 per side |

The average strike lasts about 23 s, so a gate procs about 0.3 times per strike per side.

**Read-out:**
- Gates aren't compulsory. Non-gate paths clear as well or better for the bot.
- They aren't unreachable either: alley traffic is about lane traffic, and a player aiming for the alleys will beat
  the bot's rate.
- They aren't too common: about one proc a minute per side without aiming.

**Performance** (headless desktop Chrome, DPR 3, not a phone, both themes):
- 200 forced gate procs in 10 s with 3-ball multiball.
- Frame cost (sim + render): p95 2.6–2.7 ms.
- One outlier frame of about 180 ms per run, not investigated.
- Heap went from 3.7 to about 6.6 MB.
- The plaque animation restarts instead of queueing.

## Open balance questions for the player

1. **Sweet Spot / Hall of Fame depends heavily on which bumper rolls.**
   - On the mid-right bumper (about 10 hits a minute) it pays about every 30 s, without aiming. That beats an un-aimed
     gate.
   - On a top bumper (about 1.5 hits a minute) it pays about once every 3 minutes.
   - Options: per-bumper cadence, only offering low-traffic bumpers, or a higher N. Kept at 5 for this playtest.
2. Gate traffic without aiming is modest (about 0.75 a minute per side). If aimed play still feels rare on a phone, the
   line could move a little lower or get wider. Physical shots weren't changed to help it.
3. Pennant (+0.2× in the shop) is generous per completion, but banks complete rarely (bank total 10–18 tenths over
   about 250 strikes).
4. Should Express Lane stay in both pools at +0.1×, or should the draft get a stronger premium gate upgrade?
5. Should the multiplier also show in the build summary or the strike overlay ("best ×" this strike)?

## Tests

`tests/upgrade2.test.ts` has 17 tests:
- gate Power and mounts
- traversal: both directions, each side, jitter, resting, outside the opening, multiball, teleports
- ×1 start and reset timing
- extra-ball drain keeps the multiplier
- no retroactive scoring, applied once after part modifiers
- legacy maps never generate a multiplier
- gate stacking with independent sides
- bumper, ramp and bank generators, including rollback not counting
- progress carrying across strikes and resetting on the next challenge
- draft size, premium-only modifiers and the usable pick at cap
- shop has no machines through rerolls
- premium is stronger than shop
- card text matches the numbers

The full suite is 93/93, including the golden replay.

> **Superseded numbers:** Power (now 6 +1/inning), target growth (now ×1.4) and build-test ramp payouts (now 8 × 1,000 checkpoints) are documented in [PROGRESSION_AND_RAMP_PLAYTEST.md](PROGRESSION_AND_RAMP_PLAYTEST.md).
