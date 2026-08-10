import { openSportsDB } from "./db.ts";
import type { YearGoals, Sport, GoalMetric } from "../domain/metrics/types.ts";
import { authHeader } from "./googleSessionRepository.ts";

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
  /** "google:<sub>" — replaced the Strava athlete id when identity moved. */
  subject: string;
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
  // Ensure year is consistent + ensure all sports exist
  const normalized: YearGoals = {
    ...input,
    year,
    perSport: {
      run: { ...(input.perSport?.run ?? {}) },
      ride: { ...(input.perSport?.ride ?? {}) },
      swim: { ...(input.perSport?.swim ?? {}) },
    },
  };

  // Clean invalid metric values
  const sports: Sport[] = ["run", "ride", "swim"];
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

/**
 * The goals API authenticates with the app's own Google session, not with the
 * activity source. Returns null when there is none, and every caller below
 * treats that as "stay local" rather than as an error — goals are always
 * written to the cache first, so an unauthenticated session still works,
 * only without sync.
 */
async function getAuthHeader(): Promise<{ Authorization: string } | null> {
  return authHeader();
}

/**
 * Fetch goal from backend API for a specific sport.
 */
async function fetchGoalFromBackend(year: number, sport: Sport): Promise<RemoteGoal | null> {
  const auth = await getAuthHeader();
  if (!auth) {
    console.warn(`[GoalsRepository] Not signed in; skipping backend fetch (${year}/${sport})`);
    return null;
  }

  try {
    const url = `${API_BASE}?year=${year}&sport=${sport}`;
    console.info(`[GoalsRepository] Fetching goal from backend: ${url}`);
    const response = await fetch(url, { headers: auth });

    if (!response.ok) {
      console.warn(`[GoalsRepository] Failed to fetch goal (${year}/${sport}): HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const goal = data.goal ?? null;
    console.info(`[GoalsRepository] Fetched goal (${year}/${sport}):`, goal);
    return goal;
  } catch (error) {
    console.error(`[GoalsRepository] Error fetching goal (${year}/${sport}):`, error);
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
  const auth = await getAuthHeader();
  if (!auth) {
    console.warn(`[GoalsRepository] Not signed in; goal stays local (${year}/${sport})`);
    return null;
  }

  try {
    console.info(`[GoalsRepository] Saving goal to backend (${year}/${sport}):`, goalData);
    const response = await fetch(API_BASE, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        year,
        sport,
        ...goalData,
      }),
    });

    if (!response.ok) {
      console.error(`[GoalsRepository] Failed to save goal (${year}/${sport}): HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const savedGoal = data.goal ?? null;
    console.info(`[GoalsRepository] Goal saved successfully (${year}/${sport}):`, savedGoal);
    return savedGoal;
  } catch (error) {
    console.error(`[GoalsRepository] Error saving goal (${year}/${sport}):`, error);
    return null;
  }
}

/**
 * Delete goal from backend API for a specific sport.
 */
async function deleteGoalFromBackend(year: number, sport: Sport): Promise<boolean> {
  const auth = await getAuthHeader();
  if (!auth) {
    console.warn(`[GoalsRepository] Not signed in; skipping backend delete (${year}/${sport})`);
    return false;
  }

  try {
    const url = `${API_BASE}?year=${year}&sport=${sport}`;
    console.info(`[GoalsRepository] Deleting goal from backend: ${url}`);
    const response = await fetch(url, { method: "DELETE", headers: auth });

    if (!response.ok) {
      console.error(`[GoalsRepository] Failed to delete goal (${year}/${sport}): HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    const success = data.ok ?? false;
    console.info(`[GoalsRepository] Goal deleted (${year}/${sport}):`, success);
    return success;
  } catch (error) {
    console.error(`[GoalsRepository] Error deleting goal (${year}/${sport}):`, error);
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
      swim: {},
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
  console.info(`[GoalsRepository] saveGoals() called for year ${year}:`, goals);
  
  const normalizedGoals = normalizeYearGoals(year, goals);
  
  // Try to sync with backend
  const sports: Sport[] = ["run", "ride"];
  const remoteGoals: RemoteGoal[] = [];
  
  for (const sport of sports) {
    const sportData = extractSportGoalData(normalizedGoals, sport);
    
    // Only save if there's some data
    if (Object.keys(sportData).length > 0) {
      console.info(`[GoalsRepository] Attempting to save ${sport} goal to backend`);
      const saved = await saveGoalToBackend(year, sport, sportData);
      if (saved) {
        console.info(`[GoalsRepository] ✅ Successfully saved ${sport} goal to backend`);
        remoteGoals.push(saved);
      } else {
        console.warn(`[GoalsRepository] ⚠️ Failed to save ${sport} goal to backend`);
      }
    }
  }
  
  // Determine version from backend response
  const maxVersion = remoteGoals.length > 0
    ? Math.max(...remoteGoals.map(g => g.version))
    : undefined;
  
  console.info(`[GoalsRepository] Synced ${remoteGoals.length} goals to backend, maxVersion: ${maxVersion}`);
  
  // Always save to local cache
  await saveToCache(year, normalizedGoals, maxVersion);
  console.info(`[GoalsRepository] ✅ Goals saved to local cache`);
}

/**
 * Load yearly training goals for a specific year.
 * Returns null if no goals have been set for that year.
 * Uses stale-while-revalidate strategy: returns cache immediately,
 * then fetches from backend and updates if newer.
 */
export async function loadGoals(year: number): Promise<YearGoals | null> {
  console.info(`[GoalsRepository] loadGoals() called for year ${year}`);
  
  // Load from cache immediately
  const cached = await loadFromCache(year);
  console.info(`[GoalsRepository] Loaded from local cache:`, cached);
  
  // Try to fetch from backend in background
  const sports: Sport[] = ["run", "ride"];
  const fetchPromises = sports.map(sport => fetchGoalFromBackend(year, sport));

  // If cache is empty, wait for backend once so users immediately see existing goals.
  if (!cached) {
    try {
      const remoteGoals = await Promise.all(fetchPromises);
      const validGoals = remoteGoals.filter((g): g is RemoteGoal => g !== null);

      if (validGoals.length > 0) {
        const maxVersion = Math.max(...validGoals.map(g => g.version));
        const yearGoals = remoteGoalsToYearGoals(year, validGoals);
        await saveToCache(year, yearGoals, maxVersion);
        console.info(`[GoalsRepository] Cache miss resolved from backend with ${validGoals.length} goals`);
        return yearGoals;
      }
    } catch (error) {
      console.error(`[GoalsRepository] Cache miss backend fetch failed:`, error);
    }

    return null;
  }

  // With cached data, keep stale-while-revalidate behavior.
  const cacheResult = cached?.goals ?? null;
  console.info(`[GoalsRepository] Returning immediately with cache result`);
  
  // Background revalidation
  Promise.all(fetchPromises).then(async (remoteGoals) => {
    const validGoals = remoteGoals.filter((g): g is RemoteGoal => g !== null);
    
    if (validGoals.length === 0) {
      console.info(`[GoalsRepository] No backend goals found for year ${year}`);
      return;
    }
    
    console.info(`[GoalsRepository] Background sync: received ${validGoals.length} goals from backend`);
    
    const maxVersion = Math.max(...validGoals.map(g => g.version));
    const cachedVersion = cached?.version ?? 0;
    
    console.info(`[GoalsRepository] Version check - Backend: ${maxVersion}, Cache: ${cachedVersion}`);
    
    // Only update if backend is newer
    if (maxVersion > cachedVersion) {
      console.info(`[GoalsRepository] ✅ Backend is newer, updating cache`);
      const yearGoals = remoteGoalsToYearGoals(year, validGoals);
      await saveToCache(year, yearGoals, maxVersion);
    } else {
      console.info(`[GoalsRepository] Cache is up-to-date, no update needed`);
    }
  }).catch((error) => {
    console.error(`[GoalsRepository] Background sync error:`, error);
  });
  
  return cacheResult;
}

/**
 * Delete yearly training goals for a specific year.
 * Deletes from both backend and local cache.
 */
export async function deleteGoals(year: number): Promise<void> {
  console.info(`[GoalsRepository] deleteGoals() called for year ${year}`);
  
  // Try to delete from backend
  const sports: Sport[] = ["run", "ride"];
  const deletePromises = sports.map(sport => {
    console.info(`[GoalsRepository] Deleting ${sport} goal from backend`);
    return deleteGoalFromBackend(year, sport);
  });
  
  const results = await Promise.all(deletePromises);
  console.info(`[GoalsRepository] Backend deletions: ${results.filter(Boolean).length}/${results.length} successful`);
  
  // Always delete from cache
  await deleteFromCache(year);
  console.info(`[GoalsRepository] ✅ Goals deleted from local cache`);
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
