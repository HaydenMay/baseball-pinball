# Moonshot Pinball: Production Readiness Review #3 (Mobile)

**Build:** v1.0.0 (8fab947), route `/baseball-pinball/play/`, Night Game theme. **Reviewed:** 25 Nov 2026.
I'm an independent critic with no stake in the game. I read the two 22 Nov reviews only to track changes, and scored this build fresh.

## 1. Scorecard

| Category | Score | Previous | One-line reason |
|---|---|---|---|
| Polish | **3.9** | 3.8 | Most of the last review's bugs are fixed: the Closer plate, the LOCKED badge, the sweet-spot number, mid-pitch save, haptics and Quick Game. Held back by a stale HUD target on every clear card, resumed Closers that lose their rule text, an internal ID shown to players, developer text on desktop and 28 px HUD buttons. |
| Simplicity | **3.6** | 3.4 | Quick Game and a fair first minute make it easy to start. Held back by a steep timing-skill cliff, a Called Shot rule that a straight hitter can't satisfy, and leftover jargon ("mods", "Rally", "Power"). |
| VFX & Sounds | **3.7** | 3.2 | 33 samples now cover almost every scoring event, and the big moments are well staged. Held back by no music, five cues still on synth, two pairs of duplicate files, a HOME RUN sting still 7–9 dB under the other cues, and no mix bus. |
| Game Feel & Depth | **3.4** | – | Contact is forgiving and a sweet spot feels great. But run outcome tracks a ~25 ms timing band more than the build, single pitches swing ±10× in value, and too many shop cards are "+0.1× every N hits" filler. |
| **Overall production readiness** | **3.6** | 3.5 | A solid, stable vertical slice that is close to a free beta. It isn't a polished 1.0 yet. |

## 2. How I tested

**Setup**

- Python Playwright driving `/usr/bin/google-chrome` at device scale factor 2, with touch and mobile emulation on.
- Viewports: 390×844 (main), 360×640, 430×932, 844×390 (landscape) and 1280×800 desktop.
- Rendering is on CPU, so the page ran at about 53 fps. **I make no performance judgments** from that.

**The swing-timing player**

- An in-page script reads `sim.balls` and predicts when and where the ball will cross the bat line. It walks the batter there with A/D and presses Space with Gaussian timing error σ.
- It doesn't aim, so it always tries for "up the middle".
- Draft policy: it prefers ramps, then machines.
- Shop policy: it buys whatever is affordable, highest-ranked first, and never rerolls.
- I verified real touch separately via CDP:
  - Tapping the right half swings.
  - A 90 px left-thumb drag moved the batter 5.8 units.
  - Dragging with one thumb and tapping with the other works.
  - Five rapid taps on PLAY BALL served exactly one pitch.

**Played naturally (no hooks except reading state)**

| Run | Mode | Timing σ | Result | Real time |
|---|---|---|---|---|
| qA | Quick | 50 ms | Died C5 (9,438 / 11,500); bought nothing (driver bug) | 3:35 |
| qB | Quick | 50 ms | Died C4 (5,633 / 7,000), run total 14,847 | 2:15 |
| qP | Quick | 0 ms | **Won 6/6**, 54,380; Small Ball C6 cleared in one pitch | 3:14 |
| fA | Full | 40 ms | Died C3 Hot Corner (2,819 / 5,600) | 1:25 |
| fB | Full | 20 ms | Died C6 Small Ball (20,142 / 23,500) | 3:01 |
| fC | Full | 0 ms | **Died C7** (30,264 / 30,700), run total 82,534 | 5:29 |

- The furthest I got naturally was **C7 of 15**, with the perfect-timing player. I saw two Closers played naturally (Hot Corner and Small Ball), several times each.
- Contact and timing stats:
  - Contact rate was 67–80% at σ 40–50 ms and 75% at σ 0. Some whiffs are positioning misses on fast side-angle balls.
  - Sweet-spot share was 85% at σ 0 against 20–38% at σ 50.
- Measured forgiveness, swinging at a fixed offset from ideal on a C1 pitch (5 trials each):
  - −160 ms: all whiffs.
  - −120 to −40 ms: all contact.
  - −20 to 0 ms: all **sweet**.
  - +20 to +80 ms: all contact.
  - +120 ms: ball already past.
  - So contact is about a 230 ms window and the sweet spot about 40 ms.

**Set up with dev hooks (save edited, clearly not natural)**

- I took the C7 save from run fC and edited `run.challenge` to 9, 12 and 15, then hit Continue. Each Closer was played with the same bot.
- **C9 Called Shot**, two sessions:
  - Cleared both times (75,528 and 75,884 / 75,300) despite C7 having failed at 30,700 with the same build.
  - The call hit 0 of 4 times. My bot never aims, so this measures a straight hitter, not the rule's ceiling.
- **C12 Rain Delay**: failed, 146,925 / 206,600.
- **C15 Runners on Base**: failed, 426,720 / 567,000. That session had 46 drive-ins and 3 strandings, including a single 224,392-point pitch.

**Other checks:** every menu and run screen at 390×844 and 360×640, reload mid-pitch, reload at a Closer start card, double-tap buy, reroll until broke, sell a machine, rotate mid-pitch, and desktop. I saw zero console errors and zero page errors in any session.

**Sound:** I did **not** listen to anything. Sound is judged from `sound-set.ts`, `audio.ts` and `main.ts`, plus ffmpeg level and md5 checks of `dist/sounds/*.mp3`.

**Screenshots:** `docs/screenshots/critic3/`. Prefixes: `q*` Quick runs, `f*` full runs, `s390_` / `s360_` screen tour, `cl09/cl12/cl15_` Closers (dev-hook), `resume_c3/c6`, `title_*`, `live_desk`.

---

## 3. Categories

### 3.1 Polish: 3.9

**What works**

- **The last review's Closer bugs are all fixed.**
  - A full-width Closer plate over the table reads "×3 TARGETS 15s", "SMALL BALL · SWEET ×3", "CALLED: BUMPER", "RAIN DELAY" and "ON BASE 4,550", with no truncation at 360 px (`qB_c03_live_1.png`, `cl15_ev_homerun_1.png`).
  - The LOCKED badge now paints (`qP_end.png`).
  - The Small Ball sweet popup says "SWEET +750" (`qP_c06_live_4.png`).
- **Mid-pitch save works.**
  - A hard reload 4 s into a pitch (no pause) kept the 700 points with no strike. Continue showed "RUN RESUMED · 700 scored so far, 1,700 to go · strike 0 of 3".
  - Rotating mid-pitch shows TURN YOUR PHONE and pauses.
- **The new 2×2 Free Pick and shop grid is clean and fits** at 360×640 without page scroll (`s360_freepick.png`, `s360_shop_notip.png`).
  - The detail view has a live minimap, and SEE IT ON THE TABLE docks the card and shows the real table (`s390_freepick_peek.png`).
- **Robust:**
  - Double-tapping BUY $5 within 60 ms charged once.
  - Reroll escalates $1/$2/$3 and disables at "REROLL $4" when you're short.
  - Sell has a confirm step that shows the Power change.
  - Settings now has Vibration and Volume.
- **Results cards are good:** run total, 6 or 15 pips, best pitch, sweet spots, peak multiplier and a separate Quick best (`qB_end.png`).

**What doesn't**

- **The HUD shows the old target on every Challenge Cleared card.**
  - "NEXT TARGET 0 / 5,600" after clearing C3, where the next target is 7,000 (`qB_c03_card_12.png`, `q04_draft_390.png`).
  - The label is new but the number is the cleared one.
- **A resumed Closer forgets its rule.** Continuing at a Closer start card shows "INNING 1 · CLOSER · RUN RESUMED / Your machine: …" with no name and no rule (`resume_c3.png`, `resume_c6.png`).
- **An internal key leaks to players** in Manage Machine: "Express Lane @ mgate@gate-l" and "Express Lane (mgate@gate-l)" (`s390_manage_confirm.png`, `s390_manage_sold.png`).
- **Developer text on the desktop sidebar:** "Press ` for the debug overlay · console: playtest.report()" (`live_desk.png`).
- **The machine footer line is clipped mid-glyph** ("Machine: factory table") on Free Pick and the shop at both 390 and 360 (`q07_freepick_390.png`, `s390_shop_broke.png`).
- **Tap targets below 44 px:**
  - Mute and pause are 36×28.
  - MANAGE is 58×28.
  - ◀ ALL PICKS is 88×35.
  - ◀ BACK TO FREE PICK is 125×31.
  - TAKE FREE / BUY in the detail view are 34 px tall.
  - GOT IT is 54×36.
  - The title's How to Play / Settings / Credits buttons are 40 px tall.
- **Copy inconsistencies:**
  - The strip says "PRESS READY" while the button says PLAY BALL.
  - The strip says "RUN WON" while the card says RUN COMPLETE.
  - The Continue line says "6 mods" while cards say "6 boosts".
  - "boost(s)".
- **On a 390×844 phone, about 120 px of empty purple sits above and below the cabinet.** Fine on desktop, but it wastes 28% of a phone's height (`01_title_390.png`).

**Fixes**

1. **Stale target**
   - Where: the clear card after any challenge.
   - Change: in `updateHud`, when `between` is true, show `targetFor(run.challenge + 1)` and not `r.target`.
   - Impact: removes a "this is broken" moment that appears 5–15 times per run.
2. **Resumed Closer card**
   - Where: Continue at C3 or C6.
   - Change: when `closerFor(challenge)` is set, use the normal Closer intro kicker and body ("CLOSER · HOT CORNER · 3/6", rule text) and put "RUN RESUMED" as a small line under the target.
   - Impact: a returning player knows the twist.
3. **ID leak and desktop dev line**
   - Change:
     - Replace `@ ${k}` with `mountName(anchorOf(k))` (e.g. "Express Lane, waiting for a part at Left alley top").
     - Hide the "Press `" line unless `?debug`.
   - Impact: removes the two things a store reviewer would screenshot.
4. **Tap targets**
   - Change:
     - Mute and pause to 44×44, keeping the 36×28 visual but padding the hit box.
     - MANAGE, back buttons and detail TAKE/BUY to min-height 44 px.
     - Title tertiary buttons to 44 px.
   - Impact: fewer mis-taps one-handed.
5. **Copy pass**
   - Change:
     - Strip text "PRESS READY" → "READY?" (or hide it while a card is up).
     - "RUN WON" → "RUN COMPLETE".
     - "mods" → "boosts".
     - "1 boost(s) waiting" → "1 boost waiting" / "2 boosts waiting".
     - Fix the footer clipping with `line-height: 1.3; padding-bottom: 4px`.
   - Impact: consistency.
6. **Phone height**
   - Change: on portrait phones (`max-width: 500px`), let the cabinet grow to `100dvh` minus the safe areas, or scale the scoreboard to use the spare ~240 px.
   - Impact: a bigger table and bigger thumb zones.

### 3.2 Simplicity: 3.6

**What works**

- **The first minute is gentle.**
  - C1 is 1,200, and one good swing at the Jackpot clears it (C1 in 5.8 s, one swing).
  - The free foul removes a first-pitch strike.
  - Contact is forgiving (about 230 ms).
- **Quick Game** (6 challenges, ~10 min by the title's estimate, $4 start) sits right on the title. A winning perfect-timing Quick Game took 3:14 of wall time, with fast clears. It fits a phone session.
- **Closer rules are readable on screen now.**
  - Hot Corner has dashed ×3 rings and a countdown.
  - Rain Delay has a CLOSED plate on the HOME RUN ramp and rain streaks.
  - Runners shows the ON BASE total in the plate, with a "6,355 STRANDED" popup.
  - Small Ball shows LOCKED.
- **The difficulty now pushes back** (the last review's main complaint). No bot profile won the full run:
  - Perfect timing died at C7.
  - σ 20 ms died at C6.
  - σ 40 ms died at C3.
- **How to Play now covers** Closers, sweet spot, whiff, foul, Quick Game and saving.

**What doesn't**

- **The skill curve is a cliff, not a slope.**
  - The sweet window (about 40 ms) is the real game. Under Small Ball it pays ×3, and a dead-centre hit goes straight up the middle into the Jackpot Lane Gate and Jackpot (15 jackpots in the winning Quick Game).
  - At σ 0 the player won Quick Game. At σ 50 ms (a good human on a phone with touch latency jitter) it died at C4–C5 twice.
  - A typical player won't see Closer 2.
- **Called Shot is still opaque.**
  - "CALLED: DECK BUMPER" names a part on the Upper Deck that is **off-screen** while you bat (`cl09_ev_called_call_1.png`).
  - "CALLED: BUMPER" doesn't say which bumper until you find the ring.
  - The Jackpot Lane Gate sits between the bat and most targets, so a centre hit "misses the call" almost every time: 0/4 for me, and the previous review also saw 0/4.
- **Jargon remains:**
  - "Power ⚡" versus "$".
  - "mods".
  - "Rally ×1.5 UPSTAIRS".
  - "Express Lane: +0.1× more per pass".
  - "Every 5 hits on Top-left bumper: +0.1×".
  - Players need to understand tenths of a multiplier to judge most shop cards.
- **No card says what it's worth.** "Crowd Noise: every 20 bumper hits +0.1×" against "Sharp Eye: standup targets +50" can't be compared in two seconds.

**Fixes**

1. **Soften the skill cliff**
   - Where: runs qA, qB and fB against qP and fC.
   - Change:
     - Widen the sweet window from ±0.25 rad to ±0.35 rad (about ±35 ms).
     - Lower C5 / C6 / C7 to 10,000 / 20,000 / 26,000.
     - Re-run `bot-run.ts` with σ = 50 ms until about 50% of runs reach C6 and about 15% clear C9.
   - Impact: an average phone player sees two Closers and the Upper Deck payoff.
2. **Make Called Shot aimable and visible**
   - Where: C9 (dev hook).
   - Change:
     - Only call parts that are visible from the batter camera.
     - Name them by place: "CALLED: RIGHT BUMPER".
     - Exclude the Jackpot Lane Gate from "first contact" the way slings and lanes are excluded.
     - Show a cyan arrow from the bat toward the call for the 2.5 s window.
   - Impact: the rule becomes an aiming test a player can actually pass.
3. **Value hints on cards**
   - Where: every Free Pick and shop.
   - Change: add a muted line under each summary, "≈ +1,200 / challenge", estimated from this run's per-part hit counts (already in telemetry).
   - Impact: decisions take seconds, not reading.
4. **One-thumb option**
   - Change: Settings → Controls → "One thumb: drag to move, lift to swing".
   - Impact: more players can play one-handed (still missing).

### 3.3 VFX & Sounds: 3.7 (sound not listened to)

**What works**

- **Sound Board 2 replaced most of the synth.** 33 samples, all loading on the player route, including distinct cues for:
  - Called hit and called miss.
  - Drive-in and stranded.
  - Upper Deck bumper (a higher punch).
  - Multiplier, which rises in pitch with the total.
  - Checkpoints, which climb a semitone per step.
  - Ride finish, scoop catch, splitter, lane, gate, spinner, sweet and Rally end.
  - UI tap and reroll shuffle.
  - A unique RUN COMPLETE.
- **The big-moment layer is excellent on a phone.**
  - HOME RUN! / RALLY ×1.5 UPSTAIRS takes over the scoreboard like a stadium video board, so the table stays clear (`cl15_ev_homerun_1.png`).
  - STRIKE 1 is a big red table plate.
  - CLEARED gets slow-mo.
- **Haptics** are mapped to bat, sweet, home run, jackpot, called hit, strike, clear and game over.
- **The neon cabinet now carries onto the playfield.** Glowing ramp tubes, ringed bumpers and the chase lights read as arcade pinball.

**What doesn't**

- **No music at all.** This is the biggest remaining gap in feel. The no-crowd choice is by design and isn't counted.
- **Still synth:**
  - The pitch (serve).
  - **The ramp gate**, the "signature reward" 4-note chime.
  - Ramp landing.
  - Scoop eject.
  - The FOUL BALL moment.
- **Duplicate files under different names** (md5-identical):
  - `drivein.mp3` = `rallyend.mp3`.
  - `gate.mp3` = `lane.mp3`.
  - Drive-in, the C15 headline event, sounds exactly like a routine Rally end.
- **Silent events:**
  - Whiff: only the swing whoosh plays; the WHIFF tag is small pink text (`cl12_ev_whiff_1.png`).
  - The call being made at pitch start.
  - The first Hot Corner spot.
  - Rally Fuel charge armed (`rally` event): no sound and no VFX.
  - Ramp rollback.
  - Runners added to base.
- **The mix:**
  - `homerun.mp3` still peaks at −10.3 dBFS (mean −21.9) at vol 0.75, against −0.6 to −1.8 for bat, sling and scoop.
  - `drivein` peaks at −11.9 and `calledhit` at −8.8.
  - The headline stingers are the quietest files in the set.
  - There's still no compressor or limiter on the master bus.

**Fixes**

1. **Music bed**
   - Change: one looping synthwave or ballpark-organ track at about −20 dB under the SFX, with `gain.setTargetAtTime` ducking 6 dB for 600 ms on HOME RUN, CLEARED, RUN COMPLETE and JACKPOT. Add a Music volume slider under Volume.
   - Impact: the single biggest jump in perceived production value.
2. **Finish the set**
   - Change:
     - Sample the remaining cues: serve (a leather "pop" from the mound), rampGate (a bright 4-note bell), land (a thud), eject (a pneumatic puff), foul (a "tink" off the bat).
     - Add a muted wood "swish-tick" for whiff.
     - Add a cyan "ding" for the call and a rising whoosh for the Rally charge.
     - Replace `drivein.mp3` with its own sound (a slide-plus-cheer arpeggio) and make `gate` differ from `lane` (a 2-note chime against a 1-note bell).
   - Impact: every way to score gets its own sound.
3. **Mix bus**
   - Change:
     - Normalize all samples to −1 dBFS peak, which raises homerun by about 9 dB, drivein by about 11 and calledhit by about 8.
     - Insert `DynamicsCompressor` (threshold −18, ratio 4, attack 3 ms, release 150 ms) before the destination.
   - Impact: big moments are loudest, and dense multiball doesn't clip.
4. **Whiff readability**
   - Change: WHIFF at 20 px, white text with a red outline, plus a 6-particle dust puff at the bat.
   - Impact: players learn why the next swing is delayed.

### 3.4 Game Feel & Depth: 3.4

**What works**

- **Hitting feels good.**
  - 40 ms hit-stop on contact and 70 ms on a sweet spot.
  - A comet trail, plus a ring and "SWEET +250" at the bat.
  - Aim by timing is clear, and the 230 ms contact window makes the game feel fair to a beginner.
- **The Upper Deck reveal at C4 is a real midgame lift.** A new ramp and the HOME RUN Rally.
- **Closers now have teeth:**
  - Runners strands to zero.
  - Rain Delay removes the best ramp.
  - Small Ball nullifies multiplier builds.
  - Hot Corner ×0.8 makes a C3 build sweat (fA died there).
- **Build choices are visible on the table immediately** through the live minimap and peek.

**What doesn't**

- **Pitch variance swamps the build.**
  - With an identical build, C7 failed at 30,264 / 30,700 over three pitches, while C9 (75,300) cleared in two pitches. C15 had one 224,392-point pitch against a 58,659 follow-up.
  - Whether the ball finds the HOME RUN ramp or the Rally upstairs decides most challenges.
- **Straight-up-the-middle dominates.** A sweet centre hit lands in the Jackpot Lane Gate and Jackpot repeatedly (15 jackpots in one Quick Game). There's little reason to aim left or right except for Called Shot.
- **Too many build cards are near-identical "+0.1× per N hits" generators:** Crowd Noise, Standing Ovation, Hot Hand, Express Lane, Gate Network and Barrel Up.
  - Peak multiplier was ×1.0–×1.8 in five of six natural runs, so they rarely matter.
  - My runs ended with 9–21 boosts and the same 3–5 machines.
- **The shop never offered a machine.** Across 19 shop visits in four logged runs (qB, qP, fB, fC), every card was a boost. Machines only came from Free Picks. Power (⚡) ended at 5–7 of 7–8, so the budget never forced a choice.

**Fixes**

1. **Cap per-pitch swing**
   - Where: C7 and C9 in run fC.
   - Change:
     - Make the Upper Deck Rally ×1.5 last 12 s or 15 hits, not "until the ball comes down".
     - Have the HOME RUN ramp pay 3,000 + 5% of the target, so it scales instead of compounding.
   - Impact: outcomes follow consistent play.
2. **Reward aiming**
   - Change:
     - Halve the Jackpot Lane Gate's value on a sweet centre hit, or nudge a dead-centre exit ±0.08 rad at random.
     - Put a small bonus (+10% of the target) on left and right ramp entries from a deliberate pull or push.
   - Impact: timing becomes a choice of where, not only when.
3. **Card variety**
   - Change:
     - Merge the six "+0.1× per N" generators into three tiered cards (I/II/III).
     - Guarantee at least 1 machine in each shop of 4.
     - Add two rule-changing boosts, e.g. "Sweet spots also add +0.2×" and "Foul balls: 2 per challenge".
   - Impact: builds feel distinct and Power becomes a real constraint.

---

## 4. Bugs found (each reproduced at least twice)

| # | Bug | Repro | Expected / actual | Severity |
|---|---|---|---|---|
| 1 | **HUD shows the cleared challenge's target as NEXT TARGET** | Clear any challenge and look at the CHALLENGE CLEARED card | Expected "NEXT TARGET 0 / 7,000" after C3. Actual "0 / 5,600" (C1: "0 / 1,200" where the next is 2,400). Seen on C1 and C3 clears in two runs (`q04_draft_390.png`, `qB_c03_card_12.png`). | Minor (frequent, looks broken) |
| 2 | **A resumed Closer drops its name and rule** | Reach a Closer start card (C3 or C6), reload, tap CONTINUE | Expected "CLOSER · HOT CORNER" plus the rule text. Actual "INNING 1 · CLOSER · RUN RESUMED / Your machine: …" with no twist explained. Reproduced on C3 and C6 natural saves (`resume_c3.png`, `resume_c6.png`). | Major |
| 3 | **Internal mount key shown to players** | Buy a boost tied to a machine part, Manage → select the machine → SELL | "Express Lane (mgate@gate-l)" on the confirm screen and "@ mgate@gate-l" on the waiting-boosts line (`s390_manage_confirm.png`, `s390_manage_sold.png`; source `ui.ts:723`). | Minor |
| 4 | **Debug instructions visible on the desktop sidebar** | Open `/play/` at 1280×800 | "Press ` for the debug overlay · console: playtest.report()" shown to players (`live_desk.png`, also in the page text in two sessions). | Minor |
| 5 | **Machine footer text clipped** | Free Pick or shop at 390×844 or 360×640 | The bottom line "Machine: …" is cut through the glyphs (`q07_freepick_390.png`, `s360_shop_notip.png`). | Minor |
| 6 | **Sound files duplicated** | `md5sum dist/sounds/*.mp3` | `drivein.mp3` = `rallyend.mp3` and `gate.mp3` = `lane.mp3`, so "unique" cues play the same audio. | Minor |
| 7 | **HUD tap targets under 44 px** | Measure the bounding boxes | Mute and pause 36×28, MANAGE 58×28, detail TAKE/BUY 34 px tall, back buttons 31–35 px. | Minor |

There were no blockers: no errors, no softlocks and no money or score corruption. Double-buy, reroll-until-broke, sell, reload in the shop, reload mid-pitch and rotate all behaved.

---

## 5. Top 10 changes by impact on release readiness

1. **(M) Add a music bed with ducking and a Music slider.** This is the largest perceived-quality gain left.
2. **(S) Retune the skill cliff:** sweet window ±0.35 rad and C5–C7 at 10,000 / 20,000 / 26,000. Target: a σ 50 ms player reaches C6 about half the time.
3. **(S) Fix the resumed Closer card** so it shows the name and rule (bug 2).
4. **(M) Make Called Shot fair:** call only visible parts, name them by place, ignore the Jackpot Lane Gate, and add an aim arrow.
5. **(S) Fix the stale NEXT TARGET** (bug 1), the ID leak (bug 3) and the desktop dev text (bug 4).
6. **(M) Cap per-pitch variance:** a timed Rally and a HOME RUN ramp payout that scales with the target.
7. **(S) Mix pass:** normalize samples, add a compressor, de-duplicate drivein/rallyend and gate/lane, and sample the five remaining synth cues plus a whiff sound.
8. **(M) Card depth:** merge the "+0.1× per N" generators into tiers, guarantee a machine in every shop (none appeared in 19 visits), and add value hints ("≈ +1,200 / challenge").
9. **(S) Phone layout:** 44 px hit boxes, fix the footer clipping, and use the empty ~240 px of height on tall phones.
10. **(S) Copy pass:** PRESS READY / RUN WON / mods / boost(s); add WHIFF readability.

## 6. Verdict

**Ready for a free itch.io release? Yes, as a free "beta / early access" page. No, as a 1.0.**

The build is stable and the screens fit every phone size I tried. Saves survive reloads and interruptions, and the core hit feels good. Nothing I found blocks a player from finishing a run.

What separates it from a polished release:

- **No music.**
- **A steep timing cliff** that stops most real players before the second Closer.
- **A few visible rough edges**: wrong HUD target, resumed Closers without their rule, a raw ID in Manage, and debug text on desktop.

**Minimum list for a 1.0-quality free itch.io release:** items 1, 2, 3 and 5 above, plus the tap-target part of item 9. That's roughly two to four days of work. Items 4, 6 and 7 would lift it from "nice jam game" to "small game people replay".

---

## Follow-up (same day, by the dev agent)

Screenshots: the 12 cited in the bug table and key sections are kept in `docs/screenshots/critic3/`; the other 276 were left out of the repo (about 300 MB).

**Fixed (Nov 25):**
- Bugs 1–7: next target on clear cards, resumed Closer card, place names instead of internal keys, dev hint behind `?debug`, footer clipping, distinct drive-in and gate sounds, 44 px touch targets.
- Copy: READY? / COMPLETE / boosts / "1 boost waiting".
- Called Shot: main-table parts only, place names, gates and spinners no longer settle the call, aim guide from the bat.
- Sound: every file peaks near −1 dBFS, headline stingers are loudest, routine cues kept their level, master-bus compressor.
- WHIFF: bigger white tag with a red outline, plus a dust puff.

**Not taken, by decision:**
- Lowering the C5–C7 targets and capping per-pitch swings: the creator won a full run on Nov 25, and the roadmap rules out tuning from bot runs alone.
- The shop never offering machines: intentional, since machines come from Free Picks.
- Music: it needs a track, and that's the creator's call.

**Open for later:** merging the "+0.1× per N" boosts into tiers, value hints on cards, a one-thumb control option, and using the spare height on tall phones.
