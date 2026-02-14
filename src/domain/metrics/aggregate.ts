import type { AggregateYear, MetricTotals, NormalizedActivity, Sport } from "./types.ts";

function emptyTotals(): MetricTotals {
  return { count: 0, distanceKm: 0, elevationM: 0, movingTimeHours: 0 };
}

function add(t: MetricTotals, a: NormalizedActivity): MetricTotals {
  return {
    count: t.count + 1,
    distanceKm: t.distanceKm + a.distanceKm,
    elevationM: t.elevationM + a.elevationM,
    movingTimeHours: t.movingTimeHours + a.movingTimeSec / 3600,
  };
}


function initMonths(): number[] {
  // months[1..12] used
  return Array.from({ length: 13 }, () => 0);
}

export function aggregateYear(
  normalized: NormalizedActivity[],
  year: number,
  sport: Sport,
  asOfDateLocal?: string
): AggregateYear {
  const filtered = normalized.filter((a) => a.year === year && a.sport === sport);

  const totals = filtered.reduce((acc, a) => add(acc, a), emptyTotals());

  const byMonth = {
    count: { months: initMonths() },
    distanceKm: { months: initMonths() },
    elevationM: { months: initMonths() },
    movingTimeHours: { months: initMonths() },
  };

  for (const a of filtered) {
    const m = a.month;
    byMonth.count.months[m] += 1;
    byMonth.distanceKm.months[m] += a.distanceKm;
    byMonth.elevationM.months[m] += a.elevationM;
    byMonth.movingTimeHours.months[m] += a.movingTimeSec / 3600;
  }

  // Rolling windows (7/28 Tage) relativ zu asOfDateLocal oder "jetzt"
  const asOf = asOfDateLocal ? new Date(asOfDateLocal) : new Date();
  const cutoff7 = new Date(asOf); cutoff7.setDate(cutoff7.getDate() - 7);
  const cutoff28 = new Date(asOf); cutoff28.setDate(cutoff28.getDate() - 28);

  const last7 = filtered
    .filter((a) => new Date(a.startDateLocal) >= cutoff7 && new Date(a.startDateLocal) <= asOf)
    .reduce((acc, a) => add(acc, a), emptyTotals());

  const last28 = filtered
    .filter((a) => new Date(a.startDateLocal) >= cutoff28 && new Date(a.startDateLocal) <= asOf)
    .reduce((acc, a) => add(acc, a), emptyTotals());

  const lastActivityDateLocal = filtered.length ? filtered[filtered.length - 1].startDateLocal : undefined;

  return {
    year,
    sport,
    totals,
    byMonth,
    rolling: { last7, last28 },
    lastActivityDateLocal,
  };
}
