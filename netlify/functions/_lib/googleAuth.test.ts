import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateKeyPairSync, createSign, type KeyObject } from "node:crypto";
import { verifyGoogleIdToken } from "./googleAuth";

/**
 * Every one of these is a way in if the check is missing.
 *
 * The verifier is the only thing between an opened tab and the athlete's
 * history, and it is the kind of code that keeps working while being wrong —
 * a forged token that is waved through looks exactly like a valid one.
 */

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const OWNER = "owner@example.com";
const KID = "test-kid";

const google = generateKeyPairSync("rsa", { modulusLength: 2048 });
const attacker = generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwks = {
  keys: [{ ...(google.publicKey.export({ format: "jwk" }) as object), kid: KID, alg: "RS256", use: "sig" }],
};

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

const now = () => Math.floor(Date.now() / 1000);

function validClaims(over: Record<string, unknown> = {}) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: OWNER,
    email_verified: true,
    name: "Owner",
    iat: now() - 10,
    exp: now() + 3600,
    ...over,
  };
}

function makeToken(
  claims: Record<string, unknown>,
  opts: { kid?: string; alg?: string; key?: KeyObject; signature?: string } = {}
) {
  const header = b64({ alg: opts.alg ?? "RS256", kid: opts.kid ?? KID });
  const payload = b64(claims);

  if (opts.signature !== undefined) return `${header}.${payload}.${opts.signature}`;

  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(opts.key ?? google.privateKey);

  return `${header}.${payload}.${signature.toString("base64url")}`;
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.ALLOWED_GOOGLE_EMAILS = OWNER;
  delete process.env.ALLOWED_GOOGLE_SUBS;

  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "cache-control": "public, max-age=3600" },
    })
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a token that is genuinely Google's", () => {
  it("is accepted and yields the identity", async () => {
    const identity = await verifyGoogleIdToken(makeToken(validClaims()));
    expect(identity).toEqual({
      sub: "1234567890",
      email: OWNER,
      name: "Owner",
      picture: undefined,
    });
  });

  it("is accepted with the bare issuer spelling too", async () => {
    // Google uses both "accounts.google.com" and the https form.
    const identity = await verifyGoogleIdToken(makeToken(validClaims({ iss: "accounts.google.com" })));
    expect(identity?.sub).toBe("1234567890");
  });

  it("matches the allowlist by subject as well as by email", async () => {
    delete process.env.ALLOWED_GOOGLE_EMAILS;
    process.env.ALLOWED_GOOGLE_SUBS = "1234567890";
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).not.toBeNull();
  });

  it("compares email addresses without regard to case", async () => {
    process.env.ALLOWED_GOOGLE_EMAILS = OWNER.toUpperCase();
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).not.toBeNull();
  });
});

describe("forged signatures", () => {
  it("rejects a token signed with somebody else's key", async () => {
    const token = makeToken(validClaims(), { key: attacker.privateKey });
    expect(await verifyGoogleIdToken(token)).toBeNull();
  });

  it("rejects alg:none, signature or not", async () => {
    // The classic: strip the signature and claim no algorithm was used. The
    // algorithm is pinned to RS256 rather than read from the header.
    expect(await verifyGoogleIdToken(makeToken(validClaims(), { alg: "none", signature: "" }))).toBeNull();
  });

  it("rejects a symmetric algorithm", async () => {
    // HS256 signed with the public key as the secret — verifies against a
    // naive implementation that trusts the header.
    expect(await verifyGoogleIdToken(makeToken(validClaims(), { alg: "HS256" }))).toBeNull();
  });

  it("rejects a key id Google does not publish", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims(), { kid: "not-googles" }))).toBeNull();
  });

  it("rejects a token with a tampered payload", async () => {
    const token = makeToken(validClaims());
    const [header, , signature] = token.split(".");
    const swapped = b64(validClaims({ email: "someone.else@example.com" }));
    expect(await verifyGoogleIdToken(`${header}.${swapped}.${signature}`)).toBeNull();
  });

  it("rejects anything that is not a JWT at all", async () => {
    for (const junk of ["", "abc", "a.b", "a.b.c.d", "not.a.jwt"]) {
      expect(await verifyGoogleIdToken(junk)).toBeNull();
    }
  });
});

describe("claims that are valid but not for us", () => {
  it("rejects a token minted for a different client id", async () => {
    // A perfectly genuine Google token from another app must not work here.
    expect(await verifyGoogleIdToken(makeToken(validClaims({ aud: "someone-else.apps.googleusercontent.com" })))).toBeNull();
  });

  it("rejects an unexpected issuer", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims({ iss: "https://evil.example.com" })))).toBeNull();
  });

  it("rejects an expired token", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims({ exp: now() - 120 })))).toBeNull();
  });

  it("accepts a token that expired within the clock skew", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims({ exp: now() - 5 })))).not.toBeNull();
  });

  it("rejects a token issued in the future", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims({ iat: now() + 600 })))).toBeNull();
  });

  it("rejects an unverified email address", async () => {
    // Otherwise the allowlist could be matched by an address the holder never
    // proved they own.
    expect(await verifyGoogleIdToken(makeToken(validClaims({ email_verified: false })))).toBeNull();
  });

  it("rejects an account that is not on the allowlist", async () => {
    expect(await verifyGoogleIdToken(makeToken(validClaims({ email: "stranger@example.com", sub: "999" })))).toBeNull();
  });
});

describe("misconfiguration fails closed", () => {
  it("refuses everyone when no allowlist is configured", async () => {
    delete process.env.ALLOWED_GOOGLE_EMAILS;
    delete process.env.ALLOWED_GOOGLE_SUBS;
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).toBeNull();
  });

  it("refuses everyone when the client id is missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).toBeNull();
  });

  it("does not treat an empty allowlist entry as a wildcard", async () => {
    process.env.ALLOWED_GOOGLE_EMAILS = " , ,";
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).toBeNull();
  });
});

describe("Google being unreachable", () => {
  it("throws rather than reporting the token as invalid", async () => {
    // A failed key fetch is our outage, not a bad credential. Returning null
    // here would sign the athlete out and send them into a login loop.
    //
    // Freshly imported on purpose: the keys are cached for as long as Google's
    // cache-control says, so a warm module would never attempt the fetch and
    // this would pass without testing anything.
    vi.resetModules();
    vi.stubGlobal("fetch", async () => new Response("nope", { status: 500 }));

    const cold = await import("./googleAuth");
    await expect(cold.verifyGoogleIdToken(makeToken(validClaims()))).rejects.toThrow();
  });

  it("keeps working from the cached keys while Google is down", async () => {
    // The flip side, and the reason the cache is worth having: an outage at
    // Google does not sign anybody out mid-session.
    expect(await verifyGoogleIdToken(makeToken(validClaims()))).not.toBeNull();

    vi.stubGlobal("fetch", async () => {
      throw new Error("network down");
    });

    expect(await verifyGoogleIdToken(makeToken(validClaims()))).not.toBeNull();
  });
});
