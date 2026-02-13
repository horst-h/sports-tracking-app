import type { Activity } from "../../domain/activity";
import type { SportType } from "../../domain/sport";
import type { StravaActivity } from "./stravaTypes";

function mapSport(stravaType: string): SportType | null {
  const t = (stravaType || "").toLowerCase();
  if (t === "run") return "run";
  if (t === "ride") return "ride";
  return null;
}

export function toDomainActivity(a: StravaActivity): Activity | null {
  const sport = mapSport(a.type);
  if (!sport) return null;

  return {
    id: a.id,
    sport,
    name: a.name,
    startDate: a.start_date,
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    elevationM: Math.round(a.total_elevation_gain),
  };
}
