import { useEffect, useState } from "react";
import { stravaClient } from "../data/strava/stravaClient";
import type { StravaAthlete } from "../data/strava/stravaTypes";

export function useAthlete(enabled: boolean) {
  const [athlete, setAthlete] = useState<StravaAthlete | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const a = await stravaClient.getAthlete();
        if (!cancelled) setAthlete(a);
      } catch (e: any) {
        if (!cancelled) setError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { athlete, loading, error };
}
