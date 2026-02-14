import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats } from "../domain/metrics/uiStats";
import type { ForecastMode, UiAthleteStats } from "../domain/metrics/uiStats";
import type { YearGoals } from "../domain/metrics/types";
import { loadGoals } from "../repositories/goalsRepository";

function toStravaLike(a: any) {
  if (!a || typeof a !== "object") return a;

  // Already Strava-like
  if (
    typeof a.type === "string" &&
    typeof a.start_date_local === "string" &&
    typeof a.distance === "number"
  ) {
    return a;
  }

  // Domain-like (your cached activities)
  if (
    (a.sport === "run" || a.sport === "ride") &&
    typeof a.startDate === "string" &&
    typeof a.distanceKm === "number"
  ) {
    return {
      id: a.id,
      type: a.sport === "run" ? "Run" : "Ride",
      start_date_local: a.startDate,
      distance: a.distanceKm * 1000, // meters
      total_elevation_gain: Number(a.elevationM ?? 0),
      moving_time: Number(a.movingTimeSec ?? 0),
      name: a.name,
    };
  }

  // fallback
  return a;
}


// StravaActivity shape is compatible enough for normalization in your domain.
// We keep this intentionally loose so we can pass StravaActivity[] directly.
export type ActivityInput = any;

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
  activities: ActivityInput[];
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

  const stravaLike = activities.map(toStravaLike);
  const normalized = normalizeActivities(stravaLike as any);

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
  activities: ActivityInput[];
  mode?: ForecastMode;
  blendWeightRolling?: number;
}): Promise<YearDashboard> {
  return buildYearDashboard({
    ...params,
    asOfDateLocal: nowIso(),
    retrievedAtLocal: nowLocalString(),
  });
}
