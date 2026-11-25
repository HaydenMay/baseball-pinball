import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BROADCAST_CLASSIC, DEFAULT_THEME, THEMES, TOXIC_THUNDER, derived, themeFromSearch, type Theme } from '../src/view/theme.ts';
import { presetForPath, isBuildRoute } from '../src/machines/presets.ts';

test('theme selection: ?theme=toxicThunder previews it; default and unknown values fall back to Broadcast Classic', () => {
  assert.equal(themeFromSearch(''), BROADCAST_CLASSIC);
  assert.equal(DEFAULT_THEME, BROADCAST_CLASSIC);
  assert.equal(themeFromSearch('?theme=toxicThunder'), TOXIC_THUNDER);
  assert.equal(themeFromSearch('?theme=toxicthunder'), TOXIC_THUNDER, 'case-insensitive');
  assert.equal(themeFromSearch('?debug&theme=toxicThunder'), TOXIC_THUNDER, 'combines with other params');
  assert.equal(themeFromSearch('?theme=broadcastClassic'), BROADCAST_CLASSIC);
  for (const bad of ['?theme=', '?theme=neon', '?theme=constructor', '?theme=__proto__', '?theme=%E0%A4%A', '?theme=toxicThunder2']) {
    assert.equal(themeFromSearch(bad), BROADCAST_CLASSIC, `fallback for ${bad}`);
  }
});

/** Walks a theme value, returning [path, leaf] pairs and a shape signature for key-set comparison. */
function leaves(v: unknown, path = ''): [string, unknown][] {
  if (v !== null && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => leaves(x, path ? `${path}.${k}` : k));
  return [[path, v]];
}

test('palettes are complete: every role present and a valid #rrggbb(aa) color', () => {
  const roles = leaves(BROADCAST_CLASSIC).map(([p]) => p);
  assert.ok(roles.length >= 60);
  for (const t of Object.values(THEMES)) {
    // `neon` (strength) and `neonKit` (optional playfield tubes, Night Game only) aren't shared color roles
    const ls = leaves(t).filter(([p]) => p !== 'neon' && !p.startsWith('neonKit.'));
    if (t.neonKit) {
      for (const c of [t.neonKit.rail, t.neonKit.lane, t.neonKit.ramp, t.neonKit.target, t.neonKit.gate, t.neonKit.core]) assert.match(c, /^#[0-9a-f]{6}$/i, `${t.name} neon color`);
      assert.ok(t.neonKit.width > 0 && t.neonKit.glow > 0 && t.neonKit.strength > 0 && t.neonKit.strength <= 1);
    }
    // Same shape, including material arrays of the same length (crowd may differ in length).
    const norm = (p: string) => p.replace(/^m\.crowd\.\d+$/, 'm.crowd.#');
    assert.deepEqual([...new Set(ls.map(([p]) => norm(p)))].sort(), [...new Set(roles.map(norm))].sort(), `${t.name} has exactly the theme roles`);
    for (const [p, v] of ls) {
      if (p === 'id' || p === 'name') continue;
      if (p === 'energyOutline' && v === null) continue;
      assert.match(String(v), /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, `${t.name}.${p}`);
    }
    assert.ok(t.m.crowd.length >= 3, `${t.name} crowd has variety`);
    // derived colors resolve once per theme and are cached
    assert.equal(derived(t), derived(t));
  }
  assert.equal(THEMES[TOXIC_THUNDER.id], TOXIC_THUNDER);
  for (const t of Object.values(THEMES)) assert.ok(t.neon === undefined || (t.neon >= 0 && t.neon <= 2), `${t.name}.neon`);
});

test('Broadcast Classic tokens are locked to the shipped default look', () => {
  const { m, ...roles } = BROADCAST_CLASSIC;
  // Materials equal the literals the table was drawn with before themes existed (pixel diff proves it).
  assert.deepEqual(m, JSON.parse(readFileSync(new URL('./fixtures/classic-materials.json', import.meta.url), 'utf8')));
  assert.deepEqual(roles, {
    id: 'broadcastClassic', name: 'Broadcast Classic',
    machineGlow: '#ffb347', energyPrimary: '#3fd8ff', energySecondary: '#ff4fd8', impactCore: '#ffffff', jackpotAccent: '#ffd76a',
    ballTrail: '#6fe6ff', scoreboardAccent: '#ffcb5c', scoreboardValue: '#6fe6ff', scoreboardBar: '#ffe58e',
    slingBody: '#3d8cff', slingDeep: '#0d2f7a', slingFace: '#9fd4ff', slingGlow: '#4fb2ff',
    railLight: '#ffd998', railBulb: '#fff3d6', cabinetGlow: '#3a6fd8', rampGlass: '#96d7ff', lampOff: '#2a3550',
    lampOffAccent: '#5b4a25', lampOffSecondary: '#5a2a55', uiAccent: '#6fe6ff', energyOutline: null,
  });
});

function hue(hex: string) {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
function isGreen(hex: string) {
  const h = hue(hex);
  return h >= 75 && h <= 165;
}

test('no green-on-green: green energy needs a dark underlay; the ball trail and slingshots never turn turf-green', () => {
  for (const t of Object.values(THEMES)) {
    if (isGreen(t.energyPrimary) || isGreen(t.machineGlow)) assert.ok(t.energyOutline, `${t.name} has green energy, so it needs energyOutline`);
    assert.ok(!isGreen(t.ballTrail), `${t.name} ball trail is not green`);
    const slingHue = hue(t.slingBody);
    assert.ok(slingHue >= 200 && slingHue <= 260, `${t.name} slingshots stay recognizably blue (hue ${slingHue.toFixed(0)})`);
    assert.equal(t.impactCore.toLowerCase(), '#ffffff', 'white-hot impact cores');
  }
});

const SRC = new URL('../src/', import.meta.url).pathname;
function files(dir: string): string[] {
  return readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
}

test('presentation never enters gameplay: physics, rules, scoring, machines and run logic import nothing from view/theme', () => {
  const logic = [...files('physics'), ...files('core'), ...files('machines'), 'run/run.ts', 'run/catalog.ts', 'run/economy.ts', 'config.ts'];
  assert.ok(logic.length >= 10);
  for (const f of logic) {
    const src = readFileSync(join(SRC, f), 'utf8');
    const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1]);
    for (const imp of imports) assert.ok(!/view\//.test(imp) && !/theme/.test(imp), `${f} imports ${imp}`);
    assert.ok(!/\btheme\b/i.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '')), `${f} mentions theme in code`);
  }
});

test('routes are path-based and unaffected by ?theme=', () => {
  const vite = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(vite, /MAP_ROUTES = \['1', '2', '3', 'play', 'build-test', 'build-test-legacy'\]/);
  for (const [path, id] of [['/baseball-pinball/', 'baseline'], ['/baseball-pinball/1/', 'sidewinder'], ['/baseball-pinball/2/', 'overpass'], ['/baseball-pinball/3/', 'powerhouse']] as const) {
    assert.equal(presetForPath(path).id, id);
  }
  assert.ok(isBuildRoute('/baseball-pinball/build-test/'));
});
