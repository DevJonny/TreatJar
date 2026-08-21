/**
 * Drive appDataFolder access. Ported from DiceCalc with the file name changed.
 *
 * appDataFolder is a per-user, per-app hidden folder: the user cannot see the
 * file in their Drive and no other app can read it. That is also why it cannot
 * back a share link — see lib/share.ts.
 */

import { googleAuth } from './googleAuth.ts';
import type { SyncEnvelope } from '../types.ts';

const FILE_NAME = 'treatjar-sync.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveHttpError';
  }
}

export interface DriveFileRef {
  id: string;
  etag: string | null;
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let token = googleAuth.getAccessToken();
  if (!token) {
    token = await googleAuth.signIn();
    if (!token) throw new DriveHttpError(401, 'Not signed in');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const resp = await fetch(url, { ...init, headers });
  if (resp.status === 401) googleAuth.invalidateToken();
  // 412 and 304 are control flow, not failures: the caller retries on them.
  if (!resp.ok && resp.status !== 412 && resp.status !== 304) {
    throw new DriveHttpError(resp.status, `${resp.status} ${resp.statusText}`);
  }
  return resp;
}

export async function findSyncFile(): Promise<DriveFileRef | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`);
  const resp = await authedFetch(`${API}/files?spaces=appDataFolder&q=${q}&fields=files(id)`);
  const data = (await resp.json()) as { files?: { id: string }[] };
  const first = data.files?.[0];
  if (!first) return null;
  // Drive does not support HEAD here, so the ETag comes from a metadata GET.
  const meta = await authedFetch(`${API}/files/${first.id}?spaces=appDataFolder&fields=id`);
  return { id: first.id, etag: meta.headers.get('ETag') };
}

export async function downloadSyncFile(fileId: string): Promise<SyncEnvelope> {
  const resp = await authedFetch(`${API}/files/${fileId}?alt=media`);
  return (await resp.json()) as SyncEnvelope;
}

export async function uploadSyncFile(
  envelope: SyncEnvelope,
  existing: DriveFileRef | null,
): Promise<DriveFileRef> {
  const body = JSON.stringify(envelope);
  return existing ? updateFile(existing.id, existing.etag, body) : createFile(body);
}

async function createFile(body: string): Promise<DriveFileRef> {
  const boundary = `b${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  const resp = await authedFetch(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: multipart,
  });
  const data = (await resp.json()) as { id: string };
  return { id: data.id, etag: resp.headers.get('ETag') };
}

async function updateFile(id: string, etag: string | null, body: string): Promise<DriveFileRef> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Optimistic concurrency: if the file moved under us, 412 and let the caller
  // re-merge rather than overwriting the other device's work.
  if (etag) headers['If-Match'] = etag;
  const resp = await authedFetch(`${UPLOAD}/files/${id}?uploadType=media&fields=id`, {
    method: 'PATCH',
    headers,
    body,
  });
  if (resp.status === 412) throw new DriveHttpError(412, 'Precondition failed (etag mismatch)');
  const data = (await resp.json()) as { id: string };
  return { id: data.id, etag: resp.headers.get('ETag') };
}
