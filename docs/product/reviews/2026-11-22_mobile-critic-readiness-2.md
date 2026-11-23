# Moonshot Pinball: Production Readiness Re-Review (Mobile)

**Build:** v1.0.0 (83701c3), route `/baseball-pinball/build-test/`. **Reviewed:** 22 Nov 2026. Independent critic, no stake in the game. I read the previous report (Polish 3.3 / Simplicity 2.9 / VFX & Sounds 2.3 / Overall 2.9) for the change log only and scored this build fresh.

## Scorecard

| Category | Score | Previous | Delta |
|---|---|---|---|
| Polish | **3.8 / 5.0** | 3.3 | +0.5 |
| Simplicity | **3.4 / 5.0** | 2.9 | +0.5 |
| VFX & Sounds | **3.2 / 5.0** | 2.3 | +0.9 |
| **Overall production readiness** | **3.5 / 5.0** | 2.9 | +0.6 |

**Biggest remaining blocker:** the difficulty curve. It isn't flat any more, but it's lopsided:

- The run turns on whether you draft one of the 8,000-base ramps early.
- Once you have one, nothing pushes back, including the five new Closers.
- A skilled bot won its first 17-minute run 15/15 and cleared the final Closer in one pitch.
- Without a big ramp, a casual player can die at C2 inside a minute.

## How I tested

**Setup**

- Playwright with Chrome at 390×844, @2x, touch, mobile, starting from a fresh profile.
- Layout also checked at 390×664, 375×667, 360×640, 430×932 and 844×390.
- 60 fps CDP screencast for the big moments (`/tmp/critic2/moments/`, `/tmp/critic2/closers/`, contact sheets `sheet_*.jpg`).
- Still screenshots in `/tmp/critic2/shots/` and `/tmp/critic2/run_A/`.

**The bot**

- It reads ball state after a reaction delay, predicts where the ball will land, and moves and swings with A/D and Space.
- It adds noise to its timing and its positioning.
- I verified real touch separately via CDP:
  - The swing buffer works: four taps at 0/360/460/610 ms gave two swings, the 460 ms tap buffered to +583 ms.
  - A 90 px left-thumb drag moves the batter 5.9 units.
  - `visibilitychange` auto-pauses a live pitch.

**What I played and what I skipped**

| Session | Played | Skipped | Length |
|---|---|---|---|
| Run A (precise bot) | Title → C1 → C15 → RUN COMPLETE in one continuous run, with every draft and shop. All five Closers were played for real here. | Nothing | 17:24 |
| 14 skill-profile runs | Each from C1, capped at 4–5 min | Nothing | About 38 min in total |
| Moments session | C1 (sloppy; died), then a new run: C2 played, C4 played, C5 with the bot off to get a game over | C3, skipped between pitches | About 2.3 min |
| Closers session | Each Closer played until cleared: C3 28 s, C6 60 s, C9 27 s, C12 97 s, C15 45 s | Every non-Closer challenge, at its intro card | About 6 min |

- Total live play: about 64 minutes.
- Zero console errors or page errors.
- Frame pacing on the Upper Deck: 16.7 ms mean, p99 16.8 ms, 0.3% of frames over 25 ms.

**Sound:** I can't hear it, so sound is a source audit of `audio.ts`, `sound-set.ts`, `juice.ts`, `machines.ts`, `game.ts`, `main.ts` and the `SimEvent` types in `sim.ts`. I also confirmed that all 13 samples return 200 and load on the player route, and measured their levels with ffmpeg (Appendix A).

**Caveats**

- Bots read trajectories perfectly within their reaction delay and never learn.
- My drafting heuristic favours machines and ramps, which inflates ramp share and the number of "big ramp at C1" runs.
- Treat the skill tiers as relative.

---

## 1. Polish: 3.8 / 5.0

**What changed and works**

- **Screen fit is fixed.**
  - 390×664, 375×667 and 360×640 now fit exactly, with nothing clipped (`shots/L_safari_live.png`, `L_small_title.png`).
  - Landscape shows a clean "TURN YOUR PHONE" screen and pauses the game (`L_land_title.png`).
- **Phone interruptions are handled.**
  - Hiding the page pauses a live pitch (`shots/ctl_paused.png`).
  - A swing tapped within 120 ms of the bat being ready is queued instead of dropped.
- **Results screens exist.** Run total, 15 pips, cleared, best pitch, home runs, sweet spots, peak multiplier, device best and a NEW BEST tag, plus NEW RUN and MAIN MENU (`run_A/end_RUN_COMPLETE.png`). The status strip now reads RUN COMPLETE / GAME OVER.
- **The previous data glitches are gone.** The C3 clear card and the HUD agree (4,780 / 4,500), and the controls hint no longer appears on clear, fail or pause cards.
- **Milestones get a beat before the card.**
  - CLEARED holds for about 950 ms, STRIKE for 700 ms and STRIKE THREE for 900 ms (`moments/sheet_clear.jpg`, `sheet_strike1.jpg`, `sheet_gameover.jpg`).
  - The drain-to-card cut is gone.
- **Table text is readable.** Popups are at least 14 CSS px, ride tallies at least 15 px, and banners are fixed 30/44 px DOM text that stays readable after the Upper Deck zoom-out.
- **Coach tips no longer cover the playfield.** They moved onto the between-pitch cards (`run_A/c01_card_CHALLENGE_CLEARED.png`).
- **It's stable.** Zero errors and a locked 60 fps.

**What's not**

1. **Closer rule text is cut off on the reference phone.**
   - The status strip is the only place a Closer's live state is shown, and at 390 px wide it ellipsizes: "SMALL BALL · SWEET…" and "CALLED: DECK BUMP…" (`closers/c06_live_017.png`, `sheet_calledmiss.jpg`).
   - "C6 · $1 · ⚡7/7" wraps onto two lines.
   - At 390×664 even "PITCH 1 · LI…" is cut (`shots/L_safari_live.png`).
2. **Small Ball's LOCKED badge never shows.**
   - The CSS `#multwrap.locked::after` is present (computed `content: "LOCKED"`), but it paints under the `.mult` screen (`shots/locked_test.png`, `closers/crop_locked.png`).
   - The only telegraph left is a slight desaturation.
3. **The Small Ball sweet-spot banner shows the wrong number.**
   - `main.ts:78` builds the banner from `PLAY.sweetSpot.points × mult`, ignoring the Closer's ×3, so it shows "SWEET SPOT! +250" while 750 is awarded (`closers/crop_smallball_sweet.png`).
   - The same formula ignores Hot Corner's ×0.8 on bat points.
   - That's the one advertised upside of the rule, and it's mislabelled.
4. **Stale HUD and overlaps around clears.**
   - In the C4 shop the HUD reads "0 / 8,000" and "PRESS READY" while the button says "NEXT: TARGET 15,700" (`run_A/c04_shop.png`).
   - The CLEARED! banner still overlaps the card's kicker for about 100 ms when the card arrives (`moments/sheet_clear.jpg`, +980 ms).
5. **Table labels collide with ramp rails.**
   - The "HOME RUN" plate is crossed by the Long Loop rail.
   - The "CALLED" tag is cut by the Turbo ramp (`run_A/ev_called_call_1.png`, `c04_shop.png`).
6. **Copy is out of date.**
   - Credits say "SOUND: Synthesized in the game", but 13 recorded samples now ship, and `sound-set.ts` says they were rendered from public-domain recordings. The credits should name sources and licences.
   - How to Play doesn't mention Closers, sweet spots, the foul ball or the whiff penalty.
   - A shop boost called **"Hot Corner"** (+100 on an Upper Deck bumper) has the same name as the C3 Closer.
   - Card copy still includes "Map 1 loop ramp…".
7. **Quitting mid-pitch still loses the pitch.** The pause card still says "Continue restarts this pitch", and late pitches run 60–140 s.
8. **Leftover rough edges.**
   - The title strip says "PRESS READY".
   - The title attract chase is effectively invisible: 0.015% of pixels changed by more than 30/255 over 0.7 s, because the title card covers the table.
   - The shipping URL and manifest still say `/build-test/`.
   - The desktop sidebar badge says "EARLY ACCESS PLAYTEST".
   - There's no vibration option.

**Fixes (ranked by impact per effort)**

1. **Fix the three Closer presentation bugs (very low effort).**
   - Problem: the LOCKED badge is hidden, the sweet-spot banner understates Small Ball, and the bat-point banner ignores Hot Corner.
   - Change:
     - Render LOCKED as a real element inside `.mult`, or give the `::after` `z-index: 3`.
     - Put the awarded sweet points on the `bat` event (`e.sweetPts`, after the Closer factor and the multiplier) and use that for the banner.
   - Impact: the rule players are fighting is shown correctly.
2. **Give Closer status its own full-width plate (low effort).**
   - Problem: the strip truncates the live Closer state at 390 px.
   - Change:
     - Under the scoreboard, during a Closer, show a 22 px pill spanning the cabinet, e.g. "×3 SLINGS · 11s", "CALLED: DECK BUMPER", "SMALL BALL · SWEET SPOT ×3", "ON BASE 3,240".
     - Shorten the left chip to "C6" and move $ and ⚡ to the between-pitch card.
     - Test at 360 px.
   - Impact: Closer rules become readable at a glance on every phone.
3. **Copy and data pass (very low effort).**
   - Update Credits with the sample sources and licences.
   - Add Closers, sweet spot, foul and whiff to How to Play.
   - Rename the boost "Hot Corner" (e.g. "Hot Seat").
   - Drop "Map 1" from card copy.
   - Show the next target in the HUD during the draft and shop.
   - Hide the moment banner when a card opens.
   - Offset the HOME RUN and CALLED plates off the ramp rails.
   - Impact: removes everything a reviewer would screenshot as unfinished.
4. **Save mid-pitch (medium effort).**
   - Change: on pause or `pagehide`, bank the pitch's points so far and save. On Continue, resume with a fresh pitch at the same score.
   - Impact: a quit costs nothing, which matters with 1–2 minute pitches.
5. **Release hygiene (low effort).**
   - Change: serve the game from a release URL with `start_url` updated, remove the playtest badge, and add a haptics toggle (`navigator.vibrate(8)` on contact, 25 ms on big moments; Android only).
   - Impact: it looks and installs like a shipped product.

---

## 2. Simplicity: 3.4 / 5.0

**What changed and works**

- **Button-mashing no longer pays.**
  - A whiff now costs an extra 0.25 s, so the full cycle is 0.58 s. A tap every 0.36 s then lands only every other tap, which gives a masher roughly 28% swing duty.
  - The three masher runs died at C1 (0:12), C2 (0:41) and C3 (1:12), with 21% contact (31/148). The previous build's masher was never knocked out.
  - Timing is now the skill.
- **Sweet spots give timing a visible goal.**
  - Calibrated window for a centre pitch: about 55 ms inside a 285 ms contact window.
  - A sweet spot shows a banner, rings, a hit-stop and +250.
  - Squared Up and Barrel Up turn sweet spots into build choices.
- **The first session is far kinder.**
  - With targets at 1,200 / 2,400 / 4,500 and a free foul, the novice proxy (±150 ms, 320 ms reaction) reached C5–C7 by the 4-minute cap in 3 of 5 runs. Last time it was dead by C3 in 7 of 7.
  - A whiffed first pitch is now a FOUL BALL, not a strike (`shots/05_pitch1_2.png`).
- **The Closers are readable concepts.** Each gets an intro card, a table telegraph (rings, ×3 / CALLED tags, rain with a CLOSED plate) and a banner when it changes (`closers/c03_live_005.png`, `c12_live_029.png`, `sheet_hotmove.jpg`).
- **The scaled Jackpot now matters.** It was 11.8% of points in Run A, up from 0.3%. Rally ×1.5 bumpers fell to 15.7% (from 58%).

**What's not**

- **Early difficulty depends on the draft.**
  - An 8,000-base ramp at C1 (Long Loop, Turbo Ramp, Overpass Bridge) is worth 3.3× the C2 target in a single ride.
  - With one: the precise bot cleared C1–C3 in 47 s of play, and one novice reached C7 in 4 minutes.
  - Without one: 2 of 5 novice runs died at C2 within 48–60 s (Glove Scoop, Squared Up picks).
  - Run outcome tracks the first card more than skill.
- **C4 → C5 is a cliff.** Targets go 8,000 → 15,700 (×1.96) right after the softened curve. ±200 ms runs died at C4 twice and at C5 once.
- **The late game and the Closers don't push back.**
  - Run A: 15/15 on the first attempt, 11 drains in 17 minutes, peak ×4.9.
  - Closers cleared in 16 s (C3, one pitch), 110 s (C6), 50 s (C9), 94 s (C12) and 121 s (C15).
  - In the Closers session the final Closer, Runners on Base, fell in one 45-second pitch. Every bat contact "drives in ×1.5", so for a player who keeps the ball alive it's a **buff**: 0 strandings across two C15 plays.
- **Called Shot almost never happens.**
  - The first scoring contact after the bat decides it, and slings and lanes count as a miss even though they can never be called.
  - Result: 0 hits in 4 calls, and a grey "MISSED THE CALL" banner on almost every pitch. It reads as a penalty notice for an invisible rule.
- **Decisions are still dense.**
  - No card estimates its value ("≈ +1,800 this challenge").
  - Jargon remains: "BUNDLE", "Map 1 loop ramp", "Every 5 hits on Triple Bumper Cluster B (Upper Deck left)".
  - Clusters of near-duplicate boosts: Victory Lap / Victory Parade / Grand Tour, and Toll Booth / Nitro / Express Track.
- **It's still two-thumb only.** There's no one-thumb, assist or left-handed mode.
- **Run length.** A winning run is about 17 minutes with no mid-pitch save, and there's no shorter mode.
- **Watch item:** masher contacts were 65% sweet spots (20/31) against 25% for the precise bot. The sweet test is pure bat angle at contact. Check that late, in-zone swings can't farm it.

**Fixes (ranked by impact per effort)**

1. **De-risk the opening and smooth C4–C6 (very low effort).**
   - Change:
     - Keep 8,000-base ramps out of the C1–C2 draft, or scale checkpoint value to the inning (250 / 500 / 1,000 per checkpoint for Innings 1 / 2 / 3+).
     - Retarget C4–C6 to 7,000 / 10,500 / 15,700 so there's no ×1.96 step.
   - Impact: first-run outcome follows skill, not the first card, and the curve has no cliff.
2. **Give the Closers bite (low effort).**
   - Called Shot: every bat contact starts a 2.5 s window; hitting the called part inside it gives ×2 for 10 s, then a new call. Ignore slings, posts and lanes when resolving.
   - Runners on Base: drive-in ×1.25, stranded ×0, and show the on-base total big next to the bat.
   - Closer targets: ×1.25 the curve value.
   - Aim for a skilled first run failing 30–50% of the time at C9–C15.
   - Impact: Closers become the tension peaks a roguelite needs, and Called Shot becomes a real aiming test.
3. **Add a one-line value estimate and plain-language cards (low to medium effort).**
   - Change: add "≈ +X this challenge" from the per-part hit counts the game already tracks, rename BUNDLE to "3 bumpers", and merge the near-duplicate ramp boosts into tiers.
   - Impact: decisions are clear in 2 seconds, which suits phone play.
4. **One-thumb / Assist controls (medium effort).**
   - Settings → Controls:
     - Two thumbs (default).
     - One thumb: drag anywhere to move, lift to swing.
     - Assist: the batter auto-tracks and you only tap.
   - Add a left-handed swap.
   - Impact: playable one-handed, and a much wider audience.
5. **A "Quick Game" (low effort).**
   - Change: a 3-inning mode (9 challenges, about 8–9 minutes) with its own device best.
   - Impact: a full run fits a mobile session.

---

## 3. VFX & Sounds: 3.2 / 5.0

**What changed and works**

- **A real payoff layer** (`juice.ts`).
  - Hit-stop on every contact: 40 ms, or 70 ms on a sweet spot.
  - Slow motion on HOME RUN, MULTIBALL, CLEARED and RUN COMPLETE.
  - 2–4 px shake, a full-table flash in the event colour, and a fast rail-bulb chase.
  - 30–44 px banners with a dark plate and an overshoot pop.
  - All of these fire on: HOME RUN, JACKPOT, MULTIBALL, BANK, SWEET SPOT, CLEARED, STRIKE N, FOUL, STRIKE THREE, RUN COMPLETE, HOT CORNER moves, CALLED SHOT hit / MISSED THE CALL, and DRIVEN IN.
  - Screencasts confirm each one (`moments/sheet_homerun.jpg`, `sheet_jackpot.jpg`, `sheet_sweet.jpg`, `closers/sheet_hotmove.jpg`, `sheet_drivein.jpg`).
- **Recorded samples on 13 cues,** with random pitch spread per play: bat, swing, bumper, sling, target, ramp entry, bank, strike, buy, jackpot, home run, cleared and game over.
  - The sweet spot plays the bat crack 12% higher.
- **Silent events from last time now have sound:** swing, pitch, Rally-end dings, buy, clear, game over and foul.
- **The night look reads as an arcade cabinet.** Neon cyan and magenta frame, magenta bumper rings, cyan comet trails, a purple stadium sky, and the rail chase.

**What's not**

- **Half the audio is still placeholder synth, and it clashes with the samples.**
  - Still synthesized: lanes, rollover gates, spinner, every ramp checkpoint and the ride-complete chord, ramp gate, ramp complete and landing, scoop catch and eject, MULTIBALL, every multiplier gain, Rally end, Hot Corner move, Called-miss, foul, sweet-spot ding and the pitch.
  - A real wood crack next to square-wave blips, a marimba fanfare and an 8-bit "lose" jingle sound like three different games.
- **Signature moments share sounds.**
  - One bumper sample for every bumper family: factory, glove, clusters, Upper Deck and Rally ×1.5.
  - The splitter uses the target click.
  - **Called Shot hit reuses the Jackpot cash register.**
  - **Drive-In reuses the Bank marimba.**
  - **RUN COMPLETE reuses the CLEARED fanfare.** Finishing 15 challenges sounds exactly like finishing C1.
- **Some events are still silent:**
  - Rally Fuel / Momentum charge, which also has no VFX.
  - Ramp rollback.
  - STRANDED, which only gets a popup.
  - The call being made at pitch start.
  - Draft pick, reroll and all buttons; only shop purchases have a sound.
  - A whiff has no sound of its own.
- **There's still no music, crowd or organ in a ballpark game.** `homerun.mp3` is noted as "arcade jingle, no crowd".
- **The mix is unbalanced.** `homerun.mp3` peaks at −10.3 dBFS against −0.6 to −1.8 dBFS for bumper, bat, sling and target. The signature stinger is the quietest sample and plays over a burst of Rally bumper hits. There's no compressor or reverb, only a master gain.
- **The neon stops at the frame.** The playfield is still dark-teal turf with no bloom or glowing part outlines, and hits light locally.
  - The WHIFF tag is 14 px dark pink on green and easy to miss (`moments/crop_whiff.png`).
  - Hot Corner ×3 hits get a bigger number but no extra layer, either visual or audio.

**Fixes (ranked by impact per effort)**

1. **Music and crowd bed (low to medium effort).**
   - Change:
     - A looping ballpark organ / synthwave track at about −20 dB that ducks 6 dB under stingers.
     - A crowd murmur that swells with the multiplier.
     - A crowd roar layered on HOME RUN, CLEARED and RUN COMPLETE, and a groan on STRIKE.
   - Impact: the single biggest jump in feel, and it hides synth–sample mismatches.
2. **Finish the sample set in one palette (medium effort).**
   - Change: replace every remaining synth cue with samples:
     - lane bell
     - gate chime
     - spinner ratchet
     - one ramp "step" sample pitched up a scale per checkpoint, with a sampled chord on the finish
     - scoop thump and pneumatic eject
     - multiball siren
     - multiplier "level-up" pluck that rises in pitch
     - foul "tink" off the bat
     - sweet-spot ring
     - rally-end register dings
     - rollback "wah"
     - stranded crowd "aww"
   - Swap the 8-bit game-over for an organ descent plus a crowd groan.
   - Impact: one coherent sound world, and nothing scores in silence.
3. **Un-share the signature cues (low effort).**
   - Change:
     - Upper Deck bumpers +3 semitones, with a sparkle layer while Rally is on.
     - A unique Called Shot stinger: umpire "STEE-RIKE!" style vocal plus crack.
     - A unique Drive-In: crowd cheer plus slide.
     - A longer RUN COMPLETE fanfare with fireworks bursts across the table.
     - Rally-charge armed: a blue pulse on the bumpers plus a rising whoosh.
     - Soft UI clicks for draft and reroll.
   - Impact: every way to score is identifiable by ear.
4. **Fix the mix bus (very low effort).**
   - Change: normalize the samples to a common peak and raise `homerun.mp3` by about 8 dB. Insert a `DynamicsCompressor` (threshold −18 dB, ratio 4) and a short room-reverb send at about 15% for stingers. Duck table sounds for 250 ms under stingers.
   - Impact: the big moments land louder than routine bumps.
5. **Bring the neon onto the playfield (medium effort).**
   - Change:
     - Darken the turf about 30% more.
     - Glowing outline strokes on bumpers, slings and ramp rails that flare on hit.
     - An additive bloom on flashes.
     - A ×3 sparkle and a brighter variant sound on Hot Corner hits.
     - WHIFF in white/red at 18 px with a dust puff.
     - On the title, dim the table less and run a demo ball.
   - Impact: it looks like neon arcade pinball, not a dusk ballpark with a neon frame.

---

## Overall: 3.5 / 5.0

The weighting is the same as last time, for comparability: Simplicity 40%, Polish 35%, VFX & Sound 25%. That gives 0.4 × 3.4 + 0.35 × 3.8 + 0.25 × 3.2 = 3.49, rounded to **3.5**. That places it as a strong vertical slice, roughly halfway to releasable.

### Change by category

| Category | Delta | Main reasons |
|---|---|---|
| Polish | 3.3 → 3.8 (+0.5) | Screen fit, rotate prompt, auto-pause, swing buffer, results screens with device best, beats before cards, readable text, tips off the playfield. Held back by bugs in the new Closer presentation (truncated strip, invisible LOCKED, wrong Small Ball number), stale copy and credits, and no mid-pitch save. |
| Simplicity | 2.9 → 3.4 (+0.5) | Whiff lockout ends mashing, the sweet spot gives timing a goal, the foul plus softer targets rescue the first minute, the Jackpot matters, Rally no longer dominates. Held back by draft-driven variance, the C4→C5 cliff, toothless late Closers (Called Shot 0/4, Runners is a buff), dense cards, two thumbs only, and a 17-minute run. |
| VFX & Sounds | 2.3 → 3.2 (+0.9) | The big-moment layer is complete and well tuned, the core contact sounds are recorded, and the night cabinet sells the arcade frame. Held back by about half the cues still being synth, shared stingers (RUN COMPLETE = CLEARED, Called = Jackpot, Drive-In = Bank), four silent events, no music or crowd, a quiet HOME RUN sample, and neon that stops at the frame. |

### Biggest remaining blocker

**Balance at both ends of the run.** Draft luck decides the first five minutes, and nothing, Closers included, threatens a competent player after that. A roguelite that a decent player beats on their first 17-minute attempt has no reason to be replayed.

The audio identity (no music or crowd, half synth) is a close second. It's cheaper to fix but just as visible within 10 seconds with sound on.

### Verdict

This is a real step up. The previous review's headline problems have mostly been addressed, and addressed well:

- The payoff layer exists and looks good on a phone.
- Mashing is dead.
- The first session no longer ends in 30 seconds.
- The screen fits.
- Results screens give a goal.
- It's still rock-solid technically.

What's left is the difference between a polished slice and a product:

- Draft-driven difficulty spikes and soft late-run Closers.
- A Called Shot rule that almost never fires.
- Closer UI that truncates or hides its own rule on a 390 px phone.
- A soundscape that's half recorded, half 1990s synth, with no music or crowd.

None of it needs a redesign. A tuning pass on early ramps, the C4–C6 targets and the Closer numbers; a one-day Closer-UI bug pass; and a music/crowd bed plus the remaining samples would put this at about 4.0–4.2. I'd ship it as a public beta now, but not as a 1.0 release.

---

## Appendix A: event → VFX → sound audit

"Moment" means the `juice.ts` package: banner, hit-stop/slow-mo, shake, flash and bulb chase. "Sample" means a recorded file in `public/sounds`. "Synth" means a `Sfx.tone` or `noise` placeholder.

### A1. Every way to score or raise the score/multiplier

| # | Event | VFX | Sound | Verdict |
|---|---|---|---|---|
| 1 | Bumpers: factory, glove, Bonus, Twin/Triple clusters, Upper Deck, Rally ×1.5 | Glow, stitched ring, 17 sparks, light 0.45 s, ≥14 px popup; Rally halo on the ball | `bumper.mp3` (±8% pitch), **one sample for every family**; no Rally or deck layer | ✔ VFX / shared sound |
| 2 | Standup and round targets | Glow, fragments, sparks, light, popup | `target.mp3` | ✔ |
| 3 | Multiball splitter hit | Target effect, popup | `target.mp3` (shared) | ✔ / shared |
| 4 | Jackpot (5% of target, floor 250) | Gold target hit, popup, **Moment** (JACKPOT! +N, 90 ms stop, 3 px shake, flash, chase 1.3 s) | `jackpot.mp3` cash register | ✔✔ |
| 5 | Top lanes | Flash, popup, chevrons | Synth sine 988 Hz | ✔ / synth |
| 6 | Slingshots | Sling hit, sparks, popup (now shown) | `sling.mp3` | ✔ |
| 7 | Rollover gates (Jackpot Lane Gate) | Flash, ring, popup | Synth 880+1320 Hz | ✔ / synth |
| 8 | Spinner | Popup only, no flash | Synth 1.5 kHz clicks | Weak VFX / synth |
| 9 | Target bank complete | Gold hits on the bank, popup, **Moment** (BANK COMPLETE +N, mid size) | `bank.mp3` marimba triad | ✔✔ |
| 10 | Ramp checkpoints (8×) | Lamp, flash, sparks, ring on the last, running "+2,000" tally (≥15 px) | Synth rising scale, chord on the last | ✔ / synth (best-designed cue, but still synth) |
| 11 | Ramp gate | Flash, core, ring, 18 sparks, popup | Synth 4-note chime | ✔ / synth |
| 12 | Ramp complete (Home Run +3,000, no-checkpoint ramps) | Light, flash, ring, sparks, popup | Synth 440→880 Hz | ✔ / synth |
| 13 | Scoop catch | Flash, popup | Synth thump + 2 notes | ✔ / synth |
| 14 | Multiball launch | Hatch glow, ring, sparks, **Moment** (MULTIBALL!, slow-mo) | Synth saw arpeggio | ✔ VFX / synth |
| 15 | Multiplier gain (gates, every-N generators, Barrel Up / Squared Up) | Ring, glow, "+0.1×" popup, HUD plaque burst | Synth blip rising with the total, **shared by every source** | ✔ / synth, shared |
| 16 | HOME RUN → Rally ×1.5 starts | **Moment** (HOME RUN! / RALLY ×1.5 UPSTAIRS, 100 ms stop, slow-mo 0.35×, 4 px shake, flash, chase 1.6 s), ball halo | `homerun.mp3` arcade jingle; **peak −10.3 dBFS, the quietest sample**; no crowd | ✔ VFX / sound under-mixed |
| 17 | Rally ends (tally) | "RALLY +N" popup | Synth dings, 1 per 1,000 (max 6) | ✔ / synth |
| 18 | Rally Fuel / Momentum charge armed (`rally` event) | **None** | **None** | ✖ both (unchanged) |
| 19 | Sweet spot (+250, Small Ball ×3) | Flash, ring, 70 ms stop, 2 px shake, **Moment** "SWEET SPOT! +N" low on the table; **shows +250 when 750 is paid under Small Ball** | `bat.mp3` at 1.12×, plus synth 1.57 kHz ding | ✔ / label bug |
| 20 | Hot Corner ×3 scoring (C3) | Dashed ring and ×3 tag on the hot part, blinking for the last 3 s; the popup shows the multiplied value | No extra layer (the part's normal sound) | ◐ no "×3 hit" feedback |
| 21 | Hot Corner spot moves | **Moment** (HOT CORNER / LABEL ×3, chase 0.7 s); the strip timer is **truncated at 390 px** | Synth two pings | ✔ / synth |
| 22 | Small Ball multiplier frozen (C6) | **LOCKED badge invisible** (z-order); slight desaturation | None | ✖ telegraph bug |
| 23 | Called Shot: call made at pitch start (C9) | Cyan dashed ring and CALLED tag (tag clipped by ramp rails); strip "CALLED: DECK BUMP…" truncated | **None** | ◐ |
| 24 | Called Shot hit (×2 for the pitch) | **Moment** CALLED SHOT! ×2 (stop, shake, flash, chase) | `jackpot.mp3` (**shared with Jackpot**) | ✔ / shared; 0 hits in 4 calls |
| 25 | Called Shot miss | Mid grey banner "MISSED THE CALL" | Synth falling tone | ✔ / synth |
| 26 | Runners on Base: points go on base (C15) | Normal part popups; total only in the strip ("ON BASE 3,000") | Part sounds only | ◐ the most important number is tiny |
| 27 | Runners driven in ×1.5 | **Moment** DRIVEN IN! +N (low banner, flash, chase) | `bank.mp3` (**shared with Bank**) | ✔ / shared |
| 28 | Runners stranded ×0.5 | In-world "STRANDED +N" popup, 1.2 s | **None** | ✖ sound |
| 29 | HUD score rises | Scale-pulse and glow; progress bar | None (fine) | ✔ |

**Tally:** of the 26 rows that score or change scoring (#1–#28 excluding #22–23):

- 25 have VFX; only the Rally charge has none.
- Sound:
  - 5 have a sample of their own: target, Jackpot, sling, Bank, Home Run.
  - 5 share a sample with another event: all bumper families on one sample; splitter = target; sweet = bat; Called hit = Jackpot; Drive-in = Bank.
  - 12 are synth placeholders: lanes, gates, spinner, ramp checkpoints, ramp gate, ramp complete, scoop, multiball, multiplier, Rally end, Hot Corner move, Called miss.
  - 2 only get the scoring part's normal sound: Hot Corner ×3 hits and Runners "on base".
  - 2 are silent: Rally charge and Stranded.

### A2. Non-scoring and flow events

| # | Event | VFX | Sound | Verdict |
|---|---|---|---|---|
| 30 | Bat contact | 40 ms hit-stop, glow, ring, 9 sparks, comet trail | `bat.mp3` (±4%); brighter only on a sweet spot | ✔ |
| 31 | Swing | Swing-arc smear | `swing.mp3` | ✔ (new) |
| 32 | Whiff (+0.25 s lockout) | "WHIFF" 14 px, dark pink on green | None of its own (swing whoosh only) | ◐ low visibility, no sound |
| 33 | Pitch (serve) | Mound lights | Synth sine pop | ✔ / synth (new) |
| 34 | Posts, walls, rails | Sparks on posts | None | Acceptable |
| 35 | Ramp entry | Mouth flash | `ramp.mp3` swoosh | ✔ |
| 36 | Ramp landing | Ring, sparks | Synth thump + noise | ✔ / synth |
| 37 | Ramp rollback | Small glow | **None** | ✖ (unchanged) |
| 38 | Scoop eject | Flash, ring, sparks | Synth saw sweep | ✔ / synth |
| 39 | Drain → strike | **Moment** "STRIKE N" (red flash), 700 ms beat, then card | `strike.mp3` thump | ✔ (VFX new) |
| 40 | Foul ball (free re-pitch) | **Moment** "FOUL BALL / NO STRIKE · RE-PITCH", 700 ms beat | Synth 600→900 Hz | ✔ / synth |
| 41 | Challenge cleared | **Moment** CLEARED! (120 ms stop, slow-mo, shake, flash, chase 1.8 s), 950 ms beat; banner overlaps the card for about 100 ms | `cleared.mp3` marimba fanfare | ✔ (new) |
| 42 | Game over | **Moment** STRIKE THREE (shake, flash), 900 ms beat, results card | `gameover.mp3` 8-bit lose jingle (style clash) | ✔ / tonal mismatch |
| 43 | Run complete | **Moment** RUN COMPLETE! (biggest: slow-mo 0.6 s, chase 2.4 s), results card | `cleared.mp3` (**same as a C1 clear**) | ◐ no unique finale |
| 44 | Shop purchase | Button state | `buy.mp3` cha-ching | ✔ (new) |
| 45 | Draft pick, reroll, menu buttons | Button states | **None** | ✖ |
| 46 | Music / crowd / organ | – | **None** | ✖ (unchanged) |
| 47 | Title attract | Rail chase cycling colours (barely visible under the title card) | None | ◐ |

### A3. Under the hood

- **Samples** (`public/sounds`):
  - 13 MP3s at 48 kHz, stereo, 128 kbps, 0.1–2.9 s long; all load (HTTP 200) on the player route.
  - Peaks −0.6 to −10.3 dBFS, means −17 to −25 dB, so they aren't loudness-matched.
  - Per-play pitch spread (`vary`) of 0–8%. The gain is `vol × 1.6` into a master of 0.32.
  - No compressor, reverb or panning.
  - Synth fallback for everything else.
- **Juice** (`juice.ts`):
  - All values are tunable in `JUICE`.
  - Reduced Effects turns off shake, caps slow-mo at 0.6× and scales the flash to 40%.
  - Banners are DOM text at 44/30/15 px on a dark plate.

---

## Appendix B: bot runs (this build)

| Profile | Timing error | Reaction | Runs | Outcomes | Contact | Comparison with the previous build |
|---|---|---|---|---|---|---|
| Precise | Normal σ 40 ms | 200 ms | 1 full run | **15/15 in 17:24**, 11 drains; Closers C3 16 s / C6 110 s / C9 50 s / C12 94 s / C15 121 s; peak ×4.9; run total 1.69 M | 86% (282/328), 25% of contacts sweet | Was 13/15 by the 15:00 cap |
| ±100 ms | Uniform | 250 ms | 2 | Alive at C7 and C8 at the 5:00 cap (6 and 7 cleared) | 74–80% | Was dead at C5 by 3:37 |
| ±200 ms | Uniform | 250 ms | 4 | Died at C4 (3:18), C4 (2:43), C5 (2:24), C7 (3:25) | 60–68% | Was dead at C2 in 3 of 4 runs |
| Novice proxy | Uniform ±150 ms | 320 ms | 5 | Died at C2 (0:48, 1:00) in 2 runs; alive at C5, C7 and C7 at the 4:00 cap in 3 | 55–68% | Was dead by C3 in 7 of 7 |
| Masher (taps every 0.36 s) | – | 250 ms | 3 | Died at C1 (0:12), C2 (0:41), C3 (1:12) | 21% (31/148) | Was never knocked out |

**Points by source, Run A** (excluding the C15 Runners double-count):

| Source | Share of points |
|---|---|
| Ramp checkpoints | 33.4% |
| Rally ×1.5 bumpers | 15.7% |
| Bumpers | 12.6% |
| Jackpot | 11.8% |
| Ramp gates | 9.0% |
| Other ramp checkpoint awards | 7.4% |
| Ramp completions | 4.3% |
| Bat / sweet spots | 2.5% |
| Targets | 1.3% |
| Lanes | 1.0% |
| Slings | 1.0% |

All ramp sources together make about 54%. That's partly my ramp-leaning draft heuristic, but one 8,000-base ride being worth 3.3× the C2 target is a design fact either way.

**Closer resolution across all sessions:**

- Hot Corner moved as designed.
- Called Shot: 0 of 4 calls hit.
- Runners on Base: 35 drive-ins, 0 strandings.
- Small Ball: cleared with 2 strikes in Run A and 2 strikes in the Closers session.

## Appendix C: evidence files

- Screenshots: `/tmp/critic2/shots/` (first launch, menus, layouts, LOCKED test).
- Run A stills: `/tmp/critic2/run_A/` (every card, draft and shop, plus first-event bursts), with its log in `run_A/log.txt` and events in `run_A/ev.json`.
- Moment screencasts and sheets: `/tmp/critic2/moments/` (`sheet_clear`, `homerun`, `jackpot`, `sweet`, `whiff`, `foul`, `strike1`, `gameover`; `crop_whiff.png`).
- Closers: `/tmp/critic2/closers/` (intros, live stills at 390×844 and 390×664, `sheet_hotmove`, `calledcall`, `calledmiss`, `drivein`, `crop_locked.png`, `crop_smallball_sweet.png`).
- Trial logs: `/tmp/critic2/t_*.out`.
- Scripts: `/tmp/critic2/scripts/`.
