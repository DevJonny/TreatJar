/**
 * Themes are data, not code. Adding a fifth theme means adding an entry here
 * and nothing else.
 *
 * Two rules that will bite you:
 *
 * 1. `progress.format` is the ONLY place a value is turned into text. A second
 *    `£${n / 100}` somewhere else is how a rounding bug reaches a child's
 *    progress bar. Money is integer pence everywhere else, without exception.
 *
 * 2. A token's `value` is what lets a count jar and a money jar share one
 *    progress calculation. Count themes MUST give every token `value: 1`, or
 *    "14 / 20 tokens" quietly starts counting something else.
 *
 * Token silhouettes are bold on purpose: they render at roughly 40px inside a
 * tumbling pile, where fine detail is invisible and only the outline reads.
 */

import type { ThemeDef, ThemeId, TokenTypeDef } from './types.ts';

const countFormat = (n: number): string => `${n} ${n === 1 ? 'token' : 'tokens'}`;
const gbpFormat = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

/** Vertices are approximate — physics.ts runs Matter.Vertices.hull over them. */
const box = (x1: number, y1: number, x2: number, y2: number) => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

const polygon = (sides: number, r: number, rotationDeg: number): { x: number; y: number }[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = ((rotationDeg + (360 / sides) * i) * Math.PI) / 180;
    return { x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) };
  });

const DINO_TOKENS: readonly [TokenTypeDef, TokenTypeDef, TokenTypeDef, TokenTypeDef] = [
  {
    id: 'trex',
    label: 'T-Rex',
    value: 1,
    // Upright, deep-chested, jaws open, tail counterbalancing behind. The head
    // is deliberately oversized: at 40px it is the only part that says "T-Rex"
    // rather than "some animal".
    path:
      'M3 64 Q20 59 32 49 C38 31 50 21 61 22 L65 11 Q69 4 79 6 L95 13 Q100 16 96 21 ' +
      'L76 22 L94 28 Q98 31 93 34 L74 33 Q65 34 63 42 Q61 50 55 53 L66 57 L61 61 L52 57 ' +
      'Q48 60 46 63 C55 69 57 79 51 84 L49 89 L67 89 L67 95 L44 95 L42 87 ' +
      'C36 81 31 73 30 64 L24 62 C25 71 23 79 21 86 L31 86 L31 92 L11 92 ' +
      'C14 81 16 72 16 62 Q10 64 3 64 Z',
    vertices: [
      { x: 3, y: 64 }, { x: 72, y: 7 }, { x: 79, y: 6 }, { x: 95, y: 13 },
      { x: 98, y: 17 }, { x: 96, y: 31 }, { x: 67, y: 95 }, { x: 44, y: 95 },
      { x: 11, y: 92 },
    ],
    fill: '#2f7d4f',
    scale: 1.15,
  },
  {
    id: 'stego',
    label: 'Stegosaurus',
    value: 1,
    // Three big back plates and a two-spike thagomizer. Fewer, larger plates
    // survive the shrink; five small ones turn into a fuzzy edge.
    path:
      'M4 40 L16 53 L22 50 L30 26 L40 46 L45 43 L54 20 L64 43 L68 44 L75 30 L82 47 ' +
      'Q88 48 93 52 Q100 55 97 63 L87 66 Q80 68 75 64 L74 84 L88 84 L87 63 ' +
      'Q68 70 54 70 L44 70 L42 86 L27 86 L26 66 L19 62 L2 66 L13 56 Z',
    vertices: [
      { x: 2, y: 66 }, { x: 4, y: 40 }, { x: 30, y: 26 }, { x: 54, y: 20 },
      { x: 75, y: 30 }, { x: 96, y: 54 }, { x: 97, y: 63 }, { x: 88, y: 84 },
      { x: 27, y: 86 },
    ],
    fill: '#2a6f8f',
    scale: 1.0,
  },
  {
    id: 'raptor',
    label: 'Raptor',
    value: 1,
    // Horizontal spine, long straight tail, small low head — the whole point is
    // that it must not read as a smaller T-Rex when both are in the same pile.
    path:
      'M3 25 Q19 32 33 40 C41 33 51 31 60 34 Q66 26 74 21 Q84 16 92 21 L99 26 Q100 30 95 30 ' +
      'L83 29 L93 33 Q95 36 90 36 L80 34 Q72 35 70 41 Q68 47 62 50 L72 56 L67 59 L58 53 ' +
      'Q52 56 45 55 C52 60 52 69 45 74 L40 85 L58 85 L58 91 L35 91 L33 82 ' +
      'C30 74 29 65 30 56 L22 54 C23 63 21 73 19 82 L29 82 L29 88 L11 88 ' +
      'C14 77 16 67 16 54 Q9 41 3 25 Z',
    vertices: [
      { x: 3, y: 25 }, { x: 85, y: 18 }, { x: 99, y: 26 }, { x: 99, y: 29 },
      { x: 58, y: 91 }, { x: 35, y: 91 }, { x: 11, y: 88 },
    ],
    fill: '#c2701d',
    scale: 0.85,
  },
  {
    id: 'bone',
    label: 'Fossil bone',
    value: 1,
    path: 'M30 34 A13 13 0 0 0 30 66 A13 13 0 0 0 43 57 L57 57 A13 13 0 0 0 70 66 A13 13 0 0 0 70 34 A13 13 0 0 0 57 43 L43 43 A13 13 0 0 0 30 34 Z',
    vertices: [
      { x: 17, y: 42 }, { x: 30, y: 28 }, { x: 70, y: 28 }, { x: 83, y: 42 },
      { x: 83, y: 58 }, { x: 70, y: 72 }, { x: 30, y: 72 }, { x: 17, y: 58 },
    ],
    fill: '#ddd2b4',
    scale: 0.72,
  },
] as const;

const MONEY_TOKENS: readonly [TokenTypeDef, TokenTypeDef, TokenTypeDef, TokenTypeDef] = [
  {
    id: 'coin-50',
    label: '50p',
    value: 50,
    // A real 50p is a seven-sided curve of constant width; a heptagon reads the same at 40px.
    path: 'M50 16 L76.6 28.8 L83.2 57.6 L64.8 80.6 L35.2 80.6 L16.9 57.6 L23.4 28.8 Z',
    vertices: polygon(7, 34, -90),
    fill: '#b9bcc4',
    scale: 0.72,
  },
  {
    id: 'coin-100',
    label: '£1',
    value: 100,
    path: 'M18 50 A32 32 0 1 0 82 50 A32 32 0 1 0 18 50 Z',
    vertices: polygon(12, 32, 0),
    fill: '#d6a534',
    scale: 0.82,
  },
  {
    id: 'coin-200',
    label: '£2',
    value: 200,
    path: 'M16 50 A34 34 0 1 0 84 50 A34 34 0 1 0 16 50 Z',
    vertices: polygon(12, 34, 0),
    fill: '#9c8a5f',
    scale: 0.95,
  },
  {
    id: 'note-500',
    label: '£5',
    value: 500,
    path: 'M12 30 h76 a5 5 0 0 1 5 5 v30 a5 5 0 0 1 -5 5 h-76 a5 5 0 0 1 -5 -5 v-30 a5 5 0 0 1 5 -5 z',
    vertices: box(7, 30, 93, 70),
    fill: '#5c9e7a',
    scale: 1.1,
  },
] as const;

const SPACE_TOKENS: readonly [TokenTypeDef, TokenTypeDef, TokenTypeDef, TokenTypeDef] = [
  {
    id: 'star',
    label: 'Star',
    value: 1,
    path: 'M50 10 L59.99 36.25 L88.04 37.64 L66.17 55.25 L73.51 82.36 L50 67 L26.49 82.36 L33.83 55.25 L11.96 37.64 L40.01 36.25 Z',
    // The hull is the star's five outer points: a pentagon. Physics wants a
    // shape that slides off a pile, not one whose spikes catch on everything.
    vertices: [
      { x: 50, y: 10 }, { x: 88, y: 37.6 }, { x: 73.5, y: 82.4 },
      { x: 26.5, y: 82.4 }, { x: 12, y: 37.6 },
    ],
    fill: '#e0a92b',
    scale: 0.9,
  },
  {
    id: 'planet',
    label: 'Planet',
    value: 1,
    path: 'M20 50 A30 30 0 1 0 80 50 A30 30 0 1 0 20 50 Z M8 50 a42 12 0 1 0 84 0 a42 12 0 1 0 -84 0 Z',
    vertices: [
      { x: 50, y: 20 }, { x: 72, y: 32 }, { x: 92, y: 48 }, { x: 92, y: 52 },
      { x: 72, y: 68 }, { x: 50, y: 80 }, { x: 28, y: 68 }, { x: 8, y: 52 },
      { x: 8, y: 48 }, { x: 28, y: 32 },
    ],
    fill: '#4a3aa7',
    scale: 1.15,
  },
  {
    id: 'rocket',
    label: 'Rocket',
    value: 1,
    path: 'M50 8 Q66 26 66 48 L66 66 L78 82 L62 78 L60 88 L40 88 L38 78 L22 82 L34 66 L34 48 Q34 26 50 8 Z',
    vertices: [
      { x: 50, y: 6 }, { x: 66, y: 30 }, { x: 78, y: 84 }, { x: 62, y: 90 },
      { x: 38, y: 90 }, { x: 22, y: 84 }, { x: 34, y: 30 },
    ],
    fill: '#c0453f',
    scale: 1.0,
  },
  {
    id: 'moonrock',
    label: 'Moon rock',
    value: 1,
    path: 'M22 42 L38 24 L62 22 L80 38 L84 60 L68 78 L42 80 L24 66 Z',
    vertices: [
      { x: 22, y: 42 }, { x: 38, y: 24 }, { x: 62, y: 22 }, { x: 80, y: 38 },
      { x: 84, y: 60 }, { x: 68, y: 78 }, { x: 42, y: 80 }, { x: 24, y: 66 },
    ],
    fill: '#77809b',
    scale: 0.75,
  },
] as const;

const SWEET_TOKENS: readonly [TokenTypeDef, TokenTypeDef, TokenTypeDef, TokenTypeDef] = [
  {
    id: 'gummy',
    label: 'Gummy bear',
    value: 1,
    path: 'M36 30 A14 14 0 1 0 64 30 A14 14 0 1 0 36 30 Z M22 22 A8 8 0 1 0 38 22 A8 8 0 1 0 22 22 Z M62 22 A8 8 0 1 0 78 22 A8 8 0 1 0 62 22 Z M34 46 Q50 38 66 46 Q74 62 68 78 Q60 88 50 88 Q40 88 32 78 Q26 62 34 46 Z',
    vertices: [
      { x: 22, y: 14 }, { x: 50, y: 10 }, { x: 78, y: 14 }, { x: 74, y: 50 },
      { x: 70, y: 84 }, { x: 50, y: 90 }, { x: 30, y: 84 }, { x: 26, y: 50 },
    ],
    fill: '#3f8f5e',
    scale: 1.0,
  },
  {
    id: 'lolly',
    label: 'Lollipop',
    value: 1,
    path: 'M24 34 A24 24 0 1 0 72 34 A24 24 0 1 0 24 34 Z M45 56 h10 v34 h-10 Z',
    vertices: [
      { x: 26, y: 16 }, { x: 50, y: 8 }, { x: 74, y: 30 }, { x: 70, y: 54 },
      { x: 56, y: 90 }, { x: 44, y: 90 }, { x: 30, y: 54 }, { x: 26, y: 34 },
    ],
    fill: '#c8437c',
    scale: 1.1,
  },
  {
    id: 'jellybean',
    label: 'Jellybean',
    value: 1,
    path: 'M30 34 Q50 20 70 34 Q84 48 74 62 Q58 78 38 70 Q20 60 22 48 Q24 40 30 34 Z',
    vertices: [
      { x: 30, y: 28 }, { x: 52, y: 20 }, { x: 74, y: 32 }, { x: 80, y: 52 },
      { x: 64, y: 74 }, { x: 40, y: 76 }, { x: 20, y: 60 }, { x: 20, y: 42 },
    ],
    fill: '#d1772a',
    scale: 0.8,
  },
  {
    id: 'chocolate',
    label: 'Chocolate',
    value: 1,
    path: 'M22 26 h56 a6 6 0 0 1 6 6 v40 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6 v-40 a6 6 0 0 1 6 -6 z',
    vertices: box(16, 26, 84, 78),
    fill: '#6d4527',
    scale: 0.9,
  },
] as const;

export const THEMES: Record<ThemeId, ThemeDef> = {
  dinosaurs: {
    id: 'dinosaurs',
    label: 'Dinosaurs',
    tokens: DINO_TOKENS,
    palette: {
      background: '#e7efe4',
      accent: '#2f7d4f',
      ink: '#16301f',
      jarTint: 'rgba(203, 226, 208, 0.45)',
    },
    progress: { mode: 'count', format: countFormat, targetPresets: [10, 15, 20, 30] },
  },
  money: {
    id: 'money',
    label: 'Money',
    tokens: MONEY_TOKENS,
    palette: {
      background: '#efeadd',
      accent: '#8a6d1f',
      ink: '#2e2712',
      jarTint: 'rgba(229, 220, 194, 0.45)',
    },
    // The smallest denomination is 50p on purpose: coppers would put 1000
    // bodies in the jar for a £10 target. See projectedTokenCount in jar.ts.
    progress: { mode: 'value', format: gbpFormat, targetPresets: [500, 1000, 1500, 2000] },
  },
  space: {
    id: 'space',
    label: 'Space',
    tokens: SPACE_TOKENS,
    palette: {
      background: '#e6e7f2',
      accent: '#4a3aa7',
      ink: '#1b1836',
      jarTint: 'rgba(206, 208, 235, 0.45)',
    },
    progress: { mode: 'count', format: countFormat, targetPresets: [10, 15, 20, 30] },
  },
  sweets: {
    id: 'sweets',
    label: 'Sweets',
    tokens: SWEET_TOKENS,
    palette: {
      background: '#f7e8ef',
      accent: '#b4407a',
      ink: '#3a1428',
      jarTint: 'rgba(243, 213, 227, 0.45)',
    },
    progress: { mode: 'count', format: countFormat, targetPresets: [10, 15, 20, 30] },
  },
};

export const theme = (id: ThemeId): ThemeDef => THEMES[id];

export function tokenType(themeId: ThemeId, tokenTypeId: string): TokenTypeDef | null {
  return THEMES[themeId].tokens.find((t) => t.id === tokenTypeId) ?? null;
}

/** Index within the theme's token tuple — the compact form used by share links. */
export function tokenTypeIndex(themeId: ThemeId, tokenTypeId: string): number {
  return THEMES[themeId].tokens.findIndex((t) => t.id === tokenTypeId);
}
