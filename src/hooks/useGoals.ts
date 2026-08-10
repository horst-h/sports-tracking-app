import { useEffect, useState } from "react";
import { loadGoals } from "../repositories/goalsRepository";
import type { YearGoals } from "../domain/metrics/types";

/**
 * Goals for a year, local cache first and backend behind it.
 *
 * `enabled` is not an optimisation. Without a session, loadGoals cannot reach
 * the backend and answers from the cache alone — which on a device that has
 * never held these goals means "no goals at all". Running before sign-in and
 * never running again is exactly how a fresh phone ends up showing an empty
 * year while the desktop, warm cache and all, looks perfectly fine.
 */
export function useGoals(year?: number, enabled = true) {
  const [goals, setGoals] = useState<YearGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const loadData = async () => {
      try {
        const y = year ?? new Date().getFullYear();
        const loaded = await loadGoals(y);
        if (!cancelled) setGoals(loaded);
      } catch (err) {
        console.error("Failed to load goals:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [year, enabled]);

  return { goals, loading };
}
