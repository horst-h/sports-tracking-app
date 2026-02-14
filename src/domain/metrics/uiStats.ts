import type { AggregateYear } from "./types";
import type { GoalMetric, Sport } from "./types";

export type ForecastMode = "ytd" | "rolling28" | "blend";

export type UiGoalProgress = {
  metric: GoalMetric;

  ytd: number;
  avgPerWeek: number;
  forecast: number;

  goal?: number;
  toVictory?: number;
  reachable?: boolean;
  reachedInWeeks?: number;
  reachedOnLocal?: string;
};

export type UiAthleteStats = {
  sport: Sport;
  retrievedAtLocal: string;

  weeksLeftDisplay: number;
  weeksLeftExact: number;
  weeksElapsed: number;

  // (optional but handy for UI)
  avgDistPerRunKm: number;

  mode: ForecastMode;

  progress: Record<GoalMetric, UiGoalProgress>;
};

function round(n: number, digits = 1) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function startOfYear(year: number) {
  return new Date(year, 0, 1, 0, 0, 0, 0);
}
function endOfYear(year: number) {
  return new Date(year, 11, 31, 23, 59, 59, 999);
}
function diffDays(a: Date, b: Date) {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function computeWeeklyRates(params: {
  aggregate: AggregateYear;
  weeksElapsed: number;
  mode: ForecastMode;
  blendWeightRolling?: number; // 0..1
}) {
  const { aggregate, weeksElapsed, mode } = params;
  const wRoll = params.blendWeightRolling ?? 0.6;

  const denom = Math.max(weeksElapsed, 1 / 7);

  // YTD rates
  const ytdDist = aggregate.totals.distanceKm / denom;
  const ytdCount = aggregate.totals.count / denom;
  const ytdElev = aggregate.totals.elevationM / denom;

  // Rolling-28 rates
  const rollDist = aggregate.rolling.last28.distanceKm / 4;
  const rollCount = aggregate.rolling.last28.count / 4;
  const rollElev = aggregate.rolling.last28.elevationM / 4;

  if (mode === "ytd") return { dist: ytdDist, count: ytdCount, elev: ytdElev };
  if (mode === "rolling28") return { dist: rollDist, count: rollCount, elev: rollElev };

  // blend
  return {
    dist: (1 - wRoll) * ytdDist + wRoll * rollDist,
    count: (1 - wRoll) * ytdCount + wRoll * rollCount,
    elev: (1 - wRoll) * ytdElev + wRoll * rollElev,
  };
}

function buildProgress(params: {
  metric: GoalMetric;
  ytd: number;
  perWeek: number;
  weeksLeftExact: number;
  asOf: Date;
  goal?: number;
}) : UiGoalProgress {
  const { metric, ytd, perWeek, weeksLeftExact, asOf, goal } = params;

  const forecast = ytd + perWeek * weeksLeftExact;

  let toVictory: number | undefined;
  let reachable: boolean | undefined;
  let reachedInWeeks: number | undefined;
  let reachedOnLocal: string | undefined;

  if (typeof goal === "number") {
    toVictory = Math.max(0, goal - ytd);
    reachable = toVictory <= (perWeek * weeksLeftExact);

    if (perWeek > 0 && toVictory > 0) {
      reachedInWeeks = toVictory / perWeek;
      const reachedDate = addDays(asOf, reachedInWeeks * 7);
      reachedOnLocal = reachedDate.toDateString();
    }
  }

  return {
    metric,
    ytd: round(ytd, metric === "count" ? 0 : 1),
    avgPerWeek: round(perWeek, metric === "count" ? 2 : 1),
    forecast: round(forecast, metric === "count" ? 0 : 2),

    goal: typeof goal === "number" ? goal : undefined,
    toVictory: toVictory !== undefined ? round(toVictory, metric === "count" ? 0 : 2) : undefined,
    reachable,
    reachedInWeeks: reachedInWeeks !== undefined ? round(reachedInWeeks, 2) : undefined,
    reachedOnLocal,
  };
}

export function buildUiAthleteStats(params: {
  aggregate: AggregateYear;
  asOfDateLocal: string;
  retrievedAtLocal: string;

  goals?: Partial<Record<GoalMetric, number>>; // NEW: distanceKm, count, elevationM

  mode?: ForecastMode;
  blendWeightRolling?: number;
}): UiAthleteStats {
  const {
    aggregate,
    asOfDateLocal,
    retrievedAtLocal,
    goals,
    mode = "ytd",
    blendWeightRolling,
  } = params;

  const asOf = new Date(asOfDateLocal);
  const soy = startOfYear(aggregate.year);
  const eoy = endOfYear(aggregate.year);

  const daysElapsed = Math.max(1, diffDays(soy, asOf) + 1);
  const weeksElapsed = Math.max(1 / 7, daysElapsed / 7);

  const daysLeft = Math.max(0, diffDays(asOf, eoy));
  const weeksLeftExact = Math.max(0, daysLeft / 7);
  const weeksLeftDisplay = Math.ceil(weeksLeftExact);

  const ytdDistanceKm = aggregate.totals.distanceKm;
  const ytdCount = aggregate.totals.count;
  const ytdElevationM = aggregate.totals.elevationM;

  const avgDistPerRunKm = ytdCount > 0 ? ytdDistanceKm / ytdCount : 0;

  const rates = computeWeeklyRates({
    aggregate,
    weeksElapsed,
    mode,
    blendWeightRolling,
  });

  const progress = {
    count: buildProgress({
      metric: "count",
      ytd: ytdCount,
      perWeek: rates.count,
      weeksLeftExact,
      asOf,
      goal: goals?.count,
    }),
    distanceKm: buildProgress({
      metric: "distanceKm",
      ytd: ytdDistanceKm,
      perWeek: rates.dist,
      weeksLeftExact,
      asOf,
      goal: goals?.distanceKm,
    }),
    elevationM: buildProgress({
      metric: "elevationM",
      ytd: ytdElevationM,
      perWeek: rates.elev,
      weeksLeftExact,
      asOf,
      goal: goals?.elevationM,
    }),
  } satisfies Record<GoalMetric, UiGoalProgress>;

  return {
    sport: aggregate.sport,
    retrievedAtLocal,
    weeksLeftDisplay,
    weeksLeftExact: round(weeksLeftExact, 2),
    weeksElapsed: round(weeksElapsed, 2),
    avgDistPerRunKm: round(avgDistPerRunKm, 2),
    mode,
    progress,
  };
}
