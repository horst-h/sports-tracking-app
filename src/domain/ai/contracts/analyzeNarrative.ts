export type AnalyzeFacts = {
  sport: "run" | "ride";
  metric: "distance" | "count" | "elevation";

  already: number;
  goal: number;
  remaining: number;

  requiredPerWeek: number;
  trendPerWeek: number;
  forecastEoy: number;

  weeksLeft: number;
  avgPerActivity?: number;
};

export type AnalyzeNarrative = {
  headline: string;
  paragraph: string;
  bullets: [string, string];
  toneTag?: "on_track" | "close" | "off_track";
};
