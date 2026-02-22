import type { Sport } from "../metrics/types";
import { formatNumber } from "../../utils/format";

export type MetricFacts = {
  ytd: number;
  goal: number;
  remaining: number;
  requiredPerWeek: number;
  trendPerWeek: number;
  forecastEoy: number;
  weeksLeft: number;
  avgPerUnit?: number; // km/run, m/ride, count/ride
};

export type NarrativeResult = {
  title: string;
  paragraphs: string[];
  bullets: Array<{ label: string; value: string }>;
};

function getMetricLabel(metric: string, plural = false): string {
  const labels: Record<string, [string, string]> = {
    distance: ["km", "km"],
    count: ["Activity", "Activities"],
    elevation: ["m", "m"],
  };
  const [sing, plur] = labels[metric] || ["", ""];
  return plural ? plur : sing;
}

function getSportLabel(sport: Sport): string {
  return sport === "run" ? "Running" : "Cycling";
}

function formatMetricNumber(n: number, metric: string): string {
  if (metric === "count" || metric === "elevation") {
    return formatNumber(n, { maximumFractionDigits: 0 });
  }
  return formatNumber(n, { maximumFractionDigits: 1 });
}

export function buildNarrative(
  sport: Sport,
  metric: string,
  facts: MetricFacts
): NarrativeResult {
  const sportLabel = getSportLabel(sport);
  const metricLabel = getMetricLabel(metric);
  const title = `${sportLabel} · ${metricLabel}`;

  const {
    ytd,
    goal,
    remaining,
    requiredPerWeek,
    trendPerWeek,
    forecastEoy,
    weeksLeft,
    avgPerUnit,
  } = facts;

  const bullets: Array<{ label: string; value: string }> = [
    { label: "Already achieved", value: `${formatMetricNumber(ytd, metric)} ${metricLabel}` },
    { label: "Goal", value: `${formatMetricNumber(goal, metric)} ${metricLabel}` },
    { label: "Remaining", value: `${formatMetricNumber(remaining, metric)} ${metricLabel}` },
    { label: "Required per week", value: `${formatMetricNumber(requiredPerWeek, metric)} ${metricLabel}` },
    { label: "Current trend", value: `${formatMetricNumber(trendPerWeek, metric)} ${metricLabel}/week` },
    {
      label: "Forecast for Dec 31",
      value: `${formatMetricNumber(forecastEoy, metric)} ${metricLabel}`,
    },
  ];

  if (avgPerUnit !== undefined && metric === "distance") {
    bullets.push({ label: "Average per activity", value: `${formatMetricNumber(avgPerUnit, metric)} km` });
  }

  // Paragraph 1: Status
  let p1 = "";
  if (remaining <= 0) {
    p1 = `Congratulations! You've already hit your goal of ${formatMetricNumber(goal, metric)} ${metricLabel}. `;
    p1 += `Your current trend suggests you're still having fun with ${getSportLabel(sport).toLowerCase()}. `;
    p1 += `How's the body holding up? 😄`;
  } else if (requiredPerWeek <= trendPerWeek * 1.1) {
    // Small tolerance: if required is only 10% below trend
    p1 = `You're on track! 🎯 `;
    p1 += `At your current pace of ø ${formatMetricNumber(trendPerWeek, metric)} ${metricLabel}/week, `;
    p1 += `you'll hit your goal by year-end. `;
    p1 += `Keep it up – you're in good form.`;
  } else {
    p1 = `You're falling behind your plan. 📉 `;
    p1 += `To reach your goal of ${formatMetricNumber(goal, metric)} ${metricLabel}, `;
    p1 += `you need ø ${formatMetricNumber(requiredPerWeek, metric)} ${metricLabel}/week. `;
    p1 += `Right now you're at ø ${formatMetricNumber(trendPerWeek, metric)} ${metricLabel}/week.`;
  }

  // Paragraph 2: Forecast & action
  let p2 = "";
  if (remaining <= 0) {
    p2 = `At your current pace, you'd reach ${formatMetricNumber(forecastEoy, metric)} ${metricLabel} by year-end. `;
    p2 += `That's well above your goal – great effort!`;
  } else {
    const weeksLeftStr = weeksLeft < 1 ? "less than a week" : `${Math.ceil(weeksLeft)} weeks`;
    p2 = `You have ${weeksLeftStr} left in the year. `;
    if (trendPerWeek > 0 && Math.abs(forecastEoy - goal) <= Math.max(goal * 0.15, 10)) {
      // Pretty close
      p2 += `If you keep this pace, you'll be very close to your goal.`;
    } else if (forecastEoy < goal) {
      const shortfall = formatMetricNumber(goal - forecastEoy, metric);
      p2 += `There's a risk you could fall ${shortfall} ${metricLabel} short. `;
      p2 += `Pick up the pace if you can.`;
    } else {
      p2 += `Your forecast: ${formatMetricNumber(forecastEoy, metric)} ${metricLabel} – just above the goal.`;
    }
  }

  return {
    title,
    paragraphs: [p1, p2],
    bullets,
  };
}
