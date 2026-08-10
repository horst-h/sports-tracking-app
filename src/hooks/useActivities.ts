import { useEffect, useState } from "react";
import { getActivityProvider, getActivityProviderId } from "../data/providerRegistry";
import type { Activity } from "../domain/activity";
import { loadYearActivities, saveYearActivities } from "../repositories/activitiesRepository";

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3h

export async function fetchYearActivitiesLive(year: number): Promise<Activity[]> {
  const provider = getActivityProvider();
  const all = await provider.listYearActivities(year);
  // Cached under the provider that produced it, never under the year alone.
  await saveYearActivities(provider.id, year, all);
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
  const [lastSync, setLastSync] = useState<Date | undefined>(undefined);
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Selecting a different source is a full page load, so this is stable for
  // the lifetime of the hook. Listed as a dependency all the same, so the
  // effect stays honest about what it reads.
  const providerId = getActivityProviderId();

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const allowLive = options?.allowLive ?? true;
    const forceRefresh = refetchTrigger > 0;

    (async () => {
      // 1) Cache laden
      const cached = await loadYearActivities(providerId, year);
      if (cached && !cancelled && !forceRefresh) {
        setActivities(cached.activities);
        setLastSync(new Date(cached.fetchedAt));
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
          setLastSync(new Date());
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
  }, [year, enabled, options?.allowLive, refetchTrigger, providerId]);

  const refetch = async () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { activities, loading, refreshing, error, source, lastSync, refetch };
}
