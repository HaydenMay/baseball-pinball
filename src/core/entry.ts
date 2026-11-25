/**
 * Where the game is running from. On GitHub Pages the URL picks the mode (/play/, /build-test/, /1/ …).
 * The itch.io package (scripts/package-itch.mjs) instead marks its page `<html data-entry="play">`: itch
 * serves it from its own URL (…/html/<id>/index.html), so the page says what it is and its files sit
 * right next to it.
 */
import { appRootFor } from './install.ts';

export function packagedEntry(doc: { documentElement: { dataset: DOMStringMap } } | null = typeof document === 'undefined' ? null : document): string | null {
  return doc?.documentElement.dataset.entry ?? null;
}

/** The pathname used for route decisions (mode, save slot, preset). */
export function routePathname(pathname: string, entry = packagedEntry()) {
  return entry ? `/${entry}/` : pathname;
}

/** Folder holding assets, sounds and icons, relative to the page. */
export function assetRoot(pathname: string, entry = packagedEntry()) {
  return entry ? './' : appRootFor(pathname);
}

/** Running inside another page's frame (the itch.io embed). */
export function isFramed() {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent: definitely framed
  }
}
