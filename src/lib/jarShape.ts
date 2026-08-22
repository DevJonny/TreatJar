/**
 * The jar's silhouette, as pure geometry.
 *
 * One module owns the shape because two things need it and they must agree:
 * `JarCanvas` draws the glass from these paths, and the physics world is given
 * `cavity` as its bounds. A jar drawn with a neck but simulated as a full-height
 * box would pile tokens up where the glass isn't.
 *
 * Everything is in CSS pixels, in the coordinate space of the jar itself:
 * (0,0) is the top-left of the whole jar, lid included. `cavity` is the only
 * part tokens ever occupy — the neck and shoulders are glass and air, drawn
 * above the pile — and the canvas covers the whole jar so that a token dropping
 * in is clipped by the glass rather than sliced off at the cavity's edge.
 *
 * The height passed in is not the space available: `fitCavity` in physics.ts
 * decides how tall this jar should be for its target, and a jar with a small
 * target is genuinely a smaller jar.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface JarShape {
  width: number;
  height: number;
  /** Where tokens live. The physics world's origin is this rect's top-left. */
  cavity: Rect;
  /** Outer edge of the glass, from the neck down and round the base. */
  glass: string;
  /** Inner face of the glass — the void the tokens are actually in. */
  inside: string;
  /** The lid, drawn as a band across the top of the neck. */
  lid: Rect;
  /** The skirt below the lid, where a screw thread would be. */
  collar: Rect;
  /** The neck opening, in whole-jar coordinates. */
  mouth: { centre: number; width: number };
  /** Thickness of the glass wall, for strokes and highlights. */
  wall: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Proportions of a sweet jar, as fractions of the jar's box. They are not
 * arbitrary: the neck must stay wider than the widest token can be
 * (`JarWorld` caps a token at a third of the cavity) or a drop would look like
 * it was passing through solid glass.
 */
const LID_H = 0.062;
const NECK_H = 0.045;
const SHOULDER_H = 0.085;
const NECK_W = 0.66;
const WALL = 0.028;
const BASE_R = 0.16;
const LID_OVERHANG = 0.035;

export function jarShape(width: number, height: number): JarShape {
  const wall = clamp(width * WALL, 4, 14);
  const lidH = clamp(height * LID_H, 10, 34);
  const neckH = height * NECK_H;
  const shoulderH = height * SHOULDER_H;
  const neckW = width * NECK_W;
  const baseR = width * BASE_R;

  const neckLeft = (width - neckW) / 2;
  const neckRight = width - neckLeft;
  const shoulderTop = lidH + neckH;
  const shoulderBottom = shoulderTop + shoulderH;

  /**
   * The glass outline, inset by `d` — 0 traces the outside, `wall` the inside.
   * The shoulder is an ogee: it leaves the neck vertical, flares out, and
   * arrives at the body vertical again, which is what stops a drawn jar looking
   * like a funnel with a pipe stuck in it.
   */
  const outline = (d: number): string => {
    const l = d;
    const r = width - d;
    const b = height - d;
    const nl = neckLeft + d;
    const nr = neckRight - d;
    const st = shoulderTop;
    const sb = shoulderBottom;
    const run = (sb - st) * 0.55;
    const br = Math.max(0, baseR - d);
    return [
      `M${nl} ${lidH}`,
      `L${nl} ${st}`,
      `C${nl} ${st + run} ${l} ${sb - run} ${l} ${sb}`,
      `L${l} ${b - br}`,
      `Q${l} ${b} ${l + br} ${b}`,
      `L${r - br} ${b}`,
      `Q${r} ${b} ${r} ${b - br}`,
      `L${r} ${sb}`,
      `C${r} ${sb - run} ${nr} ${st + run} ${nr} ${st}`,
      `L${nr} ${lidH}`,
      'Z',
    ].join(' ');
  };

  const lidOverhang = width * LID_OVERHANG;

  return {
    width,
    height,
    // Tokens are kept out of the shoulders entirely: the pile is a straight
    // sided box, and the curved part of the jar is glass and air. Piling into a
    // curve needs walls that follow it, and a token resting on the *outside* of
    // a shoulder is invisible — the count would be right and the pile short.
    cavity: {
      x: wall,
      y: shoulderBottom,
      width: width - wall * 2,
      height: height - shoulderBottom - wall,
    },
    glass: outline(0),
    inside: outline(wall),
    lid: {
      x: neckLeft - lidOverhang,
      y: 0,
      width: neckW + lidOverhang * 2,
      height: lidH,
    },
    collar: {
      x: neckLeft - lidOverhang * 0.35,
      y: lidH,
      width: neckW + lidOverhang * 0.7,
      height: Math.max(3, neckH * 0.42),
    },
    mouth: { centre: width / 2, width: neckW - wall * 2 },
    wall,
  };
}

/**
 * The jar height whose cavity is `cavityHeight` — the inverse of `jarShape`.
 *
 * Solved by iteration rather than algebra because the lid is clamped in real
 * pixels at the extremes, which makes the relationship very nearly, but not
 * exactly, a straight line.
 */
export function jarHeightForCavity(width: number, cavityHeight: number): number {
  let height = cavityHeight / 0.8;
  for (let i = 0; i < 5; i++) {
    height += cavityHeight - jarShape(width, height).cavity.height;
  }
  return height;
}
