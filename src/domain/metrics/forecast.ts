import type { Forecast, ForecastMetric, GoalMetric, YearGoals, AggregateYear } from "./types.ts";

// ============================================================================
// Fancy Forecasts: types & calculations for goal progress visualization
// ============================================================================

export interface DailyDataPoint {
  date: string;        // YYYY-MM-DD
  value: number;       // e.g., km, count, elevation
}

export interface ForecastInput {
  goalValue: number;   // e.g., 1000 km for the year
  currentValue: number; // e.g., 400 km YTD
  today?: Date;        // defaults to new Date()
  year?: number;       // defaults to today.getFullYear()
  dailySeries?: DailyDataPoint[]; // optional: sorted by date, for trend calculation
  activityCountByDay?: DailyDataPoint[]; // optional: number of activities per day for per-unit calculation
}

export interface Point {
  x: number;          // 0..1 progress through the year
  y: number;          // value (in metric unit)
}

export interface ForecastResult {
  expectedToday: number;   // what we should have achieved by today if on track
  delta: number;           // currentValue - expectedToday
  daysAhead: number;       // delta / daily ideal (can be negative)
  label: string;           // "X days ahead" or "X days behind"
  badgeColor: "on-track" | "warning" | "danger";  // color based on deviation
  trendPerDay: number;     // avg daily progress (last 30 days or fallback)
  trendPerWeek: number;    // trendPerDay * 7 for weekly display
  forecastEOY: number;     // projected value at year end
  requiredPerWeek: number; // pace needed per week to reach goal by year end
  perUnit?: number;        // last 30 days avg value per activity (optional)
  lines: {
    ideal: Point[];        // linear path to goal
    actual: Point[];       // real progress (sampled monthly)
    forecast: Point[];     // projected path including trend
  };
}

// ============================================================================
// Helpers
// ============================================================================

function daysInYear(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

/**
 * Counted in calendar days, not in elapsed milliseconds.
 *
 * Subtracting two local timestamps and dividing by 86,400,000 is a day short
 * whenever a clock change sits between them: from late March to late October,
 * Berlin is one hour further from 1 January than whole days account for, so
 * `Math.floor` gave 228 for 17 August until 01:00 and 229 afterwards. Small,
 * and it moved the whole ideal line by a day for anyone opening the app early.
 *
 * Mapping both ends onto UTC keeps the arithmetic on calendar dates, where a
 * day is a day regardless of what the clocks did in between.
 */
function getDayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getFullYear(), 0, 1);
  const thisDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((thisDay - startOfYear) / (1000 * 60 * 60 * 24)) + 1;
}

function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function clamp(n: number, min = 0, max = Infinity): number {
  return Math.max(min, Math.min(max, n));
}

// Trend calculation from last 30 calendar days (average per calendar day, not per training day)
/**
 * The pace this card projects with: the year's average per calendar day.
 *
 * It used to be the last 30 days, and the card had no single answer as a
 * result. The status pill and the end-of-year figure ran on recent form while
 * the projected completion date and the days-ahead delta ran on the year's
 * average, so a card could read "On Track", "10100 m by 31 Dec" and "goal
 * reached 13 Jan 2027" all at once, each of them correct on its own terms.
 *
 * One rate removes the contradiction outright rather than papering over it.
 * Being on track means the year's pace covers what is left, and that is the
 * same statement as "not behind the straight line to the goal" — algebraically
 * the same, so the pill and the delta can no longer disagree:
 *
 *   c/d ≥ (G−c)/(L−d)   ⟺   c·L ≥ G·d   ⟺   c ≥ G·(d/L)
 *   ^ pace covers the rest                    ^ at or above the ideal today
 *
 * The cost is deliberate: a strong month barely moves the projection, and a
 * quiet one barely dents it. That is what a year-to-date average is for.
 */
function calculateTrendPerDay(params: { currentValue: number; dayOfYear: number }): number {
  const { currentValue, dayOfYear } = params;
  return dayOfYear > 0 ? currentValue / dayOfYear : 0;
}

// Generate 12 monthly points for sparkline data
function generateMonthlyPoints(params: {
  year: number;
  goalValue: number;
  currentValue: number;
  trendPerDay: number;
  dailySeries?: DailyDataPoint[];
}): { ideal: Point[]; actual: Point[]; forecast: Point[] } {
  const { year, goalValue, currentValue, trendPerDay, dailySeries } = params;

  const yearLen = daysInYear(year);
  const points: { ideal: Point[]; actual: Point[]; forecast: Point[] } = {
    ideal: [],
    actual: [],
    forecast: [],
  };

  for (let month = 1; month <= 12; month++) {
    const dayInMonth = 15;
    const date = new Date(year, month - 1, dayInMonth);
    const dayOfYearForMonth = getDayOfYear(date);
    const progress = dayOfYearForMonth / yearLen;

    const idealValue = goalValue * progress;
    points.ideal.push({ x: progress, y: idealValue });

    let actualValue = 0;
    if (dailySeries && dailySeries.length > 0) {
      const monthEnd = new Date(year, month, 0);
      const monthEndIso = monthEnd.toISOString().split("T")[0];
      const upToMonth = dailySeries.filter((p) => p.date <= monthEndIso);
      actualValue = upToMonth.reduce((sum, p) => sum + p.value, 0);
    } else {
      const today = new Date();
      const dayOfYearToday = getDayOfYear(today);
      if (dayOfYearForMonth <= dayOfYearToday) {
        actualValue = currentValue * (dayOfYearForMonth / dayOfYearToday);
      } else {
        actualValue = currentValue;
      }
    }
    points.actual.push({ x: progress, y: clamp(actualValue) });

    const today = new Date();
    const dayOfYearToday = getDayOfYear(today);
    if (dayOfYearForMonth <= dayOfYearToday) {
      points.forecast.push({ x: progress, y: clamp(actualValue) });
    } else {
      const daysUntilMonth = dayOfYearForMonth - dayOfYearToday;
      const forecastValue = currentValue + trendPerDay * daysUntilMonth;
      points.forecast.push({ x: progress, y: clamp(forecastValue) });
    }
  }

  return points;
}

/**
 * Calculate fancy forecast with trend-based projections and visualization data
 */
export function calculateForecast(input: ForecastInput): ForecastResult {
  const today = input.today ?? new Date();
  const year = input.year ?? today.getFullYear();
  const { goalValue, currentValue, dailySeries, activityCountByDay } = input;

  const yearLen = daysInYear(year);
  const dayOfYear = getDayOfYear(today);

  const perDayIdeal = goalValue / yearLen;
  const expectedToday = perDayIdeal * dayOfYear;

  const delta = currentValue - expectedToday;
  const daysAhead = dayOfYear > 0 ? delta / perDayIdeal : 0;

  const label =
    daysAhead >= 0
      ? `${Math.round(daysAhead)} days ahead`
      : `${Math.round(Math.abs(daysAhead))} days behind`;

  const trendPerDay = calculateTrendPerDay({ currentValue, dayOfYear });

  const trendPerWeek = round(trendPerDay * 7, 2);

  const daysLeft = yearLen - dayOfYear;
  const forecastEOY = clamp(currentValue + trendPerDay * daysLeft, 0);

  // Average per activity across the year, for the same reason as the pace: it
  // sits unlabelled beside figures that are all year-to-date, and a 30-day
  // window there was one more number quietly measuring something else.
  let perUnit: number | undefined;
  if (dailySeries && dailySeries.length > 0 && activityCountByDay && activityCountByDay.length > 0) {
    const metricSum = dailySeries.reduce((sum, p) => sum + p.value, 0);
    const activityCount = activityCountByDay.reduce((sum, p) => sum + p.value, 0);

    if (activityCount > 0) {
      perUnit = round(metricSum / activityCount, 2);
    }
  }

  const lines = generateMonthlyPoints({
    year,
    goalValue,
    currentValue,
    trendPerDay,
    dailySeries,
  });

  // Calculate required pace to reach goal by year end
  const remaining = Math.max(goalValue - currentValue, 0);
  const remainingDays = Math.max(daysLeft, 1);
  const requiredPerDay = remaining / remainingDays;
  const requiredPerWeek = round(requiredPerDay * 7, 2);

  // Calculate badge color based on deviation percentage
  let badgeColor: "on-track" | "warning" | "danger" = "on-track";
  if (daysAhead < 0 && expectedToday > 0) {
    const deviationPercent = (delta / expectedToday) * 100;
    badgeColor = deviationPercent < -30 ? "danger" : "warning";
  }

  return {
    expectedToday: round(expectedToday, 1),
    delta: round(delta, 1),
    daysAhead: round(daysAhead, 1),
    label,
    badgeColor,
    trendPerDay: round(trendPerDay, 2),
    trendPerWeek,
    forecastEOY: round(forecastEOY, 1),
    requiredPerWeek,
    perUnit,
    lines,
  };
}

// ============================================================================
// Tests: simple validation for core calculations
// ============================================================================

interface TestCase {
  name: string;
  input: ForecastInput;
  validate: (result: ForecastResult) => boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: "On track: 50% complete on day 183 (half year)",
    input: {
      goalValue: 1000,
      currentValue: 500,
      today: new Date(2025, 5, 2),
      year: 2025,
    },
    validate: (r) => Math.abs(r.daysAhead) < 5,
  },
  {
    name: "Behind: 300 km on day 183 (should be ~500)",
    input: {
      goalValue: 1000,
      currentValue: 300,
      today: new Date(2025, 5, 2),
      year: 2025,
    },
    validate: (r) => r.daysAhead < -1 && r.label.includes("behind"),
  },
  {
    name: "Ahead: 600 km on day 183",
    input: {
      goalValue: 1000,
      currentValue: 600,
      today: new Date(2025, 5, 2),
      year: 2025,
    },
    validate: (r) => r.daysAhead > 5 && r.label.includes("ahead"),
  },
];

export function runForecastTests(): void {
  console.log("[Forecast Tests]");
  let passed = 0;
  TEST_CASES.forEach((tc) => {
    const result = calculateForecast(tc.input);
    const pass = tc.validate(result);
    const status = pass ? "✓" : "✗";
    console.log(`${status} ${tc.name}`);
    if (!pass) console.log(`  Result:`, result);
    if (pass) passed++;
  });
  console.log(`Passed: ${passed}/${TEST_CASES.length}`);
}

// ============================================================================
// Original forecast functions (preserved)
// ============================================================================

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
