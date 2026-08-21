/**
 * Device-local persistence.
 *
 * Everything that touches localStorage is wrapped: Safari in private mode
 * throws on setItem, and failing to save a token must never take the app down
 * with it.
 *
 * Records are validated field by field on read, with each field falling back
 * independently. One corrupt value therefore costs one value, not the whole
 * jar — which matters because this store is also the merge input for sync, and
 * discarding a jar wholesale would then propagate the loss to every device.
 */

import { THEME_IDS, type Jar, type Reason, type Round, type ThemeId, type Token } from './types.ts';

const KEY_JARS = 'treatjar.v1.jars';
const KEY_ROUNDS = 'treatjar.v1.rounds';
const KEY_TOKENS = 'treatjar.v1.tokens';
const KEY_ACTIVE = 'treatjar.v1.activeJarId';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded, or private mode — losing a save beats crashing */
  }
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const themeId = (v: unknown): ThemeId =>
  typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v) ? (v as ThemeId) : 'dinosaurs';
const iso = (v: unknown): string => {
  const s = typeof v === 'string' ? v : '';
  return Number.isNaN(Date.parse(s)) ? new Date(0).toISOString() : s;
};

function reviveReason(v: unknown): Reason | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['tokenTypeId'] !== 'string') return null;
  return { id: r['id'], label: str(r['label'], ''), tokenTypeId: r['tokenTypeId'] };
}

function reviveJar(v: unknown): Jar | null {
  if (typeof v !== 'object' || v === null) return null;
  const j = v as Record<string, unknown>;
  if (typeof j['id'] !== 'string') return null;
  return {
    id: j['id'],
    name: str(j['name'], 'Jar'),
    themeId: themeId(j['themeId']),
    target: Math.max(1, num(j['target'], 20)),
    reasons: Array.isArray(j['reasons'])
      ? j['reasons'].map(reviveReason).filter((r): r is Reason => r !== null)
      : [],
    createdUtc: iso(j['createdUtc']),
    currentRoundId: str(j['currentRoundId'], ''),
    lastModified: iso(j['lastModified']),
    ...(j['isDeleted'] === true ? { isDeleted: true as const } : {}),
  };
}

function reviveRound(v: unknown): Round | null {
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['jarId'] !== 'string') return null;
  const completed = r['completedUtc'];
  return {
    id: r['id'],
    jarId: r['jarId'],
    index: Math.max(1, Math.floor(num(r['index'], 1))),
    startedUtc: iso(r['startedUtc']),
    completedUtc: typeof completed === 'string' && !Number.isNaN(Date.parse(completed)) ? completed : null,
    lastModified: iso(r['lastModified']),
    ...(r['isDeleted'] === true ? { isDeleted: true as const } : {}),
  };
}

function reviveToken(v: unknown): Token | null {
  if (typeof v !== 'object' || v === null) return null;
  const t = v as Record<string, unknown>;
  if (typeof t['id'] !== 'string' || typeof t['tokenTypeId'] !== 'string') return null;
  if (typeof t['jarId'] !== 'string' || typeof t['roundId'] !== 'string') return null;

  const removalRaw = t['removal'];
  let removal: Token['removal'];
  if (typeof removalRaw === 'object' && removalRaw !== null) {
    const r = removalRaw as Record<string, unknown>;
    const kind = r['kind'] === 'consequence' ? 'consequence' : 'undo';
    removal = {
      kind,
      reasonText: typeof r['reasonText'] === 'string' ? r['reasonText'] : null,
      removedUtc: iso(r['removedUtc']),
    };
  }

  return {
    id: t['id'],
    jarId: t['jarId'],
    roundId: t['roundId'],
    tokenTypeId: t['tokenTypeId'],
    reasonId: typeof t['reasonId'] === 'string' ? t['reasonId'] : null,
    note: typeof t['note'] === 'string' ? t['note'] : null,
    addedUtc: iso(t['addedUtc']),
    // A missing seed would make the token land in the same spot as every other
    // seedless one, so give it a stable pseudo-seed derived from its id.
    seed: typeof t['seed'] === 'number' ? t['seed'] : hashString(t['id']),
    lastModified: iso(t['lastModified']),
    ...(removal ? { removal } : {}),
    ...(t['isDeleted'] === true ? { isDeleted: true as const } : {}),
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const loadJars = (): Jar[] =>
  read<unknown[]>(KEY_JARS, []).map(reviveJar).filter((j): j is Jar => j !== null);
export const saveJars = (jars: readonly Jar[]): void => write(KEY_JARS, jars);

export const loadRounds = (): Round[] =>
  read<unknown[]>(KEY_ROUNDS, []).map(reviveRound).filter((r): r is Round => r !== null);
export const saveRounds = (rounds: readonly Round[]): void => write(KEY_ROUNDS, rounds);

export const loadTokens = (): Token[] =>
  read<unknown[]>(KEY_TOKENS, []).map(reviveToken).filter((t): t is Token => t !== null);
export const saveTokens = (tokens: readonly Token[]): void => write(KEY_TOKENS, tokens);

export const loadActiveJarId = (): string | null => {
  const v = read<unknown>(KEY_ACTIVE, null);
  return typeof v === 'string' ? v : null;
};
export const saveActiveJarId = (id: string | null): void => write(KEY_ACTIVE, id);

/** Exposed for tests. */
export const revive = { reviveJar, reviveRound, reviveToken };
