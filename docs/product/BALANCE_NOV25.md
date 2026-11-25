# Balance sweep by build style (Nov 25, 2026)

Bot: `BOT_PLAYER=1 node --experimental-strip-types scripts/bot-run.ts 60 70 3 15 <style>`. Player-route rules and all five Closers; 60 full runs per style; 70 ms timing error and no aiming. It's a deliberately weak player: human runs go further (the creator reached C12 on Nov 23). Read it for **how the styles compare**, not for absolute difficulty.

Clear rate per challenge (attempts after the slash):

| Style | C1 | C2 | C3 Closer | C4 | C5 | C6 Closer | C7 | C8 | C9 Closer |
|---|---|---|---|---|---|---|---|---|---|
| any (takes what's there) | 100% | 100% | 67% | 85% | 82% | 46% | 46% | 50% | 33%/3 |
| objective (ramps, banks) | 98% | 98% | 79% | 83% | 63% | 67% | 75% | 50% | 50%/6 |
| bumper | 97% | 97% | 84% | 85% | 68% | 56% | 60% | 67% | 50%/6 |
| gate (multiplier gates) | 100% | 97% | 74% | 74% | 69% | 55% | 83% | 40% | 50%/4 |
| nogate | 98% | 93% | 75% | 78% | 56% | 61% | 73% | 25% | 50%/2 |

Average challenge reached: any 5.1, objective 5.5, bumper 5.4, gate 5.1, nogate 4.8. Bot wins: 1 of 300 (objective).

**Read:**
- **No style dominates.** Ramps, bumpers and gates are within a few points of each other through C7; ramp/objective builds go slightly deepest. Roadmap #14 ("several build styles can win") looks healthy on this evidence, pending human runs.
- **The walls are the Closers** (C3, C6), as intended, plus a dip at C8. Unfocused play ("any") falls off hardest at C6, so picking a direction matters, which is the point of the build game.
- **No changes made.** Per the roadmap's balance discipline: no tuning from bot numbers alone. Next evidence needed: a few human runs past C6 (the Nov 23 C12 run fell 7,000 short).
