import type { Sport } from "../metrics/types";

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
    count: ["Aktivität", "Aktivitäten"],
    elevation: ["m", "m"],
  };
  const [sing, plur] = labels[metric] || ["", ""];
  return plural ? plur : sing;
}

function getSportLabel(sport: Sport): string {
  return sport === "run" ? "Laufen" : "Radfahren";
}

function formatNumber(n: number, metric: string): string {
  if (metric === "count") return Math.round(n).toString();
  if (metric === "elevation") return Math.round(n).toString();
  return n.toFixed(1); // distance: 1 decimal
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
    { label: "Bereits erreicht", value: `${formatNumber(ytd, metric)} ${metricLabel}` },
    { label: "Ziel", value: `${formatNumber(goal, metric)} ${metricLabel}` },
    { label: "Verbleibend", value: `${formatNumber(remaining, metric)} ${metricLabel}` },
    { label: "Nötig pro Woche", value: `${formatNumber(requiredPerWeek, metric)} ${metricLabel}` },
    { label: "Aktueller Trend", value: `${formatNumber(trendPerWeek, metric)} ${metricLabel}/Woche` },
    {
      label: "Prognose zum 31.12.",
      value: `${formatNumber(forecastEoy, metric)} ${metricLabel}`,
    },
  ];

  if (avgPerUnit !== undefined && metric === "distance") {
    bullets.push({ label: "Durchschnitt pro Aktivität", value: `${formatNumber(avgPerUnit, metric)} km` });
  }

  // Paragraph 1: Status
  let p1 = "";
  if (remaining <= 0) {
    p1 = `Glückwunsch! Du hast dein Ziel von ${formatNumber(goal, metric)} ${metricLabel} bereits erreicht. `;
    p1 += `Dein momentaner Trend deutet darauf hin, dass du am ${getSportLabel(sport)} noch viel Spaß hast. `;
    p1 += `Wie geht's dem Körper? 😄`;
  } else if (requiredPerWeek <= trendPerWeek * 1.1) {
    // Kleine Toleranz: wenn required nur 10% unter trend
    p1 = `Du bist auf Kurs! 🎯 `;
    p1 += `Mit deinem aktuellen Rhythmus von Ø ${formatNumber(trendPerWeek, metric)} ${metricLabel}/Woche `;
    p1 += `erreichst du dein Ziel bis zum Ende des Jahres. `;
    p1 += `Bleib dabei, die Form ist gut.`;
  } else {
    p1 = `Du liegst hinter deinem Plan. 📉 `;
    p1 += `Um dein Ziel von ${formatNumber(goal, metric)} ${metricLabel} zu erreichen, `;
    p1 += `brauchst du Ø ${formatNumber(requiredPerWeek, metric)} ${metricLabel}/Woche. `;
    p1 += `Aktuell liegst du bei Ø ${formatNumber(trendPerWeek, metric)} ${metricLabel}/Woche.`;
  }

  // Paragraph 2: Forecast & action
  let p2 = "";
  if (remaining <= 0) {
    p2 = `Mit deinem aktuellen Trend würdest du bis Jahresende insgesamt ${formatNumber(forecastEoy, metric)} ${metricLabel} erreichen. `;
    p2 += `Das ist deutlich über dem Ziel – toller Einsatz!`;
  } else {
    const weeksLeftStr = weeksLeft < 1 ? "weniger als eine Woche" : `${Math.ceil(weeksLeft)} Wochen`;
    p2 = `Es sind noch ${weeksLeftStr} im Jahr. `;
    if (trendPerWeek > 0 && Math.abs(forecastEoy - goal) <= Math.max(goal * 0.15, 10)) {
      // Recht nah dran
      p2 += `Wenn es so weitergeht, bist du sehr nah an deinem Ziel.`;
    } else if (forecastEoy < goal) {
      const shortfall = formatNumber(goal - forecastEoy, metric);
      p2 += `Aktuell besteht die Gefahr, dass du ${shortfall} ${metricLabel} zu kurz kommst. `;
      p2 += `Erhöhe dein Tempo, wenn möglich.`;
    } else {
      p2 += `Deine Prognose: ${formatNumber(forecastEoy, metric)} ${metricLabel} – knapp über dem Ziel.`;
    }
  }

  return {
    title,
    paragraphs: [p1, p2],
    bullets,
  };
}
