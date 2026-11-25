/**
 * Home Screen install support ("make it an app").
 *
 * - Links the web app manifest and the apple-touch-icon with paths relative to the current route (every route
 *   shares one index.html; /build-test/ etc. live one folder down), so iOS "Add to Home Screen" and Android
 *   "Install app" both get the icon, name and full-screen launch.
 * - Shows one small, dismissible tip in the between-plays card (never during live play):
 *     iPhone/iPad Safari, not yet installed → "Share → Add to Home Screen"
 *     Android/desktop Chrome with an install prompt available → an INSTALL APP button
 *   Dismissal is remembered on this device. Nothing shows once running as an installed app.
 */
export const INSTALL_UI = {
  /** localStorage key remembering "don't show the install tip again" */
  dismissKey: 'bp-install-tip-dismissed',
  iosText: 'Play full screen: tap Share, then “Add to Home Screen”.',
  androidButton: 'INSTALL APP',
  androidText: 'Install it like an app: full screen, one tap from your home screen.',
};

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Folder of the app root relative to the current page ('./' on /, '../' on /1/, /play/, /build-test/, …). */
export function appRootFor(pathname: string) {
  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const last = segs.at(-1) ?? '';
  // GitHub Pages serves the repo under /baseball-pinball/; a route is any known sub-folder below it
  return /^(1|2|3|play|build-test|build-test-legacy)$/.test(last) ? '../' : './';
}

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || (navigator as any).standalone === true;
}

export function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function dismissed() {
  try {
    return localStorage.getItem(INSTALL_UI.dismissKey) === '1';
  } catch {
    return false;
  }
}
function dismiss() {
  try {
    localStorage.setItem(INSTALL_UI.dismissKey, '1');
  } catch {
    /* private mode: just hide for this visit */
  }
}

/** Add manifest + icon links (all routes) and, on the run route, the install tip under `anchor`. */
export function setupInstall(opts: { showTip: boolean; anchor: HTMLElement }) {
  // the itch package marks its page data-entry: its files sit next to it
  const root = document.documentElement.dataset.entry ? './' : appRootFor(location.pathname);
  const link = (rel: string, href: string) => {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = root + href;
    document.head.appendChild(l);
  };
  link('manifest', 'manifest.webmanifest');
  link('apple-touch-icon', 'icons/apple-touch-icon.png');
  link('icon', 'icons/icon-192.png');

  // inside a frame (the itch.io embed) an install would save the host page, not the game: no tip there
  let framed = false;
  try {
    framed = window.self !== window.top;
  } catch {
    framed = true;
  }
  if (!opts.showTip || framed || isStandalone() || dismissed()) return;
  const tip = document.createElement('div');
  tip.className = 'install-tip';
  tip.hidden = true;
  const text = document.createElement('span');
  const act = document.createElement('button');
  act.type = 'button';
  act.className = 'install-go';
  act.hidden = true;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'install-x';
  close.setAttribute('aria-label', 'Hide this tip');
  close.textContent = '×';
  tip.append(text, act, close);
  opts.anchor.after(tip);
  close.addEventListener('click', () => {
    dismiss();
    tip.remove();
  });

  if (isIOS()) {
    text.textContent = INSTALL_UI.iosText;
    tip.hidden = false;
    return;
  }
  // Chrome/Edge/Samsung Internet: only offer when the browser says it can install
  addEventListener('beforeinstallprompt', ev => {
    ev.preventDefault();
    const e = ev as BeforeInstallPromptEvent;
    text.textContent = INSTALL_UI.androidText;
    act.textContent = INSTALL_UI.androidButton;
    act.hidden = false;
    tip.hidden = false;
    act.onclick = async () => {
      await e.prompt();
      const r = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
      if (r.outcome === 'accepted') tip.remove();
    };
  });
  addEventListener('appinstalled', () => tip.remove());
}
