# itch.io listing notes (technical/listing details, not the launch plan)

## Pricing setup (decided Nov 21, 2026)
- Upload it as an **HTML game** and mark it mobile friendly, portrait.
- Pricing: **free to play, suggested $0.99** (itch's donation-style option for browser games). The copy says it plainly, e.g. "Free to play. If you enjoy it, $0.99 helps me make the next one." Never imply a lock.

## "Play it like an app" hint for the listing
Suggested copy (short, under the play button or in the description):

> **On your phone? Make it an app.**
> **iPhone/iPad (Safari):** tap **Share** → **Add to Home Screen**. It opens full screen with no browser bars.
> **Android (Chrome):** tap **⋮** → **Install app** (or **Add to Home screen**). Same thing.

What the game already does:
- It has a web app manifest, icons (180/192/512, plus maskable for Android), a dark theme color and portrait orientation.
- iPhone metas make it launch full screen from the Home Screen.
- Inside the game, between plays (never during a pitch):
  - iPhone Safari shows a small dismissible "Share → Add to Home Screen" tip.
  - Chrome/Android shows an **INSTALL APP** button whenever the browser reports the game is installable.
  - Dismissing the tip is remembered on that device, and nothing shows once it's installed.
- Icon source: `scripts/make-icons.py` (colors and proportions are constants) → `public/icons/`.

## ⚠ Caveat to test before launch
- **On itch, the game runs inside an iframe** (`html-classic.itch.zone/...`). "Add to Home Screen" from the itch page saves **the itch page**, not the game. The in-game tip can't install from inside the iframe either.
- Options to verify on a draft page:
  1. Tell phone players to tap itch's **fullscreen** button, then install. Check whether iOS/Android install the game page in that state.
  2. Add a "Play full screen / install" link to the game's own direct URL (GitHub Pages now, or a custom domain later), where installing works fully.
  3. Both.
- For the itch zip, the manifest's `start_url` must point at the zip's `index.html` (`./`). Today it points at `./play/` for GitHub Pages (the release URL since Nov 23; `/build-test/` still works and shares the save). Set this per build when we package for itch (M6).

## Other listing checklist items
- Screenshots and GIFs at phone portrait size.
- The controls line: "Left thumb drag to move · right thumb tap to swing · desktop: A/D + Space".
- Credits and licenses (fonts, any sounds).
- A privacy note if player analytics ship (D-22).
