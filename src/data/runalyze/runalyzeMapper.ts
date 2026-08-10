import type { Activity } from "../../domain/activity";
import type { SportType } from "../../domain/sport";
import type { RunalyzeActivity } from "./runalyzeTypes";
import { stripZoneSuffix } from "../../utils/localTime";

/** Activities the app does not track, kept so they can be reported rather than vanishing. */
export type SkippedActivity = {
  id: string;
  /** The sport as Runalyze names it, so an untracked id is recognisable. */
  sport: string;
  reason: "untracked-sport" | "unusable-timestamp";
};

/**
 * Sport ids are assigned per Runalyze account — there is no endpoint that
 * lists them and no guarantee another account uses the same numbers. These
 * are the ids the AP0 spike found on this account:
 *
 *   2312707  Laufen          374 activities   tracked as run
 *   2312711  Radfahren        91 activities   tracked as ride
 *   2312733  Gravel Cycling   11 activities   tracked as ride
 *   2312731  Hiking            4 activities   not tracked
 *   2312737  Tennis           10 activities   not tracked
 *   2312739  Yoga              1 activity     not tracked
 *   2312717  Sonstiges         6 activities   not tracked
 *
 * Gravel counts as riding by decision, not by accident: Runalyze models it as
 * its own sport where Strava folded comparable rides into "Ride". In 2026 that
 * is 212 km of gravel against 88 km of Radfahren — dropping it would halve the
 * cycling year. This is the one place where the Runalyze mapping deliberately
 * differs from the Strava one.
 *
 * The account records no swimming, so no id maps to "swim" yet. If one appears,
 * it has to be added here; an unknown id is skipped and reported, never guessed.
 */
export const SPORT_IDS: Record<number, SportType> = {
  2312707: "run",
  2312711: "ride",
  2312733: "ride",
};

/**
 * Which elevation column feeds the yearly goals.
 *
 * Runalyze carries two: `elevation_up`, corrected against map data (mapzen),
 * and `elevation_up_file` as the device recorded it. They disagree
 * substantially — running in 2022 is 2.830 m against 11.843 m — so the choice
 * moves every elevation goal in the app.
 *
 * `elevation_up` is the default because it is the number Runalyze itself
 * displays. Which column keeps the history continuous with the values cached
 * from Strava is a question for the parity check (step 3); flipping this
 * constant is the whole change.
 */
export const ELEVATION_FIELD: "elevation_up" | "elevation_up_file" = "elevation_up";

const OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/;

function mapSport(a: RunalyzeActivity): SportType | null {
  const id = a.sport?.id ?? a.sport_id;
  if (typeof id !== "number") return null;
  return SPORT_IDS[id] ?? null;
}

function sportLabel(a: RunalyzeActivity): string {
  return a.sport?.name ?? String(a.sport?.id ?? a.sport_id ?? "unknown");
}

/**
 * Splits Runalyze's timestamp into the two forms the domain model wants.
 *
 * On the live account `date_time` always carries its own offset
 * ("2023-03-26T14:56:19+02:00"), which makes it unambiguous: the wall-clock
 * time is the prefix and the instant is what Date parses. `timezone_offset`
 * only repeats what the suffix already says.
 *
 * The fallback below covers a payload arriving without a suffix. It never
 * triggers on current data and exists so a format change surfaces as slightly
 * different times rather than as an "Invalid Date" propagating into the year
 * buckets.
 */
function resolveTimes(a: RunalyzeActivity): { local: string; utc: string } | null {
  const raw = a.date_time;
  if (typeof raw !== "string" || raw === "") return null;

  if (OFFSET_SUFFIX.test(raw)) {
    const instant = new Date(raw);
    if (Number.isNaN(instant.getTime())) return null;
    return { local: stripZoneSuffix(raw), utc: instant.toISOString() };
  }

  // No suffix: read the value as UTC and let timezone_offset produce the
  // wall-clock time. Forcing the "Z" matters — JavaScript reads a bare
  // date-time string as local time, which would make the result depend on
  // where the viewer happens to be.
  const instant = new Date(`${raw}Z`);
  if (Number.isNaN(instant.getTime())) return null;

  const offsetMinutes = a.timezone_offset ?? 0;
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000);

  return { local: shifted.toISOString().slice(0, 19), utc: instant.toISOString() };
}

export function toDomainActivity(a: RunalyzeActivity): Activity | null {
  const sport = mapSport(a);
  if (!sport) return null;

  const times = resolveTimes(a);
  if (!times) return null;

  return {
    id: String(a.id),
    provider: "runalyze",
    sport,
    name: a.title ?? "",
    startDateLocal: times.local,
    startDateUtc: times.utc,
    // Already kilometres — no division by 1000, unlike the Strava mapper.
    // Rounded all the same, so float noise cannot reach a goal total.
    distanceKm: Math.round((a.distance ?? 0) * 100) / 100,
    elevationM: Math.round(a[ELEVATION_FIELD] ?? 0),
    movingTimeSec: Math.round(a.duration ?? 0),
    // Runalyze exposes neither flag. Reported as false rather than guessed at
    // from sport or title — see ProviderCapabilities.
    isCommute: false,
    isIndoor: false,
  };
}

/**
 * Maps a batch and separates what was skipped, so untracked sports and
 * unusable timestamps can be surfaced instead of disappearing.
 *
 * Note what this does not do: the spike found two groups of activities with
 * the same day, sport and distance — likely the same Garmin session imported
 * twice. They are passed through here. Silently dropping records is a worse
 * failure than a visible double count, and deciding which copy is real needs
 * the parity check against the Strava history.
 */
export function toDomainActivities(raw: RunalyzeActivity[]): {
  activities: Activity[];
  skipped: SkippedActivity[];
} {
  const activities: Activity[] = [];
  const skipped: SkippedActivity[] = [];

  for (const r of raw) {
    const mapped = toDomainActivity(r);
    if (mapped) {
      activities.push(mapped);
      continue;
    }

    skipped.push({
      id: String(r.id),
      sport: sportLabel(r),
      reason: mapSport(r) ? "unusable-timestamp" : "untracked-sport",
    });
  }

  return { activities, skipped };
}
