/**
 * Playtest reports without analytics (Nov 22). Nothing leaves the phone unless the tester taps
 * SEND PLAYTEST REPORT and picks where to send it (Messages, email, …) from the share sheet.
 *
 * Playtest mode: open the game with `?playtest=<name>` (e.g. /play/?playtest=sam). The name is
 * remembered on that device (`bp-playtest`); `?playtest=off` turns it off. While on, end-of-run cards
 * and the pause menu offer SEND PLAYTEST REPORT, which shares a short text summary of every run played
 * on this device (newest first) plus, where the phone supports it, the full HTML developer report.
 */
import type { ChallengeRecord, RunRecord, Store } from './run-recorder.ts';

export const PLAYTEST = {
  key: 'bp-playtest',
  /** Runs included in one report (newest first). */
  maxRuns: 6,
  /** Point sources listed per run. */
  topSources: 4,
};

/** Read/refresh the tester name from the URL; returns null when playtest mode is off. */
export function playtestName(search: string, store: Store | null): string | null {
  let v: string | null = null;
  try {
    v = new URLSearchParams(search).get('playtest');
  } catch {
    /* ignore */
  }
  try {
    if (v !== null) {
      const name = v.trim().slice(0, 24) || 'tester';
      if (/^(off|0|false|no)$/i.test(name)) store?.remove(PLAYTEST.key);
      else store?.set(PLAYTEST.key, name);
    }
    return store?.get(PLAYTEST.key) ?? null;
  } catch {
    return v && !/^(off|0|false|no)$/i.test(v) ? v : null;
  }
}

const f = (n: number) => Math.round(n).toLocaleString('en-US');
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const mins = (ms: number) => `${(ms / 60000).toFixed(1)} min`;

function sum<T>(xs: T[], g: (x: T) => number) {
  return xs.reduce((n, x) => n + g(x), 0);
}

/** One run as a few readable lines. */
export function runSummary(r: RunRecord): string {
  const cs: ChallengeRecord[] = r.challenges;
  const pitches = cs.flatMap(c => c.pitches);
  const swings = sum(pitches, p => p.swings);
  const hits = sum(pitches, p => p.batHits);
  const sweet = sum(pitches, p => p.sweetSpots ?? 0);
  const fouls = pitches.filter(p => p.foul).length;
  const strikes = pitches.filter(p => p.outcome === 'drain' && !p.foul).length;
  const cleared = cs.filter(c => c.outcome === 'cleared').length;
  const last = cs[cs.length - 1];
  const end =
    r.outcome === 'completed' ? 'RUN COMPLETE' : r.outcome === 'failed' ? `failed C${last?.n ?? '?'} (${f(last?.score ?? 0)}/${f(last?.target ?? 0)})` : `${r.outcome} at C${last?.n ?? '?'}`;
  const total = sum(cs, c => c.score);
  const firstPitch = cs[0]?.pitches[0];
  // points by source across the run
  const by = new Map<string, number>();
  for (const c of cs) for (const [k, v] of Object.entries(c.sources)) by.set(k, (by.get(k) ?? 0) + v.awarded);
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, PLAYTEST.topSources);
  const tot = sum(top, x => x[1]) || 1;
  const allPts = [...by.values()].reduce((a, b) => a + b, 0) || tot;
  const drafts = r.ledger.filter(e => e.type === 'draftTaken').map(e => (e.offer as { name?: string })?.name ?? '?');
  const buys = r.ledger.filter(e => e.type === 'purchase').map(e => (e.offer as { name?: string })?.name ?? '?');
  const hr = sum(cs, c => c.deckRally?.starts ?? 0);
  const lines = [
    `• ${new Date(r.startedAt).toLocaleString()} · ${end} · ${cleared} cleared · total ${f(total)} · ${mins(r.activeMs)} played`,
    `  batting: ${pitches.length} pitches, ${swings} swings, ${hits} hits (${pct(hits, swings)} of swings), ${sweet} sweet spots (${pct(sweet, hits)} of hits), ${fouls} foul${fouls === 1 ? '' : 's'}, ${strikes} strike${strikes === 1 ? '' : 's'}`,
    firstPitch ? `  first pitch of the run: ${firstPitch.batHits ? 'connected' : firstPitch.foul ? 'missed (foul)' : 'missed'}, ball lasted ${firstPitch.realSeconds}s` : '',
    `  points from: ${top.map(([k, v]) => `${k.split(':').pop()} ${Math.round((v / allPts) * 100)}%`).join(', ') || '–'}${hr ? ` · home runs ${hr}` : ''}`,
    drafts.length ? `  free picks: ${drafts.join(', ')}` : '',
    buys.length ? `  bought: ${buys.join(', ')}` : '',
    r.frame ? `  frame time avg ${r.frame.avgMs.toFixed(1)} ms, p95 ${r.frame.p95Ms.toFixed(1)} ms` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export function deviceLine() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'other';
  const browser = /CriOS|Chrome/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'other';
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches ? ' · Home Screen app' : '';
  if (typeof screen === 'undefined') return `${os} ${browser}`;
  return `${os} ${browser}${standalone} · screen ${screen.width}×${screen.height} @${devicePixelRatio}x`;
}

/** The whole report text: tester, build, device, runs (newest first). */
export function reportText(name: string, version: string, runs: RunRecord[]): string {
  const list = runs.slice(0, PLAYTEST.maxRuns);
  return [
    `Moonshot Pinball playtest · ${name}`,
    `build ${version} · ${deviceLine()}`,
    `${list.length} run${list.length === 1 ? '' : 's'} on this device (newest first):`,
    ...list.map(runSummary),
    '',
    'Anything else? Type it here:',
  ].join('\n');
}

/**
 * Share via the phone's share sheet (text + the HTML report when files are supported), else copy the
 * text, else download the HTML. Returns what happened, for the button label.
 */
export async function shareReport(text: string, html: { name: string; body: string } | null): Promise<'shared' | 'copied' | 'downloaded' | 'failed'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  try {
    if (nav.share) {
      const file = html && typeof File !== 'undefined' ? new File([html.body], html.name, { type: 'text/html' }) : null;
      const data: ShareData = file && nav.canShare?.({ files: [file] }) ? { title: 'Moonshot playtest', text, files: [file] } : { title: 'Moonshot playtest', text };
      await nav.share(data);
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'failed';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    /* fall through */
  }
  if (html) {
    const url = URL.createObjectURL(new Blob([html.body], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = html.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return 'downloaded';
  }
  return 'failed';
}
