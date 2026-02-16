// Build AI Context - Transforms athlete data into context for AI analysis
import type { UiAthleteStats } from "../../metrics/uiStats";
import type { Sport } from "../../metrics/types";
import type { AiContext } from "../contracts/aiContext";
import { computeAiEngine } from "../engine";
import { getTimeContext } from "./time";

export function buildAiContext(args: {
  ui: Record<Sport, UiAthleteStats>;
  goals: Record<Sport, { distanceKm?: number; elevationM?: number; count?: number }>;
  today?: Date;
}): AiContext {
  const today = args.today ?? new Date();
  const time = getTimeContext(today);

  // 1) Map UiAthleteStats -> baseline sport snapshots (minimal + safe)
  const baseSports = (["run", "ride"] as Sport[]).reduce((acc, sport) => {
    const s = args.ui[sport];
    if (!s) return acc; // Skip if no data for this sport

    // Access progress metrics: s.progress.distanceKm.ytd, s.progress.count.ytd, etc.
    const ytdDistanceKm = s.progress.distanceKm?.ytd ?? 0;
    const ytdElevationM = s.progress.elevationM?.ytd ?? 0;
    const ytdCount = s.progress.count?.ytd ?? 0;

    const last7dDistanceKm = 0; // TODO: derive from activities if available
    const last28dDistanceKm = 0; // TODO: derive from activities if available
    const avgWeeklyDistanceKm_28d = last28dDistanceKm / 4;

    const last7dElevationM = 0; // TODO: derive from activities if available
    const last28dElevationM = 0; // TODO: derive from activities if available
    const avgWeeklyElevationM_28d = last28dElevationM / 4;

    const last7dCount = 0; // TODO: derive from activities if available
    const last28dCount = 0; // TODO: derive from activities if available
    const avgWeeklyCount_28d = last28dCount / 4;

    const avgKmPerRun =
      sport === "run" && ytdCount > 0 ? (ytdDistanceKm / ytdCount) : undefined;

    acc[sport] = {
      sport,
      ytdDistanceKm,
      ytdElevationM,
      ytdCount,
      last7dDistanceKm,
      last28dDistanceKm,
      avgWeeklyDistanceKm_28d,
      last7dElevationM,
      last28dElevationM,
      avgWeeklyElevationM_28d,
      last7dCount,
      last28dCount,
      avgWeeklyCount_28d,
      avgKmPerRun,
      consistencyScore_0_100: 0, // computed below
      baselineForecastEoy: {},
      requiredPerWeekIfOffTrack: {},
      riskFlags: [],
    };

    return acc;
  }, {} as any);

  // 2) Run deterministic engine to fill forecast/required/risk/consistency
  const enriched = computeAiEngine({
    time,
    goals: args.goals,
    sports: baseSports,
  });

  return {
    version: "1.0",
    time,
    goals: args.goals,
    sports: enriched,
  };
}
