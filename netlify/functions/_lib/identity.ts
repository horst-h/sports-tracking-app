import { verifyGoogleIdToken, type GoogleIdentity } from "./googleAuth";

/**
 * The one gate in front of everything this app stores or proxies.
 *
 * Both the goals store and the Runalyze proxy hand out personal data, so both
 * ask the same question here rather than each inventing an answer.
 */

export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export type IdentityResult =
  | { ok: true; identity: GoogleIdentity; subject: string }
  | { ok: false; status: number; error: string };

/**
 * Headers arrive with unpredictable casing depending on the runtime, so the
 * lookup has to be case-insensitive rather than trusting `.authorization`.
 */
function authHeaderOf(headers: Record<string, string | undefined>): string | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === "authorization") return value;
  }
  return undefined;
}

export async function requireIdentity(
  headers: Record<string, string | undefined>
): Promise<IdentityResult> {
  const token = extractBearerToken(authHeaderOf(headers));
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

  // The Google subject is the storage key: stable for the account, and unlike
  // the email address it is never reassigned or changed.
  return { ok: true, identity, subject: `google:${identity.sub}` };
}
