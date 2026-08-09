import type { Activity } from "../../domain/activity";
import type { SportType } from "../../domain/sport";
import type { StravaActivity } from "./stravaTypes";
import { stripZoneSuffix, toLocalWallClock } from "../../utils/localTime";

/** Activities the app does not track, kept so they can be reported rather than vanishing. */
export type SkippedActivity = { id: string; type: string };

/**
 * Deliberately unchanged from the pre-refactoring behaviour: only plain "Run"
 * and "Ride" count, plus anything containing "swim". Widening this to
 * TrailRun / VirtualRide / GravelRide would move the athlete's yearly totals,
 * which is a product decision and not part of a data-source swap.
 */
function mapSport(stravaType: string): SportType | null {
  const t = (stravaType || "").toLowerCase();
  if (t === "run") return "run";
  if (t === "ride") return "ride";
  if (t.includes("swim")) return "swim";
  return null;
}

function resolveStartDateLocal(a: StravaActivity): string {
  // Preferred: Strava's own local time, which is correct even when the
  // athlete recorded the activity in a different zone than they view it in.
  if (a.start_date_local) return stripZoneSuffix(a.start_date_local);

  // Fallback for payloads without it (older cache entries): interpret the UTC
  // instant in the current zone. This reproduces the previous behaviour
  // exactly, so legacy data keeps landing in the same year and month.
  return toLocalWallClock(new Date(a.start_date));
}

export function toDomainActivity(a: StravaActivity): Activity | null {
  const sport = mapSport(a.type);
  if (!sport) return null;

  return {
    id: String(a.id),
    provider: "strava",
    sport,
    name: a.name ?? "",
    startDateLocal: resolveStartDateLocal(a),
    startDateUtc: a.start_date,
    distanceKm: Math.round((a.distance / 1000) * 100) / 100,
    elevationM: Math.round(a.total_elevation_gain),
    movingTimeSec: Math.round(a.moving_time ?? 0),
    isCommute: !!a.commute,
    isIndoor: !!a.trainer,
  };
}

/**
 * Maps a batch and separates what was skipped, so unknown sport types can be
 * surfaced. Previously they disappeared without any trace.
 */
export function toDomainActivities(raw: StravaActivity[]): {
  activities: Activity[];
  skipped: SkippedActivity[];
} {
  const activities: Activity[] = [];
  const skipped: SkippedActivity[] = [];

  for (const r of raw) {
    const mapped = toDomainActivity(r);
    if (mapped) activities.push(mapped);
    else skipped.push({ id: String(r.id), type: r.type });
  }

  return { activities, skipped };
}
