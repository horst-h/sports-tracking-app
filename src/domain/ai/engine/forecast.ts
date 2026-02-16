// Forecast Engine - AI-powered forecast analysis and recommendations
import type { AiSportSnapshot, AiTimeContext } from "../contracts/aiContext";

export function computeForecast(args: {
  time: AiTimeContext;
  snap: AiSportSnapshot;
}): { distanceKm?: number; elevationM?: number; count?: number } {
  const { time, snap } = args;

  // Baseline: use last-28d weekly average projected over remaining weeks + current YTD
  const projectedDistance = snap.ytdDistanceKm + snap.avgWeeklyDistanceKm_28d * time.weeksLeftInYear;
  const projectedElevation = snap.ytdElevationM + snap.avgWeeklyElevationM_28d * time.weeksLeftInYear;
  const projectedCount = snap.ytdCount + snap.avgWeeklyCount_28d * time.weeksLeftInYear;

  return {
    distanceKm: round1(projectedDistance),
    elevationM: Math.round(projectedElevation),
    count: Math.round(projectedCount),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
