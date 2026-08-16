import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one thing this store must never do: answer for storage it could not read.
 *
 * A lapsed Blobs credential made every call fail with 401. The store caught
 * that and returned null, the API dressed it up as HTTP 200 `{goal: null}`, and
 * the clients — correctly, given what they were told — deleted their local
 * goals to match a backend that had supposedly lost them. The values survived
 * only because the credential stayed broken long enough to be noticed.
 *
 * So: a failure has to leave here as a failure.
 */

const blobs = { get: vi.fn(), setJSON: vi.fn(), delete: vi.fn() };
const getStore = vi.fn(() => blobs);

vi.mock("@netlify/blobs", () => ({ getStore }));

const { NetlifyBlobsGoalsStore, InMemoryGoalsStore, createGoalsStore } = await import(
  "./goalsStore.ts"
);

const SUBJECT = "google:105969412379559801531";
const DOWN = new Error("Netlify Blobs has generated an internal error (401 status code)");

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.GOALS_STORE;
  delete process.env.BLOBS_SITE_ID;
  delete process.env.BLOBS_TOKEN;
  delete process.env.LEGACY_GOALS_ATHLETE_ID;
});

describe("NetlifyBlobsGoalsStore", () => {
  it("throws when a read fails instead of reporting no goal", async () => {
    blobs.get.mockRejectedValue(DOWN);

    await expect(new NetlifyBlobsGoalsStore().get(SUBJECT, 2026, "run")).rejects.toThrow(
      /401/
    );
  });

  it("throws when a write fails", async () => {
    blobs.setJSON.mockRejectedValue(DOWN);

    await expect(
      new NetlifyBlobsGoalsStore().set({
        subject: SUBJECT,
        year: 2026,
        sport: "run",
        distanceKm: 1103,
        createdAt: "2026-08-10T09:22:19.534Z",
        updatedAt: "2026-08-10T11:21:14.412Z",
        version: 14,
      })
    ).rejects.toThrow(/401/);
  });

  it("throws when a deletion fails rather than reporting it as done", async () => {
    blobs.delete.mockRejectedValue(DOWN);

    await expect(new NetlifyBlobsGoalsStore().delete(SUBJECT, 2026, "run")).rejects.toThrow(
      /401/
    );
  });

  it("still returns null when the store answers and holds nothing", async () => {
    blobs.get.mockResolvedValue(null);

    expect(await new NetlifyBlobsGoalsStore().get(SUBJECT, 2026, "swim")).toBeNull();
  });

  it("reads the goal the store holds", async () => {
    const goal = { subject: SUBJECT, year: 2026, sport: "run", distanceKm: 1103, version: 14 };
    blobs.get.mockResolvedValue(goal);

    expect(await new NetlifyBlobsGoalsStore().get(SUBJECT, 2026, "run")).toEqual(goal);
  });

  it("takes no ambient credentials, only explicit BLOBS_* ones", () => {
    // The regression itself. NETLIFY_AUTH_TOKEN is a personal access token that
    // Netlify sets for other purposes and that expires on its own schedule;
    // authenticating Blobs with it made the goals hostage to that schedule.
    process.env.NETLIFY_AUTH_TOKEN = "expired-personal-access-token";
    process.env.NETLIFY_SITE_ID = "ae234628-b2bc-4936-ac67-368d3b5df55d";

    new NetlifyBlobsGoalsStore();

    expect(getStore).toHaveBeenCalledWith("goals");

    delete process.env.NETLIFY_AUTH_TOKEN;
    delete process.env.NETLIFY_SITE_ID;
  });

  it("uses BLOBS_* credentials when both are given", () => {
    process.env.BLOBS_SITE_ID = "site";
    process.env.BLOBS_TOKEN = "token";

    new NetlifyBlobsGoalsStore();

    expect(getStore).toHaveBeenCalledWith("goals", { siteID: "site", token: "token" });
  });
});

describe("createGoalsStore", () => {
  it("does not fall back to memory when Blobs cannot be initialised", () => {
    getStore.mockImplementationOnce(() => {
      throw DOWN;
    });

    // Falling back would accept every write and answer every read empty, which
    // is data loss wearing a 200.
    expect(() => createGoalsStore()).toThrow(/401/);
  });

  it("hands out a throwaway store only when explicitly asked", () => {
    process.env.GOALS_STORE = "memory";

    expect(createGoalsStore()).toBeInstanceOf(InMemoryGoalsStore);
  });
});
