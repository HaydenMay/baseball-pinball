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

test('palettes are complete: every role present and a valid #rrggbb color', () => {
  const roles = Object.keys(BROADCAST_CLASSIC) as (keyof Theme)[];
  assert.ok(roles.length >= 20);
  for (const t of Object.values(THEMES)) {
    assert.deepEqual(Object.keys(t).sort(), [...roles].sort(), `${t.name} has exactly the theme roles`);
    for (const k of roles) {
      if (k === 'id' || k === 'name') continue;
      const v = t[k];
      if (k === 'energyOutline' && v === null) continue;
      assert.match(String(v), /^#[0-9a-f]{6}$/i, `${t.name}.${k}`);
    }
    // derived colors resolve once per theme and are cached
    assert.equal(derived(t), derived(t));
  }
  assert.equal(THEMES[TOXIC_THUNDER.id], TOXIC_THUNDER);
});

test('Broadcast Classic tokens are locked to the shipped default look', () => {
  assert.deepEqual(BROADCAST_CLASSIC, {
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
  assert.match(vite, /MAP_ROUTES = \['1', '2', '3', 'build-test'\]/);
  for (const [path, id] of [['/baseball-pinball/', 'baseline'], ['/baseball-pinball/1/', 'sidewinder'], ['/baseball-pinball/2/', 'overpass'], ['/baseball-pinball/3/', 'powerhouse']] as const) {
    assert.equal(presetForPath(path).id, id);
  }
  assert.ok(isBuildRoute('/baseball-pinball/build-test/'));
});
