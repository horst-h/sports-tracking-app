import { useMemo } from "react";
import GoalTrendChartCore from "./GoalTrendChartCore";
import { buildGoalTrendChartData } from "../../utils/goalTrendChartHelper";
import { formatNumber } from "../../utils/format";
import type { AggregateYear } from "../../domain/metrics/types";

type Props = {
  aggregate: AggregateYear;
  yearlyGoal: number | undefined;
  metric: "distance" | "count" | "elevation";
  year: number;
};

function formatTick(metric: "distance" | "count" | "elevation", value: number): string {
  if (metric === "distance") {
    return formatNumber(value, { maximumFractionDigits: 0 });
  }
  if (metric === "elevation") {
    return formatNumber(value, { maximumFractionDigits: 0 });
  }
  return formatNumber(Math.round(value), { maximumFractionDigits: 0 });
}

function formatValue(metric: "distance" | "count" | "elevation", value: number): string {
  if (metric === "distance") {
    return `${formatNumber(value, { maximumFractionDigits: 1 })} km`;
  }
  if (metric === "elevation") {
    return `${formatNumber(value, { maximumFractionDigits: 0 })} m`;
  }
  const rounded = Math.round(value);
  const unit = rounded === 1 ? "activity" : "activities";
  return `${formatNumber(rounded, { maximumFractionDigits: 0 })} ${unit}`;
}

export default function GoalTrendChartDetail({
  aggregate,
  yearlyGoal,
  metric,
  year,
}: Props) {
  const chartData = useMemo(() => {
    if (!yearlyGoal || yearlyGoal <= 0) {
      return null;
    }

    // Extract monthly values from aggregate
    // byMonth[metric].months is indexed 1-12 (0 is unused)
    // We need to convert to 0-11 indexed array
    const metricKey = metric === "count" ? "count" : metric === "distance" ? "distanceKm" : "elevationM";
    const monthlyValues = aggregate.byMonth[metricKey].months;

    // Create 0-11 indexed array from the 1-12 indexed source
    const monthlyActuals: number[] = [];
    for (let i = 1; i <= 12; i++) {
      monthlyActuals.push(monthlyValues[i] ?? 0);
    }

    return buildGoalTrendChartData({
      monthlyActuals,
      yearlyGoal,
      selectedYear: year,
    });
  }, [aggregate, yearlyGoal, metric, year]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="text-muted" style={{ marginTop: 16 }}>
        No data for this period.
      </div>
    );
  }

  return (
    <GoalTrendChartCore
      data={chartData}
      formatValue={(value) => formatValue(metric, value)}
      formatTick={(value) => formatTick(metric, value)}
    />
  );
}
