import { describe, expect, it } from 'vitest';
import { THEMES, theme, tokenType, tokenTypeIndex } from '../src/lib/themes.ts';
import { THEME_IDS } from '../src/lib/types.ts';

describe('every theme is well formed', () => {
  it.each(THEME_IDS)('%s has four tokens with unique ids', (id) => {
    const t = theme(id);
    expect(t.tokens).toHaveLength(4);
    expect(new Set(t.tokens.map((k) => k.id)).size).toBe(4);
  });

  it.each(THEME_IDS)('%s gives every token a drawable path and a hull', (id) => {
    for (const k of theme(id).tokens) {
      expect(k.path.length).toBeGreaterThan(10);
      // Three points is the minimum that encloses an area; fewer makes a body
      // matter.js will silently collapse.
      expect(k.vertices.length).toBeGreaterThanOrEqual(3);
      expect(k.label.trim()).not.toBe('');
      expect(k.scale).toBeGreaterThan(0);
    }
  });

  it.each(THEME_IDS)('%s keeps every target preset within the physics budget', (id) => {
    const t = theme(id);
    const smallest = Math.min(...t.tokens.map((k) => k.value));
    for (const preset of t.progress.targetPresets) {
      expect(Math.ceil(preset / smallest)).toBeLessThanOrEqual(120);
    }
  });
});

describe('progress mode and token value must agree', () => {
  it('count themes give every token a value of exactly 1', () => {
    for (const id of THEME_IDS) {
      const t = theme(id);
      if (t.progress.mode !== 'count') continue;
      expect(t.tokens.map((k) => k.value)).toEqual([1, 1, 1, 1]);
    }
  });

  it('value themes use positive integer pence only', () => {
    for (const id of THEME_IDS) {
      const t = theme(id);
      if (t.progress.mode !== 'value') continue;
      for (const k of t.tokens) {
        expect(Number.isInteger(k.value)).toBe(true);
        expect(k.value).toBeGreaterThan(0);
      }
    }
  });

  it('formats money to two decimal places from integer pence', () => {
    const fmt = THEMES.money.progress.format;
    expect(fmt(650)).toBe('£6.50');
    expect(fmt(1000)).toBe('£10.00');
    expect(fmt(5)).toBe('£0.05');
    expect(fmt(0)).toBe('£0.00');
  });
});

describe('token lookup', () => {
  it('finds a token type and its compact index', () => {
    expect(tokenType('dinosaurs', 'trex')?.label).toBe('T-Rex');
    expect(tokenTypeIndex('dinosaurs', 'bone')).toBe(3);
  });

  it('returns null for an unknown type rather than throwing', () => {
    expect(tokenType('dinosaurs', 'nope')).toBeNull();
    expect(tokenTypeIndex('dinosaurs', 'nope')).toBe(-1);
  });
});
