import type { Activity } from "../../domain/activity";
import type {
  ActivityProvider,
  AthleteProfile,
  ProviderCapabilities,
} from "../ports/activityProvider";
import { runalyzeClient } from "./runalyzeClient";
import { toDomainActivities, type SkippedActivity } from "./runalyzeMapper";

/** Runalyze's maximum; the whole history fits in a handful of pages. */
const ITEMS_PER_PAGE = 200;

/** Backstop against a pagination bug turning into an endless loop. */
const MAX_PAGES = 50;

const capabilities: ProviderCapabilities = {
  // No date filter in the API — the year is narrowed here, after fetching.
  serverSideDateFilter: false,
  // /ping proves the token works but returns no identity, and there is no
  // athlete endpoint. Nothing here can key stored goals.
  stableAthleteId: false,
  avatarUrl: false,
  commuteFlag: false,
  indoorFlag: false,
};

/** Reports across the whole history, not per year — the fetch is not year-scoped. */
function reportSkipped(skipped: SkippedActivity[]) {
  if (skipped.length === 0) return;
  const byReason = skipped.reduce<Record<string, number>>((acc, s) => {
    const key = s.reason === "untracked-sport" ? s.sport : s.reason;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  console.info(`[runalyze] skipped ${skipped.length} activities`, byReason);
}

/**
 * Fetches the complete history, once.
 *
 * Every year needs the same full download because Runalyze cannot filter by
 * date, so concurrent calls for different years share one request instead of
 * each paging through the account. The promise is dropped as soon as it
 * settles: the real cache is IndexedDB, and holding results here would make
 * pull-to-refresh return stale data.
 */
let inFlight: Promise<Activity[]> | null = null;

async function fetchAll(signal?: AbortSignal): Promise<Activity[]> {
  const all: Activity[] = [];
  const skipped: SkippedActivity[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const raw = await runalyzeClient.listActivities(
      { page, itemsPerPage: ITEMS_PER_PAGE },
      signal
    );
    if (raw.length === 0) break;

    const mapped = toDomainActivities(raw);
    all.push(...mapped.activities);
    skipped.push(...mapped.skipped);

    // A short page means the end of the history.
    if (raw.length < ITEMS_PER_PAGE) break;

    if (page === MAX_PAGES) {
      console.warn(
        `[runalyze] stopped at the ${MAX_PAGES} page cap — the history may be incomplete`
      );
    }
  }

  reportSkipped(skipped);
  return all;
}

export const runalyzeActivityProvider: ActivityProvider = {
  id: "runalyze",
  capabilities,

  async listYearActivities(year: number, signal?: AbortSignal): Promise<Activity[]> {
    // The abort signal is intentionally not passed into a shared request: a
    // second caller must not have its fetch cancelled by the first one giving
    // up. It is still honoured for the caller's own wait below.
    if (!inFlight) {
      inFlight = fetchAll().finally(() => {
        inFlight = null;
      });
    }

    const all = await inFlight;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    // startDateLocal is wall-clock time without a zone suffix, so the first
    // four characters are the athlete's own year. Comparing strings avoids a
    // Date round-trip that could shift the boundary.
    const prefix = String(year);
    return all.filter((a) => a.startDateLocal.slice(0, 4) === prefix);
  },

  async getAthlete(): Promise<AthleteProfile> {
    // There is no identity endpoint. /ping at least turns a broken token into
    // an error here, instead of into an empty year further downstream.
    await runalyzeClient.ping();

    return { id: null, displayName: "Athlete" };
  },
};
