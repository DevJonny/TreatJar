/**
 * Listens for the browser's install signal and holds it until asked.
 *
 * Split from `install.ts` because none of this is testable in node and all of
 * it is plumbing. The decision it feeds lives there.
 */

import { installOffer, isIosDevice, type InstallOffer } from './install.ts';

/**
 * Not in lib.dom. `beforeinstallprompt` is Chromium-only and unspecified, so
 * TypeScript declines to know about it, and the shape has to be written out.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const STANDALONE = '(display-mode: standalone)';

class InstallController {
  /** Held rather than fired: the browser only gives it once, and only on a gesture. */
  private deferred: BeforeInstallPromptEvent | null = null;

  canPrompt = $state(false);
  standalone = $state(false);
  ios = $state(false);
  /** Announced after a choice is made, since the button vanishing is not an announcement. */
  said = $state('');

  get offer(): InstallOffer {
    return installOffer({ standalone: this.standalone, canPrompt: this.canPrompt, ios: this.ios });
  }

  /**
   * Start listening. Returns its own teardown, and must be called from the
   * browser — reading `window` when this module loads would break the node
   * tests that import the pure half.
   *
   * Called at app start, not when Settings opens: `beforeinstallprompt` fires
   * once, early, and is gone. Wait until the sheet is open and it has already
   * happened.
   */
  start(): () => void {
    this.ios = isIosDevice(navigator.userAgent, navigator.maxTouchPoints);
    const media = window.matchMedia(STANDALONE);
    this.standalone = media.matches || (navigator as { standalone?: boolean }).standalone === true;

    const onBefore = (e: Event) => {
      // Without this Chrome shows its own mini-infobar and never hands the
      // event over, so the button below would have nothing to fire.
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canPrompt = true;
    };
    const onInstalled = () => {
      this.deferred = null;
      this.canPrompt = false;
      this.standalone = true;
      this.said = 'Treat Jar was added to your home screen.';
    };
    const onDisplay = (e: MediaQueryListEvent) => { this.standalone = e.matches; };

    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    media.addEventListener('change', onDisplay);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
      media.removeEventListener('change', onDisplay);
    };
  }

  /**
   * Fire the held prompt.
   *
   * The event is single-use whatever the answer, so it is dropped either way.
   * A dismissal is not an error and is not treated as one — the browser will
   * offer another one on a later visit if it feels like it.
   */
  async prompt(): Promise<void> {
    const e = this.deferred;
    if (!e) return;
    this.deferred = null;
    this.canPrompt = false;
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      // 'accepted' is left to the `appinstalled` listener, which is what
      // actually knows the install finished.
      if (outcome === 'dismissed') this.said = 'Not installed. You can add it later from Settings.';
    } catch {
      this.said = 'That did not work. You can add it from your browser menu.';
    }
  }
}

export const install = new InstallController();
