import type { Handler } from "@netlify/functions";
import { isAllowed, verifyGoogleIdToken } from "./_lib/googleAuth";
import {
  clearedSessionCookie,
  headerOf,
  isSecureRequest,
  isSessionSigningConfigured,
  mintSessionToken,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookie,
  shouldRenew,
  verifySessionToken,
} from "./_lib/appSession";

/**
 * Where a Google sign-in becomes an app session.
 *
 * POST   trades a Google ID token for the session cookie. Once, at sign-in.
 * GET    reports who is signed in, and renews the cookie when it is over the
 *        hill. The app calls this on every start, which is what makes the
 *        ninety days a sliding window rather than a countdown.
 * DELETE signs out.
 *
 * The profile in the responses is for the interface only — a name to greet and
 * an avatar to show. Nothing is authorised on the strength of it; every other
 * function verifies the cookie itself.
 */

function json(
  statusCode: number,
  body: unknown,
  cookie?: string
): {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
} {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...(cookie ? { "set-cookie": cookie } : {}),
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  const secure = isSecureRequest(event.headers);

  try {
    if (event.httpMethod === "POST") {
      const body = event.body ? (JSON.parse(event.body) as { idToken?: unknown }) : {};
      const idToken = body.idToken;
      if (typeof idToken !== "string" || !idToken) {
        return json(400, { error: "missing_id_token" });
      }

      let identity;
      try {
        identity = await verifyGoogleIdToken(idToken);
      } catch (e) {
        console.error("[session] Could not reach Google to verify the token:", e);
        return json(503, { error: "verification_unavailable" });
      }
      if (!identity) return json(401, { error: "invalid_token" });

      const minted = mintSessionToken(identity);
      if (!minted) return json(503, { error: "session_not_configured" });

      return json(
        200,
        { session: { ...identity, expiresAt: minted.expiresAt } },
        sessionCookie(minted.token, SESSION_TTL_SECONDS, secure)
      );
    }

    if (event.httpMethod === "GET") {
      // Asked before the token is judged: with no secret every session looks
      // invalid, and answering 401 would sign the athlete out over a server
      // misconfiguration. 503 leaves the cookie alone and the client waiting.
      if (!isSessionSigningConfigured()) return json(503, { error: "session_not_configured" });

      const token = readCookie(headerOf(event.headers, "cookie"), SESSION_COOKIE);
      const claims = token ? verifySessionToken(token) : null;
      if (!claims) return json(401, { error: "no_session" }, clearedSessionCookie(secure));

      const identity = {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };

      // Checked again here, not only when the session was created: an account
      // taken off the allowlist must lose its session on the next app start.
      if (!isAllowed(identity)) {
        console.warn(`[session] ${identity.email} is no longer on the allowlist`);
        return json(401, { error: "no_session" }, clearedSessionCookie(secure));
      }

      if (!shouldRenew(claims)) {
        return json(200, { session: { ...identity, expiresAt: claims.exp } });
      }

      const renewed = mintSessionToken(identity);
      if (!renewed) {
        // Signing is broken but this session is still valid; report it as it
        // stands rather than throwing the athlete out over a config problem.
        return json(200, { session: { ...identity, expiresAt: claims.exp } });
      }

      return json(
        200,
        { session: { ...identity, expiresAt: renewed.expiresAt } },
        sessionCookie(renewed.token, SESSION_TTL_SECONDS, secure)
      );
    }

    if (event.httpMethod === "DELETE") {
      return json(200, { ok: true }, clearedSessionCookie(secure));
    }

    return json(405, { error: "method_not_allowed" });
  } catch (e) {
    console.error("[session] Unexpected error:", e);
    return json(500, { error: "unexpected_error" });
  }
};
