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
  start_date: string; // ISO
  distance: number;   // meters
  total_elevation_gain: number; // meters
};
