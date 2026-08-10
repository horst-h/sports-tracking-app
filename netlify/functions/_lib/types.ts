/**
 * Shared types for Goals API
 */

/** Mirrors the client's SportType. Every sport the UI offers a goal for has to
 *  be here, or that goal has nowhere to live but the device that set it. */
export type Sport = "run" | "ride" | "swim";

export interface GoalData {
  distanceKm?: number;
  count?: number;
  elevationM?: number;
}

export interface StoredGoal extends GoalData {
  /**
   * Who the goal belongs to, as "google:<sub>".
   *
   * Replaces the Strava athlete id: Strava access is gone, and Runalyze has no
   * identity endpoint to take its place. The Google subject is stable for the
   * account and, unlike an email address, never reassigned.
   */
  subject: string;
  year: number;
  sport: Sport;
  createdAt: string;  // ISO
  updatedAt: string;  // ISO
  version: number;
}
