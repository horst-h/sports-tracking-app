import { isAllowed, verifyGoogleIdToken, type GoogleIdentity } from "./googleAuth";
import { headerOf, readCookie, SESSION_COOKIE, verifySessionToken } from "./appSession";

/**
 * The one gate in front of everything this app stores or proxies.
 *
 * Both the goals store and the Runalyze proxy hand out personal data, so both
 * ask the same question here rather than each inventing an answer.
 *
 * Two credentials answer it. The app's session cookie is the normal one and is
 * what every request carries after sign-in. A Google ID token in the
 * Authorization header still works, because that is what /session itself is
 * handed to create a session in the first place — and because a client holding
 * one is, by definition, freshly authenticated.
 */

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export type IdentityResult =
  | { ok: true; identity: GoogleIdentity; subject: string }
  | { ok: false; status: number; error: string };

/** The Google subject is the storage key: stable, and never reassigned. */
function accept(identity: GoogleIdentity): IdentityResult {
  return { ok: true, identity, subject: `google:${identity.sub}` };
}

export async function requireIdentity(
  headers: Record<string, string | undefined>
): Promise<IdentityResult> {
  const cookie = readCookie(headerOf(headers, "cookie"), SESSION_COOKIE);
  if (cookie) {
    const claims = verifySessionToken(cookie);
    // A cookie that no longer verifies is not fatal on its own — it may simply
    // have expired while a caller also holds a fresh ID token. Fall through.
    if (claims) {
      const identity: GoogleIdentity = {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };

      if (!isAllowed(identity)) {
        console.warn(`[identity] ${identity.email} is no longer on the allowlist`);
        return { ok: false, status: 401, error: "invalid_token" };
      }
      return accept(identity);
    }
  }

  const token = extractBearerToken(headerOf(headers, "authorization"));
  if (!token) return { ok: false, status: 401, error: "missing_authorization" };

  let identity: GoogleIdentity | null;
  try {
    identity = await verifyGoogleIdToken(token);
  } catch (e) {
    // Google's key endpoint being unreachable is our problem, not the
    // caller's — reporting it as 401 would send them into a pointless
    // re-login loop.
    console.error("[identity] Verification could not be completed:", e);
    return { ok: false, status: 503, error: "verification_unavailable" };
  }

  if (!identity) return { ok: false, status: 401, error: "invalid_token" };

  return accept(identity);
}
