# Baseball Pinball — Prototype-to-Product Roadmap

> **Document:** Production roadmap, missing-work inventory, decision register, and release-quality gates. This is **not** a command to implement all work at once.
>
> **Date:** November 21, 2026  
> **Status:** Preproduction for a complete first release; work packages are proposed until individually approved.  
> **Audited repository:** `HaydenMay/baseball-pinball`, `main` at commit `5493966a86a8595065dad4801d4e9397bce23e4c`. Re-audit at milestone start.  
> **Planned channel:** Browser game on itch.io. The creator has a separate itch launch strategy: this document covers **finishing the game and technical release readiness**, not marketing/pricing.
>
> **Status keys:** **DECIDED** = approved design direction; **IMPLEMENTED** = observed in repository, not necessarily product-ready; **PROPOSED** = recommended but not selected; **OPEN** = requires a decision; **DEFERRED** = excluded by default from 1.0; **BLOCKER** = must be resolved before shipping.

---

## 1. Product vision and design boundaries

**Baseball Pinball** is a portrait-first, arcade pinball roguelite: position a batter, time swings, launch baseballs around a growing table, and build a ridiculous scoring machine through drafted hardware, purchased modifiers, placement decisions, and cascading effects. A complete run is **five innings, each with Starter, Reliever, and Closer**: 15 challenges. The product should be beautiful, understandable, tactile, replayable, and finished — not a collection of test routes.

**The hook is already considered strong enough to build around.** Do not treat this roadmap as permission to reinvent the bat, change the genre, or bury the game under new systems. The largest remaining product pillars are (1) a major graphics/art/VFX pass, (2) **five real boss/Closer encounters**, (3) premium shop/draft/upgrade/machine-management UX, and (4) title/onboarding/endgame, saved runs, audio, accessibility, performance, QA, and browser packaging.

### Core invariants — protect these in every work package

1. **Batting is skill-based.** Left-thumb relative drag moves the batter, right-thumb tap swings, and contact timing controls trajectory; desktop controls also work. Preserve the existing feel and hit envelope. No hidden random batting inaccuracy.
2. **The physics should remain fun.** More varied ball movement, surprising ricochets, powerful ramp rides, big scores, and occasional bumper farms are intentional. No reflexive score caps or blanket nerfs just because an animation gets wild.
3. **The machine matters.** Physical parts occupy mounts/Power; modifiers have THIS/ALL/cross-family targeting; sales free Power and preserve existing dormant modifiers. Keep stacking and global multiplier arithmetic correct.
4. **Do not break V2 camera rules.** Fixed anchor at batter's hands. It may **zoom out** to keep all live balls visible; it **never pans or follows a ball**, never zooms closer than original 100%, and returns to 100% before a returning ball reaches the bat zone. Touch movement remains consistent under zoom.
5. **Protect the Upper Deck.** V2.2 includes a four-bumper diamond, two side slings, a free Home Run Ramp that awards **3,000 base points**, and ball-specific **×2 Home Run Rally** on upper-deck bumper/sling scoring until return downstairs. No separate gated checkpoints are needed on Home Run.
6. **Maintain seeded reproducibility.** Keep physics/scoring deterministic for tests; presentation-only randomness must not consume the gameplay RNG or change difficulty unexpectedly.
7. **Mobile portrait is primary.** No unwanted scrolling during live play. Desktop and itch embedding must remain usable.
8. **No massive blind rebuild.** Ship small vertical slices with real screenshot/video inspection, deterministic tests, meaningful notes, and creator review. Source files, editable assets, and references must be preserved.

### Intended 1.0 boundaries

**In:** One complete five-inning run mode; 5 Closer bosses; finished table/cabinet/ball/batter/mechanism art; premium draft/shop/upgrade UX; all current core systems and V2 upper deck; title/pause/help/settings; first-time teaching; victory/failure experience; reliable save/continue; audio polish; QA and an itch-playable browser build.

**Not automatically in:** Multiplayer, accounts, cloud saves, achievements with a live service, paid cosmetics, global leaderboards, a full 3D rewrite, a new engine, sprawling permanent upgrade trees, many new mechanisms, daily challenge mode, or unrelated expansions. **Do not add permanent meta progression** without an explicit design discussion. A separate additional chamber after C9 is a historical design intention and **must be resolved**, not silently cut or silently built.

### What “finished” means

A stranger can open the actual game, learn the movement/swing, understand targets/strikes, build a machine through the draft and shop, know what an upgrade will do, encounter five distinctive Closers, finish or fail a complete run, safely resume later, see a satisfying result, and start another run — without developer tools, instructions from the creator, data loss, unreadable screens, or hardlocked progression.

---

## 2. Audit of the present prototype

This inventory is grounded in the source of `src/main.ts`, `src/core/rules.ts`, `src/run/run.ts`, `src/run/ui.ts`, `src/run/catalog.ts`, `src/run/weights.ts`, `src/physics/sim.ts`, `src/physics/board.ts`, `src/machines/sections.ts`, `src/view/game.ts`, `src/view/audio.ts`, `src/view/theme.ts`, `src/view/vfx.ts`, `docs/V2_2_UPPER_DECK_RALLY.md`, and the repository's tests/documentation at audit time.

| Area | Verified state | Product gap |
|---|---|---|
| Framework | **IMPLEMENTED:** TypeScript + Vite + Canvas 2D + planck.js, fixed-step simulation, GitHub Pages build | Retain by default; run graphics-performance spike before selecting new renderer |
| Bat and input | **IMPLEMENTED:** timing-driven swing, relative touch drag, desktop controls | Preserve with regression and device tests, improve animation without moving actual hit window |
| Run | **IMPLEMENTED:** 5 innings × 3 challenge roles; target growth and three strikes | Full player-facing navigation, progression clarity, game-end polish |
| Closers | **IMPLEMENTED label only:** C3/C6/C9/C12/C15 are called Closers | **BLOCKER:** unique boss mechanics and presentation |
| Roguelite systems | **IMPLEMENTED:** free 1-of-3 draft, 4-slot shop, increasing-price rerolls, Power, installation sites, machine selling, dormant modifiers | Strongly improved readable UI, onboarding and playtesting |
| Physical parts | **IMPLEMENTED:** ramp variants, bumpers/bundles, gates, glove scoop, spinners, targets/banks, multiball splitter and more | Cohesive final art/animation, mechanism readability, viable builds |
| V2 | **IMPLEMENTED, test-gated:** `/build-test/?v2=1` unlocks Upper Deck after C3; Home Run and upper mounts | Integrate into actual product route; don't require query flags to play |
| V2.2 | **IMPLEMENTED:** four deck bumpers in diamond, two side slings, 3k completion, ball-specific Rally ×2; dev telemetry/tests | Art polish, human pacing validation and production integration |
| Right-side bumper pocket | **INVESTIGATED:** finite rapid 20–29-hit bursts in seeded probe; no observed stalls | Monitor, do not automatically nerf |
| Camera | **IMPLEMENTED:** anchored zoom-out, zoom in for bat zone, multiball framing | Guard against visual/layout regression |
| Art | **IMPLEMENTED baseline:** Canvas cabinet and table, glow/particles and themes | Major art direction, refined lighting/materials, animation and UI overhaul |
| Themes | **IMPLEMENTED:** Broadcast Classic and Toxic Thunder code; latter available as developer preview | Decide if themes are a user-facing feature; do not build skins by accident |
| Audio | **IMPLEMENTED baseline:** synthesized WebAudio sound set, mute setting | SFX review/variation/mix, settings, possible original music |
| UX | **IMPLEMENTED baseline:** ready/pause/clear/fail/win overlays, draft/shop/manage DOM screens | Product title, polished flows, help, accessibility, faster interactions |
| Saves | **NOT VERIFIED AS PLAYER FEATURE:** developer analytics saved locally; no complete game run save/resume | **BLOCKER:** versioned run persistence and safe interruption behavior |
| QA | **IMPLEMENTED:** automated unit/physics tests, bot-run, diagnostics, downloadable dev report | Complete release matrix, boss/save/UI tests, real-device visual review |
| Product route | `/` and `/1`–`/3` are legacy examples; `/build-test/` hosts roguelite; V2 gated | **BLOCKER:** clean default launch path and tested itch packaging |
| Docs | `README.md` calls it prototype and has stale “not in this build” descriptions; `index.html` contains prototype labels; `package.json` version 1.0.0 but prototype description | Update public metadata when genuinely release-ready; package version does not prove product completeness |

**Important historical discrepancy:** `docs/V2_EXPANDABLE_MACHINE_PLAYTEST.md` mentions **Side Chamber after C9** in the original intended design. Current V2.2 evidence supports only the Upper Deck. Decision **D-07** must resolve whether the Side Chamber is in the first release or intentionally deferred.

**Source of truth:** creator-approved decisions > revised and approved product docs > current source/test behavior > earlier prototype handoffs > unapproved AI proposals. Log conflicts rather than quietly overwriting history.

---

## 3. Milestone strategy and dependency graph

**Recommendation:** Don't fully finish all graphics before designing bosses; that would require redoing art and UI. Instead: approve the visual and UX direction, build **one complete first-inning vertical slice** containing a polished shop and one finished Closer, validate it, then scale to the remaining four innings.

| Milestone | Deliverable | Pass/fail checkpoint |
|---|---|---|
| **M0. Blueprint** | Owner-approved product scope, decision ledger, confirmed feature baseline | No unresolved architectural surprises that would invalidate the planned art/UX work |
| **M1. Visual and UX preproduction** | 3 visual directions, 3 shop layouts, asset pipeline spike, selected look, style guide | Creator chooses direction; actual phone-scale motion capture looks meaningfully better |
| **M2. Finished first-inning vertical slice** | Refined field/bat/machines, working polished store, first playable Closer, short audio pass | New player understands the full first-inning loop unaided |
| **M3. Full gameplay content and visuals** | All five Closer rules, complete table/upper-deck/machine art, progression polish | Every inning feels distinct; no missing boss; visual quality consistent |
| **M4. Complete player experience** | Title/help/tutorial, shop/management refinements, save/resume, settings, audio, win/fail/recap | No developer explanation needed, safe reload and restart |
| **M5. Balance, performance and QA** | Fair build families, difficulty curve, accessibility, real mobile performance, crash tests | Tested 15-challenge runs, no critical broken inputs, stalled balls or save loss |
| **M6. Release candidate** | Single production entry, itch-compatible build, clean docs/credits/licenses, release tests | Creator plays packaged release end-to-end and signs off |

Work can overlap at appropriate interfaces, but do not treat a visual mock as a functioning screen or skip validation gates.

**Standard milestone handoff:** exact goal; chosen design references; files likely touched; invariants; tasks grouped into reviewable changes; deterministic tests; visual before/after screenshots and motion capture; performance observations; unresolved issues; short decision log. Never launch a long agent run with only “make it premium.”

---

## 4. M0 — Product blueprint and design freeze

**Objective:** Lock the boundaries that affect everything else before producing expensive final assets.

### M0.1 Product brief

- [ ] Write a compact target-player statement: approachable baseball/pinball arcade vs deeper roguelite builders; identify the desired overlap.
- [ ] Confirm intended session length and challenge pacing through existing human playtests rather than a guessed time target.
- [ ] Set first-run difficulty intent and how hard winning all five innings should be.
- [ ] Define the emotional rhythm: skillful hits → surprising scoring → reward selection → stronger machine → Closer tension → larger spectacle → final championship.
- [ ] Confirm whether any persistent achievement/stat/cosmetic progress is wanted; do not assume permanent stat upgrades.
- [ ] Confirm playable platform requirements: mobile portrait, desktop keyboard, and browser embed.
- [ ] Record names/terms for Run, Inning, Starter, Reliever, Closer, strike, draft, shop, Power, multiplier and Rally consistently.

### M0.2 Rules/system inventory

- [ ] List all machine and modifier keys, family, price, Power, target, stacking, acquisition conditions and sell behavior from `src/run/catalog.ts` and `src/run/run.ts`.
- [ ] Map each mount and installed footprint, conflicts and preview rendering.
- [ ] Document which rewards alter points, which alter global multiplier, and which move the ball; show clear calculation order.
- [ ] Reconcile all current prototype gameplay assumptions with latest tests and user decisions.
- [ ] Preserve one stable playback baseline and seeded physics diagnostics for every essential mechanical family.
- [ ] Set the intended policy for V2 route promotion, legacy demos, Side Chamber, saves and boss support.

### M0.3 Engineering constraints

- [ ] Preserve existing TypeScript/Vite/planck.js unless a **small rendering spike** reveals a concrete blocker. No default rewrite in Unity or runtime Three.js.
- [ ] Determine whether final art uses procedural Canvas shapes, sprite overlays, prerendered 3D-to-sprites, or a mix.
- [ ] Define safe save boundaries before building all bosses, so boss state is serializable.
- [ ] Define the public URL, dev URLs and fallback routing plan.
- [ ] Establish a device and performance baseline before improving graphics.

**Exit:** Approved product brief, open-decision owners, no stealth features, baseline screenshot/motion sample and reproducible test results.

---

## 5. M1 — Major graphics upgrade and art-direction selection

**This is one of the highest-priority product pillars.** The game needs a recognizable visual identity across playfield, cabinet, machine hardware, menus and bosses, not just a new background or extra sparks.

### M1.1 Compare creative directions BEFORE building

Make **one numbered contact sheet** showing the same game composition in three visibly different treatments:

1. **Broadcast Arcade:** physical stadium lights, scoreboards, broadcast graphics, polished baseballs, illuminated machine metal, sports-card interface.
2. **Premium Miniature Pinball:** tangible cabinet toy, dimensional plastics, rounded metal and ramps, careful shadows, colorful mechanical bounce and visible materials.
3. **Stylized Neon Stadium:** dramatic electronic lanes, heightened colors, glowing mechanisms, big but readable score spectacle.

These are **PROPOSED** options, not approved concepts. Compare them for recognizability, readability at 390×844, cost of asset production, Canvas compatibility, effect performance, boss identity and shop consistency. User selects one (or explicitly selected components of a blend) before costly implementation.

**Required samples:** normal camera, upper deck zoomed out, multiball, score burst, shop card, first Closer reveal. A static beauty image is not enough; show a short real gameplay motion benchmark after the choice.

### M1.2 Style bible (future artifact)

Write `docs/art/ART_DIRECTION.md` after selection:
- Approved palette (gameplay material colors vs team/baseball colors vs theme accents).
- Lighting direction, dimensionality, edge detail, drop shadows, texture realism, material roughness and glows.
- Camera/perspective convention; anchor and sprite pivots aligned to planck colliders.
- Fonts for title, scores, body, labels, digits, card data and warning states; rights/licenses and fallback.
- Consistent visual identities for each machine family and what “active, dormant, charging, hit, selected, blocked, installable” looks like.
- Ball visibility and batting visibility priority; never hide a fast ball behind screen effects.
- Feedback duration/animation rules, screen flash limits, reduced motion, score-number clutter thresholds.
- Phone vs desktop scaling; zoomed-out legibility and safe-area handling.
- Themes policy: alternative palettes should be cosmetic and not alter physics or readable information.

### M1.3 Art-production pipeline **[OPEN choice]**

**Default recommendation: 2D/2.5D Canvas production.** Use editable SVG/layered raster source and optimized runtime PNG/WebP/spritesheets. Combine with Canvas collider-accurate rails, shadows, illumination and VFX. This preserves the existing tested engine and is probably faster than moving physics/interaction to a 3D stack.

**Optional Blender use:** if a few important visual elements (batter, glove, shiny ramp, boss portrait) benefit from dimensional modeling, create them in Blender and render 2D frames. First prepare reference images; retain `.blend` source, named objects/pivots/cameras/materials, animation actions and sprite exports. **Do not require modeled 3D characters or a Unity workflow without proving that the selected art style needs them.** If 3D work is approved, check relevant Mr. Mak production/visual review and Scenario Blender expert workflows before implementation.

**Every art asset must retain:** meaningful source name, editable source location, export location, resolution/scale, origin/pivot/anchor, collider correspondence, rendering layer, animation states, theme variants if needed, license/provenance, and a screenshot demonstrating correct in-game use.

### M1.4 Asset manifest — the missing art that needs planning and creation

**Table and cabinet**
- [ ] Final logo/title icon, game/favicon, clean in-game product branding.
- [ ] Cabinet surround, scoreboard hardware and displays, polished rails, posts, corner pieces, ramps, drain and lane geometry.
- [ ] Baseball field material: turf, chalk, dirt, stadium details, floodlights, crowd and boundaries. Decoration may not obscure gameplay.
- [ ] Ball (seams, shading, contact, trail, motion), bat, batter (clear silhouettes and existing swing), glove/scoop.
- [ ] Normal vs dimmed/lit states, highlights, shadows, material specularity, score popup typography.
- [ ] Collision-accurate visual variants for both flat field and raised/ramp surfaces.

**Machines and mechanisms**
- [ ] Regular and bonus bumpers; twin bundle; triangular triple cluster; deck diamond; per-hit effects.
- [ ] Turbo, Overpass, Long Loop, Home Run paths, mouth labels, barriers and completion cues; respect over/under rendering.
- [ ] Glove catch/relaunch animations; ball-held state.
- [ ] Slings, spinner, multiplier/paired gates, banks, lane switches, jackpot, splitter/multiball, targets and special mounts.
- [ ] Machine placement preview/ghost, install highlight, occupied/blocked mount visual and dormant modifier cue.
- [ ] Upper Deck structure, return gaps, four-bumper diamond, two side slings, deck upgrade mounts, pulsing Rally ball identifier.
- [ ] Side Chamber assets **only if D-07 approves it for 1.0**.

**UI and boss presentation**
- [ ] Shop/draft card frames, machine family icons, scope icons (THIS/ALL/cross), Power and money, add/× effects, targets and disabled/conflict states.
- [ ] Machine management/sale confirmation illustrations and layout.
- [ ] Challenge/inning interstitials, five Boss title cards, rule-state icons, victory/loss graphics and final results.
- [ ] Home Run Rally label, big-score treatment, multiplier excitement, skip transitions and optional subtle crowd animation.
- [ ] Help/control diagrams, settings, pause, continue, new run, credits and accessible control states.

**Do not generate the entire asset pack before selecting the approved style.** Use numbered concepts, final production references, a reusable asset manifest and focused batches.

### M1.5 Graphics engineering spike / visual QA

- [ ] Render the same bat, ball, one bumper, one ramp, one shop card and one upper-deck sequence in the chosen pipeline.
- [ ] Verify geometry lines up with `src/physics/board.ts` and `src/machines/sections.ts` rather than visually inventing a different machine.
- [ ] Show phone screenshots at 100% view and min zoom, plus a 10–20-second motion capture.
- [ ] Test one muted/low-effects state and one dense visual state.
- [ ] Capture frame times and rendering/asset budget on a real phone; remove costly decoration before physics accuracy.
- [ ] Inspect ball visibility behind ramps, bounce VFX, score text, widgets and UI overlays.

**Exit:** Approved look, asset pipeline, style guide, mobile motion benchmark and source-asset conventions.

---

## 6. M2 — Premium first-inning vertical slice

**Objective:** Finish a representative complete experience, not disconnected screens: new game → Starter → free draft → shop → Reliever → shop → first real Closer → result.

### M2.1 Final gameplay interface benchmark

- [ ] Show inning, challenge role, score, target, strikes, multiplier and relevant boss rule at a glance.
- [ ] Score celebration is satisfying but does not obscure balls and bat.
- [ ] Home Run Rally, active global multiplier and temporary boss rules have distinct labels and visually legible states.
- [ ] Preserve responsive input under VFX, overlays and zoom; live play never scrolls.
- [ ] Deliberate short transitions (repeat players can advance promptly); no forced long animation between 15 challenges.

### M2.2 First boss vertical slice

- [ ] Choose the **exact Closer 1 mechanic** from a brief before code work.
- [ ] Show a boss intro including name, one-line rule, counterplay/hint and severity.
- [ ] Implement a reusable rules hook separate from art/audio, with one authoritative score/phase computation.
- [ ] Display a persistent boss-condition indicator during play.
- [ ] Make the effect visible/audible when it triggers, and the result understandable on clear/failure.
- [ ] Test with starter machine, ramp build, bumper build, glove/gate build and multiball.
- [ ] Prove the rule doesn't require a rare machine or silently change bat physics.

### M2.3 First store/draft implementation

- [ ] Use actual catalog entries (long name, Power-heavy machine, THIS modifier, ALL modifier, unavailable placement) when testing layouts.
- [ ] Show clear selected card, description, mechanical family, cost, Power, target scope, installed location and future stacking effect.
- [ ] Make purchase/reveal/install/confirmation responsive and legible by touch; don't rely on hover.
- [ ] Show the live table for placement preview and an actual reason a machine can't fit.
- [ ] Manage existing machine: Power freed, refund, dormant modifiers, confirm/cancel, back to original shop state.
- [ ] Clear consistent next-challenge exit and feedback after buying/re-rolling.
- [ ] Ensure CSS/DOM changes do not alter shop offer, economy and rule behavior in `src/run/run.ts`/`src/run/catalog.ts`.

### M2.4 Small audio+motion proof

- [ ] Bat swing/contact, bumper hit, ramp finish, Rally, multiplier gain, shop purchase, first boss intro and win.
- [ ] Effects remain synchronized to actual events and sound remains readable during many simultaneous hits.
- [ ] Show full inning captured on a phone, not merely static screens.

**Exit:** New player can complete the first inning, explain the first Closer rule, select a useful upgrade and navigate the store without hand-holding. The slice becomes the production quality reference.

---

## 7. M3 — Real bosses: five Closers, not just larger targets

**Critical missing game content.** All five Closers need distinctive, baseball-flavored identities and a clearly telegraphed gameplay rule. A boss should change strategy, not turn the project into an unrelated combat game.

### M3.1 Boss design principles — must be approved

- Favor clear, surprising **conditional twists** (similar in high-level spirit to roguelite boss blinds), not completely new control schemes.
- Do **not** suddenly randomize swing aim, increase gravity invisibly, or disable the player's only effective machine without meaningful counterplay.
- The player should know the rule *before* committing the first pitch. In-play status should explain progress/penalties.
- Every boss must be possible with viable ramp, bumper, glove, gate or mixed builds; avoid rare-upgrade requirements.
- A boss can demand adaptation, but the same physical machine should remain understandable.
- Keep deterministic data definitions, headless tests, multiball compatibility, score reconciliation and save/resume support.
- **Recommended initial approach:** one fixed, recognizable Closer per inning. Random boss pools/variants only if later evidence supports extra replay value.

### M3.2 Five boss design slots (ideas are PROPOSED, not approved mechanics)

| Encounter | Desired pacing and challenge | Mechanic design to explore, not adopt silently | Required presentation |
|---|---|---|---|
| **Inning 1 / C3** | Teach the idea of a boss without devastating a new player | Mild, obvious condition rewarding awareness of a second scoring source, or a generous bonus objective | Short intro, one clear status badge, modest spectacle |
| **Inning 2 / C6** | First significant adaptation | Alternating hot scoring lanes, visible temporary bonus/penalty windows or another readable field rule | Baseball broadcast state changes, simple animation, sound cue |
| **Inning 3 / C9** | Test a developed machine | A two-step goal or mixed-source requirement with alternate viable paths; tie to expansion only if planned | Strong identity, midseason drama, possible chamber presentation |
| **Inning 4 / C12** | Championship pressure | Strategic risk/reward based on scoring pattern or timing; counterplay must not require lucky shop offers | Dramatic state display, pressure sounds, unmistakable trigger |
| **Inning 5 / C15** | Final climax | A clear staged rule with impressive but readable escalation; avoid wiping already-earned points | Unique hero art, final inning stadium treatment, victory celebration |

**Do not make these examples canonical until owner approves the boss briefs.**

### M3.3 One-page brief required for EACH of five bosses

Create future `docs/product/bosses/BOSS_01.md` through `BOSS_05.md`, or one cohesive source document if that better avoids duplication:
1. Name, physical/baseball personality, intended experience and uniqueness.
2. Exact triggering rules, score modification calculation order, objective progress and failure condition.
3. Visible UI/copy before and during encounter.
4. What a starter machine can do; what specialized builds can do; accessible counterplay.
5. Interaction with bought checkpoint ramps, free Home Run Rally, group modifiers, global multiplier, strikes, multiball and shop progression.
6. What persists to a save; what resets on a new pitch or challenge.
7. Tuning values, bounded special effects, deterministic seeds and telemetry.
8. Art list: boss crest/portrait or stylized mascot, stage lighting, intro animation, hit cue, HUD icon, victory/defeat response; **not necessarily a modeled 3D character**.
9. SFX cues, text, localization/wording needs.
10. Test plan: duplicate events, exact-threshold clear, 0/one/many balls, balance across families, impossible/softlock cases, camera and performance.
11. Decision state and creator approval.

### M3.4 Technical implementation guidance

- [ ] Introduce a small data-driven boss definition/state module under `src/run/` (file/module layout chosen after design review).
- [ ] Keep boss state changes in one authoritative system; physics feeds events, UI observes state, VFX/audio render it.
- [ ] Keep all score modifications ordered and reconciled with `src/core/rules.ts` and `src/telemetry/run-recorder.ts`.
- [ ] Ensure clear-on-score threshold fires once and strike handling doesn't double-trigger rules.
- [ ] Serialize sufficient boss state for the approved resume policy.
- [ ] Add tests for each boss with multiple build types, early exit, multiball, Home Run, modifier interaction and restart.
- [ ] Build five distinct presentation packages without five unrelated UI code paths.

**Exit:** All 15 challenges playable end-to-end, each Closer uniquely recognisable and fair, boss analytics/tests green, no generic third-challenge placeholder.

---

## 8. M3 continued — Complete the visual transformation

Once the chosen M1 art system and M2 vertical slice are approved, scale **only that direction**:

- [ ] All mechanism types, mounts, ramps, slings, shop icons and machine previews art-complete.
- [ ] Upper Deck is a clear second level with visible diamond interactions, slings, return paths and Home Run Rally.
- [ ] Updated ball/bat materials still convey timing and direction clearly.
- [ ] Cabinet, scoreboard, stage lighting, crowd, texture and final HUD consistently use the style bible.
- [ ] Five boss identities read instantly in their portraits/badges/announcements.
- [ ] Final animations for: strike, big score, jackpot, multiplier gain, ramp completion, Rally start/end, draft/upgrade purchase, boss rule trigger and championship.
- [ ] VFX density optimized for multiball and high-score chains; **cap decoration, not points**.
- [ ] Test 100% view and zoomed-out view with ordinary and dense build layouts.
- [ ] Save editable source assets, pivot/anchor docs and source-to-export paths.

**Optional 3D/model work queue (conditional):** If M1 selects Blender-to-sprite art for batter, glove, boss portraits or cabinet hardware, first generate/approve multi-angle concept references, then create clean segmented meshes, consistent origin, material names and named poses, inspect rendered sprite output at final phone scale, preserve source `.blend` files and exported sprites. Do not create large rigged models merely for a static icon.

---

## 9. M4 — Redesign store, draft, upgrades and machine management

These systems already carry deep roguelite strategy. The visual overhaul must **improve the ability to understand choices**, not decorate unclear mechanics.

### M4.1 Explore three layout directions in ONE comparison sheet

- **Baseball-card draft:** collectible-looking cards and clean scouting-report details.
- **Parts-counter shop:** hardware laid out as tangible pieces with prices/Power.
- **Strategy workbench:** compact, information-rich overview for frequent shop stops.

Use the **same four real offers** in each to compare legibility, long text, available mounts, Power, details, button reach and scrolling. Pick one system; apply it consistently to draft/shop/manage. Do not build three full functional stores.

### M4.2 Exact UI contract for an offer

Each selectable item should show:
- Name, mechanical family and whether it is a **MACHINE** or **MODIFIER**.
- Actual cost, free/purchased/sold-out status, Power cost or "no Power".
- Functional summary in plain language; optional expand details to show precise mathematics.
- THIS target, ALL group, cross-family trigger or checkpoint, using plain naming.
- Eligible positions and reason for blocked placement; if fixable by selling, show the path to manage.
- What happens with an additional stack; don't invent non-existent rarity or an artificial cap.
- Selection, preview, commit, installed/disabled and error states.
- Touch and keyboard focus, no hover-only descriptions, accessible tap targets.

### M4.3 End-to-end UX work packages

- [ ] Draft 1-of-3 choice clearly differentiated from unlimited purchases in shop.
- [ ] Four-slot shop cards; purchased-slot/restock/reroll rules shown accurately.
- [ ] Current money and Power always in view; show "why can't I buy?" rather than grey boxes alone.
- [ ] Table placement ghost, actual collider/footprint conflicts, install/replace.
- [ ] "Manage Machine": installed parts and locations, freed Power, refund, dormant vs active modifiers, confirm/cancel.
- [ ] Shop back/next-challenge actions remain obvious after preview, sale or cancel.
- [ ] Reduced animation mode and minimal screen obstruction during active play.
- [ ] No duplicate tap purchases, gesture-driven accidental sales or lost state on UI rerender.
- [ ] An untrained player can explain a THIS bumper vs ALL bumpers vs global multiplier and physical machine Power.

**Code ownership suggestion:** Keep rules under `src/run/run.ts`, offers under `src/run/catalog.ts`, presentation/refactor under `src/run/ui.ts` and `src/style.css`. Split overgrown UI files only for a clear responsibility, not as a prerequisite rewrite.

**Exit:** A new player can answer “What does it do, where does it go, what does it cost, and what happens if I sell it?” without assistance.

---

## 10. M4 — Title, onboarding, settings, run save and end screens

### M4.1 Player-facing navigation

- [ ] Finished **title screen** with Play/New Run, Continue Run if save is valid, How to Play, Settings and Credits.
- [ ] Confirm before replacing an in-progress run. No silent overwrite.
- [ ] Pause: resume, settings, help and return to title; actual sim/time/audio events pause consistently.
- [ ] Match intro: Inning/challenge/boss name; clear target/strikes.
- [ ] Challenge clear: score, reward, next stage; boss victories visually special.
- [ ] Loss: show why and provide run recap, continue/new where appropriate, clear restart.
- [ ] Final victory: named championship, big-score payoff, summary of machine, highlights, and convenient new run.
- [ ] No developer-only copy (“PHYSICS TEST”, “BUILD TEST”) in ordinary production UI.
- [ ] Stable back/escape/focus behavior across menus, no overlapping modal traps.

### M4.2 Save/resume **[BLOCKER]**

The current local dev analytics storage is **not** a player save system. Design a separate versioned save schema:

**Suggested checkpoint approach, requires D-06 approval:** Save on meaningful safe boundaries (between pitches/challenges, shop and draft decisions). A mid-live-pitch page close resumes from a defined safe checkpoint instead of attempting exact physics-body restoration. The penalty/no-penalty and anti-save-scumming policy must be explicitly chosen and communicated.

Minimum save contents:
- Schema version, run seed, current challenge/phase, targets, money, Power, installed parts/mounts, modifier stacks, section unlocks, offer/choice state, strikes and other canonical run state.
- Boss identity and any persistent rule state required by its chosen design.
- Completion/loss state or clean separation of archive statistics from active run.

Required safety:
- [ ] Atomic logical state transitions; do not double-buy/sell/reward when reloaded.
- [ ] Restore legally installed machine and group/dormant modifiers exactly.
- [ ] Restore Upper Deck/C3 grant, Home Run Rally pitch policy and boss state consistently.
- [ ] Handle browser shutdown, backgrounding, private mode/blocked storage, corrupted JSON, unknown schema and multiple open tabs.
- [ ] Migrations or explicit safe fallback for version updates; never silently erase an active run.
- [ ] Separate settings and save; local-only device storage means **no cloud sync promise**.
- [ ] Tests: fresh, mid-shop, post-draft, sale + refund, lost/cleared challenge, C3 unlock, boss state, final win, interrupted pitch and invalid save.

### M4.3 First-run teaching — short and optional

Plan contextual steps based on what the player actually encounters:
1. Move left thumb/keyboard.
2. Swing right thumb/Space; show that early/middle/late affects direction.
3. Explain strike/ball drain and score target.
4. Explain free 1-of-3 draft.
5. Explain Power and physical hardware vs no-Power modifiers.
6. Highlight a valid install site and selected preview.
7. On first Closer, show rules and how to react.
8. On Upper Deck unlock, explain Home Run/Rally only when relevant.
9. Explain selling/management at first space or Power conflict, or via Help.
10. Provide skip/replay Help for existing players.

Test with truly new players. Instruction banners cannot cover the bat or create scrolling.

### M4.4 Settings and accessibility

- [ ] Master mute, SFX level, separate music if any; persist options.
- [ ] Reduced motion, visual effects intensity, flash limits.
- [ ] Good contrast for HUD and cards; symbols plus color for boss/Rally/status.
- [ ] Touch target size, iPhone safe-area and in-app scrolling only in shop areas, not live play.
- [ ] Readable numeric displays at minimum/maximum zoom, long card descriptions and high scores.
- [ ] Keyboard focus, navigation, visible focused control, accessible DOM labels. Document realistic limits of Canvas gameplay.
- [ ] Portrait sizing and desktop aspect ratio; itch iframe/fullscreen behavior.
- [ ] Optional quality presets only if profiling demands them.

### M4.5 Audio production

Existing `src/view/audio.ts` is a synthesized sound system. First build an **event → sound checklist**, then selectively upgrade. Suggested events:
- Bat aim/ready/whoosh/contact; wall vs bumper vs special part collision.
- Glove catch/hold/relaunch; ramp ride/finish/rollback; gate/target/bank/jackpot.
- Home Run entry, Rally start, repeated deck hits, Rally finish.
- Multiball, strike, multiplier surge, boss rules and championship.
- Draft card reveal, shop select/buy/sell, Power/currency, back/confirm, win/lose.

**Earshot** is an optional local first-pass SFX generator/audio-review workflow, not a mandatory dependency or substitute for premium recorded/licensed sounds. Preserve recipes, source files, clean browser audio exports and license records. Audition **in game** with realistic repeated bumper chains: prioritize variation, sound mix, rate limiting, total voice limits, mute and mobile autoplay gesture unlock. Use only original/licensed music if music is added.

**Exit:** All menu/save/onboarding/settings/end-of-run paths function from a fresh browser with no developer console.

---

## 11. M5 — Build diversity, difficulty and pacing

**Do not rebalance simply by comparing point values.** How often the ball enters a mechanism and what happens after it leaves are major factors. Compare whole-run viability for different machine strategies.

### M5.1 Build archetypes to test

- **Ramps:** Turbo/Overpass/Long Loop, checkpoints, completion generators, direct payout and outlet trajectories.
- **Glove scoop:** actual catch frequency, launch paths, Gold Glove stacking, value per possession and synergistic machines.
- **Bumper clusters:** rapid finite right-side bursts, location choice, ALL bonuses, Upper Deck diamond/slings.
- **Gates/global multiplier:** how multiplier increases support lower-base-point parts.
- **Multiball:** scoring vs loss risk, readability, performance and independent Rally state.
- **Mixed cross-family:** ramp-to-bumper charges, Rally plus purchased deck mounts, useful pivots when shop offers vary.

**Definition of success:** several distinct approaches are exciting and can finish the five innings with reasonable choices and skill. Not identical score per hit; do not abolish spectacular high-roll runs.

### M5.2 Measurement plan

Use local developer reports, `scripts/bot-run.ts`, `scripts/flow-diagnostics.ts`, and brief targeted probes with exact seeds. Record:
- Challenges cleared/failed, strikes, score/target ratio, time/challenge and time between batting turns.
- Score by mechanism/family, multiplier source, ramp completions/rollbacks, scoop catches, bumper hits, deck visit duration, Rally gains.
- Draft/shop offers, purchases, sales, rerolls, money/Power bottlenecks and dormancy.
- Boss mechanic triggers, clear/fail reason, per-boss difficulty changes and build-family effects.
- Real-player scores and input errors separately from bot behavior. Fixed-swing bots can overuse repeatable Home Run returns.

### M5.3 Targeted concerns already known

- Ramp-focused victory has been demonstrated; non-ramp viability is less proven.
- Upper Deck increased time on the machine and Home Run ride frequency in bot tests; V2.2 report shows increased pace and high deck traffic.
- Right-side pocket produces brief 20–29-hit bursts, currently **finite** — preserve fun unless new evidence shows a real loop/problem.
- Upper Deck can hold a ball for a long but finite interval with purchased bumpers, keeping the camera zoomed out.
- Target growth may create dead stretches or late difficulty walls; bosses can amplify this.
- Reward weighting may not support specialized glove paths as reliably as ramp paths.
- Shop UX itself may slow the fun if turns become too long.

### M5.4 Discipline for balance changes

1. Reproduce with seed/build/video/score log.
2. Determine whether issue is geometry/traffic, legibility, scoring formula, boring pace, truly infinite loop or merely very strong fun.
3. Prefer smallest geometric or feedback fix when the problem is **traffic**.
4. Only tune numbers with clear evidence and approval; no blanket caps.
5. Run seeded cases, original regression tests, and brief human playtests.
6. Record exact before/after, approval and whether prior assumptions were superseded.

**Exit:** Boss rules and targets are fair for several archetypes; no dominant-only build, hardlock, softlock, reward dead end or artificially capped fun.

---

## 12. M5 — Performance, accessibility and QA

### M5.1 Test matrix

- [ ] Small iPhone-sized portrait, 390×844 class phone, large mobile portrait; at least one Android browser if available.
- [ ] Desktop Chrome/Firefox/Edge/Safari where reasonable, keyboard and pointer controls.
- [ ] itch embedded iframe and direct browser URL; resize/orientation, visibility change, audio unlock.
- [ ] Normal camera and max zoom-out; upper deck/multiball and return to exact 100% batting view.
- [ ] Bat sweep/late/early, intentional misses, consecutive swings, hits adjacent to mouth/rails.
- [ ] Dense bumper farm, deck bought installations, 40+ modifiers, very large scores, 15-challenge long session.
- [ ] Shop four cards/long name, placement conflicts, reroll, sell, dormant modifier, multi-tap and scrolling.
- [ ] Boss 1 through boss 5, win/loss, interruptions, versioned save.
- [ ] Full muted/reduced-motion/low-effects path; legible non-color information.

### M5.2 Technical goals (proposals, not promises)

- Aim for smooth 60 FPS on a reasonable modern smartphone and sensible degradation under heavy VFX; document measured p95 frame times, device/browser and chosen fallback.
- Preserve the fixed 240-Hz simulation stepping behavior; do not make visual frame rate change scores or input semantics.
- Profile Canvas draws, particle allocation, cached glow, text/layout, texture decode and WebAudio voice count.
- Avoid expensive effects in the critical bat zone, all-ball blurs, long pauses from rerendering, and giant memory accumulation.
- If necessary, scale down **decorative effects**, not the number of awarded points or active balls.
- Validate no live-page scroll, accidental zoom, iOS touch-cancel breaks or keyboard focus lost after shop.

### M5.3 Automated and manual checks

Preserve/extend:
- `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
- Existing golden baseline and `tests/upper-deck-v22.test.ts` checks.
- New boss-specific tests, save/version tests, shop economy/stack tests, route/asset smoke.
- Repeated deterministic score reconciliation for Home Run, Rally, global multipliers and bosses.
- Test for infinite loops, return from upper deck, stationary ball cases, multiball removal/strike correctness.
- Visual screenshot comparisons at selected resolutions **plus animated captures**; passing compilation alone is not enough.
- Clean-browser acceptance run by someone unfamiliar with the prototype.

### M5.4 Bug triage

- **Release blocker:** save loss/corruption, crash, gameplay impossible to finish, broken touch, unbounded loop, incorrect scoring/Power.
- **High priority:** boss unclear/unfair, major performance failure, shop unintelligible, input eaten by overlay, inaccessible Next Challenge.
- **Accept with documented rationale only:** minor cosmetic issues and noncritical UI animation imperfections.

**Exit:** Repeatable end-to-end five-inning play with verified save/resume, performance, audio, readable HUD and no release blockers.

---

## 13. M6 — Productize the browser build and verify itch readiness

The **itch launch campaign** belongs to the creator's existing plan. These are the technical steps to ensure the product works there.

- [ ] Set one **production entry route**. Do not require `/build-test/?v2=1` or a developer query to access the finished game. Keep legacy demo/test routes separate if useful.
- [ ] Reconcile V2 upper-deck integration and C3 unlock for normal players.
- [ ] Remove prototype and developer-facing copy from production; gate debug/analytics appropriately.
- [ ] Update `README.md`, `index.html`, `package.json` description/version policy, documented controls and current feature list. Its current version string `1.0.0` is not proof it is ready.
- [ ] Test Vite asset paths in an **actual packaged itch HTML5 game** (not only GitHub Pages under a subdirectory). Verify fonts, images, sounds and module imports load after ZIP upload/embedding.
- [ ] Test iframe size, mobile viewport, focus, safe-area, full-screen option, pointer/touch gesture behavior, audio first user gesture, background/return and reloading.
- [ ] Local save must work in that browser origin under the chosen hosting/embedding mode. Cross-origin storage restrictions are a special test case.
- [ ] Keep credits, creator attribution, legal licenses/provenance for fonts, art, sounds and dependencies. No unlicensed commercial sports recordings/logos, music or celebrity likenesses.
- [ ] Decide privacy/telemetry behavior; default developer metrics should remain local and not silently send personal data.
- [ ] Make a tested rollback build and known-issues record, tag the release, document compatibility and save migration.
- [ ] Test product URL and packaged build in a fresh browser outside developer session.
- [ ] Creator signs off after a **full 15-challenge playthrough** of the packaged release; not just an internal build.

**Exit:** Release candidate is packaged, playable, documented, tested in itch's actual browser context, and approved.

---

## 14. Reusable asset/model/UX task specification

Each missing piece should become its own production ticket with the following fields. Do not commission expensive modeling/art from an underspecified sentence.

| Field | Required contents |
|---|---|
| **ID / deliverable** | E.g., ART-BALL-01, UI-SHOP-01, BOSS-03, AUDIO-RALLY-01 |
| **Reason** | Player problem solved and how success will look/feel |
| **Design status** | OPEN / PROPOSED / DECIDED / IMPLEMENTED / TESTED |
| **References** | Numbered contact-sheet selection, game screenshots, intended style, source links/license |
| **Required variants** | Idle/active/lit/disabled, theme variants, touch/desktop, VFX states |
| **Format/source** | SVG/layered raster; Blender only if selected; sprite sheet, Canvas component or audio recipe |
| **Geometry** | World-space center, collision footprint, pivot, scale, depth layer; no invisible collider mismatch |
| **Integration** | Source modules/UI screens/events to which the asset or mechanic connects |
| **Performance** | Texture/audio sizes, animation FPS, draw calls and fallback quality if needed |
| **Test** | Deterministic gameplay case, UI capture and motion clip at phone resolution |
| **Signoff** | Before/after evidence, owner approval, commit reference, open follow-ups |

### Suggested future source organization (PROPOSED; do not reorganize in this documentation task)

- `docs/art/`: approved style bible, numbered concept sheets, asset register.
- `docs/product/`: boss briefs, UX specs, decisions, release acceptance.
- `assets/source/`: editable vector/layered raster/Blender files (if used), source audio and recipes.
- `public/assets/art/`: browser-optimized exports, icons, sprites, textures.
- `public/assets/audio/`: browser-ready SFX/music with licenses.
- `docs/qa/`: golden screenshots, short videos, human playtest notes and test matrix.
- `tests/` and `scripts/`: targeted deterministic probes; avoid unrelated new automation frameworks.

For 3D art, preserve original mesh decomposition, Blender object names, pivots, normals/UVs/materials, rig/animation actions where appropriate, reference images, export camera and runtime sprites. Prefer minimum necessary specialist workflow; visual inspection remains required after export.

---

## 15. Decision register and authoritative state

**The entries below are proposals unless marked DECIDED. Don't turn them into code or expensive assets without creator choice.**

| Decision | Current state | Recommendation / deadline |
|---|---|---|
| **D-01 Art direction** | **OPEN**: Broadcast Arcade / Premium Miniature / Stylized Neon or deliberate blend | Choose on one contact sheet before full visual production |
| **D-02 Rendering/art pipeline** | **OPEN**, Canvas 2D is currently implemented | Prefer 2D/2.5D Canvas; use Blender-to-sprites only with clear benefit; M1 |
| **D-03 Boss philosophy** | **OPEN exact mechanics**; five Closers needed | Fixed recognizable boss/rule per inning, with clear counterplay; first before M2 |
| **D-04 Boss identities and rules** | **OPEN** | Sign off 5 one-page boss specs before finishing M3 |
| **D-05 Shop visual language** | **OPEN** | Compare baseball cards / parts counter / strategy workbench before M2 UX |
| **D-06 Mid-pitch save policy** | **OPEN / BLOCKER** | Safe checkpoint recommended; precise reload penalty/restart rules must be chosen before persistence code |
| **D-07 C9 Side Chamber** | **OPEN:** prior design mentioned it, not observed in V2.2 implementation | Explicitly include 1.0, redesign or approve deferral; decide before final world art |
| **D-08 1.0 run length/difficulty** | **OPEN numerical target** | Measure real new-player and experienced runs; M0 and M5 |
| **D-09 Persistent metagame** | **OPEN** | Recommend no new power-granting permanent unlocks for 1.0 without strong reason |
| **D-10 Theme selection** | **OPEN** | One cohesive default style; offer alternate palette only if cheap and readable |
| **D-11 Music** | **OPEN** | SFX first, optional original/licensed soundtrack |
| **D-12 Platform** | **DECIDED broad goal:** browser release on itch | Verify exact embed, viewport and technical requirements in M6 |
| **D-13 Copy and naming** | **OPEN polish** | “Baseball Pinball” working title, consistent baseball vocabulary |
| **D-14 1.0 minimum build diversity** | **OPEN measured threshold** | Multiple viable paths, including non-ramp; no arbitrary identical score target |
| **D-15 Side chamber impact on final boss and saves** | **OPEN, depends on D-07** | Do not promise art/boss mechanic before expansion choice |

### Binding decisions and existing achievements

- **DECIDED:** Product phase focuses on graphics, bosses, premium store/upgrades, then completion/QA. The arcade hook and core bat mechanic are good.
- **DECIDED:** Five innings × three challenges, machine-building roguelite.
- **DECIDED:** No camera panning/follow, zoom out only, stable bat feel.
- **DECIDED:** Preserve fun scoring variance and physical interaction; do not mechanically nerf a point farm without evidence.
- **DECIDED:** Upper Deck four-bumper diamond, two outer slings, Home Run 3,000 base, per-ball Rally ×2 upstairs until return.
- **IMPLEMENTED:** V2.2 system, tests, analytics in gated build-test.
- **IMPLEMENTED:** Current shop/draft/power/management and original systems, but with prototype UI/graphics.
- **NOT DECIDED:** Exact boss rules, art style, permanent progression, save policy and C9 chamber inclusion.

When a decision changes, append a revision note with the superseded choice and why. Keep one authoritative ledger; don't lose approved mechanics in a sequence of handoffs.

---

## 16. First production assignments and approval gates

### Assignment 1 — M0/M1 **design and reference work only**

**Goal:** Resolve the expensive choices before implementation. Deliver:
1. Updated repo/current feature audit with stale documentation called out.
2. One **numbered contact sheet** comparing 3 complete visual directions at the existing camera/layout.
3. One numbered comparison of 3 store/draft layouts, using the same real item examples.
4. Short asset-pipeline tradeoff (Canvas procedural/sprites; Blender-to-sprites; full runtime 3D), plus smallest practical recommendation.
5. Three possible **first Closer** rules with triggers, player counterplay, UI warnings and honest balance risks.
6. Concrete C9 Side Chamber options: complete in 1.0 vs intentionally defer, with consequences for camera, art, pacing and saves.
7. Versioned save/resume options, especially mid-pitch.
8. Proposed implementation slices, each with affected files, tests and real mobile visual-review plan.

**Gate:** Creator chooses direction; no bulk code/model/asset generation before approval.

### Assignment 2 — M2 complete vertical slice

Create **only the selected** presentation approach, one representative Closer, one fully interactive store flow, polished gameplay assets/audio, and a captured first inning. Run relevant tests and hand over before/after media.

**Gate:** Creator approves feel, mobile readability and strategy clarity. Revise selected components before scaling.

### Assignment 3 — M3–M4 production expansion

Build remaining approved bosses, art and player experience in small individually verifiable commits. Don't combine boss scoring refactor, global art rewrite and save schema in one unreviewable commit. Keep playable rollback branches/tags.

### Assignment 4 — M5–M6 product hardening

Multiple whole-run playtests, device/iframe verification, build-family balance, audio mix, save migration, license checks, clean production route, first-release QA and owner go/no-go.

### Initial completion checklist

- [x] Proven interactive swing and pinball scoring loop.
- [x] Prototype run, Power, draft, shop, upgrades and management.
- [x] V2.2 Upper Deck / Home Run Rally implemented on a test route.
- [x] Prototype-to-product roadmap entered in repository.
- [ ] Approve art direction, shop interface and production pipeline.
- [ ] Approve a first Closer rule and test it in a finished vertical slice.
- [ ] Decide C9 Side Chamber scope and mid-pitch save behavior.
- [ ] Deliver five finished Closers, final graphics, final store/upgrades UI.
- [ ] Deliver product title, tutorial, options, resume, results, audio and accessibility.
- [ ] Balance multiple successful builds; test full 15-challenge runs and device performance.
- [ ] Package and verify the actual HTML5 game on itch.
- [ ] Owner signs off on 1.0 after testing the packaged release.

---

## Maintenance and evidence policy

Update this roadmap when milestones are approved, not just when prompts are written. A work package becomes **IMPLEMENTED** only after the actual repository change exists; **TESTED** only after tests and the relevant visual/user observation have been performed. Each update should link commit(s), regression/test results, short mobile clips, open issues and decisions/supersessions. Do not create multiple conflicting “master” plans.

**Next recommended action:** Run Assignment 1. Choose a visual direction and shop presentation on cheap concept sheets, design the first Closer, settle C9 expansion and saving, then build one complete polished first inning. **Do not start by implementing all of 1.0 at once.**
---

## 17. Final product milestone — free browser demo + paid $0.99 complete game

> **User-approved commercial direction, November 21, 2026:** After the full game is finished and release-tested, prepare a **free, playable browser demo embedded on the itch.io product page**, and offer the **complete game for $0.99 USD**. The demo is a deliberate conversion experience: **try before you buy**, not a placeholder video. The creator controls the wider itch launch plan.  
> **Status:** **DECIDED commercial intent / OPEN technical distribution model and demo cutoff.** This is intentionally **last in the development roadmap**, with early platform feasibility work required to avoid a late architectural trap.

### 17.1 Important itch.io constraint: “paid” is not the same as “browser-locked”

**Verified against itch.io creator documentation on Nov. 21, 2026:**

- itch.io **HTML Game** uploads run in an embedded iframe, and HTML5 browser-playable games are **donation-based**, not natively purchaser-gated. The official HTML5 guide explicitly says that paid access requires setting **Kind of Game = Downloadable**; this does **not** automatically give the customer a paywalled “play in browser” experience.
- itch.io **Paid** pricing can set a **$0.99 minimum**, with customers allowed to pay more. Downloaded full-game files can be limited to purchasers while designated demo downloads can remain free.
- A free HTML5 embed and paid downloadable files can coexist in some project setups; **verify the exact live editor UI, game type, and purchase flow on a private/draft test page before depending on the combination**. Do not treat older forum replies as a guaranteed current configuration.
- The current source repository is **public** and the existing browser build is publicly hosted for prototype testing. **A paywall on the UI does not hide publicly hosted JavaScript or public source code.** Decide how to separate production source, preview builds, protected files, and public demo assets **well before release**. Changing repository visibility later does not erase copies/history already made public.
- A client-side demo flag, secret route, JavaScript “unlock” boolean, localStorage entitlement, or hidden screen **is not secure paid access**. Never describe that as an actual lock.

**Official source links (revalidate before launch):**
1. [itch.io — Uploading HTML5 games](https://itch.io/docs/creators/html5) (see “Can I take payments with my HTML5 game?” and iframe/mobile packaging).
2. [itch.io — Pricing](https://itch.io/docs/creators/pricing) (paid minimum prices, individually priced files and ownership).
3. [itch.io — Offer a demo alongside your purchasable games](https://itch.io/updates/offer-a-demo-alongside-your-purchasable-games).
4. [itch.io forum — paid HTML5 browser access](https://itch.io/t/6277781/can-i-lock-browser-based-html-game-behind-paywall) (user discussion, supplementary evidence, **not** authoritative platform policy).

### 17.2 Distribution options — choose explicitly before implementation

| Option | Free demo | $0.99 full game | Advantages | Tradeoffs / status |
|---|---|---|---|---|
| **A — itch free browser demo + paid downloadable full release** | Embedded HTML5 demo on itch page | Buyers download a complete packaged desktop game (e.g. Windows application) | **Recommended low-complexity 1.0 business model** using itch's purchase/file entitlement system; no custom accounts/backend | Requires a safe, tested downloadable packaging path; full game **not directly paywalled in browser**. Windows-centric delivery may conflict with mobile-first audience. **OPEN approval** |
| **B — itch free demo + separately authenticated, hosted full web game** | Same page embed | Payment verified server-side, purchaser account/session authorizes full game on a protected host | Delivers full game in browser/mobile after paying | Nontrivial backend, purchaser verification, accounts/sessions/support, hosting/security/cost; itch HTML5 native gating is **not** this feature. **OPEN feasibility spike and approval** |
| **C — other verified browser entitlement/distribution arrangement** | Embedded demo | A platform-supported paid browser delivery workflow confirmed directly with itch or another chosen provider | May give desired seamless browser purchase | **Unverified**, never promise capability without live proof; requires creator choice |
| **D — voluntary support / honor-system full web build** | Free demo | $0.99 suggested contribution; game can still be accessed without purchase | Easiest browser access and implementation | **Not a real lock**, contradicts paid-access requirement unless creator explicitly accepts it |

**Decision D-16:** Must choose whether **“paid full game” means a downloadable version** or **a browser-playable, authentically purchaser-gated full game**. The difference materially changes implementation scope, the support burden, and whether mobile buyers can play. Do not silently choose A merely because it is easiest; do not promise B without a security and payment verification plan.

**Packaging spike for Option A:** Test a genuine desktop executable wrapper (e.g. a lightweight shell suitable for the existing web runtime) versus any supported offline HTML bundle. **Do not assume unzipping Vite files and double-clicking \`index.html\` works**: browser \`file://\` module/fetch/security restrictions may prevent it. The installer-free or packaged program must be genuinely launchable and QA-tested. If a native wrapper is used, choose a narrowly scoped one; do not rewrite the game engine.

**Security spike for Option B:** Define the purchase/entitlement source, server-side verification, session/login lifecycle, hosting access checks, recovery on new device, privacy/security responsibilities, refund/access policy and ongoing cost. No client-only lock. Validate the itch payment-to-entitlement connection with an actual sanctioned integration before budgeting implementation.

### 17.3 Demo game design — show the hook, then invite purchase

**Goal:** An unaided visitor gets a compelling sample of **skill batting + a memorable upgrade choice + machine synergy + one boss** before being shown exactly what the $0.99 game contains.

**Recommended prototype (not final approved cutoff):**
1. **Start instantly:** Demo-only title/card with a clear **Play Free Demo** action. No accounts, purchases, mandatory signups or heavy tutorial walls.
2. **Learn to hit:** Short contextual left-thumb/right-thumb (and desktop) controls, then skillful ball contact and scoring.
3. **See progression:** Offer a real 1-of-3 draft and enough shop interaction to make one meaningful machine-building decision; don't reduce demo to a scripted animation.
4. **Experience a Closer:** Let the visitor play **Inning 1's three challenges** including the first boss, so they see what separates this from endless traditional pinball.
5. **Show the ceiling:** The upper deck currently unlocks after C3, right at the proposed demo finish. Evaluate **a brief playable Upper Deck bonus encounter or teaser** against ending immediately after the boss. Don't promise a feature they never see; likewise don't give away a disproportionate amount of the five-inning progression.
6. **End cleanly:** Celebrate demo completion, show a short run summary, and present a clear **Get Full Game — $0.99** purchase action plus **Replay Demo**. No deceptive “your save is gone unless you pay” pressure.
7. **Explain value:** Show genuine full-game differentiators: five innings, five distinct Closers, deeper machines and upgrade synergies, additional machine growth (if included), longer runs and save/continue.
8. **Avoid dead-end frustration:** If the player loses before the demo endpoint, allow normal replay or a clearly labeled demo restart. Don't force purchase to retry the demo.
9. **Keep momentum:** Measure time to first hit, first upgrade, first boss, demo completion and click-to-purchase; adjust cutoff using player data.

**Demo cutoff alternatives to evaluate cheaply:**
- **Short:** 1 inning (C1–C3) + trailer/teaser of upper deck. Simplest and likely most conversion-focused.
- **Slightly longer:** C1–C3 + one playable Home Run/Upper Deck showcase challenge. Stronger demonstration of the growing machine, but more work and a larger sample.
- **Curated standalone demo mode:** A shorter, deliberately authored sample of batting, a shop interaction, and a Closer, with limited upper-deck access. Best pacing control but risks divergence from full game and more testing.

**Decision D-17:** Choose the sample length and what progress carries from demo to full game. Prefer **no automatic save transfer for v1**, unless players strongly value it and the save schema safely supports it; allowing a fresh run is simpler and matches roguelite expectations. This is a recommendation, not a settled choice.

### 17.4 Build two distinct, reproducible deliverables

**Do not maintain two manually divergent games.** Share the engine, physics, card catalog source, UI components, art and SFX. Define explicit builds and capability boundaries.

- [ ] **Demo profile:** Only approved demo content, demo save namespace, no full-run/C15 progression paths, no debug controls, no direct route to paid content. Bundle must contain only demo-required assets/data where feasible.
- [ ] **Full profile:** All five innings, bosses, complete machine progression, save/continue and settings; all production assets. Not deployed publicly if genuine paywall required.
- [ ] Define clear build scripts/entrypoints and environment-independent static asset paths. No “dev query parameter” controlling access to a paid game.
- [ ] Reuse exactly the same rules for overlapping demo/full encounters; no demo-only manipulative difficulty unless documented as an intentional curated sample.
- [ ] Share styling, accessibility and audio so the demo actually reflects purchased quality.
- [ ] Preserve deterministic regression tests for the demo boundary and the full endgame.
- [ ] Give demo and full distinct product identifiers, save schema namespaces, update/version information and launch copy; avoid demo overwriting paid saves when origins/storage are shared.
- [ ] Strip dev tools, log endpoints, unfinished boss assets and private keys. **Never bundle credentials or actual entitlement secrets in HTML/JS.**
- [ ] Check the publicly accessible repo/build hosting paths: it is impossible to claim technical exclusivity over already-public source without addressing the distribution model. Do not rewrite public history pretending it never existed.
- [ ] Include a clear local license/readme and usage instructions appropriate to downloadable or web-accessed full game.

**Proposed scripts/artifacts (names are illustrative, finalize after choosing distribution):**
- `npm run build:demo` → zipped, itch-embeddable browser demo with relative assets and `index.html` at archive root.
- `npm run build:full` → complete production build for the chosen paid packaging route.
- `npm run test:demo` and `npm run test:full` (or precise existing test subsets) → one canonical codebase, distinct release guarantees.
- Versioned archives / packaging manifest and checksum in a release folder; CI/manual steps reproducible.

### 17.5 Demo and paid-product end screens / UX

**Demo front door:**
- “**Try Baseball Pinball — Free Demo**” with immediate launch.
- Brief controls, responsive phone/tablet/desktop sizing, muted-friendly behavior and smooth return to itch game page.

**Demo end / purchase moment:**
- Headline emphasizing what they achieved; genuine game footage/highlights or a minimal feature preview.
- “**Unlock the Full Game — $0.99**” with a real itch purchase URL/action (provided by the project, not invented in code).
- Distinguish features they **already played** from features available only in the full product.
- Visible Replay Demo button; no aggressive repeated interstitials during gameplay.
- If full purchase is downloadable, **say so clearly** and identify supported platforms. Do not imply a mobile browser buyer can keep playing online if that is untrue.
- If full product is authenticated web access, explain where to sign in/launch after purchase and how to recover access.

**Paid full version:**
- Normal title/new/continue, no fake demo limit or upsell clutter.
- Run persistence and replay work according to product save policy.
- Optional indicator on home page noting “Full Game,” not a trial expiration.
- Clear update/bug support path and credits.

### 17.6 Validation matrix — must pass on the **actual itch product experience**

- [ ] A fresh visitor can launch the demo **for free without payment** in the embedded page.
- [ ] Phone users can start it in itch's mobile fullscreen/launch behavior, swing with both thumbs, pause and finish without scrolling.
- [ ] Browser demo does not expose any full-game levels, save loopholes or privileged assets by changing a URL parameter.
- [ ] Demo reaches its designed endpoint, can't accidentally progress into paid content, and Replay Demo works.
- [ ] The purchase button opens the **actual product's** checkout flow; $0.99 minimum displayed correctly, tax/payment caveats as platform requires.
- [ ] Anonymous/nonbuyer cannot obtain paid downloadable files through the public page; verify from fresh private-browser session.
- [ ] If full game is desktop downloadable: buy/test entitlement using a permitted test purchase or sanctioned key, download, install/start and complete real play; verify no missing assets and no assumption of local dev server.
- [ ] If full game is authentically web-gated: verify purchase server-side; unpurchased, refunded, expired and valid sessions behave correctly; no bypass by inspecting JS/client flags. Validate security with someone qualified.
- [ ] Cross-device/mobile buyer journey matches page wording — don't sell a mobile-only player something unusable on their device.
- [ ] Demo and full saves do not corrupt each other; private mode, page reload and upgrades handled deliberately.
- [ ] Music/SFX rights, licenses, version metadata and privacy statements accurate for **both** packages.
- [ ] Test real compressed bundle inside itch, not only GitHub Pages or local `vite preview`. Check relative paths, fullscreen, audio unlock, safe-area insets, frames and UX.
- [ ] Re-test all 15 challenges on full version and every available demo level after final branch cut.
- [ ] Keep rollback artifacts and clear version stamps for both releases.

### 17.7 Definition of this final milestone complete

- **Commercial plan decided:** free browser demo and $0.99 full game agreed, with **actual paid delivery model explicitly selected and verified**.
- Demo is a **real polished and limited playable game**, not merely the full build with a hidden menu item.
- Demo and full game are built from the shared production codebase, do not require secret query parameters, and have distinct tested distribution artifacts.
- The free embedded demo, checkout/purchase, buyer access and full-game launch all work on the actual itch page.
- Buyers receive the promised supported platform experience; **if true browser-only full access remains a requirement, do not call this complete by substituting an unapproved download**.
- Creator signs off on the free visitor-to-purchaser journey and complete paid product.

### Decision register additions for M7

| ID | Decision | Status / recommendation |
|---|---|---|
| **D-16** | **Paid delivery:** downloadable full game for $0.99 vs authentically paid browser-only full game | **OPEN / CRITICAL.** Itch native HTML5 is donation-based; verify before implementation. |
| **D-17** | **Demo cutoff:** first inning, first inning + Upper Deck showcase, or curated shorter sample | **OPEN.** Start with first inning, experiment with one brief Upper Deck teaser. |
| **D-18** | **Source/distribution exposure:** public repository and public build vs protected full paid content | **OPEN / CRITICAL.** No client flag can secure publicly hosted code. |
| **D-19** | **Progress transfer:** fresh full run vs optional migration from demo | **OPEN.** Fresh start recommended unless value proven. |
| **D-20** | **Download packaging target:** Windows desktop wrapper, validated offline browser archive, or verified authenticated web host | **OPEN / DEPENDENT ON D-16.** Must meet phone/desktop promises. |
| **D-21** | **Product price:** $0.99 USD minimum for the complete game | **DECIDED.** Check payment/platform display before launch; voluntary tips above minimum may be allowed by itch pricing. |

**Next planning checkpoint (earlier than M7 implementation):** Resolve **D-16** during M0/M1 feasibility work, even though **building and publishing the demo/purchase funnel belongs at the END**. Otherwise the finished mobile-first game could accidentally depend on a paid-browser capability itch doesn't provide.

**Milestone ordering amendment:** M6 = complete paid-game release candidate validated; **M7 = derive the polished playable demo, implement and test the $0.99 full-game distribution path, then hand off to the owner's existing itch launch plan.**
