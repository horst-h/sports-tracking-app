import { normalizeActivities } from "./normalize.ts";
import { aggregateYear } from "./aggregate.ts";
import { buildUiAthleteStats } from "./uiStats.ts";
import type { Activity } from "../activity.ts";


// Minimal sample data (Run + Ride)
const sample: Activity[] = [
  {
    id: "1",
    provider: "strava",
    sport: "run",
    name: "Sample run",
    startDateLocal: "2025-11-01T07:10:00",
    startDateUtc: "2025-11-01T06:10:00Z",
    distanceKm: 12,
    elevationM: 180,
    movingTimeSec: 4200,
    isCommute: false,
    isIndoor: false,
  },
  {
    id: "2",
    provider: "strava",
    sport: "run",
    name: "Sample run 2",
    startDateLocal: "2025-11-10T07:20:00",
    startDateUtc: "2025-11-10T06:20:00Z",
    distanceKm: 8,
    elevationM: 90,
    movingTimeSec: 2600,
    isCommute: false,
    isIndoor: false,
  },
  {
    id: "3",
    provider: "strava",
    sport: "ride",
    name: "Sample ride",
    startDateLocal: "2025-11-12T10:00:00",
    startDateUtc: "2025-11-12T09:00:00Z",
    distanceKm: 42,
    elevationM: 600,
    movingTimeSec: 5400,
    isCommute: false,
    isIndoor: false,
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