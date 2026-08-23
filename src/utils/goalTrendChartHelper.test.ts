import { describe, expect, it } from "vitest";
import { buildGoalTrendChartData, MIN_MONTH_PROGRESS_TO_PROJECT } from "./goalTrendChartHelper";

/**
 * The running month is not a bad month.
 *
 * Every month used to be judged against the whole month's requirement, the
 * current one included, so three weeks of work were held against a thirty-one
 * day standard and the month sat red for most of its length no matter how well
 * it was going.
 *
 * Extrapolating from the elapsed share fixes that and breaks in both directions
 * at the start of a month: nothing logged by the 2nd projects to a month of
 * nothing, and one long ride on the 2nd projects to fifteen of them. Hence a
 * floor, below which the month is shown and not judged.
 */

const YEAR = 2026;
/** 1200 a year is 100 a month, so the arithmetic stays readable. */
const GOAL = 1200;

function months(overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: 12 }, (_, i) => overrides[i] ?? 0);
}

function build(monthlyActuals: number[], today: Date) {
  return buildGoalTrendChartData({
    monthlyActuals,
    yearlyGoal: GOAL,
    selectedYear: YEAR,
    currentDate: today,
  });
}

describe("the running month", () => {
  it("rates the pace it is on, not the part of it that has happened", () => {
    // 23 of 31 days done, 80 of a required 100. Held against the full month
    // that is "below"; at this pace the month lands on 107.8, which is not.
    const data = build(months({ 7: 80 }), new Date(YEAR, 7, 23));
    const august = data[7];

    expect(august.isInProgress).toBe(true);
    expect(august.projectedMonthly).toBeCloseTo(80 / (23 / 31), 1);
    expect(august.performance).toBe("above");
  });

  it("still calls a genuinely weak month weak", () => {
    // The point is fairness, not flattery: 20 by the 23rd projects to 27.
    const data = build(months({ 7: 20 }), new Date(YEAR, 7, 23));

    expect(data[7].performance).toBe("below");
  });

  it("does not claim an empty first week means an empty month", () => {
    // The edge case that makes a naive projection worse than no projection:
    // 0 / 0.06 is 0, which would paint the month red on the 2nd.
    const data = build(months(), new Date(YEAR, 7, 2));
    const august = data[7];

    expect(august.monthlyActual).toBe(0);
    expect(august.projectedMonthly).toBeNull();
    expect(august.performance).toBeNull();
    expect(august.isInProgress).toBe(true);
  });

  it("does not turn one early session into a record month either", () => {
    // The same error mirrored: 60 on the 2nd extrapolates to 930.
    const data = build(months({ 7: 60 }), new Date(YEAR, 7, 2));

    expect(data[7].projectedMonthly).toBeNull();
    expect(data[7].performance).toBeNull();
  });

  it("starts rating once a quarter of the month is behind it", () => {
    const daysInAugust = 31;
    const firstRatedDay = Math.ceil(MIN_MONTH_PROGRESS_TO_PROJECT * daysInAugust);

    const dayBefore = build(months({ 7: 25 }), new Date(YEAR, 7, firstRatedDay - 1));
    const onTheDay = build(months({ 7: 25 }), new Date(YEAR, 7, firstRatedDay));

    expect(dayBefore[7].performance).toBeNull();
    expect(onTheDay[7].performance).not.toBeNull();
  });

  it("shows the month even while it is unrated, so it is not mistaken for absent", () => {
    const data = build(months({ 7: 5 }), new Date(YEAR, 7, 3));

    expect(data[7].monthlyActual).toBe(5);
    expect(data[7].barTop).toBe(5); // the bar is the actual; nothing extrapolated
    expect(data[8].monthlyActual).toBeNull(); // September has not started
  });

  it("stops extrapolating on the last day, where there is nothing left to guess", () => {
    const data = build(months({ 7: 100 }), new Date(YEAR, 7, 31));

    expect(data[7].monthProgress).toBe(1);
    expect(data[7].projectedMonthly).toBeCloseTo(100, 5);
  });

  it("leaves finished months exactly as they were", () => {
    const data = build(months({ 0: 100, 1: 40, 7: 80 }), new Date(YEAR, 7, 23));

    expect(data[0].isInProgress).toBe(false);
    expect(data[0].projectedMonthly).toBe(100);
    expect(data[0].performance).toBe("onTarget");
    expect(data[1].performance).toBe("below");
  });

  it("counts a part-month as a part-month in the running average", () => {
    // 100 in January and 50 in a 23/31-done August is not an average of 75 over
    // two whole months; 1.74 months have elapsed.
    const data = build(months({ 0: 100, 7: 50 }), new Date(YEAR, 7, 23));
    const monthsElapsed = 7 + 23 / 31;

    expect(data[0].actualAvgMonthly).toBeCloseTo(150 / monthsElapsed, 4);
  });

  it("treats a past year as entirely finished", () => {
    const data = build(months({ 0: 100, 11: 100 }), new Date(YEAR + 1, 2, 15));

    expect(data.every((m) => !m.isInProgress)).toBe(true);
    expect(data.every((m) => m.monthlyActual !== null)).toBe(true);
    expect(data[0].actualAvgMonthly).toBeCloseTo(200 / 12, 4);
  });

  it("handles a leap February without inventing a day", () => {
    const leap = buildGoalTrendChartData({
      monthlyActuals: months({ 1: 50 }),
      yearlyGoal: GOAL,
      selectedYear: 2028,
      currentDate: new Date(2028, 1, 29),
    });

    expect(leap[1].daysInMonth).toBe(29);
    expect(leap[1].monthProgress).toBe(1);
  });
});
