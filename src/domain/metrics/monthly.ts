import type { NormalizedActivity } from "./types";

export type HistoryMetric = "distance" | "count" | "elevation";

export type MonthlySeriesItem = {
  month: string;
  running: number;
  cycling: number;
  total: number;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function buildMonthlySeries(params: {
  activities: NormalizedActivity[];
  metric: HistoryMetric;
  year?: number;
}): MonthlySeriesItem[] {
  const { activities, metric, year } = params;

  const series: MonthlySeriesItem[] = MONTHS.map((month) => ({
    month,
    running: 0,
    cycling: 0,
    total: 0,
  }));

  activities.forEach((activity) => {
    if (year && activity.year !== year) return;
    const index = Math.max(0, Math.min(11, activity.month - 1));

    let value = 0;
    if (metric === "distance") value = activity.distanceKm;
    if (metric === "elevation") value = activity.elevationM;
    if (metric === "count") value = 1;

    if (activity.sport === "run") {
      series[index].running += value;
    } else {
      series[index].cycling += value;
    }
    series[index].total += value;
  });

  return series;
}
