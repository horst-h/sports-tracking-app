import { describe, it, expect } from "vitest";

import { aggregateYear } from "./aggregate";
import { buildUiAthleteStats } from "./uiStats";
import { buildMonthlySeries, buildMonthlyTotalSeries } from "./monthly";
import { calculateGoalStatus } from "./goalStatus";
import { calcYearSportStats } from "../statsCalculator";
import { NORMALIZED, AS_OF, RETRIEVED_AT, YEAR, mkActivity } from "../../test/fixtures";

/**
 * GOLDEN MASTER — the calculation core.
 *
 * These values were recorded from the pipeline as it behaved before the
 * provider refactoring. They are the contract behind "the business logic
 * stays unchanged": swapping Strava for Runalyze must not move a single
 * number here.
 *
 * Input is NormalizedActivity[] on purpose — it enters below the mapping
 * layer, so these assertions stay meaningful no matter how many providers
 * get added above.
 *
 * If one of these fails, the calculation changed. That is a finding, never
 * something to re-record away.
 */

const runAgg = aggregateYear(NORMALIZED, YEAR, "run", AS_OF);
const rideAgg = aggregateYear(NORMALIZED, YEAR, "ride", AS_OF);
const swimAgg = aggregateYear(NORMALIZED, YEAR, "swim", AS_OF);

describe("aggregateYear", () => {
  it("totals per sport", () => {
    expect(runAgg.totals).toEqual({
      count: 7,
      distanceKm: 77.6,
      elevationM: 770,
      movingTimeHours: 7.333333333333332,
    });
    expect(rideAgg.totals).toEqual({
      count: 3,
      distanceKm: 155.5,
      elevationM: 2000,
      movingTimeHours: 5.5,
    });
    expect(swimAgg.totals).toEqual({
      count: 1,
      distanceKm: 1.5,
      elevationM: 0,
      movingTimeHours: 0.6666666666666666,
    });
  });

  it("excludes other years", () => {
    // The fixture holds a 2024-12-31 run that must not leak into 2025.
    expect(runAgg.totals.count).toBe(7);
    expect(aggregateYear(NORMALIZED, 2024, "run", AS_OF).totals).toEqual({
      count: 1,
      distanceKm: 7,
      elevationM: 50,
      movingTimeHours: 0.5833333333333334,
    });
  });

  it("month buckets are 1-indexed with a unused slot 0", () => {
    expect(runAgg.byMonth.count.months).toEqual([0, 1, 1, 1, 0, 0, 0, 1, 2, 0, 0, 0, 1]);
    expect(runAgg.byMonth.distanceKm.months).toEqual([0, 10.5, 21.1, 5, 0, 0, 0, 15, 20, 0, 0, 0, 6]);
    expect(runAgg.byMonth.elevationM.months).toEqual([0, 120, 250, 30, 0, 0, 0, 180, 150, 0, 0, 0, 40]);
    expect(rideAgg.byMonth.distanceKm.months).toEqual([0, 0, 0, 0, 45, 0, 80.5, 0, 30, 0, 0, 0, 0]);
  });

  it("rolling windows are relative to asOfDateLocal and ignore the future", () => {
    expect(runAgg.rolling.last7).toEqual({
      count: 1,
      distanceKm: 8,
      elevationM: 60,
      movingTimeHours: 0.75,
    });
    expect(runAgg.rolling.last28).toEqual({
      count: 3,
      distanceKm: 35,
      elevationM: 330,
      movingTimeHours: 3.361111111111111,
    });
    expect(rideAgg.rolling.last7).toEqual({
      count: 1,
      distanceKm: 30,
      elevationM: 300,
      movingTimeHours: 1,
    });
  });

  it("lastActivityDateLocal is the last entry in input order, not the newest before asOf", () => {
    // Documented as-is: the December entry lies after asOf but still wins.
    expect(runAgg.lastActivityDateLocal).toBe("2025-12-31T23:30:00");
    expect(rideAgg.lastActivityDateLocal).toBe("2025-08-14T17:00:00");
  });
});

describe("buildUiAthleteStats — ytd mode", () => {
  const ui = buildUiAthleteStats({
    aggregate: runAgg,
    asOfDateLocal: AS_OF,
    retrievedAtLocal: RETRIEVED_AT,
    goals: { distanceKm: 1200, count: 100, elevationM: 8000 },
    mode: "ytd",
  });

  it("time frame", () => {
    expect(ui.weeksLeftDisplay).toBe(20);
    expect(ui.weeksLeftExact).toBe(19.79);
    expect(ui.weeksElapsed).toBe(32.49);
    expect(ui.avgDistPerRunKm).toBe(11.09);
    expect(ui.sport).toBe("run");
    expect(ui.mode).toBe("ytd");
  });

  it("distance progress", () => {
    expect(ui.progress.distanceKm).toEqual({
      metric: "distanceKm",
      ytd: 77.6,
      avgPerWeek: 2.4,
      forecast: 124.87,
      goal: 1200,
      toVictory: 1122.4,
      reachable: false,
      reachedInWeeks: 469.99,
      reachedOnLocal: "Thu Aug 17 2034",
    });
  });

  it("count progress rounds to whole activities", () => {
    expect(ui.progress.count).toEqual({
      metric: "count",
      ytd: 7,
      avgPerWeek: 0.22,
      forecast: 11,
      goal: 100,
      toVictory: 93,
      reachable: false,
      reachedInWeeks: 431.71,
      reachedOnLocal: "Tue Nov 22 2033",
    });
  });

  it("elevation progress", () => {
    expect(ui.progress.elevationM).toEqual({
      metric: "elevationM",
      ytd: 770,
      avgPerWeek: 23.7,
      forecast: 1239,
      goal: 8000,
      toVictory: 7230,
      reachable: false,
      reachedInWeeks: 305.11,
      reachedOnLocal: "Fri Jun 20 2031",
    });
  });
});

describe("buildUiAthleteStats — rolling28 mode without goals", () => {
  const ui = buildUiAthleteStats({
    aggregate: rideAgg,
    asOfDateLocal: AS_OF,
    retrievedAtLocal: RETRIEVED_AT,
    mode: "rolling28",
  });

  it("derives the weekly rate from the 28 day window", () => {
    expect(ui.progress.distanceKm).toEqual({
      metric: "distanceKm",
      ytd: 155.5,
      avgPerWeek: 7.5,
      forecast: 303.94,
      goal: undefined,
      toVictory: undefined,
      reachable: undefined,
      reachedInWeeks: undefined,
      reachedOnLocal: undefined,
    });
    expect(ui.progress.count.forecast).toBe(8);
    expect(ui.progress.elevationM.forecast).toBe(3484.37);
  });
});

describe("buildUiAthleteStats — blend mode", () => {
  const ui = buildUiAthleteStats({
    aggregate: runAgg,
    asOfDateLocal: AS_OF,
    retrievedAtLocal: RETRIEVED_AT,
    goals: { distanceKm: 1200 },
    mode: "blend",
  });

  it("weights rolling at 0.6 by default", () => {
    expect(ui.progress.distanceKm.avgPerWeek).toBe(6.2);
    expect(ui.progress.distanceKm.forecast).toBe(200.41);
    expect(ui.progress.distanceKm.reachedInWeeks).toBe(180.88);
    expect(ui.progress.count.avgPerWeek).toBe(0.54);
    expect(ui.progress.elevationM.avgPerWeek).toBe(59);
  });

  it("leaves goal fields undefined where no goal was given", () => {
    expect(ui.progress.count.goal).toBeUndefined();
    expect(ui.progress.elevationM.toVictory).toBeUndefined();
  });
});

describe("buildMonthlySeries", () => {
  it("distance per month", () => {
    expect(buildMonthlySeries({ activities: NORMALIZED, metric: "distance", year: YEAR })).toEqual([
      { month: "Jan", running: 10.5, cycling: 0, total: 10.5 },
      { month: "Feb", running: 21.1, cycling: 0, total: 21.1 },
      { month: "Mar", running: 5, cycling: 0, total: 5 },
      { month: "Apr", running: 0, cycling: 45, total: 45 },
      // Swim lands in `cycling` — see the sport-bucketing test below.
      { month: "May", running: 0, cycling: 1.5, total: 1.5 },
      { month: "Jun", running: 0, cycling: 80.5, total: 80.5 },
      { month: "Jul", running: 15, cycling: 0, total: 15 },
      { month: "Aug", running: 20, cycling: 30, total: 50 },
      { month: "Sep", running: 0, cycling: 0, total: 0 },
      { month: "Oct", running: 0, cycling: 0, total: 0 },
      { month: "Nov", running: 0, cycling: 0, total: 0 },
      { month: "Dec", running: 6, cycling: 0, total: 6 },
    ]);
  });

  it("counts per month", () => {
    const s = buildMonthlySeries({ activities: NORMALIZED, metric: "count", year: YEAR });
    expect(s.map((x) => x.total)).toEqual([1, 1, 1, 1, 1, 1, 1, 3, 0, 0, 0, 1]);
    expect(s[7]).toEqual({ month: "Aug", running: 2, cycling: 1, total: 3 });
  });

  it("PRE-EXISTING DEFECT: swim is bucketed as cycling", () => {
    // monthly.ts only special-cases "run"; everything else falls into
    // `cycling`. Locked in deliberately so the refactoring does not silently
    // change history charts. Fixing it is a separate, user-visible decision.
    const s = buildMonthlySeries({ activities: NORMALIZED, metric: "count", year: YEAR });
    expect(s[4]).toEqual({ month: "May", running: 0, cycling: 1, total: 1 });
  });

  it("total series ignores the sport split", () => {
    const s = buildMonthlyTotalSeries({ activities: NORMALIZED, metric: "distance", year: YEAR });
    expect(s.map((x) => x.value)).toEqual([10.5, 21.1, 5, 45, 1.5, 80.5, 15, 50, 0, 0, 0, 6]);
  });
});

describe("calculateGoalStatus", () => {
  it("classifies by current vs required rate", () => {
    expect(calculateGoalStatus(10, 0)).toBe("on-track");
    expect(calculateGoalStatus(0, 10)).toBe("off-track");
    expect(calculateGoalStatus(10, 10)).toBe("on-track");
    expect(calculateGoalStatus(11, 10)).toBe("on-track");
    expect(calculateGoalStatus(10, 11)).toBe("catch-up");
    expect(calculateGoalStatus(10, 12)).toBe("catch-up");
    expect(calculateGoalStatus(10, 12.1)).toBe("off-track");
  });

  it("treats non-finite input as zero", () => {
    expect(calculateGoalStatus(NaN, 10)).toBe("off-track");
    // A non-finite requirement collapses to 0, and a requirement of 0 is
    // reported as reached. Surprising in isolation, but it keeps an
    // unset goal from rendering as failure.
    expect(calculateGoalStatus(10, Infinity)).toBe("on-track");
    expect(calculateGoalStatus(10, NaN)).toBe("on-track");
  });
});

describe("calcYearSportStats", () => {
  it("sums the domain activity shape directly", () => {
    const activities = [
      mkActivity({ id: "1", sport: "run", startDateLocal: "2025-03-01T10:00:00", distanceKm: 10, elevationM: 100 }),
      mkActivity({ id: "2", sport: "run", startDateLocal: "2025-04-01T10:00:00", distanceKm: 5.5, elevationM: 40 }),
      mkActivity({ id: "3", sport: "ride", startDateLocal: "2025-04-01T10:00:00", distanceKm: 30, elevationM: 300 }),
      mkActivity({ id: "4", sport: "run", startDateLocal: "2024-04-01T10:00:00", distanceKm: 99, elevationM: 999 }),
    ];
    expect(calcYearSportStats(2025, "run", activities)).toEqual({
      year: 2025,
      sport: "run",
      count: 2,
      distanceKm: 15.5,
      elevationM: 140,
    });
    expect(calcYearSportStats(2025, "ride", activities)).toEqual({
      year: 2025,
      sport: "ride",
      count: 1,
      distanceKm: 30,
      elevationM: 300,
    });
  });
});
