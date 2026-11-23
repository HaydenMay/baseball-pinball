/**
 * Recorded sound set (player route). Files live in public/sounds/ (rendered locally with earshot from
 * public-domain recordings, or synthesized for this game; ours to use, no credit needed).
 * Swap a sound by changing its file here; tune its level with `vol` and its random pitch spread with `vary`.
 * Anything without a sample, or before samples load, falls back to the synth in audio.ts.
 */
export type SampleId =
  | 'bat' | 'swing' | 'bumper' | 'sling' | 'target' | 'ramp' | 'bank' | 'strike'
  | 'buy' | 'jackpot' | 'homeRun' | 'cleared' | 'gameOver'
  // Sound Board 2 (Nov 23): replaces the last synth beeps, fills silent events, splits shared big moments
  | 'runComplete' | 'calledHit' | 'calledMiss' | 'driveIn' | 'stranded' | 'deckBumper' | 'mult' | 'multiball'
  | 'lane' | 'gate' | 'spinner' | 'checkpoint' | 'ride' | 'scoop' | 'splitter' | 'rallyEnd' | 'hotMove' | 'sweet'
  | 'ui' | 'reroll';

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
  gameOver: { file: 'gameover.mp3', vol: 0.8, vary: 0, gap: 0.5 },  // lose/chip: 8-bit lose jingle
  runComplete: { file: 'runcomplete.mp3', vol: 0.85, vary: 0, gap: 1 },   // 8-bit level-up, then the win fanfare
  calledHit: { file: 'calledhit.mp3', vol: 0.75, vary: 0, gap: 0.4 },     // one_up/chip
  calledMiss: { file: 'calledmiss.mp3', vol: 0.55, vary: 0.03, gap: 0.4 }, // error/fall (marimba)
  driveIn: { file: 'drivein.mp3', vol: 0.65, vary: 0.04, gap: 0.15 },     // coin/chip
  stranded: { file: 'stranded.mp3', vol: 0.6, vary: 0, gap: 0.4 },        // power_down/chip
  deckBumper: { file: 'deckbumper.mp3', vol: 0.5, vary: 0.08, gap: 0.06 }, // the punch, +4 semitones (upstairs)
  mult: { file: 'mult.mp3', vol: 0.5, vary: 0, gap: 0.08 },              // power_up/chip (rate climbs with the multiplier)
  multiball: { file: 'multiball.mp3', vol: 0.7, vary: 0, gap: 0.3 },      // charge/chip
  lane: { file: 'lane.mp3', vol: 0.45, vary: 0.05, gap: 0.1 },            // pickup/chip
  gate: { file: 'gate.mp3', vol: 0.55, vary: 0.03, gap: 0.12 },           // pickup/chip
  spinner: { file: 'spinner.mp3', vol: 0.4, vary: 0.1, gap: 0.035 },      // tick/wood, once per spin
  checkpoint: { file: 'checkpoint.mp3', vol: 0.5, vary: 0, gap: 0.03 },   // menu/chip, pitched up the ride
  ride: { file: 'ride.mp3', vol: 0.7, vary: 0, gap: 0.3 },                // success/rise: full ride
  scoop: { file: 'scoop.mp3', vol: 0.75, vary: 0.04, gap: 0.2 },          // leather/grab: a glove catch
  splitter: { file: 'splitter.mp3', vol: 0.5, vary: 0.04, gap: 0.06 },    // toggle/down
  rallyEnd: { file: 'rallyend.mp3', vol: 0.55, vary: 0, gap: 0.3 },       // coin/chip
  hotMove: { file: 'hotmove.mp3', vol: 0.5, vary: 0, gap: 0.5 },          // notify/lift
  sweet: { file: 'sweet.mp3', vol: 0.55, vary: 0.03, gap: 0.2 },          // mallet/flourish on top of the crack
  ui: { file: 'ui.mp3', vol: 0.35, vary: 0.05, gap: 0.05 },               // tap/tone: buttons and cards
  reroll: { file: 'reroll.mp3', vol: 0.55, vary: 0.03, gap: 0.3 },        // cards/shuffle
};
