# Three machinery layout experiments

The same game is served at four paths. Physics, batter, swing rules, score and strike rules, scoreboard and art are all shared. Only the machine configuration differs between paths.

| Path | Map | What's added on top of the base table | Power |
|---|---|---|---|
| `/` | Baseline | nothing (unchanged) | 0 / 8 |
| `/1` | Sidewinder | long wall-hugging ramp (right side → over the top → left lane) + precision gate | 4 / 8 |
| `/2` | Overpass | mid-field crossing ramp + glove scoop | 5 / 8 |
| `/3` | Powerhouse | compact ramp into the bumper cluster + multiball splitter + bonus bumper | 6 / 8 |

All scores, kick strengths, timings and power numbers are **unbalanced placeholder test values**.

## Is `/` unchanged?

Yes. A scripted player that tracks and hits the ball ran 270 s on `/` with the code from before this change and with the code after it. Both runs ended with identical results: 90 bat hits, 25,320 points, and the same ball position at every sample. All 24 original tests still pass without edits.

## How it's built

- **Routes.** `vite.config.ts` writes `dist/1/index.html`, `dist/2/index.html` and `dist/3/index.html`. Each is a copy of the main page with asset paths pointing one folder up, so GitHub Pages serves each path directly, and a reload works. `/1` is redirected to `/1/` by Pages itself. `presetForPath()` reads the last path segment, and anything unrecognized falls back to the baseline. There's no SPA fallback, no query string, and no change to the site's base path.
- **Mechanisms are data.** `src/machines/mechanisms.ts` defines five types: `ramp`, `scoop`, `splitter`, `gate` and bonus `bumper`. Each has an id, a `powerCost`, geometry and tuning. `src/machines/presets.ts` lists the four presets. `layoutFor(preset)` starts from the base table, removes any parts the preset displaces, and adds its mechanisms. The physics (`sim.ts`) and the art (`view/machines.ts`) handle every instance of a type the same way, so a new map only needs new data.
- **Displaced base parts.** Two maps remove one base part each to make room. Sidewinder removes the mid-right bumper, which sat where the ramp mouth is. Overpass replaces the glove bumper with the glove scoop in the same spot. Powerhouse removes nothing.
- **Ball modes.** Each ball is in one of three modes: `field` (a normal physics body), `ramp` (body switched off, position driven along the ramp path), or `held` (in the scoop). Every ball in any mode counts as live.
- **Ramps.** There's no rigid 3D geometry. A floor ball that crosses the mouth line while moving into it starts a ride. The ride decelerates up the climb and holds speed over the top. It releases at the exit with clamped speed along the path direction. A shot too weak to clear the climb rolls back out of the mouth. The ball is drawn larger with a shadow that falls further away the higher it is. The ramp is a see-through glass channel drawn above floor balls, so a ball passing underneath stays visible.
- **Scoop.** It catches the ball once the ball reaches the bottom of the cup, holds it for 0.85 s on a fixed timer, then fires it out through the opening. It holds one ball at a time. The fixed timer is the anti-soft-lock guarantee.
- **Multiball.** The splitter is a standup target facing the batter. Three real hits during a live ball arm it. The hatch opens and fires one extra ball. There's a maximum of 3 balls and a 5 s cooldown. Ready always serves exactly one ball. Extra-ball drains are free, and only the last live ball's drain is a strike.

## Power capacity (data only, no UI)

`MAX_POWER_TEST = 8`. That's enough for the densest map with room to spare, and deliberately not "6 slots." The illustrative costs are: long ramp 3, multiball 3, compact ramp 2, scoop 2, gate 1, bonus bumper 1. `validatePreset()` checks `sum(powerCost) <= maxPower`, and a test enforces it. The values are logged to the console on load and shown read-only on the Ready/Pause card. There's no shop and no machine manager.

The future-only rules are recorded in `FUTURE_POWER_RULES` with `implemented: false`:

- +1 max Power at innings 2/4/6/8
- a brief pulse when power expands (no permanent glow)
- no modifier slot caps
- no purchasable expansions in V1

## Measured playtest (bot, 300 balls per row, seed 11)

The bot tracks the ball at keyboard speed and swings with Gaussian timing error. It does **not** aim for mechanisms, so hits on them come from its normal play. Humans who aim will hit them more.

| Map | Timing error | Survival / ball | Bat hits / ball | Score / ball | Ramp enter / clear / roll back | Scoop | Multiball | Gate | Jackpot | Drains L/C/R |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 70 ms | 44.4 s | 13.9 | 2,703 | – | – | – | – | 0.98 | 65/174/61 |
| sidewinder | 70 ms | 44.9 s | 14.4 | 2,218 | 0.51 / 0.36 / 0.15 | – | – | 0.30 | 0.95 | 63/171/66 |
| overpass | 70 ms | 48.1 s | 15.7 | 2,491 | 0.43 / 0.42 / 0.01 | 0.62 | – | – | 0.97 | 65/188/46 |
| powerhouse | 70 ms | 60.8 s | 24.0 | 5,549 | 0.49 / 0.48 / 0.01 | – | 1.36 | – | 0.92 | 71/159/65 |
| baseline | 110 ms | 21.9 s | 6.3 | 1,210 | – | – | – | – | 0.41 | 57/192/51 |
| sidewinder | 110 ms | 22.9 s | 6.8 | 1,024 | 0.26 / 0.16 / 0.10 | – | – | 0.16 | 0.36 | 54/186/60 |
| overpass | 110 ms | 23.2 s | 6.8 | 1,027 | 0.14 / 0.14 / 0.00 | 0.23 | – | – | 0.39 | 55/208/37 |
| powerhouse | 110 ms | 23.9 s | 7.4 | 1,742 | 0.17 / 0.17 / 0.00 | – | 0.32 | – | 0.24 | 58/175/67 |

Browser playthroughs used real keyboard events in headless Chrome at a 390×844 phone viewport. Every mechanism fired:

- the ball rode the Sidewinder and Overpass ramps
- the scoop caught and ejected
- Powerhouse reached 3 balls
- there were no page errors
- frames averaged about 16.7 ms (p95 16.8 ms)

Screenshots are in `docs/screenshots/maps/`.

## Visual self-review (phone viewport)

- **Batter lane and slingshots:** identical on every map. Nothing new goes below the mound row's height near the lane.
- **Sidewinder:** the right leg of the ramp runs just inside the star targets and the top leg passes between the jackpot and the upper bumpers. Both stay readable through the glass. The right wall now carries the most visual detail on any map. The gate is small but labeled.
- **Overpass:** the crossing reads clearly as a bridge. The ball under it stays visible. The ramp exit drops toward the glove, which gives a ramp → scoop → diagonal relaunch combo you can follow by eye.
- **Powerhouse:**
  - The upper-left area is the busiest: compact ramp exit, bonus bumper and two base bumpers.
  - With 3 balls plus bumper VFX it's still readable at phone size, but it's the closest to "too much."
  - The splitter target and hatch are small. The MULTIBALL flicker and hatch pulse do the explaining.
- **Not verified yet:** none of this has been played on a real phone. Thumb feel with 2 to 3 balls is the biggest open question.

## Where each map is weak

- **Sidewinder:**
  - The mouth needs a deliberate rightward shot from the right half of the lane.
  - About 30% of entries roll back (they hit the mouth too slowly), which is intended, but it can feel bad if it happens often.
  - Losing the mid-right bumper lowers score per ball versus baseline.
- **Overpass:** the scoop holds for 0.85 s. Mostly that's a welcome breather, but with a 0.62/ball catch rate it could drift toward passive play if the scoop gets stronger.
- **Powerhouse:**
  - Survival and score jump. That's mostly multiball padding, because extra balls give free hits.
  - Score per ball is about 2x baseline, the clearest sign of snowballing.
  - If the splitter is too easy (3 hits, 5 s cooldown), it becomes the dominant target.

## Recommendation

**Overpass is the best chassis for the roguelite, with Powerhouse's splitter as the first "big" upgrade.**

- **Overpass:**
  - Its two mechanisms chain into a readable combo (ramp → glove → relaunch).
  - It barely changes survival, so it doesn't fight the batting game.
  - Its crossing route leaves the side walls free for future installs.
- **Sidewinder's long ramp:** a great showpiece, but it eats a whole wall and a base bumper. Better as a later, expensive install than a default.
- **Powerhouse:** proves multiball and density work, and shows that score scales fast once balls multiply. That's useful evidence for pricing multiball high (it's 3 power here).

Stop point: review these before building any upgrade, shop or progression systems.
