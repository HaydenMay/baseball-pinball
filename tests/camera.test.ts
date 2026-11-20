/**
 * V2 fixed-anchor zoom camera: display-only model tests.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { CAMERA, Camera, cameraBalls, visibleRect, zoomFor, type CamBall } from '../src/view/camera.ts';
import { Simulation } from '../src/physics/sim.ts';
import { Run } from '../src/run/run.ts';
import { config } from '../src/config.ts';

// Same rectangle GameView shows at 100% (game.ts can't be imported in Node: it touches the DOM).
const VIEW = { x0: -0.9, y0: -1.7, w: 21.8, h: 34.1 };
const PPU = 40;
const frames = (cam: Camera, balls: CamBall[], seconds: number, dt = 1 / 60) => {
  const zs: number[] = [];
  for (let t = 0; t < seconds; t += dt) zs.push(cam.update(balls, dt));
  return zs;
};

test('the 100% view matches the game view and is the closest zoom; in-bounds balls give exactly 1', () => {
  assert.match(readFileSync(new URL('../src/view/game.ts', import.meta.url), 'utf8'), /export const VIEW = \{ x0: -0\.9, y0: -1\.7, w: 21\.8, h: 34\.1 \}/);
  const cam = new Camera(VIEW);
  // anywhere on the original table, incl. the corners and the drain
  for (const p of [{ x: 10, y: 25 }, { x: 1, y: 1 }, { x: 19, y: 1 }, { x: 10, y: 31 }, { x: 0.6, y: 20 }]) assert.equal(cam.target([p]), 1, JSON.stringify(p));
  frames(cam, [{ x: 10, y: 0.7 }], 2);
  assert.equal(cam.zoom, 1, 'a ball at the top wall stays at today\'s framing');
  // fast balls inside the table (e.g. heading into the drain, or along the walls) never zoom the camera
  for (const b of [{ x: 10, y: 31.5, vx: 0, vy: 25 }, { x: 0.8, y: 12, vx: -25, vy: 0 }, { x: 19.2, y: 3, vx: 20, vy: -20 }, { x: 10, y: 1, vx: 0, vy: -26 }]) {
    const c = new Camera(VIEW);
    frames(c, [b], 0.5);
    assert.equal(c.zoom, 1, JSON.stringify(b));
  }
  // never above 1, whatever the input
  for (const z of frames(cam, [{ x: 10, y: 10 }, { x: 10, y: 12 }], 1)) assert.ok(z <= 1);
});

test('the anchor (batter\'s hands) projects to the same pixel at every zoom; nothing else moves the view', () => {
  const cam = new Camera(VIEW);
  const at1 = cam.project(PPU, CAMERA.anchor);
  for (const z of [1, 0.95, 0.88, 0.8, CAMERA.minZoom]) {
    cam.zoom = z;
    const p = cam.project(PPU, CAMERA.anchor);
    assert.ok(Math.abs(p.x - at1.x) < 1e-9 && Math.abs(p.y - at1.y) < 1e-9, `zoom ${z}`);
  }
  // with two far-apart balls (one high, one at the bat) the transform still only depends on the zoom
  cam.reset();
  frames(cam, [{ x: 10, y: -5 }, { x: 10, y: 24 }], 1);
  const t = cam.transform(PPU), s = cam.zoom * PPU;
  assert.ok(Math.abs(t.e - ((CAMERA.anchor.x - VIEW.x0) * PPU - CAMERA.anchor.x * s)) < 1e-9);
  assert.ok(Math.abs(t.f - ((CAMERA.anchor.y - VIEW.y0) * PPU - CAMERA.anchor.y * s)) < 1e-9);
  // anchor at the hands: zoom-out reveals mostly the top (batter stays put)
  const r = visibleRect(VIEW, 0.8);
  const extraTop = VIEW.y0 - r.y0, extraBottom = r.y0 + r.h - (VIEW.y0 + VIEW.h);
  assert.ok(extraTop > 3 * extraBottom, `top +${extraTop.toFixed(1)} vs bottom +${extraBottom.toFixed(1)}`);
});

test('a ball rising above the view: zoom out before it leaves; it stays inside the padded view; then back to exactly 1', () => {
  const cam = new Camera(VIEW);
  // rise from the table top to y = -5 over 0.6 s, then fall back to the bat
  for (let t = 0; t <= 0.6; t += 1 / 120) {
    const y = 0.5 - (5.5 * t) / 0.6;
    cam.update([{ x: 10, y, vx: 0, vy: -9 }], 1 / 120);
    const r = visibleRect(VIEW, cam.zoom);
    assert.ok(y - 0.32 > r.y0, `ball stays visible at y=${y.toFixed(2)} (view top ${r.y0.toFixed(2)})`);
  }
  assert.ok(cam.zoom < 1 && cam.zoom >= CAMERA.minZoom);
  // falling back toward the bat: by the batting zone the view is exactly 100%
  let y = -5, vy = 0, reached = false;
  for (let i = 0; i < 600 && y < 24; i++) {
    vy += config.gravity / 120;
    y += vy / 120;
    cam.update([{ x: 10, y, vx: 0, vy }], 1 / 120);
    if (y > CAMERA.batZoneY && !reached) {
      reached = true;
      assert.equal(cam.zoom, 1, `100% before the ball reaches the batting zone (y=${y.toFixed(1)})`);
    }
  }
  assert.ok(reached);
});

test('multiball: least zoom-out that fits every ball; removing one never jumps; no oscillation at a boundary', () => {
  const cam = new Camera(VIEW);
  const high = { x: 10, y: -4 }, low = { x: 10, y: 24 }, side = { x: 21.2, y: 10 };
  const need = Math.min(zoomFor(VIEW, high), zoomFor(VIEW, low), zoomFor(VIEW, side));
  frames(cam, [high, low, side], 2);
  assert.ok(Math.abs(cam.zoom - Math.max(need, CAMERA.minZoom)) < 1e-3, `${cam.zoom} vs ${need}`);
  // the high ball drains: zoom-in is gradual, never a jump
  const z0 = cam.zoom;
  const next = cam.update([low, side], 1 / 60);
  assert.ok(next - z0 < 0.08, `step ${(next - z0).toFixed(3)}`);
  // a ball jittering across the zoom threshold doesn't make the camera hunt
  const c2 = new Camera(VIEW);
  frames(c2, [{ x: 10, y: -1.0 }], 1);
  const zs = frames(c2, [], 0).concat(Array.from({ length: 240 }, (_, i) => c2.update([{ x: 10, y: -1.0 + (i % 2 ? 0.02 : -0.02) }], 1 / 120)));
  let flips = 0;
  for (let i = 2; i < zs.length; i++) if (Math.sign(zs[i] - zs[i - 1]) && Math.sign(zs[i] - zs[i - 1]) !== Math.sign(zs[i - 1] - zs[i - 2]) && Math.sign(zs[i - 1] - zs[i - 2])) flips++;
  assert.ok(flips <= 2, `${flips} direction flips`);
});

test('paused / Ready freeze the camera; floor clamp; balls beyond the floor get offscreen indicators', () => {
  const cam = new Camera(VIEW);
  frames(cam, [{ x: 10, y: -3 }], 1);
  const z = cam.zoom;
  assert.equal(cam.update([{ x: 10, y: 20 }], 1 / 60, true), z, 'paused: unchanged');
  assert.equal(cam.update([{ x: 10, y: 20 }], 0), z, 'dt 0 (Ready/menus): unchanged');
  const far = new Camera(VIEW);
  frames(far, [{ x: 10, y: -40 }], 1);
  assert.equal(far.zoom, CAMERA.minZoom, 'never wider than the readability floor');
  assert.equal(far.offscreen.length, 1, 'beyond the floor: flagged for an indicator, not claimed visible');
  assert.ok(far.stats.secondsBelow100 > 0 && far.stats.minZoom === CAMERA.minZoom);
});

test('every live ball mode is framed at its drawn position (ramp/held/drop are not their stale Planck body)', () => {
  const r = new Run(1);
  r.installForTest('turbo-ramp', 'orbit-l');
  const sim = new Simulation({ preset: r.preset() });
  sim.ready();
  const b = sim.balls[0];
  const rp = sim.layout.ramps[0];
  (sim as any).enterRamp(b, rp, rp.def.maxRide);
  for (let i = 0; i < 60; i++) sim.step(1 / 240, { swingPressed: false, dragDelta: 0, moveAxis: 0 } as any);
  assert.equal(b.mode, 'ramp');
  b.body.setPosition({ x: 10, y: 30 }); // stale body far from the drawn ball
  const [cb] = cameraBalls(sim);
  assert.deepEqual({ x: cb.x, y: cb.y }, { x: b.pos.x, y: b.pos.y });
  assert.equal(cb.vy, undefined, 'no body velocity for a non-field ball');
  for (const mode of ['held', 'drop', 'ramp', 'field']) {
    (b as any).mode = mode;
    assert.equal(cameraBalls(sim).length, 1, mode);
  }
});

test('display only: batter drag stays world-constant at every zoom; the camera never touches the sim', () => {
  const game = readFileSync(new URL('../src/view/game.ts', import.meta.url), 'utf8');
  // cssToWorld is unchanged and has no zoom term
  assert.match(game, /cssToWorld\(dxCss: number, cssWidth: number\) \{\s*return \(dxCss \/ cssWidth\) \* VIEW\.w;\s*\}/);
  const cam = readFileSync(new URL('../src/view/camera.ts', import.meta.url), 'utf8');
  assert.ok(!/\.setPosition|\.step\(|rules\.|random\(/.test(cam.replace(/^.*cameraBalls[\s\S]*$/m, '')), 'camera has no sim side effects');
  // the camera only reads: framing a sim leaves positions untouched
  const sim = new Simulation({ preset: new Run(2).preset() });
  sim.ready();
  const before = JSON.stringify(sim.balls.map(b => b.pos));
  const c = new Camera(VIEW);
  for (let i = 0; i < 30; i++) c.update(cameraBalls(sim), 1 / 60);
  assert.equal(JSON.stringify(sim.balls.map(b => b.pos)), before);
});
