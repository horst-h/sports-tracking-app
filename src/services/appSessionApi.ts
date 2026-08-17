import type { GoogleSession } from "../repositories/googleSessionRepository";

/**
 * The three calls that manage the app's own session.
 *
 * None of them passes the session around: it lives in an HttpOnly cookie that
 * the browser attaches to these same-origin requests on its own. What comes
 * back is only the profile, for the interface to render.
 */

const ENDPOINT = "/.netlify/functions/session";

type SessionResponse = { session?: GoogleSession };

/**
 * Why the session could not be confirmed.
 *
 * `unreachable` is an offline app behaving normally and must never cost anyone
 * their session. `server` is the opposite situation wearing the same clothes:
 * the server answered, and the answer was unusable — a missing SESSION_SECRET,
 * an undeployed function, a 5xx. Collapsing the two is how a deployment that
 * cannot authenticate anybody still renders as signed in, with every request
 * behind it failing quietly.
 */
export type UnavailableReason = "unreachable" | "server";

/** Distinguishes "the server said no" from "the server could not be reached". */
export class SessionUnavailable extends Error {
  readonly reason: UnavailableReason;

  constructor(message: string, reason: UnavailableReason) {
    super(message);
    this.name = "SessionUnavailable";
    this.reason = reason;
  }
}

async function readSession(res: Response): Promise<GoogleSession> {
  // An undeployed function falls through to the SPA catch-all, which answers
  // 200 with index.html. Without this check that surfaces as a JSON parse
  // error somewhere else entirely.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The session endpoint did not return JSON — is the function deployed?");
  }

  const body = (await res.json()) as SessionResponse;
  if (!body.session?.sub) throw new Error("The session endpoint returned no session");
  return body.session;
}

/**
 * Trades the Google ID token for a session cookie.
 *
 * The one moment the ID token is used at all, and it is not stored anywhere on
 * the way.
 */
export async function createSession(idToken: string): Promise<GoogleSession> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 401) throw new Error("This Google account is not allowed to sign in.");
    if (body.error === "session_not_configured") {
      throw new Error("The server has no SESSION_SECRET configured.");
    }
    throw new Error(`Could not start a session (HTTP ${res.status})`);
  }

  return readSession(res);
}

/**
 * Confirms the cookie is still good and lets the server slide it forward.
 *
 * Returns null when the server refuses the session. Throws SessionUnavailable
 * when it could not be asked at all — offline is not a sign-out, and treating
 * it as one would eject the athlete from an app that works offline by design.
 */
export async function refreshSession(): Promise<GoogleSession | null> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "GET", headers: { accept: "application/json" } });
  } catch (e) {
    // The only genuinely offline branch: the request never got an answer.
    throw new SessionUnavailable(e instanceof Error ? e.message : String(e), "unreachable");
  }

  if (res.status === 401) return null;
  if (!res.ok) throw new SessionUnavailable(`Session check failed (HTTP ${res.status})`, "server");

  try {
    return await readSession(res);
  } catch (e) {
    // The server answered; the answer was not one we can use. Being connected
    // and being able to authenticate are not the same thing.
    throw new SessionUnavailable(e instanceof Error ? e.message : String(e), "server");
  }
}

/** Clears the cookie server-side. Best effort: the local sign-out is the point. */
export async function endSession(): Promise<void> {
  try {
    await fetch(ENDPOINT, { method: "DELETE" });
  } catch {
    /* the cookie expires on its own; nothing here is worth blocking a sign-out */
  }
}
