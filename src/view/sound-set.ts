/**
 * Recorded sound set (player route). Files live in public/sounds/ (rendered locally with earshot from
 * public-domain recordings, or synthesized for this game; ours to use, no credit needed).
 * Swap a sound by changing its file here; tune its level with `vol` and its random pitch spread with `vary`.
 * Anything without a sample, or before samples load, falls back to the synth in audio.ts.
 */
export type SampleId =
  | 'bat' | 'swing' | 'bumper' | 'sling' | 'target' | 'ramp' | 'bank' | 'strike'
  | 'buy' | 'jackpot' | 'homeRun' | 'cleared' | 'gameOver';

export const SOUND_SET: Record<SampleId, { file: string; vol: number; vary: number; gap: number }> = {
  // file: under public/sounds · vol: 0..1 · vary: ± playback-rate spread per play · gap: min seconds between plays
  bat: { file: 'bat.mp3', vol: 1.0, vary: 0.04, gap: 0.05 },        // built: wood crack + leather + thump
  swing: { file: 'swing.mp3', vol: 0.45, vary: 0.06, gap: 0.1 },    // whoosh/fast: a stick cutting the air
  bumper: { file: 'bumper.mp3', vol: 0.5, vary: 0.08, gap: 0.06 },  // hit/punch
  sling: { file: 'sling.mp3', vol: 0.5, vary: 0.06, gap: 0.08 },    // click/snap
  target: { file: 'target.mp3', vol: 0.6, vary: 0.05, gap: 0.06 },  // pen/click
  ramp: { file: 'ramp.mp3', vol: 0.55, vary: 0.03, gap: 0.2 },      // swoosh/in
  bank: { file: 'bank.mp3', vol: 0.7, vary: 0, gap: 0.2 },          // success/triad (marimba)
  strike: { file: 'strike.mp3', vol: 0.8, vary: 0.03, gap: 0.3 },   // thump/door
  buy: { file: 'buy.mp3', vol: 0.75, vary: 0.02, gap: 0.15 },       // cha-ching: coins + desk bell
  jackpot: { file: 'jackpot.mp3', vol: 0.8, vary: 0, gap: 0.2 },    // cash register, cut to the ring
  homeRun: { file: 'homerun.mp3', vol: 0.75, vary: 0, gap: 0.5 },   // level_up/chip: arcade jingle, no crowd
  cleared: { file: 'cleared.mp3', vol: 0.75, vary: 0, gap: 0.5 },   // win/fanfare (marimba)
  gameOver: { file: 'gameover.mp3', vol: 0.8, vary: 0, gap: 0.5 },  // "wah wah wah waaah", made for this game
};
