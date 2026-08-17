import { describe, expect, it } from "vitest";
import { initialsFrom } from "./initials";

/**
 * The fixtures are deliberately invented people at example.com.
 *
 * A real address here is the allowlist this deployment authenticates against,
 * and putting it in a test file commits it to the repository — which is exactly
 * what Netlify's secrets scanner blocked the build over.
 */

describe("initialsFrom", () => {
  it("takes the first and last name", () => {
    expect(initialsFrom("Ada Lovelace")).toBe("AL");
  });

  it("skips middle names rather than cramming them in", () => {
    expect(initialsFrom("Ada Augusta Lovelace")).toBe("AL");
  });

  it("gives one letter for a single name", () => {
    expect(initialsFrom("Ada")).toBe("A");
  });

  it("uppercases what it finds", () => {
    expect(initialsFrom("ada lovelace")).toBe("AL");
  });

  it("copes with stray whitespace", () => {
    expect(initialsFrom("  Ada   Lovelace  ")).toBe("AL");
  });

  it("falls back to the email when there is no name", () => {
    expect(initialsFrom(undefined, "ada.lovelace@example.com")).toBe("AL");
  });

  it("reads the usual separators in an address", () => {
    expect(initialsFrom("", "ada_lovelace@example.com")).toBe("AL");
    expect(initialsFrom("", "ada-lovelace@example.com")).toBe("AL");
    expect(initialsFrom("", "ada+tag@example.com")).toBe("AT");
  });

  it("gives one letter for an address with nothing to split on", () => {
    expect(initialsFrom(undefined, "ada@example.com")).toBe("A");
  });

  it("prefers the name over the address", () => {
    expect(initialsFrom("Grace Hopper", "ada.lovelace@example.com")).toBe("GH");
  });

  it("falls back when there is nothing to go on", () => {
    expect(initialsFrom()).toBe("?");
    expect(initialsFrom("", "")).toBe("?");
    expect(initialsFrom("   ", "  ")).toBe("?");
  });

  it("takes a caller's own fallback", () => {
    expect(initialsFrom(undefined, undefined, "–")).toBe("–");
  });

  it("keeps a whole character when it sits outside the BMP", () => {
    // Splitting with [0] on the raw string would return half a surrogate pair
    // and render as a replacement character.
    expect(initialsFrom("𝒜da 𝒩oether")).toBe("𝒜𝒩");
  });

  it("handles names that are not Latin", () => {
    expect(initialsFrom("Ада Лавлейс")).toBe("АЛ");
  });
});
