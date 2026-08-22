/**
 * The pile itself is not unit tested — asserting settled coordinates would be
 * a change-detector test that breaks whenever matter.js retunes a constant.
 *
 * What IS worth pinning is the property the feature depends on: after the
 * headless settle, every token is inside the glass. A token that escapes is
 * invisible, and an invisible token is a reward the child was given and cannot
 * see.
 */
import { describe, expect, it } from 'vitest';
import { JarWorld, type PileToken } from '../src/lib/physics.ts';

const W = 320;
const H = 480;

const tokens = (n: number, typeIds: string[]): PileToken[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    tokenTypeId: typeIds[i % typeIds.length]!,
    seed: 1000 + i * 7919,
  }));

const build = (list: PileToken[], themeId: 'dinosaurs' | 'money' = 'dinosaurs') => {
  const world = new JarWorld({ width: W, height: H, themeId, capacity: Math.max(list.length, 10) });
  world.setTokens(list);
  world.settle();
  return world;
};

/**
 * "Inside the glass" means inside the VISIBLE box, not merely somewhere
 * finite. An earlier version of this test allowed y down to -H, which let a
 * genuine bug through: the anti-launch lid sat below the top of the spawn
 * scatter, so tokens landed on top of it and never entered the jar. The count
 * and the progress bar were both correct — only the pile was short — so
 * nothing but a bounds assertion would have caught it.
 */
const expectInsideGlass = (world: JarWorld) => {
  const settled = world.positions();
  expect(settled.length).toBeGreaterThan(0);
  for (const p of settled) {
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(W);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(H);
  }
};

describe('a settled pile stays in the jar', () => {
  it('keeps twenty dinosaurs inside the glass', () => {
    const world = build(tokens(20, ['trex', 'stego', 'raptor', 'bone']));
    expectInsideGlass(world);
    world.destroy();
  });

  it('keeps forty money tokens inside the glass', () => {
    const world = build(tokens(40, ['coin-50', 'coin-100', 'coin-200', 'note-500']), 'money');
    expectInsideGlass(world);
    world.destroy();
  });

  it.each([1, 4, 8, 20, 50])('keeps all %i tokens inside the glass', (n) => {
    // The lid bug only showed up at some counts, because token size is derived
    // from capacity — so sweep the range the UI can actually produce.
    const world = build(tokens(n, ['coin-50', 'note-500']), 'money');
    expect(world.positions()).toHaveLength(n);
    expectInsideGlass(world);
    world.destroy();
  });

  it('drops every token into the jar after a shake, not onto the lid', () => {
    const world = build(tokens(12, ['trex', 'bone']));
    world.shake();
    world.settle(500);
    expectInsideGlass(world);
    world.destroy();
  });

  it('settles to rest, so the render loop has something to stop on', () => {
    const world = build(tokens(12, ['trex', 'bone']));
    world.settle(400);
    expect(world.isAtRest()).toBe(true);
    world.destroy();
  });

  it('piles higher with more tokens than with fewer', () => {
    const few = build(tokens(4, ['trex']));
    const many = build(tokens(24, ['trex']));
    const top = (w: JarWorld) => Math.min(...w.positions().map((p) => p.y));
    expect(top(many)).toBeLessThan(top(few));
    few.destroy();
    many.destroy();
  });
});

describe('the world reconciles rather than rebuilding', () => {
  it('leaves existing tokens where they are when one is added', () => {
    const initial = tokens(8, ['trex', 'bone']);
    const world = build(initial);
    const before = new Map(world.positions().map((p) => [p.id, p]));

    world.setTokens([...initial, { id: 'new', tokenTypeId: 'stego', seed: 42 }], { animateNew: true });
    const after = new Map(world.positions().map((p) => [p.id, p]));

    expect(after.size).toBe(9);
    for (const [id, pos] of before) {
      // Untouched bodies are asleep, so their coordinates are identical, not merely close.
      expect(after.get(id)!.x).toBe(pos.x);
      expect(after.get(id)!.y).toBe(pos.y);
    }
    world.destroy();
  });

  it('drops a token that is no longer in the list', () => {
    const initial = tokens(5, ['trex']);
    const world = build(initial);
    world.setTokens(initial.slice(0, 3));
    expect(world.positions()).toHaveLength(3);
    world.destroy();
  });

  it('ignores a token whose type is not in the theme', () => {
    const world = build([{ id: 'x', tokenTypeId: 'pterodactyl', seed: 1 }]);
    expect(world.positions()).toHaveLength(0);
    world.destroy();
  });

  it('wakes everything on a shake', () => {
    const world = build(tokens(10, ['trex', 'bone']));
    world.settle(400);
    expect(world.isAtRest()).toBe(true);
    world.shake();
    expect(world.isAtRest()).toBe(false);
    world.destroy();
  });
});

/**
 * The drop is the moment the whole app exists for: a grown-up taps "add", and a
 * token falls into the jar. What makes it read as a drop rather than as a token
 * appearing from nowhere is WHERE it starts — over the mouth, above the glass —
 * so that is what is pinned here. Everything after release is gravity's job.
 */
describe('a token added by hand drops in through the mouth', () => {
  const seeds = [1, 7, 99, 12345, 987654321];

  it.each(seeds)('starts above the glass and over the middle of it (seed %i)', (seed) => {
    const initial = tokens(6, ['trex', 'stego']);
    const world = build(initial);

    world.setTokens([...initial, { id: 'drop', tokenTypeId: 'raptor', seed }], { animateNew: true });
    const dropped = world.positions().find((p) => p.id === 'drop')!;

    // Above the glass: the release itself is off-screen, so the token enters
    // view already falling instead of blinking into existence mid-jar.
    expect(dropped.y).toBeLessThan(0);
    // And over the mouth rather than anywhere along the rim.
    expect(Math.abs(dropped.x - W / 2)).toBeLessThanOrEqual(W * 0.2);
    world.destroy();
  });

  it('lands in the pile like any other token', () => {
    const initial = tokens(6, ['trex', 'stego']);
    const world = build(initial);
    world.setTokens([...initial, { id: 'drop', tokenTypeId: 'raptor', seed: 5150 }], { animateNew: true });
    world.settle(400);
    expectInsideGlass(world);
    expect(world.positions()).toHaveLength(7);
    world.destroy();
  });
});
