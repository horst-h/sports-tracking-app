import { fetchGoalCoachViaProxy } from "../ai/llm/client";

export type CoachInput = {
  year: number;
  sport: "run" | "ride";
  goalType: "distance" | "count" | "elevation";
  goalValue: number;
  unit: "km" | "count" | "m";
  ytd: number;
  trendPerWeek: number;
  yearEndForecast: number;
  remainingWeeks: number;
  otherSport?: {
    sport: "run" | "ride";
    ytd: number;
    trendPerWeek: number;
    yearEndForecast: number;
    goalValue?: number;
  };
};

export type CoachSuggestion = {
  label: string;
  value: number;
  unit: "km" | "count" | "m";
  rationale: string;
  confidence?: "low" | "medium" | "high";
};

export type CoachResult = {
  tone: "great" | "on_track" | "ambitious" | "too_ambitious" | "low" | "unknown";
  headline: string;
  explanation: string;
  suggestions: CoachSuggestion[];
  crossSportNote?: string;
};

export type CoachState = {
  status: "idle" | "loading" | "ready" | "error";
  result?: CoachResult;
  error?: string;
  goalValue?: number;
  updatedAt?: string;
};

type ForecastStatus = "ahead" | "on_track" | "behind";

const TONES = new Set(["great", "on_track", "ambitious", "too_ambitious", "low", "unknown"]);
const UNITS = new Set(["km", "count", "m"]);

function computeForecastStatus(input: CoachInput): ForecastStatus {
  const ratio = input.goalValue > 0 ? input.yearEndForecast / input.goalValue : 0;
  if (ratio >= 1.0) return "ahead";
  if (ratio >= 0.9) return "on_track";
  return "behind";
}

function formatUnitPerWeek(unit: CoachInput["unit"], value: number): string {
  if (unit === "count") {
    return value === 1 ? "activity per week" : "activities per week";
  }
  return `${unit} per week`;
}

function formatActivitiesPerWeek(n: number): string {
  return n === 1 ? "activity per week" : "activities per week";
}

function sanitizeSuggestion(
  input: CoachInput,
  suggestion: any,
  forecastStatus: ForecastStatus
): CoachSuggestion | null {
  if (!suggestion || typeof suggestion !== "object") return null;

  const label = typeof suggestion.label === "string" ? suggestion.label.trim() : "";
  const rationale = typeof suggestion.rationale === "string" ? suggestion.rationale.trim() : "";
  const unit = typeof suggestion.unit === "string" ? suggestion.unit : "";
  const value = Number(suggestion.value);

  if (!label || !rationale) return null;
  if (!UNITS.has(unit)) return null;
  if (unit !== input.unit) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  const upperBound = input.yearEndForecast > 0 ? input.yearEndForecast * 3 : input.goalValue * 3;
  const lowerBound = input.ytd > 0 ? input.ytd * 0.2 : 0;

  const isExtreme = value > upperBound || value < lowerBound;
  let confidence = isExtreme ? "low" : suggestion.confidence;

  // Deterministic logic enforcement
  const isMaintain = label.toLowerCase().includes("maintain");
  const isIncrease = label.toLowerCase().includes("increase");

  if (forecastStatus === "ahead" || forecastStatus === "on_track") {
    // Only allow "maintain current" suggestions
    if (isIncrease) {
      return null; // Reject increase suggestions when ahead/on_track
    }
    if (isMaintain && Math.abs(value - input.trendPerWeek) > 0.1) {
      // Fix value to match actual trend
      return {
        label,
        value: input.trendPerWeek,
        unit: unit as CoachSuggestion["unit"],
        rationale,
        confidence: confidence && ["low", "medium", "high"].includes(confidence) ? confidence : undefined,
      };
    }
  }

  if (forecastStatus === "behind") {
    // Allow increase suggestions, but ensure value > trendPerWeek
    if (isIncrease && value <= input.trendPerWeek) {
      return null; // Reject illogical "increase" that's not actually higher
    }
    if (isMaintain && Math.abs(value - input.trendPerWeek) > 0.1) {
      // Fix value to match actual trend
      return {
        label,
        value: input.trendPerWeek,
        unit: unit as CoachSuggestion["unit"],
        rationale,
        confidence: confidence && ["low", "medium", "high"].includes(confidence) ? confidence : undefined,
      };
    }
  }

  return {
    label,
    value,
    unit: unit as CoachSuggestion["unit"],
    rationale,
    confidence: confidence && ["low", "medium", "high"].includes(confidence) ? confidence : undefined,
  };
}

function sanitizeResult(input: CoachInput, raw: any): CoachResult | null {
  if (!raw || typeof raw !== "object") return null;

  const forecastStatus = computeForecastStatus(input);

  const tone = typeof raw.tone === "string" && TONES.has(raw.tone) ? raw.tone : "unknown";
  const headline = typeof raw.headline === "string" ? raw.headline.trim() : "";
  const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";

  if (!headline || !explanation) return null;

  const suggestionsRaw = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  const suggestions = suggestionsRaw
    .map((s) => sanitizeSuggestion(input, s, forecastStatus))
    .filter((s): s is CoachSuggestion => Boolean(s))
    .slice(0, 2);

  // Ensure no duplicates
  const uniqueSuggestions: CoachSuggestion[] = [];
  const seenValues = new Set<number>();
  for (const s of suggestions) {
    if (!seenValues.has(s.value)) {
      uniqueSuggestions.push(s);
      seenValues.add(s.value);
    }
  }

  const crossSportNote = typeof raw.crossSportNote === "string" ? raw.crossSportNote.trim() : undefined;

  return {
    tone: tone as CoachResult["tone"],
    headline,
    explanation,
    suggestions: uniqueSuggestions,
    crossSportNote: crossSportNote || undefined,
  };
}

export async function getGoalCoachFeedback(input: CoachInput): Promise<CoachResult> {
  const raw = await fetchGoalCoachViaProxy({ input });
  const cleaned = sanitizeResult(input, raw);
  if (!cleaned) {
    throw new Error("Invalid AI coach response");
  }
  return cleaned;
}

export { formatActivitiesPerWeek, formatUnitPerWeek };

