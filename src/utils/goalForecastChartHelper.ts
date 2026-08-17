import type {
  GoalCrossing,
  GoalForecastChart,
  GoalForecastChartPoint,
} from "../components/chart/GoalForecastChartCore";
import { MONTH_LABELS } from "./goalTrendChartHelper";

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Day of the year of the last day of each month, 1-based (Jan 31 -> 31). */
function cumulativeDaysByMonth(year: number): number[] {
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const cumulative: number[] = [];
  let total = 0;
  for (const length of lengths) {
    total += length;
    cumulative.push(total);
  }
  return cumulative;
}

/** Day of the year for a date, 1-based (Jan 1 -> 1). */
function dayOfYear(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const elapsedMs = date.getTime() - startOfYear.getTime();
  return Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1;
}

/** Inverse of dayOfYear: 1 -> Jan 1. */
function dateFromDayOfYear(year: number, day: number): Date {
  return new Date(year, 0, Math.max(1, Math.round(day)));
}

/**
 * Where the plotted line crosses the goal.
 *
 * Derived from the plotted points rather than from the rate directly, so the
 * marker lands exactly on the visible intersection of the curve and the goal
 * line — computing it from the rate alone would put it a little off wherever
 * the drawn segments and the underlying days disagree, which they do around
 * the partly-finished current month.
 */
function findGoalCrossing(
  series: { x: number; value: number; day: number }[],
  goal: number,
  lastActualMonth: number,
  year: number,
): GoalCrossing | null {
  if (series.length === 0 || goal <= 0) return null;

  // Goal already met by the first plotted point — there is no segment to
  // interpolate, so split the first month proportionally and pin the marker
  // to the start of the line.
  const first = series[0];
  if (first.value >= goal) {
    const share = first.value > 0 ? goal / first.value : 1;
    return {
      x: first.x,
      date: dateFromDayOfYear(year, first.day * share),
      isProjection: false,
    };
  }

  for (let i = 1; i < series.length; i++) {
    const previous = series[i - 1];
    const current = series[i];
    if (previous.value < goal && current.value >= goal) {
      const span = current.value - previous.value;
      const t = span > 0 ? (goal - previous.value) / span : 0;
      return {
        x: previous.x + t * (current.x - previous.x),
        date: dateFromDayOfYear(year, previous.day + t * (current.day - previous.day)),
        isProjection: current.x > lastActualMonth,
      };
    }
  }

  return null;
}

/**
 * Builds the cumulative progress line and its linear projection to year end.
 *
 * The projection runs off elapsed *days*, not elapsed months: the current month
 * is only partly over, so averaging it in as a whole month would drag the rate
 * down every time a month rolls over and make the forecast sag at the start of
 * each month.
 *
 * A year that is already complete gets no projection — there is nothing left to
 * project — and its actual line simply covers all twelve months.
 */
export function buildGoalForecastChartData(params: {
  monthlyActuals: number[];
  yearlyGoal: number;
  selectedYear: number;
  currentDate?: Date;
}): GoalForecastChart {
  const { monthlyActuals, yearlyGoal, selectedYear, currentDate = new Date() } = params;

  if (monthlyActuals.length !== 12) {
    throw new Error("monthlyActuals must have exactly 12 months");
  }

  const isCurrentYear = selectedYear === currentDate.getFullYear();
  // The last month the actual line reaches, 0-based.
  const lastActualMonth = isCurrentYear ? currentDate.getMonth() : 11;

  let ytd = 0;
  for (let i = 0; i <= lastActualMonth; i++) {
    ytd += monthlyActuals[i];
  }

  const cumulativeDays = cumulativeDaysByMonth(selectedYear);
  const elapsedDays = isCurrentYear ? dayOfYear(currentDate) : cumulativeDays[11];
  const ratePerDay = elapsedDays > 0 ? ytd / elapsedDays : 0;

  const points: GoalForecastChartPoint[] = [];
  let runningTotal = 0;

  for (let i = 0; i < 12; i++) {
    let cumulativeActual: number | null = null;
    if (i <= lastActualMonth) {
      runningTotal += monthlyActuals[i];
      cumulativeActual = runningTotal;
    }

    // The projection starts on top of the last actual point so the two lines
    // meet instead of showing a step where the handover happens.
    let cumulativeForecast: number | null = null;
    if (isCurrentYear) {
      if (i === lastActualMonth) {
        cumulativeForecast = ytd;
      } else if (i > lastActualMonth) {
        cumulativeForecast = ratePerDay * cumulativeDays[i];
      }
    }

    points.push({
      month: MONTH_LABELS[i],
      monthIndex: i,
      cumulativeActual,
      cumulativeForecast,
    });
  }

  const forecastEoy = isCurrentYear ? ratePerDay * cumulativeDays[11] : null;

  // The curve as it is actually drawn: actuals up to today, projection after.
  // The current month's point sits on today rather than on the month's end,
  // which is why the day comes from the mapping and not from the month index.
  const series = points.map((point, i) => ({
    x: i,
    value: (i <= lastActualMonth ? point.cumulativeActual : point.cumulativeForecast) ?? 0,
    day: i === lastActualMonth && isCurrentYear ? elapsedDays : cumulativeDays[i],
  }));

  return {
    points,
    goal: yearlyGoal,
    ytd,
    forecastEoy,
    goalCrossing: findGoalCrossing(series, yearlyGoal, lastActualMonth, selectedYear),
    reachesGoal: (forecastEoy ?? ytd) >= yearlyGoal,
  };
}
