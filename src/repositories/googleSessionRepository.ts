import { openSportsDB } from "./db";

const STORE = "auth";
const KEY = "googleSession";

/** Treat a session as spent slightly early, so it does not lapse mid-request. */
const EXPIRY_SKEW_SECONDS = 60;

/**
 * What the browser keeps about the signed-in athlete.
 *
 * Not the credential. The credential is an HttpOnly cookie the page cannot read
 * and never has to — it rides along with every same-origin request by itself.
 * What is stored here is the profile behind it: enough to render a signed-in
 * interface immediately on start, and offline, without waiting on the network.
 *
 * Which means this record is a hint, not an authority. The server verifies the
 * cookie on every request and is the only thing that decides anything; if the
 * two ever disagree, the answer is the 401, not what is written here.
 */
export type GoogleSession = {
  /** Google's stable account id. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  /** When the session cookie expires, epoch seconds, as reported by the server. */
  expiresAt: number;
};

type SessionDocV1 = {
  schemaVersion: 1;
  session: GoogleSession;
  updatedAt: string;
};

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

/**
 * Returns null for a missing, malformed or expired session.
 *
 * Sessions from before the cookie existed are discarded rather than migrated:
 * they held a Google ID token that has long since expired, and there is no
 * cookie to go with them.
 */
export async function loadSession(): Promise<GoogleSession | null> {
  const db = await openSportsDB();
  const raw = (await db.get(STORE, KEY)) as SessionDocV1 | undefined;

  const session = raw?.schemaVersion === 1 ? raw.session : null;
  if (!session?.sub || typeof session.expiresAt !== "number") return null;

  if (isExpired(session)) {
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
 * Whether a request to our own functions is worth sending.
 *
 * There is nothing to attach — the cookie does that — so this is only the gate:
 * with no session on record the request would come back 401, and callers use
 * this to not make it in the first place.
 */
export async function hasSession(): Promise<boolean> {
  return (await loadSession()) !== null;
}
