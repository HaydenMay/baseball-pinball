# V2.2: Upper Deck diamond, deck slings, Home Run Rally, right-pocket investigation

**Where it runs:** only `/build-test/?v2=1` with the Upper Deck unlocked (free, after C3).
**Untouched:**
- `stable`, and `/`, `/1`, `/2`, `/3`. Golden replays are green, and the original lower slings keep their shared debounce (there's a test for this).
- Bat, swing, timing and aim.
- Gravity.
- Global scoring and the checkpoint payouts of bought ramps.
- V2.1 exit spreads.
- Camera rules.

## Values

| | Value | Status |
|---|---|---|
| Home Run completion | **3,000** base (was 1,000); no checkpoints; 0 Power | **approved** |
| Upper Deck Rally | **×2** (`DECK_RALLY.factor`) on upper-deck bumper and deck sling contacts, for the ball that completed Home Run | **approved** |
| Rally level hysteresis | 0.45 world units either side of the top rail (y 0.6) | experimental |
| Diamond bumpers | `deck-bumper-t` (10, −6.1), `-l` (7.4, −4.5), `-r` (12.6, −4.5), `-b` (10, −2.7); r 0.9; 200 points, kick 15 | experimental |
| Deck slings | `deck-sling-l/r` on the deck side walls, y −3.7…−1.1, depth 0.95, kick 17, upward tilt 0.6 (~31°), 100 points | experimental |
| Deck mounts | `deck-l` (3.6, −5.6), `deck-r` (16.4, −5.6) (were ±3.4/16.6) | experimental |
| Home Run path | the climb now runs just outside the deck's right wall, so the right sling is visible; release ~level at (15.0, −7.85), V2.1 fan ±0.55 rad / ±15% unchanged | experimental |
| Sling debounce | per group: the two original lower slings share `'main'` (unchanged behavior); each deck sling has its own | fix |

## Rally rules (as built)
- **Start:** completing the Home Run ride awards 3,000 once, through `pts` → `award` (the global multiplier applies once). Then that ball gets `deckRally = true`. A rollback awards nothing and starts no Rally.
- **What counts:** a contact counts when the ball has Rally and the part is in `Layout.deckParts`. That list is computed from geometry: every bumper and sling physically above the top rail, so the diamond, both deck slings and anything bought on `deck-l`/`deck-r`.
- **How it applies:** the factor multiplies the contact's own modified points (after THIS, ALL and CROSS cards). `rules.award` then applies the global multiplier once. Example: 200 × 2 × global 3 = **1,200** (600 without Rally).
- **When it ends:**
  - The ball crosses back below the rail by more than the hysteresis. Only field or drop balls are tracked, so a raised ramp ride never "crosses".
  - The ball drains.
  - The ball is removed (strike or clear).
- **Not re-armed:** going back upstairs without a new completion doesn't restart Rally. A new completion does.
- **Per ball:** each ball has its own flag. Siblings and newly launched balls never inherit it.
- **Score events:** each carries `deckRally` (the factor) and `rallyGain` (banked minus what the same contact would have banked without Rally, using the same rounding via `rules.preview`). `deckRally` start/end events carry the reason, hit count and gain.
- **Feedback:**
  - On arrival: **"HOME RUN!  RALLY ×2"** headline (1.4 s), alongside the usual `+3,000` completion number.
  - While active: a gold pulsing halo on the Rally ball (theme jackpot accent).
  - On returning downstairs: a small "RALLY +N" tally.
  - The camera does nothing new.
- **Dev analytics** (`?v2=1&devAnalytics=1`): each challenge gets a `deckRally` block with Home Run completions and points, Rally starts and ends by reason, upper-deck points and hits, and Rally hits and gain. The report adds a "Home Run / Upper Deck Rally" section. Everything reconciles to the scoreboard (there's a test for this).

## Evidence

### M1 probe (`scripts/flow-diagnostics.ts`, 80 Home Run rides, starter + deck)

| | V2.1 row | V2.2 diamond + slings |
|---|---|---|
| Upper-deck hits per visit | 1.69 | **6.63** (7.85 at 60 rides) |
| Visits touching a deck sling | — | 53–72% |
| Hits by part (80 rides) | c 60, l 36, r 39 | t 155, l 78, r 85, b 86, sling-l 71, sling-r 55 |
| Returned to the table | 100% | 100% |
| Return gap L/R | 49/51 | 48/53 |
| Time upstairs p50 / p90 / max | 3.7 / 5.2 / 8.4 s | 4.3 / 9.4 / 16.4 s |

- **Bumper-heavy deck** (bonus on deck-l, cluster on deck-r): 4.4 → 11.7 hits per visit.
- **Long tail:**
  - 400 seeded rides on the starter deck: p99 13.2 s, max 19.2 s, none ≥ 20 s.
  - 192 grid drops: max 15.6 s, none stuck.
  - With bought deck bumpers: p99 22 s, max 38 s, 1% ≥ 20 s.
  - Every visit ended; nothing ran to the 60 s cap.
- **Sling tilt:** I swept 0.17–1.2. Tilt 0.35 made a sling ↔ lower-bumper ping-pong (up to about 24 s); 0.25 produced 50 s visits. 0.6 gave the most balanced part spread with a finite tail.

### Pace (seeded bot, 200 balls, 40 ms timing error, V2.1 → V2.2)

| Loadout | Score per ball, seed 1 / 2 | Bat hits per ball |
|---|---|---|
| Starter + deck | 14.0k / 11.9k → **31.6k / 31.4k** | ≈ same |
| Ramps (Turbo, Overpass, Long Loop + deck mounts) | 22.0k / 26.0k → 25.4k / 25.2k | ≈ same |
| Mixed (Turbo, glove, splitter, deck bonus ×2, spinner) | 54k / 62k → **114k / 105k** | ≈ same |

**Where the starter-deck points came from (seed 1):**
- Home Run completions: 42%.
- Upper-deck parts: 34%, of which Rally's ×2 added 16% of the total.
- The bot averaged 4.4 Home Run rides per ball. Deck returns are a repeatable feed back to the Home Run mouth for a fixed-swing bot.
- **This is the number to playtest:** the approved 3,000 and ×2 roughly double deck-build pace on the bot.

### Multiball proof (seed 8, global ×3; ball 1 rode Home Run, ball 2 was already upstairs)

```
ball 1 hr-ramp        base 3000 modified 3000 ×3 →  9000
ball 2 deck-bumper-r  base  200 modified  200 ×3 →   600      (sibling: no Rally)
ball 1 deck-sling-l   base  100 modified  200 ×3 →   600  [Rally ×2, +300]
ball 1 deck-bumper-l  base  200 modified  400 ×3 →  1200  [Rally ×2, +600]
ball 2 deck-bumper-r  base  200 modified  200 ×3 →   600
ball 1 deck-bumper-t  base  200 modified  400 ×3 →  1200  [Rally ×2, +600]
sum of awarded = scoreboard
```

## M3: right-side point farm (`scripts/right-pocket-probe.ts`)
Each loadout got 300 seeded cases: half random throws into the right pocket region (x 13.4–19.6, y 8.3–14.6), half bat-zone shots aimed 20–45° right. Each was followed for 10 s.

| Loadout | Longest visit | Hits per visit p50 / p90 / max | Re-entries in 10 s (max) | Stalls |
|---|---|---|---|---|
| Factory only | 1.4 s | 1 / 2 / 6 | 3 | 0 |
| Cluster on cluster-r | 2.0 s | 2 / 8 / 20 | 5 | 0 |
| Cluster + bonus on pocket-ur | 2.0 s | 2 / 9 / 20 | 5 | 0 |
| Twin on flank-r | 1.7 s | 1 / 6 / **29** | 7 | 0 |
| Cluster + deck (V2.2) | 2.5 s | 1 / 7 / 17 | 3 | 0 |

- **No change between versions:** the numbers are identical on V2 (`bac201a`), V2.1 (`b7a6fe1`) and V2.2 for the same loadouts. Nothing in this pass touched the right-side geometry.
- **Finding:** (a) a finite emergent bumper synergy.
  - Bursts reach 20–30 hits, but no visit lasted more than 2.5 s.
  - There were no stalls and no near-permanent traps.
  - The ball always escapes, usually up toward the right bumper or down the right side.
- **The tightest case** is the twin pair. Its gap is 0.8 for a 0.64 ball, so the ball can rattle a-b-a-b for about 1.7 s (up to 29 hits). That's alignment-driven but brief.
- **Per the brief, I left it alone.** If it ever feels cheap, the smallest fix is geometric: widen the twin gap by about 0.2. No point, cap or kick changes are recommended.

## Tests
- `tests/upper-deck-v22.test.ts` (13 tests):
  - Diamond geometry and clearances.
  - Both slings exist, are touched, kick inward and up, and score.
  - Per-group debounce: two slings hit at the same instant both count.
  - Mounts fit.
  - 3,000 once, through ×3.
  - Rollback gives nothing.
  - 200 × 2 × 3 = 1,200 (and 600 without Rally).
  - THIS/ALL stacking, deck slings and bought deck bumpers.
  - Crossing, hysteresis, no re-arm, re-arm on a new completion.
  - No Rally downstairs.
  - Multiball independence.
  - Drain ends Rally.
  - Reconciliation.
- Analytics test: Home Run, normal deck and Rally gain are split and reconcile; the report section renders.
- Updated:
  - The V2.1 Home Run spread test now checks the four bumpers plus both slings are reached, with no single first contact above 85%.
  - The deck return test allows up to 40 s per drop; the measured max is about 16 s.

## Captures (`docs/screenshots/v2_2/`, 390×844 @2×)
- `deck_rally_{classic,toxic}.png`: 2-ball multiball with one Rally ball, global ×3.
  - Panel 1: the arrival headline.
  - Panel 3: a lit deck sling plus a doubled bumper hit (+600).
- `deck_rally.gif`: the same sequence in motion.
- `rally_{classic,toxic}.png`: a single-ball ride.
- No page errors, no scroll; the camera only zooms out.

## Open questions for playtest
1. Deck-build pace roughly doubled on the bot (3,000 per ride plus ×2). It may be the intended "wild" moment. If innings 2–3 trivialize, the levers in order are: deck geometry (fewer chains), then the HR mouth window, and only then the approved numbers.
2. Long lucky visits up to about 20 s (38 s with bought deck bumpers) are possible. They're finite, but the camera stays zoomed out the whole time.
3. Twin flank-r rattle: leave it, or widen the gap by 0.2?
