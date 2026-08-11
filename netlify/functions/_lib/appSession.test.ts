import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearedSessionCookie,
  isSecureRequest,
  mintSessionToken,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookie,
  shouldRenew,
  verifySessionToken,
} from "./appSession";

/**
 * The session token is the only thing standing between an opened tab and the
 * athlete's history for ninety days, so the tests worth having are the ones
 * that fail if it can be forged rather than the ones that prove it round-trips.
 */

const SECRET = "a".repeat(48);
const OTHER_SECRET = "b".repeat(48);

const PROFILE = {
  sub: "1234567890",
  email: "athlete@example.com",
  name: "Athlete",
  picture: "https://example.com/a.png",
};

const NOW = 1_800_000_000;

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SESSION_SECRET;
});

function mint(nowSeconds = NOW) {
  const minted = mintSessionToken(PROFILE, nowSeconds);
  if (!minted) throw new Error("minting failed");
  return minted;
}

describe("minting and verifying", () => {
  it("returns the profile it was given", () => {
    const claims = verifySessionToken(mint().token, NOW);

    expect(claims).toMatchObject({
      sub: PROFILE.sub,
      email: PROFILE.email,
      name: PROFILE.name,
      picture: PROFILE.picture,
    });
  });

  it("expires ninety days out", () => {
    expect(mint().expiresAt).toBe(NOW + SESSION_TTL_SECONDS);
  });

  it("accepts a token right up to its expiry", () => {
    const { token, expiresAt } = mint();
    expect(verifySessionToken(token, expiresAt - 1)).not.toBeNull();
  });

  it("refuses one past it", () => {
    const { token, expiresAt } = mint();
    expect(verifySessionToken(token, expiresAt + 120)).toBeNull();
  });

  it("refuses one issued in the future", () => {
    expect(verifySessionToken(mint(NOW + 3600).token, NOW)).toBeNull();
  });
});

describe("forgery", () => {
  it("refuses a tampered payload", () => {
    const { token } = mint();
    const [, signature] = token.split(".");

    const forged = { ...PROFILE, sub: "9999", iat: NOW, exp: NOW + SESSION_TTL_SECONDS };
    const payload = Buffer.from(JSON.stringify(forged), "utf8").toString("base64url");

    expect(verifySessionToken(`${payload}.${signature}`, NOW)).toBeNull();
  });

  it("refuses an unsigned token", () => {
    const payload = Buffer.from(JSON.stringify(PROFILE), "utf8").toString("base64url");
    expect(verifySessionToken(payload, NOW)).toBeNull();
    expect(verifySessionToken(`${payload}.`, NOW)).toBeNull();
  });

  it("refuses a token signed with a different secret", () => {
    const { token } = mint();
    process.env.SESSION_SECRET = OTHER_SECRET;

    expect(verifySessionToken(token, NOW)).toBeNull();
  });

  it("refuses everything when the secret is missing or too short", () => {
    const { token } = mint();

    delete process.env.SESSION_SECRET;
    expect(mintSessionToken(PROFILE, NOW)).toBeNull();
    expect(verifySessionToken(token, NOW)).toBeNull();

    process.env.SESSION_SECRET = "short";
    expect(mintSessionToken(PROFILE, NOW)).toBeNull();
    expect(verifySessionToken(token, NOW)).toBeNull();
  });

  it("refuses malformed input rather than throwing", () => {
    for (const bad of ["", ".", "a.b.c", "not-base64!.sig", "a.b"]) {
      expect(verifySessionToken(bad, NOW)).toBeNull();
    }
  });
});

describe("renewal", () => {
  it("leaves a fresh session alone", () => {
    const claims = verifySessionToken(mint().token, NOW)!;
    expect(shouldRenew(claims, NOW)).toBe(false);
  });

  it("renews once past halfway", () => {
    const claims = verifySessionToken(mint().token, NOW)!;
    expect(shouldRenew(claims, NOW + SESSION_TTL_SECONDS / 2 + 1)).toBe(true);
  });
});

describe("the cookie", () => {
  it("is HttpOnly, Lax and Secure on a deployed site", () => {
    const cookie = sessionCookie("token", SESSION_TTL_SECONDS, true);

    expect(cookie).toContain(`${SESSION_COOKIE}=token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
  });

  it("drops Secure over plain http, or local development could never sign in", () => {
    expect(sessionCookie("token", 60, false)).not.toContain("Secure");
  });

  it("clears with an immediate expiry", () => {
    expect(clearedSessionCookie(true)).toContain("Max-Age=0");
  });
});

describe("reading a cookie header", () => {
  it("finds the session among others", () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=wanted; b=2`, SESSION_COOKIE)).toBe("wanted");
  });

  it("does not match a cookie whose name merely ends the same way", () => {
    expect(readCookie(`x_${SESSION_COOKIE}=other`, SESSION_COOKIE)).toBeNull();
  });

  it("returns null for a missing cookie or no header", () => {
    expect(readCookie("a=1", SESSION_COOKIE)).toBeNull();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
    expect(readCookie(`${SESSION_COOKIE}=`, SESSION_COOKIE)).toBeNull();
  });
});

describe("deciding on Secure", () => {
  it("follows the forwarded protocol when there is one", () => {
    expect(isSecureRequest({ "x-forwarded-proto": "https" })).toBe(true);
    expect(isSecureRequest({ "X-Forwarded-Proto": "https, http" })).toBe(true);
    expect(isSecureRequest({ "x-forwarded-proto": "http" })).toBe(false);
  });

  it("falls back to the host, treating only localhost as insecure", () => {
    expect(isSecureRequest({ host: "localhost:8888" })).toBe(false);
    expect(isSecureRequest({ host: "127.0.0.1:8888" })).toBe(false);
    expect(isSecureRequest({ host: "still-moving.netlify.app" })).toBe(true);
  });
});
