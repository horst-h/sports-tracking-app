import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats } from "../domain/metrics/uiStats";
import type { ForecastMode, UiAthleteStats } from "../domain/metrics/uiStats";
import type { YearGoals } from "../domain/metrics/types";
import { loadGoals } from "../repositories/goalsRepository";
import type { Activity } from "../domain/activity";

export type YearDashboard = {
  year: number;
  mode: ForecastMode;
  asOfDateLocal: string;
  retrievedAtLocal: string;

  goals: YearGoals | null;

  run: UiAthleteStats;
  ride: UiAthleteStats;
};

function nowIso() {
  return new Date().toISOString();
}
function nowLocalString() {
  return new Date().toString();
}

export async function buildYearDashboard(params: {
  year: number;
  activities: Activity[];
  mode?: ForecastMode;
  blendWeightRolling?: number;
  asOfDateLocal?: string; // defaults to now ISO
  retrievedAtLocal?: string; // defaults to now local string
}): Promise<YearDashboard> {
  const {
    year,
    activities,
    mode = "ytd",
    blendWeightRolling,
    asOfDateLocal = nowIso(),
    retrievedAtLocal = nowLocalString(),
  } = params;

  // 1) Load goals (optional)
  const goals = await loadGoals(year);

  const normalized = normalizeActivities(activities);

  // 3) Aggregate per sport
  const runAgg = aggregateYear(normalized, year, "run", asOfDateLocal);
  const rideAgg = aggregateYear(normalized, year, "ride", asOfDateLocal);

  // 4) Build UI-ready stats
const run = buildUiAthleteStats({
  aggregate: runAgg,
  asOfDateLocal,
  retrievedAtLocal,
  goals: goals?.perSport?.run,
  mode,
  blendWeightRolling,
});

const ride = buildUiAthleteStats({
  aggregate: rideAgg,
  asOfDateLocal,
  retrievedAtLocal,
  goals: goals?.perSport?.ride,
  mode,
  blendWeightRolling,
});

  return {
    year,
    mode,
    asOfDateLocal,
    retrievedAtLocal,
    goals,
    run,
    ride,
  };
}

/**
 * Convenience wrapper if you want "now" defaults without passing timestamps.
 */
export async function buildYearDashboardNow(params: {
  year: number;
  activities: Activity[];
  mode?: ForecastMode;
  blendWeightRolling?: number;
}): Promise<YearDashboard> {
  return buildYearDashboard({
    ...params,
    asOfDateLocal: nowIso(),
    retrievedAtLocal: nowLocalString(),
  });
}
