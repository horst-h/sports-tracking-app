// Requirements Engine - Calculates training requirements and recommendations
import type { AiGoal, AiSportSnapshot, AiTimeContext } from "../contracts/aiContext";

export function computeRequiredPerWeek(args: {
  time: AiTimeContext;
  snap: AiSportSnapshot;
  goal: AiGoal;
}): { distanceKm?: number; elevationM?: number; count?: number } {
  const { time, snap, goal } = args;
  const weeks = Math.max(1, time.weeksLeftInYear);

  const req: any = {};

  if (goal.distanceKm != null) {
    const remaining = Math.max(0, goal.distanceKm - snap.ytdDistanceKm);
    req.distanceKm = round1(remaining / weeks);
  }
  if (goal.elevationM != null) {
    const remaining = Math.max(0, goal.elevationM - snap.ytdElevationM);
    req.elevationM = Math.round(remaining / weeks);
  }
  if (goal.count != null) {
    const remaining = Math.max(0, goal.count - snap.ytdCount);
    req.count = round1(remaining / weeks);
  }

  return req;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
