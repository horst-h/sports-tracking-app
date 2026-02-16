import type { AiGoal, AiSportSnapshot, AiTimeContext } from "../contracts/aiContext";
import { computeForecast } from "./forecast";
import { computeRequiredPerWeek } from "./requirements";
import { computeRiskFlags, computeConsistency } from "./risk";

export function computeAiEngine(args: {
  time: AiTimeContext;
  goals: Record<string, AiGoal>;
  sports: Record<string, AiSportSnapshot>;
}): Record<string, AiSportSnapshot> {
  const out: Record<string, AiSportSnapshot> = { ...args.sports };

  for (const sport of Object.keys(out)) {
    const snap = out[sport];
    const goal = args.goals[sport] ?? {};

    const consistencyScore_0_100 = computeConsistency(snap);

    const baselineForecastEoy = computeForecast({
      time: args.time,
      snap,
    });

    const requiredPerWeekIfOffTrack = computeRequiredPerWeek({
      time: args.time,
      snap,
      goal,
    });

    const riskFlags = computeRiskFlags({
      snap,
      goal,
    });

    out[sport] = {
      ...snap,
      consistencyScore_0_100,
      baselineForecastEoy,
      requiredPerWeekIfOffTrack,
      riskFlags,
    };
  }

  return out;
}

