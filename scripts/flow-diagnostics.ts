/**
 * V2.1 ball-variety diagnostics (headless, deterministic).
 *
 *   node --experimental-strip-types scripts/flow-diagnostics.ts [trials=60] [json]
 *
 * For every scripted exit (Home Run Ramp, Turbo, Overpass, Long Loop, Glove Scoop, Splitter) it runs
 * `trials` independent releases (sim seed = trial index, entry speed swept across a plausible range) on
 * a few loadouts, follows the released ball until it is back in the bat zone (y > 21), drains, or 6 s pass,
 * and reports where the play went: first downstream contacts, distinct contact sequences, which machine
 * groups got traffic, Upper Deck left/center/right share, time aloft, drains before the bat.
 * Pure measurement: it changes nothing in the game.
 */
import { config } from '../src/config.ts';
import { Simulation, type SimEvent } from '../src/physics/sim.ts';
import { makeControls } from '../src/core/input.ts';
import { Run } from '../src/run/run.ts';

const TRIALS = +(process.argv[2] ?? 60);
const JSON_OUT = process.argv.includes('json');
const ONLY = process.argv.find(a => a.startsWith('only='))?.slice(5).split(',');
const DT = 1 / config.physicsHz;
const WINDOW = 20; // long enough to see a deck visit end

type Loadout = { name: string; deck: boolean; parts: [string, string][] };
const LOADOUTS: Record<string, Loadout> = {
  starterDeck: { name: 'starter + deck', deck: true, parts: [] },
  bumperDeck: { name: 'bumper-heavy + deck', deck: true, parts: [['bonus-bumper', 'deck-l'], ['bumper-cluster', 'deck-r'], ['bonus-bumper', 'pocket-ul'], ['bonus-bumper', 'pocket-ur']] },
  rampHeavy: { name: 'ramp-heavy + deck', deck: true, parts: [['turbo-ramp', 'orbit-l'], ['bridge-ramp', 'bridge'], ['long-loop', 'loop-r'], ['bonus-bumper', 'deck-l']] },
  glove: { name: 'glove + cluster + deck', deck: true, parts: [['glove-scoop', 'pocket-r'], ['bonus-bumper', 'deck-l'], ['bumper-cluster', 'cluster-r']] },
  gloveOnly: { name: 'glove only, no deck', deck: false, parts: [['glove-scoop', 'pocket-r']] },
  splitter: { name: 'splitter + deck', deck: true, parts: [['splitter', 'center-r'], ['bonus-bumper', 'deck-l']] },
  rampClassic: { name: 'ramp-heavy, no deck', deck: false, parts: [['turbo-ramp', 'orbit-l'], ['bridge-ramp', 'bridge'], ['long-loop', 'loop-r']] },
};

/** Machine groups for "did the play reach X" (ids are prefixes or exact). */
const GROUPS: Record<string, (id: string, x: number, y: number) => boolean> = {
  deckLeft: (id, x, y) => y < 0.6 && x < 8,
  deckCenter: (id, x, y) => y < 0.6 && x >= 8 && x <= 12,
  deckRight: (id, x, y) => y < 0.6 && x > 12,
  topBumpers: id => id === 'bumper-top-l' || id === 'bumper-top-r' || id === 'bumper-left' || id === 'bumper-right',
  leftTable: (id, x, y) => y >= 0.6 && x < 8,
  rightTable: (id, x, y) => y >= 0.6 && x > 12,
  installed: id => id.includes('@'),
  jackpot: id => id === 'jackpot',
};

type Source = { key: string; label: string; loadout: string; run: (sim: Simulation, i: number) => number | null };

function sim(lo: Loadout, seed: number) {
  const r = new Run(1);
  r.maxPower = 99;
  if (lo.deck) r.sections = ['upperDeck'];
  for (const [k, m] of lo.parts) if (!r.installForTest(k, m).ok) throw new Error(`can't install ${k}@${m}`);
  const ev: SimEvent[] = [];
  const s = new Simulation({ preset: r.preset(), seed, onEvent: e => ev.push(e) });
  s.rules.target = null;
  s.ready();
  return { s, ev };
}
function put(s: Simulation, x: number, y: number, vx: number, vy: number) {
  const b = s.balls[0];
  b.body.setPosition({ x, y });
  b.body.setLinearVelocity({ x: vx, y: vy });
  b.prev = { x, y };
  b.pos = { x, y };
  return b;
}
/** Enter a ramp at its mouth with a speed swept over [lo, hi]. Returns the ball id. */
const rampEntry = (rampId: string, lo: number, hi: number) => (s: Simulation, i: number) => {
  const rp = s.layout.ramps.find(r => r.def.id === rampId);
  if (!rp) return null;
  const sp = lo + ((hi - lo) * ((i * 7) % TRIALS)) / Math.max(1, TRIALS - 1);
  const b = put(s, rp.mouth.x - rp.entryDir.x * 0.5, rp.mouth.y - rp.entryDir.y * 0.5, rp.entryDir.x * sp, rp.entryDir.y * sp);
  return b.id;
};
const SOURCES: Source[] = [
  { key: 'homeRun', label: 'Home Run Ramp', loadout: 'starterDeck', run: rampEntry('hr-ramp', 12, 22) },
  { key: 'homeRunBumpers', label: 'Home Run Ramp', loadout: 'bumperDeck', run: rampEntry('hr-ramp', 12, 22) },
  { key: 'homeRunRamps', label: 'Home Run Ramp', loadout: 'rampHeavy', run: rampEntry('hr-ramp', 12, 22) },
  { key: 'turbo', label: 'Turbo', loadout: 'rampHeavy', run: rampEntry('ramp@orbit-l', 12, 22) },
  { key: 'overpass', label: 'Overpass', loadout: 'rampHeavy', run: rampEntry('ramp@bridge', 12, 22) },
  { key: 'longLoop', label: 'Long Loop', loadout: 'rampHeavy', run: rampEntry('loop@loop-r', 12, 22) },
  { key: 'turboClassic', label: 'Turbo (no deck)', loadout: 'rampClassic', run: rampEntry('ramp@orbit-l', 12, 22) },
  {
    key: 'glove', label: 'Glove Scoop', loadout: 'glove',
    run: (s: Simulation) => {
      const sc = s.layout.scoops[0];
      if (!sc) return null;
      const b = s.balls[0];
      (s as any).catchInScoop(b, sc);
      return b.id;
    },
  },
  { key: 'gloveOnly', label: 'Glove Scoop', loadout: 'gloveOnly', run: (s: Simulation) => SOURCES.find(x => x.key === 'glove')!.run(s, 0) },
  {
    key: 'splitter', label: 'Splitter launch', loadout: 'splitter',
    run: (s: Simulation) => {
      const sp = s.layout.splitters[0];
      if (!sp) return null;
      put(s, 10, 22, 0, 0); // the served ball waits low; the launched ball is the one followed
      const st = s.splitters.get(sp.id)!;
      st.launchAt = s.time;
      const before = new Set(s.balls.map(b => b.id));
      s.step(DT, makeControls());
      const nb = s.balls.find(b => !before.has(b.id));
      return nb ? nb.id : null;
    },
  },
];

type Trial = { recatch: number; contacts: { id: string; x: number; y: number }[]; drained: boolean; batX?: number; aloft: number; groups: Set<string>; deckFirst?: 'L' | 'C' | 'R'; returnGap?: 'L' | 'R'; completed: boolean };

function follow(src: Source, i: number): Trial | null {
  const lo = LOADOUTS[src.loadout];
  const { s, ev } = sim(lo, i + 1);
  const ballId = src.run(s, i);
  if (ballId === null) return null;
  const t: Trial = { recatch: 0, contacts: [], drained: false, aloft: 0, groups: new Set(), completed: false };
  let released = src.key.startsWith('glove') || src.key.startsWith('splitter') ? true : false;
  let since = 0, prevY = Infinity;
  for (let k = 0; k < (WINDOW + 4) / DT; k++) {
    ev.length = 0;
    s.step(DT, makeControls());
    for (const e of ev) {
      if ('ball' in e && e.ball !== ballId) continue;
      if (e.type === 'ramp' && e.phase === 'complete') { released = true; t.completed = true; }
      if (e.type === 'scoop' && e.phase === 'eject') released = true;
      if (e.type === 'scoop' && e.phase === 'catch' && released) t.recatch++;
      if (e.type === 'drain' && released) t.drained = true;
      if (!released) continue;
      if (e.type === 'machine' && e.kind !== 'wall') {
        t.contacts.push({ id: e.id, x: e.x, y: e.y });
        for (const [g, f] of Object.entries(GROUPS)) if (f(e.id, e.x, e.y)) t.groups.add(g);
        if (e.y < 0.6 && !t.deckFirst) t.deckFirst = e.x < 8 ? 'L' : e.x > 12 ? 'R' : 'C';
      }
    }
    const b = s.balls.find(b => b.id === ballId);
    if (!b || t.drained) break;
    if (released) {
      since += DT;
      if (b.pos.y < 0.6) t.aloft += DT;
      if (b.mode === 'field' && prevY < 0.6 && b.pos.y >= 0.6 && !t.returnGap) t.returnGap = b.pos.x < 10 ? 'L' : 'R';
      prevY = b.pos.y;
      if (b.pos.y > 21) {
        t.batX = b.pos.x;
        break;
      }
      if (since > WINDOW) break;
    }
  }
  return t;
}

const q = (xs: number[], f: number) => { const a = [...xs].sort((x, y) => x - y); return +(a[Math.min(a.length - 1, Math.floor(f * (a.length - 1)))] ?? 0).toFixed(2); };
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
export function measure(trials = TRIALS) {
  const out: Record<string, unknown> = {};
  for (const src of SOURCES.filter(s => !ONLY || ONLY.includes(s.key))) {
    const ts = Array.from({ length: trials }, (_, i) => follow(src, i)).filter((t): t is Trial => !!t);
    const n = ts.length;
    if (!n) continue;
    const seq = new Set(ts.map(t => t.contacts.slice(0, 3).map(c => c.id).join('>')));
    const first = new Map<string, number>();
    for (const t of ts) {
      const f = t.contacts[0]?.id ?? '(none)';
      first.set(f, (first.get(f) ?? 0) + 1);
    }
    const groups = Object.fromEntries(Object.keys(GROUPS).map(g => [g, pct(ts.filter(t => t.groups.has(g)).length, n)]));
    const installedIds = new Set(ts.flatMap(t => t.contacts.map(c => c.id).filter(id => id.includes('@'))));
    out[src.key] = {
      source: src.label,
      loadout: LOADOUTS[src.loadout].name,
      trials: n,
      completedPct: pct(ts.filter(t => t.completed).length, n),
      drainedBeforeBatPct: pct(ts.filter(t => t.drained).length, n),
      contactsAvg: +(ts.reduce((a, t) => a + t.contacts.length, 0) / n).toFixed(1),
      distinctFirst3: seq.size,
      firstContact: Object.fromEntries([...first].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => [k, pct(v, n)])),
      groupsPct: groups,
      deckFirstLCR: ['L', 'C', 'R'].map(z => pct(ts.filter(t => t.deckFirst === z).length, n)).join('/'),
      returnGapLR: ['L', 'R'].map(z => pct(ts.filter(t => t.returnGap === z).length, n)).join('/'),
      batZoneLCR: ['L', 'C', 'R'].map(z => pct(ts.filter(t => t.batX !== undefined && (t.batX < 7.5 ? 'L' : t.batX > 12.5 ? 'R' : 'C') === z).length, n)).join('/'),
      aloftAvg: +(ts.reduce((a, t) => a + t.aloft, 0) / n).toFixed(2),
      recatchPct: pct(ts.filter(t => t.recatch > 0).length, n),
      deckHitsPerVisit: +(ts.reduce((a, t) => a + t.contacts.filter(c => c.y < 0.6).length, 0) / n).toFixed(2),
      deckSlingPct: pct(ts.filter(t => t.contacts.some(c => c.id.startsWith('deck-sling'))).length, n),
      deckSlingHits: ts.reduce((a, t) => a + t.contacts.filter(c => c.id.startsWith('deck-sling')).length, 0),
      deckBumperHitsByPart: Object.fromEntries([...new Set(ts.flatMap(t => t.contacts.filter(c => c.y < 0.6).map(c => c.id)))].sort().map(id => [id, ts.reduce((a, t) => a + t.contacts.filter(c => c.id === id).length, 0)])),
      returnedPct: pct(ts.filter(t => t.returnGap).length, n),
      aloftP50: q(ts.map(t => t.aloft), 0.5),
      aloftP90: q(ts.map(t => t.aloft), 0.9),
      aloftMax: q(ts.map(t => t.aloft), 1),
      installedPartsHit: [...installedIds].length,
    };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = measure();
  if (JSON_OUT) console.log(JSON.stringify(m, null, 1));
  else
    for (const [k, v] of Object.entries(m) as [string, any][]) {
      console.log(`\n${k} — ${v.source} [${v.loadout}] n=${v.trials} completed ${v.completedPct}% drained ${v.drainedBeforeBatPct}%`);
      console.log(`  contacts/avg ${v.contactsAvg} · distinct first-3 sequences ${v.distinctFirst3} · installed parts hit ${v.installedPartsHit} · recatch ${v.recatchPct}%`);
      console.log(`  first contact: ${JSON.stringify(v.firstContact)}`);
      console.log(`  groups %: ${JSON.stringify(v.groupsPct)}`);
      if (v.deckHitsPerVisit) console.log(`  deck hits/visit ${v.deckHitsPerVisit} · deck sling in ${v.deckSlingPct}% (${v.deckSlingHits} hits) · returned ${v.returnedPct}% · aloft p50 ${v.aloftP50}s p90 ${v.aloftP90}s max ${v.aloftMax}s\n  deck parts: ${JSON.stringify(v.deckBumperHitsByPart)}`);
      console.log(`  deck first L/C/R ${v.deckFirstLCR} · return gap L/R ${v.returnGapLR} · aloft ${v.aloftAvg}s · reaches bat zone L/C/R ${v.batZoneLCR}`);
    }
}
