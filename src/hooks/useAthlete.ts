import { useEffect, useState } from "react";
import { getActivityProvider } from "../data/providerRegistry";
import type { AthleteProfile } from "../data/ports/activityProvider";

export function useAthlete(enabled: boolean) {
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const a = await getActivityProvider().getAthlete();
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
