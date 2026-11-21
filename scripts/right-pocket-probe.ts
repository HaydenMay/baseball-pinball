/**
 * V2.2 M3: right-side bumper pocket probe (headless, deterministic). Measurement only.
 *
 *   node --experimental-strip-types scripts/right-pocket-probe.ts [trials=300]
 *
 * For each right-side bonus-bumper loadout it (a) drops/throws balls into the right pocket region with seeded
 * positions/velocities and (b) fires bat-zone shots aimed right; it follows each ball until it leaves the
 * region and reports dwell time, hits per visit, the longest visits, repeat patterns and stalls.
 */
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';

const N = +(process.argv[2] ?? 300);
const DT = 1 / config.physicsHz;
const ZONE = { x0: 13.4, x1: 19.6, y0: 8.3, y1: 14.6 };
const inZone = (p: { x: number; y: number }) => p.x > ZONE.x0 && p.x < ZONE.x1 && p.y > ZONE.y0 && p.y < ZONE.y1;

const LOADOUTS: Record<string, { deck: boolean; parts: [string, string][] }> = {
  'cluster-r': { deck: false, parts: [['bumper-cluster', 'cluster-r']] },
  'cluster-r + bonus pocket-ur': { deck: false, parts: [['bumper-cluster', 'cluster-r'], ['bonus-bumper', 'pocket-ur']] },
  'twin flank-r': { deck: false, parts: [['twin-bumpers', 'flank-r']] },
  'twin flank-r + bonus pocket-ur + deck (V2.2)': { deck: true, parts: [['twin-bumpers', 'flank-r'], ['bonus-bumper', 'pocket-ur']] },
  'cluster-r + deck (V2.2)': { deck: true, parts: [['bumper-cluster', 'cluster-r']] },
  'factory only': { deck: false, parts: [] },
};

let rs = 12345;
const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

function probe(name: string, lo: { deck: boolean; parts: [string, string][] }) {
  const r = new Run(1);
  r.maxPower = 99;
  if (lo.deck) r.sections = ['upperDeck'];
  for (const [k, m] of lo.parts) if (!r.installForTest(k, m).ok) return console.log(`${name}: can't install ${k}@${m}`);
  const dwell: number[] = [], hits: number[] = [];
  let stalls = 0, longest = { t: 0, seq: '' };
  const win: number[] = [], reentries: number[] = [];
  rs = 12345;
  for (let i = 0; i < N; i++) {
    const ev: SimEvent[] = [];
    const s = new Simulation({ preset: r.preset(), seed: i + 1, onEvent: e => ev.push(e) });
    s.rules.target = null;
    s.ready();
    const b = s.balls[0];
    let x: number, y: number, vx: number, vy: number;
    if (i % 2) {
      // bat-zone shot aimed right (20–45°) at the locked exit speed
      const a = ((20 + 25 * rnd()) * Math.PI) / 180;
      x = 9 + 4 * rnd(); y = 24; vx = Math.sin(a) * config.swing.exitSpeed; vy = -Math.cos(a) * config.swing.exitSpeed;
    } else {
      x = ZONE.x0 + 0.5 + (ZONE.x1 - ZONE.x0 - 1.2) * rnd(); y = ZONE.y0 + 0.4 + (ZONE.y1 - ZONE.y0 - 0.8) * rnd();
      const a = rnd() * Math.PI * 2, sp = 4 + 14 * rnd();
      vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
    }
    b.body.setPosition({ x, y }); b.body.setLinearVelocity({ x: vx, y: vy }); b.prev = b.pos = { x, y };
    let t = 0, entered = false, inside = 0, still = 0, n0 = 0, done = false, reent = 0, was = false;
    // the whole 10 s window too: total right-pocket bumper hits and how often the ball comes back into it
    while (t < 10 && s.balls.length) {
      s.step(DT, makeControls()); t += DT;
      const p = s.balls[0]?.pos;
      if (!p) break;
      const iz = inZone(p) && s.balls[0].mode === 'field';
      if (iz && !was && entered) reent++;
      was = iz;
      if (done) continue;
      if (iz) {
        if (!entered) { entered = true; n0 = ev.length; }
        inside += DT;
        const v = s.balls[0].body.getLinearVelocity();
        still = Math.hypot(v.x, v.y) < 0.5 ? still + DT : 0;
        if (still > 1) { stalls++; done = true; }
      } else if (entered) done = true;
    }
    if (!entered) continue;
    const rightHits = ev.filter(e => e.type === 'machine' && (e as any).kind === 'bumper' && (e as any).x > 13.4 && (e as any).y > 8.3 && (e as any).y < 14.6);
    win.push(rightHits.length); reentries.push(reent);
    const seq = ev.slice(n0).filter(e => e.type === 'machine' && (e as any).kind === 'bumper').map(e => (e as any).id);
    dwell.push(inside); hits.push(seq.length);
    if (inside > longest.t) longest = { t: inside, seq: seq.slice(0, 24).join(' ') };
  }
  const q = (a: number[], f: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))] ?? 0; };
  console.log(`\n${name}: visits ${dwell.length}/${N} · dwell p50 ${q(dwell, .5).toFixed(2)}s p90 ${q(dwell, .9).toFixed(2)}s p99 ${q(dwell, .99).toFixed(2)}s max ${q(dwell, 1).toFixed(2)}s · bumper hits/visit p50 ${q(hits, .5)} p90 ${q(hits, .9)} max ${q(hits, 1)} · stalls ${stalls} · visits ≥10s ${dwell.filter(d => d >= 10).length}`);
  console.log(`  longest: ${longest.t.toFixed(1)}s → ${longest.seq}`);
  console.log(`  10 s window: right-pocket bumper hits p50 ${q(win, .5)} p90 ${q(win, .9)} p99 ${q(win, .99)} max ${q(win, 1)} · pocket re-entries p50 ${q(reentries, .5)} p90 ${q(reentries, .9)} max ${q(reentries, 1)} · single visits with ≥10 hits ${hits.filter(h => h >= 10).length}`);
}
for (const [k, v] of Object.entries(LOADOUTS)) probe(k, v);
