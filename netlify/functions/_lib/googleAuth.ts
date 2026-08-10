import { createPublicKey, verify as verifySignature, timingSafeEqual } from "node:crypto";

/**
 * Verifies Google ID tokens locally, against Google's published signing keys.
 *
 * Deliberately not the tokeninfo endpoint: that is a debugging aid, it costs a
 * network round trip on every single request, and it is rate limited. And
 * deliberately not a dependency either — Node can do RS256 and import a JWK
 * directly, so the whole thing is the checks below and nothing else.
 *
 * A token that fails any check is refused. There is no partial trust here.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

const VALID_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/** Tolerance for clock drift between Google and the function host. */
const CLOCK_SKEW_SECONDS = 60;

export type GoogleIdentity = {
  /** Google's stable user id. Never reassigned, unlike an email address. */
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

type Jwk = { kid: string; kty: string; alg?: string; use?: string; n: string; e: string };

let jwksCache: { keys: Jwk[]; expiresAt: number } | null = null;

async function fetchJwks(): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google signing keys: HTTP ${res.status}`);

  const body = (await res.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];

  // Google rotates these; honour the cache header rather than guessing.
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]);
  const ttlMs = Number.isFinite(maxAge) && maxAge > 0 ? maxAge * 1000 : 60 * 60 * 1000;

  jwksCache = { keys, expiresAt: now + ttlMs };
  return keys;
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

/**
 * Who is allowed in.
 *
 * This is a personal app, so a valid Google account is not sufficient — it has
 * to be *the* account. With no allowlist configured nobody passes: an
 * unconfigured deployment must be closed, not open to every Google user on the
 * internet.
 */
function isAllowed(identity: GoogleIdentity): boolean {
  const emails = (process.env.ALLOWED_GOOGLE_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const subs = (process.env.ALLOWED_GOOGLE_SUBS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (emails.length === 0 && subs.length === 0) {
    console.error(
      "[googleAuth] Neither ALLOWED_GOOGLE_EMAILS nor ALLOWED_GOOGLE_SUBS is set — refusing everyone. " +
        "Set one of them to the account that owns this app."
    );
    return false;
  }

  return emails.includes(identity.email.toLowerCase()) || subs.includes(identity.sub);
}

/** Constant-time compare, so a wrong audience cannot be probed by timing. */
function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Returns the verified identity, or null with the reason logged.
 *
 * Never throws for a bad token — an invalid token is an expected condition, not
 * an exceptional one. It does throw if Google's key endpoint is unreachable,
 * because that is not the caller's fault and must not read as "denied".
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[googleAuth] GOOGLE_CLIENT_ID is not set — cannot verify the audience");
    return null;
  }

  const parts = idToken.split(".");
  if (parts.length !== 3) {
    console.warn("[googleAuth] Not a JWT");
    return null;
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(headerB64) as typeof header;
    payload = decodeSegment(payloadB64) as typeof payload;
  } catch {
    console.warn("[googleAuth] Header or payload is not valid JSON");
    return null;
  }

  // Pinned, not read from the token: accepting whatever `alg` says is how
  // "alg: none" and HMAC-with-the-public-key forgeries get in.
  if (header.alg !== "RS256") {
    console.warn(`[googleAuth] Unexpected algorithm: ${header.alg}`);
    return null;
  }
  if (!header.kid) {
    console.warn("[googleAuth] No key id in the header");
    return null;
  }

  const keys = await fetchJwks();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    console.warn(`[googleAuth] No Google signing key matches kid ${header.kid}`);
    return null;
  }

  const signatureValid = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" }),
    Buffer.from(signatureB64, "base64url")
  );
  if (!signatureValid) {
    console.warn("[googleAuth] Signature does not verify");
    return null;
  }

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!VALID_ISSUERS.has(iss)) {
    console.warn(`[googleAuth] Unexpected issuer: ${iss}`);
    return null;
  }

  const aud = typeof payload.aud === "string" ? payload.aud : "";
  if (!sameString(aud, clientId)) {
    // A token minted for a different app must not be usable here.
    console.warn("[googleAuth] Token was issued for a different client id");
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (exp + CLOCK_SKEW_SECONDS < now) {
    console.warn("[googleAuth] Token has expired");
    return null;
  }
  const iat = typeof payload.iat === "number" ? payload.iat : 0;
  if (iat - CLOCK_SKEW_SECONDS > now) {
    console.warn("[googleAuth] Token is issued in the future");
    return null;
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!sub) {
    console.warn("[googleAuth] Token carries no subject");
    return null;
  }
  if (payload.email_verified !== true) {
    // An unverified address must not be matched against the allowlist.
    console.warn("[googleAuth] Email address is not verified");
    return null;
  }

  const identity: GoogleIdentity = {
    sub,
    email,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };

  if (!isAllowed(identity)) {
    console.warn(`[googleAuth] ${identity.email} is not on the allowlist`);
    return null;
  }

  return identity;
}
