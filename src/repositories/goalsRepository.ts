import { openSportsDB } from "./db.ts";
import type { YearGoals, Sport, GoalMetric } from "../domain/metrics/types.ts";

const STORE = "goals";

type GoalsDocV1 = {
  schemaVersion: 1;
  year: number;
  goals: YearGoals;
  updatedAt: string; // ISO
};

function nowIso() {
  return new Date().toISOString();
}

function isFiniteNonNegNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function normalizeYearGoals(year: number, input: YearGoals): YearGoals {
  // Ensure year is consistent + ensure both sports exist
  const normalized: YearGoals = {
    ...input,
    year,
    perSport: {
      run: { ...(input.perSport?.run ?? {}) },
      ride: { ...(input.perSport?.ride ?? {}) },
    },
  };

  // Clean invalid metric values
  const sports: Sport[] = ["run", "ride"];
  const metrics: GoalMetric[] = ["count", "distanceKm", "elevationM"];

  for (const s of sports) {
    const cleaned: Partial<Record<GoalMetric, number>> = {};
    for (const m of metrics) {
      const v = (normalized.perSport[s] as any)?.[m];
      if (isFiniteNonNegNumber(v)) cleaned[m] = v;
    }
    normalized.perSport[s] = cleaned;
  }

  return normalized;
}

function wrapDoc(year: number, goals: YearGoals): GoalsDocV1 {
  return {
    schemaVersion: 1,
    year,
    goals: normalizeYearGoals(year, goals),
    updatedAt: nowIso(),
  };
}

function unwrapDoc(year: number, raw: any): YearGoals | null {
  if (!raw) return null;

  // Backward compatibility: older versions stored YearGoals directly
  if (raw?.perSport && typeof raw?.year === "number") {
    return normalizeYearGoals(year, raw as YearGoals);
  }

  // Current format
  if (raw?.schemaVersion === 1 && raw?.goals) {
    return normalizeYearGoals(year, raw.goals as YearGoals);
  }

  return null;
}

/**
 * Save yearly training goals for a specific year.
 * Overrides any existing goals for that year.
 */
export async function saveGoals(year: number, goals: YearGoals): Promise<void> {
  const db = await openSportsDB();
  await db.put(STORE, wrapDoc(year, goals), year);
}

/**
 * Load yearly training goals for a specific year.
 * Returns null if no goals have been set for that year.
 */
export async function loadGoals(year: number): Promise<YearGoals | null> {
  const db = await openSportsDB();
  const raw = await db.get(STORE, year);
  return unwrapDoc(year, raw);
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
  const keys = await db.getAllKeys(STORE);

  const years = keys
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);

  const all = await Promise.all(years.map((y) => loadGoals(y)));
  return all.filter((g): g is YearGoals => !!g);
}

/**
 * List all years that have goals stored.
 */
export async function listGoalYears(): Promise<number[]> {
  const db = await openSportsDB();
  const keys = await db.getAllKeys(STORE);
  return keys
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n))
    .sort((a, b) => a - b);
}

/**
 * Clear all goals (useful for testing or reset scenarios).
 */
export async function clearAllGoals(): Promise<void> {
  const db = await openSportsDB();
  await db.clear(STORE);
}
