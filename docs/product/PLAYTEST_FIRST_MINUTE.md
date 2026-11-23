# First-minute stranger playtest

**Goal:** find out whether the core is fun before we spend on art, bosses or store polish. This is a cheap smoke test, not a study. **Three or more people** who have never seen the game.

**Link:** https://haydenmay.github.io/baseball-pinball/play/
- No flags needed.
- The Upper Deck unlocks after challenge 3.
- On an iPhone, a small tip offers "Add to Home Screen". Let them choose; don't push it.

## Setup
- Give them the phone with the link already open. Say only: "It's a baseball pinball game, try it."
- **Don't explain the controls.** The card under PLAY BALL does that. If they're stuck for about 20 s, note it, then help.
- Watch over their shoulder or screen-record. Stay quiet.

## What to watch (write down times if you can)

| Moment | Note |
|---|---|
| Time from opening to the first swing | |
| First hit: did they react (smile, comment, lean in)? | |
| Did they figure out moving vs swinging on their own? | |
| Did they understand "early = left, late = right" on their own, or never? | |
| Did they look at the score/target and know what it meant? | |
| First strike: did they understand they lost a ball and why? | |
| First draft (after challenge 1): did they read it, pick quickly, or freeze? | |
| Anything they couldn't see: the ball, the batter, text under their thumbs | |
| Any scroll, zoom or tap that did the wrong thing | |

## Ask afterwards (only these)
1. "What was the goal?"
2. "What was the most fun moment?"
3. "Anything confusing or annoying?"
4. **"Want to play another round?"** Note whether they *ask* to keep going before you offer.

## Reading the results

| What happens | Meaning | Next step |
|---|---|---|
| Most want more, the first hit lands | The core works | Go ahead with the Inning 1 vertical slice |
| They can play but shrug | Feel/feedback problem (hit impact, sound, score pop, readability) | Polish hit feedback before content |
| They can't figure out moving or swinging | Teaching/controls problem | Fix the first 20 seconds before anything else |
| They like hitting but are lost at the draft | Shop clarity problem | Prioritize the readable shop in the slice |

If you can, send the recordings or notes back. Seconds-to-first-swing and the "another round?" answer are the two numbers to track across playtests.

## Playtest mode: getting data back without analytics (Nov 22)
Draftbound turned out to have no analytics (its README and privacy page say so), so this game doesn't either. Instead:

1. Send each tester a personal link: `https://haydenmay.github.io/baseball-pinball/play/?playtest=<their name>` (e.g. `?playtest=sam`). The name is remembered on their phone; they can add it to the Home Screen from that link.
2. They play normally. The game already records every run locally (nothing is sent anywhere).
3. On the game-over / run-complete card, and in the pause menu, they tap **SEND PLAYTEST REPORT** and pick Messages or email. They get a short readable summary of every run on that phone (newest first: where it ended, swings/hits/sweet spots/fouls/strikes, where points came from, free picks and buys, frame time) and, on phones that can share files, the full HTML developer report. If sharing isn't available it copies the text instead.
4. The summary ends with "Anything else? Type it here:" so they can add a comment in the same message.

`?playtest=off` turns it off on that phone. Code: `src/telemetry/playtest.ts`. Real analytics (an endpoint, a privacy page) stays a separate decision, like Draftbound's AGENTS.md says.
