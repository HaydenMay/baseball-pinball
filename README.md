# Baseball Pinball — early physics prototype

This is an unpublished prototype of the baseball-pinball batting loop. It uses TypeScript, HTML Canvas, Vite and Planck physics. All values and art are experimental.

## Run locally

Requires Node.js. Run `npm ci` then `npm run dev -- --host 127.0.0.1`. Open the printed URL. Build with `npm run build`; run rule checks with `npm test` (Node 24+). The standalone `Baseball_Pinball_Playtest.html` bundles the production build for opening without a server. Mobile file-opening behavior varies by device.

Desktop: A/D or arrow keys move; Space swings. Phone: drag the left side relative to initial touch to move; tap the right side to swing. Press Ready for every pitch. Pause is at the bottom.

## Scope and caveats

One-ball prototype only. Intended: fixed-step physics, score-on-contact, early/late aim, side-wall slingshots, strikes, desktop and two-pointer touch. Preliminary procedural visuals; not the finished visual target. No audio. Tests cover core logic, not full browser physics, touchscreen performance or high-speed tunneling. Actual phone testing, simultaneous touch, swing feel, and slingshot/save regressions remain to be checked. The visuals are not intended as a final rendition of the supplied reference. Developer console `playtest.report()` reports local in-memory attempts; `playtest.download()` exports JSON.
