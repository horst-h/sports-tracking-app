import type { Activity } from "../../domain/activity";
import type {
  ActivityProvider,
  AthleteProfile,
  ProviderCapabilities,
} from "../ports/activityProvider";
import { stravaClient } from "./stravaClient";
import { toDomainActivities, type SkippedActivity } from "./stravaMapper";

const PER_PAGE = 50;

const capabilities: ProviderCapabilities = {
  serverSideDateFilter: true,
  stableAthleteId: true,
  avatarUrl: true,
  commuteFlag: true,
  indoorFlag: true,
};

/** Unix second bounds of a calendar year, as Strava's after/before expect them. */
function yearRangeUnixSeconds(year: number) {
  const start = Date.UTC(year, 0, 1, 0, 0, 0) / 1000;
  const end = Date.UTC(year + 1, 0, 1, 0, 0, 0) / 1000;
  return { after: Math.floor(start), before: Math.floor(end) };
}

function reportSkipped(year: number, skipped: SkippedActivity[]) {
  if (skipped.length === 0) return;
  const byType = skipped.reduce<Record<string, number>>((acc, s) => {
    acc[s.type] = (acc[s.type] ?? 0) + 1;
    return acc;
  }, {});
  console.info(`[strava] ${year}: skipped ${skipped.length} untracked activities`, byType);
}

export const stravaActivityProvider: ActivityProvider = {
  id: "strava",
  capabilities,

  async listYearActivities(year: number, signal?: AbortSignal): Promise<Activity[]> {
    const { after, before } = yearRangeUnixSeconds(year);

    const all: Activity[] = [];
    const skipped: SkippedActivity[] = [];

    for (let page = 1; ; page++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const raw = await stravaClient.listActivities({ page, perPage: PER_PAGE, after, before });
      if (raw.length === 0) break;

      const mapped = toDomainActivities(raw);
      all.push(...mapped.activities);
      skipped.push(...mapped.skipped);

      // Strava caps per_page at 200; a short page means we reached the end.
      if (raw.length < PER_PAGE) break;
    }

    reportSkipped(year, skipped);
    return all;
  },

  async getAthlete(): Promise<AthleteProfile> {
    const a = await stravaClient.getAthlete();
    const name = [a.firstname, a.lastname].filter(Boolean).join(" ");

    return {
      id: String(a.id),
      displayName: name || a.username || "Athlete",
      avatarUrl: a.profile_medium,
    };
  },
};
