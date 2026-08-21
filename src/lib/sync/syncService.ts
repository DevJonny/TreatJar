/**
 * Sync orchestration. Ported from DiceCalc; the merge and the envelope are new.
 *
 * The shape that matters: local state is merged with remote, BOTH sides are
 * told what changed, and the upload only happens when the remote is genuinely
 * stale. A blind upload would turn every device that opened the app into a
 * writer and make ETag conflicts the normal case rather than the rare one.
 */

import { googleAuth } from './googleAuth.ts';
import { DriveHttpError, downloadSyncFile, findSyncFile, uploadSyncFile, type DriveFileRef } from './googleDrive.ts';
import { mergeById } from './mergeEngine.ts';
import type { Jar, Round, SyncEnvelope, SyncStatus, Token } from '../types.ts';

export interface LocalState {
  jars: Jar[];
  rounds: Round[];
  tokens: Token[];
}

export interface SyncListeners {
  onStatusChange: (status: SyncStatus, error: string | null) => void;
  onMerged: (state: LocalState) => void;
  getState: () => LocalState;
}

const DEBOUNCE_MS = 2000;
const MAX_RETRIES = 3;

export class SyncService {
  private status: SyncStatus = 'not-signed-in';
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;

  constructor(private listeners: SyncListeners) {}

  async initialize(): Promise<void> {
    if (!googleAuth.isConfigured()) {
      this.setStatus('not-signed-in');
      return;
    }
    if (!googleAuth.hasPreviousSession()) {
      this.setStatus('not-signed-in');
      return;
    }
    try {
      const token = await googleAuth.trySilentSignIn();
      if (token) {
        this.setStatus('idle');
        await this.syncNow();
        return;
      }
    } catch {
      /* fall through — a manual sync will prompt */
    }
    this.setStatus('idle');
  }

  async signIn(): Promise<boolean> {
    try {
      const token = await googleAuth.signIn();
      if (!token) return false;
      this.setStatus('idle');
      await this.syncNow();
      return true;
    } catch (err) {
      this.error = (err as Error).message;
      this.setStatus('error');
      return false;
    }
  }

  signOut(): void {
    googleAuth.signOut();
    this.error = null;
    this.setStatus('not-signed-in');
  }

  /** Coalesce a burst of edits into one upload. */
  scheduleSync(): void {
    if (this.status === 'not-signed-in') return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.syncNow();
    }, DEBOUNCE_MS);
  }

  async syncNow(): Promise<void> {
    if (this.inFlight) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!googleAuth.isSignedIn()) {
      if (!googleAuth.hasPreviousSession()) {
        this.setStatus('not-signed-in');
        return;
      }
      const token = await googleAuth.signIn().catch(() => null);
      if (!token) {
        this.setStatus('not-signed-in');
        return;
      }
    }

    this.inFlight = true;
    this.error = null;
    this.setStatus('syncing');
    try {
      await this.runWithRetry();
      this.setStatus('synced');
    } catch (err) {
      if (err instanceof DriveHttpError && err.status === 401) {
        this.setStatus('not-signed-in');
      } else if (err instanceof TypeError) {
        // fetch() rejects with TypeError when the network is simply gone.
        // That is a normal offline moment, not something to shout about.
        this.setStatus('idle');
      } else {
        this.error = (err as Error).message;
        this.setStatus('error');
      }
    } finally {
      this.inFlight = false;
    }
  }

  private async runWithRetry(): Promise<void> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await this.performSync();
        return;
      } catch (err) {
        const last = attempt === MAX_RETRIES - 1;
        if (err instanceof DriveHttpError && err.status === 412 && !last) continue;
        if (err instanceof DriveHttpError && err.status === 401 && !last) {
          const token = await googleAuth.signIn().catch(() => null);
          if (!token) throw err;
          continue;
        }
        throw err;
      }
    }
  }

  private async performSync(): Promise<void> {
    const local = this.listeners.getState();
    const existing: DriveFileRef | null = await findSyncFile();
    const remote: SyncEnvelope | null = existing ? await downloadSyncFile(existing.id) : null;

    const jars = mergeById(local.jars, remote?.jars ?? []);
    const rounds = mergeById(local.rounds, remote?.rounds ?? []);
    const tokens = mergeById(local.tokens, remote?.tokens ?? []);

    if (jars.localChanged || rounds.localChanged || tokens.localChanged) {
      this.listeners.onMerged({ jars: jars.merged, rounds: rounds.merged, tokens: tokens.merged });
    }

    if (jars.remoteChanged || rounds.remoteChanged || tokens.remoteChanged || !existing) {
      await uploadSyncFile(
        {
          version: 1,
          lastSyncedUtc: new Date().toISOString(),
          jars: jars.merged,
          rounds: rounds.merged,
          tokens: tokens.merged,
        },
        existing,
      );
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status;
    this.listeners.onStatusChange(status, this.error);
  }

  getStatus(): SyncStatus {
    return this.status;
  }
}
