/**
 * Offline developer report: one self-contained HTML file per run (inline CSS/JS, embedded JSON, no network).
 * Facts only: counts, points, times and the build ledger. No grades, rankings or advice.
 */
import { SCHEMA, type ChallengeRecord, type LedgerEntry, type MechStat, type RampStat, type RunRecord, type SourceStat } from './run-recorder.ts';

/** Escape text for HTML element content and attribute values. */
export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** JSON safe to place inside <script type="application/json"> (no "</script>", no HTML-significant chars). */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const pad = (n: number) => String(n).padStart(2, '0');
export function reportFilename(r: RunRecord) {
  const d = new Date(r.startedAt);
  return `baseball-pinball-run-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${r.runId.split('-').pop()}.html`;
}

const n = (x: number | undefined) => (x === undefined ? '—' : Math.round(x).toLocaleString('en-US'));
const mult = (t: number) => `×${(t / 10).toFixed(1)}`;
const dur = (ms: number | undefined) => {
  if (ms === undefined) return '—';
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${pad(s % 60)}s` : `${s}s`;
};
const when = (t: number | undefined) => (t ? new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Derived run facts (pure, no opinions). */
export function summarize(r: RunRecord) {
  const cs = r.challenges;
  const pitches = cs.flatMap(c => c.pitches.map(p => ({ c: c.n, ...p })));
  const strikePitches = pitches.filter(p => p.outcome === 'drain');
  const cleared = cs.filter(c => c.outcome === 'cleared');
  const mech: Record<string, MechStat & { challenges: number }> = {};
  const src: Record<string, SourceStat> = {};
  const ramps: Record<string, RampStat> = {};
  const multGain: Record<string, { source: string; id: string; procs: number; tenths: number }> = {};
  for (const c of cs) {
    for (const m of Object.values(c.mechanisms)) {
      const a = (mech[m.id] ??= { ...m, hits: undefined, awards: 0, awarded: 0, base: 0, modified: 0, best: 0, multTenths: 0, multProcs: 0, challenges: 0 });
      if (m.hits !== undefined) a.hits = (a.hits ?? 0) + m.hits;
      a.awards += m.awards;
      a.awarded += m.awarded;
      a.base += m.base;
      a.modified += m.modified;
      a.best = Math.max(a.best, m.best);
      a.multTenths += m.multTenths;
      a.multProcs += m.multProcs;
      a.challenges++;
    }
    for (const [k, s] of Object.entries(c.sources)) {
      const a = (src[k] ??= { ...s, awards: 0, awarded: 0, base: 0, modified: 0, best: 0 });
      a.awards += s.awards;
      a.awarded += s.awarded;
      a.base += s.base;
      a.modified += s.modified;
      a.best = Math.max(a.best, s.best);
    }
    for (const rp of Object.values(c.ramps)) {
      const a = (ramps[rp.id] ??= { ...rp, entries: 0, completes: 0, rollbacks: 0, landings: 0, checkpointHits: [], checkpointPoints: [], gateHits: 0, gatePoints: 0, bestRide: 0 });
      a.entries += rp.entries;
      a.completes += rp.completes;
      a.rollbacks += rp.rollbacks;
      a.landings += rp.landings ?? 0;
      a.gateHits += rp.gateHits;
      a.gatePoints += rp.gatePoints;
      a.bestRide = Math.max(a.bestRide, rp.bestRide);
      rp.checkpointHits.forEach((h, i) => (a.checkpointHits[i] = (a.checkpointHits[i] ?? 0) + h));
      rp.checkpointPoints.forEach((p, i) => (a.checkpointPoints[i] = (a.checkpointPoints[i] ?? 0) + p));
    }
    for (const [k, g] of Object.entries(c.multGains)) {
      const a = (multGain[k] ??= { ...g, procs: 0, tenths: 0 });
      a.procs += g.procs;
      a.tenths += g.tenths;
    }
  }
  const total = cs.reduce((s, c) => s + c.score, 0);
  const attributed = cs.reduce((s, c) => s + c.attributed, 0);
  const last = cs[cs.length - 1];
  const finalBuild = last?.endBuild ?? last?.startBuild;
  return {
    total,
    attributed,
    unattributed: total - attributed,
    furthest: last?.n ?? 0,
    highestCleared: cleared.length ? Math.max(...cleared.map(c => c.n)) : 0,
    clearedCount: cleared.length,
    bestChallenge: cs.reduce<ChallengeRecord | null>((b, c) => (!b || c.score > b.score ? c : b), null),
    bestPitch: pitches.reduce<(typeof pitches)[number] | null>((b, p) => (!b || p.points > b.points ? p : b), null),
    bestEvent: r.highlights[0] ?? null,
    peakMult: cs.reduce((m, c) => Math.max(m, c.multPeak), 10),
    strikesUsed: cs.reduce((s, c) => s + c.strikesUsed, 0),
    strikesAvailable: cs.reduce((s, c) => s + c.maxStrikes, 0),
    zeroPointStrikes: strikePitches.filter(p => p.points === 0).length,
    pitchCount: pitches.length,
    swings: pitches.reduce((s, p) => s + p.swings, 0),
    batHits: pitches.reduce((s, p) => s + p.batHits, 0),
    swingsMissed: pitches.reduce((s, p) => s + p.swingsMissed, 0),
    extraBallDrains: pitches.reduce((s, p) => s + p.extraBallDrains, 0),
    multiballs: cs.reduce((s, c) => s + c.multiballs.activations, 0),
    ballsLaunched: cs.reduce((s, c) => s + c.multiballs.ballsLaunched, 0),
    mech,
    src,
    ramps,
    multGain,
    finalBuild,
    wallMs: (r.endedAt ?? r.savedAt ?? r.startedAt) - r.startedAt,
  };
}

function nameOf(r: RunRecord, id: string) {
  for (const c of r.challenges) for (const b of [c.endBuild, c.startBuild]) {
    const i = b?.installed.find(i => i.id === id);
    if (i) return { name: i.name, mount: i.mount, installed: true };
  }
  return { name: id, mount: 'factory', installed: false };
}

function ledgerText(e: LedgerEntry): string {
  const o = (x: any) =>
    x ? `${x.name}${x.targetLabel ? ` → ${x.targetLabel}` : ''}${x.kind === 'machine' ? ` (⚡${x.power}${x.pieces ? `, ${x.pieces} pieces` : ''}${x.feasibility === 'after-selling' ? ', needs room' : ''})` : ''}${x.price ? ` $${x.price}` : ''}${x.origin ? ` [${x.origin}${x.weight !== undefined ? ` w${x.weight}` : ''}]` : ''}` : '';
  switch (e.type) {
    case 'challengeStart':
      return `Challenge start · target ${n(e.target as number)} · $${e.money} · ⚡${e.power}`;
    case 'challengeEnd':
      return `Challenge ${e.outcome} · ${n(e.score as number)} / ${n(e.target as number)} · strikes ${e.strikesUsed}`;
    case 'clearReward':
      return `Clear reward +$${e.earned} (now $${e.money})`;
    case 'powerGrant':
      return `Inning ${e.inning} unlocked · max Power +${e.gained} (${e.maxPower} total)`;
    case 'sectionUnlock':
      return `Machine grew · ${e.name} unlocked (free)`;
    case 'draftOffers':
      return `Free draft offered: ${(e.offers as any[]).map(o).join(' | ')}`;
    case 'draftTaken':
      return `Draft taken: ${o(e.offer)}${e.mount ? ` @ ${e.mount}` : ''} · declined: ${(e.declined as any[]).map(o).join(' | ') || 'none'}`;
    case 'shopOffers':
      return `Shop ${e.reason === 'reroll' ? 'rerolled' : 'opened'} ($${e.money}): ${(e.offers as any[]).map(o).join(' | ')}`;
    case 'purchase':
      return `Bought ${o(e.offer)} · $${e.moneyBefore} → $${e.moneyAfter} · ⚡${e.power}`;
    case 'reroll':
      return `Reroll $${e.price} · $${e.moneyBefore} → $${e.moneyAfter}`;
    case 'install':
      return `Installed ${e.name} @ ${(e.mounts as string[] | undefined)?.join(' + ') ?? e.mount} (${(e.parts as string[] | undefined)?.join(', ') ?? e.id}) ⚡${e.power} · Power ${e.powerAfter} · via ${e.via}${e.paid ? ` · paid $${e.paid}` : ''}`;
    case 'modifier':
      return `Modifier ${e.name} (${e.effect}) → ${e.targetLabel} · copy #${e.copy} of this name · ${e.stackOnTarget} on target · via ${e.via}`;
    case 'sale':
      return `Sold ${e.name} · +$${e.refund} · ⚡${e.powerFreed} freed (${e.power})${(e.dormant as any[]).length ? ` · dormant: ${(e.dormant as any[]).map((d: any) => `${d.names.join(', ')} @ ${d.key}`).join('; ')}` : ''}${(e.waking as any[]).length ? ` · waking: ${(e.waking as any[]).map((d: any) => d.key).join(', ')}` : ''}`;
    case 'modsReactivated':
      return `Modifiers reactivated: ${(e.keys as any[]).map((d: any) => `${d.names.join(', ')} @ ${d.key}`).join('; ')}`;
    case 'modsDormant':
      return `Modifiers now dormant: ${(e.keys as any[]).map((d: any) => `${d.names.join(', ')} @ ${d.key}`).join('; ')}`;
    case 'next':
      return `Next → challenge ${e.toChallenge} · $${e.money} · ⚡${e.power}`;
    case 'runEnd':
      return `Run ${e.outcome}`;
    default:
      return esc(JSON.stringify(e));
  }
}

function table(head: string[], rows: (string | number)[][], opts: { sortable?: boolean; numeric?: boolean[] } = {}) {
  const th = head.map((h, i) => `<th${opts.sortable ? ` data-col="${i}"` : ''}${opts.numeric?.[i] ? ' class="num"' : ''}>${esc(h)}</th>`).join('');
  const body = rows.map(r => `<tr>${r.map((c, i) => `<td${opts.numeric?.[i] ? ' class="num"' : ''}>${typeof c === 'number' ? n(c) : c}</td>`).join('')}</tr>`).join('');
  return `<div class="tw"><table${opts.sortable ? ' class="sortable"' : ''}><thead><tr>${th}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}" class="dim">none recorded</td></tr>`}</tbody></table></div>`;
}

function chart(cs: ChallengeRecord[]) {
  if (!cs.length) return '';
  const W = 640, H = 210, padL = 46, padB = 26, bw = Math.min(26, (W - padL - 10) / cs.length / 2.4);
  const vals = cs.flatMap(c => [c.target, c.score]).filter(v => v > 0);
  const max = Math.max(...vals, 10);
  // log axis from the decade below the smallest value (zero scores sit on the baseline)
  const floor = Math.pow(10, Math.floor(Math.log10(Math.min(...vals, max))));
  const span = Math.log10(max) - Math.log10(floor) || 1;
  const y = (v: number) => H - padB - (Math.max(0, Math.log10(Math.max(v, floor)) - Math.log10(floor)) / span) * (H - padB - 12);
  const step = (W - padL - 10) / cs.length;
  const ticks = [];
  for (let p = floor; p <= max * 1.01; p *= 10) ticks.push(p);
  const bars = cs
    .map((c, i) => {
      const x = padL + i * step + step / 2;
      const col = c.outcome === 'cleared' ? 'var(--ok)' : c.outcome === 'failed' ? 'var(--bad)' : 'var(--warn)';
      return `<rect x="${x - bw - 1}" y="${y(c.target)}" width="${bw}" height="${H - padB - y(c.target)}" fill="var(--tgt)"><title>C${c.n} target ${n(c.target)}</title></rect>
<rect x="${x + 1}" y="${y(c.score)}" width="${bw}" height="${H - padB - y(c.score)}" fill="${col}"><title>C${c.n} score ${n(c.score)} (${c.outcome})</title></rect>
<text x="${x}" y="${H - 8}" text-anchor="middle">${c.n}</text>`;
    })
    .join('');
  const grid = ticks.map(t => `<line x1="${padL}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" class="g"/><text x="${padL - 4}" y="${y(t) + 3}" text-anchor="end">${t >= 1e6 ? t / 1e6 + 'M' : t >= 1e3 ? t / 1e3 + 'k' : t}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Target vs score by challenge (log scale)">${grid}${bars}</svg>
<div class="legend"><span><i style="background:var(--tgt)"></i>target</span><span><i style="background:var(--ok)"></i>score (cleared)</span><span><i style="background:var(--bad)"></i>score (failed)</span><span><i style="background:var(--warn)"></i>interrupted</span> · log scale</div>`;
}

function challengeDetails(r: RunRecord, c: ChallengeRecord) {
  const pitches = table(
    ['Pitch', 'Outcome', 'Start score', 'Points', 'Ball time (sim s)', 'Real s', 'Swings', 'Bat hits', 'Swings w/o contact', 'Extra-ball drains', 'Balls launched', 'Drain side', '× start', '× end', '× peak', 'Best event'],
    c.pitches.map(p => [p.n, esc(p.outcome), p.startScore, p.points, p.simSeconds.toFixed(1), p.realSeconds.toFixed(1), p.swings, p.batHits, p.swingsMissed, p.extraBallDrains, p.ballsLaunched, esc(p.drainSide ?? '—'), mult(p.multStart), mult(p.multEnd), mult(p.multPeak), p.bestEvent]),
    { numeric: [false, false, true, true, true, true, true, true, true, true, true, false, false, false, false, true] },
  );
  const srcRows = Object.entries(c.sources)
    .sort((a, b) => b[1].awarded - a[1].awarded)
    .map(([k, s]) => [esc(k), s.awards, s.awarded, s.awards ? s.awarded / s.awards : 0, s.best, s.base, s.modified, c.score ? ((100 * s.awarded) / c.score).toFixed(1) + '%' : '—']);
  const b = c.startBuild;
  return `<details class="ch"><summary>C${c.n} · ${esc(c.outcome)} · ${n(c.score)} / ${n(c.target)} · ${dur(c.activeMs)} active · strikes ${c.strikesUsed}/${c.maxStrikes} · peak ${mult(c.multPeak)}</summary>
<h4>Strikes / pitches</h4>${pitches}
${c.pitches.some(p => p.outcome === 'clear') ? '<p class="dim">"clear" = the target was reached during this ball; no strike was charged.</p>' : ''}
<h4>Points by source (credited after all multipliers)</h4>${table(['Source (kind:id[:part])', 'Awards', 'Points', 'Avg', 'Best', 'Base Σ', 'Part-modified Σ', 'Share'], srcRows, { sortable: true, numeric: [false, true, true, true, true, true, true, true] })}
<p class="dim">Reconciliation: scoreboard ${n(c.score)} − attributed ${n(c.attributed)} = <b>${n(c.unattributed)}</b> unattributed.</p>
<h4>Top events</h4>${table(['Points', 'Source', 'Global ×', 'Pitch'], c.bestEvents.map(h => [h.awarded, esc(`${h.kind}:${h.id}${h.part ? ':' + h.part : ''}`), mult(h.multTenths), h.pitch]), { numeric: [true, false, false, true] })}
<h4>Machine that played this challenge</h4><p>${b.installed.length ? b.installed.map(i => `${esc(i.name)} @ ${esc(i.mount)} (⚡${i.power})`).join(' · ') : 'factory table only'} · Power ${b.powerUsed}/${b.maxPower} · $${b.money} at start · ${b.modCount} modifier copies</p>
${c.reward !== undefined ? `<p>Clear reward: +$${c.reward}</p>` : ''}
</details>`;
}

export function renderReport(r: RunRecord): string {
  const s = summarize(r);
  const cs = r.challenges;
  const synthetic = r.notes.some(x => x.startsWith('SYNTHETIC'));
  const mechRows = Object.values(s.mech)
    .sort((a, b) => b.awarded - a.awarded)
    .map(m => {
      const who = nameOf(r, m.id);
      return [esc(who.installed ? who.name : m.id), esc(m.kind), esc(who.mount), m.hits ?? '<span class="dim">n/a</span>', m.awards, m.awarded, m.awards ? m.awarded / m.awards : 0, m.best, m.base, m.modified, m.multProcs ? `${mult(m.multTenths).replace('×', '+')} (${m.multProcs})` : '—', s.total ? ((100 * m.awarded) / s.total).toFixed(1) + '%' : '—'];
    });
  const rampBlocks = Object.values(s.ramps)
    .map(rp => {
      const who = nameOf(r, rp.id);
      const cpN = rp.checkpointHits.length;
      const cps = cpN ? table(['Checkpoint', ...rp.checkpointHits.map((_, i) => String(i + 1))], [['Hits', ...rp.checkpointHits], ['Points', ...rp.checkpointPoints]], { numeric: [false, ...rp.checkpointHits.map(() => true)] }) : rp.gateHits ? `<p>Legacy gate: ${rp.gateHits} hits, ${n(rp.gatePoints)} pts</p>` : '';
      return `<h4>${esc(who.name)} @ ${esc(who.mount)} <span class="dim">(${esc(rp.id)})</span></h4>
<p>Entries ${rp.entries} · full rides ${rp.completes} · rollbacks ${rp.rollbacks} · drop landings ${rp.landings} · rides/entries ${rp.entries ? ((100 * rp.completes) / rp.entries).toFixed(0) + '%' : '—'} · best ride ${n(rp.bestRide)}</p>${cps}`;
    })
    .join('');
  const srcByKind: Record<string, { awards: number; awarded: number }> = {};
  for (const x of Object.values(s.src)) {
    const k = (srcByKind[x.kind] ??= { awards: 0, awarded: 0 });
    k.awards += x.awards;
    k.awarded += x.awarded;
  }
  const fb = s.finalBuild;
  const overview: [string, string][] = [
    ['Outcome', `<b class="o-${esc(r.outcome)}">${esc(r.outcome)}</b>`],
    ['Run ID', esc(r.runId)],
    ['Build', `${esc(r.build.version)} · ${esc(r.build.commit.slice(0, 12))}`],
    ['Started / ended', `${when(r.startedAt)} → ${when(r.endedAt)}`],
    ['Wall time / active play', `${dur(s.wallMs)} / ${dur(r.activeMs)}`],
    ['Furthest challenge / highest cleared', `C${s.furthest} / ${s.highestCleared ? 'C' + s.highestCleared : '—'} (${s.clearedCount} cleared)`],
    ['Run total (sum of challenge scores)', n(s.total)],
    ['Best challenge score', s.bestChallenge ? `${n(s.bestChallenge.score)} (C${s.bestChallenge.n})` : '—'],
    ['Best strike / pitch', s.bestPitch ? `${n(s.bestPitch.points)} (C${s.bestPitch.c} pitch ${s.bestPitch.n})` : '—'],
    ['Best single event', s.bestEvent ? `${n(s.bestEvent.awarded)} · ${esc(s.bestEvent.kind)}:${esc(s.bestEvent.id)}${s.bestEvent.part ? ':' + esc(s.bestEvent.part) : ''} at ${mult(s.bestEvent.multTenths)} (C${s.bestEvent.challenge})` : '—'],
    ['Peak global multiplier', mult(s.peakMult)],
    ['Strikes used / available', `${s.strikesUsed} / ${s.strikesAvailable} · 0-point strikes ${s.zeroPointStrikes}`],
    ['Swings / bat hits / swings without contact', `${s.swings} / ${s.batHits} / ${s.swingsMissed}`],
    ['Multiball activations / balls launched / extra-ball drains', `${s.multiballs} / ${s.ballsLaunched} / ${s.extraBallDrains}`],
    ['Installed machinery (final)', fb ? `${fb.installed.length} · ⚡${fb.powerUsed}/${fb.maxPower}` : '—'],
    ['Modifier copies (final)', fb ? String(fb.modCount) : '—'],
    ['Money earned / spent', `$${r.money.earned} / $${r.money.spent} (${r.money.purchases} purchases, ${r.money.rerolls} rerolls $${r.money.rerollSpend})`],
  ];
  const notes = [
    ...r.notes,
    'Points are credited once, at the event that banked them (the `score` event from the single award boundary). Global multiplier gains are tracked separately and never counted as points.',
    'Base Σ = the part\'s configured base points; part-modified Σ = after that part\'s own +/× modifiers, before the global multiplier.',
    '"Hits" are contacts/triggers seen as machine events (n/a for parts that only report scoring, e.g. spinners, ramps, scoops, bat).',
    'Swings without contact = swings with no bat contact during that swing; not a measure of shot quality.',
    'Not recorded by design: ball positions, raw touch input, device/user identifiers. Ramp attempts that never reached a mouth are not observable.',
    `Ball time = simulation seconds of the live ball; active play = real time with a live, unpaused ball.`,
  ];
  const finalBuild = fb
    ? `<p>${fb.installed.map(i => `${esc(i.name)} @ ${esc(i.mount)} <span class="dim">${esc(i.id)}</span> ⚡${i.power}`).join('<br>') || 'factory table only'}</p>
${table(['Target', 'Copies', 'By name'], fb.mods.map(m => [esc(m.target), m.copies, esc(Object.entries(m.byName).map(([k, v]) => `${k} ×${v}`).join(', '))]), { numeric: [false, true, false] })}`
    : '<p class="dim">none</p>';
  const reconRows = cs.map(c => [`C${c.n}`, c.score, c.attributed, c.unattributed]);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:">
<title>Moonshot Pinball run ${esc(r.runId)} · ${esc(r.outcome)}</title>
<style>
:root{--bg:#0d1220;--fg:#e8edf7;--dim:#93a0b8;--line:#26304a;--card:#141b2d;--ok:#46c37b;--bad:#e2575b;--warn:#e0b84a;--tgt:#58637c;--acc:#6fb7ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:14px}h1{font-size:19px;margin:4px 0}h2{font-size:16px;margin:0}h4{margin:14px 0 6px;font-size:13px;color:var(--acc)}
.sub{color:var(--dim);font-size:12px}.badge{display:inline-block;padding:2px 8px;border-radius:10px;background:var(--warn);color:#000;font-weight:700;font-size:12px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;margin:12px 0}section>details>summary{padding:12px 14px;cursor:pointer;list-style:none}section>details>summary::before{content:"▸ ";color:var(--dim)}section>details[open]>summary::before{content:"▾ "}
section>details>div{padding:0 14px 14px}dl{display:grid;grid-template-columns:minmax(150px,40%) 1fr;gap:4px 12px;margin:0}dt{color:var(--dim)}dd{margin:0}
.tw{overflow-x:auto;-webkit-overflow-scrolling:touch}table{border-collapse:collapse;width:100%;font-size:12.5px}th,td{padding:4px 7px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{color:var(--dim);font-weight:600;position:sticky;top:0;background:var(--card)}th[data-col]{cursor:pointer}th[data-col]:hover{color:var(--fg)}.num{text-align:right;font-variant-numeric:tabular-nums}
.dim{color:var(--dim)}details.ch{border-top:1px solid var(--line);padding:6px 0}details.ch>summary{cursor:pointer;padding:4px 0}
.chart{width:100%;height:auto;max-height:260px}.chart text{fill:var(--dim);font-size:10px}.chart .g{stroke:var(--line)}.legend{font-size:11px;color:var(--dim);display:flex;gap:10px;flex-wrap:wrap}.legend i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
.o-failed{color:var(--bad)}.o-completed{color:var(--ok)}.o-interrupted,.o-in-progress{color:var(--warn)}button{background:var(--acc);color:#04101f;border:0;border-radius:6px;padding:7px 12px;font-weight:700}
pre{white-space:pre-wrap;word-break:break-all;font-size:11px;max-height:50vh;overflow:auto;background:#0a0f1a;padding:8px;border-radius:6px}
ul{margin:4px 0;padding-left:18px}
@media (max-width:600px){dl{grid-template-columns:1fr}dt{margin-top:6px}}
</style></head><body><main>
<h1>Moonshot Pinball · developer run report ${synthetic ? '<span class="badge">SYNTHETIC TEST DATA</span>' : ''}</h1>
<div class="sub">${esc(SCHEMA)} · run ${esc(r.runId)} · ${esc(r.route)} · theme ${esc(r.theme)} · generated offline</div>

<section><details open><summary><h2 style="display:inline">1. Run overview</h2></summary><div><dl>${overview.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div></details></section>

<section><details open><summary><h2 style="display:inline">2. Challenge progression</h2></summary><div>${chart(cs)}
${table(['C', 'Inning', 'Outcome', 'Target', 'Score', 'Score/target', 'Active', 'Real', 'Strikes', 'Peak ×', 'Reward'], cs.map(c => [c.n, c.inning, `<span class="o-${c.outcome === 'cleared' ? 'completed' : c.outcome}">${esc(c.outcome)}</span>`, c.target, c.score, c.target ? ((100 * c.score) / c.target).toFixed(0) + '%' : '—', dur(c.activeMs), dur(c.endedAt ? c.endedAt - c.startedAt : undefined), `${c.strikesUsed}/${c.maxStrikes}`, mult(c.multPeak), c.reward === undefined ? '—' : '$' + c.reward]), { sortable: true, numeric: [true, true, false, true, true, true, false, false, false, false, false] })}
<h4>Per-challenge detail (tap to expand)</h4>${cs.map(c => challengeDetails(r, c)).join('')}</div></details></section>

<section><details open><summary><h2 style="display:inline">3. Mechanism performance</h2></summary><div>
<p class="sub">Each installed instance is separate (id@mount). Factory parts use their table ids. Tap a header to sort.</p>
${table(['Part', 'Kind', 'Mount', 'Hits', 'Awards', 'Points', 'Pts/award', 'Best', 'Base Σ', 'Part-mod Σ', 'Global × generated', 'Share'], mechRows, { sortable: true, numeric: [false, false, false, true, true, true, true, true, true, true, false, true] })}
<h4>Points by source kind</h4>${table(['Kind', 'Awards', 'Points', 'Share'], Object.entries(srcByKind).sort((a, b) => b[1].awarded - a[1].awarded).map(([k, v]) => [esc(k), v.awards, v.awarded, s.total ? ((100 * v.awarded) / s.total).toFixed(1) + '%' : '—']), { sortable: true, numeric: [false, true, true, true] })}
<h4>Global multiplier sources (tenths gained, never counted as points)</h4>${table(['Source', 'Part', 'Procs', 'Gained'], Object.values(s.multGain).sort((a, b) => b.tenths - a.tenths).map(g => [esc(g.source), esc(g.id), g.procs, mult(g.tenths).replace('×', '+')]), { sortable: true, numeric: [false, false, true, false] })}
<h2 style="margin-top:14px">Ramps</h2>${rampBlocks || '<p class="dim">No ramp activity recorded.</p>'}
${deckRallyHtml(cs)}<h4>Other mechanisms</h4><p>Scoop catches ${cs.reduce((a, c) => a + c.scoops.catches, 0)} · relaunches ${cs.reduce((a, c) => a + c.scoops.ejects, 0)} · splitter multiballs ${s.multiballs} (${s.ballsLaunched} balls launched)</p>
</div></details></section>

<section><details><summary><h2 style="display:inline">4. Build timeline</h2></summary><div>
${table(['t', 'C', 'Event'], r.ledger.map(e => [dur(e.t), e.challenge, esc(ledgerText(e))]), { numeric: [false, true, false] })}
${r.ledgerDropped ? `<p class="dim">${r.ledgerDropped} later ledger entries dropped (bound ${r.ledger.length}).</p>` : ''}
<h4>Final machine and modifiers (grouped by actual target)</h4>${finalBuild}
</div></details></section>

<section><details><summary><h2 style="display:inline">5. Economy &amp; technical notes</h2></summary><div>
<dl><dt>Money earned</dt><dd>$${r.money.earned}</dd><dt>Money spent</dt><dd>$${r.money.spent} (purchases $${r.money.spent - r.money.rerollSpend}, rerolls $${r.money.rerollSpend})</dd>
<dt>Active vs wall time</dt><dd>${dur(r.activeMs)} active of ${dur(s.wallMs)} wall (${s.wallMs ? ((100 * r.activeMs) / s.wallMs).toFixed(0) : 0}%)</dd>
<dt>Frame time</dt><dd>${r.frame ? `avg ${r.frame.avgMs} ms · p95 ${r.frame.p95Ms} ms · max ${r.frame.maxMs} ms (${r.frame.samples} samples)` : 'not available'}</dd>
<dt>Score reconciliation (run)</dt><dd>${n(s.total)} scored − ${n(s.attributed)} attributed = <b>${n(s.unattributed)}</b></dd></dl>
<h4>Per-challenge reconciliation</h4>${table(['C', 'Scoreboard', 'Attributed', 'Unattributed'], reconRows, { numeric: [false, true, true, true] })}
<h4>Data notes</h4><ul>${notes.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
</div></details></section>

<section><details><summary><h2 style="display:inline">6. Machine-readable data</h2></summary><div>
<p><button id="dl">Download JSON</button> <span class="sub">Full versioned record (${esc(SCHEMA)}).</span></p>
<pre id="raw"></pre></div></details></section>
</main>
<script type="application/json" id="run-data">${jsonForScript(r)}</script>
<script>
(function(){
  var raw=document.getElementById('run-data').textContent;
  var pre=document.getElementById('raw');
  document.querySelector('section:last-of-type details').addEventListener('toggle',function(){ if(!pre.textContent) pre.textContent=JSON.stringify(JSON.parse(raw),null,2); });
  document.getElementById('dl').addEventListener('click',function(){
    var url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
    var a=document.createElement('a'); a.href=url; a.download=${JSON.stringify(reportFilename(r).replace(/\.html$/, '.json'))}; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},30000);
  });
  Array.prototype.forEach.call(document.querySelectorAll('table.sortable'),function(t){
    Array.prototype.forEach.call(t.querySelectorAll('th[data-col]'),function(th){
      th.addEventListener('click',function(){
        var i=+th.getAttribute('data-col'),tb=t.tBodies[0],rows=Array.prototype.slice.call(tb.rows),dir=th.getAttribute('data-dir')==='d'?1:-1;
        var v=function(r){var s=(r.cells[i]||{}).textContent||'';var x=parseFloat(s.replace(/[^0-9.\\-]/g,''));return isNaN(x)?s:x;};
        rows.sort(function(a,b){var x=v(a),y=v(b);return (x>y?1:x<y?-1:0)*dir;});
        rows.forEach(function(r){tb.appendChild(r)}); th.setAttribute('data-dir',dir===1?'a':'d');
      });
    });
  });
})();
</script>
</body></html>`;
}

/** V2.2 Home Run / Upper Deck Rally summary (only when the run had the Upper Deck). */
function deckRallyHtml(cs: { deckRally?: NonNullable<import('./run-recorder.ts').ChallengeRecord['deckRally']> }[]) {
  const d = cs.map(c => c.deckRally).filter((x): x is NonNullable<typeof x> => !!x);
  const sum = (k: keyof (typeof d)[number]) => d.reduce((a, x) => a + (x[k] as number), 0);
  if (!sum('starts') && !sum('hrCompletions') && !sum('deckHits')) return '';
  const n = (v: number) => v.toLocaleString();
  return `<h4>Home Run / Upper Deck Rally</h4><p>Home Run completions ${n(sum('hrCompletions'))} paying ${n(sum('hrCompletion'))} · Rally started ${n(sum('starts'))} (ended: back downstairs ${n(sum('returned'))}, drained ${n(sum('drained'))}, removed ${n(sum('removed'))})<br>Upper-deck bumpers/slings banked ${n(sum('deckAwarded'))} over ${n(sum('deckHits'))} hits, of which Rally ×2 added ${n(sum('rallyGain'))} on ${n(sum('rallyHits'))} hits (normal upper-deck scoring ${n(sum('deckAwarded') - sum('rallyGain'))})</p>`;
}
