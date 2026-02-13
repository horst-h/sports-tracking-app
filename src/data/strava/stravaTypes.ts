export type StravaAthlete = {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
};

export type StravaActivity = {
  id: number;
  type: string; // "Run", "Ride", ...
  name: string;
  start_date: string; // ISO
  distance: number;   // meters
  total_elevation_gain: number; // meters
};
