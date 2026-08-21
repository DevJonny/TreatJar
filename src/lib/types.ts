/**
 * The shared model.
 *
 * This module must stay free of runtime dependencies — it is imported by the
 * browser bundle for its const arrays, so anything it pulls in ships to the
 * user. In particular: never import zod here.
 */

/** Every synced entity carries these. Soft deletes, never hard ones. */
export interface SyncMeta {
  /** ISO-8601 UTC. The sole arbiter when two devices disagree. */
  lastModified: string;
  isDeleted?: boolean;
}

export const THEME_IDS = ['dinosaurs', 'money', 'space', 'sweets'] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * One kind of token within a theme.
 *
 * `value` is what makes a count jar and a money jar the same code path: count
 * themes give every token a value of 1, so summing values *is* counting
 * tokens. Money values are integer pence — see themes.ts.
 */
export interface TokenTypeDef {
  id: string;
  label: string;
  value: number;
  /** SVG path in a 100x100 box, drawn with Path2D onto the canvas. */
  path: string;
  /**
   * Convex hull for the matter.js body, in the same 100x100 space.
   * Hand-authored, not derived from `path`: matter.js needs convexity, and a
   * decomposed silhouette produces a body that snags on the jar walls.
   */
  vertices: Vec2[];
  fill: string;
  /** Relative size multiplier, roughly 0.6-1.2. */
  scale: number;
}

export type ProgressMode = 'count' | 'value';

export interface ThemePalette {
  background: string;
  accent: string;
  ink: string;
  jarTint: string;
}

export interface ThemeDef {
  id: ThemeId;
  label: string;
  /** Exactly four, enforced by the tuple type and asserted in tests. */
  tokens: readonly [TokenTypeDef, TokenTypeDef, TokenTypeDef, TokenTypeDef];
  palette: ThemePalette;
  progress: {
    mode: ProgressMode;
    /** 14 -> '14 tokens', 650 -> '£6.50'. The ONLY place money is formatted. */
    format: (total: number) => string;
    /** Offered as one-tap choices in the jar config form. */
    targetPresets: readonly number[];
  };
}

export interface Reason {
  id: string;
  label: string;
  tokenTypeId: string;
}

export interface Jar extends SyncMeta {
  id: string;
  name: string;
  themeId: ThemeId;
  /** Compared against the summed value of the round's tokens. */
  target: number;
  reasons: Reason[];
  createdUtc: string;
  currentRoundId: string;
}

export interface Round extends SyncMeta {
  id: string;
  jarId: string;
  /** 1-based, for "Round 3" in the history. */
  index: number;
  startedUtc: string;
  /** Set when the target was reached and the jar emptied. */
  completedUtc: string | null;
}

export type RemovalKind = 'undo' | 'consequence';

export interface TokenRemoval {
  kind: RemovalKind;
  reasonText: string | null;
  removedUtc: string;
}

export interface Token extends SyncMeta {
  id: string;
  jarId: string;
  roundId: string;
  tokenTypeId: string;
  /** null when the token was picked manually rather than via a reason. */
  reasonId: string | null;
  note: string | null;
  addedUtc: string;
  /** Drives the drop offset and spin, so a pile is reproducible across loads. */
  seed: number;
  /**
   * Present iff the token has been taken back out. The token is kept as a
   * tombstone rather than dropped so the history stays derivable from the
   * token list alone, and so the removal merges like any other edit.
   */
  removal?: TokenRemoval;
}

/** What is written to Drive. */
export interface SyncEnvelope {
  version: 1;
  lastSyncedUtc: string;
  jars: Jar[];
  rounds: Round[];
  tokens: Token[];
}

export type SyncStatus = 'not-signed-in' | 'idle' | 'syncing' | 'synced' | 'error';
