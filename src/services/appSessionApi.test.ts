import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshSession, SessionUnavailable } from "./appSessionApi";

/**
 * Four outcomes that used to be three.
 *
 * Confirming a session can fail because nobody answered, or because someone
 * answered badly, and those call for opposite responses. Offline must cost
 * nobody their session — this app is built to work with no network at all. But
 * a server that answers and cannot authenticate anyone is not offline, and
 * treating it as such is how a broken deployment renders as perfectly normal
 * while every request behind it fails in silence.
 */

const JSON_HEADERS = new Headers({ "content-type": "application/json" });

function respond(status: number, body: unknown, headers = JSON_HEADERS) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("refreshSession", () => {
  it("returns the session the server confirms", async () => {
    const session = { sub: "1", email: "ada@example.com", expiresAt: 4102444800 };
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, { session })));

    expect(await refreshSession()).toEqual(session);
  });

  it("reports a refused session as refused, not as a failure", async () => {
    // A 401 is the server answering clearly. It is the one case that should
    // actually sign somebody out.
    vi.stubGlobal("fetch", vi.fn(async () => respond(401, { error: "no_session" })));

    expect(await refreshSession()).toBeNull();
  });

  it("calls a network failure unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );

    await expect(refreshSession()).rejects.toMatchObject({
      name: "SessionUnavailable",
      reason: "unreachable",
    });
  });

  it("calls a 503 a server problem, not offline", async () => {
    // SESSION_SECRET missing on the deployment. The device is online and the
    // server is up; it simply cannot sign or verify anything.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(503, { error: "session_not_configured" }))
    );

    await expect(refreshSession()).rejects.toMatchObject({ reason: "server" });
  });

  it("calls a 500 a server problem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(500, { error: "unexpected_error" })));

    await expect(refreshSession()).rejects.toMatchObject({ reason: "server" });
  });

  it("calls an undeployed function a server problem", async () => {
    // The SPA catch-all answers 200 with index.html, which parses as neither a
    // session nor a network failure.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(200, {}, new Headers({ "content-type": "text/html" }))
      )
    );

    await expect(refreshSession()).rejects.toMatchObject({ reason: "server" });
  });

  it("calls a 200 without a session a server problem", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond(200, {})));

    await expect(refreshSession()).rejects.toMatchObject({ reason: "server" });
  });

  it("throws SessionUnavailable in every failing case, so callers keep the session", async () => {
    // Whatever went wrong, it must not read as "signed out": only the 401 above
    // does that.
    for (const fetchImpl of [
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => respond(503, {}),
      async () => respond(200, {}, new Headers({ "content-type": "text/html" })),
    ]) {
      vi.stubGlobal("fetch", vi.fn(fetchImpl));
      await expect(refreshSession()).rejects.toBeInstanceOf(SessionUnavailable);
    }
  });
});
