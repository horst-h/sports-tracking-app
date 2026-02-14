import { normalizeActivities } from "./normalize.ts";
import { aggregateYear } from "./aggregate.ts";
import { buildUiAthleteStats } from "./uiStats.ts";
import type { StravaActivityLike } from "./types.ts";


// Minimal sample data (Run + Ride)
const sample: StravaActivityLike[] = [
  {
    id: 1,
    type: "Run",
    start_date_local: "2025-11-01T07:10:00",
    distance: 12000,
    total_elevation_gain: 180,
    moving_time: 4200,
  },
  {
    id: 2,
    type: "Run",
    start_date_local: "2025-11-10T07:20:00",
    distance: 8000,
    total_elevation_gain: 90,
    moving_time: 2600,
  },
  {
    id: 3,
    type: "Ride",
    start_date_local: "2025-11-12T10:00:00",
    distance: 42000,
    total_elevation_gain: 600,
    moving_time: 5400,
  },
];

export function runSmoke() {
  const year = 2026;
  const asOf = "2026-01-01T08:38:08";
  const retrievedAt = new Date(asOf).toString();

  const normalized = normalizeActivities(sample);

  const runAgg = aggregateYear(normalized, year, "run", asOf);
  const rideAgg = aggregateYear(normalized, year, "ride", asOf);

  const runUi = buildUiAthleteStats({
    aggregate: runAgg,
    asOfDateLocal: asOf,
    retrievedAtLocal: retrievedAt,
    goals: undefined,
    mode: "ytd",
  });

  const rideUi = buildUiAthleteStats({
    aggregate: rideAgg,
    asOfDateLocal: asOf,
    retrievedAtLocal: retrievedAt,
    goals: undefined,
    mode: "ytd",
  });

  // eslint-disable-next-line no-console
  console.log("SMOKE run:", runUi);
  // eslint-disable-next-line no-console
  console.log("SMOKE ride:", rideUi);

  return { runUi, rideUi };
}
runSmoke();