/**
 * All jar behaviour, as pure functions over plain data.
 *
 * Nothing here imports Svelte or touches storage. Test these directly rather
 * than through the DOM.
 *
 * The central idea: **progress is the summed `value` of a round's live
 * tokens**, compared against `jar.target`. Count themes give every token
 * `value: 1`, so the same arithmetic serves "14 / 20 tokens" and
 * "£6.50 / £10.00". There is deliberately no second code path for money.
 */

import { theme, tokenType, tokenTypeAnywhere } from './themes.ts';
import type { Jar, Round, Token, RemovalKind, ThemeId } from './types.ts';

export const nowIso = (): string => new Date().toISOString();

/** Short, collision-resistant enough for a per-device reward chart. */
export function newId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff);

/** Live = belongs to the round, not removed, not tombstoned by a sync delete. */
export function liveTokens(tokens: readonly Token[], roundId: string): Token[] {
  return tokens.filter((t) => t.roundId === roundId && !t.removal && !t.isDeleted);
}

/**
 * The round's live tokens that the jar's *current* theme can still resolve.
 *
 * Changing a jar's theme orphans every token minted under the old one: the id
 * survives, the type definition does not. Such a token has no value, no
 * silhouette and no label, so `progress` cannot count it and the pile cannot
 * draw it — and therefore nothing else may pretend it is in the jar either.
 *
 * That last part is the trap. `liveTokens` is the right list for anything
 * asking "what has been added to this round"; it is the *wrong* list for
 * anything the grown-up is shown, because the canvas silently drops what it
 * cannot draw and would leave the text story claiming thirty treats sit in a
 * jar that renders empty. Accessibility is a hard rule here: the two must not
 * be able to disagree, so they are derived from the same function.
 */
export function visibleTokens(jar: Jar, tokens: readonly Token[]): Token[] {
  return liveTokens(tokens, jar.currentRoundId).filter(
    (t) => tokenType(jar.themeId, t.tokenTypeId) !== null,
  );
}

/**
 * Summed value of the round's live tokens.
 *
 * A token whose type has since vanished from the theme contributes 0 rather
 * than throwing — a jar must never fail to render because a theme was edited.
 * That is what makes `visibleTokens` the exact set this sums over, which is
 * why it is written that way rather than with a `?? 0` of its own: the two
 * cannot drift into disagreeing about which tokens count.
 */
export function progress(jar: Jar, tokens: readonly Token[]): number {
  return visibleTokens(jar, tokens).reduce(
    (sum, t) => sum + (tokenType(jar.themeId, t.tokenTypeId)?.value ?? 0),
    0,
  );
}

export function isComplete(jar: Jar, tokens: readonly Token[]): boolean {
  return progress(jar, tokens) >= jar.target;
}

/** 0..1, clamped — safe to feed straight to a progress bar width. */
export function progressFraction(jar: Jar, tokens: readonly Token[]): number {
  if (jar.target <= 0) return 0;
  return Math.min(1, Math.max(0, progress(jar, tokens) / jar.target));
}

export function formatProgress(jar: Jar, tokens: readonly Token[]): string {
  return theme(jar.themeId).progress.format(progress(jar, tokens));
}

export function formatTarget(jar: Jar): string {
  return theme(jar.themeId).progress.format(jar.target);
}

/**
 * How many tokens the jar could hold at its target, worst case.
 *
 * This exists because value themes do not bound their own token count: a £10
 * target paid entirely in 50p pieces is 20 bodies, but a theme that added a 1p
 * piece would make it a thousand and the physics world would die. The jar
 * config form gates on this, and a test pins the thresholds, so a future theme
 * cannot reintroduce the problem quietly.
 */
const smallestValue = (themeId: ThemeId): number =>
  Math.min(...theme(themeId).tokens.map((t) => t.value));

export function projectedTokenCount(themeId: ThemeId, target: number): number {
  const smallest = smallestValue(themeId);
  if (smallest <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil(target / smallest);
}

/**
 * Carry a target across a theme change, in units of *effort*.
 *
 * The trap this exists for: a target is a bare number whose unit lives in the
 * theme, so changing the theme silently reinterprets it. A 10-treat jar became
 * "£0.10" — a legal target, cleared by a single 50p, which is why validating it
 * did not catch anything. The number was never wrong; the unit moved out from
 * under it.
 *
 * What is preserved is the number of times a grown-up has to add a token, since
 * that is the thing a child actually experiences: ten treats becomes £5.00,
 * because £5.00 is ten 50p coins. Round-trips exactly, and because the projected
 * token count is unchanged by construction, a valid target cannot be converted
 * into an invalid one — no clamping needed.
 *
 * Note there is no branch on `progress.mode` here, and there must not be (rule
 * 1). Count themes price every token at 1, so for count → count the arithmetic
 * is the identity and a hand-typed 12 survives as 12.
 */
export function retargetForTheme(from: ThemeId, to: ThemeId, target: number): number {
  const fallback = theme(to).progress.targetPresets[1]!;
  if (from === to) return target;
  if (!Number.isFinite(target) || target <= 0) return fallback;

  const adds = projectedTokenCount(from, target);
  const smallest = smallestValue(to);
  if (!Number.isFinite(adds) || smallest <= 0) return fallback;
  return adds * smallest;
}

export const TOKEN_COUNT_WARN = 80;
export const TOKEN_COUNT_MAX = 120;

export type TargetVerdict = { ok: true; warn: boolean; projected: number } | { ok: false; projected: number };

export function validateTarget(themeId: ThemeId, target: number): TargetVerdict {
  const projected = projectedTokenCount(themeId, target);
  if (!Number.isFinite(target) || target <= 0 || projected > TOKEN_COUNT_MAX) {
    return { ok: false, projected };
  }
  return { ok: true, warn: projected > TOKEN_COUNT_WARN, projected };
}

export interface AddTokenInput {
  jar: Jar;
  tokenTypeId: string;
  reasonId?: string | null;
  note?: string | null;
}

export function addToken({ jar, tokenTypeId, reasonId = null, note = null }: AddTokenInput): Token {
  const at = nowIso();
  return {
    id: newId(),
    jarId: jar.id,
    roundId: jar.currentRoundId,
    tokenTypeId,
    reasonId,
    note: note && note.trim() ? note.trim() : null,
    addedUtc: at,
    seed: randomSeed(),
    lastModified: at,
  };
}

/**
 * Removal is a tombstone, never a splice.
 *
 * Keeping the token means the history stays derivable from the token list
 * alone, and — the part that matters for sync — a removal is an ordinary edit
 * that merges by `lastModified` instead of a deletion that has to be
 * communicated separately.
 */
export function removeToken(token: Token, kind: RemovalKind, reasonText: string | null = null): Token {
  const at = nowIso();
  return {
    ...token,
    removal: { kind, reasonText: reasonText && reasonText.trim() ? reasonText.trim() : null, removedUtc: at },
    lastModified: at,
  };
}

export function restoreToken(token: Token): Token {
  const { removal: _removal, ...rest } = token;
  return { ...rest, lastModified: nowIso() };
}

/**
 * The most recently added *visible* token, or null — what "undo" acts on.
 *
 * Visible rather than merely live, because undo is a button a grown-up presses
 * expecting to watch something leave the jar. Handed an orphan from a previous
 * theme it would consume the press, tombstone a token nobody can see, and
 * change nothing on screen.
 */
export function lastAddedToken(jar: Jar, tokens: readonly Token[]): Token | null {
  const visible = visibleTokens(jar, tokens);
  if (visible.length === 0) return null;
  return visible.reduce((newest, t) => (t.addedUtc > newest.addedUtc ? t : newest));
}

export interface RoundClosure {
  jar: Jar;
  closed: Round;
  opened: Round;
}

/**
 * Cash in a completed jar: close the round and open the next one.
 *
 * Tokens are NOT deleted — they belong to the closed round, which becomes the
 * history archive. The jar looks empty because the canvas only ever renders
 * the current round.
 */
export function closeRound(jar: Jar, current: Round): RoundClosure {
  const at = nowIso();
  const closed: Round = { ...current, completedUtc: at, lastModified: at };
  const opened: Round = {
    id: newId(),
    jarId: jar.id,
    index: current.index + 1,
    startedUtc: at,
    completedUtc: null,
    lastModified: at,
  };
  return { jar: { ...jar, currentRoundId: opened.id, lastModified: at }, closed, opened };
}

export interface NewJarInput {
  name: string;
  themeId: ThemeId;
  target: number;
  reasons: { label: string; tokenTypeId: string }[];
}

export function createJar(input: NewJarInput): { jar: Jar; round: Round } {
  const at = nowIso();
  const jarId = newId();
  const round: Round = {
    id: newId(),
    jarId,
    index: 1,
    startedUtc: at,
    completedUtc: null,
    lastModified: at,
  };
  const jar: Jar = {
    id: jarId,
    name: input.name.trim(),
    themeId: input.themeId,
    target: input.target,
    reasons: input.reasons.map((r) => ({ id: newId(), label: r.label.trim(), tokenTypeId: r.tokenTypeId })),
    createdUtc: at,
    currentRoundId: round.id,
    lastModified: at,
  };
  return { jar, round };
}

export type HistoryKind = 'added' | 'removed';

export interface HistoryEntry {
  id: string;
  kind: HistoryKind;
  at: string;
  tokenTypeId: string;
  tokenLabel: string;
  /** The reason shown to a human: a configured reason label, or removal text. */
  reasonLabel: string | null;
  note: string | null;
  roundIndex: number;
  removalKind: RemovalKind | null;
}

/**
 * The history log, derived from tokens alone — there is no stored history
 * collection to fall out of step with them.
 *
 * A token that was added and later removed produces TWO entries, because both
 * things genuinely happened and a parent looking for "why did she lose one"
 * needs to see the removal as its own event.
 */
export function history(jar: Jar, tokens: readonly Token[], rounds: readonly Round[]): HistoryEntry[] {
  const roundIndex = new Map(rounds.map((r) => [r.id, r.index]));
  const reasonLabels = new Map(jar.reasons.map((r) => [r.id, r.label]));
  const entries: HistoryEntry[] = [];

  for (const t of tokens) {
    if (t.isDeleted || t.jarId !== jar.id) continue;
    // Resolved across every theme, not just this jar's. A token minted before
    // a theme change is unresolvable here for ever, and the history is a record
    // of what happened — the add is real, so it gets its real name.
    const label = tokenTypeAnywhere(t.tokenTypeId)?.label ?? t.tokenTypeId;
    const index = roundIndex.get(t.roundId) ?? 0;

    entries.push({
      id: `${t.id}:add`,
      kind: 'added',
      at: t.addedUtc,
      tokenTypeId: t.tokenTypeId,
      tokenLabel: label,
      reasonLabel: t.reasonId ? (reasonLabels.get(t.reasonId) ?? null) : null,
      note: t.note,
      roundIndex: index,
      removalKind: null,
    });

    if (t.removal) {
      entries.push({
        id: `${t.id}:remove`,
        kind: 'removed',
        at: t.removal.removedUtc,
        tokenTypeId: t.tokenTypeId,
        tokenLabel: label,
        reasonLabel: t.removal.reasonText,
        note: null,
        roundIndex: index,
        removalKind: t.removal.kind,
      });
    }
  }

  // Newest first. Ties break on id so the order is stable across renders.
  return entries.sort((a, b) => (b.at === a.at ? b.id.localeCompare(a.id) : b.at.localeCompare(a.at)));
}

/**
 * Drop tokens belonging to rounds older than the retention window.
 *
 * Without this the sync envelope grows forever: a jar completed weekly for two
 * years is ~100 rounds of tokens uploaded on every single change.
 */
export const ROUND_RETENTION = 12;

export function pruneRounds(
  rounds: readonly Round[],
  tokens: readonly Token[],
): { rounds: Round[]; tokens: Token[] } {
  const completed = rounds
    .filter((r) => r.completedUtc !== null)
    .sort((a, b) => (b.completedUtc ?? '').localeCompare(a.completedUtc ?? ''));
  const keepIds = new Set([
    ...rounds.filter((r) => r.completedUtc === null).map((r) => r.id),
    ...completed.slice(0, ROUND_RETENTION).map((r) => r.id),
  ]);
  return {
    rounds: rounds.filter((r) => keepIds.has(r.id)),
    tokens: tokens.filter((t) => keepIds.has(t.roundId)),
  };
}
