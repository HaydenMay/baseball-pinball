# Developer run analytics (v1)

Silent, local recording of every `/build-test/` run. On demand it produces **one self-contained
offline HTML report per run**: a developer tool, not a player feature. It shows facts only, with no
advice, grades or rankings.

## How to use it (phone or desktop)

1. **Turn on the download button.** Open `https://haydenmay.github.io/baseball-pinball/build-test/?devAnalytics=1`.
   Recording always happens on `/build-test/`. The flag only reveals the download button on end screens.
2. **After a loss:** the CHALLENGE FAILED screen shows **Download Developer Report (HTML)** under RESTART
   TEST RUN. Tap it.
   - On iPhone, Safari may open a preview instead of saving. Use **Share → Save to Files**.
   - You can also restart first. The C1 screen of the new run shows **Download previous run report (failed)**.
3. **Interrupted run** (reload, closed tab or navigation): open the flagged URL again. The C1 screen shows
   **Download previous run report (interrupted)**.
   - Every finished pitch and challenge is kept.
   - The ball that was in play is marked `interrupted`, never shown as finished.
   - The game doesn't resume a run after a reload; a new run starts.
4. **A full 27-challenge win** (not reachable yet in practice): the clear screen offers the same download,
   with outcome `completed`.

**Console** (any `/build-test/` page, no flag needed):

| Command | What it does |
| --- | --- |
| `playtest.run()` | The current run record (JSON) |
| `playtest.runs()` | Archived runs (up to 3, newest first) |
| `playtest.lastRun()` | The newest archived run |
| `playtest.downloadHtml()` | Download the current run's report |
| `playtest.downloadHtml('last')` | Download the newest archived run's report |
| `playtest.downloadHtml(1)` | Download archived run #1's report |
| `playtest.report()` / `playtest.download()` | The older per-ball summary, unchanged |

## Privacy and limits

- **Stored in** `localStorage` under `bp.devRun.current` (the run in progress) and `bp.devRun.archive` (the last 3
  finished or interrupted runs). Nothing is sent anywhere: there are no network calls, and the report has a
  `default-src 'none'` CSP.
- **Saved at:** challenge start and end, each strike, draft, purchase and next actions, and page hide. Never
  per frame.
- **If storage fails** (private mode or quota): the game runs normally, the report still works from memory,
  and the report says that storage was unavailable.
- **Bounds:** ledger 4,000 entries, 25 run highlights, 12 pitches per challenge, 3 archived runs. A run with
  no played pitch is never archived.
- **Not recorded, by design:** ball positions, raw touch input, device or user identifiers.
- **Scope:** `/`, `/1`, `/2` and `/3` don't record runs. Their older `playtest.report()` is unchanged.

## What it records (schema `baseball-pinball/dev-run@2`; v1 reports still load)

v2 adds: items with parts (bundles), sales, dormant/reactivated modifiers, offer origin/weight/feasibility, the C15 `completed` outcome.

The full TypeScript types are in `src/telemetry/run-recorder.ts`.

**Run** (`RunRecord`):

| Field | Contents |
| --- | --- |
| `runId` | `<base36 time>-<4 random chars>` |
| `build` | `{ version, commit, builtAt }`. The commit is `GITHUB_SHA` on Pages builds, otherwise `git rev-parse HEAD`, otherwise `unknown`. Tests get `not-injected`. |
| `startedAt` / `endedAt` / `savedAt` | Timestamps |
| `outcome` | `in-progress`, `failed`, `completed` or `interrupted` |
| `activeMs` | Real time with a live, unpaused ball |
| `challenges[]` | One `ChallengeRecord` each (below) |
| `ledger[]` | `{ seq, t, challenge, type, … }`. Types: `challengeStart`, `challengeEnd`, `clearReward`, `powerGrant`, `draftOffers`, `draftTaken` (with declined offers), `shopOffers` (open or reroll), `purchase` (price, money before and after, Power), `reroll`, `install` (id, mount, Power), `modifier` (target, copy number, stack size), `next`, `runEnd` |
| `highlights[]` | The 25 biggest single credited events |
| `money` | Earned, spent, reroll spend, purchases, rerolls |
| `frame` | Frame time: avg, p95, max |
| `notes[]` | Data notes |

**Challenge** (`ChallengeRecord`):

| Field | Contents |
| --- | --- |
| `n`, `inning`, `target`, `outcome`, `score` | Basics |
| `startedAt` / `endedAt`, `activeMs` | Timing |
| `strikesUsed` / `maxStrikes` | Strikes |
| `pitches[]` | One `PitchRecord` each (below) |
| `startBuild` | Snapshot at challenge start |
| `endBuild` | Snapshot at the clear or fail, **before** that clear's reward, draft or shop |
| `reward` | Money from the clear |
| `multPeak` / `multEnd` | Global multiplier |
| `sources` | Keyed `kind:id[:part]`: awards, credited points, base Σ, part-modified Σ, best |
| `mechanisms` | Per instance id: hits, awards, points, base, modified, best, multiplier tenths generated, procs |
| `ramps` | Per ramp: entries, full rides, rollbacks, drop landings, checkpoint hits and points per index, legacy gate, best ride |
| `multGains` | Multiplier gains by source |
| `scoops`, `multiballs` | Catches and relaunches; activations and balls launched |
| `attributed` / `unattributed` | Score reconciliation |
| `bestEvents` | The 5 biggest events |

**Pitch / strike** (`PitchRecord`):

| Field | Contents |
| --- | --- |
| `n`, `outcome` | `drain`, `clear` (target reached during the ball, no strike charged), or `interrupted` |
| `startScore`, `points` | Score at the start and points earned |
| `simSeconds` / `realSeconds` | Ball time in the simulation and in real time |
| `swings`, `batHits`, `swingsMissed` | Swings, contacts, swings with no contact |
| `drainSide` | Which side the ball drained on |
| `extraBallDrains`, `multiballs`, `ballsLaunched`, `maxBalls` | Multiball activity |
| `multStart` / `multEnd` / `multPeak` | Global multiplier during the pitch |
| `bestEvent` | Biggest single event |

## How points are attributed

- The sim has one scoring boundary (`rules.award`). After it banks points, the sim emits an
  **observation-only** `score` event: `{ kind, id, base, modified, multTenths, awarded, part? }`.
  - `awarded` is the measured change in the scoreboard, so attributed points always reconcile with the
    score. Points awarded after a clear aren't banked, so they aren't counted.
  - Points are never awarded twice. A test plays the same seeded game with and without the recorder and
    checks that the score and event stream are identical.
- **Ramp checkpoints:** `part: "cp0" … "cp7"`. They roll up into their ramp instance, Turbo and Overpass
  are kept separate, and each installed instance is `type@mount`.
- **Global multiplier gains** come from `mult` events. They are never counted as points.
- **Base Σ and part-modified Σ** come straight from the award call: the part's configured base, and the
  value after its own +/× modifiers, before the global multiplier.

## Metrics that aren't available or are limited

- **Ramp attempts** that never reached a mouth can't be observed. Entries, rides and rollbacks are exact.
- **"Swings without contact"** means no bat contact during that swing. It says nothing about shot
  quality.
- **Hits** come from `machine` events: bumpers, targets, slings, lanes, rails and posts. Spinners, ramps,
  scoops and the bat only report scoring, so their Hits show `n/a` and their awards are counted instead.
- **Bank completions** appear as `bank:*` scoring sources.
- **Splitter charge progress** isn't evented. Activations and balls launched are recorded.
- **Drain reason:** the side is recorded. A physical cause isn't inferred.
- **Wall time** for a run includes menus. Active play is tracked separately.
- **Frame time** is browser-reported and isn't a device thermal measurement.

## Files

| File | Role |
| --- | --- |
| `src/telemetry/run-recorder.ts` | Recorder, types and persistence |
| `src/telemetry/report-html.ts` | Offline report: escaping, safe JSON embed, sortable tables, SVG chart |
| `src/telemetry/build-info.ts` and `vite.config.ts` | Build identifier |
| `src/telemetry/session.ts` | The existing `Telemetry` now owns and feeds the recorder |
| `src/physics/sim.ts` | The observation-only `score` event (no scoring change) |
| `src/run/ui.ts` | Lifecycle hooks: start, clear (pre-reward), fail, draft, shop, reroll, next |
| `src/main.ts` | Storage wrapper, dev button, console helpers, `pagehide` save |
| `tests/analytics.test.ts` | 14 tests |
| `docs/samples/dev-run-report-SYNTHETIC-bot.html` | **Synthetic** sample report, played by the headless bot (`BOT_REPORT=path npm run bot:run -- 1 40 4 12`), clearly labeled. It is not a human playtest. |
