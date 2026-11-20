# Upgrade System 3.0: playtest notes (Nov 20)

Route: `/build-test/` (theme preview `?theme=toxicThunder`, developer report `?devAnalytics=1`). `/`, `/1`, `/2` and `/3`
are unchanged. The golden replay passes, Map 1 keeps its own Sidewinder path, payouts and bumper removal (tested), and
`stable` is untouched.

## What changed, by milestone

### M1: Five innings, 15 challenges (approved)

- 5 innings × Starter / Reliever / Closer. `ECONOMY.lastChallenge` is 15.
- Max Power is 6 / 7 / 8 / 9 / 10. +1 is granted on clearing C3, C6, C9 and C12, before that clear's draft.
- **Clearing C15 wins the run.** There's no Power grant, draft, shop or C16. The RUN COMPLETE screen offers a new run,
  and the developer report records the outcome `completed`.
- Challenge screens say e.g. `INNING 2 · RELIEVER · CHALLENGE 5 OF 15`. There are no boss mechanics.

### M2: Board-anchored modifiers and selling (approved rules)

- **Items and parts:** an installed **item** is one acquisition: a single machine, or a bundle with several
  **parts**. Part ids are stable site anchors (`ramp@orbit-l`, `mgate@gate-l`, `twin-a@flank-l`).
- **Targeted modifiers belong to the board:** they're keyed by part id, not by the owned object.
  - When the part leaves the board, its modifiers go **dormant**; the sim simply never sees that id.
  - Reinstalling a compatible part **at the same site** wakes them exactly once. They never moved or got copied,
    so they can't duplicate.
  - A test checks that a part id is only ever produced by one part type. Paired gates deliberately reuse the
    single-gate ids, since they're the same type at the same site.
- **Displaced factory parts:** a factory part removed by an installed item (the Long Loop removes the mid-right
  bumper, as Map 1 does) sends its modifiers dormant, and they wake when that item is sold.
- **Group modifiers never go dormant:** `bumper:*`, `multgate:*`, `ramps:*`, `ramp:*` and `cross:*` apply to every
  compatible part, including parts installed later.
- **Selling** is allowed only between challenges, in the draft or shop phase. It removes the whole item (bundles are
  atomic), frees 100% of its Power and sites, and **refunds floor(actual price paid / 2)**.
  - Provenance (`via`, `paid`) is tracked. Free draft rewards refund **$0**.
  - The shop still sells modifiers only, so every machine today refunds $0. The refund rule is future-proofed and
    tested with $9 → $4 and $6 → $3.
  - **Modifiers are never deleted.**

### M3: Manage Machine and the transactional draft (approved)

- An optional **MANAGE MACHINE** button sits in the free-pick and shop headers. Nothing is forced between challenges.
- **List:** each installed item with its sites, pieces, ⚡Power, provenance and refund ("free reward → $0"), how many
  modifiers are anchored to it, and any factory part it replaces.
- **Selecting** an item highlights every part on the real board.
- **SELL / DISMANTLE → confirmation** shows Power before → after, the refund, modifiers going dormant (names and
  sites), and factory-part modifiers waking. CANCEL changes nothing.
- **BACK** returns to the same draft or shop: same offers, prices, selection and reroll price. Selling never
  rerolls and never spends the pick.
- **Over-capacity draft offers stay visible** with "Needs room: blocked by X; needs N more free Power" and a
  MANAGE MACHINE button.
  - Taking them is a no-op until there's room, so the free pick is spent only on a successful install.
  - Every draft also has at least one immediately claimable modifier.
  - Machines over max Power, or whose only sites hold the same machine type, are never offered.
- **Mobile:** checked at 390×844 in both themes. The manage list scrolls inside the panel (`overscroll-behavior:
  contain`), and the page never scrolls (`scrollY` 0, document height = viewport).

### M4: Group and cross-family modifiers (approved category, experimental values)

Cards show a **THIS / ALL / CROSS** badge.

| Modifier | Where | Effect |
| --- | --- | --- |
| Bumper Crew | draft | **ALL bumpers** +100 per hit |
| Rally Cap | shop | **ALL bumpers** ×1.25 |
| Crowd Noise | shop | **ALL bumpers**, every 20 bumper hits (any bumper, one shared counter): +0.1× |
| Standing Ovation | draft | as Crowd Noise, +0.2× |
| Gate Network | shop + draft | **ALL multiplier gates** +0.1× more per pass. A copy raises payout, never frequency. The Jackpot Lane Gate and ramp checkpoints don't match. |
| Express Track | shop | **ALL ramps** +250 on every checkpoint (+2,000 per full ride). Uses the `ramps:*` family key, so nothing is double-applied. |
| Grand Tour | draft | **ALL ramps**, each full ride +0.2× (once per ride, on the final checkpoint) |
| Rally Fuel (draft) / Momentum (shop) | | **CROSS:** after any full ramp ride, the next 5 bumper hits get +500 / +200 each, added to that hit's own points |

**Rally Fuel / Momentum rules:**
- One shared pool, refilled to 5 by a ride. It never stacks to 10, so multiball can't multiply it.
- It persists across strikes and resets with the challenge.
- Arithmetic is unchanged: `(base + Σadd) × Πmul × global`. Global multiplier gains affect only later scoring.

### M5: Bundles and the Long Loop

**All coordinates, costs and prices here are experimental** (source constants in `catalog.ts`).

| Bundle | Site | Pieces | Power | Notes |
| --- | --- | --- | --- | --- |
| Twin Bumpers | `flank-l` or `flank-r` | 2 real bumpers (r 0.55, 250 a hit) | 2 | Under each side-alley exit, beside the wall target banks |
| Triple Bumper Cluster | `cluster-r` | 3 real bumpers (r 0.5, 200 a hit) | 3 | Equilateral triangle, side 2.1, right mid-field. Gaps ≥ ball diameter, so the ball rattles through with no pocket. |
| Paired Multiplier Gates | `gate-l` + `gate-r` | 2 gates | 2 | Atomic span: needs both alley tops free |

- No bundle discount: Power is the sum of the parts.
- Each child is its own physics fixture, scores under its own id, inherits group effects, and is preserved by the
  Turbo → upper-bumper area, which stays untouched.

**Long Loop** (`loop-r`, ⚡3, Map 1's Sidewinder):
- **Path:** climbs the right wall, circles the top, then descends the left side.
- **Tail:** moved down the left wall for the build test, so it drops below the Turbo mouth instead of crossing the
  Turbo route.
- **Mouth:** needs the mid-right factory bumper gone, exactly as Map 1 removes it. That's an explicit, sellable
  displacement shown in Manage Machine.
- **Payout:** 8 checkpoints × 1,000 = 8,000 base. There's no old gate or finish payout; Toll Booth and Nitro keep
  their halfway and final checkpoints.
- **Route:** a third distinct one. Turbo feeds the upper bumpers, Overpass crosses the center toward the bat, and
  the Long Loop circles the table and drops mid-field.

**Declared conflicts (both directions, tested):**

| Pair | Why |
| --- | --- |
| `loop-r` ↔ `pocket-r` | The Long Loop climb passes over the glove scoop |
| `loop-r` ↔ `flank-l` / `flank-r` | It passes over both flanks |
| `loop-r` ↔ `cluster-r` | It passes over the cluster |
| `cluster-r` ↔ `flank-r` | Overlapping footprint |
| `cluster-r` ↔ `bridge` | The Overpass climb passes over the cluster's left bumper |

These are trade-offs, not new rules. Four full-build configurations cover every placement of every machine with no
fixture overlap, open drop landings, and no traps under random play.

### M6: Hybrid-weighted offers (approved principle, experimental numbers in `weights.ts`)

- **Weights:** each candidate gets **1** (wildcard floor), plus **0.5 per unit** of investment in its family,
  capped at **+2**, plus **+2** if a specific synergy matches.
  - A unit is one installed part, or half a unit per modifier copy.
  - The shop scales the affinity terms by 0.5, so it's more exploratory.
  - A draft slot is a machine 55% of the time when one is feasible.
- **Synergies:** Turbo → bumper bundles, Rally Fuel and bumper-wide upgrades. Any ramp → ramp-wide upgrades and
  another route. Gates → Gate Network and paired gates. 2+ bumpers → bumper-wide upgrades. Banks → completion
  rewards. Jackpot lane → jackpot upgrades. Splitter → bumper traffic.
- **Determinism:** the same seed and board give the same offers. 20 different seeds gave ≥15 distinct drafts.
- **Seeded distribution check** (400 seeds; tested, and the thresholds are tests):
  - A Turbo + twin-bumper build sees clearly more bumper offers than a gate build.
  - A gate build sees more gate offers than a bumper build.
  - Even the bumper build gets >40% off-family offers and >15% pure wildcards.
- **Shop:** a full 4-card restock at $1, $2, $3, $4 (tested), modifiers only.

### M7: Analytics (schema `baseball-pinball/dev-run@2`; v1 records still load)

The ledger and snapshots now record:
- items and their parts (bundle parent and children), and per-child scoring sources
- purchases and acquisitions with provenance
- **sales** (refund, Power freed, before → after)
- **modifiers going dormant and reactivating**
- offer **origin and weight** (`synergy` / `family` / `wildcard`) and machine feasibility (`now` / `after-selling`),
  in developer data only
- the C15 **completed** outcome

Score reconciliation is unchanged: one award boundary, gains never counted as points.

## Pacing findings (measured, not solved)

Source: `scripts/bot-run.ts`, 30 runs per config, seed 9, C1–C15. **The bot doesn't aim, doesn't sell, and has
near-perfect timing**, so these numbers are lower bounds on difficulty and on clear time, not human predictions.

**Time to clear in seconds of live ball, 40 ms bot ("any" strategy):**

| Challenge | Seconds |
| --- | --- |
| C1 | 22 |
| C2 | 43 |
| C3 | 54 |
| C4 | 45 |
| C5 | 51 |
| C6 | 44 |
| C7 | 48 |
| C8 | 57 |
| C9 | 74 |
| C10 | 72 |
| C11 | 81 |
| C12 | 85 |
| C13 | 84 |
| C14 | 75 |
| C15 | 83 |

**By strategy:**

| Bot | Strategy | Wins (C15) | Avg challenge reached | Ramp share of points | Best × |
| --- | --- | --- | --- | --- | --- |
| 40 ms | any | 2/30 | 8.3 | 11% | ×9.8 |
| 40 ms | bumper | 5/30 | 8.7 | 6% | ×6.0 |
| 40 ms | gate | 1/30 | 8.6 | 14% | ×8.1 |
| 40 ms | objective (ramps/banks) | 2/30 | 8.2 | 29% | ×6.8 |
| 70 ms ("low-skill / low-roll") | any | 0/30 | 4.6 | 13% | ×3.1 |
| 70 ms | bumper | 1/30 | 6.3 | — | — |
| 70 ms | gate | 0/30 | 4.8 | — | — |
| 70 ms | objective | 0/30 | 5.0 | — | — |

Read-out:
- **For the bot, ordinary challenges take about 1 minute of live ball, and late ones about 1.5–2 minutes.**
  That's already near the 1–2 / 3–4 minute aim.
- **Your 4–7+ minute challenges are therefore not explained by the target curve alone.** The likely contributors
  are swing timing (the 70 ms bot falls off fast), between-ball dead time, menus, and builds that don't connect.
- The **active-time** numbers in your developer reports (`?devAnalytics=1` → download after a run) are the evidence
  to settle this. Bot data can't.
- **Shortening the run to 15 challenges doesn't fix pacing.** It lowers total run length only.
- **Bundle traffic is modest:**
  - Cluster bumpers get about 1–2 hits per minute each.
  - Flank twins about 0.4–0.5 per minute each.
  - Bot balls rarely reach the flanks. A human aiming for the alleys feeds them more; I haven't verified that.
- No `targetGrowth` change is proposed from bot data. Hold ×1.4 until human reports arrive.

## Open questions for the next planning session

1. **Boss design** for the C3/C6/C9/C12/C15 Closer slots. The structure is ready, with no mechanics yet.
2. **Target curve:** human active-time data per challenge is needed before changing ×1.4.
3. **Long Loop:** is replacing the mid-right factory bumper (the busiest one) the right price, or should it be a
   different factory part or a different mouth?
4. **Flank bundles:** low bot traffic. Keep the flanks, or try a site with more traffic, e.g. the upper pockets?
5. **Weights:** do drafts feel coherent but surprising, or too samey? Tune `OFFER_WEIGHTS` / `SYNERGIES`.
6. **Refunds:** should the shop ever sell machines, which is when the refund rule starts to matter? It's out of
   scope here.
