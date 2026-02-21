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

  // Time context
  todayISO?: string;
  dayOfYear?: number;
  totalDaysInYear?: number;
  expectedProgressPercent?: number;

  // Cross-sport context
  otherSport?: {
    sport: "run" | "ride";
    progressPercent: number;
    status: "on_track" | "close" | "off_track";
    trendPerWeek?: number;
  };
};

export type AnalyzeNarrative = {
  headline: string;
  paragraph: string;
  bullets: [string, string];
  toneTag?: "on_track" | "close" | "off_track";
};
