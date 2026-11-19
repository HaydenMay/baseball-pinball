/** Where a scoring key or mount lives on the board, for placement/target previews. */
import type { Layout } from '../physics/board.ts';
import { rampAt } from '../machines/mechanisms.ts';

export type Spot = { x: number; y: number; r: number };

export function anchorsFor(l: Layout, key: string): Spot[] {
  const out: Spot[] = [];
  const kind = key.endsWith(':*') ? key.slice(0, -2) : null;
  for (const b of l.bumpers) if (b.id === key || kind === 'bumper') out.push({ x: b.x, y: b.y, r: b.r + 0.35 });
  for (const t of l.roundTargets) if (t.id === key || kind === 'target') out.push({ x: t.x, y: t.y, r: t.r + 0.35 });
  for (const t of l.boxTargets) {
    if (t.id === key || (kind === 'target' && t.kind === 'target') || (key === 'jackpot' && t.kind === 'jackpot')) out.push({ x: t.x, y: t.y + (t.kind === 'jackpot' ? 0.2 : 0), r: Math.max(t.hw, t.hh) + 0.5 });
  }
  if (kind === 'sling') for (const s of l.slings) out.push({ x: (s.face[0].x + s.face[1].x) / 2, y: (s.face[0].y + s.face[1].y) / 2, r: 1.4 });
  if (kind === 'lane') for (const n of l.lanes) out.push({ x: n.sensor.x, y: n.sensor.y, r: 0.8 });
  for (const r of l.ramps) {
    if (r.def.id === key) out.push({ x: r.mouth.x, y: r.mouth.y, r: 1.1 }, { x: r.exit.x, y: r.exit.y, r: 0.9 });
    if (`${r.def.id}-gate` === key) {
      const { p } = rampAt(r, r.gateS);
      out.push({ x: p.x, y: p.y, r: 0.9 });
    }
  }
  for (const s of l.scoops) if (s.id === key) out.push({ x: s.x, y: s.y, r: s.cupR + 0.4 });
  for (const s of l.spinners) if (s.id === key) out.push({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2, r: 1.1 });
  for (const g of l.gates) if (g.id === key) out.push({ x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2, r: 1.2 });
  for (const s of l.splitters) if (s.id === key) out.push({ x: s.x, y: s.y, r: 1.1 });
  for (const b of l.banks) {
    if (b.id !== key) continue;
    for (const id of b.targetIds) {
      const t = l.boxTargets.find(t => t.id === id);
      if (t) out.push({ x: t.x, y: t.y, r: 0.8 });
    }
  }
  return out;
}
