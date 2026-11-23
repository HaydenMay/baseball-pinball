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
/**
 * Material layer: the always-visible look of the machine (backdrop, crowd, field tones, metal,
 * bumper bodies, target faces, jackpot banner, cabinet screens and buttons). Themes are rewards, so
 * they should transform the whole table, not just the lights.
 * Never themed: baseballs, batter, bat, glove, and text contrast.
 */
export type Materials = {
  backdrop: [string, string, string];
  crowd: string[];
  floodlight: string;
  floodBulb: string;
  floodPanel: string;
  turf: [string, string, string];
  laneTurf: [string, string];
  infield: string;
  mound: [string, string, string];
  apron: [string, string, string];
  /** Rail metal gradient stops (gold in Classic). */
  railMetal: string[];
  railEdge: string;
  /** Trim on mechanisms, lane-rail ends, plates (gold in Classic) and its deeper shade. */
  trim: string;
  trimDeep: string;
  postMetal: [string, string, string];
  panelMetal: [string, string, string];
  bumperBody: [string, string, string];
  bumperSkirt: [string, string, string];
  bonusBody: [string, string, string];
  bonusRim: [string, string, string];
  targetRing: string;
  jackpotBanner: [string, string];
  jackpotBorder: string;
  jackpotLaurel: string;
  jackpotTextShadow: string;
  starPanel: string;
  starFill: string;
  splitterFace: [string, string];
  /** Global-multiplier feedback: gate lamps, "+0.1×" pops and the scoreboard plaque glow. */
  multGlow: string;
  /** Baseball-stitch accents on the multiplier plaque. */
  multStitch: string;
  /** Cabinet UI around the canvas (CSS). */
  ui: {
    page: [string, string];
    pageGlow: string;
    bezel: [string, string];
    screen: [string, string];
    screenBorder: string;
    strip: [string, string];
    label: string;
    frame: string;
    frameHi: string;
    button: [string, string];
    buttonText: string;
    buttonEdge: string;
    card: [string, string];
    offer: [string, string];
    panel: [string, string];
  };
};

export type Theme = {
  id: 'broadcastClassic' | 'toxicThunder' | 'nightGame';
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
  /**
   * Neon outline strength (0 or absent = none): always-on glowing rings around bumpers and outlines on
   * slingshots, so the table reads as lit neon even between hits.
   */
  neon?: number;
  /** Always-visible material set. */
  m: Materials;
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
  m: {
    backdrop: ['#0b1a33', '#08152a', '#050c19'],
    crowd: ['#c43a3a', '#2f5fae', '#e8e0d0', '#24324d', '#b8862f'],
    floodlight: '#ffe8bd',
    floodBulb: '#fff1d0',
    floodPanel: '#121c2c',
    turf: ['#1b6a38', '#228043', '#1b6837'],
    laneTurf: ['#2a9150', '#23803f'],
    infield: '#a8744a',
    mound: ['#c7915f', '#a26f45', '#7d5434'],
    apron: ['#a5704a', '#8a5c3b', '#3b2618'],
    railMetal: ['#7a5523', '#f6dc9c', '#9a6d2f', '#fff1c8', '#8a612a', '#e9c57a', '#6e4c1f', '#f9e5ae', '#93692e'],
    railEdge: '#0a1426',
    trim: '#e3b45c',
    trimDeep: '#c99a4c',
    postMetal: ['#fff6d8', '#d9a94f', '#6d4a1c'],
    panelMetal: ['#6b4a1c', '#f1d08a', '#7a5422'],
    bumperBody: ['#ff5a52', '#c4141d', '#6e0a10'],
    bumperSkirt: ['#e8edf3', '#7c8593', '#2b313b'],
    bonusBody: ['#ff7ae6', '#a3168f', '#4a0a42'],
    bonusRim: ['#fff2c4', '#c9932f', '#5c3f14'],
    targetRing: '#d4232c',
    jackpotBanner: ['#e2363b', '#8e1118'],
    jackpotBorder: '#f0c46a',
    jackpotLaurel: '#e2b55c',
    jackpotTextShadow: '#7a0d12',
    starPanel: '#16244a',
    starFill: '#ffcf4a',
    splitterFace: ['#2a3f78', '#101a3a'],
    multGlow: '#ff6a2a',
    multStitch: '#d8342c',
    ui: {
      page: ['#0a1730', '#050b16'],
      pageGlow: '#2a3d63aa',
      bezel: ['#2a2216', '#120e08'],
      screen: ['#1f3d78', '#0a1530'],
      screenBorder: '#8d6b34',
      strip: ['#141b2a', '#0b111d'],
      label: '#9fb6d6',
      frame: '#e3b45c',
      frameHi: '#fbe3a6',
      button: ['#ffe49a', '#e3a83f'],
      buttonText: '#1a1206',
      buttonEdge: '#6b4a17',
      card: ['#13223cf2', '#0b1528f2'],
      offer: ['#17284a', '#0f1a33'],
      panel: ['#0b1528f0', '#070e1cf8'],
    },
  },
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
  // Night-arena look: deep green field, slate clay, gunmetal + chrome hardware with acid-lime trim,
  // violet bumpers and screens, teal bonus bumpers, lime buttons.
  m: {
    backdrop: ['#140a28', '#0b0619', '#05030b'],
    crowd: ['#6b2fb3', '#2f8f6a', '#dfe6ff', '#1c1433', '#8fbf2a'],
    floodlight: '#d6f5ff',
    floodBulb: '#e6fbff',
    floodPanel: '#14121c',
    turf: ['#0f3a2a', '#145037', '#0e3828'],
    laneTurf: ['#1b6a4a', '#155a3c'],
    infield: '#4d4560',
    mound: ['#6e6386', '#544a6b', '#3a3250'],
    apron: ['#5a5070', '#423a56', '#1a1526'],
    railMetal: ['#2a2f3a', '#e3ecf5', '#4a5262', '#ffffff', '#3a4150', '#c6d2df', '#262b35', '#f2f7ff', '#444c5c'],
    railEdge: '#07050f',
    trim: '#a6f03c',
    trimDeep: '#6fa82a',
    postMetal: ['#ffffff', '#a9b6c6', '#3a4252'],
    panelMetal: ['#3a4252', '#d6e0ea', '#454e60'],
    bumperBody: ['#c084ff', '#6a1fc4', '#2a0a52'],
    bumperSkirt: ['#e3ecf5', '#6b7686', '#23272f'],
    bonusBody: ['#8affe0', '#13a888', '#064a3c'],
    bonusRim: ['#ffffff', '#a9b6c6', '#3a4252'],
    targetRing: '#7a2ad6',
    jackpotBanner: ['#7a2ad6', '#2e0a5e'],
    jackpotBorder: '#a6f03c',
    jackpotLaurel: '#8fd63a',
    jackpotTextShadow: '#1a0533',
    starPanel: '#1a0f33',
    starFill: '#a6f03c',
    splitterFace: ['#3a1a6a', '#140826'],
    multGlow: '#b8ff3d',
    multStitch: '#b44dff',
    ui: {
      page: ['#160b2a', '#06030d'],
      pageGlow: '#3a1f63aa',
      bezel: ['#1d2128', '#0a0b0f'],
      screen: ['#3a1a6a', '#120624'],
      screenBorder: '#5d6878',
      strip: ['#16121f', '#0b0910'],
      label: '#c3b3e6',
      frame: '#a6f03c',
      frameHi: '#e6ffb0',
      button: ['#e6ff9e', '#7fd61a'],
      buttonText: '#0f1a04',
      buttonEdge: '#3d6a0c',
      card: ['#221638f2', '#120b22f2'],
      offer: ['#24183e', '#140c26'],
      panel: ['#140b26f0', '#0a0614f8'],
    },
  },
};

/**
 * Night Game (player-route default, Nov 22): neon arcade pinball after dark. Deep night-teal field,
 * chrome hardware with hot-pink trim, electric cyan + magenta energy, neon-yellow jackpots, pink rail
 * bulbs. Baseball materials (balls, bat, glove, batter) stay real. Cyan reads on the dark turf, so no
 * underlay is needed.
 */
export const NIGHT_GAME: Theme = {
  id: 'nightGame',
  name: 'Night Game',
  machineGlow: '#ff4fd8',
  energyPrimary: '#29f0ff',
  energySecondary: '#ff2bd6',
  impactCore: '#ffffff',
  jackpotAccent: '#ffe14a',
  ballTrail: '#5cf6ff',
  scoreboardAccent: '#ffe14a',
  scoreboardValue: '#29f0ff',
  scoreboardBar: '#fff3a0',
  slingBody: '#3d7bff',
  slingDeep: '#0b1f6e',
  slingFace: '#a6e4ff',
  slingGlow: '#29a8ff',
  railLight: '#ff7ae0',
  railBulb: '#ffe8fb',
  cabinetGlow: '#c02bd6',
  rampGlass: '#7fe8ff',
  lampOff: '#24203f',
  lampOffAccent: '#4f4420',
  lampOffSecondary: '#4a1c4c',
  uiAccent: '#29f0ff',
  energyOutline: null,
  neon: 1,
  m: {
    backdrop: ['#0d0626', '#070317', '#020109'],
    crowd: ['#7a2a8c', '#1f4c8a', '#bcc4e0', '#1a1533', '#2a8a8f'],
    floodlight: '#e6f0ff',
    floodBulb: '#f4f8ff',
    floodPanel: '#110d1e',
    turf: ['#0b2b2c', '#0f3a39', '#0a2828'],
    laneTurf: ['#12504a', '#0e413c'],
    infield: '#4a3550',
    mound: ['#6a4c70', '#523a58', '#3a2840'],
    apron: ['#4e3856', '#3a2942', '#170e1c'],
    railMetal: ['#2c2f3c', '#e8eef8', '#4c5266', '#ffffff', '#3c4254', '#cdd6e4', '#272b36', '#f4f7ff', '#474e62'],
    railEdge: '#05030d',
    trim: '#ff4fb4',
    trimDeep: '#c42a86',
    postMetal: ['#ffffff', '#b3bccb', '#3b4152'],
    panelMetal: ['#3b4152', '#dbe2ee', '#464d60'],
    bumperBody: ['#ff5a8a', '#d1144e', '#5a0622'],
    bumperSkirt: ['#e8eef8', '#707a8c', '#22262f'],
    bonusBody: ['#5cf6ff', '#109bb8', '#063a4c'],
    bonusRim: ['#ffffff', '#b3bccb', '#3b4152'],
    targetRing: '#ff2bd6',
    jackpotBanner: ['#d11e9a', '#5a0646'],
    jackpotBorder: '#ffe14a',
    jackpotLaurel: '#ffd23a',
    jackpotTextShadow: '#2a0322',
    starPanel: '#160d33',
    starFill: '#ffe14a',
    splitterFace: ['#2a1a6a', '#0f0826'],
    multGlow: '#ff4fd8',
    multStitch: '#29f0ff',
    ui: {
      page: ['#140830', '#04020b'],
      pageGlow: '#5a1f7aaa',
      bezel: ['#1d1a2a', '#09070f'],
      screen: ['#2a0f55', '#0d0420'],
      screenBorder: '#ff4fb4',
      strip: ['#151026', '#0a0712'],
      label: '#b9c8f0',
      frame: '#29f0ff',
      frameHi: '#c9fbff',
      button: ['#ffa6ec', '#ff2bd6'],
      buttonText: '#1d0418',
      buttonEdge: '#7a0d66',
      card: ['#1d1038f2', '#0d0722f2'],
      offer: ['#22133f', '#120a26'],
      panel: ['#120a26f0', '#080414f8'],
    },
  },
};

export const THEMES: Record<Theme['id'], Theme> = {
  broadcastClassic: BROADCAST_CLASSIC,
  toxicThunder: TOXIC_THUNDER,
  nightGame: NIGHT_GAME,
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
  const u = t.m.ui;
  set('--m-page-a', u.page[0]);
  set('--m-page-b', u.page[1]);
  set('--m-page-glow', u.pageGlow);
  set('--m-bezel-a', u.bezel[0]);
  set('--m-bezel-b', u.bezel[1]);
  set('--m-screen-a', u.screen[0]);
  set('--m-screen-b', u.screen[1]);
  set('--m-screen-border', u.screenBorder);
  set('--m-strip-a', u.strip[0]);
  set('--m-strip-b', u.strip[1]);
  set('--m-label', u.label);
  set('--gold', u.frame);
  set('--gold-hi', u.frameHi);
  set('--m-btn-a', u.button[0]);
  set('--m-btn-b', u.button[1]);
  set('--m-btn-text', u.buttonText);
  set('--m-btn-edge', u.buttonEdge);
  set('--m-card-a', u.card[0]);
  set('--m-card-b', u.card[1]);
  set('--m-offer-a', u.offer[0]);
  set('--m-offer-b', u.offer[1]);
  set('--m-panel-a', u.panel[0]);
  set('--m-panel-b', u.panel[1]);
  set('--m-trim', t.m.trim);
  set('--m-mult-glow', t.m.multGlow);
  set('--m-mult-stitch', t.m.multStitch);
  set('--ui-accent-faint', t.energyPrimary + '55');
}
