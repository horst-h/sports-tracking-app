import { useEffect, useState } from "react";
import { loadGoals } from "../repositories/goalsRepository";
import type { YearGoals } from "../domain/metrics/types";

export function useGoals(year?: number) {
  const [goals, setGoals] = useState<YearGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const y = year ?? new Date().getFullYear();
        const loaded = await loadGoals(y);
        setGoals(loaded);
      } catch (err) {
        console.error("Failed to load goals:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [year]);

  return { goals, loading };
}
