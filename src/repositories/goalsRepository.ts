import { openSportsDB } from "./db.ts";
import type { YearGoals, Sport, GoalMetric } from "../domain/metrics/types.ts";
import { loadToken } from "./tokenRepository.ts";

const STORE = "goals";

type GoalsDocV1 = {
  schemaVersion: 1;
  year: number;
  goals: YearGoals;
  updatedAt: string; // ISO
  version?: number;  // from backend
};

type RemoteGoalData = {
  distanceKm?: number;
  count?: number;
  elevationM?: number;
};

type RemoteGoal = RemoteGoalData & {
  athleteId: number;
  year: number;
  sport: Sport;
  createdAt: string;
  updatedAt: string;
  version: number;
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

function wrapDoc(year: number, goals: YearGoals, version?: number): GoalsDocV1 {
  return {
    schemaVersion: 1,
    year,
    goals: normalizeYearGoals(year, goals),
    updatedAt: nowIso(),
    version,
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

// ========== Backend API Integration ==========

const API_BASE = "/.netlify/functions/goals";

async function getAccessToken(): Promise<string | null> {
  const token = await loadToken();
  if (!token) return null;
  
  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  if (token.expires_at <= now) {
    // Token expired, client should refresh
    return null;
  }
  
  return token.access_token;
}

/**
 * Fetch goal from backend API for a specific sport.
 */
async function fetchGoalFromBackend(year: number, sport: Sport): Promise<RemoteGoal | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const url = `${API_BASE}?year=${year}&sport=${sport}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.goal ?? null;
  } catch {
    return null;
  }
}

/**
 * Save goal to backend API for a specific sport.
 */
async function saveGoalToBackend(
  year: number,
  sport: Sport,
  goalData: RemoteGoalData
): Promise<RemoteGoal | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const response = await fetch(API_BASE, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        year,
        sport,
        ...goalData,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.goal ?? null;
  } catch {
    return null;
  }
}

/**
 * Delete goal from backend API for a specific sport.
 */
async function deleteGoalFromBackend(year: number, sport: Sport): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) return false;

  try {
    const url = `${API_BASE}?year=${year}&sport=${sport}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.ok ?? false;
  } catch {
    return false;
  }
}

/**
 * Convert RemoteGoal array to YearGoals structure.
 */
function remoteGoalsToYearGoals(year: number, goals: RemoteGoal[]): YearGoals {
  const yearGoals: YearGoals = {
    year,
    perSport: {
      run: {},
      ride: {},
    },
  };

  for (const goal of goals) {
    if (goal.year === year) {
      yearGoals.perSport[goal.sport] = {
        ...(goal.distanceKm !== undefined && { distanceKm: goal.distanceKm }),
        ...(goal.count !== undefined && { count: goal.count }),
        ...(goal.elevationM !== undefined && { elevationM: goal.elevationM }),
      };
    }
  }

  return yearGoals;
}

/**
 * Extract goal data for a specific sport from YearGoals.
 */
function extractSportGoalData(goals: YearGoals, sport: Sport): RemoteGoalData {
  return goals.perSport[sport] ?? {};
}

/**
 * Save to local cache.
 */
async function saveToCache(year: number, goals: YearGoals, version?: number): Promise<void> {
  const db = await openSportsDB();
  await db.put(STORE, wrapDoc(year, goals, version), year);
}

/**
 * Load from local cache.
 */
async function loadFromCache(year: number): Promise<{ goals: YearGoals; version?: number } | null> {
  const db = await openSportsDB();
  const raw = await db.get(STORE, year);
  const goals = unwrapDoc(year, raw);
  if (!goals) return null;
  
  const version = raw?.version;
  return { goals, version };
}

/**
 * Delete from local cache.
 */
async function deleteFromCache(year: number): Promise<void> {
  const db = await openSportsDB();
  await db.delete(STORE, year);
}

/**
 * Save yearly training goals for a specific year.
 * Overrides any existing goals for that year.
 * Syncs with backend if authenticated, otherwise saves locally only.
 */
export async function saveGoals(year: number, goals: YearGoals): Promise<void> {
  const normalizedGoals = normalizeYearGoals(year, goals);
  
  // Try to sync with backend
  const sports: Sport[] = ["run", "ride"];
  const remoteGoals: RemoteGoal[] = [];
  
  for (const sport of sports) {
    const sportData = extractSportGoalData(normalizedGoals, sport);
    
    // Only save if there's some data
    if (Object.keys(sportData).length > 0) {
      const saved = await saveGoalToBackend(year, sport, sportData);
      if (saved) {
        remoteGoals.push(saved);
      }
    }
  }
  
  // Determine version from backend response
  const maxVersion = remoteGoals.length > 0
    ? Math.max(...remoteGoals.map(g => g.version))
    : undefined;
  
  // Always save to local cache
  await saveToCache(year, normalizedGoals, maxVersion);
}

/**
 * Load yearly training goals for a specific year.
 * Returns null if no goals have been set for that year.
 * Uses stale-while-revalidate strategy: returns cache immediately,
 * then fetches from backend and updates if newer.
 */
export async function loadGoals(year: number): Promise<YearGoals | null> {
  // Load from cache immediately
  const cached = await loadFromCache(year);
  
  // Try to fetch from backend in background
  const sports: Sport[] = ["run", "ride"];
  const fetchPromises = sports.map(sport => fetchGoalFromBackend(year, sport));
  
  // Don't wait for backend, use cache as initial value
  const cacheResult = cached?.goals ?? null;
  
  // Background revalidation
  Promise.all(fetchPromises).then(async (remoteGoals) => {
    const validGoals = remoteGoals.filter((g): g is RemoteGoal => g !== null);
    
    if (validGoals.length === 0) return; // No backend data
    
    const maxVersion = Math.max(...validGoals.map(g => g.version));
    const cachedVersion = cached?.version ?? 0;
    
    // Only update if backend is newer
    if (maxVersion > cachedVersion) {
      const yearGoals = remoteGoalsToYearGoals(year, validGoals);
      await saveToCache(year, yearGoals, maxVersion);
    }
  }).catch(() => {
    // Ignore background errors
  });
  
  return cacheResult;
}

/**
 * Delete yearly training goals for a specific year.
 * Deletes from both backend and local cache.
 */
export async function deleteGoals(year: number): Promise<void> {
  // Try to delete from backend
  const sports: Sport[] = ["run", "ride"];
  await Promise.all(
    sports.map(sport => deleteGoalFromBackend(year, sport))
  );
  
  // Always delete from cache
  await deleteFromCache(year);
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
