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

/**
 * What each of the old theme's token types becomes in the new one.
 *
 * Keyed by the OLD theme's token type id. The grown-up chooses this — the app
 * deliberately does not guess, because there is no answer it could derive that
 * is right in both directions. A dinosaur has no denomination, so converting
 * a count jar to money means inventing an exchange rate; converting back means
 * throwing one away. Whoever knows what a T-Rex is worth in this house is the
 * person filling in the form, not this module.
 *
 * The upshot for rule 1 is the good kind: because the rate is supplied rather
 * than computed, nothing here needs to know or ask what mode either theme is
 * in. The conversion is the same arithmetic for money → sweets as for
 * dinosaurs → space.
 */
export type TokenMapping = Readonly<Record<string, string>>;

/**
 * The mapping offered before the grown-up edits it: everything becomes the new
 * theme's cheapest token.
 *
 * The obvious default is index n → index n, the way `JarConfigForm` remaps
 * `reasons`. It is wrong here, and loudly so: `retargetForTheme` converts the
 * TARGET by pricing it at `adds × smallest`, so a 20-token jar becomes £10.00.
 * Ranking the contents the same way prices eight dinosaurs at £17.00 and
 * completes the jar the moment it is saved — the two halves of one theme
 * change pulling in opposite directions.
 *
 * Defaulting to the smallest token makes them agree exactly. Each token is
 * worth one `smallest`, the target is `adds × smallest`, so the fraction the
 * jar displays is unchanged by the conversion: eight of twenty treats before,
 * £4.00 of £10.00 after. It needs no branch on either theme's mode to do it,
 * for the same reason `retargetForTheme` does not — count themes price a token
 * at 1, so count → count is the identity and the ranks never mattered there.
 *
 * A grown-up who wants a T-Rex to be worth more than a fossil says so in the
 * form. This is only the opening offer, and it is the one that changes nothing.
 */
export function defaultTokenMapping(from: ThemeId, to: ThemeId): TokenMapping {
  const cheapest = theme(to).tokens.reduce((low, t) => (t.value < low.value ? t : low));
  const mapping: Record<string, string> = {};
  for (const t of theme(from).tokens) mapping[t.id] = cheapest.id;
  return mapping;
}

/**
 * Rewrite the round's live tokens into the new theme, one for one.
 *
 * One for one is the whole design, and it is what makes this safe to sync.
 * Rewriting `tokenTypeId` on a token that already exists is an ordinary edit
 * that merges by `lastModified` like any other (rule 3), so two devices
 * converting the same jar converge on whichever conversion happened later.
 * Minting replacement tokens instead — which is what preserving the progress
 * FRACTION across a mode change would require — would give each device its own
 * fresh ids, and `mergeById` would keep both sets and double the child's
 * progress. Tombstoning is likewise avoided: rule 4 keeps history derivable
 * from the token list, and a convert is not a removal.
 *
 * `seed` is deliberately preserved, so the pile settles into recognisably the
 * same heap it was before rather than reshuffling itself as a side effect.
 *
 * Tokens outside the current round are left exactly as they are: past rounds
 * are history, and history records what was actually in the jar at the time.
 */
export function convertTokens(
  jar: Jar,
  tokens: readonly Token[],
  mapping: TokenMapping,
  at: string = nowIso(),
): Token[] {
  // Visible, not merely live: a jar saved before this feature existed may still
  // hold tokens orphaned by an older theme change. They are unmappable anyway —
  // the mapping is keyed by the CURRENT theme's types — but saying so here
  // means a hand-built mapping cannot reach them by accident either.
  const convertible = new Set(visibleTokens(jar, tokens).map((t) => t.id));
  return tokens.map((t) => {
    if (!convertible.has(t.id)) return t;
    const next = mapping[t.tokenTypeId];
    if (next === undefined || next === t.tokenTypeId) return t;
    return {
      ...t,
      tokenTypeId: next,
      // `??`, never plain assignment: a jar converted twice must still name the
      // type the child was actually handed, not the one it passed through.
      mintedAs: t.mintedAs ?? t.tokenTypeId,
      lastModified: at,
    };
  });
}

/**
 * Empty the jar because its theme changed, without deleting anything.
 *
 * A tombstone rather than a splice, for the reasons in `removeToken` — but
 * under its own `RemovalKind`, so the history says the jar was emptied and not
 * that the child lost thirty treats.
 */
export function clearTokensForThemeChange(
  jar: Jar,
  tokens: readonly Token[],
  reasonText: string | null = null,
  at: string = nowIso(),
): Token[] {
  // `liveTokens` here, unlike everywhere else in this file, and on purpose.
  // "Start again" means the round starts empty, so it must also clear tokens
  // orphaned by an older theme change — invisible, uncounted, but still in the
  // round, and still able to reappear if the jar is ever switched back to the
  // theme that minted them. Emptying only what is currently drawable would
  // leave a jar that reads zero and is not.
  const live = new Set(liveTokens(tokens, jar.currentRoundId).map((t) => t.id));
  // Normalised exactly as `removeToken` does it. A whitespace-only reason that
  // survives to storage renders as a blank line in the history, under an entry
  // that looks like it should say something.
  const reason = reasonText && reasonText.trim() ? reasonText.trim() : null;
  return tokens.map((t) =>
    live.has(t.id)
      ? { ...t, removal: { kind: 'themeChange' as const, reasonText: reason, removedUtc: at }, lastModified: at }
      : t,
  );
}

/**
 * What `progress` would read after converting, given a target and a mapping.
 *
 * The form shows this before anything is saved, because a hand-picked mapping
 * can land anywhere: price a dinosaur at 50p and a twelve-token jar converts
 * to £6.00 against a £1.00 target, completing it the instant it is saved. That
 * is a legitimate thing to want and a terrible thing to discover afterwards,
 * so it is displayed rather than prevented.
 */
export function projectedProgress(
  jar: Jar,
  tokens: readonly Token[],
  to: ThemeId,
  mapping: TokenMapping,
): number {
  // Every live token, valued at whatever it will be worth once the theme has
  // changed — which is not the same question as what is in the jar now.
  //
  // A token converts if the jar can currently see it. One it cannot see is an
  // orphan from an older theme change, and `convertTokens` leaves it alone —
  // but leaving it alone is not the same as it staying worthless, because the
  // theme being switched TO may be the very one that minted it. Switch a
  // dinosaur jar holding a stranded 50p to money and that coin resolves again
  // and starts counting. Summing only the convertible tokens would quietly
  // under-report the jar by exactly the treats it is about to recover.
  const convertible = new Set(visibleTokens(jar, tokens).map((t) => t.id));
  return liveTokens(tokens, jar.currentRoundId).reduce((sum, t) => {
    const next = convertible.has(t.id) ? mapping[t.tokenTypeId] : t.tokenTypeId;
    return sum + (next === undefined ? 0 : (tokenType(to, next)?.value ?? 0));
  }, 0);
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
    // The type the child was actually given, which is not always the type the
    // token now is: converting a jar rewrites `tokenTypeId` so the pile and
    // the bar can work in the new theme, and `mintedAs` is what stops that
    // rewriting her past into a currency she never earned.
    //
    // Resolved across every theme, because by definition this jar's theme
    // cannot name it. The add is real, so it gets its real name.
    const mintedId = t.mintedAs ?? t.tokenTypeId;
    const label = tokenTypeAnywhere(mintedId)?.label ?? mintedId;
    const index = roundIndex.get(t.roundId) ?? 0;

    entries.push({
      id: `${t.id}:add`,
      kind: 'added',
      at: t.addedUtc,
      tokenTypeId: mintedId,
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
        tokenTypeId: mintedId,
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
