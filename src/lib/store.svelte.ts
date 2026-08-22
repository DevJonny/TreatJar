/**
 * The single source of truth for jars, rounds and tokens.
 *
 * Two rules carried over from the author's other Svelte project, both learned
 * the hard way:
 *
 * - **Persist at the call site, never from an effect.** Svelte wraps $state in
 *   proxies, so an effect cannot tell a user edit from a restore and will
 *   happily write defaults over saved data on mount.
 *
 * - **This is the only copy of the data.** Anything that needs a derived view
 *   computes it with $derived; a second stored copy only has to go un-synced
 *   once before a later unrelated write spreads the stale version back.
 */

import {
  loadActiveJarId, loadJars, loadRounds, loadTokens,
  saveActiveJarId, saveJars, saveRounds, saveTokens,
} from './storage.ts';
import { loadPrefs, prefersReducedMotion, savePrefs, type Preferences } from './prefs.ts';
import {
  addToken, clearTokensForThemeChange, closeRound, convertTokens, createJar, lastAddedToken,
  nowIso, pruneRounds, removeToken, type NewJarInput, type TokenMapping,
} from './jar.ts';
import { SyncService, type LocalState } from './sync/syncService.ts';
import { googleAuth } from './sync/googleAuth.ts';
import type { Jar, Round, SyncStatus, Token } from './types.ts';

class Store {
  jars = $state<Jar[]>([]);
  rounds = $state<Round[]>([]);
  tokens = $state<Token[]>([]);
  activeJarId = $state<string | null>(null);
  prefs = $state<Preferences>(loadPrefs());
  syncStatus = $state<SyncStatus>('not-signed-in');
  syncError = $state<string | null>(null);
  /** Set when a jar has just hit its target and is waiting to be cashed in. */
  celebrating = $state<string | null>(null);

  private sync: SyncService;

  constructor() {
    this.jars = loadJars();
    this.rounds = loadRounds();
    this.tokens = loadTokens();
    this.activeJarId = loadActiveJarId();

    this.sync = new SyncService({
      getState: (): LocalState => ({
        jars: [...this.jars],
        rounds: [...this.rounds],
        tokens: [...this.tokens],
      }),
      onMerged: (state) => {
        this.jars = state.jars;
        this.rounds = state.rounds;
        this.tokens = state.tokens;
        this.persistAll();
      },
      onStatusChange: (status, error) => {
        this.syncStatus = status;
        this.syncError = error;
      },
    });
  }

  get reducedMotion(): boolean {
    return prefersReducedMotion(this.prefs.motion);
  }

  get syncConfigured(): boolean {
    return googleAuth.isConfigured();
  }

  get liveJars(): Jar[] {
    return this.jars.filter((j) => !j.isDeleted);
  }

  jar(id: string | null): Jar | null {
    return id === null ? null : (this.jars.find((j) => j.id === id && !j.isDeleted) ?? null);
  }

  roundFor(jar: Jar): Round | null {
    return this.rounds.find((r) => r.id === jar.currentRoundId) ?? null;
  }

  tokensFor(jar: Jar): Token[] {
    return this.tokens.filter((t) => t.jarId === jar.id);
  }

  // --- persistence -------------------------------------------------------

  private persistAll(): void {
    saveJars(this.jars);
    saveRounds(this.rounds);
    saveTokens(this.tokens);
  }

  private touched(): void {
    this.persistAll();
    this.sync.scheduleSync();
  }

  // --- mutations ---------------------------------------------------------

  createJar(input: NewJarInput): Jar {
    const { jar, round } = createJar(input);
    this.jars = [...this.jars, jar];
    this.rounds = [...this.rounds, round];
    this.setActive(jar.id);
    this.touched();
    return jar;
  }

  updateJar(id: string, patch: Partial<Omit<Jar, 'id'>>): void {
    this.jars = this.jars.map((j) =>
      j.id === id ? { ...j, ...patch, lastModified: new Date().toISOString() } : j,
    );
    this.touched();
  }

  /**
   * Change a jar's theme and settle what happens to the treats already in it.
   *
   * This exists as one method rather than an `updateJar` followed by a token
   * pass because of the timestamp. Both halves are written with a single `at`,
   * so a device that syncs mid-change cannot land a jar in one theme holding
   * tokens converted for another: `mergeById` arbitrates each entity by
   * `lastModified`, and giving the jar and its tokens the same one means the
   * later device's change wins consistently across all of them.
   *
   * `disposition` is the grown-up's answer to what the jar's contents mean in
   * the new theme, and there is deliberately no default — see `TokenMapping`.
   */
  retheme(
    id: string,
    patch: Partial<Omit<Jar, 'id'>>,
    disposition: { kind: 'convert'; mapping: TokenMapping } | { kind: 'reset'; reasonText: string | null },
  ): void {
    const jar = this.jars.find((j) => j.id === id);
    if (!jar) return;
    const at = nowIso();

    this.tokens =
      disposition.kind === 'convert'
        ? convertTokens(jar, this.tokens, disposition.mapping, at)
        : clearTokensForThemeChange(jar, this.tokens, disposition.reasonText, at);

    this.jars = this.jars.map((j) => (j.id === id ? { ...j, ...patch, lastModified: at } : j));
    this.touched();
  }

  deleteJar(id: string): void {
    // Soft delete: a hard one would be resurrected by any device that has not
    // synced since, because it has no tombstone to learn from.
    this.jars = this.jars.map((j) =>
      j.id === id ? { ...j, isDeleted: true, lastModified: new Date().toISOString() } : j,
    );
    if (this.activeJarId === id) this.setActive(this.liveJars[0]?.id ?? null);
    this.touched();
  }

  addToken(jar: Jar, tokenTypeId: string, reasonId: string | null, note: string | null): void {
    this.tokens = [...this.tokens, addToken({ jar, tokenTypeId, reasonId, note })];
    this.touched();
  }

  removeToken(tokenId: string, kind: 'undo' | 'consequence', reasonText: string | null): void {
    this.tokens = this.tokens.map((t) => (t.id === tokenId ? removeToken(t, kind, reasonText) : t));
    this.touched();
  }

  undoLast(jar: Jar): boolean {
    const last = lastAddedToken(jar, this.tokensFor(jar));
    if (!last) return false;
    this.removeToken(last.id, 'undo', null);
    return true;
  }

  /** Cash in a completed jar: close the round, open the next, prune old history. */
  cashIn(jar: Jar): void {
    const current = this.roundFor(jar);
    if (!current) return;
    const { jar: nextJar, closed, opened } = closeRound(jar, current);

    const rounds = [...this.rounds.map((r) => (r.id === closed.id ? closed : r)), opened];
    const pruned = pruneRounds(rounds, this.tokens);

    this.jars = this.jars.map((j) => (j.id === jar.id ? nextJar : j));
    this.rounds = pruned.rounds;
    this.tokens = pruned.tokens;
    this.celebrating = null;
    this.touched();
  }

  setActive(id: string | null): void {
    this.activeJarId = id;
    saveActiveJarId(id);
  }

  setPrefs(patch: Partial<Preferences>): void {
    this.prefs = { ...this.prefs, ...patch };
    savePrefs(this.prefs);
  }

  // --- sync --------------------------------------------------------------

  initSync(): void {
    void this.sync.initialize();
  }
  connectDrive(): Promise<boolean> {
    return this.sync.signIn();
  }
  disconnectDrive(): void {
    this.sync.signOut();
  }
  syncNow(): Promise<void> {
    return this.sync.syncNow();
  }
}

export const store = new Store();
