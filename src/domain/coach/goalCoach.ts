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

export type MultiCategoryGoalData = {
  goalValue: number | null;
  ytd: number;
  trendPerWeek: number;
  yearEndForecast: number;
};

export type MultiCategoryCoachInput = {
  year: number;
  sport: "run" | "ride";
  remainingWeeks: number;
  categories: {
    distanceKm: MultiCategoryGoalData;
    count: MultiCategoryGoalData;
    elevationM: MultiCategoryGoalData;
  };
  otherSport?: {
    sport: "run" | "ride";
    summary: string; // brief summary like "145 km YTD, trending 12 km/week"
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
  suggestion: unknown,
  forecastStatus: ForecastStatus
): CoachSuggestion | null {
  if (!suggestion || typeof suggestion !== "object") return null;
  const record = suggestion as Record<string, unknown>;

  const label = typeof record.label === "string" ? record.label.trim() : "";
  const rationale = typeof record.rationale === "string" ? record.rationale.trim() : "";
  const unit = typeof record.unit === "string" ? record.unit : "";
  const value = Number(record.value);

  if (!label || !rationale) return null;
  if (!UNITS.has(unit)) return null;
  if (unit !== input.unit) return null;
  if (!Number.isFinite(value) || value <= 0) return null;

  const upperBound = input.yearEndForecast > 0 ? input.yearEndForecast * 3 : input.goalValue * 3;
  const lowerBound = input.ytd > 0 ? input.ytd * 0.2 : 0;

  const isExtreme = value > upperBound || value < lowerBound;
  const confidenceRaw = isExtreme ? "low" : (record.confidence as string | undefined);
  const confidence: "low" | "medium" | "high" | undefined = 
    confidenceRaw && ["low", "medium", "high"].includes(confidenceRaw) 
      ? (confidenceRaw as "low" | "medium" | "high")
      : undefined;

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
        confidence,
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
        confidence,
      };
    }
  }

  return {
    label,
    value,
    unit: unit as CoachSuggestion["unit"],
    rationale,
    confidence,
  };
}

function sanitizeResult(input: CoachInput, raw: unknown): CoachResult | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const forecastStatus = computeForecastStatus(input);

  const tone = typeof record.tone === "string" && TONES.has(record.tone) ? record.tone : "unknown";
  const headline = typeof record.headline === "string" ? record.headline.trim() : "";
  const explanation = typeof record.explanation === "string" ? record.explanation.trim() : "";

  if (!headline || !explanation) return null;

  const suggestionsRaw = Array.isArray(record.suggestions) ? record.suggestions : [];
  const suggestions = suggestionsRaw
    .map((s: unknown) => sanitizeSuggestion(input, s, forecastStatus))
    .filter((s: CoachSuggestion | null): s is CoachSuggestion => Boolean(s))
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

  const crossSportNote = typeof record.crossSportNote === "string" ? record.crossSportNote.trim() : undefined;

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

export type MultiCategoryCategoryResult = {
  status: "set" | "missing";
  feedback: string;
  suggestion: number | null;
};

export type MultiCategoryCoachResult = {
  sport: string;
  year: number;
  summary: string;
  categories: {
    distanceKm: MultiCategoryCategoryResult;
    count: MultiCategoryCategoryResult;
    elevationM: MultiCategoryCategoryResult;
  };
  crossSportNote?: string;
};

export async function getMultiCategoryGoalCoachFeedback(
  input: MultiCategoryCoachInput
): Promise<MultiCategoryCoachResult> {
  const raw = await fetchGoalCoachViaProxy({ input, multiCategory: true });
  
  // Basic validation
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid AI coach response");
  }
  
  const record = raw as Record<string, unknown>;
  const categories = record.categories as Record<string, unknown>;
  
  if (!categories || typeof categories !== "object") {
    throw new Error("Invalid AI coach response: missing categories");
  }
  
  // Return with minimal sanitization - the backend should return valid JSON
  return raw as MultiCategoryCoachResult;
}

export { formatActivitiesPerWeek, formatUnitPerWeek };

