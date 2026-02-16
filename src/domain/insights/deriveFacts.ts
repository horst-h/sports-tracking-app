import type { UiAthleteStats } from "../metrics/uiStats";
import type { Sport, GoalMetric } from "../metrics/types";
import type { MetricFacts } from "./narrative";

/**
 * Derive metric facts from uiStats and goals
 * Returns null if no goal or incomplete data
 */
export function deriveMetricFacts(
  sport: Sport,
  metric: "distance" | "count" | "elevation",
  uiStats: UiAthleteStats | undefined,
  goals: Record<Sport, Partial<Record<GoalMetric, number>> | undefined> | undefined
): MetricFacts | null {
  if (!uiStats || !goals) return null;

  const sportGoals = goals[sport];
  if (!sportGoals) return null;

  const goalValue =
    metric === "distance"
      ? sportGoals.distanceKm
      : metric === "count"
        ? sportGoals.count
        : sportGoals.elevationM;

  if (typeof goalValue !== "number" || goalValue <= 0) return null;

  // Get metric from progress
  const metricKey = metric === "distance" ? "distanceKm" : metric === "count" ? "count" : "elevationM";
  const progress = uiStats.progress[metricKey as GoalMetric];

  if (!progress) return null;

  const ytd = progress.ytd;
  const remaining = Math.max(0, goalValue - ytd);
  const weeksLeft = Math.max(0, uiStats.weeksLeftExact);

  // Trend from avgPerWeek (already in uiStats)
  const trendPerWeek = progress.avgPerWeek;

  // Required per week
  const requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : 0;

  // Forecast EoY
  const forecastEoy = Math.max(ytd + trendPerWeek * weeksLeft, ytd);

  // Avg per unit (km/run, m/ride, etc)
  let avgPerUnit: number | undefined;
  if (metric === "distance") {
    const countProgress = uiStats.progress.count;
    if (countProgress && countProgress.ytd > 0) {
      avgPerUnit = ytd / countProgress.ytd;
    }
  }

  return {
    ytd: Math.round(ytd * 100) / 100,
    goal: goalValue,
    remaining: Math.round(remaining * 100) / 100,
    requiredPerWeek: Math.round(requiredPerWeek * 100) / 100,
    trendPerWeek: Math.round(trendPerWeek * 100) / 100,
    forecastEoy: Math.round(forecastEoy * 100) / 100,
    weeksLeft: Math.round(weeksLeft * 100) / 100,
    avgPerUnit: avgPerUnit ? Math.round(avgPerUnit * 100) / 100 : undefined,
  };
}
