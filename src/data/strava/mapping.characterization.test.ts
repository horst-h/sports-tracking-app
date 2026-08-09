import { describe, it, expect } from "vitest";

import { toDomainActivity, toDomainActivities } from "./stravaMapper";
import { normalizeActivities } from "../../domain/metrics/normalize";
import type { NormalizedActivity } from "../../domain/metrics/types";
import { STRAVA_RAW, CACHED_DOMAIN, mkActivity } from "../../test/fixtures";

/**
 * Contract of the Strava mapping layer: a raw API payload in, a
 * NormalizedActivity out.
 *
 * The endpoints of these tests are provider-independent; only `pipeline`
 * below knows how the two are connected. When Runalyze arrives it gets an
 * equivalent file, and both must produce the same NormalizedActivity shape.
 */
function pipeline(raw: typeof STRAVA_RAW): NormalizedActivity[] {
  const { activities } = toDomainActivities(raw);
  return normalizeActivities(activities);
}

describe("toDomainActivity", () => {
  it("maps the fields the calculation core consumes", () => {
    expect(toDomainActivity(STRAVA_RAW[0])).toEqual({
      id: "1001",
      provider: "strava",
      sport: "run",
      name: "Morning Run",
      startDateLocal: "2025-01-15T07:30:00",
      startDateUtc: "2025-01-15T06:30:00Z",
      distanceKm: 10.5,
      elevationM: 120,
      movingTimeSec: 3600,
      isCommute: false,
      isIndoor: false,
    });
  });

  it("converts metres to kilometres with two decimals", () => {
    expect(toDomainActivity({ ...STRAVA_RAW[0], distance: 10567 })?.distanceKm).toBe(10.57);
    expect(toDomainActivity({ ...STRAVA_RAW[0], distance: 10564 })?.distanceKm).toBe(10.56);
  });

  it("rounds elevation to whole metres", () => {
    expect(toDomainActivity({ ...STRAVA_RAW[0], total_elevation_gain: 120.6 })?.elevationM).toBe(121);
  });

  it("strips the bogus Z Strava appends to start_date_local", () => {
    // Strava sends local wall-clock time but suffixes it with "Z". Keeping the
    // suffix would make every downstream Date parse shift by the viewer's UTC
    // offset.
    const a = toDomainActivity(STRAVA_RAW[0]);
    expect(a?.startDateLocal).toBe("2025-01-15T07:30:00");
    expect(a?.startDateLocal.endsWith("Z")).toBe(false);
    // The absolute instant is kept separately and stays UTC.
    expect(a?.startDateUtc).toBe("2025-01-15T06:30:00Z");
  });

  it("falls back to the UTC instant when start_date_local is absent", () => {
    // Reproduces the previous behaviour for payloads and cache entries that
    // predate the field: read the instant in the current zone. Under
    // Europe/Berlin, 06:30Z is 07:30 local.
    const { start_date_local: _omitted, ...withoutLocal } = STRAVA_RAW[0];
    expect(toDomainActivity(withoutLocal)?.startDateLocal).toBe("2025-01-15T07:30:00");
  });

  it("carries moving time into the domain model", () => {
    expect(toDomainActivity(STRAVA_RAW[0])?.movingTimeSec).toBe(3600);
    const { moving_time: _omitted, ...withoutTime } = STRAVA_RAW[0];
    expect(toDomainActivity(withoutTime)?.movingTimeSec).toBe(0);
  });

  it("reads the commute and trainer flags", () => {
    expect(toDomainActivity({ ...STRAVA_RAW[0], commute: true })?.isCommute).toBe(true);
    expect(toDomainActivity({ ...STRAVA_RAW[0], trainer: true })?.isIndoor).toBe(true);
    expect(toDomainActivity(STRAVA_RAW[0])?.isCommute).toBe(false);
  });

  it("drops sports the app does not track", () => {
    expect(toDomainActivity(STRAVA_RAW[3])).toBeNull(); // Hike
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "AlpineSki" })).toBeNull();
  });

  it("only counts plain Run and Ride, unchanged from before the refactoring", () => {
    // Widening this to TrailRun / GravelRide would move the athlete's yearly
    // totals and is a product decision, not part of a data-source swap.
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "TrailRun" })).toBeNull();
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "VirtualRide" })).toBeNull();
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "RUN" })?.sport).toBe("run");
  });

  it("recognises swim types via substring match", () => {
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "Swim" })?.sport).toBe("swim");
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "OpenWaterSwim" })?.sport).toBe("swim");
  });

  it("KNOWN GAP: the documented 'openwaterswin' typo is not handled", () => {
    // A comment in the mapper claims the substring check covers Strava's
    // "openwaterswin" typo. It does not — the string ends in "swin". Harmless
    // in practice (Strava sends "Swim"), kept as a test so the claim and the
    // behaviour stay visibly out of sync rather than quietly so.
    expect(toDomainActivity({ ...STRAVA_RAW[0], type: "openwaterswin" })).toBeNull();
  });
});

describe("toDomainActivities", () => {
  it("reports what it skipped instead of dropping it silently", () => {
    const { activities, skipped } = toDomainActivities(STRAVA_RAW);
    expect(activities).toHaveLength(5);
    expect(skipped).toEqual([{ id: "1004", type: "Hike" }]);
  });
});

describe("full pipeline: Strava payload -> NormalizedActivity", () => {
  const result = pipeline(STRAVA_RAW);

  it("keeps only tracked sports and sorts ascending by local start time", () => {
    expect(result.map((a) => a.id)).toEqual(["1006", "1005", "1001", "1002", "1003"]);
  });

  it("produces the expected normalized records", () => {
    expect(result[2]).toEqual({
      id: "1001",
      sport: "run",
      startDateLocal: "2025-01-15T07:30:00",
      year: 2025,
      month: 1,
      dayOfYear: 15,
      distanceKm: 10.5,
      elevationM: 120,
      movingTimeSec: 3600,
      isCommute: false,
      isIndoor: false,
    });
    expect(result[4]).toMatchObject({
      id: "1003",
      sport: "swim",
      month: 5,
      dayOfYear: 121,
      distanceKm: 1.5,
      elevationM: 0,
      movingTimeSec: 2400,
    });
  });

  it("moving time survives the whole chain", () => {
    // Previously lost in the mapper, so aggregate.movingTimeHours was
    // always 0 across the entire app.
    expect(result.map((a) => a.movingTimeSec)).toEqual([2100, 1800, 3600, 5400, 2400]);
  });

  it("a run recorded just after midnight lands in the correct year", () => {
    // Activity 1006 carries start_date 2024-12-31T23:30:00Z but was actually
    // run at 00:30 local on 1 January. It belongs to 2025.
    expect(result[0].id).toBe("1006");
    expect(result[0].startDateLocal).toBe("2025-01-01T00:30:00");
    expect(result[0].year).toBe(2025);
    expect(result[0].month).toBe(1);
    expect(result[0].dayOfYear).toBe(1);
  });
});

describe("cached domain activities take the same path", () => {
  it("normalizes what IndexedDB holds", () => {
    const result = normalizeActivities(CACHED_DOMAIN);
    expect(result.map((a) => a.id)).toEqual(["1001", "1002", "1003"]);
    expect(result.map((a) => a.sport)).toEqual(["run", "ride", "swim"]);
    expect(result.map((a) => a.distanceKm)).toEqual([10.5, 45, 1.5]);
    expect(result.map((a) => a.movingTimeSec)).toEqual([3600, 5400, 2400]);
  });
});

describe("normalizeActivities", () => {
  it("skips records with an unparseable date", () => {
    expect(normalizeActivities([mkActivity({ id: "1", startDateLocal: "not-a-date" })])).toEqual([]);
  });

  it("forces swim elevation to zero even when the payload carries one", () => {
    const out = normalizeActivities([mkActivity({ id: "1", sport: "swim", elevationM: 42 })]);
    expect(out[0].elevationM).toBe(0);
  });

  it("drops commutes when includeCommute is false", () => {
    const input = [
      mkActivity({ id: "1", sport: "ride", startDateLocal: "2025-05-01T10:00:00", isCommute: true }),
      mkActivity({ id: "2", sport: "ride", startDateLocal: "2025-05-02T10:00:00" }),
    ];
    expect(normalizeActivities(input, { includeCommute: false }).map((a) => a.id)).toEqual(["2"]);
    expect(normalizeActivities(input).map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("carries the commute and indoor flags through", () => {
    const out = normalizeActivities([mkActivity({ id: "1", isCommute: true, isIndoor: true })]);
    expect(out[0]).toMatchObject({ isCommute: true, isIndoor: true });
  });
});
