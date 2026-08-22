import { describe, expect, it } from 'vitest';
import {
  addToken, closeRound, createJar, formatProgress, formatTarget, history, isComplete,
  lastAddedToken, liveTokens, progress, progressFraction, projectedTokenCount, pruneRounds,
  removeToken, restoreToken, retargetForTheme, validateTarget, TOKEN_COUNT_MAX,
} from '../src/lib/jar.ts';
import type { Round, Token } from '../src/lib/types.ts';

const dinoJar = () => createJar({
  name: 'Ellie', themeId: 'dinosaurs', target: 20,
  reasons: [{ label: 'Tidied room', tokenTypeId: 'raptor' }],
});

const moneyJar = () => createJar({
  name: 'Sam', themeId: 'money', target: 1000, reasons: [],
});

const addMany = (jar: ReturnType<typeof dinoJar>['jar'], types: string[]): Token[] =>
  types.map((tokenTypeId) => addToken({ jar, tokenTypeId }));

describe('progress is one calculation for both modes', () => {
  it('counts tokens when every token is worth 1', () => {
    const { jar } = dinoJar();
    const tokens = addMany(jar, ['trex', 'stego', 'raptor', 'bone']);
    expect(progress(jar, tokens)).toBe(4);
    expect(formatProgress(jar, tokens)).toBe('4 tokens');
    expect(formatTarget(jar)).toBe('20 tokens');
  });

  it('sums pence when tokens carry denominations', () => {
    const { jar } = moneyJar();
    const tokens = addMany(jar, ['coin-200', 'coin-200', 'coin-100', 'coin-50']);
    expect(progress(jar, tokens)).toBe(550);
    expect(formatProgress(jar, tokens)).toBe('£5.50');
    expect(formatTarget(jar)).toBe('£10.00');
  });

  it('singularises one token', () => {
    const { jar } = dinoJar();
    expect(formatProgress(jar, addMany(jar, ['trex']))).toBe('1 token');
  });

  it('never lets float arithmetic into a money total', () => {
    const { jar } = moneyJar();
    // The classic float trap: 0.50 + 0.50 + 0.50 !== 1.50 in binary floating point.
    const tokens = addMany(jar, ['coin-50', 'coin-50', 'coin-50']);
    expect(progress(jar, tokens)).toBe(150);
    expect(Number.isInteger(progress(jar, tokens))).toBe(true);
    expect(formatProgress(jar, tokens)).toBe('£1.50');
  });

  it('completes exactly on the target, in both modes', () => {
    const { jar: dino } = dinoJar();
    const { jar: money } = moneyJar();
    expect(isComplete(dino, addMany(dino, Array(19).fill('trex')))).toBe(false);
    expect(isComplete(dino, addMany(dino, Array(20).fill('trex')))).toBe(true);
    expect(isComplete(money, addMany(money, ['note-500', 'note-500']))).toBe(true);
  });

  it('clamps the progress fraction', () => {
    const { jar } = dinoJar();
    expect(progressFraction(jar, addMany(jar, Array(30).fill('trex')))).toBe(1);
    expect(progressFraction(jar, [])).toBe(0);
  });

  it('ignores a token whose type no longer exists rather than throwing', () => {
    const { jar } = dinoJar();
    const tokens = [...addMany(jar, ['trex']), { ...addToken({ jar, tokenTypeId: 'pterodactyl' }) }];
    expect(progress(jar, tokens)).toBe(1);
  });
});

describe('removal is a tombstone, not a splice', () => {
  it('keeps the token but drops it from progress', () => {
    const { jar } = dinoJar();
    const tokens = addMany(jar, ['trex', 'stego']);
    const first = tokens[0]!;
    const after = [removeToken(first, 'consequence', 'Hit her brother'), tokens[1]!];

    expect(after).toHaveLength(2);
    expect(progress(jar, after)).toBe(1);
    expect(liveTokens(after, jar.currentRoundId)).toHaveLength(1);
    expect(after[0]!.removal).toMatchObject({ kind: 'consequence', reasonText: 'Hit her brother' });
  });

  it('trims blank removal reasons to null', () => {
    const { jar } = dinoJar();
    const t = addToken({ jar, tokenTypeId: 'trex' });
    expect(removeToken(t, 'undo', '   ').removal?.reasonText).toBeNull();
  });

  it('restores a removed token back into progress', () => {
    const { jar } = dinoJar();
    const t = addToken({ jar, tokenTypeId: 'trex' });
    const removed = removeToken(t, 'undo');
    expect(progress(jar, [removed])).toBe(0);
    const restored = restoreToken(removed);
    expect(restored.removal).toBeUndefined();
    expect(progress(jar, [restored])).toBe(1);
  });

  it('undo targets the most recently added live token', () => {
    const { jar } = dinoJar();
    const a = { ...addToken({ jar, tokenTypeId: 'trex' }), addedUtc: '2026-01-01T10:00:00.000Z' };
    const b = { ...addToken({ jar, tokenTypeId: 'stego' }), addedUtc: '2026-01-01T12:00:00.000Z' };
    expect(lastAddedToken(jar, [a, b])?.tokenTypeId).toBe('stego');
    expect(lastAddedToken(jar, [a, removeToken(b, 'undo')])?.tokenTypeId).toBe('trex');
    expect(lastAddedToken(jar, [])).toBeNull();
  });
});

describe('rounds', () => {
  it('closing a round empties the jar without deleting tokens', () => {
    const { jar, round } = dinoJar();
    const tokens = addMany(jar, Array(20).fill('trex'));
    expect(isComplete(jar, tokens)).toBe(true);

    const { jar: next, closed, opened } = closeRound(jar, round);
    expect(closed.completedUtc).not.toBeNull();
    expect(opened.index).toBe(2);
    expect(next.currentRoundId).toBe(opened.id);

    // The tokens still exist; they just belong to a round that is no longer current.
    expect(tokens).toHaveLength(20);
    expect(progress(next, tokens)).toBe(0);
    expect(isComplete(next, tokens)).toBe(false);
  });

  it('prunes tokens beyond the retention window but never the open round', () => {
    const { jar } = dinoJar();
    const rounds: Round[] = Array.from({ length: 20 }, (_, i) => ({
      id: `r${i}`, jarId: jar.id, index: i + 1,
      startedUtc: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      completedUtc: `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`,
      lastModified: '2026-01-01T00:00:00.000Z',
    }));
    rounds.push({ id: 'open', jarId: jar.id, index: 21, startedUtc: '2026-02-01T00:00:00.000Z', completedUtc: null, lastModified: '2026-02-01T00:00:00.000Z' });
    const tokens: Token[] = rounds.map((r) => ({ ...addToken({ jar, tokenTypeId: 'trex' }), roundId: r.id }));

    const pruned = pruneRounds(rounds, tokens);
    expect(pruned.rounds).toHaveLength(13); // 12 completed + the open one
    expect(pruned.rounds.some((r) => r.id === 'open')).toBe(true);
    expect(pruned.tokens.every((t) => pruned.rounds.some((r) => r.id === t.roundId))).toBe(true);
  });
});

describe('target validation bounds the physics world', () => {
  it('projects worst-case token count from the smallest denomination', () => {
    expect(projectedTokenCount('money', 1000)).toBe(20); // £10 in 50p pieces
    expect(projectedTokenCount('dinosaurs', 20)).toBe(20);
  });

  it('accepts sensible targets and rejects ones that would flood the jar', () => {
    expect(validateTarget('dinosaurs', 20)).toMatchObject({ ok: true, warn: false });
    expect(validateTarget('money', 2000)).toMatchObject({ ok: true, warn: false }); // £20 -> 40
    expect(validateTarget('money', 10000).ok).toBe(false); // £100 -> 200 bodies
    expect(validateTarget('dinosaurs', 0).ok).toBe(false);
    expect(validateTarget('dinosaurs', -5).ok).toBe(false);
  });

  it('warns before it refuses', () => {
    const warn = validateTarget('dinosaurs', 100);
    expect(warn).toMatchObject({ ok: true, warn: true });
    expect(validateTarget('dinosaurs', TOKEN_COUNT_MAX + 1).ok).toBe(false);
  });
});

describe('a target changes units when the theme changes', () => {
  it('leaves the target alone when the units do not move', () => {
    // All three count themes price a token at 1, so the number still means
    // what it said. A hand-typed target must survive this untouched.
    expect(retargetForTheme('dinosaurs', 'space', 12)).toBe(12);
    expect(retargetForTheme('space', 'sweets', 30)).toBe(30);
    expect(retargetForTheme('dinosaurs', 'dinosaurs', 17)).toBe(17);
  });

  it('converts count to money as the same number of token-adds', () => {
    // The bug: 10 treats used to stay the raw number 10 and be read as 10p,
    // a target one 50p coin clears. Ten treats is ten 50p coins: £5.00.
    expect(retargetForTheme('dinosaurs', 'money', 10)).toBe(500);
    expect(retargetForTheme('dinosaurs', 'money', 15)).toBe(750);
    expect(retargetForTheme('dinosaurs', 'money', 30)).toBe(1500);
  });

  it('converts money back to a count of the smallest coin', () => {
    expect(retargetForTheme('money', 'dinosaurs', 1000)).toBe(20);
    expect(retargetForTheme('money', 'sweets', 500)).toBe(10);
  });

  it('round-trips a target through a theme change and back', () => {
    for (const target of [10, 15, 20, 30, 12, 7]) {
      const asMoney = retargetForTheme('dinosaurs', 'money', target);
      expect(retargetForTheme('money', 'dinosaurs', asMoney)).toBe(target);
    }
  });

  it('cannot turn a valid target into one the jar cannot hold', () => {
    // Effort is preserved, so the projected body count is preserved with it.
    // This is why the conversion needs no clamping.
    for (const target of [10, 15, 20, 30, 80, TOKEN_COUNT_MAX]) {
      expect(projectedTokenCount('money', retargetForTheme('dinosaurs', 'money', target)))
        .toBe(projectedTokenCount('dinosaurs', target));
      expect(validateTarget('money', retargetForTheme('dinosaurs', 'money', target)).ok)
        .toBe(validateTarget('dinosaurs', target).ok);
    }
  });

  it('falls back to the new theme default when there is no target to carry', () => {
    expect(retargetForTheme('dinosaurs', 'money', 0)).toBe(1000);
    expect(retargetForTheme('dinosaurs', 'money', -5)).toBe(1000);
    expect(retargetForTheme('money', 'dinosaurs', Number.NaN)).toBe(15);
  });
});

describe('history is derived from tokens', () => {
  it('emits both an add and a remove for a token that was taken back', () => {
    const { jar, round } = dinoJar();
    const t = { ...addToken({ jar, tokenTypeId: 'raptor', reasonId: jar.reasons[0]!.id, note: 'great job' }), addedUtc: '2026-01-01T10:00:00.000Z' };
    const removed = { ...removeToken(t, 'consequence', 'Shouted'), removal: { kind: 'consequence' as const, reasonText: 'Shouted', removedUtc: '2026-01-01T11:00:00.000Z' } };

    const log = history(jar, [removed], [round]);
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ kind: 'removed', reasonLabel: 'Shouted', removalKind: 'consequence' });
    expect(log[1]).toMatchObject({ kind: 'added', tokenLabel: 'Raptor', reasonLabel: 'Tidied room', note: 'great job' });
  });

  it('sorts newest first and excludes other jars', () => {
    const { jar, round } = dinoJar();
    const mine = { ...addToken({ jar, tokenTypeId: 'trex' }), addedUtc: '2026-01-02T00:00:00.000Z' };
    const older = { ...addToken({ jar, tokenTypeId: 'stego' }), addedUtc: '2026-01-01T00:00:00.000Z' };
    const theirs = { ...addToken({ jar, tokenTypeId: 'bone' }), jarId: 'someone-else' };

    const log = history(jar, [older, mine, theirs], [round]);
    expect(log.map((e) => e.tokenLabel)).toEqual(['T-Rex', 'Stegosaurus']);
  });
});
