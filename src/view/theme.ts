/**
 * Semantic color tokens. Every theme-dependent color (mechanism lighting, ramps, gates, lamps, VFX,
 * trails, scoreboard digits, cabinet accent light) is pulled from a Theme. A new palette is a new
 * object here and nothing else.
 *
 * Themes are cosmetic only. Nothing under src/physics, src/core, src/run or src/machines may import
 * this module (a test enforces it), so a theme can never touch physics, scoring, timing or power.
 *
 * Deliberately NOT themed (material or identity colors): turf, chalk, dirt, baseballs and seams,
 * red pop-bumper bodies, gold/chrome rails and trim, wood bat, glove leather, batter uniform,
 * stadium floodlights, the red drain warning, the magenta bonus-bumper body, and high-contrast
 * text/plates.
 *
 * All colors are #rrggbb (the glow sprite cache appends alpha bytes).
 */
export type Theme = {
  id: 'broadcastClassic' | 'toxicThunder';
  name: string;
  /** Halo around activated machinery (bumper light ring, idle lane chevrons, post sparks). */
  machineGlow: string;
  /** Main neon energy: bat contact, ramp chase lights, lit chevrons, gate flash, previews. */
  energyPrimary: string;
  /** Secondary electricity: bumper stitch rings, sparks, multiball/splitter lighting. */
  energySecondary: string;
  /** White-hot center of an impact. */
  impactCore: string;
  /** Jackpot and high-value highlights, gate lamps, painted arrows, score flickers. */
  jackpotAccent: string;
  ballTrail: string;
  /** Center scoreboard digits (SCORE). */
  scoreboardAccent: string;
  /** Side scoreboard digits (THIS BALL, MULTIPLIER). */
  scoreboardValue: string;
  /** Bright end of the score/target progress bar. */
  scoreboardBar: string;
  /** Blue automatic slingshots: body gradient (light → deep), kick-face rubber, glow. */
  slingBody: string;
  slingDeep: string;
  slingFace: string;
  slingGlow: string;
  /** Rail bulb halo and bulb core. */
  railLight: string;
  railBulb: string;
  /** Ambient cabinet light below the table. */
  cabinetGlow: string;
  /** Tint of the see-through ramp glass. */
  rampGlass: string;
  /** Unlit indicator lamps: bank lamps, gold gate-arch lamps, splitter charge lamps. */
  lampOff: string;
  lampOffAccent: string;
  lampOffSecondary: string;
  /** UI accent for focus rings, the selected shop card and "applies to" text. */
  uiAccent: string;
  /**
   * Optional dark underlay drawn beneath primary-energy strokes so they stay legible on green turf
   * (needed when the energy color is itself green). null = no underlay.
   */
  energyOutline: string | null;
};

export const BROADCAST_CLASSIC: Theme = {
  id: 'broadcastClassic',
  name: 'Broadcast Classic',
  machineGlow: '#ffb347',
  energyPrimary: '#3fd8ff',
  energySecondary: '#ff4fd8',
  impactCore: '#ffffff',
  jackpotAccent: '#ffd76a',
  ballTrail: '#6fe6ff',
  scoreboardAccent: '#ffcb5c',
  scoreboardValue: '#6fe6ff',
  scoreboardBar: '#ffe58e',
  slingBody: '#3d8cff',
  slingDeep: '#0d2f7a',
  slingFace: '#9fd4ff',
  slingGlow: '#4fb2ff',
  railLight: '#ffd998',
  railBulb: '#fff3d6',
  cabinetGlow: '#3a6fd8',
  rampGlass: '#96d7ff',
  lampOff: '#2a3550',
  lampOffAccent: '#5b4a25',
  lampOffSecondary: '#5a2a55',
  uiAccent: '#6fe6ff',
  energyOutline: null,
};

/**
 * Test palette: acid lime primary energy, violet secondary electricity, teal accents, white-hot cores.
 * Lime would vanish on the green turf, so primary strokes get a deep-violet underlay and the ball
 * trail/glass lean violet instead of green. Slingshots stay recognizably blue.
 */
export const TOXIC_THUNDER: Theme = {
  id: 'toxicThunder',
  name: 'Toxic Thunder',
  machineGlow: '#b8ff3d',
  energyPrimary: '#9dff1f',
  energySecondary: '#b44dff',
  impactCore: '#ffffff',
  jackpotAccent: '#3ff2d4',
  ballTrail: '#cf9bff',
  scoreboardAccent: '#c8ff4d',
  scoreboardValue: '#3ff2d4',
  scoreboardBar: '#e6ff9e',
  slingBody: '#4a6dff',
  slingDeep: '#1a1f7a',
  slingFace: '#b9c4ff',
  slingGlow: '#8a72ff',
  railLight: '#dcff9e',
  railBulb: '#f4ffe0',
  cabinetGlow: '#6a2bd6',
  rampGlass: '#c9a6ff',
  lampOff: '#2e2350',
  lampOffAccent: '#1d5a52',
  lampOffSecondary: '#46206a',
  uiAccent: '#3ff2d4',
  energyOutline: '#2a0a45',
};

export const THEMES: Record<Theme['id'], Theme> = {
  broadcastClassic: BROADCAST_CLASSIC,
  toxicThunder: TOXIC_THUNDER,
};

export const DEFAULT_THEME = BROADCAST_CLASSIC;

/** Developer preview: ?theme=toxicThunder. Anything unknown or missing → Broadcast Classic. */
export function themeFromSearch(search: string): Theme {
  let v = '';
  try {
    v = new URLSearchParams(search).get('theme') ?? '';
  } catch {
    return DEFAULT_THEME;
  }
  const key = Object.keys(THEMES).find(k => k.toLowerCase() === v.trim().toLowerCase()) as Theme['id'] | undefined;
  return key ? THEMES[key] : DEFAULT_THEME;
}

/** '#rrggbb' + alpha → 'rgba(r,g,b,a)'. */
export function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Mix a color toward black (k = how much of the original remains). Returns #rrggbb. */
export function dim(hex: string, k: number) {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v: number) => Math.round(v * k).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/** Per-theme derived colors, computed once per theme (never in the frame loop). */
export type Derived = { chevronStatic: string; gateArrow: string; paintedArrow: (a: number) => string; glass: string };
const derivedCache = new WeakMap<Theme, Derived>();
export function derived(t: Theme): Derived {
  let d = derivedCache.get(t);
  if (d) return d;
  const arrows = [0.16, 0.23, 0.3, 0.37].map(a => rgba(t.jackpotAccent, a));
  d = {
    chevronStatic: rgba(t.jackpotAccent, 0.32),
    gateArrow: rgba(t.jackpotAccent, 0.35),
    paintedArrow: (a: number) => arrows.find((_, i) => Math.abs([0.16, 0.23, 0.3, 0.37][i] - a) < 0.005) ?? rgba(t.jackpotAccent, a),
    glass: rgba(t.rampGlass, 0.16),
  };
  derivedCache.set(t, d);
  return d;
}

/** Push the theme's UI colors into CSS custom properties (scoreboard digits, bars, selections). */
export function applyThemeToCss(t: Theme, root: HTMLElement) {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set('--sb-value', t.scoreboardValue);
  set('--sb-value-glow', t.energyPrimary + '66');
  set('--sb-main', t.scoreboardAccent);
  set('--sb-main-glow', t.machineGlow + '66');
  set('--sb-bar-a', t.machineGlow);
  set('--sb-bar-b', t.scoreboardBar);
  set('--energy', t.energyPrimary);
  set('--energy-soft', t.energyPrimary + '66');
  set('--energy-faint', t.energyPrimary + '55');
  set('--ui-accent', t.uiAccent);
  set('--ui-accent-faint', t.energyPrimary + '55');
}
