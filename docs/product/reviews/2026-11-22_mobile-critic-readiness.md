# Moonshot Pinball: Production Readiness Review (Mobile)

**Build:** v1.0.0 (751b777), route `/baseball-pinball/build-test/`. **Reviewed:** 22 Nov 2026. I'm an independent critic with no stake in this game.

## Scorecard

| Category | Score |
|---|---|
| Polish | **3.3 / 5.0** |
| Simplicity | **2.9 / 5.0** |
| VFX & Sounds | **2.3 / 5.0** |
| **Overall production readiness** | **2.9 / 5.0** |

**Biggest blocker to release:** there's no payoff layer. Home Run, Jackpot, Multiball, Challenge Cleared and Run Complete get 6–11 px floating text and a single synth blip, or nothing. The clear, the Home Run and the victory screen are silent and have no on-table effect.

## How I tested

- **Setup:** Chrome (Playwright) with phone emulation at 390×844 @2x with touch, starting from a fresh profile.
  - Layout was also checked at 375×667, 360×640, 360×740, 390×664 (Safari with toolbars), 414×736, 430×932 and 844×390.
- **Amount of play:** about 47 minutes of real-time play across 21 runs, captured as screenshots, 25 fps video and 60 fps CDP screencast bursts.
- **The bot:**
  - Reads the ball from `sim` with a set reaction delay and predicts where it will land.
  - Moves with synthetic A/D keys and swings with Space.
  - Adds timing and positioning noise to mimic a human.
  - Profiles are in Appendix B.
- **Touch check:** I verified real touch separately with CDP touch events.
  - A right-half tap swings.
  - A left-half drag moves the batter; about 200 px of drag crosses the full range.
  - A tap while the other thumb is dragging also registers.
- **Played genuinely:** Title → C1 → … → C14 in one continuous run.
  - 13 clears, with real drafts and shops; the Upper Deck unlocked naturally after C3.
  - Plus 20 more runs from C1 at different skill levels.
- **Skipped with the dev shortcut:** C2–C3 and C5–C15 in two "peek" sessions, always between pitches.
  - I used these only to see the inning-clear modal, late-run drafts and the RUN COMPLETE screen.
  - `v2dev.grow()` wasn't needed.
- **Dev map `/3/` (not the shipping route):** used only to see Multiball, Target Bank, Spinner and Ramp-Gate effects.
  - These machines do appear in drafts (Multiball Splitter, Target Bank, Lane Spinner), but my drafting heuristic never picked them in real runs.
- **Audio:** I can't hear, so sound is judged from a source audit (Appendix A) of `audio.ts`, `vfx.ts`, `machines.ts`, `game.ts`, `main.ts` and `sim.ts`.
- **Batter timing:** calibrated from `config.ts`.
- Everything else is judged from what's on screen.
- **Caveat:** bots read trajectories perfectly within their reaction delay but never learn, so treat skill-tier results as relative.

---

## 1. Polish: 3.3 / 5.0

**What's good**

- **Art direction is coherent and professional for its scope.**
  - A ballpark-at-dusk cabinet with gold bulb rails, stitched-baseball bumpers, a glove bumper and scoop, the mound, stadium lights and crowd bokeh.
  - One typeface (Barlow Condensed) and one navy-and-gold UI style across the title, menus, overlays and build panel (`01_title.png`, `03_settings.png`, `A_panel_other_manage-next-reroll-take-tipok_0.png`).
- **The front end is complete for a free web game.**
  - How to Play, Settings (sound, Reduced Effects, tips, "Show tips again"), and Credits with licenses and a build ID (`02_help.png`, `03_settings.png`, `04_credits.png`).
  - Pause with a Main Menu option (`11_pause.png`), and autosave with a Continue button that shows a run summary (`14_title_with_save.png`).
  - Manage Machine with selling (`13_manage.png`), and a proper sold-out state in the shop (`B_panel_other_manage-next-reroll_0.png`).
- **Onboarding is well sequenced.**
  - DRAG/TAP zone overlays on the first pitch (`06_pitch_3.png`, `12_se_live.png`).
  - A short tip the first time each new concept appears.
  - Tap-to-preview in the draft, which circles the exact install spots on the table (`A_draft_preview.png`).
- **It's technically clean.**
  - Zero console errors or page errors in about 47 minutes of play.
  - Frames held at 16.7 ms on average during live play (p99 16.8 ms, 0.3% over 25 ms), even in software-rendered headless Chrome.
  - Touch was reliable, including two thumbs at once.
- **The HUD reads well.** SCORE/TARGET has a progress bar, strikes are pips, and the multiplier plaque animates on every gain (`B_ev_mult_0.png`).

**What's not**

- **Milestones cut straight to a card with no beat.**
  - On a clear, one frame shows live play and 250 ms later the dimmed card is up (`frames/clear1_sheet.png`).
  - On a drain, the ball passes the batter and the card appears within about 200 ms (`frames/drain1_sheet.png`).
  - CHALLENGE FAILED and RUN COMPLETE are the same one-sentence card, with no run total, stats, best score or share (`A_gameover.png`, `16_run_complete.png`).
  - Finishing all 15 challenges (about 18–20 minutes of play) earns a single sentence, with $200+ left unspent.
- **The layout overflows on the most common in-browser iPhone viewport.** The cabinet is sized by width only.
  - At 390×664 (Safari with toolbars), 375×667, 414×736 and 360×640 it overflows by 9–13 px at the top and bottom. That clips the HUD plaques and the drain apron (`12_safari_bars_live.png`, `12_se_title.png`).
  - At 390×844 the same layout leaves empty bands of about 60 px above and below.
  - Landscape in a browser tab is broken (`12_landscape_challenge.png`):
    - The cabinet shrinks to 162×258 px.
    - HUD labels wrap ("SCORE / / / TARGET").
    - Mute and pause spill onto the desktop sidebar.
    - There's no rotate prompt. The manifest's portrait lock only applies once the game is installed, and iOS ignores it.
- **Data and copy glitches are visible.**
  - After the C3 clear, the card says "8,000 / 8,000" while the HUD behind it reads 0 / 8,000 and "PRESS READY" (`15_c3_clear_modal.png`).
  - The victory card's status strip still says "PRESS READY" (`16_run_complete.png`).
  - Card headings break awkwardly: "CHALLENGE 2 OF / 15" and "CHALLENGE 1 / CLEARED" (`B_ov_TARGET__1.png`, `07_overlay_2.png`).
  - "Left thumb: drag to move · Right thumb: tap to swing" appears on every card, including Game Over, Pause and Victory.
  - The inning-clear text is an all-caps paragraph.
  - The draft-preview label is cut off at the screen edge (`A_draft_preview.png`).
- **Text on the table is too small for a phone.**
  - Score popups are about 10 CSS px at normal zoom.
  - After the Upper Deck unlocks, the camera zooms out and "HOME RUN! RALLY ×2", "+3000" and "JACKPOT LANE ↑ +400" shrink to about 6–7 px. The Home Run callout overlaps the "UPPER DECK" label (`frames/hr_zoom_2440.png`, `B_live_0637.png`).
- **Coach tips cover the playfield mid-rally.** The "Nice hit! Swing early…" banner covers both top bumpers while the ball is live (`08_ev_bat_0.png`, `19_theme_toxicThunder.png`).
- **It doesn't handle phone interruptions well.**
  - The game doesn't pause itself: coming back from another tab dropped me straight into live play (`17_after_tab_return.png`).
  - Quitting mid-pitch throws that pitch away; the pause card says "Continue restarts this pitch", and late pitches last 60–100 s.
  - A swing tapped during the 0.33 s recovery is thrown away, not queued: two taps 150 ms apart give one swing.
  - There's no vibration option.
- **The shipping URL is `/build-test/`,** which is also the manifest `start_url`.

**Fixes (ranked by impact per effort)**

1. **Fit the cabinet to the viewport (very low effort).**
   - Problem: sizing by width alone clips the HUD and drain on 390×664, 375×667, 414×736 and 360×640, and wastes 60 px bands at 390×844.
   - Change: scale by `min(availW / W, availH / H)`, using `100dvh` minus the safe-area insets, and center the cabinet. Add `@media (orientation: landscape) and (max-height: 500px)` showing a full-screen "Rotate your phone" card that also pauses the game.
   - Impact: nothing is clipped on the most common Safari viewport, and landscape no longer looks broken.
2. **Remove the "unfinished" tells (very low effort).**
   - Wait to rebuild the board for the Upper Deck until CHOOSE REWARD is tapped, so the HUD keeps showing 8,000/8,000.
   - Hide `.hint.touch-only` on clear, fail, pause and victory cards.
   - Shorten card headings to "INNING 1 · RELIEVER · 2/15" and "CHALLENGE 3 CLEARED", and reduce their letter-spacing to about 0.12em so each fits on one line.
   - Show "RUN COMPLETE" or "GAME OVER" in the status strip on end cards.
   - Keep the preview label inside the screen.
   - Impact: removes the glitches a reviewer would screenshot.
3. **Give clears and strikes a beat (low effort).**
   - Clear: freeze physics for 120 ms, run the ball at 0.3× speed for 0.5 s, sweep a gold flash across the scoreboard, and stamp a 40 px "CLEARED!" across the table while the $ reward counts up. Show the card 900 ms after the clear.
   - Drain: pulse a red glow out from the drain and stamp "STRIKE 2" for 600 ms, then show the card.
   - Impact: the two most frequent transitions stop feeling like a crash to a menu.
4. **Make table text readable and keep tips off the playfield (low effort).**
   - Draw popups as screen overlays with a fixed minimum size, whatever the camera zoom: +points at 14 px, +multiplier at 18 px, named callouts at 32–40 px, each on a dark backing plate.
   - Dock coach tips under the status strip, or show them only between pitches; never over the top third of the table during play. Auto-dismiss after 4 s.
   - Impact: every scoring event is legible, including after the Upper Deck zoom-out.
5. **Build real results screens (medium effort).**
   - Show the run total, challenges cleared as 15 pips, best ball, home runs and peak multiplier.
   - Show the final machine as icons, a "NEW BEST" badge saved on the device, and a Web Share button.
   - Put the $0.99 tip button on the victory screen.
   - Impact: players get a goal, a reason to replay, and something to share.
6. **Handle phone interruptions (low effort).**
   - Pause automatically when the page is hidden (`visibilitychange`/`pagehide`), and save the points already banked in the current pitch.
   - Queue a swing tapped within 120 ms of the recovery ending.
   - Add a vibration toggle: `navigator.vibrate(8)` on bat contact and 20 ms on bumpers (Android only).

---

## 2. Simplicity: 2.9 / 5.0

**What's good**

- **You understand it within 10 seconds.**
  - The first pitch always drops straight down the middle onto a batter who's already lined up.
  - From the batter calibration, the bat connects if the swing starts anywhere from about 190 ms early to 80 ms late (a window of roughly 270 ms).
  - Every hit leaves at full speed; timing only sets the direction.
  - The DRAG/TAP overlay and the "pull left / push right" tip after your first hit teach the rest on the spot (`06_pitch_3.png`, `08_ev_bat_0.png`).
- **The build loop is bite-sized.**
  - A free pick of 1 of 3, then a four-card shop with reroll, and a simple Power ⚡ budget.
  - Tap-to-preview answers "where does this go?" (`10_build_first.png`, `A_draft_preview.png`).
- **Runs vary well for a vertical slice.**
  - About 35 distinct cards appeared across my sessions: ramps, a loop, a scoop, gates, a spinner, a multiball splitter, target banks, bumper clusters, and roughly 20 boosts.
  - Offers change every run, and the Upper Deck that unlocks after Inning 1 changes the table mid-run.

**What's not**

- **It needs two thumbs.** There's no one-handed scheme, left-handed swap or assist, so it can't be played one-handed on a commute.
- **Difficulty swings wildly by skill, and the early climb is a wall.**
  - Targets go 1,500 → 4,000 (×2.7) → 8,000, while the first rewards are +0.1× or +50 points.
  - Bot results by skill level:

    | Profile | Result |
    |---|---|
    | Novice proxy (±150 ms timing, 320 ms reaction) | Dead by C3 in 7 of 7 runs. 3 died in C1, two of those within 30 s. Rallies lasted 5–25 s for 100–980 points; C2 needs about 1,333 per pitch and C3 about 2,667. |
    | ±200 ms timing | Dead at C2 within 1:41 in 3 of 4 runs. |
    | ±100 ms timing | Died at C5 at 3:37. |
    | Precise (σ 40 ms) | Cleared 13 challenges in 15 minutes with only 7 drains in the whole run. Late pitches lasted 60–100 s. |

  - A whiffed opening pitch drains in about 1.2 s, and that alone cost novice proxies 1–3 strikes per run.
- **Button-mashing beats timing.**
  - Whiffing costs nothing, and the 0.33 s swing cycle is barely longer than the ~0.27 s contact window.
  - A bot that ignored timing completely and tapped every 0.36 s was never knocked out. It reached C7 at 7 minutes and C4 at a 200 s cap, with zero strikes from untouched pitches.
  - By comparison, 3 of 4 ±200 ms runs were dead at C2. At the 200 s mark the masher was level with the ±100 ms run.
  - The headline skill, "time your swing to aim", is optional, and for mashers the aim is random.
- **One strategy dominates, and one label misleads.**
  - In the precise run, once the Upper Deck existed, Rally ×2 bumper hits produced 58% of all points, and 71–80% in some challenges.
  - The JACKPOT target produced 0.3% of points, because it pays a flat 250.
  - Most boosts are "+100 / ×1.5 on [named bumper]", so builds end up on the same loop.
- **Cards are dense and full of jargon.**
  - For example: "Map 1 loop ramp… Full ride: 8 checkpoints × 1,000 = 8,000 base. Replaces the mid-right factory bumper", and "Every 5 hits on Top-right bumper: +0.2×".
  - Nothing estimates what a card is worth to *you* (`10_build_first.png`).
- **Run length doesn't fit mobile well.**
  - A strong full run takes about 18–20 minutes, while a casual run ends in 1–2 minutes.
  - Quitting mid-pitch loses that pitch.

**Fixes (ranked by impact per effort)**

1. **Stop button-mashing from paying off (very low effort).**
   - Add a 0.25 s penalty after a whiff, so a miss costs 0.58 s before the next swing, and show a small "WHIFF".
   - Reward precision: a hit within ±30 ms of the ideal moment becomes a "SWEET SPOT" with +20% exit speed, +250 points and a brighter crack sound.
   - Impact: timing becomes the skill, aiming becomes deliberate, and mashing falls behind real play.
2. **Soften the opening (very low effort).**
   - Retune C1–C4 to 1,200 / 2,400 / 4,500 / 8,000. Leave C5 onward unchanged so the expert curve stays the same.
   - Add a FOUL BALL rule: once per challenge, a pitch that drains without touching the bat is re-pitched instead of costing a strike.
   - Impact: casual players reach the first shop and the Upper Deck (the hook) in their first session, instead of dying at minute one or two.
3. **Add one-thumb controls (medium effort).**
   - Add Settings → Controls with three choices:
     - Two thumbs (the current default).
     - One thumb: drag anywhere to move; lift off or tap again to swing.
     - Assist: the batter slides toward where the ball will land and the player only taps. A simple trajectory predictor is enough; my test bot used one.
   - Add a left-handed swap as well.
   - Impact: the game becomes playable one-handed and more accessible.
4. **Rebalance so builds differ (medium effort).**
   - Cap Rally ×2 at 12 hits per Home Run, or step it down ×2 → ×1.5 → ×1.25.
   - Make the Jackpot worth 5% of the current target, and arm it by lighting the three star targets ("JACKPOT LIT").
   - Add a one-line estimate to each card, such as "≈ +1,800 this challenge", based on the hit counts per table part the game already tracks.
   - Impact: real choices, a JACKPOT that lives up to its name, and late challenges that are more than looping the Home Run ramp.
5. **Shorten runs for mobile (low effort).**
   - Save progress mid-pitch.
   - Make 4 innings (12 challenges) the default and offer 5 innings as an "Extra Innings" mode.
   - Impact: a full run fits a mobile break.

---

## 3. VFX & Sounds: 2.3 / 5.0

**What's good**

- **Every scoring element has its own local hit effect,** tinted to the theme.
  - Each hit gets a glow, an expanding ring, sparks or fragments, a short light-up on the part, and a score popup.
  - Nice touches:
    - Baseball-stitch rings on bumpers (`08_ev_machine_bumper_0.png`).
    - A cyan comet trail and swing-arc smear on contact (`frames/bat_contact_zoom.png`).
    - Chasing lamps on ramp checkpoints with a running "RIDE +8,000" tally (`B_ev_rampCheckpoint_0.png`).
    - A burst on the multiplier plaque (`B_ev_mult_0.png`).
    - A halo on a ball during Rally ×2.
  - Background motion: the rail bulbs chase, the slings breathe and the lane chevrons ripple.
- **The audio is wired to each event, and two cues show real design thought.**
  - Ramp checkpoints climb a scale and land on a chord at the final one.
  - The multiplier blip rises in pitch as the multiplier grows.

**What's not**

- **It doesn't look like neon arcade pinball.**
  - The default look is daytime turf green, navy and gold. Glows are small (1–2.4 table units) and short (0.07–0.45 s).
  - Nowhere in the game is there:
    - screen shake
    - hit-stop
    - a full-table flash or light show
    - bloom
    - an animated attract mode on the title screen (no pixel changed by more than 30/255 over 2.5 s)
  - A dev-only `?theme=toxicThunder` palette in purple and lime with chrome rails comes much closer to the brief (`19_theme_toxicThunder.png`), but players can't reach it.
- **The big moments are undersold.**
  - HOME RUN, the signature event: a 0.35 s gold glow, 6–7 px text, and no sound of its own (`frames/homerun_sheet.png`, `frames/hr_zoom_2440.png`).
  - JACKPOT: a small glow and "+250" (`B_ev_machine_jackpot_0.png`).
  - MULTIBALL and target-bank completion: about 7 px text (`frames/dev3_multiball_sheet.png`, `frames/dev3_bank_sheet.png`).
  - Challenge cleared, challenge failed and run complete: no effect on the table and no sound.
  - Drain: no visual effect at all.
- **The sound is placeholder quality.**
  - Every cue is 1–5 basic synth tones (sine, triangle, square or saw) with the same 8 ms attack and fade, plus one white-noise burst.
  - There are no recorded samples, no reverb, compression or stereo, and no random pitch variation.
  - There's no music, no crowd and no ballpark organ, in a baseball game.
- **Many events are silent:** swing, pitch, challenge clear, Home Run / Rally start and end, the Rally Fuel charge, ramp rollback, game over, run complete, and all UI (draft, buy, reroll, buttons).
- **Many events share one sound.**
  - Every bumper type uses the same 220→140 Hz blip: factory, glove, bonus clusters, Upper Deck and Rally ×2.
  - The multiball splitter reuses the target ping.
  - Every multiplier source uses the same blip.
- **Slingshots score with no popup,** although they're worth 10 points (100 on the Upper Deck).

**Fixes (ranked by impact per effort)**

1. **Add a "big moment" package for HOME RUN, JACKPOT, MULTIBALL, BANK and CLEARED (low to medium effort).**
   - Freeze the action for 80–120 ms.
   - Shake the screen 4 px for 200 ms (off under Reduced Effects).
   - Flash the whole table, from 25% white to clear over 250 ms.
   - Switch the rail bulbs to a fast chase in the event's color for 1.5 s.
   - Show a 36–48 px banner that pops in, overshoots and holds for 0.8 s.
   - Play a matching stinger: an organ "Charge!" run plus a crowd roar for HOME RUN and CLEARED, and a siren plus drum fill for MULTIBALL.
   - Impact: the signature moments become exciting and worth sharing. The effect building blocks already exist.
2. **Replace the synth set with recorded samples (medium effort).** Use free-licence (CC0) or commissioned samples with 2–3 random pitch variants each, run through a compressor (DynamicsCompressor) and a short 0.4 s room reverb (ConvolverNode):

   | Event | Sound |
   |---|---|
   | Bat | Wood crack plus a 2 kHz click; a crowd "ooh" on long hits |
   | Bumpers | Rubber thwack; leather pop on the glove; brighter on the Upper Deck |
   | Targets | Plastic clack |
   | Slings | Rubber pok |
   | Ramps | A whoosh that sweeps from 400 Hz to 3 kHz |
   | Drain | Low thud plus a crowd groan |

   - Add a crowd backing track at −24 dB that swells as the multiplier rises.
   - Impact: the jump from "phone beeps" to "ballpark arcade", and it fixes every shared sound at once.
3. **Give the silent events sounds (low effort).**
   - Swing: a 90 ms whoosh. Pitch: a "pop" from the mound.
   - Rally: a rising organ run on start, and a ding per 1,000 points on end.
   - Rollback: a falling "wah". Purchases: a cash-register "cha-ching". Buttons: a soft click.
   - Give the splitter and the Upper Deck bumpers their own sounds.
   - Impact: nothing scores or happens in silence.
4. **Make contact feel stronger (low effort).**
   - Freeze for 40 ms on every bat contact (70 ms on a sweet spot), shake 2 px, and expand a white ring from 0.6 to 1.8 units.
   - Change the crack's pitch with timing: brighter when centered, duller when early or late, so the sound teaches aiming.
   - Impact: the core action feels powerful and readable.
5. **Ship a Night Game look (medium effort).**
   - Promote the existing toxicThunder palette, or darken the turf by 35%.
   - Add glowing outlines on bumpers, slings and ramps, plus bloom on hits.
   - Add a title attract mode with a fast rail chase and a demo ball.
   - Impact: delivers the neon-arcade fantasy and gives the title screen energy.

---

## Overall: 2.9 / 5.0

This isn't a straight average. For a free mobile web release I weighted:

- first-session feel and difficulty (Simplicity) at about 40%;
- Polish at about 35%;
- VFX & Sound at about 25%, because in an arcade game the effects and sound are the reward, not decoration.

It lands just under "solid vertical slice":

- the structure, saves, menus and stability are release quality;
- the difficulty curve, the button-mashing problem and the missing payoff are not.

**Biggest blocker:** there's no payoff layer. Home Run, Jackpot, Multiball, Clear and Run Complete get tiny text and placeholder synth sound, or nothing. Even good play feels flat. It also makes the early difficulty wall worse: a casual player who dies at minute two never saw anything worth coming back for.

**Verdict:** Moonshot Pinball has a strong hook in a batter who acts as the flipper, which anyone gets instantly. It's wrapped in a tidy, stable, good-looking roguelite structure. Its menus, saving, draft previews and frame pacing are better than most web releases. But it plays like a well-engineered prototype with the excitement turned down:

- it never celebrates anything;
- it sounds like a 1990s phone;
- its table text is 6–10 px;
- difficulty swings from a 30-second wipe for casual players to a 20-minute cruise for precise ones;
- button-mashing quietly replaces the timing skill it advertises.

None of this needs a redesign. Retuning C1–C4, adding a whiff penalty, a big-moment package and a recorded sound set, and fixing the screen fit would move it to roughly 3.8–4.0. Until then I wouldn't ship it publicly.

---

## Appendix A: what each event shows and plays

Sizes are in table units: the table is 20 units wide and renders at about 17 CSS px per unit at normal zoom. "Popup" is the floating text (0.62 units, about 10 px; about 6–7 px after the Upper Deck zoom-out). Sounds are as synthesized in `audio.ts`.

### A1. Every way to score or raise the score/multiplier

| # | Event (value) | VFX | Sound | Verdict |
|---|---|---|---|---|
| 1 | Bumper: 6 factory incl. Glove (100), 4 Upper Deck (200), Twin/Triple clusters, Rally ×2 hits | Glow ≈2.4× radius (0.28 s) + white core (0.09 s); stitched ring 1.05→2.5× radius (0.38 s) + inner ring; 17 sparks; bumper lights 0.45 s; popup | Square 220→140 Hz, 90 ms | VFX ✔. **One sound shared by every bumper family**, with no Rally layer |
| 2 | Standup/round targets: 2 bulls-eye, 3 card, 3 star (50) | Glow r1.3 (0.22 s) + core; 7 fragments, 6 sparks; lights 0.6 s; popup | Triangle 660 Hz, 70 ms | ✔ / **shared with #13** |
| 3 | JACKPOT target (250) | Same as targets but gold: glow r2.4, 12 fragments; lights 0.9 s; gold popup | 4-note triangle arpeggio C5–E5–G5–C6 | Distinct, but tiny for a "jackpot" |
| 4 | Top lanes ×2 (25) | Glow r1.0 at the rollover; chevrons ripple faster; popup | Sine 988 Hz, 80 ms | ✔ |
| 5 | Slingshots (10; 100 on the Upper Deck; ×2 in Rally) | Glow r1.5 + 8 sparks in the kick direction; lights 0.35 s; **no popup** | Saw 300→520 Hz, 70 ms | ✔ / missing number |
| 6 | Rollover gates, e.g. Jackpot Lane Gate (+400) | Glow r1.3, ring, popup | Sine 880 + 1320 Hz | ✔ |
| 7 | Spinner (points × spins) | Flap spins + popup; no flash | Up to 8 square clicks at 1500 Hz | ✔ (weak VFX) |
| 8 | Target bank complete (1,500–4,000) | Gold hit effect on each bank target + "NAME +N" popup | 4-note square arpeggio E5–G5–B5–E6 | ✔ |
| 9 | Ramp checkpoints (8 × 1,000) | Lamp lights; glow r1.1 (r2.2 on the last); 5 (14) gold sparks; stitched ring on the last; running "+3,000" → "RIDE +8,000" tally, about 8–10 px | Rising note per checkpoint, 2 semitones apart; chord on the last | ✔ best-designed cue |
| 10 | Ramp gate (signature reward) | Glow r2.4 + core, stitched gold ring r2.3, 18 sparks, popup | 4-note rising chime G5–B5–D6–G6 | ✔ |
| 11 | Ramp complete without checkpoints (HOME RUN ramp +3,000) | Ramp lights 0.8 s, glow r1.6, ring, 10 sparks, gold popup | Triangle 440→880 Hz, 250 ms | ✔ |
| 12 | Scoop catch (Glove Scoop) | Glow r1.6 + popup; lights | Sine thump 140→90 Hz + C5/G5 | ✔ |
| 13 | Multiball splitter hit (charging) | Target effect + popup; hatch lamp | **Same 660 Hz ping as targets** | ✔ / shared |
| 14 | Multiball launch | Hatch glow r2.2, stitched ring r2.4, 16 sparks, "MULTIBALL" popup | 5-note saw arpeggio G4–C5–E5–G5–C6 | ✔ but undersized |
| 15 | Multiplier +0.1× from Multiplier Gates | Glow r1.8 + core + ring + 10 sparks + "+0.1×" popup; HUD plaque bump and rays, 0.9 s | Square blip + triangle octave, rising with the total | ✔ / **shared by all multiplier sources** |
| 16 | Multiplier from "every N hits" boosts | Stitched ring + "+0.1×" popup; HUD plaque | Same blip as #15 | ✔ / shared |
| 17 | HOME RUN → Upper Deck Rally ×2 starts | Gold glow r2.2 (0.35 s) + "HOME RUN! RALLY ×2" popup at normal popup size; halo on the ball while active | **None of its own** (only #11's sweep) | ✖ sound, weak VFX |
| 18 | Rally ends (points tally) | "RALLY +N" popup | **None** | ✖ sound |
| 19 | Rally Fuel / Momentum charge (bumper bonus pool) | **None** | **None** | ✖ both |
| 20 | Score on the HUD goes up | 140 ms scale-up to 1.08 + glow | None (fine) | ✔ |

**Tally:** of the 19 real scoring sources (#1–#19):

- 18 have an effect; the Rally charge has none, and slings have no number.
- 11 have a sound of their own, 5 share a sound, and 3 are silent: Home Run / Rally start, Rally end and Rally charge.

### A2. Non-scoring and flow events

| # | Event | VFX | Sound | Verdict |
|---|---|---|---|---|
| 21 | Bat contact (0 points) | Glow r1.3 (0.2 s) + core; ring 0.3→1.3 (0.25 s); 9 sparks; comet trail | Noise burst 60 ms + triangle 180 Hz, 80 ms; **identical for every hit** | ✔ / no feedback on hit quality |
| 22 | Swing / whiff | Swing-arc smear | **None** | ✖ |
| 23 | Pitch | Mound lights 0.4 s | **None** | ✖ |
| 24 | Posts, walls, rails | 4 sparks on posts; nothing on walls | None | No impact sounds |
| 25 | Ramp entry | Glow r1.2 at the mouth | Saw sweep 200→600 Hz, 350 ms | ✔ |
| 26 | Ramp landing | Ring + 8 sparks | Sine thump 110→60 Hz + noise | ✔ |
| 27 | Ramp rollback | Glow r0.8 | **None** | ✖ |
| 28 | Scoop ejects the ball | Core flash, stitched ring, 12 sparks | Saw sweep 260→900 Hz | ✔ |
| 29 | Drain / strike | **Nothing on the table**; card appears within 200 ms | Triangle 220→70 Hz, 500 ms "wah" | ✖ VFX |
| 30 | Challenge cleared | **Nothing on the table**; card within 250 ms; strip says "CLEARED!" | **None** | ✖ both |
| 31 | Challenge failed / run complete | Same generic card | **None** | ✖ both |
| 32 | Draft pick, buy, reroll, buttons | Button states only | **None** | ✖ |
| 33 | Music / ambience | – | **None** | ✖ |

### A3. Under the hood

- **Sound:**
  - Plain Web Audio at a master volume of 0.32.
  - Each cue is 1–5 basic oscillators with an 8 ms attack and fade; one white-noise source has a high-pass filter.
  - Each cue has a minimum repeat gap of 50–300 ms, and at most 10 sounds play at once.
  - No recorded samples, reverb, compression, stereo panning or random pitch variation.
  - Pitch only varies in two places: ramp checkpoints step up by index, and the multiplier blip rises with the total.
- **Visuals:**
  - Canvas 2D: glow sprites, rings, line sparks, spinning fragments, floating text and timed part lighting.
  - No screen shake, freeze frames, camera kick, bloom or full-screen flash.
  - The Reduced Effects setting only scales particle counts and flash size.

---

## Appendix B: Bot runs

Every bot reads the ball after a reaction delay, predicts where it will land and moves there. Positioning noise is the random error in where it stands.

| Profile | Timing error | Reaction | Positioning noise | Runs | Outcome |
|---|---|---|---|---|---|
| Precise | Normal, σ 40 ms | 200 ms | σ 0.3 units | 1 full run (+4 runs of C1 only) | Cleared 13 of 15 by the 15:00 cap; 7 drains in total; 85% of swings connected (267/314). Challenge times 23–111 s; projected full run about 18 min |
| ±100 ms | Uniform ±100 ms | 250 ms | σ 0.5 | 1 | Cleared 4, failed C5 (12,279/15,700) at 3:37; 69% contact |
| ±200 ms | Uniform ±200 ms | 250 ms | σ 0.5 | 4 | Failed C2 three times (0:58, 1:18, 1:41); one still alive at C5 at the 3:20 cap; 58–73% contact |
| Novice proxy | Uniform ±150 ms | 320 ms | σ 0.7 | 7 | Failed C1 three times (0:12, 0:27, ~0:32), C2 once, C3 three times (1:26–1:40, scoring 450–1,530 of 8,000); 41–61% contact |
| Masher | None (taps every 0.36 s) | 250 ms | σ 0.4 | 2 | Never knocked out: C7 at the 7:00 cap (6 cleared) and C4 at the 3:20 cap; zero strikes from untouched pitches |

**Points by source, precise run, all challenges:**

| Source | Share of points |
|---|---|
| Rally ×2 bumper hits | 57.9% |
| Normal bumpers | 13.9% |
| Ramp completions | 12.2% |
| Ramp checkpoints | 7.2% |
| Targets | 3.6% |
| Rally slings | 1.6% |
| Ramp gates | 1.1% |
| Scoop | 1.0% |
| Lanes | 0.6% |
| Slings | 0.5% |
| **Jackpot** | **0.3%** |

## Appendix C: Evidence files

- Screenshots: `/tmp/critic/shots/`, cited by filename above.
- Frame sheets and zooms: `/tmp/critic/frames/`, including `clear1_sheet`, `drain1_sheet`, `bat_contact_zoom`, `homerun_sheet`, `hr_zoom_2440`, `dev3_multiball_sheet` and `dev3_bank_sheet`.
- Full 15-minute run video: `/tmp/critic/video/`.
- Event logs and run logs: `/tmp/critic/ev_B.json`, `/tmp/critic/log_*.txt`, `/tmp/critic/trials.jsonl`.
