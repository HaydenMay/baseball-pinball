import { defineConfig, type Plugin } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

/** Build identifier for developer run reports (see src/telemetry/build-info.ts). */
function buildInfo() {
  let commit = process.env.GITHUB_SHA ?? '';
  if (!commit) {
    try {
      commit = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      commit = 'unknown';
    }
  }
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version as string;
  return { version, commit, builtAt: new Date().toISOString() };
}

/**
 * Map routes for static hosting (GitHub Pages has no SPA fallback):
 * after the build, write dist/1/index.html, dist/2/index.html, dist/3/index.html as copies of the
 * main page with asset URLs pointing one folder up. The page reads location.pathname to pick its map,
 * so /1 (redirected to /1/ by Pages), /2 and /3 load directly and survive a refresh.
 */
const MAP_ROUTES = ['1', '2', '3', 'build-test', 'build-test-legacy'];
function mapRoutes(): Plugin {
  let outDir = 'dist';
  return {
    name: 'map-routes',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const html = readFileSync(join(outDir, 'index.html'), 'utf8');
      const nested = html.replaceAll('"./assets/', '"../assets/');
      for (const r of MAP_ROUTES) {
        mkdirSync(join(outDir, r), { recursive: true });
        writeFileSync(join(outDir, r, 'index.html'), nested);
      }
    },
  };
}

export default defineConfig({ base: './', plugins: [mapRoutes()], define: { __BUILD_INFO__: JSON.stringify(buildInfo()) } });
