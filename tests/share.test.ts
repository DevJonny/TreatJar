import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare, sharedPile, sharedProgress, MAX_SHARED_TOKENS } from '../src/lib/share.ts';
import { addToken, createJar, removeToken } from '../src/lib/jar.ts';
import type { ThemeId } from '../src/lib/types.ts';

const jarWith = (themeId: ThemeId, target: number, types: string[]) => {
  const { jar } = createJar({ name: 'Ellie', themeId, target, reasons: [] });
  return { jar, tokens: types.map((tokenTypeId) => addToken({ jar, tokenTypeId })) };
};

describe('round trip', () => {
  it('preserves what a viewer sees', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'bone', 'raptor']);
    const decoded = decodeShare(encodeShare(jar, tokens));
    expect(decoded).toMatchObject({ name: 'Ellie', themeId: 'dinosaurs', target: 20 });
    expect(decoded!.tokenTypes).toHaveLength(3);
  });

  it('carries money jars with their denominations intact', () => {
    const { jar, tokens } = jarWith('money', 1000, ['coin-200', 'coin-200', 'coin-50']);
    const decoded = decodeShare(encodeShare(jar, tokens))!;
    expect(decoded.themeId).toBe('money');
    expect(sharedProgress(decoded)).toBe(450);
  });

  it('survives a non-ASCII name', () => {
    const { jar, tokens } = jarWith('dinosaurs', 10, ['trex']);
    const named = { ...jar, name: 'Zoë 🦕' };
    expect(decodeShare(encodeShare(named, tokens))!.name).toBe('Zoë 🦕');
  });

  it('excludes removed tokens — a shared jar shows what is in it now', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'stego', 'raptor']);
    const withRemoval = [removeToken(tokens[0]!, 'consequence', 'private reason'), tokens[1]!, tokens[2]!];
    const encoded = encodeShare(jar, withRemoval);
    expect(decodeShare(encoded)!.tokenTypes).toHaveLength(2);
    // The removal reason must not travel with the link.
    expect(encoded).not.toContain('private');
  });

  it('stays short enough to paste anywhere', () => {
    const { jar, tokens } = jarWith('dinosaurs', 30, Array(30).fill('trex'));
    expect(encodeShare(jar, tokens).length).toBeLessThan(400);
  });

  it('produces a URL-safe payload', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'bone']);
    expect(encodeShare(jar, tokens)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('a jar holding tokens orphaned by an old theme change', () => {
  it('does not let them eat the link\'s token budget', () => {
    // An orphan encodes as -1 and is filtered out, so taking them first would
    // spend the cap on tokens the link cannot carry and arrive looking emptier
    // than the jar it was shared from.
    const { jar } = createJar({ name: 'Ellie', themeId: 'money', target: 1000, reasons: [] });
    const orphans = Array.from({ length: MAX_SHARED_TOKENS }, () =>
      addToken({ jar, tokenTypeId: 'trex' }));
    const real = [addToken({ jar, tokenTypeId: 'coin-50' })];

    const decoded = decodeShare(encodeShare(jar, [...orphans, ...real]))!;
    expect(decoded).not.toBeNull();
    expect(sharedPile(decoded)).toHaveLength(1);
    expect(sharedProgress(decoded)).toBe(50);
  });
});

describe('hostile and broken payloads return null, never throw', () => {
  const bad = [
    '', 'not-base64!!', 'YWJj', b64('{}'), b64('null'), b64('[]'), b64('"hi"'),
    b64(JSON.stringify({ v: 2, n: 'x', g: 0, t: 5, k: [], s: 1, d: 1 })),
    b64(JSON.stringify({ v: 1, n: 'x', g: 99, t: 5, k: [], s: 1, d: 1 })),
    b64(JSON.stringify({ v: 1, n: 'x', g: 0, t: 0, k: [], s: 1, d: 1 })),
    b64(JSON.stringify({ v: 1, n: 'x', g: 0, t: 5, k: [9], s: 1, d: 1 })),
    b64(JSON.stringify({ v: 1, n: 'x', g: 0, t: 5, k: ['a'], s: 1, d: 1 })),
    b64(JSON.stringify({ v: 1, n: 42, g: 0, t: 5, k: [], s: 1, d: 1 })),
  ];

  it.each(bad)('rejects %s', (payload) => {
    expect(decodeShare(payload)).toBeNull();
  });

  it('refuses a link that would flood the physics world', () => {
    const huge = b64(JSON.stringify({ v: 1, n: 'x', g: 0, t: 5, k: Array(MAX_SHARED_TOKENS + 1).fill(0), s: 1, d: 1 }));
    expect(decodeShare(huge)).toBeNull();
  });

  it('truncating a valid payload never throws', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'bone', 'raptor']);
    const full = encodeShare(jar, tokens);
    for (let i = 0; i < full.length; i++) {
      expect(() => decodeShare(full.slice(0, i))).not.toThrow();
    }
  });
});

describe('rebuilding the pile', () => {
  it('gives every token a distinct seed from the one the link carries', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'stego', 'raptor', 'bone']);
    const pile = sharedPile(decodeShare(encodeShare(jar, tokens))!);
    expect(pile.map((p) => p.tokenTypeId)).toEqual(['trex', 'stego', 'raptor', 'bone']);
    expect(new Set(pile.map((p) => p.seed)).size).toBe(4);
    expect(new Set(pile.map((p) => p.id)).size).toBe(4);
  });

  it('is deterministic — the same link always draws the same pile', () => {
    const { jar, tokens } = jarWith('dinosaurs', 20, ['trex', 'bone']);
    const link = encodeShare(jar, tokens);
    expect(sharedPile(decodeShare(link)!)).toEqual(sharedPile(decodeShare(link)!));
  });
});

function b64(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
