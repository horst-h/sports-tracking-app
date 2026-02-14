import { openSportsDB } from "./db.ts";

const STORE = "auth";
const KEY = "stravaToken";

export type StravaToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
  token_type?: string;
  scope?: string;
};

type TokenDocV1 = {
  schemaVersion: 1;
  token: StravaToken;
  updatedAt: string; // ISO
};

function nowIso() {
  return new Date().toISOString();
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function isEpochSeconds(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

function normalizeToken(raw: any): StravaToken | null {
  if (!raw || typeof raw !== "object") return null;

  const access_token = raw.access_token;
  const refresh_token = raw.refresh_token;
  const expires_at = raw.expires_at;

  if (!isNonEmptyString(access_token)) return null;
  if (!isNonEmptyString(refresh_token)) return null;
  if (!isEpochSeconds(expires_at)) return null;

  const token: StravaToken = {
    access_token,
    refresh_token,
    expires_at,
  };

  if (isNonEmptyString(raw.token_type)) token.token_type = raw.token_type;
  if (isNonEmptyString(raw.scope)) token.scope = raw.scope;

  return token;
}

function wrapDoc(token: StravaToken): TokenDocV1 {
  return {
    schemaVersion: 1,
    token,
    updatedAt: nowIso(),
  };
}

function unwrapDoc(raw: any): StravaToken | null {
  if (!raw) return null;

  // Backward compatibility: older versions might store token directly
  if (raw?.access_token && raw?.refresh_token && raw?.expires_at) {
    return normalizeToken(raw);
  }

  // Current format
  if (raw?.schemaVersion === 1 && raw?.token) {
    return normalizeToken(raw.token);
  }

  return null;
}

/**
 * Save token (overwrites existing).
 */
export async function saveToken(token: StravaToken): Promise<void> {
  const db = await openSportsDB();
  const normalized = normalizeToken(token);
  if (!normalized) throw new Error("Invalid token payload");
  await db.put(STORE, wrapDoc(normalized), KEY);
}

/**
 * Load token (null if missing/invalid).
 */
export async function loadToken(): Promise<StravaToken | null> {
  const db = await openSportsDB();
  const raw = await db.get(STORE, KEY);
  return unwrapDoc(raw);
}

/**
 * Clear token.
 */
export async function clearToken(): Promise<void> {
  const db = await openSportsDB();
  await db.delete(STORE, KEY);
}

/**
 * Returns true if token is missing or will expire soon.
 * `skewSeconds` is a safety margin to avoid using a token that expires mid-request.
 */
export function needsRefresh(token: StravaToken | null, skewSeconds = 60): boolean {
  if (!token) return true;
  const nowSec = Math.floor(Date.now() / 1000);
  return token.expires_at <= (nowSec + skewSeconds);
}

/**
 * Internal in-memory refresh lock: prevents multiple parallel refreshes.
 */
let refreshPromise: Promise<StravaToken | null> | null = null;

/**
 * Ensures you get a valid access token.
 * You provide the refresh function (from your auth service).
 *
 * Example usage:
 *   const access = await withValidAccessToken(async (rt) => refreshAccessToken(rt));
 */
export async function withValidAccessToken(
  refreshFn: (refreshToken: string) => Promise<StravaToken>,
  opts?: { skewSeconds?: number }
): Promise<string | null> {
  const skewSeconds = opts?.skewSeconds ?? 60;

  const current = await loadToken();
  if (current && !needsRefresh(current, skewSeconds)) {
    return current.access_token;
  }

  // Refresh path (locked)
  if (!current) return null;

  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const refreshed = await refreshFn(current.refresh_token);
        const normalized = normalizeToken(refreshed);
        if (!normalized) throw new Error("Refresh returned invalid token");
        await saveToken(normalized);
        return normalized;
      } catch (e) {
        // If refresh fails, keep behavior predictable:
        // clear token (forces re-login) OR keep it.
        // I recommend clearing to avoid repeated failing refresh loops.
        await clearToken();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }

  const refreshed = await refreshPromise;
  return refreshed?.access_token ?? null;
}
