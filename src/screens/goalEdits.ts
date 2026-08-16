import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";

/**
 * The edits made on the goals screen, before anything reloads.
 *
 * The screen needs this because the goals it was handed do not change when it
 * saves: the hook loads them once, and there is no round trip that brings the
 * new value back. So the edits are held here and merged on top.
 *
 * A metric set to `undefined` is a metric the athlete cleared. That has to be
 * recorded rather than dropped from the map — dropping it means the merge falls
 * back to the loaded value and the number the athlete just deleted reappears.
 */
export type GoalEdits = Record<Sport, Partial<Record<GoalMetric, number | undefined>>>;

const SPORTS: Sport[] = ["run", "ride", "swim"];

export const NO_GOAL_EDITS: GoalEdits = { run: {}, ride: {}, swim: {} };

export function emptyYearGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {}, swim: {} } };
}

/**
 * The goals as they stand right now: what was loaded, with the edits on top.
 *
 * Every sport is merged, not only the one on screen. Saving writes the whole
 * year, and `saveGoals` compares each sport against the cache to decide what to
 * push — so a sport left at its loaded value would be pushed as a change and
 * undo an edit made under a different tab a moment earlier.
 *
 * This is what the previous version got wrong by merging for display only: each
 * save rebuilt the payload from the originally loaded goals plus the single
 * metric being written, so entering distance and then count stored only the
 * count. The screen looked right — it was reading the merged view — while the
 * cache behind it held one value.
 */
export function applyGoalEdits(
  goals: YearGoals | null,
  edits: GoalEdits,
  year: number
): YearGoals {
  const base = goals ?? emptyYearGoals(year);
  const perSport = { ...base.perSport };

  for (const sport of SPORTS) {
    const merged = { ...(base.perSport?.[sport] ?? {}), ...edits[sport] };

    // `undefined` reads as "no goal" everywhere downstream, but leaving the key
    // in place would still travel into IndexedDB and the request body.
    for (const metric of Object.keys(merged) as GoalMetric[]) {
      if (merged[metric] === undefined) delete merged[metric];
    }

    perSport[sport] = merged;
  }

  return { ...base, year, perSport };
}

/** Records one field's new value, `undefined` included. */
export function withGoalEdit(
  edits: GoalEdits,
  sport: Sport,
  metric: GoalMetric,
  value: number | undefined
): GoalEdits {
  return { ...edits, [sport]: { ...edits[sport], [metric]: value } };
}
