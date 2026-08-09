import { describe, it, expect } from "vitest";
import { migrateLegacyCache } from "./activitiesRepository";

/**
 * The cached year can be the only surviving copy of an athlete's history once
 * the upstream API is no longer reachable. These tests guard the upgrade path
 * so it never silently loses an activity.
 */

const legacyDoc = {
  year: 2025,
  fetchedAt: 1_700_000_000_000,
  activities: [
    { id: 1001, sport: "run", name: "Morning Run", startDate: "2025-01-15T06:30:00Z", distanceKm: 10.5, elevationM: 120 },
    { id: 1002, sport: "ride", name: "Feierabendrunde", startDate: "2025-04-05T12:00:00Z", distanceKm: 45, elevationM: 500 },
    { id: 1003, sport: "swim", name: "Pool", startDate: "2025-05-01T10:00:00Z", distanceKm: 1.5, elevationM: 0 },
  ],
};

describe("migrateLegacyCache", () => {
  it("keeps every activity", () => {
    const out = migrateLegacyCache(legacyDoc);
    expect(out?.activities).toHaveLength(3);
    expect(out?.year).toBe(2025);
    expect(out?.schemaVersion).toBe(2);
    expect(out?.fetchedAt).toBe(1_700_000_000_000);
  });

  it("preserves the values the old shape carried", () => {
    const out = migrateLegacyCache(legacyDoc);
    expect(out?.activities[0]).toEqual({
      id: "1001",
      provider: "strava",
      sport: "run",
      name: "Morning Run",
      // Same instant the old pipeline read: 06:30Z is 07:30 in Europe/Berlin.
      startDateLocal: "2025-01-15T07:30:00",
      startDateUtc: "2025-01-15T06:30:00Z",
      distanceKm: 10.5,
      elevationM: 120,
      movingTimeSec: 0,
      isCommute: false,
      isIndoor: false,
    });
  });

  it("keeps the years and months the athlete saw before the upgrade", () => {
    const out = migrateLegacyCache(legacyDoc);
    const dates = out?.activities.map((a) => a.startDateLocal.slice(0, 7));
    expect(dates).toEqual(["2025-01", "2025-04", "2025-05"]);
  });

  it("handles the summer/winter offset difference", () => {
    // 12:00Z is 14:00 in CEST but would be 13:00 in CET — the conversion has
    // to go through a real Date, not a fixed offset.
    const out = migrateLegacyCache(legacyDoc);
    expect(out?.activities[1].startDateLocal).toBe("2025-04-05T14:00:00");
  });

  it("drops individual records with an unusable date but keeps the rest", () => {
    const out = migrateLegacyCache({
      ...legacyDoc,
      activities: [...legacyDoc.activities, { id: 9, sport: "run", startDate: "kaputt", distanceKm: 1, elevationM: 0 }],
    });
    expect(out?.activities).toHaveLength(3);
  });

  it("tolerates a missing name", () => {
    const out = migrateLegacyCache({
      year: 2025,
      fetchedAt: 1,
      activities: [{ id: 7, sport: "run", startDate: "2025-01-15T06:30:00Z", distanceKm: 1, elevationM: 0 }],
    });
    expect(out?.activities[0].name).toBe("");
  });

  it("migrates an empty year to an empty year", () => {
    const out = migrateLegacyCache({ year: 2019, fetchedAt: 1, activities: [] });
    expect(out).toEqual({ schemaVersion: 2, year: 2019, fetchedAt: 1, activities: [] });
  });

  it("refuses documents it cannot read rather than reporting an empty year", () => {
    // A non-empty entry that yields nothing is not a legacy document. Claiming
    // "0 activities" here would look like a genuinely empty year to the UI.
    expect(migrateLegacyCache({ year: 2025, fetchedAt: 1, activities: [{ nonsense: true }] })).toBeNull();
    expect(migrateLegacyCache({ year: 2025, activities: "nope" })).toBeNull();
    expect(migrateLegacyCache({ activities: [] })).toBeNull();
    expect(migrateLegacyCache(null)).toBeNull();
    expect(migrateLegacyCache(undefined)).toBeNull();
  });
});
