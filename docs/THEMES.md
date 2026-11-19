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

## Materials (`theme.m`)

Themes are rewards, so they reskin the whole machine, not just the lights. Every always-visible
material is a named role under `m`:

- backdrop, crowd colors, floodlight glow, bulbs and panels
- turf, lane turf, infield arc, mound, batter's apron
- rail metal stops and edge, trim (mechanism outlines, rail end caps), post metal, wall-panel metal
- pop-bumper body and skirt, bonus-bumper body and rim, bullseye ring
- jackpot banner, border, laurels, text shadow; star-panel face and star
- splitter face
- cabinet UI (`m.ui`, applied as `--m-*` CSS variables): page background, scoreboard bezel and
  screens, strip, labels, gold frame, buttons, overlay card, shop panel and offers

Broadcast Classic's materials equal the literals the table used before themes existed
(locked by `tests/fixtures/classic-materials.json` and the pixel diff below).

Toxic Thunder's material set is a night arena: dark green field, slate clay, gunmetal and chrome
hardware with acid-lime trim, violet bumpers, jackpot banner and screens, teal bonus bumpers, lime
buttons.

## Live tuning (dev console)

```js
tuneTheme('m.bumperBody.0', '#ff8a3d')          // one role, dot path
tuneTheme({ m: { turf: ['#123', '#234', '#123'] } }) // merge several
dumpTheme()                                      // JSON of the tuned palette (also copied), paste into theme.ts
```

Works on a copy of the active theme (`?theme=` picks the starting point). Reload to discard;
nothing is saved.

## Intentionally not themed

These stay fixed in every theme so the game always reads as baseball and stays legible:

- baseballs and seams, the wooden bat, glove leather, the batter's uniform
- chalk lines, home plate, bullseye white rings
- the red drain warning, strike dots
- text colors and contrast
- slingshots stay blue (hue enforced by tests)
- debug overlay colors

## Verification (Nov 19)

- **Materials pass:** the same deterministic captures. Broadcast Classic is pixel-identical to the pre-theme build in every scene, including the CSS cabinet. The only difference is the scoreboard pulse in the ramp scene (wall-clock animation).

- **Broadcast Classic vs. before:** deterministic captures (seeded randomness, stepped frames) at a 390×844 phone viewport, comparing `/` ready and live, `/3` ready, a bumper hit and a ramp ride, and `/build-test/` ready. The canvas is pixel-identical in every scene. The only difference is a scoreboard digit caught mid "pulse" animation, which runs on wall-clock time.
- **Toxic Thunder:** lime energy is drawn over a deep-violet underlay. The ball trail and ramp glass lean violet, slingshots stay blue (tests enforce hue rules), and the ball and text stay readable.
- **Performance** (headless Chrome, software GL, DPR 3, desktop CPU, not a phone):
  - 16.7 ms average and 16.8 ms p95 frames in both themes with a busy table
  - JS heap about 5 MB in both, stable
  - glow sprite cache 11 entries (now capped at 48)
  - a theme switch is a one-time static re-render, about 1.2 ms on that machine
- **Not measured:** battery, thermals and frame time on real phones.
