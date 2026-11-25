/**
 * Build the itch.io upload: `npm run package:itch` → release/moonshot-pinball-itch.zip
 *
 * itch serves an HTML5 game from the zip's root index.html at its own URL (…/html/<id>/index.html), so the
 * route folders GitHub Pages uses (/play/, /1/ …) mean nothing there. This copies the built site, makes the
 * root index.html the player game (`<html data-entry="play">`, see src/core/entry.ts) and drops the
 * comparison/legacy route folders. Upload the zip on itch as "This file will be played in the browser".
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DIST = 'dist', OUT = 'release/itch', ZIP = 'release/moonshot-pinball-itch.zip';
const ROUTE_DIRS = ['1', '2', '3', 'play', 'build-test', 'build-test-legacy'];

if (!existsSync(`${DIST}/play/index.html`)) throw new Error('Run `npm run build` first (dist/play/index.html missing).');
rmSync(OUT, { recursive: true, force: true });
rmSync(ZIP, { force: true });
mkdirSync(OUT, { recursive: true });
cpSync(DIST, OUT, { recursive: true, filter: src => !ROUTE_DIRS.some(r => src === `${DIST}/${r}` || src.startsWith(`${DIST}/${r}/`)) });

let html = readFileSync(`${DIST}/play/index.html`, 'utf8').replaceAll('"../assets/', '"./assets/');
if (!/<html[^>]*data-entry=/.test(html)) html = html.replace('<html', '<html data-entry="play"');
writeFileSync(`${OUT}/index.html`, html);

// Home Screen installs come from the direct URL, not the itch frame; the manifest still has to point at the page
const mf = `${OUT}/manifest.webmanifest`;
if (existsSync(mf)) {
  const m = JSON.parse(readFileSync(mf, 'utf8'));
  m.start_url = './';
  writeFileSync(mf, JSON.stringify(m, null, 2));
}
execSync(`cd ${OUT} && zip -qr ../${ZIP.split('/').pop()} .`);
console.log(`itch package: ${ZIP}`);
