import { describe, it, expect } from "vitest";
import { resolveProviderId, isProviderId } from "./providerRegistry";
import { cacheKey } from "../repositories/activitiesRepository";

/**
 * Selecting a source and keeping the two caches apart. Both are small rules,
 * and both are the kind that fail silently: the wrong provider shows plausible
 * numbers, and a shared cache key shows numbers from the other source
 * entirely.
 */

describe("resolveProviderId", () => {
  it("defaults to Runalyze, the source the app reads from now", () => {
    expect(resolveProviderId("", null)).toBe("runalyze");
  });

  it("takes the provider from the query string", () => {
    expect(resolveProviderId("?provider=strava", null)).toBe("strava");
    expect(resolveProviderId("?year=2025&provider=strava", null)).toBe("strava");
  });

  it("remembers a previous selection when the URL says nothing", () => {
    // Matters for the Strava cache: reading an old year means selecting it
    // once and having the choice survive the next navigation.
    expect(resolveProviderId("", "strava")).toBe("strava");
  });

  it("lets the URL override what was remembered, in both directions", () => {
    expect(resolveProviderId("?provider=strava", "runalyze")).toBe("strava");
    expect(resolveProviderId("?provider=runalyze", "strava")).toBe("runalyze");
  });

  it("ignores anything that is not a known provider", () => {
    expect(resolveProviderId("?provider=garmin", null)).toBe("runalyze");
    expect(resolveProviderId("?provider=", null)).toBe("runalyze");
    expect(resolveProviderId("", "garmin")).toBe("runalyze");
    expect(resolveProviderId("", "")).toBe("runalyze");
  });

  it("does not accept inherited object properties as provider names", () => {
    expect(isProviderId("toString")).toBe(false);
    expect(isProviderId("constructor")).toBe(false);
    expect(resolveProviderId("?provider=constructor", null)).toBe("runalyze");
  });
});

describe("cacheKey", () => {
  it("scopes a year to its provider", () => {
    expect(cacheKey("strava", 2025)).toBe("strava:2025");
    expect(cacheKey("runalyze", 2025)).toBe("runalyze:2025");
  });

  it("never collides across providers for the same year", () => {
    expect(cacheKey("strava", 2025)).not.toBe(cacheKey("runalyze", 2025));
  });

  it("does not collide with the pre-provider key, which was the bare year", () => {
    expect(cacheKey("strava", 2025)).not.toBe(String(2025));
  });
});
