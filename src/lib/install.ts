/**
 * Whether, and how, to offer to install the app.
 *
 * The app has always been installable — manifest, service worker, icons — but
 * nothing in it ever said so, and "open the browser menu and find Install" is
 * not a thing a parent discovers. This decides what to offer; the wiring that
 * listens for the browser's own signal lives in `install.svelte.ts`.
 *
 * Pure and testable on purpose: the interesting part is the decision, and the
 * decision depends on facts about the platform that are miserable to reproduce
 * in a browser under test.
 */

export type InstallOffer =
  /** Already running as an installed app — there is nothing to offer. */
  | 'installed'
  /** The browser handed us a prompt to fire. One button, one tap. */
  | 'prompt'
  /** iOS: no API exists, so the steps have to be written out. */
  | 'manual'
  /**
   * The prompt was offered and is now spent — dismissed, or it failed.
   *
   * The browser gives the event once and will not give it again this visit, so
   * the button cannot come back. What must NOT happen is the section vanishing:
   * someone who taps Install, changes their mind, then changes it back would
   * find the option gone and nothing to explain where it went.
   */
  | 'spent'
  /** Nothing useful to say — do not render a dead section. */
  | 'none';

/**
 * iPhone and iPad, including the awkward one.
 *
 * iPadOS 13 and later report a desktop Safari user agent — "Macintosh", no
 * "iPad" anywhere — deliberately, so that sites serve them the desktop layout.
 * The only thing separating an iPad from a Mac in script is that a Mac has no
 * touch screen, which is why `maxTouchPoints` is dragged into this at all.
 * Get it wrong and every iPad owner is told the app cannot be installed on a
 * device where it installs perfectly well.
 */
export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/**
 * `standalone` means "already installed", near enough.
 *
 * There is no way to ask "is this app installed"; the closest available
 * question is "am I running outside a browser tab right now", which is a
 * different thing wearing the same coat. It answers the one case that matters
 * — do not offer to install the app to someone reading this inside the
 * installed app — and it is wrong only in the harmless direction, where
 * someone with it already installed opens the site in a tab and is offered it
 * again.
 */
export function installOffer(platform: {
  standalone: boolean;
  canPrompt: boolean;
  ios: boolean;
  /** True once the browser has offered a prompt, even if it has been used up. */
  everOffered?: boolean;
}): InstallOffer {
  if (platform.standalone) return 'installed';
  if (platform.canPrompt) return 'prompt';
  if (platform.ios) return 'manual';
  if (platform.everOffered) return 'spent';
  return 'none';
}
