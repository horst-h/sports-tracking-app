import { openSportsDB } from "./db";
import type { Activity, ProviderId } from "../domain/activity";
import type { SportType } from "../domain/sport";
import { toLocalWallClock } from "../utils/localTime";

const STORE = "activitiesByYear";

/**
 * Cache entries are scoped to the provider they came from.
 *
 * Before this, the key was the bare year. With two sources that read the same
 * calendar year, one would overwrite the other on every refresh and the totals
 * shown would depend on whichever fetch happened last. Keeping them apart is
 * what makes switching sources a comparison instead of a destructive act.
 */
export function cacheKey(provider: ProviderId, year: number): string {
  return `${provider}:${year}`;
}

/** Entries written before the key carried a provider. Strava data by definition. */
function isLegacyKey(key: IDBValidKey): boolean {
  return /^\d{4}$/.test(String(key));
}

/**
 * Bumped whenever the cached Activity shape changes.
 *
 * v2 introduced startDateLocal/startDateUtc, movingTimeSec and provider.
 */
const CACHE_SCHEMA_VERSION = 2;

type CachedYearActivities = {
  schemaVersion: number;
  year: number;
  fetchedAt: number; // epoch ms
  activities: Activity[];
};

/** The shape written before the provider refactoring. */
type LegacyActivity = {
  id: number | string;
  sport: SportType;
  name?: string;
  startDate: string;
  distanceKm: number;
  elevationM: number;
};

function isLegacyActivity(a: unknown): a is LegacyActivity {
  if (!a || typeof a !== "object") return false;
  const r = a as Record<string, unknown>;
  return typeof r.startDate === "string" && typeof r.sport === "string";
}

/**
 * Upgrades a pre-v2 cache entry in place rather than discarding it.
 *
 * This cache can be the only surviving copy of an athlete's history — if the
 * upstream API is unreachable, throwing it away destroys data that cannot be
 * fetched again. Everything the old shape held is preserved; movingTimeSec is
 * the one gap, and it was never stored before either.
 *
 * startDateLocal is derived the way the old pipeline interpreted startDate:
 * the UTC instant read in the current zone. That reproduces exactly the years
 * and months the athlete saw before the upgrade.
 */
function migrateLegacyActivity(a: LegacyActivity): Activity | null {
  const d = new Date(a.startDate);
  if (Number.isNaN(d.getTime())) return null;

  return {
    id: String(a.id),
    provider: "strava",
    sport: a.sport,
    name: a.name ?? "",
    startDateLocal: toLocalWallClock(d),
    startDateUtc: a.startDate,
    distanceKm: a.distanceKm ?? 0,
    elevationM: a.elevationM ?? 0,
    movingTimeSec: 0, // never present in the legacy shape
    isCommute: false,
    isIndoor: false,
  };
}

export function migrateLegacyCache(raw: unknown): CachedYearActivities | null {
  if (!raw || typeof raw !== "object") return null;
  const doc = raw as { year?: unknown; fetchedAt?: unknown; activities?: unknown };

  if (!Array.isArray(doc.activities)) return null;
  if (typeof doc.year !== "number") return null;

  const migrated = (doc.activities as unknown[])
    .filter(isLegacyActivity)
    .map(migrateLegacyActivity)
    .filter((a): a is Activity => a !== null);

  // An entry that held activities but yielded none is not a legacy document —
  // better to report nothing than to silently claim an empty year.
  if (doc.activities.length > 0 && migrated.length === 0) return null;

  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    year: doc.year,
    fetchedAt: typeof doc.fetchedAt === "number" ? doc.fetchedAt : 0,
    activities: migrated,
  };
}

export async function loadYearActivities(
  provider: ProviderId,
  year: number
): Promise<CachedYearActivities | null> {
  const d = await openSportsDB();
  const key = cacheKey(provider, year);

  let raw = (await d.get(STORE, key)) as Partial<CachedYearActivities> | undefined;

  // Nothing under the new key: an entry from before the split may still sit
  // under the bare year. It holds Strava data, so only Strava may claim it.
  const adopted = !raw && provider === "strava";
  if (adopted) {
    raw = (await d.get(STORE, year)) as Partial<CachedYearActivities> | undefined;
  }
  if (!raw) return null;

  let entry: CachedYearActivities;

  if (raw.schemaVersion === CACHE_SCHEMA_VERSION) {
    // Already current and already in the right place — nothing to write.
    if (!adopted) return raw as CachedYearActivities;
    entry = raw as CachedYearActivities;
  } else {
    const migrated = migrateLegacyCache(raw);
    if (!migrated) {
      console.warn(`[activitiesRepository] Cache for ${key} is unreadable and was left untouched`);
      return null;
    }
    entry = migrated;
    console.info(
      `[activitiesRepository] Migrated ${entry.activities.length} cached activities for ${key} to schema v${CACHE_SCHEMA_VERSION}`
    );
  }

  // Persist the upgrade, and the move, so both happen once.
  await d.put(STORE, entry, key);
  if (adopted) {
    await d.delete(STORE, year);
    console.info(`[activitiesRepository] Adopted the pre-provider cache for ${year} as ${key}`);
  }

  return entry;
}

export async function saveYearActivities(
  provider: ProviderId,
  year: number,
  activities: Activity[]
) {
  const d = await openSportsDB();
  const payload: CachedYearActivities = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    year,
    fetchedAt: Date.now(),
    activities,
  };
  await d.put(STORE, payload, cacheKey(provider, year));
}

export async function clearYearActivities(provider: ProviderId, year: number) {
  const d = await openSportsDB();
  await d.delete(STORE, cacheKey(provider, year));
  if (provider === "strava") await d.delete(STORE, year);
}

export async function listCachedYears(provider: ProviderId): Promise<number[]> {
  const d = await openSportsDB();
  const keys = await d.getAllKeys(STORE);
  const prefix = `${provider}:`;

  const years = keys.map((key) => {
    const s = String(key);
    if (s.startsWith(prefix)) return Number(s.slice(prefix.length));
    // Not yet adopted, but it is Strava's history all the same.
    if (provider === "strava" && isLegacyKey(key)) return Number(s);
    return NaN;
  });

  return [...new Set(years.filter(Number.isFinite))].sort((a, b) => a - b);
}
