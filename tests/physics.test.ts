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
import { JarWorld, fitCavity, type PileToken } from '../src/lib/physics.ts';

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

/**
 * The point of the whole reward: a jar at its target must LOOK full. A child
 * who can see the pile is at the top does not have to read the progress bar,
 * and a ten-token jar that ends the round a third full reads as a let-down
 * however correct the arithmetic is.
 *
 * These are the two halves of that promise — it fills up, and it never spills.
 */
describe('a jar at its target looks full', () => {
  const fillFor = (capacity: number, themeId: 'dinosaurs' | 'money' = 'dinosaurs') => {
    const world = new JarWorld({ width: W, height: H, themeId, capacity });
    const types = themeId === 'money'
      ? ['coin-50', 'coin-100', 'coin-200', 'note-500']
      : ['trex', 'stego', 'raptor', 'bone'];
    world.setTokens(tokens(capacity, types));
    world.settle(500);
    const ys = world.positions().map((p) => p.y);
    const size = world.tokenPixels;
    world.destroy();
    return { top: 1 - Math.min(...ys) / H, spilled: ys.filter((y) => y < 0).length, size };
  };

  it.each([15, 20, 30, 40, 60, 120])('fills most of the glass at a target of %i', (capacity) => {
    const { top, spilled } = fillFor(capacity);
    expect(spilled).toBe(0);
    expect(top).toBeGreaterThan(0.65);
    // And has not overflowed: the last token still has somewhere to land.
    expect(top).toBeLessThan(1);
  });

  it('fills a money jar to the same sort of level', () => {
    const { top, spilled } = fillFor(30, 'money');
    expect(spilled).toBe(0);
    expect(top).toBeGreaterThan(0.65);
  });

  it('draws bigger tokens for a smaller target', () => {
    const small = fillFor(10).size;
    const medium = fillFor(30).size;
    const large = fillFor(120).size;
    expect(small).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(large);
  });

  it('leaves a jar short of its target visibly short', () => {
    const world = new JarWorld({ width: W, height: H, themeId: 'dinosaurs', capacity: 30 });
    world.setTokens(tokens(6, ['trex', 'stego', 'raptor', 'bone']));
    world.settle(400);
    const top = 1 - Math.min(...world.positions().map((p) => p.y)) / H;
    expect(top).toBeLessThan(0.5);
    world.destroy();
  });
});

describe('the pile is rebuilt when its scale changes', () => {
  it('redraws at a new size when the target changes', () => {
    const list = tokens(12, ['trex', 'bone']);
    const world = new JarWorld({ width: W, height: H, themeId: 'dinosaurs', capacity: 12 });
    world.setTokens(list);
    world.settle();
    const before = world.tokenPixels;

    world.setCapacity(90);
    world.settle();

    // Token size is derived from the target, so a pile left at the old scale
    // would be drawn wrong until the next reload.
    expect(world.tokenPixels).toBeLessThan(before);
    expect(world.positions()).toHaveLength(12);
    expectInsideGlass(world);
    world.destroy();
  });

  it('keeps every token when the jar is resized', () => {
    const list = tokens(10, ['stego']);
    const world = new JarWorld({ width: W, height: H, themeId: 'dinosaurs', capacity: 10 });
    world.setTokens(list);
    world.settle();

    world.resize(W * 1.6, H * 0.8);
    world.settle(400);

    expect(world.positions()).toHaveLength(10);
    for (const p of world.positions()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(W * 1.6);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(H * 0.8);
    }
    world.destroy();
  });
});

/**
 * The other half of "a jar at its target looks full": when tokens cannot get
 * big enough to fill a full-height jar, the jar gets shorter instead. Five
 * treats go in a small jar; a hundred go in a tall one.
 */
describe('the jar is fitted to its target', () => {
  const AVAILABLE_W = 250;
  const AVAILABLE_H = 420;

  const fit = (capacity: number, themeId: 'dinosaurs' | 'money' = 'dinosaurs') =>
    fitCavity(themeId, capacity, AVAILABLE_W, AVAILABLE_H);

  it('gives a small target a shorter jar and bigger tokens', () => {
    const small = fit(6);
    const big = fit(60);
    expect(small.height).toBeLessThan(big.height);
    expect(small.tokenSize).toBeGreaterThan(big.tokenSize);
  });

  it('never asks for more room than it was offered', () => {
    for (const capacity of [1, 5, 10, 20, 40, 80, 120]) {
      const { height, tokenSize } = fit(capacity);
      expect(height).toBeLessThanOrEqual(AVAILABLE_H);
      expect(height).toBeGreaterThan(0);
      expect(tokenSize).toBeGreaterThanOrEqual(14);
      // A jar must stay a jar, however few treats it is for.
      expect(height).toBeGreaterThan(tokenSize * 2);
    }
  });

  it('uses the whole height once the target is large enough to need it', () => {
    expect(fit(40).height).toBeCloseTo(AVAILABLE_H, 5);
    expect(fit(120).height).toBeCloseTo(AVAILABLE_H, 5);
  });

  it.each([10, 20, 40, 80])('fills the jar it fitted, at a target of %i', (capacity) => {
    // End to end: fit the glass to the target, fill it to the target, and the
    // pile should reach the top of that glass without spilling out of it.
    const { height } = fit(capacity);
    const world = new JarWorld({ width: AVAILABLE_W, height, themeId: 'dinosaurs', capacity });
    world.setTokens(tokens(capacity, ['trex', 'stego', 'raptor', 'bone']));
    world.settle(500);
    const ys = world.positions().map((p) => p.y);
    expect(ys.filter((y) => y < 0)).toHaveLength(0);
    expect(1 - Math.min(...ys) / height).toBeGreaterThan(0.65);
    world.destroy();
  });
});
