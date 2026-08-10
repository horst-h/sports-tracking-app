import { describe, it, expect } from "vitest";

import { toDomainActivity, toDomainActivities, SPORT_IDS, ELEVATION_FIELD } from "./runalyzeMapper";
import { toDomainActivities as stravaToDomainActivities } from "../strava/stravaMapper";
import { normalizeActivities } from "../../domain/metrics/normalize";
import type { NormalizedActivity } from "../../domain/metrics/types";
import { RUNALYZE_RAW, STRAVA_RAW } from "../../test/fixtures";

/**
 * Contract of the Runalyze mapping layer, the counterpart to
 * strava/mapping.characterization.test.ts.
 *
 * The last block is the one that matters for the migration: the same
 * activities, delivered in both providers' formats, have to arrive at the
 * calculation core as identical records.
 */
function pipeline(raw: typeof RUNALYZE_RAW): NormalizedActivity[] {
  const { activities } = toDomainActivities(raw);
  return normalizeActivities(activities);
}

describe("toDomainActivity", () => {
  it("maps the fields the calculation core consumes", () => {
    expect(toDomainActivity(RUNALYZE_RAW[0])).toEqual({
      id: "1001",
      provider: "runalyze",
      sport: "run",
      name: "Morning Run",
      startDateLocal: "2025-01-15T07:30:00",
      startDateUtc: "2025-01-15T06:30:00.000Z",
      distanceKm: 10.5,
      elevationM: 120,
      movingTimeSec: 3600,
      isCommute: false,
      isIndoor: false,
    });
  });

  it("reads distance as kilometres, without dividing by 1000", () => {
    // The single most damaging mistake available here: Strava sends metres,
    // Runalyze does not. A factor of 1000 would corrupt every goal and every
    // forecast in the app rather than break anything visibly.
    expect(toDomainActivity({ ...RUNALYZE_RAW[0], distance: 10.5 })?.distanceKm).toBe(10.5);
    expect(toDomainActivity({ ...RUNALYZE_RAW[0], distance: 21.0975 })?.distanceKm).toBe(21.1);
  });

  it("defaults distance and duration to zero when absent", () => {
    const { distance: _d, duration: _t, ...bare } = RUNALYZE_RAW[0];
    expect(toDomainActivity(bare)).toMatchObject({ distanceKm: 0, movingTimeSec: 0 });
  });

  it("takes duration, not elapsed_time, as moving time", () => {
    // duration is the active time, the counterpart to Strava's moving_time.
    // elapsed_time includes pauses and would inflate every pace figure.
    expect(toDomainActivity(RUNALYZE_RAW[0])?.movingTimeSec).toBe(3600);
    expect(RUNALYZE_RAW[0].elapsed_time).toBe(3700);
  });

  it("splits the self-describing timestamp into wall clock and instant", () => {
    const a = toDomainActivity(RUNALYZE_RAW[0]);
    // date_time is "2025-01-15T07:30:00+01:00": the prefix is the local time
    // the athlete ran at, the instant is one hour earlier in UTC.
    expect(a?.startDateLocal).toBe("2025-01-15T07:30:00");
    expect(a?.startDateLocal).not.toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
    expect(a?.startDateUtc).toBe("2025-01-15T06:30:00.000Z");
  });

  it("handles a summer offset as well as a winter one", () => {
    const a = toDomainActivity(RUNALYZE_RAW[1]);
    expect(a?.startDateLocal).toBe("2025-04-05T14:00:00");
    expect(a?.startDateUtc).toBe("2025-04-05T12:00:00.000Z");
  });

  it("falls back to timezone_offset when the suffix is missing", () => {
    // Never triggers on current data. It exists so a format change shows up as
    // a slightly different time instead of an Invalid Date reaching the year
    // buckets — and it must not depend on the viewer's own timezone.
    const a = toDomainActivity({
      ...RUNALYZE_RAW[0],
      date_time: "2025-01-15T06:30:00",
      timezone_offset: 60,
    });
    expect(a?.startDateUtc).toBe("2025-01-15T06:30:00.000Z");
    expect(a?.startDateLocal).toBe("2025-01-15T07:30:00");
  });

  it("treats a missing timezone_offset in that fallback as UTC", () => {
    const { timezone_offset: _omitted, ...noOffset } = RUNALYZE_RAW[0];
    const a = toDomainActivity({ ...noOffset, date_time: "2025-01-15T06:30:00" });
    expect(a?.startDateLocal).toBe("2025-01-15T06:30:00");
  });

  it("drops activities whose timestamp cannot be used at all", () => {
    expect(toDomainActivity({ ...RUNALYZE_RAW[0], date_time: "not-a-date" })).toBeNull();
    const { date_time: _omitted, ...noDate } = RUNALYZE_RAW[0];
    expect(toDomainActivity(noDate)).toBeNull();
  });

  it("counts Gravel Cycling as riding", () => {
    // A product decision, and the one place the Runalyze mapping deliberately
    // differs from the Strava one: Runalyze models gravel as its own sport
    // where Strava folded comparable rides into "Ride". In 2026 that is 212 km
    // of gravel against 88 km of Radfahren.
    expect(toDomainActivity(RUNALYZE_RAW[2])?.sport).toBe("ride");
    expect(SPORT_IDS[2312733]).toBe("ride");
  });

  it("skips sports the app does not track", () => {
    expect(toDomainActivity(RUNALYZE_RAW[3])).toBeNull(); // Hiking
    expect(SPORT_IDS[2312737]).toBeUndefined(); // Tennis
    expect(SPORT_IDS[2312739]).toBeUndefined(); // Yoga
  });

  it("skips an unknown sport id rather than guessing from the name", () => {
    // Sport ids are per account. Another account's "Laufen" carries a
    // different number, and guessing from the label would silently attribute
    // activities to the wrong sport.
    expect(toDomainActivity({ ...RUNALYZE_RAW[0], sport: { id: 999, name: "Laufen" }, sport_id: 999 })).toBeNull();
  });

  it("falls back to sport_id when the nested sport object is absent", () => {
    const { sport: _omitted, ...flat } = RUNALYZE_RAW[0];
    expect(toDomainActivity(flat)?.sport).toBe("run");
  });

  it("reads the elevation column the migration settled on", () => {
    // Runalyze carries two, and they disagree substantially. Which one keeps
    // the history continuous with the Strava values is decided by the parity
    // check; this test pins whatever ELEVATION_FIELD currently says so the
    // choice cannot drift unnoticed.
    const a = toDomainActivity(RUNALYZE_RAW[0]);
    expect(ELEVATION_FIELD).toBe("elevation_up");
    expect(a?.elevationM).toBe(RUNALYZE_RAW[0][ELEVATION_FIELD]);
    expect(a?.elevationM).toBe(120);
    expect(RUNALYZE_RAW[0].elevation_up_file).toBe(180);
  });

  it("rounds elevation to whole metres", () => {
    expect(toDomainActivity({ ...RUNALYZE_RAW[0], elevation_up: 120.6 })?.elevationM).toBe(121);
  });

  it("reports commute and indoor as false, since Runalyze has neither flag", () => {
    const a = toDomainActivity(RUNALYZE_RAW[0]);
    expect(a?.isCommute).toBe(false);
    expect(a?.isIndoor).toBe(false);
  });
});

describe("toDomainActivities", () => {
  it("reports what it skipped instead of dropping it silently", () => {
    const { activities, skipped } = toDomainActivities(RUNALYZE_RAW);
    expect(activities).toHaveLength(5);
    expect(skipped).toEqual([{ id: "1004", sport: "Hiking", reason: "untracked-sport" }]);
  });

  it("tells an untracked sport apart from a broken timestamp", () => {
    const { skipped } = toDomainActivities([{ ...RUNALYZE_RAW[0], date_time: "not-a-date" }]);
    expect(skipped).toEqual([{ id: "1001", sport: "Laufen", reason: "unusable-timestamp" }]);
  });

  it("passes suspected duplicates through", () => {
    // The spike found two groups with the same day, sport and distance —
    // probably one Garmin session imported twice. They are kept: a visible
    // double count is a better failure than records vanishing, and which copy
    // is real needs the comparison against the Strava history.
    const twin = { ...RUNALYZE_RAW[0], id: 9001 };
    const { activities } = toDomainActivities([RUNALYZE_RAW[0], twin]);
    expect(activities.map((a) => a.id)).toEqual(["1001", "9001"]);
  });
});

describe("full pipeline: Runalyze payload -> NormalizedActivity", () => {
  const result = pipeline(RUNALYZE_RAW);

  it("keeps only tracked sports and sorts ascending by local start time", () => {
    expect(result.map((a) => a.id)).toEqual(["1006", "1005", "1001", "1002", "1007"]);
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
      id: "1007",
      sport: "ride",
      month: 6,
      dayOfYear: 163,
      distanceKm: 80.5,
      elevationM: 1200,
      movingTimeSec: 10800,
    });
  });

  it("a run recorded just after midnight lands in the correct year", () => {
    // Activity 1006 happened at 00:30 local on 1 January; the UTC instant is
    // still 31 December. It belongs to 2025.
    expect(result[0].id).toBe("1006");
    expect(result[0].startDateLocal).toBe("2025-01-01T00:30:00");
    expect(result[0].year).toBe(2025);
    expect(result[0].month).toBe(1);
    expect(result[0].dayOfYear).toBe(1);
  });
});

describe("both providers agree on the activities they share", () => {
  // The migration check: STRAVA_RAW and RUNALYZE_RAW describe the same
  // sessions in each provider's own format. Wherever both know an activity,
  // the calculation core must not be able to tell which source it came from.
  const SHARED_IDS = ["1001", "1002", "1005", "1006"];

  const fromStrava = stravaToDomainActivities(STRAVA_RAW).activities;
  const fromRunalyze = toDomainActivities(RUNALYZE_RAW).activities;

  const only = (list: typeof fromStrava) =>
    list
      .filter((a) => SHARED_IDS.includes(a.id))
      .sort((a, b) => a.id.localeCompare(b.id));

  it("maps to the same domain activities apart from the provider tag", () => {
    const strip = (list: typeof fromStrava) =>
      only(list).map(({ provider: _p, startDateUtc, ...rest }) => ({
        ...rest,
        // Strava sends "2025-01-15T06:30:00Z", Date#toISOString adds the
        // milliseconds. Same instant, different spelling.
        startDateUtc: new Date(startDateUtc).toISOString(),
      }));

    expect(strip(fromRunalyze)).toEqual(strip(fromStrava));
  });

  it("normalizes to identical records, which is what the goals are built from", () => {
    expect(normalizeActivities(only(fromRunalyze))).toEqual(
      normalizeActivities(only(fromStrava))
    );
  });
});
