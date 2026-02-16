// Prompt - LLM prompt construction and formatting
import type { AiGoal, AiSportSnapshot } from "../contracts/aiContext";

export function computeConsistency(snap: AiSportSnapshot): number {
  // Simple heuristic: last7d vs avg weekly last28d
  const avg = snap.avgWeeklyDistanceKm_28d;
  if (avg <= 0) return 0;

  const ratio = snap.last7dDistanceKm / avg; // 1.0 is stable
  const score = clamp(100 * Math.min(1.2, ratio) / 1.2, 0, 100);
  return Math.round(score);
}

export function computeRiskFlags(args: {
  snap: AiSportSnapshot;
  goal: AiGoal;
}): AiSportSnapshot["riskFlags"] {
  const { snap } = args;
  const flags: AiSportSnapshot["riskFlags"] = [];

  // volume spike: last7d much higher than weekly avg last28d
  if (snap.avgWeeklyDistanceKm_28d > 0 && snap.last7dDistanceKm > snap.avgWeeklyDistanceKm_28d * 1.6) {
    flags.push("VOLUME_SPIKE");
  }

  // inconsistent: very low last28d
  if (snap.last28dCount < 2) {
    flags.push("INCONSISTENT");
  }

  // low recovery placeholder (you can refine later with load model)
  if (snap.last7dCount >= 6) {
    flags.push("LOW_RECOVERY");
  }

  return flags;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
