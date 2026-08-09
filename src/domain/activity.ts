import type { SportType } from "./sport";

/** Data sources the app can read activities from. */
export type ProviderId = "strava" | "runalyze";

/**
 * The single boundary object between a data source and the calculation core.
 *
 * Everything below src/domain works on this shape (or on NormalizedActivity,
 * derived from it) and knows nothing about the provider it came from.
 * Adding a source means writing a mapper into this type — nothing else.
 */
export type Activity = {
  /** The id as the source system knows it. Unique per provider, not across. */
  id: string;
  provider: ProviderId;

  sport: SportType;
  name: string;

  /**
   * Wall-clock time at the place the activity happened, ISO 8601 *without* a
   * zone suffix (e.g. "2025-01-15T07:30:00").
   *
   * This is what every year/month/day bucket is built from. Keeping it free of
   * a zone suffix is deliberate: `new Date(...)` then reads it as local time,
   * which is what "my January" means to an athlete regardless of where they
   * were standing.
   */
  startDateLocal: string;

  /** The same moment as an absolute instant, ISO 8601 with Z. */
  startDateUtc: string;

  distanceKm: number;
  elevationM: number;
  movingTimeSec: number;

  isCommute: boolean;
  isIndoor: boolean;
};
