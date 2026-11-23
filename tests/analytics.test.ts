/**
 * Developer run analytics: lifecycle, attribution, persistence/recovery, and the offline HTML report.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run, type Offer } from '../src/run/run.ts';
import { MACHINES, MODS } from '../src/run/catalog.ts';
import type { Modifier } from '../src/machines/mechanisms.ts';
import { MemoryStore, RunRecorder, STORE_KEYS, type RunRecord, type Store } from '../src/telemetry/run-recorder.ts';
import { esc, jsonForScript, renderReport, reportFilename, summarize } from '../src/telemetry/report-html.ts';

const DT = 1 / config.physicsHz;
const BUILD = { version: '1.0.0', commit: 'test-commit', builtAt: '' };

/** A fake wall clock advanced by the driver. */
function clock() {
  let t = Date.UTC(2026, 10, 20, 17, 30);
  return { now: () => t, add: (ms: number) => (t += ms) };
}

/** Headless session: Run + recorder + a sim per challenge, wired like the browser (events → recorder). */
function session(opts: { store?: Store | null; seed?: number } = {}) {
  const c = clock();
  const store = opts.store === undefined ? new MemoryStore() : opts.store;
  const rec = new RunRecorder({ store, build: BUILD, now: c.now });
  const run = new Run(opts.seed ?? 5);
  let sim!: Simulation;
  const events: SimEvent[] = [];
  const load = (target: number | null = run.target) => {
    sim = new Simulation({ preset: run.preset(), seed: 99, onEvent: e => (events.push(e), rec.onEvent(e, sim)) });
    sim.rules.target = target;
    return sim;
  };
  const startChallenge = (target: number | null = run.target) => {
    load(target);
    rec.startChallenge(run, sim.rules.maxStrikes);
    return sim;
  };
  /** Serve and step a live pitch until a strike drain, a clear, or `seconds`. Counts active time. */
  const pitch = (during?: (s: Simulation, i: number) => void, seconds = 25) => {
    sim.ready();
    const ctl = makeControls();
    for (let i = 0; i < seconds / DT; i++) {
      during?.(sim, i);
      sim.step(DT, ctl);
      c.add(DT * 1000);
      rec.tick(DT * 1000, sim.rules.phase === 'live');
      if (sim.rules.phase !== 'live') break;
    }
    return sim;
  };
  rec.startRun({ route: '/build-test/', theme: 'broadcastClassic', runSeed: opts.seed ?? 5 });
  return { rec, run, store, clock: c, events, get sim() { return sim; }, load, startChallenge, pitch };
}

function install(r: Run, key: string, mount?: string) {
  const m = MACHINES.find(m => m.key === key)!;
  const o: Offer = { uid: 9000 + r.installed.length, kind: 'machine', key, name: m.name, desc: m.desc, power: m.power, price: m.price, mounts: Object.keys(m.at) };
  const phase = r.phase, shop = r.shop;
  r.phase = 'draft';
  r.draft = [o];
  const res = r.takeDraft(o.uid, mount);
  Object.assign(r, { phase, shop, draft: [] });
  return res;
}
const addMod = (r: Run, key: string, target: string) => {
  const t = MODS.find(t => t.key === key)!;
  const m: Modifier = { note: t.name };
  if (t.add) m.add = t.add;
  if (t.mul) m.mul = t.mul;
  if (t.gen) m.gen = { ...t.gen };
  (r.mods[target] ??= []).push(m);
};
/** Drop a ball onto a bumper a few times so it scores. */
const bumperDrops = (s: Simulation, id = 'bumper-left', every = 30, limit = 10) => (sim: Simulation, i: number) => {
  if (i % every || i / every >= limit) return;
  const b = sim.layout.bumpers.find(b => b.id === id)!;
  (sim as any).addBall(b.x, b.y - b.r - 0.6, 0, 8);
  sim.rules.addBall();
  void s;
};

// ───────── strikes, clears, multiplier ─────────

test('three strikes are three pitch records plus one failed challenge and a failed, archived run', () => {
  const S = session();
  S.startChallenge(1e9);
  for (let k = 0; k < 3; k++) S.pitch();
  assert.equal(S.sim.rules.phase, 'over');
  const c = S.rec.endChallenge(S.run, S.sim, 'failed')!;
  S.run.fail();
  S.rec.endRun('failed');
  assert.equal(c.pitches.length, 3);
  assert.deepEqual(c.pitches.map(p => p.n), [1, 2, 3]);
  assert.ok(c.pitches.every(p => p.outcome === 'drain' && p.drainSide));
  assert.equal(c.strikesUsed, 3);
  assert.equal(c.outcome, 'failed');
  // finalized exactly once
  assert.equal(S.rec.endChallenge(S.run, S.sim, 'failed'), null);
  assert.equal(S.rec.rec!.challenges.length, 1);
  assert.equal(S.rec.rec!.outcome, 'failed');
  assert.equal(S.rec.lastRun()!.runId, S.rec.rec!.runId, 'terminal run archived as "last"');
  assert.equal(S.store!.get(STORE_KEYS.current), null);
});

test('a clear during a live ball records the final pitch as "clear" with no phantom strike', () => {
  const S = session();
  S.startChallenge(200);
  S.pitch(bumperDrops(S.sim));
  assert.equal(S.sim.rules.phase, 'cleared');
  const c = S.rec.endChallenge(S.run, S.sim, 'cleared')!;
  assert.equal(c.pitches.length, 1);
  assert.equal(c.pitches[0].outcome, 'clear');
  assert.equal(c.strikesUsed, 0);
  assert.equal(c.pitches[0].points, c.score);
  assert.ok(c.score >= 200);
  assert.equal(c.unattributed, 0, 'every banked point attributed');
});

test('the global multiplier carries into pitches 2 and 3 and resets next challenge; recording never changes points', () => {
  const S = session();
  S.startChallenge(1e9);
  S.pitch((s, i) => {
    if (i === 10) s.rules.gainMult(5);
  });
  S.pitch();
  S.pitch();
  const c = S.rec.endChallenge(S.run, S.sim, 'failed')!;
  assert.equal(c.pitches[0].multEnd, 15);
  assert.equal(c.pitches[1].multStart, 15);
  assert.equal(c.pitches[2].multStart, 15);
  assert.equal(c.multEnd, 15);
  // next challenge (fresh sim) starts at ×1
  S.run.challenge = 2;
  S.startChallenge(1e9);
  S.pitch();
  assert.equal(S.rec.challenge!.pitches[0].multStart, 10);

  // identical seeded play with and without the recorder → identical score and events
  const play = (withRec: boolean) => {
    const evs: string[] = [];
    const rec = new RunRecorder({ store: null, build: BUILD });
    const run = new Run(3);
    rec.startRun({ route: 'x', theme: 'x' });
    const sim: Simulation = new Simulation({ preset: run.preset(), seed: 7, onEvent: e => (evs.push(e.type), withRec && rec.onEvent(e, sim)) });
    rec.startChallenge(run, 3);
    sim.ready();
    const ctl = makeControls();
    const drop = bumperDrops(sim);
    for (let i = 0; i < 12 / DT && sim.rules.phase === 'live'; i++) {
      drop(sim, i);
      sim.step(DT, ctl);
    }
    return { score: sim.rules.score, evs: evs.join(',') };
  };
  assert.deepEqual(play(true), play(false));
});

test('multiball: extra-ball drains are counted but never charged as strikes or double-scored', () => {
  const S = session();
  S.startChallenge(1e9);
  S.pitch((s, i) => {
    if (i === 5) {
      (s as any).addBall(10, 18, 0, 0);
      s.rules.addBall();
    }
  });
  const c = S.rec.challenge!;
  assert.equal(c.pitches.length, 1);
  assert.equal(c.pitches[0].outcome, 'drain');
  assert.equal(c.pitches[0].extraBallDrains, 1);
  assert.equal(S.sim.rules.strikes, 1);
  assert.equal(c.attributed, S.sim.rules.score);
});

// ───────── ramps & attribution ─────────

test('ramp: 8 checkpoint payouts once each on a full ride; a rollback pays nothing; no legacy gate/finish invented', () => {
  const S = session();
  install(S.run, 'turbo-ramp');
  const id = S.run.installed[0].id;
  S.startChallenge(1e9);
  const ride = (speed: number) =>
    S.pitch((s, i) => {
      if (i === 2) {
        const rp = s.layout.ramps[0];
        for (const b of s.balls) b.body.setPosition({ x: 10, y: 40 });
        (s as any).addBall(rp.mouth.x - rp.entryDir.x * 0.8, rp.mouth.y - rp.entryDir.y * 0.8, rp.entryDir.x * speed, rp.entryDir.y * speed);
        s.rules.addBall();
      }
    }, 4);
  ride(20);
  const r = S.rec.challenge!.ramps[id];
  assert.equal(r.entries, 1);
  assert.equal(r.completes, 1);
  assert.deepEqual(r.checkpointHits, [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(r.checkpointPoints, Array(8).fill(1000));
  assert.equal(r.bestRide, 8000);
  assert.equal(r.gateHits, 0);
  const src = S.rec.challenge!.sources;
  const rampPts = Object.values(src).filter(x => x.kind.startsWith('ramp')).reduce((a, x) => a + x.awarded, 0);
  assert.equal(rampPts, 8000, 'no extra completion payout');
  const mech = S.rec.challenge!.mechanisms[id];
  assert.equal(mech.awarded, 8000, 'checkpoint parts roll up into the ramp instance');
  assert.equal(mech.awards, 8);
  // rollback: enters, rolls back, zero checkpoints
  S.sim.rules.reset();
  S.load(1e9);
  S.rec.endChallenge(S.run, S.sim, 'failed');
  S.run.challenge = 2;
  S.startChallenge(1e9);
  ride(5);
  const r2 = S.rec.challenge!.ramps[id];
  assert.equal(r2.entries, 1);
  assert.equal(r2.rollbacks, 1);
  assert.equal(r2.completes, 0);
  assert.equal(r2.checkpointHits.reduce((a, b) => a + b, 0), 0);
});

test('global multiplier gains are tracked by source and never counted as points; score reconciles exactly', () => {
  const S = session();
  install(S.run, 'mult-gate', 'gate-l');
  const gid = S.run.installed[0].id;
  S.startChallenge(1e9);
  S.pitch((s, i) => {
    if (i === 3) {
      const g = s.layout.multGates[0];
      const b = s.balls[0];
      for (const y of [6, 5.5, 4.5, 3.5]) (s as any).checkMultGate(b, g, { x: 1.7, y });
    }
  });
  const c = S.rec.challenge!;
  assert.deepEqual(c.multGains[`gate:${gid}`], { source: 'gate', id: gid, procs: 1, tenths: 1 });
  assert.equal(c.mechanisms[gid].multTenths, 1);
  assert.equal(c.mechanisms[gid].awarded, 0, 'the gate itself banks no points');
  assert.equal(c.attributed, S.sim.rules.score);
  assert.equal(c.pitches[0].multPeak, 11);
});

test('two machines of one type on different mounts stay separate; duplicate modifier copies are kept with counts', () => {
  const S = session();
  install(S.run, 'bonus-bumper', 'pocket-ul');
  install(S.run, 'bonus-bumper', 'pocket-ur');
  const [a, b] = S.run.installed.map(i => i.id);
  assert.notEqual(a, b);
  S.startChallenge(1e9);
  S.pitch((s, i) => {
    for (const [id, at] of [[a, 3], [b, 40]] as const) {
      if (i !== at) continue;
      const bb = s.layout.bumpers.find(x => x.id === id)!;
      (s as any).addBall(bb.x, bb.y - bb.r - 0.6, 0, 8);
      s.rules.addBall();
    }
  }, 6);
  const m = S.rec.challenge!.mechanisms;
  assert.ok(m[a]?.hits && m[b]?.hits, 'each instance has its own hits');
  // duplicate copies via the ledger path
  S.rec.endChallenge(S.run, S.sim, 'failed');
  const t = MODS.find(t => t.key === 'sweet-spot')!;
  for (let k = 0; k < 2; k++) {
    const o: Offer = { uid: 70 + k, kind: 'modifier', key: t.key, name: t.name, desc: t.effect, price: 5, target: { key: 'bumper-left', label: 'Top-left bumper' }, mod: { note: t.name, gen: t.gen } };
    S.run.mods['bumper-left'] = [...(S.run.mods['bumper-left'] ?? []), { ...o.mod }];
    S.run.money -= 5;
    S.rec.purchase(S.run, o, S.run.money + 5);
  }
  const mods = S.rec.rec!.ledger.filter(e => e.type === 'modifier');
  assert.deepEqual(mods.map(e => e.copy), [1, 2]);
  assert.deepEqual(mods.map(e => e.target), ['bumper-left', 'bumper-left']);
  S.run.challenge = 2;
  S.startChallenge(1e9);
  const snap = S.rec.challenge!.startBuild.mods.find(x => x.target === 'bumper-left')!;
  assert.equal(snap.copies, 2);
  assert.equal(snap.byName['Hot Hand'], 2);
});

// ───────── build / economy ledger ─────────

test('pre-reward end snapshot; draft, shop, reroll and the inning Power grant land in the ledger with prices and funds', () => {
  const S = session({ seed: 11 });
  S.run.challenge = 3; // so the clear grants inning Power
  S.startChallenge(150);
  S.pitch(bumperDrops(S.sim));
  const c = S.rec.endChallenge(S.run, S.sim, 'cleared')!;
  const earned = S.run.clear(3 - S.sim.rules.strikes);
  S.rec.afterClear(S.run, earned);
  assert.equal(c.endBuild!.installed.length, 0, 'end snapshot is the machine that played (pre-reward)');
  assert.equal(c.endBuild!.maxPower, 6, 'pre-grant Power');
  assert.equal(c.reward, earned);
  const L = () => S.rec.rec!.ledger;
  assert.ok(L().some(e => e.type === 'powerGrant' && e.maxPower === 7 && e.inning === 2));
  const offers = L().find(e => e.type === 'draftOffers')!.offers as unknown[];
  assert.equal(offers.length, 3);
  // take a usable draft pick (machine if offered)
  const pick = S.run.draft.find(o => S.run.check(o).ok)!;
  const declined = S.run.draft.filter(o => o !== pick);
  const ck = S.run.check(pick);
  assert.ok(S.run.takeDraft(pick.uid, ck.ok ? ck.mounts[0] : undefined).ok);
  S.rec.draftTaken(S.run, pick, declined, pick.kind === 'machine' ? S.run.installed.at(-1)!.mountId : undefined);
  S.rec.shopOffers(S.run, 'open');
  const taken = L().find(e => e.type === 'draftTaken')!;
  assert.equal((taken.declined as unknown[]).length, 2);
  assert.ok(L().some(e => e.type === (pick.kind === 'machine' ? 'install' : 'modifier')));
  // shop: purchase + reroll with money before/after
  S.run.money = 40;
  const buy = S.run.shop[0];
  const before = S.run.money;
  assert.ok(S.run.buy(buy.uid).ok);
  S.rec.purchase(S.run, buy, before);
  const p = L().find(e => e.type === 'purchase')!;
  assert.equal(p.price, buy.price);
  assert.equal(p.moneyBefore, 40);
  assert.equal(p.moneyAfter, 40 - buy.price);
  assert.match(String(p.power), /^\d+\/7$/);
  const price = S.run.rerollPrice, mb = S.run.money;
  assert.ok(S.run.reroll());
  S.rec.reroll(S.run, price, mb);
  S.rec.shopOffers(S.run, 'reroll');
  const rr = L().find(e => e.type === 'reroll')!;
  assert.deepEqual([rr.price, rr.moneyBefore, rr.moneyAfter], [price, mb, mb - price]);
  assert.equal(S.rec.rec!.money.spent, buy.price + price);
  assert.equal(S.rec.rec!.money.earned, earned);
  // the next challenge starts with the post-reward machine
  S.run.next();
  S.rec.nextChallenge(S.run);
  S.startChallenge();
  assert.equal(S.rec.challenge!.startBuild.maxPower, 7);
  assert.equal(S.rec.challenge!.n, 4);
  // afterClear is idempotent
  S.rec.afterClear(S.run, 999);
  assert.equal(S.rec.rec!.money.earned, earned);
});

test('zero-point strikes, highlights, and a restarted run: new id, previous terminal report still available', () => {
  const S = session();
  S.startChallenge(1e9);
  S.pitch(); // passive pitch: often 0 points
  S.pitch(bumperDrops(S.sim));
  S.pitch();
  S.rec.endChallenge(S.run, S.sim, 'failed');
  S.rec.endRun('failed');
  const rec1 = S.rec.snapshot()!;
  const sum = summarize(rec1);
  assert.equal(sum.strikesUsed, 3);
  assert.equal(sum.zeroPointStrikes, rec1.challenges[0].pitches.filter(p => p.points === 0).length);
  assert.ok(rec1.highlights.length > 0);
  assert.ok(rec1.highlights.every((h, i, a) => i === 0 || a[i - 1].awarded >= h.awarded), 'highlights sorted');
  // restart
  S.rec.startRun({ route: '/build-test/', theme: 'x' });
  assert.notEqual(S.rec.rec!.runId, rec1.runId);
  assert.equal(S.rec.rec!.challenges.length, 0, 'runs never merge');
  assert.equal(S.rec.lastRun()!.runId, rec1.runId);
  assert.equal(S.rec.lastRun()!.outcome, 'failed');
});

// ───────── persistence ─────────

test('reload mid-challenge: honest interrupted record (finished pitches kept, open pitch never "completed")', () => {
  const store = new MemoryStore();
  const S = session({ store });
  S.startChallenge(1e9);
  S.pitch(); // strike 1 → saved
  S.sim.ready(); // pitch 2 served, then the tab is closed mid-ball
  for (let i = 0; i < 100; i++) S.sim.step(DT, makeControls());
  S.rec.save();
  const runId = S.rec.rec!.runId;
  // page reload: a fresh recorder on the same storage starts a new run and archives the old one
  const fresh = new RunRecorder({ store, build: BUILD });
  fresh.startRun({ route: '/build-test/', theme: 'x' });
  const last = fresh.lastRun()!;
  assert.equal(last.runId, runId);
  assert.equal(last.outcome, 'interrupted');
  assert.equal(last.challenges[0].outcome, 'interrupted');
  assert.equal(last.challenges[0].pitches[0].outcome, 'drain');
  assert.equal(last.challenges[0].pitches[1].outcome, 'interrupted', 'unfinished pitch is not shown as finished');
  assert.ok(last.notes.some(n => n.includes('interrupted')));
  assert.notEqual(fresh.rec!.runId, runId);
  // the report renders for it
  assert.match(renderReport(last), /interrupted/);
  // reloading again on the fresh run's first READY screen (nothing played) never displaces the real run
  const again = new RunRecorder({ store, build: BUILD });
  again.startRun({ route: '/build-test/', theme: 'x' });
  assert.equal(again.lastRun()!.runId, runId);
  // the archive keeps the most recent runs, bounded
  for (let k = 0; k < 5; k++) {
    const R2 = new RunRecorder({ store, build: BUILD });
    R2.startRun({ route: 'x', theme: 'x' });
    R2.endRun('failed');
  }
  assert.equal(again.archivedRuns().length, 3);
});

test('denied storage never breaks recording or the report', () => {
  const broken: Store = {
    get() {
      throw new Error('denied');
    },
    set() {
      throw new Error('QuotaExceededError');
    },
    remove() {
      throw new Error('denied');
    },
  };
  const S = session({ store: broken });
  S.startChallenge(150);
  S.pitch(bumperDrops(S.sim));
  S.rec.endChallenge(S.run, S.sim, 'cleared');
  S.rec.endRun('failed');
  const r = S.rec.snapshot()!;
  assert.equal(r.challenges.length, 1);
  assert.ok(r.notes.some(n => n.includes('storage')));
  assert.equal(S.rec.lastRun(), null);
  assert.ok(renderReport(r).length > 1000);
  // no storage at all
  const M = session({ store: null });
  M.startChallenge(1e9);
  M.pitch();
  assert.equal(M.rec.challenge!.pitches.length, 1);
});

// ───────── HTML report ─────────

function sampleRecord(): RunRecord {
  const S = session();
  install(S.run, 'bonus-bumper', 'pocket-ul');
  S.run.installed[0].name = 'Evil </script><img src=x onerror=alert(1)> & "quotes" \'single\'';
  S.startChallenge(150);
  S.pitch(bumperDrops(S.sim));
  S.rec.endChallenge(S.run, S.sim, 'cleared');
  S.rec.rec!.notes.push('<b>note</b> & </script>');
  return S.rec.snapshot()!;
}

test('HTML report: escaped text, safely embedded JSON that round-trips, no external resources', () => {
  const r = sampleRecord();
  const html = renderReport(r);
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  // exactly our two script blocks; injected labels never become markup
  assert.equal((html.match(/<\/script>/g) ?? []).length, 2);
  assert.equal((html.match(/<script/g) ?? []).length, 2);
  assert.ok(!html.includes('<img src=x'), 'no injected element');
  assert.ok(html.includes('Evil &lt;/script&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot; &#39;single&#39;'));
  // embedded JSON round-trips exactly
  const m = html.match(/<script type="application\/json" id="run-data">([\s\S]*?)<\/script>/)!;
  assert.deepEqual(JSON.parse(m[1]), JSON.parse(JSON.stringify(r)));
  assert.ok(!m[1].includes('<'));
  // offline: no URLs, external src/href, imports or fetches
  assert.ok(!/https?:\/\//.test(html.replace(m[1], '')), 'no remote URLs');
  assert.ok(!/\s(src|href)=["'](?!#)/.test(html.replace(m[1], '')), 'no external src/href');
  assert.ok(!/fetch\(|XMLHttpRequest|import\(/.test(html));
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  // helpers
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  assert.equal(JSON.parse(jsonForScript({ s: '</script><!--&\u2028' })).s, '</script><!--&\u2028');
  assert.match(reportFilename(r), /^baseball-pinball-run-\d{8}-\d{4}-[a-z0-9]{4}\.html$/);
});

test('HTML report contains the required sections and facts only (no advice language)', () => {
  const html = renderReport(sampleRecord());
  for (const h of ['1. Run overview', '2. Challenge progression', '3. Mechanism performance', '4. Build timeline', '5. Economy &amp; technical notes', '6. Machine-readable data']) assert.ok(html.includes(h), h);
  assert.ok(!/\b(recommend|you should|try |best build|strongest|tip:|suggest)/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')), 'no coaching/advice text');
});

test('analytics stay off the legacy routes and the download UI only appears with ?devAnalytics=1', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const recorder: RunRecorder \| null = buildMode \? new RunRecorder/);
  assert.match(main, /devReport: \(label, get\) => \{\s*if \(!devAnalytics\) return;/);
  assert.match(main, /get\('devAnalytics'\) === '1'/);
  assert.ok(!/fetch\(|sendBeacon|XMLHttpRequest|WebSocket/.test(main + readFileSync(new URL('../src/telemetry/run-recorder.ts', import.meta.url), 'utf8')), 'no network calls');
});

test('V2.2: Home Run completion, normal upper-deck scoring and Rally ×2 gain are reported separately and reconcile', () => {
  const S = session();
  S.run.sections = ['upperDeck'];
  S.startChallenge(null);
  const s = S.pitch(undefined, 0.05);
  s.rules.multTenths = 20;
  const put = (x: number, y: number, vx: number, vy: number) => {
    const b = s.balls[0];
    b.body.setPosition({ x, y });
    b.body.setLinearVelocity({ x: vx, y: vy });
    b.prev = b.pos = { x, y };
  };
  const step = (sec: number) => {
    for (let i = 0; i < sec / DT && s.balls.length; i++) {
      s.step(DT, makeControls());
      S.rec.tick(DT * 1000, true);
    }
  };
  // a plain deck hit (no Rally), then a Home Run ride and a boosted deck hit
  put(10.05, -8, 0, 0);
  step(0.8);
  const rp = s.layout.ramps.find(r => r.def.id === 'hr-ramp')!;
  put(rp.mouth.x - rp.entryDir.x * 0.5, rp.mouth.y - rp.entryDir.y * 0.5, rp.entryDir.x * 18, rp.entryDir.y * 18);
  step(4);
  put(10.05, -8, 0, 0);
  step(0.8);
  const ev = S.events.filter(e => e.type === 'score') as Extract<SimEvent, { type: 'score' }>[];
  const c = S.rec.endChallenge(S.run, s, "cleared")!;
  const dr = c.deckRally!;
  assert.equal(dr.hrCompletions, 1);
  assert.equal(dr.hrCompletion, 3000 * 2);
  assert.equal(dr.starts, 1);
  const deckEv = ev.filter(e => /^deck-(bumper|sling)-/.test(e.id));
  assert.equal(dr.deckAwarded, deckEv.reduce((a, e) => a + e.awarded, 0));
  assert.equal(dr.rallyGain, ev.reduce((a, e) => a + (e.rallyGain ?? 0), 0));
  assert.ok(dr.rallyGain > 0 && dr.rallyGain < dr.deckAwarded, 'gain is only the extra part');
  assert.ok(deckEv.some(e => !e.deckRally) && deckEv.some(e => e.deckRally === 2));
  assert.equal(c.attributed, ev.reduce((a, e) => a + e.awarded, 0));
  assert.equal(c.attributed, s.rules.score, 'every banked point attributed');
  S.rec.endRun("completed");
  assert.match(renderReport(S.rec.rec!), /Home Run \/ Upper Deck Rally/);
});
