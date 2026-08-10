/**
 * The slice of the Runalyze activity payload this app reads.
 *
 * Runalyze returns roughly sixty fields per activity (VO2max estimates,
 * decoupling, power models, ...). Only what the calculation core consumes is
 * typed here; everything else is deliberately left off so the mapper cannot
 * quietly start depending on it.
 *
 * Field semantics below were measured against a live account by the AP0 spike
 * (scripts/runalyze-spike.ts), not read off the documentation.
 */
export type RunalyzeActivity = {
  id: number;

  /** Sport ids are per account. See SPORT_IDS in runalyzeMapper.ts. */
  sport?: { id?: number; name?: string };
  sport_id?: number;

  /**
   * Full ISO 8601 *with* an explicit UTC offset, e.g.
   * "2023-03-26T14:56:19+02:00". The local wall-clock time is literally the
   * prefix; the instant is what Date parses.
   */
  date_time?: string;

  /** Minutes east of UTC. Redundant with the suffix in date_time. */
  timezone_offset?: number;

  title?: string;

  /** KILOMETRES, not metres — unlike Strava. Verified via implied speed. */
  distance?: number;

  /** Active time in seconds; the counterpart to Strava's moving_time. */
  duration?: number;

  /** Wall-clock duration in seconds, including pauses. */
  elapsed_time?: number;

  /** Runalyze's own elevation, corrected against map data. */
  elevation_up?: number;

  /** Elevation as the recording device reported it. */
  elevation_up_file?: number;

  /** Which correction was applied, e.g. "mapzen". */
  elevation_source?: string;

  /** Import origin, e.g. "garmin". */
  source?: string;
};
