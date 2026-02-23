import type { GoalTrendChartData } from "../components/chart/GoalTrendChartCore";

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Builds chart data for the goal trend visualization with average lines
 * @param monthlyActuals Array of 12 monthly values (index 0-11 = Jan-Dec)
 * @param yearlyGoal The goal value for the entire year
 * @param selectedYear The year being displayed
 * @param currentDate The current date (for determining which months to show bars)
 * @returns Chart data with monthly bars and average lines
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

  // Calculate averages
  const planAvgMonthly = yearlyGoal / 12;

  // For actual average: calculate based on months that have passed
  let actualSum = 0;
  for (let i = 0; i < monthsWithBars; i++) {
    actualSum += monthlyActuals[i];
  }
  const actualAvgMonthly = monthsWithBars > 0 ? actualSum / monthsWithBars : 0;

  // Determine line status
  const isOnTrack = actualAvgMonthly >= planAvgMonthly;

  // Calculate plan bounds for ±5% range
  const planLowerBound = planAvgMonthly * 0.95;
  const planUpperBound = planAvgMonthly * 1.05;

  // Build chart data for all 12 months
  const chartData: GoalTrendChartData[] = [];

  for (let i = 0; i < 12; i++) {
    // Only include bar value for months that have passed (or all months for historical years)
    const monthlyBar = i < monthsWithBars ? monthlyActuals[i] : null;

    chartData.push({
      month: MONTH_LABELS[i],
      monthIndex: i,
      monthlyActual: monthlyBar,
      planAvgMonthly,
      planLowerBound,
      planUpperBound,
      actualAvgMonthly,
      isOnTrack,
    });
  }

  return chartData;
}
