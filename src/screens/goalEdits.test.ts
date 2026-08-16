import { describe, expect, it } from "vitest";
import { applyGoalEdits, NO_GOAL_EDITS, withGoalEdit } from "./goalEdits";
import type { YearGoals } from "../domain/metrics/types";

/**
 * Filling in two fields in a row used to keep only the second one.
 *
 * The screen merged the edits for display but built every save from the goals
 * as they were loaded, so each save carried one metric and dropped the rest.
 * On screen it looked right; the dashboard, which reads what was actually
 * stored, showed only the last number entered.
 */

const YEAR = 2026;

function goalsFor(perSport: Record<string, Record<string, number>>): YearGoals {
  return { year: YEAR, perSport: { run: {}, ride: {}, swim: {}, ...perSport } } as YearGoals;
}

describe("applyGoalEdits", () => {
  it("keeps every field entered in a row, not just the last", () => {
    let edits = NO_GOAL_EDITS;

    edits = withGoalEdit(edits, "run", "distanceKm", 1103);
    edits = withGoalEdit(edits, "run", "count", 111);
    edits = withGoalEdit(edits, "run", "elevationM", 10000);

    expect(applyGoalEdits(null, edits, YEAR).perSport.run).toEqual({
      distanceKm: 1103,
      count: 111,
      elevationM: 10000,
    });
  });

  it("keeps edits to a sport made before switching tabs", () => {
    // Saving writes the whole year, and saveGoals pushes any sport that differs
    // from the cache — so a sport left at its loaded value undoes its own edit.
    let edits = withGoalEdit(NO_GOAL_EDITS, "run", "distanceKm", 1103);
    edits = withGoalEdit(edits, "ride", "distanceKm", 1500);

    const merged = applyGoalEdits(null, edits, YEAR);

    expect(merged.perSport.run).toEqual({ distanceKm: 1103 });
    expect(merged.perSport.ride).toEqual({ distanceKm: 1500 });
  });

  it("layers edits over the goals that were loaded", () => {
    const loaded = goalsFor({ run: { distanceKm: 1000, count: 100 } });
    const edits = withGoalEdit(NO_GOAL_EDITS, "run", "count", 111);

    expect(applyGoalEdits(loaded, edits, YEAR).perSport.run).toEqual({
      distanceKm: 1000,
      count: 111,
    });
  });

  it("lets a cleared field stay cleared", () => {
    // The other half of the same bug: clearing used to delete the edit rather
    // than record it, so the merge fell back to the loaded value and the number
    // the athlete had just removed came straight back.
    const loaded = goalsFor({ run: { distanceKm: 1000, count: 100 } });
    const edits = withGoalEdit(NO_GOAL_EDITS, "run", "distanceKm", undefined);

    const run = applyGoalEdits(loaded, edits, YEAR).perSport.run;

    expect(run).toEqual({ count: 100 });
    expect("distanceKm" in run).toBe(false);
  });

  it("leaves sports nobody touched exactly as they were", () => {
    const loaded = goalsFor({ run: { distanceKm: 1000 }, swim: { count: 60 } });
    const edits = withGoalEdit(NO_GOAL_EDITS, "run", "distanceKm", 1103);

    expect(applyGoalEdits(loaded, edits, YEAR).perSport.swim).toEqual({ count: 60 });
  });

  it("stamps the year it was asked for", () => {
    expect(applyGoalEdits(null, NO_GOAL_EDITS, YEAR)).toMatchObject({ year: YEAR });
  });

  it("does not mutate the goals it was given", () => {
    const loaded = goalsFor({ run: { distanceKm: 1000 } });
    const edits = withGoalEdit(NO_GOAL_EDITS, "run", "distanceKm", 1103);

    applyGoalEdits(loaded, edits, YEAR);

    expect(loaded.perSport.run).toEqual({ distanceKm: 1000 });
  });

  it("does not mutate the edits it was given", () => {
    const edits = withGoalEdit(NO_GOAL_EDITS, "run", "distanceKm", 1103);
    withGoalEdit(edits, "run", "count", 111);

    expect(edits.run).toEqual({ distanceKm: 1103 });
    expect(NO_GOAL_EDITS.run).toEqual({});
  });
});
