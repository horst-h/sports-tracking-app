import { openSportsDB } from "./db.ts";
import type { YearGoals, Sport, GoalMetric } from "../domain/metrics/types.ts";
import { hasSession } from "./googleSessionRepository.ts";

const STORE = "goals";

/**
 * Every sport the app can set a goal for is synced.
 *
 * Leaving one out does not make it "local by design" — it makes it invisible on
 * every other device, which is exactly what happened to swimming while this
 * list said `["run", "ride"]`.
 */
const SPORTS: Sport[] = ["run", "ride", "swim"];
const METRICS: GoalMetric[] = ["count", "distanceKm", "elevationM"];

type GoalData = Partial<Record<GoalMetric, number>>;

/**
 * What this device believes the backend holds for one sport.
 *
 * `syncedAt` is the backend record's own `updatedAt` as we last saw it, so any
 * write from another device shows up here as a mismatch. Tracking it per sport
 * is the whole point: the previous format kept one number for the entire year —
 * the highest version across all sports — so a change to a sport that happened
 * to sit at a lower version never registered as new, and that device stayed
 * wrong forever.
 */
type SportSync = {
  syncedAt?: string;
  /** A local edit that never reached the backend. Retried on the next load. */
  dirty?: boolean;
};

type SyncState = Partial<Record<Sport, SportSync>>;

type GoalsDocV2 = {
  schemaVersion: 2;
  year: number;
  goals: YearGoals;
  /** When this device last wrote the document. Diagnostics only. */
  updatedAt: string;
  sync: SyncState;
};

type CachedGoals = { goals: YearGoals; sync: SyncState };

type RemoteGoal = GoalData & {
  /** "google:<sub>" — replaced the Strava athlete id when identity moved. */
  subject: string;
  year: number;
  sport: Sport;
  createdAt: string;
  updatedAt: string;
  version: number;
};

/**
 * A backend answer, with "the backend says there is no goal" kept apart from
 * "we could not ask". Collapsing the two into `null` is how a flight-mode phone
 * would end up deleting goals that are perfectly fine on the server.
 */
type FetchResult = { ok: true; goal: RemoteGoal | null } | { ok: false };

function nowIso() {
  return new Date().toISOString();
}

function isFiniteNonNegNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= 0;
}

function emptyYearGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {}, swim: {} } };
}

function hasValues(data: GoalData | undefined): boolean {
  return !!data && METRICS.some((m) => data[m] !== undefined);
}

function sameGoalData(a: GoalData | undefined, b: GoalData | undefined): boolean {
  return METRICS.every((m) => (a?.[m] ?? null) === (b?.[m] ?? null));
}

function goalDataOf(remote: RemoteGoal): GoalData {
  const data: GoalData = {};
  for (const m of METRICS) {
    if (isFiniteNonNegNumber(remote[m])) data[m] = remote[m];
  }
  return data;
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
  for (const s of SPORTS) {
    const cleaned: GoalData = {};
    for (const m of METRICS) {
      const v = (normalized.perSport[s] as GoalData | undefined)?.[m];
      if (isFiniteNonNegNumber(v)) cleaned[m] = v;
    }
    normalized.perSport[s] = cleaned;
  }

  return normalized;
}

function wrapDoc(year: number, goals: YearGoals, sync: SyncState): GoalsDocV2 {
  return {
    schemaVersion: 2,
    year,
    goals: normalizeYearGoals(year, goals),
    updatedAt: nowIso(),
    sync,
  };
}

function unwrapDoc(year: number, raw: unknown): CachedGoals | null {
  if (!raw || typeof raw !== "object") return null;

  // Every shape this store has ever held, seen through one lens: the current
  // document, the v1 document, and the bare YearGoals that predates both.
  const doc = raw as Partial<Omit<GoalsDocV2, "schemaVersion">> & {
    schemaVersion?: number;
    perSport?: unknown;
  };

  if (doc.schemaVersion === 2 && doc.goals) {
    return { goals: normalizeYearGoals(year, doc.goals), sync: doc.sync ?? {} };
  }

  // v1 carried a single version number for the whole year, and builds before it
  // stored a bare YearGoals. Neither records which sports the backend has ever
  // seen, so every sport holding a value is treated as an unpushed local edit:
  // the first revalidation either finds a newer record on the backend and takes
  // it, or uploads what is here. Assuming "already synced" would instead throw
  // away goals this device never managed to send — swimming, most of all.
  const legacy: YearGoals | null =
    doc.schemaVersion === 1 && doc.goals
      ? doc.goals
      : doc.perSport && typeof doc.year === "number"
        ? (raw as YearGoals)
        : null;
  if (!legacy) return null;

  const goals = normalizeYearGoals(year, legacy);
  const sync: SyncState = {};
  for (const sport of SPORTS) {
    if (hasValues(goals.perSport[sport])) sync[sport] = { dirty: true };
  }
  return { goals, sync };
}

// ========== Backend API Integration ==========

const API_BASE = "/.netlify/functions/goals";

/**
 * The goals API authenticates with the app's own session cookie, not with the
 * activity source. Without a session the app still works entirely from the
 * local cache — it just does not sync, and nothing local is ever discarded on
 * the strength of an answer we could not obtain. Hence the `hasSession` guard
 * in front of each call rather than a request sent to be refused.
 */
async function fetchGoalFromBackend(year: number, sport: Sport): Promise<FetchResult> {
  if (!(await hasSession())) return { ok: false };

  try {
    const response = await fetch(`${API_BASE}?year=${year}&sport=${sport}`);

    if (!response.ok) {
      console.warn(`[GoalsRepository] Fetch failed (${year}/${sport}): HTTP ${response.status}`);
      return { ok: false };
    }

    const data = await response.json();
    return { ok: true, goal: (data.goal as RemoteGoal | null) ?? null };
  } catch (error) {
    console.error(`[GoalsRepository] Fetch error (${year}/${sport}):`, error);
    return { ok: false };
  }
}

async function saveGoalToBackend(
  year: number,
  sport: Sport,
  goalData: GoalData
): Promise<RemoteGoal | null> {
  if (!(await hasSession())) return null;

  try {
    const response = await fetch(API_BASE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, sport, ...goalData }),
    });

    if (!response.ok) {
      console.error(`[GoalsRepository] Save failed (${year}/${sport}): HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return (data.goal as RemoteGoal | null) ?? null;
  } catch (error) {
    console.error(`[GoalsRepository] Save error (${year}/${sport}):`, error);
    return null;
  }
}

async function deleteGoalFromBackend(year: number, sport: Sport): Promise<boolean> {
  if (!(await hasSession())) return false;

  try {
    const response = await fetch(`${API_BASE}?year=${year}&sport=${sport}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      console.error(`[GoalsRepository] Delete failed (${year}/${sport}): HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();
    return data.ok ?? false;
  } catch (error) {
    console.error(`[GoalsRepository] Delete error (${year}/${sport}):`, error);
    return false;
  }
}

/**
 * Writes one sport to the backend, where an empty goal means deletion.
 *
 * Clearing the last metric of a sport used to send nothing at all, which left
 * the old record standing on the server — the other device kept showing a goal
 * that had been deleted, and this one got it back on the next cache miss.
 *
 * Returns the new sync state, or null when the write did not go through.
 */
async function pushSport(year: number, sport: Sport, data: GoalData): Promise<SportSync | null> {
  if (hasValues(data)) {
    const saved = await saveGoalToBackend(year, sport, data);
    return saved ? { syncedAt: saved.updatedAt } : null;
  }

  const deleted = await deleteGoalFromBackend(year, sport);
  return deleted ? {} : null;
}

// ========== Local cache ==========

async function saveToCache(year: number, goals: YearGoals, sync: SyncState): Promise<void> {
  const db = await openSportsDB();
  await db.put(STORE, wrapDoc(year, goals, sync), year);
}

async function loadFromCache(year: number): Promise<CachedGoals | null> {
  const db = await openSportsDB();
  return unwrapDoc(year, await db.get(STORE, year));
}

async function deleteFromCache(year: number): Promise<void> {
  const db = await openSportsDB();
  await db.delete(STORE, year);
}

// ========== Sync ==========

type Revalidation = {
  goals: YearGoals | null;
  /** True when the visible goals differ from what the caller was handed. */
  changed: boolean;
};

/**
 * Reconciles one year with the backend, sport by sport.
 *
 * Each sport is decided on its own, because that is the granularity the backend
 * stores at. A sport is only touched when the backend actually answered for it;
 * silence leaves the local copy exactly as it is.
 */
async function revalidate(year: number, cached: CachedGoals | null): Promise<Revalidation> {
  const merged = normalizeYearGoals(year, cached?.goals ?? emptyYearGoals(year));
  const sync: SyncState = { ...(cached?.sync ?? {}) };
  let changed = false;
  let touchedSyncState = false;

  const answers = await Promise.all(SPORTS.map((sport) => fetchGoalFromBackend(year, sport)));

  for (const [index, sport] of SPORTS.entries()) {
    const answer = answers[index];
    if (!answer.ok) continue; // offline, signed out, or the call failed — leave it alone

    const remote = answer.goal;
    const state = sync[sport] ?? {};
    const remoteMoved = !!remote && remote.updatedAt !== state.syncedAt;

    // An edit that never left this device, and nobody else has written since:
    // send it now rather than letting it sit here looking synced.
    if (state.dirty && !remoteMoved) {
      const pushed = await pushSport(year, sport, merged.perSport[sport]);
      if (pushed) {
        sync[sport] = pushed;
        touchedSyncState = true;
        console.info(`[GoalsRepository] Pushed pending ${sport} goal for ${year}`);
      }
      continue;
    }

    if (remoteMoved) {
      // Written elsewhere after we last looked, so it wins — including over a
      // local edit that never made it out, which would otherwise resurrect an
      // older value on every device it touches.
      if (state.dirty) {
        console.warn(`[GoalsRepository] Dropping unpushed ${sport} edit; backend is newer`);
      }
      const values = goalDataOf(remote!);
      if (!sameGoalData(merged.perSport[sport], values)) {
        merged.perSport[sport] = values;
        changed = true;
      }
      sync[sport] = { syncedAt: remote!.updatedAt };
      touchedSyncState = true;
      continue;
    }

    if (!remote && state.syncedAt) {
      // We had agreed on a record and it is gone: deleted on another device.
      if (hasValues(merged.perSport[sport])) {
        merged.perSport[sport] = {};
        changed = true;
      }
      sync[sport] = {};
      touchedSyncState = true;
    }
  }

  const anyGoals = SPORTS.some((sport) => hasValues(merged.perSport[sport]));

  // Nothing here and nothing there: do not create a cache entry, or every year
  // ever opened would start showing up in listGoalYears().
  if (!cached && !anyGoals) return { goals: null, changed: false };

  if (changed || touchedSyncState || !cached) {
    await saveToCache(year, merged, sync);
  }

  return { goals: merged, changed };
}

// ========== Public API ==========

export type SaveGoalsResult = {
  /** False when at least one sport stayed on this device. It is retried on the
   *  next load, but until then the other devices do not have it. */
  synced: boolean;
};

/**
 * Save yearly training goals for a specific year.
 * Writes through to the backend where possible, and always to the local cache.
 */
export async function saveGoals(year: number, goals: YearGoals): Promise<SaveGoalsResult> {
  const next = normalizeYearGoals(year, goals);
  const cached = await loadFromCache(year);
  const sync: SyncState = { ...(cached?.sync ?? {}) };
  let synced = true;

  for (const sport of SPORTS) {
    const previous = cached?.goals.perSport[sport];
    const current = next.perSport[sport];
    const state = sync[sport] ?? {};

    // Untouched sports are left alone. Re-sending them would bump the backend's
    // timestamp for nothing and make every other device re-adopt values it
    // already has.
    if (sameGoalData(previous, current) && !state.dirty) continue;

    const pushed = await pushSport(year, sport, current);
    if (pushed) {
      sync[sport] = pushed;
    } else {
      sync[sport] = { ...state, dirty: true };
      synced = false;
    }
  }

  await saveToCache(year, next, sync);
  return { synced };
}

/**
 * Load yearly training goals for a specific year.
 * Returns null if no goals have been set for that year.
 *
 * Cache first, backend behind it. `onRevalidated` is how the fresher answer
 * reaches the screen: without it the background sync would quietly update
 * IndexedDB while the UI kept rendering the copy it was handed, and the change
 * would only appear on the next reload.
 */
export async function loadGoals(
  year: number,
  onRevalidated?: (goals: YearGoals | null) => void
): Promise<YearGoals | null> {
  const cached = await loadFromCache(year);

  // With nothing to show, waiting for the backend beats rendering an empty year
  // — this is a device that has never held these goals.
  if (!cached) {
    try {
      const result = await revalidate(year, null);
      return result.goals;
    } catch (error) {
      console.error(`[GoalsRepository] Initial load failed for ${year}:`, error);
      return null;
    }
  }

  revalidate(year, cached)
    .then((result) => {
      if (result.changed) onRevalidated?.(result.goals);
    })
    .catch((error) => {
      console.error(`[GoalsRepository] Background sync failed for ${year}:`, error);
    });

  return cached.goals;
}

/**
 * Delete yearly training goals for a specific year, backend and cache alike.
 *
 * A backend deletion that fails is not silently absorbed: the local entry goes
 * either way, so the next load finds the surviving record and adopts it back.
 */
export async function deleteGoals(year: number): Promise<void> {
  const results = await Promise.all(SPORTS.map((sport) => deleteGoalFromBackend(year, sport)));
  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.warn(`[GoalsRepository] ${failed} backend deletion(s) failed for ${year}`);
  }

  await deleteFromCache(year);
}

/**
 * Load all yearly training goals for all years.
 * Useful for dashboard or goal management screens.
 */
export async function getAllGoals(): Promise<YearGoals[]> {
  const years = await listGoalYears();
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
