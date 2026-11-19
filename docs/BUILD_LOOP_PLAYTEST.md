# Build loop playtest (`/build-test/`)

The first roguelite slice runs at `/build-test/`. It starts on the factory table with a score target and three strikes. Each clear gives a free pick of one upgrade out of three, then a paid shop, then the next challenge on the upgraded machine. The four comparison routes (`/`, `/1`, `/2`, `/3`) are unchanged.

**Every number in this document is an experimental test value.** Targets, prices, costs, starting Power and money are knobs in `src/run/economy.ts` and `src/run/catalog.ts`, not design decisions.

## What the player sees

1. **Start:** factory table, "TARGET 1,500". The center screen shows SCORE / TARGET with a progress bar. The strip shows challenge · money · Power (`C1 · $0 · ⚡0/5`).
2. **Play:** same batting, physics, slingshots and controls as `/`. A drain banks points. Only the last live ball's drain is a strike.
3. **Clear:** the moment the score reaches the target, play stops cleanly (no drain, no strike) and pays money.
4. **Free pick:** choose 1 of 3. Tapping a card shrinks the panel to that card and lights up where it goes on the board. Machines with two possible spots show spot chips.
5. **Shop:** buy as many as money, Power and free spots allow. Reroll costs $1 and rises by $1 per reroll. New machines appear on the board immediately.
6. **Next challenge** on the same machine, with a higher target. Three strikes short of the target fails and offers a restart.

Captures in `docs/screenshots/build-test/`, phone viewport 390×844:

- factory board
- clear
- free pick
- placement preview
- shop
- buy and install
- the installed bridge paying out in challenge 2

## Playtest changes (Nov 19)

- **Front pegs removed on `/build-test/` only.** The player found the two posts just above the batter (y 19.9) deflect the ball too late to react. Bot data: they appear in 11% of strike sequences, and removing them doesn't change bot survival (67 s vs 64 s per ball), because the bot predicts bounces perfectly and humans can't. `/` keeps them as the frozen comparison; `/1`–`/3` are unchanged.
- **Mechanism progress carries over strikes on every table.** Multiball charge and target-bank lamps reset only at the start of a new game or challenge, not on each pitch. If a strike lands during the 0.35 s hatch-opening window, the splitter stays one hit from launching.

## Provisional economy

| Knob | Test value |
| --- | --- |
| Starting Power | 5 (experimental; the future +1 at innings 2/4/6/8 is documented only) |
| Targets | 1,500 → 4,000 → 8,000, then ×1.6 per challenge |
| Money on clear | $8 + $2 per unused strike |
| Draft | 3 offers, 1 free; machines only appear if they can be installed right now |
| Shop | 4 offers, no purchase cap; reroll $1, +$1 per reroll |
| Machine share of rolls | 45% (when a machine is possible) |

**Machines** (power / price): Bonus Bumper 1 / $6 · Lane Spinner 1 / $5 · Target Bank 1 / $5 · Jackpot Lane Gate 1 / $5 · Turbo Ramp 2 / $9 · Glove Scoop 2 / $8 · Overpass Bridge 3 / $10 · Multiball Splitter 3 / $12.

**Modifiers** (no Power, no stack cap, `points = (base + Σadd) × Πmul`):

- Factory parts: Hot Corner +100 to one bumper ($3), Power Alley ×1.5 to one bumper ($4), Rally Cap ×1.25 to every bumper ($6), Big Stage ×2 jackpot ($4), Sharp Eye +50 to every standup target ($3), Live Rubber +40 slingshots ($2), Rollover +100 lanes ($2).
- Installed machines only: Nitro ×1.5 ramp finish, Toll Booth +500 ramp gate, Gold Glove ×2 catch, Spin Doctor ×2 spinner, Full Count ×2 bank, Gatekeeper +300 gate, Double Play +150 splitter hits.

A modifier is only offered when its target exists, and the card names the exact part.

**Not built, as instructed:** no Power for sale, no selling or refunds, no removing machines, no rarity or odds system, no global multiplier. The Multiplier screen stays x1.

## Mount spots (factory table, nothing moved)

| Spot | Fits | Conflicts with |
| --- | --- | --- |
| Upper-left pocket (8.45, 6.2) | Bonus Bumper | — |
| Upper-right pocket (11.55, 6.2) | Bonus Bumper | — |
| Left lane / Right lane | Lane Spinner | — |
| Left / Right target bank | Target Bank (uses factory targets) | — |
| Jackpot lane | Jackpot Lane Gate (bullseyes are its edges) | — |
| Left orbit | Turbo Ramp (exits into the upper bumpers) | — |
| Center bridge | Overpass Bridge | Right-center |
| Right-center | Multiball Splitter | Center bridge |
| Right pocket (16.9, 14.2) | Glove Scoop (relaunches into the right bumpers) | — |

- **Taken or blocked spots:** they're refused with a reason ("blocked by Overpass Bridge"). Nothing installed is ever removed, moved, or loses its modifiers.
- **Physical checks:** a test installs every machine on every spot (each side of the one conflict) and checks that no colliders overlap. It also checks that every ramp exit, drop landing and launch hatch lands on open floor, with no traps or tunneling under random play.
- **Bridge change:** on `/2` the Overpass bridge drops toward the catching glove. On the factory table that spot is a solid bumper, which knocked the ball into the drain, so the build-test bridge drops mid-field instead. A test checks that most bridge runs come back to the bat.
- **Not offered:** the Sidewinder ramp, because it needs the mid-right factory bumper removed, and physical replacement is deferred.

## Measured (bot, `npm run bot:run -- <runs> <timingErrorMs> <seed> <maxChallenge>`)

The bot tracks the ball and swings with Gaussian timing error. It takes a machine in the draft when one is offered, buys machines first, then modifiers, and rerolls once if nothing is affordable. It never aims for a mechanism. 60 runs per row.

| Challenge | Target | Clear rate, 70 ms | Time to clear, 70 ms | Clear rate, 110 ms | Time to clear, 110 ms |
| --- | --- | --- | --- | --- | --- |
| 1 | 1,500 | 93% | 25 s | 77% | 29 s |
| 2 | 4,000 | 84% | 47 s | 46% | 52 s |
| 3 | 8,000 | 55% | 66 s | 43% | 69 s |
| 4 | 12,800 | 54% | 90 s | 11% | 81 s |
| 5 | 20,500 | 29% | 88 s | — | — |

- **The build keeps up with the targets.** With sharp timing, clear rates hold around 50–55% through challenge 4 even as targets grow 1.6× each step.
- **Typical endgames:** runs reaching challenge 5 had 3 machines and 11–13 stacked modifiers. For example: Overpass Bridge + Target Bank + Bonus Bumper; Glove Scoop + Turbo Ramp + Jackpot Gate.
- **Power and money:** average Power used at run end was 4.5 / 5 (sharp) and 3.1 / 5 (sloppy). Power binds at about 3 machines, which is the decision space we wanted.
- **Physics:** first-pitch hit windows, slingshots and controls are untouched. The original table's bot numbers are identical before and after (44.4 s survival, 2,703 per ball, 70 ms).

## Tests

**68 tests pass** (52 before this work, plus 1 baseline regression and 15 build-loop tests).

- **Baseline regression:** `tests/baseline-regression.test.ts` replays 270 s of scripted batting on `/` and compares hits, score, sim time and 54 ball positions to the committed golden run. It matches the pre-map-work build: 25,320 points, 90 hits. This was committed before any loop code.
- **Build loop:** route, clear fires once and immediately, three-strike fail with banking, multiball last-ball strike on a built machine, draft 3/1-free, shop spending, no purchase cap, unaffordable items rejected, Power blocking, conflicts never displacing anything, uncapped modifiers that persist, per-challenge reset with persistent build, no impossible offers, every mount combination physically valid, no traps or soft-locks, glove relaunch, bridge return to the bat.
- **Routes:** `dist/build-test/index.html` is generated like `/1`–`/3`. Locally behind a Pages-style server, `/build-test` redirects to `/build-test/`, then loads and survives reload.

## Device limitations

- **Phone viewport only:** all checks ran in headless Chrome at 390×844 with emulated touch. The loop hasn't been played on a real phone yet.
- **Panel scrolling:** on narrow phones the draft and shop panel can scroll internally. The page itself never scrolls (`scrollY` stays 0).

## Early read on the questions asked

- **Satisfying without machine management?** In the captures, a decision is two taps, plus one spot chip at most. The board preview answers "where does it go" without a separate screen. Real-player confirmation needed.
- **Does the starter become an exciting build?** In bot runs, yes by challenge 3–5: 3 machines plus a dozen modifiers produce the ramp → gate → bumper chains seen on `/3`, on a table the player assembled.
- **Is batting still central?** Yes. Every machine still needs bat shots to feed it, and timing error is the biggest driver of clear rate (93% vs 77% at challenge 1).

## Unresolved design decisions

- **Starting Power:** 5 binds at about 3 machines. Is that the right early tension?
- **Costs and prices:** the multiball splitter (3 power / $12) and bridge (3 / $10) compete for the same Power as three 1-cost parts. Needs real-player preference data.
- **Targets and growth:** 1.6× growth gives roughly 50% clear rates mid-run for a skilled bot. Final values belong to the challenge/inning design.
- **Money formula:** whether unused strikes should pay more, and whether score overflow should pay at all (the challenge stops at the target, so there's no overflow now).
- **Selling, refunds, replacing machines:** not built. Needed if players can lock themselves out of a spot (e.g. the bridge blocks the splitter).
- **Factory hardware:** modifiers can target factory bumpers. Physically replacing them (e.g. Sidewinder's mouth needing the mid-right bumper gone) is deferred.
- **Catalog shape:** 8 machines and 14 modifiers. No rarity or weighting beyond a flat 45% machine share.
- **Multiplier screen:** still x1; needs a designed global multiplier, or should be repurposed.
