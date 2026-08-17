import type { GoalTrendChartData, MonthPerformance } from "../components/chart/GoalTrendChartCore";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * How far a month may sit from the required monthly average and still count as
 * "on target". Without a band, hitting the required average exactly would be the
 * only way to be green, so every month would read as either below or above.
 */
export const REQUIRED_TOLERANCE = 0.05;

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

  // The pace that reaches the goal, and the band that still counts as on target.
  const requiredAvgMonthly = yearlyGoal / 12;
  const requiredLowerBound = requiredAvgMonthly * (1 - REQUIRED_TOLERANCE);
  const requiredUpperBound = requiredAvgMonthly * (1 + REQUIRED_TOLERANCE);

  // For actual average: calculate based on months that have passed
  let actualSum = 0;
  for (let i = 0; i < monthsWithBars; i++) {
    actualSum += monthlyActuals[i];
  }
  const actualAvgMonthly = monthsWithBars > 0 ? actualSum / monthsWithBars : 0;

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

    chartData.push({
      month: MONTH_LABELS[i],
      monthIndex: i,
      monthlyActual: monthlyBar,
      requiredAvgMonthly,
      requiredLowerBound,
      requiredUpperBound,
      actualAvgMonthly,
      performance:
        monthlyBar === null ? null : classifyMonth(monthlyBar, requiredLowerBound, requiredUpperBound),
      isBestMonth: i === bestMonthIndex,
      isOnTrack,
    });
  }

  return chartData;
}
