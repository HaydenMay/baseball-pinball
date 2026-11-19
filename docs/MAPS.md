# Endgame machine tests: Sidewinder, Overpass, Turbo

One game, four URL paths. Physics, batter, swing, slingshots, Ready pitch, three strikes, scoreboard and art are shared. Only the installed machinery differs.

| Path | Map | Loadout | Power |
|---|---|---|---|
| `/` | Baseline | original table, untouched | 0 / 8 |
| `/1` | Sidewinder | loop ramp (top gate, center drop) · right precision gate · left-lane spinner · BATTER UP + ALL-STAR banks · upper bonus bumper | 8 / 16 |
| `/2` | Overpass | aimable bridge ramp (bridge gate, drop toward the glove) · glove scoop → upper cluster · upper bonus bumper · jackpot-lane gate · right-lane spinner · BATTER UP bank | 9 / 16 |
| `/3` | Turbo | Turbo ramp (gate, release into the cluster) · multiball splitter · twin upper bonus bumpers · jackpot-lane gate · both lane spinners · both banks · heaviest stacked mods | 12 / 16 |

**Every score, kick, timing and power value is a deliberately exaggerated placeholder.**

## What changed from the previous version

- **Every ramp has a scoring gate** midway along the raised route.
  - It sits after the climb, so a shot that rolls back never reaches it.
  - It pays once per pass, and again on a new pass.
  - On a pass, the arch's lamp bar blazes, a stitched ring and sparks burst at the gate, a small number pops beside the ramp (facing the table center, never on the ball), the scoreboard pulses, and it has its own rising chime.
- **Drop exits.** The Sidewinder and Overpass ramps now end in a short open drop.
  - The same ball leaves the raised level at full height, falls for about a quarter second (no collisions while airborne), lands with a ring and thud, then is ordinary physics again.
  - It's not a new ball, a respawn, or a strike reset.
- **Sidewinder:**
  - The ramp loops right wall → over the top (gate at top center) → down the left → curls inward and drops just left of the mound.
  - The ball lands mid-field and rolls down into the batter's reach. A test checks every exit speed.
  - Its old exit ended in the left lane, where the ball was hard to hit.
- **Overpass:**
  - The mouth moved down and angled toward the batter, so a late swing from the starting spot goes in.
  - The bridge drop falls toward the glove. Whether the glove catches it depends on how hard the ramp was hit (about 70% of completed runs).
  - The glove pays a catch bonus (Gold Glove ×2) and relaunches into the upper bumper cluster. A 2.5 s re-catch lockout stops endless glove loops.
- **Turbo:** the same pattern as before (the ramp feeds the upper cluster), now the densest build:
  - multiball splitter (3 hits to arm, max 3 balls)
  - twin bonus bumpers
  - a jackpot-lane gate (the bullseye pair is its edges)
  - two lane spinners
  - two target banks
  - stacked modifiers, e.g. bumpers (base + 50) × 2 × 1.5, jackpot × 3, banks × 2, spinners × 2
- **New reusable parts:**
  - **spinner:** spins scale with ball speed; one award per crossing
  - **target bank:** completing it pays a bonus, then resets; progress carries over strikes and resets on a new game; lamps on each target
  - **gate without posts**
  - **modifier tables:** `(base + Σadd) × Πmul`, no stack cap
- **Sound:** synthesized WebAudio for bat, bumpers, targets, gates, spinner, ramp in/out/land, glove catch/eject, banks, multiball and drain.
  - Each sound is rate-limited and voices are capped.
  - There's a mute button (also the M key), and the setting is remembered.

## Is `/` still the original?

Yes. All earlier tests pass unchanged, and the baseline preset has no mechanisms or modifiers. The deterministic 270 s replay from the last round still matches the old build. The bot's baseline numbers below match the previous report exactly.

## Measured (bot, 300 balls per row, seed 11)

The bot tracks the ball at keyboard speed and swings with Gaussian timing error. It does not aim for mechanisms. "No-bat" columns measure the longest time the machine kept a ball alive, and the most points it scored, with no bat contact. That's the check for self-sustaining loops.

| Map | Timing error | Survival / ball | Bat hits / ball | Score / ball | Ramp enter / clear | Glove catches | Multiball | Longest no-bat stretch | Most points without bat | Drains L/C/R |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 70 ms | 44.4 s | 13.9 | 2,703 | – | – | – | 17.5 s | 1,875 | 65/174/61 |
| sidewinder | 70 ms | 47.8 s | 15.3 | 6,327 | 0.69 / 0.46 | – | – | 23.0 s | 4,975 | 51/152/97 |
| overpass | 70 ms | 42.6 s | 13.0 | 7,892 | 0.45 / 0.45 | 0.80 | – | 15.3 s | 6,750 | 113/154/33 |
| turbo | 70 ms | 56.0 s | 23.0 | 28,359 | 0.45 / 0.45 | – | 1.21 | 16.2 s | 20,700 | 62/165/72 |
| baseline | 110 ms | 21.9 s | 6.3 | 1,210 | – | – | – | 16.1 s | 2,400 | 57/192/51 |
| sidewinder | 110 ms | 24.2 s | 6.8 | 2,651 | 0.30 / 0.20 | – | – | 17.4 s | 6,750 | 48/167/85 |
| overpass | 110 ms | 23.0 s | 6.3 | 3,447 | 0.19 / 0.19 | 0.36 | – | 23.3 s | 6,600 | 97/157/46 |
| turbo | 110 ms | 24.0 s | 8.2 | 9,736 | 0.20 / 0.20 | – | 0.37 | 19.4 s | 15,750 | 62/170/68 |

**Skill shots exist on every map.** A search over batter offset and swing timing on the straight pitch found direct hits into each ramp: 13 swing combos for Sidewinder, 17 for Overpass, 17 for Turbo. Replayed in the browser (phone viewport, real key events), each produced its full chain. Frames are in `docs/screenshots/chains/`.

- **Sidewinder:** bat → enter → top gate (+750) → complete (+1,000) → drop near the mound → rolls back to the batter.
- **Overpass:** bat → bridge gate (+750) → complete → drop → glove catch (+2,000) → relaunch → top bumper → **jackpot** → bonus bumper → cluster.
- **Turbo:** bat → gate (+600) → complete (+1,500) → into the twin bonus bumpers → 8+ bumper hits. That's 9,760 points off one swing.

## Issues found and fixed during testing

- **Sidewinder's first bonus bumper was a drain machine.** It sat low on the right, and about 1 in 4 strikes ran through it. Moving it to the upper cluster raised survival from 27 s to 48 s.
- **The Overpass drop never fed the glove.** It hit the rim every time, and the exit speed was clamped to a constant, so every run was identical. Now ride speed carries into the drop: harder ramp shots fall into the glove, softer ones miss.
- **The glove relaunch clipped its own lip.** It ejected too close to the opening's edge, so I re-aimed it about 11° right.
- **Gate numbers drew over the JACKPOT banner.** They now always appear on the side facing the table center.
- **Keyboard Ready, for the record:** Enter starts the game on first load (fixed in the earlier round). Scripted demos must anchor to the Ready time.

## Remaining issues and risks

- **No real phone has been tested yet.** Biggest unknowns: three balls plus Turbo's effects on a small screen, and sound levels on a phone speaker.
- **Turbo scores about 10x baseline per ball.** That's the intended "late-run fantasy," and it's where pricing multiball and modifiers will matter most.
- **Sidewinder sees more right-side drains** (the mid-right bumper is gone to make room for the ramp mouth). It's acceptable, but noticeable.
- **Overpass sees more left-side drains:** missed glove follow-ups fall down the left. The glove is a reward, not a safety net, which is by design.
- **Spinners and banks are mostly found by ricochet.** They make the board busy and rewarding but aren't strong aim targets yet.

## Which feels most like a believable late-run machine?

**Turbo.** One good swing produces a readable chain: ramp → gate → cluster, possibly into multiball. Survival goes up without the batter becoming irrelevant (the longest no-bat stretch matches baseline's). The stacked modifiers make the score feel like a built-up run. **Overpass** has the most satisfying *designed* combo (bridge → glove → upper cluster → jackpot) and is the best showcase for a "glove" upgrade. **Sidewinder** is the most cinematic ride and now returns the ball to the bat properly, but it pays mainly through its own ramp.

## Power capacity (data only)

- **Test values:** `MAX_POWER_ENDGAME = 16` is a test value that fits every loadout. The baseline keeps 8.
- **Placeholder costs:** long ramp 3, multiball 3, compact ramp 2, scoop 2, and 1 each for gate, spinner, bank and bonus bumper.
- **Modifiers cost nothing** (there's no modifier system yet). They live in each preset's `modifiers` table.
- **Future rules:** recorded in `FUTURE_POWER_RULES` with `implemented: false`, not built:
  - +1 max Power at innings 2/4/6/8, free and permanent
  - a brief celebratory pulse with no lasting glow
  - no modifier caps
  - no purchasable generators
