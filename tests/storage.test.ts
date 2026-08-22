import { describe, expect, it } from 'vitest';
import { revive } from '../src/lib/storage.ts';
import { parsePrefs, DEFAULT_PREFS } from '../src/lib/prefs.ts';
import { readRoute, routeToHash } from '../src/lib/hash.ts';

const { reviveJar, reviveRound, reviveToken } = revive;

describe('a corrupt field costs one field, not the record', () => {
  it('keeps a jar whose theme has been mangled', () => {
    const jar = reviveJar({ id: 'j1', name: 'Ellie', themeId: 'velociraptors', target: 20, createdUtc: '2026-01-01T00:00:00.000Z', currentRoundId: 'r1', lastModified: '2026-01-01T00:00:00.000Z' });
    expect(jar).toMatchObject({ id: 'j1', name: 'Ellie', themeId: 'dinosaurs', target: 20 });
  });

  it('falls back field by field on a nearly empty jar', () => {
    const jar = reviveJar({ id: 'j1' })!;
    expect(jar.name).toBe('Jar');
    expect(jar.target).toBe(20);
    expect(jar.reasons).toEqual([]);
    expect(Number.isNaN(Date.parse(jar.lastModified))).toBe(false);
  });

  it('drops only the malformed reasons', () => {
    const jar = reviveJar({ id: 'j1', reasons: [{ id: 'a', label: 'Tidied', tokenTypeId: 'trex' }, { label: 'no id' }, null, 'nope'] })!;
    expect(jar.reasons).toHaveLength(1);
    expect(jar.reasons[0]).toMatchObject({ id: 'a', tokenTypeId: 'trex' });
  });

  it('rejects a record with no id — there is nothing to merge it by', () => {
    expect(reviveJar({ name: 'x' })).toBeNull();
    expect(reviveToken({ jarId: 'j', roundId: 'r', tokenTypeId: 'trex' })).toBeNull();
    expect(reviveRound({ jarId: 'j' })).toBeNull();
    expect(reviveJar(null)).toBeNull();
    expect(reviveJar('a string')).toBeNull();
  });

  it('carries a converted token\'s original type through a reload', () => {
    const t = reviveToken({ id: 't1', jarId: 'j', roundId: 'r', tokenTypeId: 'coin-50', mintedAs: 'trex', seed: 5 })!;
    // Lose this and a converted jar's history silently restates itself in a
    // currency the child never earned, one reload later.
    expect(t.mintedAs).toBe('trex');
  });

  it('leaves the field off a token that was never converted', () => {
    const t = reviveToken({ id: 't1', jarId: 'j', roundId: 'r', tokenTypeId: 'trex', seed: 5 })!;
    expect('mintedAs' in t).toBe(false);
    // A junk value is dropped rather than carried, same as every other field.
    const junk = reviveToken({ id: 't2', jarId: 'j', roundId: 'r', tokenTypeId: 'trex', seed: 5, mintedAs: 42 })!;
    expect('mintedAs' in junk).toBe(false);
  });

  it('gives a seedless token a stable seed derived from its id', () => {
    const a = reviveToken({ id: 't1', jarId: 'j', roundId: 'r', tokenTypeId: 'trex' })!;
    const b = reviveToken({ id: 't1', jarId: 'j', roundId: 'r', tokenTypeId: 'trex' })!;
    const c = reviveToken({ id: 't2', jarId: 'j', roundId: 'r', tokenTypeId: 'trex' })!;
    // Stable across reads, distinct across tokens — otherwise every legacy
    // token would land in exactly the same spot in the jar.
    expect(a.seed).toBe(b.seed);
    expect(a.seed).not.toBe(c.seed);
    expect(Number.isFinite(a.seed)).toBe(true);
  });

  it('normalises a half-written removal', () => {
    const t = reviveToken({ id: 't1', jarId: 'j', roundId: 'r', tokenTypeId: 'trex', removal: { kind: 'nonsense' } })!;
    expect(t.removal).toMatchObject({ kind: 'undo', reasonText: null });
  });

  it('treats an invalid completedUtc as an open round', () => {
    expect(reviveRound({ id: 'r', jarId: 'j', completedUtc: 'yesterday' })!.completedUtc).toBeNull();
    expect(reviveRound({ id: 'r', jarId: 'j', completedUtc: '2026-01-01T00:00:00.000Z' })!.completedUtc).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('preferences', () => {
  it('falls back to system for anything unrecognised', () => {
    expect(parsePrefs({ theme: 'neon', motion: 'wild' })).toEqual(DEFAULT_PREFS);
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('nope')).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid choices', () => {
    expect(parsePrefs({ theme: 'dark', motion: 'reduced' })).toMatchObject({ theme: 'dark', motion: 'reduced' });
  });
});

describe('routing', () => {
  it('reads each route', () => {
    expect(readRoute('#/')).toEqual({ kind: 'list' });
    expect(readRoute('#/jar/abc123')).toEqual({ kind: 'jar', jarId: 'abc123' });
    expect(readRoute('#/s/eyJ2IjoxfQ')).toEqual({ kind: 'shared', payload: 'eyJ2IjoxfQ' });
  });

  it('lands on the list for anything mangled rather than a blank page', () => {
    for (const h of ['', '#', '#/nope', '#/jar/', '#/jar/a/b', '#/s/not valid!', '#//']) {
      expect(readRoute(h)).toEqual({ kind: 'list' });
    }
  });

  it('round-trips through routeToHash', () => {
    for (const r of [{ kind: 'list' } as const, { kind: 'jar', jarId: 'x1' } as const, { kind: 'shared', payload: 'abc' } as const]) {
      expect(readRoute(routeToHash(r))).toEqual(r);
    }
  });
});
