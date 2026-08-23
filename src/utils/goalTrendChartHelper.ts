import type { GoalTrendChartData, MonthPerformance } from "../components/chart/GoalTrendChartCore";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How far a month may sit from the required monthly average and still count as
 * "on target". Without a band, hitting the required average exactly would be the
 * only way to be green, so every month would read as either below or above.
 */
export const REQUIRED_TOLERANCE = 0.05;

/**
 * How much of a month must be behind us before its pace is worth extrapolating.
 *
 * Dividing by the elapsed share is unusable at the start of a month, and wrong
 * in both directions at once. Nothing logged by the 2nd projects to zero for the
 * whole month, which is not what an empty first weekend means; one long ride on
 * the 2nd projects to fifteen of them, which is not what one ride means either.
 *
 * A quarter of the month is the first point where the multiplier is at most four
 * and a normal training week has had room to happen. Before it, the month is
 * shown but not rated and not extrapolated — there is genuinely nothing to say
 * yet, and saying nothing is the honest version of that.
 */
export const MIN_MONTH_PROGRESS_TO_PROJECT = 0.25;

function classifyMonth(value: number, lowerBound: number, upperBound: number): MonthPerformance {
  if (value > upperBound) return "above";
  if (value >= lowerBound) return "onTarget";
  return "below";
}

/**
 * Builds chart data for the goal trend visualization.
 *
 * The benchmark every month is judged against is the *required* monthly average
 * — the pace that reaches the yearly goal, i.e. goal / 12. That is deliberately
 * a fixed value rather than "what is still needed from here on": a benchmark
 * that moves with the remaining months would repaint the already-finished bars
 * every time a new activity lands.
 *
 * @param monthlyActuals Array of 12 monthly values (index 0-11 = Jan-Dec)
 * @param yearlyGoal The goal value for the entire year
 * @param selectedYear The year being displayed
 * @param currentDate The current date (for determining which months to show bars)
 * @returns Chart data with monthly bars, per-month rating and the two average lines
 */
export function buildGoalTrendChartData(params: {
  monthlyActuals: number[];
  yearlyGoal: number;
  selectedYear: number;
  currentDate?: Date;
}): GoalTrendChartData[] {
  const { monthlyActuals, yearlyGoal, selectedYear, currentDate = new Date() } = params;

  if (monthlyActuals.length !== 12) {
    throw new Error("monthlyActuals must have exactly 12 months");
  }

  const today = currentDate;
  const currentYear = today.getFullYear();
  const currentMonthIndex = today.getMonth(); // 0-based (0 = Jan, 11 = Dec)

  // Determine which months to show bars for
  // If selectedYear is current year: only show bars up to current month
  // Otherwise: show all 12 months
  const isCurrentYear = selectedYear === currentYear;
  const monthsWithBars = isCurrentYear ? currentMonthIndex + 1 : 12;

  // How much of the running month is already behind us. Day 0 of a month never
  // happens, so this is always above zero and safe to divide by.
  const daysInCurrentMonth = new Date(selectedYear, currentMonthIndex + 1, 0).getDate();
  const monthProgress = today.getDate() / daysInCurrentMonth;

  // The pace that reaches the goal, and the band that still counts as on target.
  const requiredAvgMonthly = yearlyGoal / 12;
  const requiredLowerBound = requiredAvgMonthly * (1 - REQUIRED_TOLERANCE);
  const requiredUpperBound = requiredAvgMonthly * (1 + REQUIRED_TOLERANCE);

  // For actual average: calculate based on months that have passed.
  //
  // Divided by the months actually elapsed, fractions included. Counting a
  // month that is three-quarters gone as a whole one understates the average
  // for its entire duration — the same distortion that made the running month's
  // bar read as a bad month, one level up.
  let actualSum = 0;
  for (let i = 0; i < monthsWithBars; i++) {
    actualSum += monthlyActuals[i];
  }
  const monthsElapsed = isCurrentYear ? currentMonthIndex + monthProgress : 12;
  const actualAvgMonthly = monthsElapsed > 0 ? actualSum / monthsElapsed : 0;

  // Determine line status
  const isOnTrack = actualAvgMonthly >= requiredAvgMonthly;

  // Best month among the ones that actually have a bar. Ties go to the earlier
  // month; a year without a single recorded month gets no badge at all.
  let bestMonthIndex = -1;
  for (let i = 0; i < monthsWithBars; i++) {
    if (monthlyActuals[i] <= 0) continue;
    if (bestMonthIndex === -1 || monthlyActuals[i] > monthlyActuals[bestMonthIndex]) {
      bestMonthIndex = i;
    }
  }

  // Build chart data for all 12 months
  const chartData: GoalTrendChartData[] = [];

  for (let i = 0; i < 12; i++) {
    // Only include bar value for months that have passed (or all months for historical years)
    const monthlyBar = i < monthsWithBars ? monthlyActuals[i] : null;
    const isInProgress = isCurrentYear && i === currentMonthIndex;

    // Where the running month lands if the rest of it goes like the part
    // already done. Finished months project to themselves; a month too young to
    // extrapolate projects to nothing at all, and is left unrated below.
    const canProject = !isInProgress || monthProgress >= MIN_MONTH_PROGRESS_TO_PROJECT;
    const projectedMonthly =
      monthlyBar === null || !canProject
        ? null
        : isInProgress
          ? monthlyBar / monthProgress
          : monthlyBar;

    chartData.push({
      month: MONTH_LABELS[i],
      monthIndex: i,
      monthlyActual: monthlyBar,
      projectedMonthly,
      // The bar reaches the projection where there is one, and otherwise just
      // shows what has been done.
      barTop: projectedMonthly ?? monthlyBar,
      isInProgress,
      monthProgress: isInProgress ? monthProgress : 1,
      daysInMonth: isInProgress ? daysInCurrentMonth : 0,
      dayOfMonth: isInProgress ? today.getDate() : 0,
      requiredAvgMonthly,
      requiredLowerBound,
      requiredUpperBound,
      actualAvgMonthly,
      // Rated on the projection, not on the part completed so far. Judging a
      // month that is three weeks in against a whole month's requirement is
      // what painted the running month red for most of every month.
      //
      // null means unrated, which is now two different situations: a month that
      // has not started, and one too young to extrapolate. They are told apart
      // by monthlyActual, which is null only for the first.
      performance:
        projectedMonthly === null
          ? null
          : classifyMonth(projectedMonthly, requiredLowerBound, requiredUpperBound),
      isBestMonth: i === bestMonthIndex,
      isOnTrack,
    });
  }

  return chartData;
}
