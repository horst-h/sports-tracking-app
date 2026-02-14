import type { Forecast, ForecastMetric, GoalMetric, YearGoals, AggregateYear } from "./types.ts";

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function endOfYear(year: number): Date {
  // Dec 31, 23:59:59 local
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

function startOfYear(year: number): Date {
  return new Date(year, 0, 1, 0, 0, 0, 0);
}

function mkMetric(
  ytd: number,
  goal: number | undefined,
  projected: number,
  requiredPerWeek: number
): ForecastMetric {
  const percent = goal && goal > 0 ? Math.min(1, ytd / goal) : undefined;
  const onTrack = goal ? projected >= goal : true;

  return {
    goal,
    ytd,
    percent,
    projectedYearEnd: projected,
    requiredPerWeek,
    onTrack,
  };
}

export function buildForecast(
  aggregate: AggregateYear,
  goals: YearGoals | undefined,
  asOfDateLocal: string
): Forecast {
  const asOf = new Date(asOfDateLocal);
  const year = aggregate.year;

  const soY = startOfYear(year);
  const eoY = endOfYear(year);

  const daysElapsed = Math.max(1, daysBetween(soY, asOf) + 1); // +1 inkl. heute
  const daysRemaining = daysBetween(asOf, eoY);

  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));

  const goalFor = (m: GoalMetric): number | undefined =>
    goals?.year === year ? goals.perSport[aggregate.sport]?.[m] : undefined;

  // Proj = linear (YTD / elapsedDays) * totalDays
  const totalDays = daysBetween(soY, eoY) + 1;

  const yCount = aggregate.totals.count;
  const yDist = aggregate.totals.distanceKm;
  const yElev = aggregate.totals.elevationM;

  const projCount = (yCount / daysElapsed) * totalDays;
  const projDist = (yDist / daysElapsed) * totalDays;
  const projElev = (yElev / daysElapsed) * totalDays;

  const gCount = goalFor("count");
  const gDist = goalFor("distanceKm");
  const gElev = goalFor("elevationM");

  const reqCount = gCount ? Math.max(0, (gCount - yCount) / weeksRemaining) : 0;
  const reqDist = gDist ? Math.max(0, (gDist - yDist) / weeksRemaining) : 0;
  const reqElev = gElev ? Math.max(0, (gElev - yElev) / weeksRemaining) : 0;

  return {
    year,
    sport: aggregate.sport,
    asOfDateLocal,
    count: mkMetric(yCount, gCount, projCount, reqCount),
    distanceKm: mkMetric(yDist, gDist, projDist, reqDist),
    elevationM: mkMetric(yElev, gElev, projElev, reqElev),
  };
}
