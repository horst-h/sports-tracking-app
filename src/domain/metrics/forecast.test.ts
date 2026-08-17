import { describe, expect, it } from "vitest";
import { calculateForecast } from "./forecast";
import { calculateGoalStatus } from "./goalStatus";

/**
 * One card used to tell three stories at once.
 *
 * A screenshot from 2026-08-17 read "On Track", "EoY forecast 10100 m" and
 * "goal reached Wed Jan 13 2027" side by side, with "-7.8 days ahead" under the
 * pill. Every figure was correct on its own terms; two of them ran on the last
 * thirty days and two on the year's average, and nothing tied them together.
 *
 * The reconstruction below is that exact card.
 */

const YEAR = 2026;
const TODAY = new Date(2026, 7, 17); // 17 August, day 229 of 365
const GOAL = 10000;
const CURRENT = 6061;

/** Even progress, so the last 30 days match the year's pace — the disagreement
 *  under test is between models, not between a good month and a bad one. */
function evenSeries(total: number, upToDay: number) {
  const perDay = total / upToDay;
  return Array.from({ length: upToDay }, (_, i) => {
    const date = new Date(YEAR, 0, i + 1);
    return { date: date.toISOString().split("T")[0], value: perDay };
  });
}

describe("calculateForecast", () => {
  it("projects from the year's average, not the last thirty days", () => {
    // 6061 m over 229 days = 26.47 m/day = 185 m/week.
    const f = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
    });

    expect(f.trendPerWeek).toBeCloseTo(185.3, 0);
    // 6061 + 26.47 × 136 remaining days. Not the 10100 the card used to claim.
    expect(f.forecastEOY).toBeCloseTo(9661, -2);
    expect(f.forecastEOY).toBeLessThan(GOAL);
  });

  it("reports the shortfall against the ideal line", () => {
    const f = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
    });

    // 10000 × 229/365 = 6274 expected, 6061 actual.
    expect(f.expectedToday).toBeCloseTo(6274, 0);
    expect(f.daysAhead).toBeCloseTo(-7.8, 1);
    expect(f.label).toBe("8 days behind");
  });

  it("does not call a goal on track when it lands after the year", () => {
    // The heart of it: at this pace the goal arrives in January, so nothing on
    // the card may say otherwise.
    const f = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
    });

    expect(calculateGoalStatus(f.trendPerWeek, f.requiredPerWeek)).not.toBe("on-track");
    expect(f.requiredPerWeek).toBeGreaterThan(f.trendPerWeek);
  });

  it("keeps the status and the days-ahead delta in agreement, always", () => {
    // Both now derive from the year's average, which makes them the same
    // statement: c/d ≥ (G−c)/(L−d) ⟺ c ≥ G·(d/L). They cannot disagree, and
    // this is the property that stops the contradiction coming back.
    for (const current of [0, 500, 3000, 6061, 6274, 7000, 9500, 12000]) {
      const f = calculateForecast({
        goalValue: GOAL,
        currentValue: current,
        year: YEAR,
        today: TODAY,
      });
      const onTrack = calculateGoalStatus(f.trendPerWeek, f.requiredPerWeek) === "on-track";

      expect(onTrack).toBe(f.daysAhead >= 0);
    }
  });

  it("averages per activity over the year rather than a 30-day window", () => {
    const f = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
      dailySeries: evenSeries(CURRENT, 229),
      activityCountByDay: evenSeries(74, 229),
    });

    expect(f.perUnit).toBeCloseTo(CURRENT / 74, 1);
  });

  it("is unmoved by a recent surge, which is what a year average is for", () => {
    // The deliberate cost of the choice: a strong finish barely lifts the
    // projection. Stated here so the trade-off is a decision on record and not
    // a surprise.
    const steady = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
      dailySeries: evenSeries(CURRENT, 229),
    });

    const surge = [
      ...evenSeries(CURRENT - 2000, 199),
      ...Array.from({ length: 30 }, (_, i) => ({
        date: new Date(YEAR, 0, 200 + i).toISOString().split("T")[0],
        value: 2000 / 30,
      })),
    ];
    const surged = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: TODAY,
      dailySeries: surge,
    });

    expect(surged.trendPerWeek).toBeCloseTo(steady.trendPerWeek, 5);
  });

  it("counts the same day of the year at midnight as at midday", () => {
    // Berlin is an hour further from 1 January in August than whole days
    // account for, so subtracting timestamps and flooring lost a day until
    // 01:00 — the ideal line, the shortfall and the required pace all shifted
    // for anyone who opened the app early. The suite runs in Europe/Berlin,
    // which is why this reproduces at all.
    const atMidnight = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: new Date(YEAR, 7, 17, 0, 30),
    });
    const atMidday = calculateForecast({
      goalValue: GOAL,
      currentValue: CURRENT,
      year: YEAR,
      today: new Date(YEAR, 7, 17, 12, 30),
    });

    expect(atMidnight.expectedToday).toBe(atMidday.expectedToday);
    expect(atMidnight.daysAhead).toBe(atMidday.daysAhead);
  });

  it("survives the first day of the year without dividing by zero", () => {
    const f = calculateForecast({
      goalValue: GOAL,
      currentValue: 0,
      year: YEAR,
      today: new Date(YEAR, 0, 1),
    });

    expect(Number.isFinite(f.trendPerWeek)).toBe(true);
    expect(Number.isFinite(f.forecastEOY)).toBe(true);
    expect(Number.isFinite(f.requiredPerWeek)).toBe(true);
  });
});
