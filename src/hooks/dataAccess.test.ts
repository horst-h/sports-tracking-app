import { describe, it, expect } from "vitest";
import { resolveAccess } from "./useDataAccess";

/**
 * The gate in front of every screen.
 *
 * Wrong in the permissive direction it renders an empty dashboard and fires
 * requests that come back 401; wrong in the strict direction it shows a login
 * screen to someone who is already signed in.
 */

describe("resolveAccess", () => {
  it("lets a signed-in athlete through", () => {
    expect(resolveAccess("signed-in")).toEqual({
      ready: true,
      needsLogin: false,
      checking: false,
    });
  });

  it("asks for a login when there is no session", () => {
    expect(resolveAccess("signed-out")).toEqual({
      ready: false,
      needsLogin: true,
      checking: false,
    });
  });

  it("neither reads nor prompts while the stored session is still loading", () => {
    // Reading IndexedDB is asynchronous. Prompting during that window would
    // flash the login screen on every reload before settling on the dashboard.
    const access = resolveAccess("checking");
    expect(access.ready).toBe(false);
    expect(access.needsLogin).toBe(false);
    expect(access.checking).toBe(true);
  });

  it("never claims to be ready and in need of a login at once", () => {
    for (const status of ["checking", "signed-in", "signed-out"] as const) {
      const access = resolveAccess(status);
      expect(access.ready && access.needsLogin).toBe(false);
    }
  });
});
