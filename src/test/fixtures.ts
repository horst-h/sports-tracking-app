import type { NormalizedActivity } from "../domain/metrics/types";
import type { Activity } from "../domain/activity";
import type { StravaActivity } from "../data/strava/stravaTypes";

/**
 * Deterministic fixture set for the golden master.
 *
 * Chosen to hit the cases that actually break during a data source swap:
 *  - all three sports, including swim (elevation must stay 0)
 *  - activities spread over the year so month buckets are non-trivial
 *  - two inside the 7-day and one extra inside the 28-day rolling window
 *    relative to AS_OF
 *  - a late-evening Dec 31 entry and a Dec 31 entry from the previous year,
 *    which is where UTC-vs-local drift shows up
 *  - decimal distances, so rounding differences surface instead of hiding
 */

/** Reference "now" for every deterministic assertion. Local time. */
export const AS_OF = "2025-08-15T12:00:00";
export const RETRIEVED_AT = "fixed-retrieved-at";
export const YEAR = 2025;

function dayOfYear(iso: string): number {
  const d = new Date(iso);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function norm(
  id: string,
  sport: NormalizedActivity["sport"],
  startDateLocal: string,
  distanceKm: number,
  elevationM: number,
  movingTimeSec: number
): NormalizedActivity {
  const d = new Date(startDateLocal);
  return {
    id,
    sport,
    startDateLocal,
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    dayOfYear: dayOfYear(startDateLocal),
    distanceKm,
    elevationM,
    movingTimeSec,
    isCommute: false,
    isIndoor: false,
  };
}

/**
 * Layer 1 input: normalized activities fed straight into the calculation
 * core. Deliberately bypasses the mapping layer so these values stay valid
 * no matter how the providers change.
 */
export const NORMALIZED: NormalizedActivity[] = [
  norm("r1", "run", "2025-01-15T07:30:00", 10.5, 120, 3600),
  norm("r2", "run", "2025-02-20T18:00:00", 21.1, 250, 7200),
  norm("r3", "run", "2025-03-10T09:00:00", 5.0, 30, 1500),
  norm("r4", "run", "2025-07-25T06:00:00", 15.0, 180, 5400),
  norm("r5", "run", "2025-08-10T07:00:00", 8.0, 60, 2700),
  norm("r6", "run", "2025-08-01T07:00:00", 12.0, 90, 4000),
  norm("r7", "run", "2025-12-31T23:30:00", 6.0, 40, 2000),

  norm("c1", "ride", "2025-04-05T14:00:00", 45.0, 500, 5400),
  norm("c2", "ride", "2025-06-12T16:00:00", 80.5, 1200, 10800),
  norm("c3", "ride", "2025-08-14T17:00:00", 30.0, 300, 3600),

  norm("s1", "swim", "2025-05-01T12:00:00", 1.5, 0, 2400),

  // Previous year — must never leak into 2025 aggregates.
  norm("p1", "run", "2024-12-31T23:30:00", 7.0, 50, 2100),
];

/**
 * Layer 2 input: the raw Strava shape as the API delivers it, used to
 * characterize the mapping chain (toDomainActivity -> normalizeActivities).
 */
export const STRAVA_RAW: StravaActivity[] = [
  {
    id: 1001,
    type: "Run",
    name: "Morning Run",
    start_date: "2025-01-15T06:30:00Z",
    start_date_local: "2025-01-15T07:30:00Z", // note the bogus Z Strava appends
    distance: 10500,
    total_elevation_gain: 120,
    moving_time: 3600,
  },
  {
    id: 1002,
    type: "Ride",
    name: "Feierabendrunde",
    start_date: "2025-04-05T12:00:00Z",
    start_date_local: "2025-04-05T14:00:00Z",
    distance: 45000,
    total_elevation_gain: 500,
    moving_time: 5400,
  },
  {
    id: 1003,
    type: "Swim",
    name: "Pool",
    start_date: "2025-05-01T10:00:00Z",
    start_date_local: "2025-05-01T12:00:00Z",
    distance: 1500,
    total_elevation_gain: 0,
    moving_time: 2400,
  },
  {
    id: 1004,
    type: "Hike",
    name: "Wanderung",
    start_date: "2025-05-02T08:00:00Z",
    start_date_local: "2025-05-02T10:00:00Z",
    distance: 12000,
    total_elevation_gain: 800,
    moving_time: 7200,
  },
  {
    id: 1005,
    type: "Run",
    name: "Neujahrslauf",
    start_date: "2025-01-01T00:30:00Z",
    start_date_local: "2025-01-01T01:30:00Z",
    distance: 5000,
    total_elevation_gain: 20,
    moving_time: 1800,
  },
  {
    // Recorded 00:30 local on 1 January; the UTC instant still says 31 December.
    // This is the pair that used to shift the activity into the wrong year.
    id: 1006,
    type: "Run",
    name: "Silvesterlauf",
    start_date: "2024-12-31T23:30:00Z",
    start_date_local: "2025-01-01T00:30:00Z",
    distance: 7000,
    total_elevation_gain: 50,
    moving_time: 2100,
  },
];

/** Builds an Activity with sensible defaults, so tests only state what matters. */
export function mkActivity(over: Partial<Activity> & Pick<Activity, "id">): Activity {
  return {
    provider: "strava",
    sport: "run",
    name: "Activity",
    startDateLocal: "2025-01-01T08:00:00",
    startDateUtc: "2025-01-01T07:00:00Z",
    distanceKm: 0,
    elevationM: 0,
    movingTimeSec: 0,
    isCommute: false,
    isIndoor: false,
    ...over,
  };
}

/** Domain activities exactly as they sit in the IndexedDB cache. */
export const CACHED_DOMAIN: Activity[] = [
  mkActivity({ id: "1001", sport: "run", name: "Morning Run", startDateLocal: "2025-01-15T07:30:00", startDateUtc: "2025-01-15T06:30:00Z", distanceKm: 10.5, elevationM: 120, movingTimeSec: 3600 }),
  mkActivity({ id: "1002", sport: "ride", name: "Feierabendrunde", startDateLocal: "2025-04-05T14:00:00", startDateUtc: "2025-04-05T12:00:00Z", distanceKm: 45, elevationM: 500, movingTimeSec: 5400 }),
  mkActivity({ id: "1003", sport: "swim", name: "Pool", startDateLocal: "2025-05-01T12:00:00", startDateUtc: "2025-05-01T10:00:00Z", distanceKm: 1.5, elevationM: 0, movingTimeSec: 2400 }),
];
