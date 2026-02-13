import type { SportType } from "./sport";

export type YearSportStats = {
  year: number;
  sport: SportType;
  count: number;
  distanceKm: number;
  elevationM: number;
};
