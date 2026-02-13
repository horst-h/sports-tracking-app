import type { Activity } from "./activity";
import type { SportType } from "./sport";
import type { YearSportStats } from "./stats";

export function calcYearSportStats(year: number, sport: SportType, activities: Activity[]): YearSportStats {
  const filtered = activities.filter(a => {
    const y = new Date(a.startDate).getFullYear();
    return y === year && a.sport === sport;
  });

  const distanceKm = filtered.reduce((s, a) => s + a.distanceKm, 0);
  const elevationM = filtered.reduce((s, a) => s + a.elevationM, 0);

  return {
    year,
    sport,
    count: filtered.length,
    distanceKm,
    elevationM,
  };
}
