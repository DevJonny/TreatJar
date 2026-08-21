/**
 * Device-local preferences — not synced. Motion and colour scheme belong to
 * the device you are holding, not to the child's jar.
 */

export const PREFS_KEY = 'treatjar.prefs.v1';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type MotionChoice = 'system' | 'reduced';

export interface Preferences {
  version: 1;
  theme: ThemeChoice;
  motion: MotionChoice;
}

export const DEFAULT_PREFS: Preferences = { version: 1, theme: 'system', motion: 'system' };

export function parsePrefs(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFS;
  const p = raw as Record<string, unknown>;
  const theme = p['theme'];
  const motion = p['motion'];
  return {
    version: 1,
    theme: theme === 'light' || theme === 'dark' ? theme : 'system',
    motion: motion === 'reduced' ? 'reduced' : 'system',
  };
}

export function loadPrefs(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? parsePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Preferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode */
  }
}

/**
 * Whether animation should be suppressed.
 *
 * `?reduced=1` is honoured as well as the media query because browser
 * automation in this project never fires requestAnimationFrame — an animated
 * pile is untestable and hangs a screenshot, so verification needs a way to
 * force the synchronous path from the URL.
 */
export function prefersReducedMotion(choice: MotionChoice): boolean {
  if (choice === 'reduced') return true;
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).get('reduced') === '1') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
