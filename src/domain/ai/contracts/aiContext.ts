// AI Context Contract - Type definitions for context passed to AI engine
import type { Sport } from "../../metrics/types";

export type AiTimeContext = {
  todayISO: string;          // "2026-02-16"
  year: number;              // 2026
  weekOfYear: number;        // 1..53
  weeksLeftInYear: number;   // 0..52
  daysLeftInYear: number;    // 0..366
};

export type AiGoal = {
  distanceKm?: number;
  elevationM?: number;
  count?: number;
};

export type AiSportSnapshot = {
  sport: Sport;

  // YTD
  ytdDistanceKm: number;
  ytdElevationM: number;
  ytdCount: number;

  // recent trends (deterministic)
  last7dDistanceKm: number;
  last28dDistanceKm: number;
  avgWeeklyDistanceKm_28d: number;

  last7dElevationM: number;
  last28dElevationM: number;
  avgWeeklyElevationM_28d: number;

  last7dCount: number;
  last28dCount: number;
  avgWeeklyCount_28d: number;

  // derived
  avgKmPerRun?: number; // only meaningful for running
  consistencyScore_0_100: number;

  // deterministic outputs
  baselineForecastEoy: {
    distanceKm?: number;
    elevationM?: number;
    count?: number;
  };

  requiredPerWeekIfOffTrack: {
    distanceKm?: number;
    elevationM?: number;
    count?: number;
  };

  riskFlags: Array<
    | "VOLUME_SPIKE"
    | "LOW_RECOVERY"
    | "INCONSISTENT"
  >;
};

export type AiContext = {
  version: "1.0";
  time: AiTimeContext;
  goals: Record<Sport, AiGoal>;
  sports: Record<Sport, AiSportSnapshot>;
};
