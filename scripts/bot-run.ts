/**
 * Headless bot for the /build-test/ loop: plays challenges on the evolving machine, takes a draft pick,
 * spends money in the shop, and records time-to-clear and failure rate per challenge.
 *
 *   node scripts/bot-run.ts [runs=40] [timingErrorMs=70] [seed=1] [maxChallenge=6] [strategy=any]
 *
 * Env switches: BOT_GROWTH=1.6, BOT_POWER=flat5, BOT_RAMPS=legacy (old values, for comparisons).
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
import { ECONOMY } from '../src/run/economy.ts';
import { MACHINES } from '../src/run/catalog.ts';
import { writeFileSync } from 'node:fs';
import { RunRecorder } from '../src/telemetry/run-recorder.ts';
import { renderReport } from '../src/telemetry/report-html.ts';

// BOT_REPORT=path.html: record the FIRST bot run with the developer run recorder and write its HTML report
// (synthetic test data, labeled as such). Clock = simulated time.
let botNow = Date.UTC(2026, 10, 20, 17, 0);
const REC_PATH = process.env.BOT_REPORT;
let REC: RunRecorder | null = null;

// Balance-comparison switches (env): BOT_GROWTH=1.6, BOT_POWER=flat5 (old flat 5 Power, no inning grants),
// BOT_RAMPS=legacy (old gate + finish payouts instead of 8 × 1,000 checkpoints).
if (process.env.BOT_GROWTH) ECONOMY.targetGrowth = +process.env.BOT_GROWTH;
if (process.env.BOT_POWER === 'flat5') Object.assign(ECONOMY, { startPower: 5, powerPerInning: 0 });
if (process.env.BOT_RAMPS === 'legacy') for (const m of MACHINES) for (const d of Object.values(m.at)) if (d.type === 'ramp') delete d.checkpoints;
const rampStats = { enter: 0, complete: 0, checkpoints: 0, points: 0, allPoints: 0 };

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
      REC?.onEvent(e, sim);
      if (e.type === 'ramp' && e.phase === 'enter') rampStats.enter++;
      if (e.type === 'ramp' && e.phase === 'complete') { rampStats.complete++; rampStats.points += e.points; }
      if (e.type === 'rampGate') rampStats.points += e.points;
      if (e.type === 'rampCheckpoint') { rampStats.checkpoints++; rampStats.points += e.points; }
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
  REC?.startChallenge(run, sim.rules.maxStrikes);
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
    botNow += DT * 1000;
    REC?.tick(DT * 1000, sim.rules.phase === 'live');
    if (sim.rules.phase === 'live') liveSeconds += DT;
  }
  rampStats.allPoints += sim.rules.score;
  return { cleared: sim.rules.phase === 'cleared', seconds: sim.time - t0, strikes: sim.rules.strikes, score: sim.rules.score, sim };
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
let powerAtEnd = 0, moneyLeft = 0, maxPowerAtEnd = 0, machinesAtEnd = 0, reached = 0, usableDraftMisses = 0, emptyShops = 0;
for (let n = 0; n < RUNS; n++) {
  const run = new Run(SEED * 1000 + n);
  REC = REC_PATH && n === 0 ? new RunRecorder({ store: null, build: { version: 'bot', commit: 'synthetic', builtAt: '' }, now: () => botNow }) : null;
  REC?.startRun({ route: '/build-test/ (headless bot)', theme: 'n/a', runSeed: SEED * 1000 + n });
  REC?.rec!.notes.push('SYNTHETIC TEST DATA: played by the headless bot (scripts/bot-run.ts), not a human playtest.');
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
    if (!r.cleared) {
      rows.set(run.challenge, row);
      REC?.endChallenge(run, r.sim, 'failed');
      run.fail();
      REC?.endRun('failed');
      break;
    }
    REC?.endChallenge(run, r.sim, 'cleared');
    row.clears++;
    row.seconds.push(r.seconds);
    row.strikesUsed.push(r.strikes);
    rows.set(run.challenge, row);
    const earned = run.clear(3 - r.strikes);
    REC?.afterClear(run, earned);
    botNow += 20_000;
    if (!run.draft.some(o => run.check(o).ok)) usableDraftMisses++;
    // draft: strategy preference, else prefer a machine
    const usable = run.draft.filter(o => run.check(o).ok);
    const d = [...usable].sort((a, b) => pref(b) - pref(a))[0] ?? run.draft[0];
    const ck = run.check(d);
    const declined = run.draft.filter(o => o !== d);
    if (run.takeDraft(d.uid, ck.ok && ck.mounts.length ? ck.mounts[Math.floor(rnd() * ck.mounts.length)] : undefined).ok && REC) {
      REC.draftTaken(run, d, declined, d.kind === 'machine' ? run.installed[run.installed.length - 1].mountId : undefined);
      REC.shopOffers(run, 'open');
    }
    // shop: buy what's affordable, machines first; one reroll if nothing affordable
    if (!run.shop.length) emptyShops++;
    for (let pass = 0; pass < 2; pass++) {
      const order = [...run.shop].sort((a, b) => pref(b) - pref(a));
      for (const o of order) {
        if (o.price > run.money) continue;
        const c2 = run.check(o);
        if (!c2.ok) continue;
        const mb = run.money;
        if (run.buy(o.uid, o.kind === 'machine' ? c2.mounts[0] : undefined).ok) REC?.purchase(run, o, mb);
      }
      if (pass === 0 && !run.shop.some(o => o.price <= run.money) && run.money >= run.rerollPrice + 3) {
        const price = run.rerollPrice, mb = run.money;
        if (run.reroll() && REC) {
          REC.reroll(run, price, mb);
          REC.shopOffers(run, 'reroll');
        }
      }
    }
    run.next();
    REC?.nextChallenge(run);
    botNow += 15_000;
  }
  if (REC && REC_PATH) {
    if (REC.rec!.outcome === 'in-progress') {
      // Stopped by the bot's challenge limit, not a loss: say so instead of inventing an outcome.
      REC.rec!.outcome = 'interrupted';
      REC.rec!.endedAt = botNow;
      REC.rec!.notes.push(`Stopped by the bot's challenge limit (C${MAXC}).`);
    }
    writeFileSync(REC_PATH, renderReport(REC.snapshot()!));
    console.log(`wrote synthetic report ${REC_PATH} (run reached C${run.challenge})`);
  }
  powerAtEnd += run.powerUsed;
  maxPowerAtEnd += run.maxPower;
  machinesAtEnd += run.installed.length;
  reached += run.challenge;
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
console.log(`config: growth ×${ECONOMY.targetGrowth}, Power ${process.env.BOT_POWER === 'flat5' ? 'flat 5' : `${ECONOMY.startPower} +${ECONOMY.powerPerInning}/inning`}, ramps ${process.env.BOT_RAMPS === 'legacy' ? 'legacy gate+finish' : '8 × 1,000 checkpoints'}`);
console.log(`avg challenge reached ${(reached / RUNS).toFixed(1)}; avg machines ${(machinesAtEnd / RUNS).toFixed(1)}, Power ${(powerAtEnd / RUNS).toFixed(1)}/${(maxPowerAtEnd / RUNS).toFixed(1)}; drafts with no usable pick ${usableDraftMisses}; empty shops ${emptyShops}`);
console.log(`ramps: entries ${rampStats.enter}, full rides ${rampStats.complete}, checkpoints ${rampStats.checkpoints}, ramp points ${rampStats.points.toLocaleString()} = ${((100 * rampStats.points) / Math.max(1, rampStats.allPoints)).toFixed(1)}% of all points`);
console.log(`avg power used at end ${(powerAtEnd / RUNS).toFixed(1)}, avg money left ${(moneyLeft / RUNS).toFixed(1)}`);
for (const b of builds) console.log(b);
const perMin = Object.entries(partHits).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / (liveSeconds / 60)).toFixed(1)}`);
console.log(`per live minute (${(liveSeconds / 60).toFixed(0)} min): ${perMin.join(', ')}`);
const fmtT = (t: number) => `×${(t / 10).toFixed(2)}`;
console.log(`multiplier: avg peak per strike ${fmtT(multStats.peakSum / Math.max(1, multStats.strikes))}, best ${fmtT(multStats.peakMax)}; procs ${JSON.stringify(multStats.procs)}; +tenths ${JSON.stringify(multStats.gainBySource)} over ${multStats.strikes} strikes`);
