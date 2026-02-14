import { useState, useCallback } from "react";
import type { YearGoals } from "../domain/metrics/types.ts";
import * as goalsRepo from "../repositories/goalsRepository.ts";

export function useGoals(year: number) {
  const [goals, setGoals] = useState<YearGoals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await goalsRepo.loadGoals(year);
      setGoals(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [year]);

  const saveGoals = useCallback(
    async (newGoals: YearGoals) => {
      setLoading(true);
      setError(null);
      try {
        await goalsRepo.saveGoals(year, newGoals);
        setGoals(newGoals);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [year]
  );

  const deleteGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await goalsRepo.deleteGoals(year);
      setGoals(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [year]);

  return {
    goals,
    loading,
    error,
    loadGoals,
    saveGoals,
    deleteGoals,
  };
}
