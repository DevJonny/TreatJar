import { describe, expect, it } from 'vitest';
import {
  addToken, clearTokensForThemeChange, closeRound, convertTokens, createJar, defaultTokenMapping,
  formatProgress, formatTarget, history, isComplete, projectedProgress,
  lastAddedToken, liveTokens, progress, progressFraction, projectedTokenCount, pruneRounds,
  removeToken, restoreToken, retargetForTheme, validateTarget, visibleTokens, TOKEN_COUNT_MAX,
} from '../src/lib/jar.ts';
import { theme, tokenType } from '../src/lib/themes.ts';
import { THEME_IDS, type Round, type Token } from '../src/lib/types.ts';

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

describe('tokens orphaned by a theme change', () => {
  // A jar re-themed after tokens were added keeps every token exactly as it was
  // minted, so its `tokenTypeId` no longer names anything. The point of these
  // tests is that every consumer agrees such a token is not in the jar — the
  // divergence they guard against was invisible on screen and audible only to
  // a screen reader.
  const reThemed = () => {
    const { jar } = dinoJar();
    const tokens = addMany(jar, ['trex', 'stego', 'raptor']);
    return { jar: { ...jar, themeId: 'money' as const, target: 100 }, tokens };
  };

  it('leaves them live, because they were genuinely added', () => {
    const { jar, tokens } = reThemed();
    expect(liveTokens(tokens, jar.currentRoundId)).toHaveLength(3);
  });

  it('excludes them from the tokens the jar shows', () => {
    const { jar, tokens } = reThemed();
    expect(visibleTokens(jar, tokens)).toHaveLength(0);
  });

  it('agrees with progress, which is what stops the UI contradicting itself', () => {
    const { jar, tokens } = reThemed();
    expect(progress(jar, tokens)).toBe(0);
    expect(visibleTokens(jar, tokens)).toHaveLength(0);
  });

  it('gives undo nothing to act on rather than a token nobody can see', () => {
    const { jar, tokens } = reThemed();
    expect(lastAddedToken(jar, tokens)).toBeNull();
  });

  it('keeps them in the history under their real names', () => {
    const { jar, tokens } = reThemed();
    const round: Round = { id: jar.currentRoundId, jarId: jar.id, index: 1,
      startedUtc: '2026-01-01T00:00:00.000Z', completedUtc: null, lastModified: '2026-01-01T00:00:00.000Z' };
    const log = history(jar, tokens, [round]);

    // The adds genuinely happened, so they stay — and they are labelled from
    // the theme that minted them, not left as the raw id the money jar cannot
    // resolve. A child reading her own history should not see "trex".
    expect(log).toHaveLength(3);
    expect(log.map((e) => e.tokenLabel)).not.toContain('trex');
    expect(log.map((e) => e.tokenLabel)).toContain(theme('dinosaurs').tokens[0]!.label);
  });

  it('shows only the resolvable ones when a jar holds both', () => {
    const { jar } = moneyJar();
    const orphan = { ...addToken({ jar, tokenTypeId: 'trex' }), addedUtc: '2026-01-01T12:00:00.000Z' };
    const real = { ...addToken({ jar, tokenTypeId: 'coin-50' }), addedUtc: '2026-01-01T10:00:00.000Z' };
    const tokens = [orphan, real];

    expect(visibleTokens(jar, tokens)).toEqual([real]);
    expect(progress(jar, tokens)).toBe(50);
    // The orphan is the newer of the two; undo must still reach past it.
    expect(lastAddedToken(jar, tokens)?.tokenTypeId).toBe('coin-50');
  });
});

describe('changing a jar\'s theme with treats still in it', () => {
  // The grown-up supplies the exchange rate; nothing here derives one. These
  // tests exist mostly to pin the two properties that make the choice safe to
  // sync: one token in, one token out, and never a mint.
  const seeded = () => {
    const { jar, round } = dinoJar();
    const tokens = addMany(jar, ['trex', 'stego', 'raptor', 'bone']);
    return { jar, round, tokens };
  };

  describe('the default mapping', () => {
    it('offers the new theme\'s cheapest token for everything', () => {
      const mapping = defaultTokenMapping('dinosaurs', 'money');
      const cheapest = theme('money').tokens.reduce((low, t) => (t.value < low.value ? t : low));
      for (const t of theme('dinosaurs').tokens) expect(mapping[t.id]).toBe(cheapest.id);
    });

    it('converts the contents on the same rule retargetForTheme uses', () => {
      // The invariant is *treats added*, not the fraction on the bar, and the
      // two are only the same thing in a count theme. retargetForTheme prices
      // the new target at `adds x smallest`; defaulting every token to
      // `smallest` prices the contents the same way, so the jar goes on
      // reading "n treats towards N". A rank-for-rank default has no such
      // property and fills the jar on save.
      for (const from of THEME_IDS) {
        for (const to of THEME_IDS) {
          if (from === to) continue;
          const { jar } = createJar({ name: 'E', themeId: from, target: theme(from).progress.targetPresets[1]!, reasons: [] });
          const tokens = addMany(jar, theme(from).tokens.map((t) => t.id));
          const target = retargetForTheme(from, to, jar.target);

          const after = projectedProgress(jar, tokens, to, defaultTokenMapping(from, to)) / target;
          const adds = tokens.length / projectedTokenCount(from, jar.target);
          expect(after).toBeCloseTo(adds, 10);
        }
      }
    });

    it('keeps a count jar reading precisely what it read before', () => {
      // The everyday case — a dinosaur jar a child is halfway through — where
      // preserving the adds also preserves the bar exactly. Eight of twenty
      // treats becomes GBP 4.00 of GBP 10.00, and nothing appears to change.
      const { jar } = createJar({ name: 'Ellie', themeId: 'dinosaurs', target: 20, reasons: [] });
      const tokens = addMany(jar, ['trex', 'stego', 'raptor', 'bone', 'trex', 'stego', 'raptor', 'bone']);
      const target = retargetForTheme('dinosaurs', 'money', jar.target);
      const projected = projectedProgress(jar, tokens, 'money', defaultTokenMapping('dinosaurs', 'money'));

      expect(progress(jar, tokens)).toBe(8);
      expect(jar.target).toBe(20);
      expect(projected).toBe(400);
      expect(target).toBe(1000);
      expect(projected / target).toBeCloseTo(8 / 20, 10);
    });

    it('cannot preserve the bar out of a value theme, and does not pretend to', () => {
      // Four coins are 85% of a GBP 10.00 jar but only four things. Converting
      // to dinosaurs, four things is what there is: 4 of 20. This is a real
      // limitation of one-token-in-one-token-out, which is why the form shows
      // the projected reading rather than quietly applying it.
      const { jar } = createJar({ name: 'Sam', themeId: 'money', target: 1000, reasons: [] });
      const tokens = addMany(jar, ['coin-50', 'coin-100', 'coin-200', 'note-500']);
      expect(progress(jar, tokens)).toBe(850);

      const projected = projectedProgress(jar, tokens, 'dinosaurs', defaultTokenMapping('money', 'dinosaurs'));
      expect(projected).toBe(4);
      expect(retargetForTheme('money', 'dinosaurs', 1000)).toBe(20);
    });

    it('covers every token type the old theme can mint', () => {
      for (const from of THEME_IDS) {
        for (const to of THEME_IDS) {
          const mapping = defaultTokenMapping(from, to);
          for (const t of theme(from).tokens) {
            // An unmapped type would convert to nothing and silently orphan
            // the token — the exact bug this whole feature exists to end.
            expect(tokenType(to, mapping[t.id]!)).not.toBeNull();
          }
        }
      }
    });
  });

  describe('converting', () => {
    it('keeps one token for each token, never minting or dropping', () => {
      const { jar, tokens } = seeded();
      const after = convertTokens(jar, tokens, defaultTokenMapping('dinosaurs', 'money'));
      expect(after).toHaveLength(tokens.length);
      expect(after.map((t) => t.id)).toEqual(tokens.map((t) => t.id));
    });

    it('leaves every token resolvable in the new theme', () => {
      const { jar, tokens } = seeded();
      const mapping = defaultTokenMapping('dinosaurs', 'money');
      const moneyJar = { ...jar, themeId: 'money' as const, target: 1000 };
      const after = convertTokens(jar, tokens, mapping);
      for (const t of after) expect(tokenType('money', t.tokenTypeId)).not.toBeNull();
      expect(liveTokens(after, moneyJar.currentRoundId)).toHaveLength(4);
    });

    it('preserves the seed, so the pile does not reshuffle itself', () => {
      const { jar, tokens } = seeded();
      const after = convertTokens(jar, tokens, defaultTokenMapping('dinosaurs', 'space'));
      expect(after.map((t) => t.seed)).toEqual(tokens.map((t) => t.seed));
    });

    it('honours a hand-picked rate rather than any rate of its own', () => {
      const { jar, tokens } = seeded();
      // Every dinosaur is worth 50p in this house.
      const mapping = Object.fromEntries(theme('dinosaurs').tokens.map((t) => [t.id, 'coin-50']));
      const after = convertTokens(jar, tokens, mapping);
      expect(after.every((t) => t.tokenTypeId === 'coin-50')).toBe(true);
      expect(progress({ ...jar, themeId: 'money', target: 1000 }, after)).toBe(200);
    });

    it('marks converted tokens as edited so the change merges', () => {
      const { jar, tokens } = seeded();
      const at = '2026-06-01T12:00:00.000Z';
      const after = convertTokens(jar, tokens, defaultTokenMapping('dinosaurs', 'money'), at);
      for (const t of after) expect(t.lastModified).toBe(at);
    });

    it('leaves earlier rounds alone, because they are history', () => {
      const { jar, round, tokens } = seeded();
      const { jar: next } = closeRound(jar, round);
      const after = convertTokens(next, tokens, defaultTokenMapping('dinosaurs', 'money'));
      // The old round's tokens still say what was actually in the jar then.
      expect(after.map((t) => t.tokenTypeId)).toEqual(tokens.map((t) => t.tokenTypeId));
    });

    it('does not touch a token that is already removed', () => {
      const { jar, tokens } = seeded();
      const withRemoval = [removeToken(tokens[0]!, 'consequence', 'Shouted'), ...tokens.slice(1)];
      const after = convertTokens(jar, withRemoval, defaultTokenMapping('dinosaurs', 'money'));
      expect(after[0]!.tokenTypeId).toBe('trex');
      expect(after[0]!.removal).toMatchObject({ kind: 'consequence' });
    });
  });

  describe('resetting instead', () => {
    it('empties the jar without deleting a thing', () => {
      const { jar, tokens } = seeded();
      const after = clearTokensForThemeChange(jar, tokens);
      expect(after).toHaveLength(4);
      expect(liveTokens(after, jar.currentRoundId)).toHaveLength(0);
      expect(progress(jar, after)).toBe(0);
    });

    it('says the theme changed, not that the child did something wrong', () => {
      const { jar, round, tokens } = seeded();
      const after = clearTokensForThemeChange(jar, tokens, 'Changed to Money');
      for (const t of after) expect(t.removal?.kind).toBe('themeChange');

      const log = history(jar, after, [round]);
      const removals = log.filter((e) => e.kind === 'removed');
      expect(removals).toHaveLength(4);
      // Not 'consequence' — that renders as "taken away".
      for (const e of removals) expect(e.removalKind).toBe('themeChange');
    });

    it('keeps the adds in the history, because they happened', () => {
      const { jar, round, tokens } = seeded();
      const after = clearTokensForThemeChange(jar, tokens);
      expect(history(jar, after, [round]).filter((e) => e.kind === 'added')).toHaveLength(4);
    });
  });

  describe('the preview the form shows before saving', () => {
    it('reports what progress will read after converting', () => {
      const { jar, tokens } = seeded();
      const mapping = Object.fromEntries(theme('dinosaurs').tokens.map((t) => [t.id, 'coin-50']));
      expect(projectedProgress(jar, tokens, 'money', mapping)).toBe(200);
    });

    it('agrees with what progress actually reads afterwards', () => {
      const { jar, tokens } = seeded();
      const mapping = defaultTokenMapping('dinosaurs', 'money');
      const predicted = projectedProgress(jar, tokens, 'money', mapping);
      const moneyJar = { ...jar, themeId: 'money' as const, target: 1000 };
      expect(progress(moneyJar, convertTokens(jar, tokens, mapping))).toBe(predicted);
    });

    it('can exceed the target, which is exactly why it is shown', () => {
      const { jar, tokens } = seeded();
      const mapping = Object.fromEntries(theme('dinosaurs').tokens.map((t) => [t.id, 'note-500']));
      const projected = projectedProgress(jar, tokens, 'money', mapping);
      expect(projected).toBe(2000);
      expect(isComplete({ ...jar, themeId: 'money', target: 100 }, convertTokens(jar, tokens, mapping))).toBe(true);
    });
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
