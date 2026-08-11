import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The app's own session, so that signing in is not an hourly chore.
 *
 * A Google ID token is a proof of identity, not a session: Google mints it with
 * a one-hour lifetime and offers nothing to renew it with — this flow hands out
 * no refresh token. Treating it as the session is what made the login screen
 * come back every hour.
 *
 * So it is used once, at sign-in, and exchanged for this: a token signed with a
 * secret only the server knows, carrying the identity Google already vouched
 * for. Google is asked again when this expires, and not before.
 *
 * It travels as an HttpOnly cookie rather than in a header, which is the whole
 * reason a long lifetime is defensible. Ninety days of bearer token sitting in
 * IndexedDB is ninety days of anything running in the page being able to read
 * it; a cookie the page cannot see is not readable that way.
 */

export const SESSION_COOKIE = "sm_session";

/** How long a session lives without being renewed. */
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

/**
 * Renew once the session is past its halfway point.
 *
 * Sliding, so an athlete who opens the app at all keeps a session indefinitely,
 * but only re-issued on the far side of 45 days — a new cookie on every request
 * would be churn for nothing.
 */
const RENEW_BELOW_SECONDS = SESSION_TTL_SECONDS / 2;

/** Tolerance for clock drift, matching the ID token verification. */
const CLOCK_SKEW_SECONDS = 60;

/**
 * Short enough to brute-force is the same as unsigned. Refusing here rather
 * than warning: a deployment that cannot sign properly must not sign at all.
 */
const MIN_SECRET_LENGTH = 32;

export type SessionClaims = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  /** Issued at, epoch seconds. */
  iat: number;
  /** Expires at, epoch seconds. */
  exp: number;
};

export type SessionProfile = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
};

function secret(): string | null {
  const value = process.env.SESSION_SECRET ?? "";
  if (value.length < MIN_SECRET_LENGTH) {
    console.error(
      `[appSession] SESSION_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters — ` +
        "refusing to sign or accept sessions. Generate one with: openssl rand -base64 48"
    );
    return null;
  }
  return value;
}

/**
 * Whether this deployment can sign sessions at all.
 *
 * Worth asking separately, because a missing secret and a bad token both come
 * back as "does not verify" and they call for opposite responses: one is the
 * server's fault and must not be answered by signing anybody out.
 */
export function isSessionSigningConfigured(): boolean {
  return secret() !== null;
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** Constant-time compare, so a signature cannot be guessed a byte at a time. */
function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Returns the signed token and when it expires, or null when the deployment
 * has no usable secret.
 */
export function mintSessionToken(
  profile: SessionProfile,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): { token: string; expiresAt: number } | null {
  const key = secret();
  if (!key) return null;

  const claims: SessionClaims = {
    sub: profile.sub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
  };

  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payload}.${sign(payload, key)}`, expiresAt: claims.exp };
}

/**
 * Returns the claims of a token this server signed and that has not expired,
 * null otherwise.
 *
 * The signature is checked before the payload is parsed or believed — an
 * attacker-supplied payload must never reach any decision.
 */
export function verifySessionToken(
  token: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): SessionClaims | null {
  const key = secret();
  if (!key) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  if (!payload || !signature) return null;
  if (!sameSignature(sign(payload, key), signature)) return null;

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    return null;
  }

  if (typeof claims?.sub !== "string" || !claims.sub) return null;
  if (typeof claims.exp !== "number" || typeof claims.iat !== "number") return null;
  if (claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) return null;
  if (claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) return null;

  return claims;
}

/** True once the session is past its halfway point and worth re-issuing. */
export function shouldRenew(
  claims: SessionClaims,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  return claims.exp - nowSeconds < RENEW_BELOW_SECONDS;
}

/**
 * Reads one cookie out of a Cookie header.
 *
 * Values are read as-is: everything this app puts in a cookie is base64url, so
 * there is nothing to decode and nothing that could smuggle a `;` back in.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim() || null;
  }
  return null;
}

/**
 * `SameSite=Lax` is the CSRF defence, not an afterthought.
 *
 * Every endpoint behind this session now authenticates by cookie, which is
 * exactly the shape a cross-site request could otherwise abuse. Lax withholds
 * the cookie from anything but a top-level navigation, and none of these
 * endpoints change state on one of those.
 */
export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

/** The same cookie, expired — a sign-out the browser cannot ignore. */
export function clearedSessionCookie(secure: boolean): string {
  return sessionCookie("", 0, secure);
}

/** Header casing depends on the runtime, so never trust `headers.cookie`. */
export function headerOf(
  headers: Record<string, string | undefined>,
  wanted: string
): string | undefined {
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === wanted) return value;
  }
  return undefined;
}

/**
 * Whether the response may mark the cookie `Secure`.
 *
 * It must be marked on the deployed site and must not be over plain http, or
 * the browser drops the cookie and local development can never sign in.
 */
export function isSecureRequest(headers: Record<string, string | undefined>): boolean {
  const proto = headerOf(headers, "x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";

  const host = headerOf(headers, "host") ?? "";
  return !/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host);
}
