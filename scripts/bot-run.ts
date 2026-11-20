/**
 * Headless bot for the /build-test/ loop: plays challenges on the evolving machine, takes a draft pick,
 * spends money in the shop, and records time-to-clear and failure rate per challenge.
 *
 *   node scripts/bot-run.ts [runs=40] [timingErrorMs=70] [seed=1] [maxChallenge=6] [strategy=any]
 *
 * Strategies (Upgrade System 2.0 playtests): any | gate | nogate | bumper | objective
 *  - any: draft prefers machines; shop buys whatever is affordable
 *  - gate: draft prefers multiplier gates and Express Lane; shop prefers Express Lane
 *  - nogate: never takes a multiplier gate
 *  - bumper: prefers bumper upgrades/generators (Sweet Spot, Hall of Fame, MVP) and bonus bumpers
 *  - objective: prefers ramps/banks and their generators (Victory Lap/Parade, Pennant)
 * Policies are deliberately simple: a tuning aid for provisional numbers, not a model of a good player.
 */
import { config } from '../src/config.ts';
import { makeControls } from '../src/core/input.ts';
import { batAngleAt } from '../src/core/swing.ts';
import { Simulation } from '../src/physics/sim.ts';
import { Run } from '../src/run/run.ts';

const STRAT = (process.argv[6] ?? 'any') as 'any' | 'gate' | 'nogate' | 'bumper' | 'objective';
const RUNS = +(process.argv[2] ?? 40), JITTER = +(process.argv[3] ?? 70) / 1000, SEED = +(process.argv[4] ?? 1), MAXC = +(process.argv[5] ?? 6);
let seed = SEED * 7919;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
let tCenter = 0;
while (batAngleAt(tCenter) > config.swing.centerAngle) tCenter += 0.0005;
const DT = 1 / config.physicsHz, g = config.gravity;

/** Play one challenge with the bot. Returns { cleared, seconds, strikes, score }. */
/** Multiplier stats across all challenges: per-strike peaks and proc counts by source. */
/** Per-part hit counts and total live seconds, for per-minute rates. */
const partHits: Record<string, number> = {};
let liveSeconds = 0;
const multStats = { strikes: 0, peakSum: 0, peakMax: 10, procs: {} as Record<string, number>, gainBySource: {} as Record<string, number> };
function playChallenge(run: Run, simSeed: number) {
  let peak = 10;
  const sim: Simulation = new Simulation({
    preset: run.preset(),
    seed: simSeed,
    onEvent: e => {
      if (e.type === 'machine' && (e.kind === 'bumper' || e.kind === 'lane')) partHits[e.id] = (partHits[e.id] ?? 0) + 1;
      if (e.type === 'mult') {
        if (e.source === 'gate') partHits[e.id] = (partHits[e.id] ?? 0) + 1;
        multStats.procs[e.source] = (multStats.procs[e.source] ?? 0) + 1;
        multStats.gainBySource[e.source] = (multStats.gainBySource[e.source] ?? 0) + e.gain;
        peak = Math.max(peak, e.total);
      } else if ((e.type === 'drain' && e.strike) || e.type === 'clear') {
        multStats.strikes++;
        multStats.peakSum += peak;
        multStats.peakMax = Math.max(multStats.peakMax, peak);
        peak = 10;
      }
    },
  });
  sim.rules.target = run.target;
  const c = makeControls();
  let plan: { at: number } | null = null, downSince = -1;
  const t0 = sim.time;
  while (sim.rules.phase !== 'cleared' && sim.rules.phase !== 'over' && sim.time - t0 < 900) {
    if (sim.rules.phase === 'ready') sim.ready();
    let best: { t: number; x: number } | null = null;
    for (const b of sim.balls) {
      if (b.mode !== 'field') continue;
      const p = b.body.getPosition(), v = b.body.getLinearVelocity();
      if (v.y <= 0.5 || p.y >= config.batter.handsY) continue;
      const disc = v.y * v.y - 2 * g * (p.y - (config.batter.handsY - 0.7));
      if (disc < 0) continue;
      const t = (-v.y + Math.sqrt(disc)) / g;
      if (!best || t < best.t) best = { t, x: p.x + v.x * t };
    }
    c.moveAxis = 0;
    if (best) {
      if (downSince < 0) downSince = sim.time;
      if (sim.time - downSince > 0.18) {
        const tx = best.x - config.swing.length * 0.62, dx = tx - sim.batterX;
        if (Math.abs(dx) > 0.08) c.moveAxis = Math.sign(dx) * Math.min(1, Math.abs(dx) / (config.batter.moveSpeed * DT * 4));
        if (!plan) plan = { at: sim.time + best.t - tCenter + gauss() * JITTER };
        if (sim.time >= plan.at && sim.swingState === 'rest') { c.swingPressed = true; plan = null; downSince = sim.time; }
      }
    } else { downSince = -1; plan = null; }
    sim.step(DT, c);
    if (sim.rules.phase === 'live') liveSeconds += DT;
  }
  return { cleared: sim.rules.phase === 'cleared', seconds: sim.time - t0, strikes: sim.rules.strikes, score: sim.rules.score };
}

const GATE_KEYS = ['mult-gate', 'express-lane'];
const BUMPER_KEYS = ['bonus-bumper', 'sweet-spot', 'hall-of-fame', 'mvp', 'hot-corner', 'power-alley', 'rally-cap'];
const OBJECTIVE_KEYS = ['turbo-ramp', 'bridge-ramp', 'bank', 'victory-lap', 'victory-parade', 'pennant', 'pennant-race', 'clutch', 'nitro', 'toll-booth', 'full-count'];
function pref(o: { key: string; kind: string }) {
  if (STRAT === 'nogate' && GATE_KEYS.includes(o.key)) return -100;
  if (STRAT === 'gate' && GATE_KEYS.includes(o.key)) return 10;
  if (STRAT === 'bumper' && BUMPER_KEYS.includes(o.key)) return 10;
  if (STRAT === 'objective' && OBJECTIVE_KEYS.includes(o.key)) return 10;
  return o.kind === 'machine' ? 1 : 0;
}

type Row = { attempts: number; clears: number; seconds: number[]; strikesUsed: number[] };
const rows = new Map<number, Row>();
const builds: string[] = [];
let powerAtEnd = 0, moneyLeft = 0;
for (let n = 0; n < RUNS; n++) {
  const run = new Run(SEED * 1000 + n);
  // PREINSTALL="mult-gate@gate-l,mult-gate@gate-r" starts every run with those machines (rate measurements).
  for (const spec of (process.env.PREINSTALL ?? '').split(',').filter(Boolean)) {
    const [key, mount] = spec.split('@');
    run.maxPower += 1;
    Object.assign(run, { phase: 'draft', draft: [{ uid: 990 + run.installed.length, kind: 'machine', key, name: key, desc: '', power: 1, price: 0, mounts: [mount] }] });
    run.takeDraft(990 + run.installed.length, mount);
    Object.assign(run, { phase: 'challenge', shop: [] });
  }
  while (run.challenge <= MAXC) {
    const r = playChallenge(run, n * 100 + run.challenge);
    const row = rows.get(run.challenge) ?? { attempts: 0, clears: 0, seconds: [], strikesUsed: [] };
    row.attempts++;
    if (!r.cleared) { rows.set(run.challenge, row); run.fail(); break; }
    row.clears++;
    row.seconds.push(r.seconds);
    row.strikesUsed.push(r.strikes);
    rows.set(run.challenge, row);
    run.clear(3 - r.strikes);
    // draft: strategy preference, else prefer a machine
    const usable = run.draft.filter(o => run.check(o).ok);
    const d = [...usable].sort((a, b) => pref(b) - pref(a))[0] ?? run.draft[0];
    const ck = run.check(d);
    run.takeDraft(d.uid, ck.ok && ck.mounts.length ? ck.mounts[Math.floor(rnd() * ck.mounts.length)] : undefined);
    // shop: buy what's affordable, machines first; one reroll if nothing affordable
    for (let pass = 0; pass < 2; pass++) {
      const order = [...run.shop].sort((a, b) => pref(b) - pref(a));
      for (const o of order) {
        if (o.price > run.money) continue;
        const c2 = run.check(o);
        if (!c2.ok) continue;
        run.buy(o.uid, o.kind === 'machine' ? c2.mounts[0] : undefined);
      }
      if (pass === 0 && !run.shop.some(o => o.price <= run.money) && run.money >= run.rerollPrice + 3) run.reroll();
    }
    run.next();
  }
  powerAtEnd += run.powerUsed;
  moneyLeft += run.money;
  if (n < 3) builds.push(`run ${n}: reached C${run.challenge}; ${run.installed.map(i => i.name).join(', ') || 'no machines'}; mods ${Object.values(run.mods).flat().length}`);
}
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
console.log(`strategy ${STRAT}, timing error ${JITTER * 1000} ms, ${RUNS} runs`);
console.log('| Challenge | Target | Attempts | Clear rate | Avg time to clear | Avg strikes used |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const [c, r] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  const target = new Run().target, t = (() => { const x = new Run(); x.challenge = c; return x.target; })();
  void target;
  console.log(`| ${c} | ${t.toLocaleString()} | ${r.attempts} | ${Math.round((r.clears / r.attempts) * 100)}% | ${avg(r.seconds).toFixed(0)} s | ${avg(r.strikesUsed).toFixed(1)} |`);
}
console.log(`avg power used at end ${(powerAtEnd / RUNS).toFixed(1)}, avg money left ${(moneyLeft / RUNS).toFixed(1)}`);
for (const b of builds) console.log(b);
const perMin = Object.entries(partHits).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / (liveSeconds / 60)).toFixed(1)}`);
console.log(`per live minute (${(liveSeconds / 60).toFixed(0)} min): ${perMin.join(', ')}`);
const fmtT = (t: number) => `×${(t / 10).toFixed(2)}`;
console.log(`multiplier: avg peak per strike ${fmtT(multStats.peakSum / Math.max(1, multStats.strikes))}, best ${fmtT(multStats.peakMax)}; procs ${JSON.stringify(multStats.procs)}; +tenths ${JSON.stringify(multStats.gainBySource)} over ${multStats.strikes} strikes`);
