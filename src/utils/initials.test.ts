import { describe, expect, it } from "vitest";
import { initialsFrom } from "./initials";

describe("initialsFrom", () => {
  it("takes the first and last name", () => {
    expect(initialsFrom("Horst Haag")).toBe("HH");
  });

  it("skips middle names rather than cramming them in", () => {
    expect(initialsFrom("Horst Werner Haag")).toBe("HH");
  });

  it("gives one letter for a single name", () => {
    expect(initialsFrom("Horst")).toBe("H");
  });

  it("uppercases what it finds", () => {
    expect(initialsFrom("horst haag")).toBe("HH");
  });

  it("copes with stray whitespace", () => {
    expect(initialsFrom("  Horst   Haag  ")).toBe("HH");
  });

  it("falls back to the email when there is no name", () => {
    expect(initialsFrom(undefined, "horst.haag@googlemail.com")).toBe("HH");
  });

  it("reads the usual separators in an address", () => {
    expect(initialsFrom("", "horst_haag@example.com")).toBe("HH");
    expect(initialsFrom("", "horst-haag@example.com")).toBe("HH");
    expect(initialsFrom("", "horst+tag@example.com")).toBe("HT");
  });

  it("gives one letter for an address with nothing to split on", () => {
    expect(initialsFrom(undefined, "horst@example.com")).toBe("H");
  });

  it("prefers the name over the address", () => {
    expect(initialsFrom("Ada Lovelace", "horst.haag@example.com")).toBe("AL");
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
