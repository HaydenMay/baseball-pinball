import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assetRoot, packagedEntry, routePathname } from '../src/core/entry.ts';
import { isV2Route, saveRouteFor } from '../src/machines/presets.ts';

const page = (entry?: string) => ({ documentElement: { dataset: entry ? { entry } : {} } }) as any;

test('itch package: the page marker makes any URL the player game, assets next to the page', () => {
  const itchUrl = '/html/12345678/index.html';
  const entry = packagedEntry(page('play'));
  assert.equal(entry, 'play');
  const route = routePathname(itchUrl, entry);
  assert.ok(isV2Route(route, ''));
  assert.equal(saveRouteFor(route), 'build-test', 'same save slot as the web game');
  assert.equal(assetRoot(itchUrl, entry), './');
});

test('GitHub Pages: no marker, the URL decides as before', () => {
  assert.equal(packagedEntry(page()), null);
  assert.equal(routePathname('/baseball-pinball/2/', null), '/baseball-pinball/2/');
  assert.equal(assetRoot('/baseball-pinball/play/', null), '../');
  assert.equal(assetRoot('/baseball-pinball/', null), './');
});
