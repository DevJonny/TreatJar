/**
 * Google Identity Services token flow.
 *
 * Ported from DiceCalc's src/sync/googleAuth.ts, which came from TurdTracker
 * before that. Only the client id and the "not configured" guard are new.
 *
 * The client id is a public identifier, not a secret — it is safe in the repo,
 * and it is pinned to the origins listed in the Google Cloud console, which is
 * what actually restricts it.
 */

const CLIENT_ID = import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const PERSISTED_FLAG = 'treatjar.google-auth-connected';

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = {
  callback: (resp: TokenResponse) => void;
  error_callback?: (err: { message?: string }) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let pending: Promise<string | null> | null = null;
let scriptPromise: Promise<void> | null = null;
let initialized = false;

function loadGisScript(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (!CLIENT_ID) throw new Error('Google sync is not configured');
  await loadGisScript();
  if (!window.google?.accounts) throw new Error('GIS not available');
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {
      /* overridden per-request */
    },
  });
  initialized = true;
}

function requestToken(prompt: '' | 'consent' | undefined): Promise<string | null> {
  if (pending) return pending;
  pending = new Promise<string | null>((resolve, reject) => {
    if (!tokenClient) {
      pending = null;
      reject(new Error('Google Auth not initialized'));
      return;
    }
    tokenClient.callback = (resp) => {
      pending = null;
      if (resp.error) {
        // A silent attempt that fails is an expected outcome, not an error:
        // it just means the user has to click Connect.
        if (prompt === '') resolve(null);
        else reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token ?? null;
      if (accessToken) localStorage.setItem(PERSISTED_FLAG, 'true');
      resolve(accessToken);
    };
    tokenClient.error_callback = (err) => {
      pending = null;
      if (prompt === '') resolve(null);
      else reject(new Error(err?.message || 'Sign-in failed'));
    };
    tokenClient.requestAccessToken(prompt !== undefined ? { prompt } : undefined);
  });
  return pending;
}

export const googleAuth = {
  isConfigured: (): boolean => CLIENT_ID !== '',

  async signIn(): Promise<string | null> {
    await ensureInitialized();
    return requestToken(undefined);
  },

  async trySilentSignIn(): Promise<string | null> {
    await ensureInitialized();
    return requestToken('');
  },

  signOut(): void {
    if (accessToken && window.google?.accounts) {
      window.google.accounts.oauth2.revoke(accessToken);
    }
    accessToken = null;
    try {
      localStorage.removeItem(PERSISTED_FLAG);
    } catch {
      /* private mode */
    }
  },

  getAccessToken: (): string | null => accessToken,
  isSignedIn: (): boolean => accessToken !== null,

  hasPreviousSession(): boolean {
    try {
      return localStorage.getItem(PERSISTED_FLAG) === 'true';
    } catch {
      return false;
    }
  },

  /** Drop the in-memory token (e.g. on 401) without revoking it. */
  invalidateToken(): void {
    accessToken = null;
  },
};
