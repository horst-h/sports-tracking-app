import { openSportsDB } from "./db";

const STORE = "auth";
const KEY = "googleSession";

/** Treat a token as spent slightly early, so it does not expire mid-request. */
const EXPIRY_SKEW_SECONDS = 60;

export type GoogleSession = {
  /** The ID token, sent as a bearer credential. The server verifies it. */
  idToken: string;
  /** Google's stable account id. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  /** Expiry as epoch seconds, taken from the token itself. */
  expiresAt: number;
};

type SessionDocV1 = {
  schemaVersion: 1;
  session: GoogleSession;
  updatedAt: string;
};

/**
 * Reads the claims out of an ID token without verifying it.
 *
 * For display and expiry only. Nothing here is trusted — the Netlify function
 * verifies the signature, the issuer, the audience and the allowlist on every
 * request, and that is the check that decides anything.
 */
export function readClaims(idToken: string): GoogleSession | null {
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as Record<string, unknown>;

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    if (!sub || !exp) return null;

    return {
      idToken,
      sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      expiresAt: exp,
    };
  } catch {
    return null;
  }
}

export function isExpired(session: GoogleSession, nowSeconds = Date.now() / 1000): boolean {
  return session.expiresAt - EXPIRY_SKEW_SECONDS <= nowSeconds;
}

export async function saveSession(session: GoogleSession): Promise<void> {
  const db = await openSportsDB();
  const doc: SessionDocV1 = {
    schemaVersion: 1,
    session,
    updatedAt: new Date().toISOString(),
  };
  await db.put(STORE, doc, KEY);
}

/** Returns null for a missing, malformed or expired session. */
export async function loadSession(): Promise<GoogleSession | null> {
  const db = await openSportsDB();
  const raw = (await db.get(STORE, KEY)) as SessionDocV1 | undefined;

  const session = raw?.schemaVersion === 1 ? raw.session : null;
  if (!session?.idToken) return null;

  if (isExpired(session)) {
    // Google ID tokens live an hour. An expired one is not an error worth
    // surfacing — it just means the athlete has to be signed in again.
    await clearSession();
    return null;
  }

  return session;
}

export async function clearSession(): Promise<void> {
  const db = await openSportsDB();
  await db.delete(STORE, KEY);
}

/**
 * The Authorization header for a call to our own functions, or null when there
 * is no usable session. Callers must treat null as "do not send the request".
 */
export async function authHeader(): Promise<{ Authorization: string } | null> {
  const session = await loadSession();
  return session ? { Authorization: `Bearer ${session.idToken}` } : null;
}
