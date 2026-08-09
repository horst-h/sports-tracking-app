import { openSportsDB } from "./db";
import type { Activity } from "../domain/activity";

const STORE = "activitiesByYear";

/**
 * Bumped whenever the cached Activity shape changes.
 *
 * v2 introduced startDateLocal/startDateUtc, movingTimeSec and provider.
 * Entries written before that carry a `startDate` field the domain no longer
 * reads — loading them would yield an invalid date and normalize() would drop
 * every activity without a word. Discarding on mismatch costs one refetch and
 * removes a whole class of silent-empty-dashboard bugs.
 */
const CACHE_SCHEMA_VERSION = 2;

type CachedYearActivities = {
  schemaVersion: number;
  year: number;
  fetchedAt: number; // epoch ms
  activities: Activity[];
};

export async function loadYearActivities(year: number): Promise<CachedYearActivities | null> {
  const d = await openSportsDB();
  const raw = (await d.get(STORE, year)) as Partial<CachedYearActivities> | undefined;
  if (!raw) return null;

  if (raw.schemaVersion !== CACHE_SCHEMA_VERSION) {
    console.info(`[activitiesRepository] Dropping stale cache for ${year} (schema ${raw.schemaVersion ?? "pre-v2"})`);
    await d.delete(STORE, year);
    return null;
  }

  return raw as CachedYearActivities;
}

export async function saveYearActivities(year: number, activities: Activity[]) {
  const d = await openSportsDB();
  const payload: CachedYearActivities = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    year,
    fetchedAt: Date.now(),
    activities,
  };
  await d.put(STORE, payload, year);
}

export async function clearYearActivities(year: number) {
  const d = await openSportsDB();
  await d.delete(STORE, year);
}

export async function listCachedYears(): Promise<number[]> {
  const d = await openSportsDB();
  const keys = await d.getAllKeys(STORE);
  return keys
    .map((key) => Number(key))
    .filter((key) => Number.isFinite(key));
}
