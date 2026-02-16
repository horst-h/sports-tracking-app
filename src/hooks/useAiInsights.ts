// AI Insights Hook - React hook for AI-powered insights and recommendations
import { useEffect, useState } from "react";
import type { UiAthleteStats } from "../domain/metrics/uiStats";
import type { Sport } from "../domain/metrics/types";
import type { AiResponse } from "../domain/ai/contracts/aiResponse";
import { fetchAiInsightsViaProxy } from "../domain/ai/llm/client";

export function useAiInsights(args: {
  ui: UiAthleteStats | null;
  goals: Record<Sport, { distanceKm?: number; elevationM?: number; count?: number }>;
  enabled: boolean; // privacy toggle
}) {
  const [resp, setResp] = useState<AiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // TODO: build Context from individual UiAthleteStats per sport
  // For now, return empty to avoid type conflicts
  const ctx = null; // buildAiContext expects Record<Sport, UiAthleteStats> but args.ui is single sport

  useEffect(() => {
    let cancelled = false;
    if (!args.enabled || !ctx) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const r = await fetchAiInsightsViaProxy({ ctx });
        if (!cancelled) setResp(r);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "AI error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [args.enabled, ctx]);

  return { ctx, resp, loading, err };
}
