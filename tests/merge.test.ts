import { describe, expect, it } from 'vitest';
import { mergeById } from '../src/lib/sync/mergeEngine.ts';

const at = (iso: string) => ({ lastModified: iso });
const tok = (id: string, iso: string, extra: Record<string, unknown> = {}) => ({ id, ...at(iso), ...extra });

const ids = (r: { merged: { id: string }[] }) => r.merged.map((e) => e.id).sort();

describe('the failure DiceCalc would have had', () => {
  it('keeps BOTH tokens when two devices each add one', () => {
    // Mum's phone and Dad's phone, same evening, neither having seen the other.
    const mum = [tok('shared', '2026-01-01T10:00:00Z'), tok('mum-token', '2026-01-01T18:00:00Z')];
    const dad = [tok('shared', '2026-01-01T10:00:00Z'), tok('dad-token', '2026-01-01T18:05:00Z')];

    const result = mergeById(mum, dad);
    expect(ids(result)).toEqual(['dad-token', 'mum-token', 'shared']);
    expect(result.localChanged).toBe(true);
    expect(result.remoteChanged).toBe(true);
  });

  it('is order-independent — both devices reach the same answer', () => {
    const a = [tok('x', '2026-01-01T10:00:00Z'), tok('a-only', '2026-01-02T10:00:00Z')];
    const b = [tok('x', '2026-01-03T10:00:00Z'), tok('b-only', '2026-01-02T10:00:00Z')];
    expect(ids(mergeById(a, b))).toEqual(ids(mergeById(b, a)));
    expect(mergeById(a, b).merged.find((e) => e.id === 'x')!.lastModified)
      .toBe(mergeById(b, a).merged.find((e) => e.id === 'x')!.lastModified);
  });
});

describe('last write wins, but only within one entity', () => {
  it('lets a removal beat an earlier add of the same token', () => {
    const local = [tok('t1', '2026-01-01T10:00:00Z')];
    const remote = [tok('t1', '2026-01-01T11:00:00Z', { removal: { kind: 'undo', reasonText: null, removedUtc: '2026-01-01T11:00:00Z' } })];
    const winner = mergeById(local, remote).merged[0]!;
    expect(winner).toHaveProperty('removal');
    expect(mergeById(local, remote).localChanged).toBe(true);
  });

  it('lets a later restore beat an earlier removal', () => {
    const removed = tok('t1', '2026-01-01T10:00:00Z', { removal: { kind: 'undo', reasonText: null, removedUtc: '2026-01-01T10:00:00Z' } });
    const restored = tok('t1', '2026-01-01T12:00:00Z');
    expect(mergeById([removed], [restored]).merged[0]).not.toHaveProperty('removal');
  });

  it('reports no change when the two sides already agree', () => {
    const same = [tok('t1', '2026-01-01T10:00:00Z')];
    const r = mergeById(same, same);
    expect(r.localChanged).toBe(false);
    expect(r.remoteChanged).toBe(false);
  });

  it('flags the remote as stale when local holds something it lacks', () => {
    const r = mergeById([tok('a', '2026-01-01T10:00:00Z')], []);
    expect(r.remoteChanged).toBe(true);
    expect(r.localChanged).toBe(false);
  });
});

describe('tombstones', () => {
  it('keeps a recent tombstone so the delete propagates', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const recent = [tok('gone', '2026-05-25T00:00:00Z', { isDeleted: true })];
    expect(ids(mergeById(recent, [], now))).toEqual(['gone']);
  });

  it('collects one older than the retention window', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const ancient = [tok('gone', '2025-01-01T00:00:00Z', { isDeleted: true })];
    const r = mergeById(ancient, [], now);
    expect(r.merged).toHaveLength(0);
    expect(r.localChanged).toBe(true);
    expect(r.remoteChanged).toBe(true);
  });

  it('does not resurrect a deleted entity the other side still holds', () => {
    const now = Date.parse('2026-06-01T00:00:00Z');
    const deletedHere = [tok('t', '2026-05-30T00:00:00Z', { isDeleted: true })];
    const staleThere = [tok('t', '2026-05-01T00:00:00Z')];
    expect(mergeById(deletedHere, staleThere, now).merged[0]).toMatchObject({ isDeleted: true });
  });
});

describe('robustness', () => {
  it('treats an unparseable timestamp as oldest rather than throwing', () => {
    const good = [tok('t', '2026-01-01T10:00:00Z')];
    const corrupt = [tok('t', 'not-a-date')];
    expect(mergeById(good, corrupt).merged[0]!.lastModified).toBe('2026-01-01T10:00:00Z');
    expect(mergeById(corrupt, good).merged[0]!.lastModified).toBe('2026-01-01T10:00:00Z');
  });

  it('handles two empty sides', () => {
    expect(mergeById([], [])).toMatchObject({ merged: [], localChanged: false, remoteChanged: false });
  });
});
