# Baseball Pinball: prototype 02

A portrait, baseball-themed pinball physics prototype. You slide a batter, time your swings to aim, and keep rallies alive. It's built with TypeScript, Vite, Canvas 2D and planck.js. Every number in it is a starting test value, not balanced.

## Run

```bash
npm ci
npm run dev        # open the printed URL (works on your phone over LAN)
npm test           # 50 rule/swing/physics/mechanism tests
npm run typecheck
npm run build      # → dist/
npm run bot -- 300 50 1 powerhouse   # headless bot: balls, timing error (ms), seed, map
```

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/pages.yml`.

## Maps

The same game at four URL paths. Only the machine layout changes. See `docs/MAPS.md` for the details and measurements.

- `/`: Baseline
- `/1`: Sidewinder (loop ramp with a top gate and a center drop, plus spinner, banks, gate, bonus bumper)
- `/2`: Overpass (aimable bridge gate, drop toward the glove, glove relaunch into the upper cluster)
- `/3`: Turbo (Turbo ramp into the cluster, multiball, twin bonus bumpers, spinners, banks, stacked modifiers)

Layouts are data in `src/machines/presets.ts`. Mechanism types are in `src/machines/mechanisms.ts`.

## Controls

- **Desktop:** A/D or ←/→ to move, Space to swing, Enter for Ready, P or Esc to pause.
- **Phone:** drag with your left thumb anywhere on the left half to move. The drag is relative and never teleports the batter. Tap anywhere on the right half to swing. Both thumbs work at the same time.
- **Sound:** the 🔊 button or M toggles mute.
- **Dev:** press `` ` `` (or add `?debug` to the URL) to show the bat hit envelope, the batting line and the reason a hit was or wasn't eligible. In the console, `tune.*` changes physics live, `playtest.report()` returns session stats and `playtest.download()` exports them.

## How the bat works

The bat is **not** a physics body. A hit is a scripted contact that only exists during the 0.2 s forward swing, which runs from 7 o'clock through 3 o'clock to 11 o'clock. To count, the ball must be moving **down**, be in front of the batting line (the white chalk line at the bottom of the lane), and be inside the bat capsule that's drawn on screen. Each swing can hit once. The ball leaves at a fixed speed, and the direction comes from the bat angle at contact: early pulls left, on time goes up the middle, late pushes right. A resting or recovering bat never touches the ball, so slingshot saves pass straight up through it.

## Layout

```
src/config.ts           every tuning knob (also window.tune)
src/core/rules.ts       ready/live/drain/strike/game-over, score banking
src/core/swing.ts       swing timeline, eligibility, contact envelope, aim mapping
src/core/input.ts       controls + dual-touch regions
src/physics/board.ts    collision geometry (the renderer draws these exact shapes)
src/physics/sim.ts      headless fixed-step simulation (runs in node for tests)
src/view/game.ts        board art, batter, ball, lit machines
src/view/vfx.ts         machine-localized neon effects
src/view/theme.ts       semantic color tokens (one theme: Broadcast Classic)
src/machines/            mechanism types, map presets, power budget
src/view/machines.ts     mechanism art (ramps, scoop, splitter, gate)
src/telemetry/session.ts playtest metrics
tests/                  rules, swing, sim/physics tests
scripts/bot-playtest.ts headless tuning bot
docs/PLAYTEST.md        measured results and next steps
```

To add a theme, add another `Theme` object in `src/view/theme.ts`. Themes change color only. Collision, timing and scoring never read from the theme.

## Not in this build (on purpose)

Innings, challenges, Closers, shop, drafts, upgrades, modifier stacking, automatic power rewards, saves and theme unlocks. Power capacity exists only as data (`validatePreset`).
