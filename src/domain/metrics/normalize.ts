import type { NormalizedActivity, Sport, StravaActivityLike } from "./types.ts";

function mapSport(type: string): Sport | null {
  const t = (type || "").toLowerCase();
  if (t === "run") return "run";
  if (t === "ride") return "ride";
  return null; // ignore other sports for now
}

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function normalizeActivities(
  activities: StravaActivityLike[],
  opts?: { includeCommute?: boolean }
): NormalizedActivity[] {
  const includeCommute = opts?.includeCommute ?? true;

  return activities
    .map((a) => {
      const sport = mapSport(a.type);
      if (!sport) return null;

      const start = new Date(a.start_date_local);
      if (Number.isNaN(start.getTime())) return null;

      const isCommute = !!a.commute;
      if (!includeCommute && isCommute) return null;

      const year = start.getFullYear();
      const month = start.getMonth() + 1;

      return {
        id: String(a.id),
        sport,
        startDateLocal: a.start_date_local,
        year,
        month,
        dayOfYear: dayOfYear(start),
        distanceKm: (a.distance ?? 0) / 1000,
        elevationM: a.total_elevation_gain ?? 0,
        movingTimeSec: a.moving_time ?? 0,
        isCommute,
        isIndoor: !!a.trainer,
      } satisfies NormalizedActivity;
    })
    .filter((x): x is NormalizedActivity => x !== null)
    .sort((a, b) => a.startDateLocal.localeCompare(b.startDateLocal));
}
