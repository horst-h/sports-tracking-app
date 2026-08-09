import type { Activity } from "../activity.ts";
import type { NormalizedActivity } from "./types.ts";

function dayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Turns provider-neutral activities into the calendar-indexed shape the
 * aggregations work on.
 *
 * Sport mapping and unit conversion happen in the provider's mapper, not here
 * — this function is the same for every data source.
 */
export function normalizeActivities(
  activities: Activity[],
  opts?: { includeCommute?: boolean }
): NormalizedActivity[] {
  const includeCommute = opts?.includeCommute ?? true;

  return activities
    .map((a) => {
      const start = new Date(a.startDateLocal);
      if (Number.isNaN(start.getTime())) return null;

      if (!includeCommute && a.isCommute) return null;

      return {
        id: a.id,
        sport: a.sport,
        startDateLocal: a.startDateLocal,
        year: start.getFullYear(),
        month: start.getMonth() + 1,
        dayOfYear: dayOfYear(start),
        distanceKm: a.distanceKm ?? 0,
        // Swimming: elevation is not tracked (always 0)
        elevationM: a.sport === "swim" ? 0 : (a.elevationM ?? 0),
        movingTimeSec: a.movingTimeSec ?? 0,
        isCommute: a.isCommute,
        isIndoor: a.isIndoor,
      } satisfies NormalizedActivity;
    })
    .filter((x): x is NormalizedActivity => x !== null)
    .sort((a, b) => a.startDateLocal.localeCompare(b.startDateLocal));
}
