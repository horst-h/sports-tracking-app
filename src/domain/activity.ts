import type { SportType } from "./sport";

export type Activity = {
  id: number;
  sport: SportType;
  name: string;
  startDate: string;     // ISO string
  distanceKm: number;
  elevationM: number;
};
