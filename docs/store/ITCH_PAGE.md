# Moonshot Pinball: itch.io page kit

Everything for the itch page, in the order itch's "Create a new project" form asks for it. Assets are in this folder; the upload zip comes from `npm run package:itch` (→ `release/moonshot-pinball-itch.zip`).

---

## 1. Basics

| Field | Value |
|---|---|
| Title | **Moonshot Pinball** |
| Project URL | `moonshot-pinball` |
| Short description or tagline | **A baseball pinball roguelite: swing the bat, launch the ball, build a ridiculous scoring machine.** |
| Classification | Games |
| Kind of project | **HTML** (you only have files to be played in the browser) |
| Release status | **Released** |
| Pricing | **$0 or donate**, suggested donation **$0.99** |

## 2. Uploads

- Upload `moonshot-pinball-itch.zip` and tick **This file will be played in the browser**.

## 3. Embed options

| Setting | Value |
|---|---|
| Viewport dimensions | **390 × 780** |
| Mobile friendly | **On**, orientation **Portrait** |
| Fullscreen button | **On** |
| Automatically start on page load | Off (click to launch, so the first tap also unlocks sound) |
| Enable scrollbars | Off |
| SharedArrayBuffer support | Off (not needed) |

## 4. Details

| Field | Value |
|---|---|
| Genre | **Sports** |
| Tags (10) | `pinball`, `baseball`, `roguelite`, `arcade`, `score-attack`, `neon`, `physics`, `mobile`, `casual`, `singleplayer` |
| App store links | none |
| Custom noun | leave empty |
| Community | **Comments** on |
| Visibility | **Draft** first: open the draft on your phone and play a pitch, then switch to **Public** |

## 5. Cover image, screenshots, video

- **Cover image:** `cover-630x500@2x.png` (1260 × 1000; itch shows it at 630 × 500).
- **Screenshots, in this order:**
  1. `2-multiball.png`: multiball on a built-up table
  2. `4-shop.png`: the shop
  3. `5-called-shot.png`: a Closer (Called Shot)
  4. `3-free-pick.png`: the free pick
  5. `1-title.png`: the title screen
- **Gameplay GIF:** `gameplay.gif`. Drop it into the description where marked below; itch has no slot for GIFs.
- Gameplay video: none for now. If you record one on your phone, upload it to YouTube and paste the link in the video field.

## 6. Description (paste into the description box)

> **Swing the bat. Launch the ball. Build a ridiculous scoring machine.**
>
> Moonshot Pinball is a baseball pinball roguelite for your phone or browser. You're the batter at the bottom of a neon pinball table. Time your swing, smack the pitch into bumpers, ramps and targets, and rack up points before you strike out.
>
> *[gameplay.gif here]*
>
> **How a run works**
> - Each challenge has a target score and three strikes.
> - Beat it and you get a **free pick**: a new machine part or a boost.
> - Then spend your winnings in the **shop**. Every card shows you exactly where it goes on your table.
> - Every third challenge is a **Closer** with a rule twist: a moving Hot Corner, a Called Shot, a Rain Delay and more.
> - Clear all 15 challenges (5 innings) to win the run. Short on time? **Quick Game** is 2 innings, about 10 minutes.
>
> **Features**
> - Real pinball physics with a bat you control
> - Bumpers, ramps, gates, a jackpot, multiball and an Upper Deck to unlock
> - Dozens of machine parts and boosts; every run builds a different table
> - Five Closers, each with its own twist
> - Neon Night Game look (or a Day look in Settings)
> - Saves automatically, even mid-pitch; pick up where you left off
> - Made for phones (two thumbs, portrait), and plays great with a keyboard too
>
> **Controls**
> - **Phone:** drag with your left thumb to move the batter, tap with your right thumb to swing.
> - **Keyboard:** A / D or ← / → to move, Space to swing, P to pause.
>
> **Play it like an app (phone)**
> For a full-screen app with no browser bars, open **https://haydenmay.github.io/baseball-pinball/play/**, then:
> - **iPhone:** Share → Add to Home Screen.
> - **Android:** ⋮ → Install app.
>
> Your progress there is saved separately from this page.
>
> **Free to play.** If you enjoy it, $0.99 helps me make the next one. 💚
>
> **Privacy:** no ads, no accounts, no tracking. Your saves stay on your device.
>
> **Credits**
> - Game by Hayden May
> - Physics: planck.js (MIT)
> - Font: Barlow Condensed (SIL Open Font License 1.1)
> - Sound effects rendered with earshot (MIT) from public-domain (CC0) recordings, plus sounds synthesized in the game
> - Built with TypeScript and Vite

## 7. Before you hit Public

- [ ] Run `npm run package:itch` on the latest `main` and upload that zip. A zip from an older build carries the older game.
- [ ] Open the draft page **on your phone**: tap Run game, play one pitch with sound on, and check that the fullscreen button works.
- [ ] Open it on a desktop browser: the 390 × 780 frame shows the whole game with no scrollbars.
- [ ] Check the cover crop in the "Edit theme" preview. The text sits on the left so it survives itch's small thumbnail.
- [ ] Optional: **Edit theme** → background `#0a0618`, links `#ff4fd8`, text `#e9e3ff` to match the game.
