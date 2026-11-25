# Critic fixes, steps 1–3 (Nov 22)

Answers the mobile critic report (`reviews/2026-11-22_mobile-critic-readiness.md`). All on the player route `/build-test/` only; frozen comparison routes and the legacy run are unchanged (golden tests pass). Locked bat physics untouched.

## Step 1: batting skill and early difficulty (`src/core/play-rules.ts`, `src/run/economy.ts`)
- **Whiff lockout:** a swing that touches nothing adds 0.25 s before the next swing, and shows WHIFF. Masher bot (tap every 0.36 s) first-pitch contact: 77% → 43%.
- **Swing buffer:** a tap up to 0.12 s before the bat is ready fires when it's ready (no more eaten taps).
- **Sweet spot:** contact within 0.25 rad of the centred bat angle (≈ ±30 ms of the 280 ms window) pays +250, a brighter crack, a ring, a short freeze and a SWEET SPOT banner. Exit speed is NOT changed (locked physics).
- **Foul ball:** once per challenge, a pitch that drains without touching the bat is a free re-pitch (no strike). Saved with the pitch carry.
- **Targets:** C1–C4 1,200 / 2,400 / 4,500 / 8,000 (was 1,500 / 4,000 / 8,000 / 11,200). C5+ unchanged.

## Step 2: big moments (`src/view/juice.ts`, `JUICE` config)
Home Run, Jackpot, Multiball, Bank, Cleared, Strike, Foul, Game Over, Run Complete and Sweet Spot each get some of: hit-stop, slow-mo, screen shake, a full-table flash, a fast bulb chase in the moment's color, and a big DOM banner (fixed CSS size: readable at any zoom). Every bat contact gets a 40 ms freeze. Clears and strikes play their moment for ~0.7–0.95 s before the card. New synth sounds: swing whoosh, pitch pop, sweet-spot crack, Home Run organ run, clear fanfare, foul, game over, rally-end dings (placeholders until the sample set).

## Step 3: screen and polish
- Board fits the screen on 390×664 / 375×667 / 360×640 (HUD height was under-counted: 92 → 118 px).
- Landscape phone: "Turn your phone" screen; turning sideways or leaving the tab pauses a live pitch.
- Floating text min 14 CSS px, ride tallies min 15 px, whatever the zoom. Slingshots now show their points.
- Aim and Upper Deck tips moved from mid-play toasts to the next card.
- Controls hints only on cards before the first pitch. Pause disabled when no pitch is live.
- Card headings: "INNING 1 · STARTER · 1/15", "CHALLENGE CLEARED"; clear text in sentence case.
- After the C3 clear the HUD keeps 8,000/8,000 (board rebuild waits for CHOOSE REWARD).
- Status strip says RUN COMPLETE / GAME OVER on end cards. Draft preview label stays on screen. Credits version centred.

Screenshots: `docs/screenshots/critic_fixes/`.

## Sound set v1 (Nov 22, Hayden's picks)
Player route plays recorded samples from `public/sounds/` (map and levels in `src/view/sound-set.ts`); the synth stays as fallback and on the frozen routes. No crowd sounds and no booing (Hayden: pinball, not a stadium; don't mock players).
- Bat: built in earshot from a wood crack + leather + soft thump. Swing: whoosh/fast. Bumper: hit/punch. Sling: click/snap. Targets: pen/click. Ramp: swoosh/in. Bank: success/triad. Strike: thump/door.
- Home Run: level_up/chip. Cleared: win/fanfare. Jackpot: cash register cut to its ring. Shop purchase: cha-ching (coins + desk bell).
- Game over: lose/chip (earshot 8-bit lose jingle). Hayden confirmed the full set Nov 22 ("perfect for now").
- Audition board with alternatives: private artifact "Moonshot Sound Board". All renders are ours to use (earshot: CC0/public-domain sources, MIT code).

## Step 4: Night Game neon look + batting boosts (Nov 22)
- **Night Game** theme (`NIGHT_GAME` in `src/view/theme.ts`) is the player-route default: night-teal field, chrome rails with hot-pink trim, cyan/magenta energy, neon-yellow jackpots, pink rail bulbs, magenta buttons, cyan frame.
- New theme option `neon` (strength): always-on glowing rings on bumpers and outlines on slingshots.
- Settings → Look: NIGHT / DAY (Day = Broadcast Classic). `?theme=` still overrides for previews. Other routes unchanged.
- Title attract mode: rail bulbs chase through the theme's neon colors while the title is up. PINBALL logo glows (and a CSS bug that muddied it is fixed).
- Batting boosts (Hayden's idea): **Barrel Up** (shop, $5) every 5 sweet spots +0.1×; **Squared Up** (free pick) +0.2×. The old bumper boost "Sweet Spot" is renamed **Hot Hand**.

## Step 5: results screens + Jackpot (Nov 22)
- **Results grid** on CHALLENGE FAILED and RUN COMPLETE: run total, 15 challenge pips, cleared, best pitch, home runs, sweet spots, peak multiplier, device best, and a NEW BEST badge. Stats ride in the run save; the best is per device (`bp-best`; more challenges cleared wins, then higher total). Code: `src/run/stats.ts`.
- **Jackpot** pays 5% of the challenge target, rounded to 50, never under the old 250 (C4 400, C5 800, …). `PLAY.jackpotShare`. Big Stage ×2 still applies.
- **Rally ×2 unchanged** on purpose (approved in V2.2): wait for the playtest.
- End cards scroll inside the card on short phones.

## Rally ×1.5 (Nov 22, Hayden)
Upper Deck Rally lowered from ×2 to ×1.5 (`DECK_RALLY.factor`), still stacking with the run multiplier, no step-down. The Rally's extra is halved (+100% → +50% on deck hits). All player-facing copy ("RALLY ×1.5", tips, How to Play) reads from the factor.

## Nothing may hide the ball (Nov 23, Hayden: popups cost him strikes)
- Live-play moments (Home Run, Jackpot, Multiball, Bank, Called Shot hit/miss, Driven In, Hot Corner moves) show on the **scoreboard** as a "video board" flash instead of over the table (`at: 'board'` in `JUICE.moments`).
- The big table banner is only for moments with no ball in play: Cleared, Strike, Foul, Game Over, Run Complete (`at: 'table'`).
- Sweet spot has no banner: freeze + ring + "SWEET +N" popup at the bat.
- All table effects and score text now draw **under** the batter and balls.

## Nov 23 follow-up: sound pass 2, mid-pitch save, release cleanup

- **Sound Board 2 picks wired** (20 new samples in `public/sounds`, mapped in `src/view/sound-set.ts`): run complete, called-shot hit/miss, drive-in, stranded, Upper Deck bumpers (punch pitched up), multiplier (rate climbs with the multiplier), multiball, lanes, gates, spinner ticks, ramp checkpoints (a semitone up per step) and full ride, scoop glove-grab, splitter, rally end, hot-corner move, sweet-spot flourish, menu taps and reroll shuffle. Synth stays as fallback on every event.
- **Mid-pitch save** (player route): pause, app switch or closing the page during a live pitch saves that pitch's points; Continue resumes at READY on the next pitch, no strike.
- **Release URL `/play/`**: same game and same save slot as `/build-test/` (kept for old links/icons). Manifest `start_url` is `./play/`.
- **"EARLY ACCESS PLAYTEST" badge removed** from the player route.
- **Vibration** (Settings → Vibration, on by default; shown only where the browser can vibrate, so not on iOS): bat contact, sweet spot, home run, jackpot, called-shot hit, strike, clear, game over. Patterns in `src/core/haptics.ts`.

## Nov 23 (2): full-screen shop, batter stance, no more glove

- **Shop, free pick and Manage are a full-screen popup** (was a bottom drawer). It pops in, cards slide in one after another, and money/Power sit as chips in the header. Reroll/Next stay pinned at the bottom.
- **Minimap previews**: every card has a thumbnail of your actual table with the spot lit. Tap a card for the detail view: a big live minimap with the spot pulsing, the spot choice and Buy. **See it on the table** shrinks the menu to a bar so you can see the real board, with the highlight on it. Manage shows the selected part on the minimap too. Batting boosts (sweet spots) point at the batter's box. Knobs: `MINIMAP` (game.ts), `SHOP_FX` (ui.ts), `--shop-*` CSS variables.
- **Batter faces the plate**: a top-down right-handed hitter in his stance (feet and shoulders toward the pitcher, chest to the plate, bill on the pitch). His torso turns through the swing. Cosmetic only: `BATTER_ART`.
- **The catcher's-mitt bumper is a baseball bumper on /play/** (same spot, same physics; frozen routes keep the mitt). It's called the "Low-left bumper" in cards now.
- Machine summaries group duplicates ("Bonus Bumper ×3").

## Nov 24: Quick Game

- **QUICK GAME** on the title screen: 2 innings (6 challenges), both Closers (C3 Hot Corner, C6 Small Ball) and the Upper Deck, starting with $4. It keeps its own best (`bp-best-quick`), the end card says QUICK BEST and NEW QUICK GAME, and a saved quick run is labelled on the title. Knobs: `QUICK_GAME` in `src/run/economy.ts`. Run length is now per run (`Run.mode`, `Run.lastChallenge`); old saves load as full runs.

## Nov 24 (2): Night Game playfield neon

- Neon tubes (colored glow + white-hot core) on the outer and Upper Deck walls (pink), lane guides and ramp rails (cyan), targets and the jackpot (gold), and scoring and multiplier gates (purple). Baked into the cached table layers, so there's no per-frame cost. Bumpers and slings keep their existing neon rings. Day look unchanged. Colors, width, glow and strength: `NIGHT_GAME.neonKit` (`src/view/theme.ts`); helper `src/view/neon.ts`.
