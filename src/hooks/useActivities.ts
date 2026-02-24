import { useEffect, useState } from "react";
import { stravaClient } from "../data/strava/stravaClient";
import { toDomainActivity } from "../data/strava/stravaMapper";
import type { Activity } from "../domain/activity";
import { loadYearActivities, saveYearActivities } from "../repositories/activitiesRepository";

function yearRangeUnixSeconds(year: number) {
  const start = Date.UTC(year, 0, 1, 0, 0, 0) / 1000;       // Jan 1
  const end = Date.UTC(year + 1, 0, 1, 0, 0, 0) / 1000;     // Jan 1 next year
  return { after: Math.floor(start), before: Math.floor(end) };
}

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

export async function fetchYearActivitiesLive(year: number): Promise<Activity[]> {
  const { after, before } = yearRangeUnixSeconds(year);

  const perPage = 50;
  const all: Activity[] = [];

  for (let page = 1; ; page++) {
    const raw = await stravaClient.listActivities({ page, perPage, after, before });
    if (raw.length === 0) break;

    for (const r of raw) {
      const mapped = toDomainActivity(r);
      if (mapped) all.push(mapped);
    }

    // safety: Strava max is usually 200 per_page; with 50 this is fine.
    if (raw.length < perPage) break;
  }

  await saveYearActivities(year, all);
  return all;
}

type UseActivitiesOptions = {
  allowLive?: boolean;
};

export function useActivities(year: number, enabled: boolean, options?: UseActivitiesOptions) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"empty" | "cache" | "live">("empty");
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const allowLive = options?.allowLive ?? true;
    const forceRefresh = refetchTrigger > 0;

    (async () => {
      // 1) Cache laden
      const cached = await loadYearActivities(year);
      if (cached && !cancelled && !forceRefresh) {
        setActivities(cached.activities);
        setSource("cache");
      }

      // 2) Entscheiden ob Refresh nötig
      const isStale = !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;

      if (!allowLive) {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          setError(null);
          if (!cached) setSource("empty");
        }
        return;
      }

      // Beim ersten Mal ohne Cache: "loading", sonst "refreshing"
      if (!cached && !forceRefresh) setLoading(true);
      else if (isStale || forceRefresh) setRefreshing(true);

      if (!isStale && !forceRefresh) {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
          setError(null);
        }
        return;
      }

      // 3) Live laden (nur dieses Jahr)
      try {
        setError(null);
        const all = await fetchYearActivitiesLive(year);

        if (!cancelled) {
          setActivities(all);
          setSource("live");
        }
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [year, enabled, options?.allowLive, refetchTrigger]);

  const refetch = async () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { activities, loading, refreshing, error, source, refetch };
}
