import { normalizeActivities } from "./normalize.ts";
import { buildDashboardModel } from "./dashboard.ts";
import type { StravaActivityLike, YearGoals } from "./types.ts";

const sample: StravaActivityLike[] = [
  { id: 1, type: "Run",  start_date_local: "2026-01-05T07:10:00", distance: 8000, total_elevation_gain: 120, moving_time: 2700 },
  { id: 2, type: "Run",  start_date_local: "2026-02-02T07:20:00", distance: 12000, total_elevation_gain: 180, moving_time: 4200 },
  { id: 3, type: "Ride", start_date_local: "2026-01-12T10:00:00", distance: 42000, total_elevation_gain: 600, moving_time: 5400 },
];

const goals: YearGoals = {
  year: 2026,
  perSport: {
    run: { count: 80, distanceKm: 650, elevationM: 8000 },
    ride: { count: 60, distanceKm: 2500, elevationM: 25000 },
  }
};

const normalized = normalizeActivities(sample);
const model = buildDashboardModel({
  normalized,
  year: 2026,
  goals,
  asOfDateLocal: "2026-02-14T12:00:00",
});

console.log(JSON.stringify(model, null, 2));
