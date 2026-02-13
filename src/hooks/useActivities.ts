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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h (kannst du ändern)

export function useActivities(year: number, enabled: boolean) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"empty" | "cache" | "live">("empty");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      // 1) Cache laden
      const cached = await loadYearActivities(year);
      if (cached && !cancelled) {
        setActivities(cached.activities);
        setSource("cache");
      }

      // 2) Entscheiden ob Refresh nötig
      const isStale = !cached || Date.now() - cached.fetchedAt > CACHE_TTL_MS;

      // Beim ersten Mal ohne Cache: "loading", sonst "refreshing"
      if (!cached) setLoading(true);
      else if (isStale) setRefreshing(true);

      if (!isStale) {
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

        if (!cancelled) {
          setActivities(all);
          setSource("live");
        }

        await saveYearActivities(year, all);
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
  }, [year, enabled]);

  return { activities, loading, refreshing, error, source };
}
