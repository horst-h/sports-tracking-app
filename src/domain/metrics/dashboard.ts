import type { DashboardModel, NormalizedActivity, Sport, YearGoals } from "./types.ts";
import { aggregateYear } from "./aggregate.ts";
import { buildForecast } from "./forecast.ts";

function round(n: number, digits = 1): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

function buildInsights(forecast: ReturnType<typeof buildForecast>): string[] {
  const insights: string[] = [];

  const fmt = (n: number) => String(round(n, 1));

  if (forecast.distanceKm.goal) {
    insights.push(
      forecast.distanceKm.onTrack
        ? `✅ Distanz: auf Kurs (Prognose ${fmt(forecast.distanceKm.projectedYearEnd)} km)`
        : `⚠️ Distanz: es fehlen ~${fmt(forecast.distanceKm.requiredPerWeek)} km/Woche`
    );
  }
  if (forecast.count.goal) {
    insights.push(
      forecast.count.onTrack
        ? `✅ Einheiten: auf Kurs (Prognose ${fmt(forecast.count.projectedYearEnd)} Einheiten)`
        : `⚠️ Einheiten: es fehlen ~${fmt(forecast.count.requiredPerWeek)} /Woche`
    );
  }
  if (forecast.elevationM.goal) {
    insights.push(
      forecast.elevationM.onTrack
        ? `✅ Höhenmeter: auf Kurs (Prognose ${fmt(forecast.elevationM.projectedYearEnd)} hm)`
        : `⚠️ Höhenmeter: es fehlen ~${fmt(forecast.elevationM.requiredPerWeek)} hm/Woche`
    );
  }

  return insights.slice(0, 4);
}

export function buildDashboardModel(params: {
  normalized: NormalizedActivity[];
  year: number;
  goals?: YearGoals;
  asOfDateLocal: string;
}): DashboardModel {
  const { normalized, year, goals, asOfDateLocal } = params;
  const generatedAtLocal = asOfDateLocal;

  const sports: Sport[] = ["run", "ride"];
  const result: DashboardModel["sports"] = {} as any;

  for (const sport of sports) {
    const aggregate = aggregateYear(normalized, year, sport, asOfDateLocal);
    const forecast = buildForecast(aggregate, goals, asOfDateLocal);
    const insights = buildInsights(forecast);

    result[sport] = { aggregate, forecast, insights };
  }

  return {
    year,
    generatedAtLocal,
    sports: result,
  };
}
