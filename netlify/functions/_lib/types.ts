/**
 * Shared types for Goals API
 */

export type Sport = "run" | "ride";

export interface GoalData {
  distanceKm?: number;
  count?: number;
  elevationM?: number;
}

export interface StoredGoal extends GoalData {
  athleteId: number;
  year: number;
  sport: Sport;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  version: number;
}

export interface StravaAthlete {
  id: number;
  username?: string;
  firstname?: string;
  lastname?: string;
}
