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
