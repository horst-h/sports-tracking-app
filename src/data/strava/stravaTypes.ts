export type StravaAthlete = {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
  profile_medium?: string; // URL to athlete profile image
  profile?: string; // Larger profile image
};

export type StravaActivity = {
  id: number;
  type: string; // "Run", "Ride", ...
  name: string;
  start_date: string; // ISO, UTC
  /**
   * Local wall-clock time at the activity. Strava appends a "Z" here even
   * though the value is *not* UTC — the mapper strips it, see stravaMapper.
   */
  start_date_local?: string;
  distance: number; // meters
  total_elevation_gain: number; // meters
  moving_time?: number; // seconds
  elapsed_time?: number; // seconds
  commute?: boolean;
  trainer?: boolean; // indoor
};
