/**
 * Read-only snapshot links.
 *
 * Google Drive's appDataFolder is private to the app and the signed-in user,
 * so it cannot back a "show grandma the jar" link. Instead the jar's visible
 * state is encoded into the URL itself and rendered read-only. The viewer
 * needs no account and no sign-in, and the link works forever because it
 * carries everything it needs.
 *
 * What is deliberately NOT in the payload: reasons, notes, history, token ids,
 * round ids, and every other jar. A link leaks a first name and a pile — the
 * things already visible to anyone the child would show it to.
 *
 * The payload is small enough (a 20-token jar is ~150 bytes) that compression
 * would cost more than it saves, and `CompressionStream` would make the whole
 * function async for no benefit. Keep it synchronous.
 */

import { THEMES, tokenTypeIndex } from './themes.ts';
import { THEME_IDS, type ThemeId, type Jar, type Token } from './types.ts';
import { liveTokens } from './jar.ts';

/** Bounds both the URL length and the number of bodies a link can conjure. */
export const MAX_SHARED_TOKENS = 200;
export const MAX_SHARED_NAME = 40;

export interface SharedJar {
  name: string;
  themeId: ThemeId;
  target: number;
  /** Indices into the theme's four token types, in pile order. */
  tokenTypes: number[];
  seed: number;
  sharedAt: number;
}

/** The wire shape. Single letters because every byte is URL. */
interface Wire {
  v: 1;
  n: string;
  g: number;
  t: number;
  k: number[];
  s: number;
  d: number;
}

function b64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(payload: string): string | null {
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeShare(jar: Jar, tokens: readonly Token[], sharedAt = Date.now()): string {
  const live = liveTokens(tokens, jar.currentRoundId).slice(0, MAX_SHARED_TOKENS);
  const wire: Wire = {
    v: 1,
    n: jar.name.slice(0, MAX_SHARED_NAME),
    g: THEME_IDS.indexOf(jar.themeId),
    t: jar.target,
    k: live.map((t) => tokenTypeIndex(jar.themeId, t.tokenTypeId)).filter((i) => i >= 0),
    // One seed for the whole pile; per-token seeds are derived from it, which
    // is what keeps a 40-token link the same size as a 4-token one.
    s: live[0]?.seed ?? 1,
    d: Math.floor(sharedAt / 1000),
  };
  return b64urlEncode(JSON.stringify(wire));
}

const isIndex = (v: unknown, len: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < len;

/**
 * Anything unrecognised returns null rather than throwing, so a truncated or
 * hand-edited link lands on the normal app instead of a blank page.
 */
export function decodeShare(payload: string): SharedJar | null {
  const json = b64urlDecode(payload);
  if (json === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const w = raw as Partial<Wire>;

  if (w.v !== 1) return null;
  if (!isIndex(w.g, THEME_IDS.length)) return null;
  const themeId = THEME_IDS[w.g]!;
  const typeCount = THEMES[themeId].tokens.length;

  if (typeof w.n !== 'string') return null;
  if (typeof w.t !== 'number' || !Number.isFinite(w.t) || w.t <= 0) return null;
  if (!Array.isArray(w.k) || w.k.length > MAX_SHARED_TOKENS) return null;
  if (!w.k.every((i) => isIndex(i, typeCount))) return null;
  if (typeof w.s !== 'number' || !Number.isFinite(w.s)) return null;
  if (typeof w.d !== 'number' || !Number.isFinite(w.d)) return null;

  return {
    name: w.n.slice(0, MAX_SHARED_NAME),
    themeId,
    target: w.t,
    tokenTypes: w.k,
    seed: w.s >>> 0,
    sharedAt: w.d * 1000,
  };
}

/** Rebuild the pile a share link describes, with seeds derived from the one it carries. */
export function sharedPile(shared: SharedJar): { id: string; tokenTypeId: string; seed: number }[] {
  const tokens = THEMES[shared.themeId].tokens;
  return shared.tokenTypes.map((typeIndex, i) => ({
    id: `s${i}`,
    tokenTypeId: tokens[typeIndex]!.id,
    // Mixing the index in keeps every token's drop distinct from its neighbours'.
    seed: (shared.seed + i * 2654435761) >>> 0,
  }));
}

/** Summed value of a shared pile — the same arithmetic as a live jar. */
export function sharedProgress(shared: SharedJar): number {
  const tokens = THEMES[shared.themeId].tokens;
  return shared.tokenTypes.reduce((sum, i) => sum + tokens[i]!.value, 0);
}
