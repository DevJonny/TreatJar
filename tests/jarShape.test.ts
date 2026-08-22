/**
 * The shape exists so that the glass you see and the walls tokens hit are the
 * same jar. What is worth pinning is therefore not the curve — that is taste —
 * but the agreements the rest of the app depends on: the cavity is inside the
 * glass, and the mouth is wide enough to drop a token through.
 */
import { describe, expect, it } from 'vitest';
import { jarHeightForCavity, jarShape } from '../src/lib/jarShape.ts';

const boxes: [number, number][] = [
  [320, 480],
  [200, 320],
  [140, 500],
  [360, 300],
];

describe('the jar shape holds together at any size', () => {
  it.each(boxes)('keeps the cavity inside the glass at %ix%i', (w, h) => {
    const { cavity } = jarShape(w, h);
    expect(cavity.x).toBeGreaterThan(0);
    expect(cavity.y).toBeGreaterThan(0);
    expect(cavity.x + cavity.width).toBeLessThan(w);
    expect(cavity.y + cavity.height).toBeLessThan(h);
    expect(cavity.width).toBeGreaterThan(0);
    expect(cavity.height).toBeGreaterThan(0);
  });

  it.each(boxes)('leaves the neck below the cavity at %ix%i', (w, h) => {
    // The neck is drawn above the pile, never around it: tokens are kept to a
    // straight-sided box, because a token resting against a curve the walls do
    // not follow is a token drawn outside the glass.
    const { cavity, lid, collar } = jarShape(w, h);
    expect(lid.y + lid.height).toBeLessThanOrEqual(collar.y + 0.001);
    expect(collar.y + collar.height).toBeLessThan(cavity.y);
  });

  it.each(boxes)('keeps the mouth wider than the widest token at %ix%i', (w, h) => {
    // JarWorld will not draw a token wider than a third of the cavity, and a
    // hull may be scaled up to 1.2. A mouth narrower than that would show a
    // token passing straight through solid glass on its way in.
    const { cavity, mouth } = jarShape(w, h);
    expect(mouth.width).toBeGreaterThan((cavity.width / 2.25) * 1.2);
  });

  it('scales every part with the box', () => {
    const small = jarShape(200, 300);
    const big = jarShape(400, 600);
    expect(big.cavity.width / small.cavity.width).toBeCloseTo(2, 1);
    expect(big.cavity.height / small.cavity.height).toBeCloseTo(2, 1);
  });

  it('gives drawable paths', () => {
    const s = jarShape(300, 460);
    for (const d of [s.glass, s.inside]) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
      expect(d.length).toBeGreaterThan(60);
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it.each([120, 240, 400])('inverts cleanly, so a fitted cavity gets the jar it asked for (%ipx wide)', (w) => {
    for (const wanted of [80, 200, 460, 900]) {
      const height = jarHeightForCavity(w, wanted);
      // Well inside a pixel is the whole requirement — this feeds a CSS height.
      expect(jarShape(w, height).cavity.height).toBeCloseTo(wanted, 1);
    }
  });
});
