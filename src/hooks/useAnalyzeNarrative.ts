import { useEffect, useMemo, useState } from "react";
import type { AnalyzeFacts, AnalyzeNarrative } from "../domain/ai/contracts/analyzeNarrative";
import { fetchAnalyzeNarrativeViaProxy } from "../domain/ai/llm/client";

type DebugInfo = {
  source: "cache" | "llm" | "fallback";
  model?: string;
  durationMs?: number;
  timestamp: string;
};

export type AnalyzeNarrativeResult = {
  data: AnalyzeNarrative | null;
  loading: boolean;
  error: string | null;
  debug: DebugInfo | null;
};

function cacheKey(f: AnalyzeFacts) {
  const day = new Date().toISOString().slice(0, 10);
  return `analyzeNarrative:v1:${day}:${JSON.stringify(f)}`;
}

export function useAnalyzeNarrative(facts: AnalyzeFacts | null, enabled: boolean): AnalyzeNarrativeResult {
  const [data, setData] = useState<AnalyzeNarrative | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<DebugInfo | null>(null);

  const key = useMemo(() => (facts ? cacheKey(facts) : null), [facts]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!enabled || !facts || !key) return;

      // Try cache first
      const cached = localStorage.getItem(key);
      if (cached) {
        try {
          const cachedData = JSON.parse(cached);
          setData(cachedData);
          setDebug({
            source: "cache",
            timestamp: new Date().toISOString(),
          });
          console.log("[DEBUG] Narrative from CACHE");
          return;
        } catch {
          localStorage.removeItem(key);
        }
      }

      // Fetch from LLM
      try {
        setLoading(true);
        setError(null);
        console.log("[DEBUG] Narrative from LLM - fetching...");
        const r = await fetchAnalyzeNarrativeViaProxy({ facts });
        if (cancelled) return;
        
        setData(r);
        setDebug({
          source: "llm",
          model: (r as any)?._debug?.model,
          durationMs: (r as any)?._debug?.durationMs,
          timestamp: new Date().toISOString(),
        });
        console.log("[DEBUG] Narrative from LLM - success", r);
        
        // Store in cache (without _debug field)
        const { _debug, ...cleanData } = r as any;
        localStorage.setItem(key, JSON.stringify(cleanData));
      } catch (e: any) {
        console.log("[DEBUG] Narrative ERROR", e?.message ?? e);
        if (!cancelled) {
          setError(e?.message ?? "AI error");
          setDebug({
            source: "fallback",
            timestamp: new Date().toISOString(),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [enabled, facts, key]);

  return { data, loading, error, debug };
}
