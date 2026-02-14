import { openSportsDB } from "./db.ts";
import type { YearGoals } from "../domain/metrics/types.ts";

const STORE = "goals";

/**
 * Save yearly training goals for a specific year.
 * Overrides any existing goals for that year.
 */
export async function saveGoals(year: number, goals: YearGoals): Promise<void> {
  const db = await openSportsDB();
  await db.put(STORE, goals, year);
}

/**
 * Load yearly training goals for a specific year.
 * Returns null if no goals have been set for that year.
 */
export async function loadGoals(year: number): Promise<YearGoals | null> {
  const db = await openSportsDB();
  const goals = await db.get(STORE, year);
  return goals ?? null;
}

/**
 * Delete yearly training goals for a specific year.
 */
export async function deleteGoals(year: number): Promise<void> {
  const db = await openSportsDB();
  await db.delete(STORE, year);
}

/**
 * Load all yearly training goals for all years.
 * Useful for dashboard or goal management screens.
 */
export async function getAllGoals(): Promise<YearGoals[]> {
  const db = await openSportsDB();
  const allGoals = await db.getAll(STORE);
  return allGoals.filter((g): g is YearGoals => g !== null);
}

/**
 * Clear all goals (useful for testing or reset scenarios).
 */
export async function clearAllGoals(): Promise<void> {
  const db = await openSportsDB();
  await db.clear(STORE);
}
