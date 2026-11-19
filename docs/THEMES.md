# Themes (cosmetic palettes)

Themes are color only. Physics, scoring, timing, sound rules, probabilities and Power never read a theme; `tests/theme.test.ts` fails if any logic module imports view or theme code.

## Preview

The default URLs use **Broadcast Classic**. Add `?theme=toxicThunder` to preview the test palette on any route:

- `/?theme=toxicThunder`
- `/1/?theme=toxicThunder`
- `/2/?theme=toxicThunder`
- `/3/?theme=toxicThunder`
- `/build-test/?theme=toxicThunder`

`?theme=broadcastClassic` also works. Unknown or empty values fall back to Broadcast Classic.

For development, the console command `setTheme('toxicThunder')` re-renders the cached layers once. There's no menu, nothing is saved, and nothing is unlockable.

## Roles (`src/view/theme.ts`)

| Role | Used for |
| --- | --- |
| `machineGlow` | Bumper light rings, idle lane chevrons, post sparks, center-score glow |
| `energyPrimary` | Bat contact, ramp chase lights, lit chevrons, gate flash, landing marker, placement preview, side-score glow |
| `energySecondary` | Bumper stitch rings, sparks, multiball/splitter light, ramp-gate blaze |
| `impactCore` | White-hot impact centers and fragments |
| `jackpotAccent` | Jackpot glow, gate lamps, painted arrows, static ramp chevrons, crest stars, score flickers |
| `ballTrail` | Ball trail |
| `scoreboardAccent` / `scoreboardValue` / `scoreboardBar` | Center digits, side digits, progress bar end |
| `slingBody` / `slingDeep` / `slingFace` / `slingGlow` | Slingshot gradient, kick face, pulse |
| `railLight` / `railBulb` | Rail bulb halo and core |
| `cabinetGlow` | Ambient light under the table |
| `rampGlass` | Ramp glass tint |
| `lampOff` / `lampOffAccent` / `lampOffSecondary` | Unlit bank, gate-arch and splitter lamps |
| `uiAccent` | Focus rings, selected shop card, "applies to" text |
| `energyOutline` | Optional dark underlay under primary-energy strokes so green-hued energy stays legible on the turf (`null` in Classic) |

## Intentionally not themed

These are material or identity colors that stay fixed:

- turf, chalk, infield dirt
- baseballs and seams
- red pop-bumper bodies, the magenta bonus-bumper body
- gold and chrome rails, posts and trim
- the wooden bat, glove leather, the batter's uniform
- stadium floodlights and crowd
- the red drain warning
- ramp and machine name plates and their text, overlay and card text, the gold Ready/Buy buttons, strike dots
- debug overlay colors

## Verification (Nov 19)

- **Broadcast Classic vs. before:** deterministic captures (seeded randomness, stepped frames) at a 390×844 phone viewport, comparing `/` ready and live, `/3` ready, a bumper hit and a ramp ride, and `/build-test/` ready. The canvas is pixel-identical in every scene. The only difference is a scoreboard digit caught mid "pulse" animation, which runs on wall-clock time.
- **Toxic Thunder:** lime energy is drawn over a deep-violet underlay. The ball trail and ramp glass lean violet, slingshots stay blue (tests enforce hue rules), and the ball and text stay readable.
- **Performance** (headless Chrome, software GL, DPR 3, desktop CPU, not a phone):
  - 16.7 ms average and 16.8 ms p95 frames in both themes with a busy table
  - JS heap about 5 MB in both, stable
  - glow sprite cache 11 entries (now capped at 48)
  - a theme switch is a one-time static re-render, about 1.2 ms on that machine
- **Not measured:** battery, thermals and frame time on real phones.
