/**
 * Last-write-wins merge, at the level of individual entities.
 *
 * DiceCalc — where the rest of this sync layer came from — merges whole
 * objects. That is safe there because a "scenario" is edited by one person on
 * one device at a time. It is NOT safe here.
 *
 * A treat jar is shared: Mum's phone and Dad's phone both add tokens, often on
 * the same evening. If a jar were merged as one object, the later write would
 * carry its whole token list over the earlier one and a token a child actually
 * earned would vanish. So tokens are merged individually, and because each add
 * mints a fresh id, concurrent adds are not a conflict at all — both survive.
 *
 * Last-write-wins therefore only ever arbitrates between two edits to the SAME
 * entity (add versus remove on one token), where picking the later one is
 * exactly right.
 */

import type { SyncMeta } from '../types.ts';

const TOMBSTONE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface MergeResult<T> {
  merged: T;
  /** The local copy is out of date and should adopt `merged`. */
  localChanged: boolean;
  /** The remote copy is out of date and should be uploaded. */
  remoteChanged: boolean;
}

type Entity = SyncMeta & { id: string };

const time = (e: Entity): number => {
  const t = Date.parse(e.lastModified);
  // An unparseable timestamp sorts oldest rather than throwing: a corrupt
  // record must never be able to win against a good one.
  return Number.isNaN(t) ? 0 : t;
};

export function mergeById<T extends Entity>(
  local: readonly T[],
  remote: readonly T[],
  now: number = Date.now(),
): MergeResult<T[]> {
  const localById = new Map(local.map((e) => [e.id, e]));
  const remoteById = new Map(remote.map((e) => [e.id, e]));

  let localChanged = false;
  let remoteChanged = false;
  const merged: T[] = [];

  for (const id of new Set([...localById.keys(), ...remoteById.keys()])) {
    const l = localById.get(id);
    const r = remoteById.get(id);

    if (l && r) {
      const lt = time(l);
      const rt = time(r);
      if (lt > rt) {
        merged.push(l);
        remoteChanged = true;
      } else if (rt > lt) {
        merged.push(r);
        localChanged = true;
      } else {
        merged.push(l);
      }
    } else if (l) {
      merged.push(l);
      remoteChanged = true;
    } else if (r) {
      merged.push(r);
      localChanged = true;
    }
  }

  // Tombstones are kept long enough that every device has certainly seen the
  // delete. Dropping one early lets a device that still holds the original
  // resurrect it on its next sync.
  const cutoff = now - TOMBSTONE_MAX_AGE_MS;
  const kept = merged.filter((e) => !(e.isDeleted === true && time(e) < cutoff));
  if (kept.length !== merged.length) {
    localChanged = true;
    remoteChanged = true;
  }

  return { merged: kept, localChanged, remoteChanged };
}
