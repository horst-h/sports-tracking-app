import type { Handler } from "@netlify/functions";

type CoachInput = {
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

type MultiCategoryGoalData = {
  goalValue: number | null;
  ytd: number;
  trendPerWeek: number;
  yearEndForecast: number;
};

type MultiCategoryCoachInput = {
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
    summary: string;
  };
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function isValidInput(input: any): input is CoachInput {
  if (!input) return false;
  const sportOk = input.sport === "run" || input.sport === "ride";
  const goalTypeOk = input.goalType === "distance" || input.goalType === "count" || input.goalType === "elevation";
  const unitOk = input.unit === "km" || input.unit === "count" || input.unit === "m";
  const numsOk = [
    input.year,
    input.goalValue,
    input.ytd,
    input.trendPerWeek,
    input.yearEndForecast,
    input.remainingWeeks,
  ].every(isFiniteNumber);

  if (!sportOk || !goalTypeOk || !unitOk || !numsOk) return false;

  if (input.otherSport) {
    const other = input.otherSport;
    const otherSportOk = other.sport === "run" || other.sport === "ride";
    const otherNumsOk = [other.ytd, other.trendPerWeek, other.yearEndForecast].every(isFiniteNumber);
    const otherGoalOk = other.goalValue == null || isFiniteNumber(other.goalValue);
    if (!otherSportOk || !otherNumsOk || !otherGoalOk) return false;
  }

  return true;
}

function isValidMultiCategoryInput(input: any): input is MultiCategoryCoachInput {
  if (!input) return false;
  const sportOk = input.sport === "run" || input.sport === "ride";
  if (!sportOk || !isFiniteNumber(input.year) || !isFiniteNumber(input.remainingWeeks)) return false;
  
  const categories = input.categories;
  if (!categories || typeof categories !== "object") return false;
  
  for (const key of ["distanceKm", "count", "elevationM"]) {
    const cat = categories[key];
    if (!cat || typeof cat !== "object") return false;
    const goalOk = cat.goalValue === null || isFiniteNumber(cat.goalValue);
    const numsOk = [cat.ytd, cat.trendPerWeek, cat.yearEndForecast].every(isFiniteNumber);
    if (!goalOk || !numsOk) return false;
  }
  
  if (input.otherSport) {
    const other = input.otherSport;
    const otherSportOk = other.sport === "run" || other.sport === "ride";
    const summaryOk = typeof other.summary === "string";
    if (!otherSportOk || !summaryOk) return false;
  }
  
  return true;
}

type ForecastStatus = "ahead" | "on_track" | "behind";

function computeForecastStatus(input: CoachInput): ForecastStatus {
  const ratio = input.goalValue > 0 ? input.yearEndForecast / input.goalValue : 0;
  if (ratio >= 1.0) return "ahead";
  if (ratio >= 0.9) return "on_track";
  return "behind";
}

function formatUnitLabel(unit: CoachInput["unit"]): string {
  if (unit === "km") return "km";
  if (unit === "m") return "m";
  return "activities";
}

function buildGuidanceForStatus(status: ForecastStatus, input: CoachInput): string {
  const unitLabel = formatUnitLabel(input.unit);

  if (status === "ahead") {
    return [
      "GOAL STATUS: User is AHEAD of their goal.",
      `Forecast (${input.yearEndForecast} ${unitLabel}) exceeds goal (${input.goalValue} ${unitLabel}).`,
      "",
      "ALLOWED SUGGESTIONS:",
      "1. 'Maintain current trend' with value = trendPerWeek",
      "2. Optional: 'Consider raising your goal' (qualitative, no value)",
      "",
      "FORBIDDEN:",
      "- Do NOT suggest 'Increase weekly' or any value > trendPerWeek.",
      "- Do NOT use duplicate values.",
    ].join("\n");
  }

  if (status === "on_track") {
    return [
      "GOAL STATUS: User is ON TRACK.",
      `Forecast (${input.yearEndForecast} ${unitLabel}) is 90-100% of goal (${input.goalValue} ${unitLabel}).`,
      "",
      "ALLOWED SUGGESTIONS:",
      "1. 'Maintain current trend' with value = trendPerWeek",
      "",
      "FORBIDDEN:",
      "- Do NOT suggest 'Increase weekly' unless absolutely necessary.",
    ].join("\n");
  }

  return [
    "GOAL STATUS: User is BEHIND their goal.",
    `Forecast (${input.yearEndForecast} ${unitLabel}) is < 90% of goal (${input.goalValue} ${unitLabel}).`,
    "",
    "ALLOWED SUGGESTIONS:",
    "1. 'Increase weekly to X' where X > trendPerWeek",
    "2. 'Maintain current trend' with value = trendPerWeek",
    "",
    "RULES:",
    "- 'Increase weekly' MUST be strictly greater than trendPerWeek.",
    "- Never use the same number for both suggestions.",
  ].join("\n");
}

function buildMultiCategoryPrompt(input: MultiCategoryCoachInput): { system: string; user: string } {
  const sportLabel = input.sport === "run" ? "running" : "cycling";
  const otherSportLabel = input.otherSport?.sport === "run" ? "running" : "cycling";
  
  const system = [
    "You are a supportive sports coach for an endurance training app.",
    "Write in English and keep feedback concise, encouraging, and actionable.",
    "IMPORTANT: Do not perform new calculations. Use ONLY the values provided.",
    "Return ONLY valid JSON that matches the specified schema.",
  ].join(" ");

  const categoriesDesc = Object.entries(input.categories).map(([key, data]) => {
    const label = key === "distanceKm" ? "Distance (km)" : key === "count" ? "Activities" : "Elevation (m)";
    const unit = key === "distanceKm" ? "km" : key === "count" ? "activities" : "m";
    const goalStatus = data.goalValue !== null ? `Goal: ${data.goalValue} ${unit}` : "Goal: NOT SET";
    return `  ${label}:
    ${goalStatus}
    YTD: ${data.ytd} ${unit}
    Trend: ${data.trendPerWeek} ${unit}/ week
    Forecast: ${data.yearEndForecast} ${unit}`;
  }).join("\n\n");

  const user = [
    `You are analyzing ALL goal categories for ${sportLabel} in ${input.year}.`,
    `The user has ${input.remainingWeeks.toFixed(1)} weeks remaining in the year.`,
    "",
    "YOUR TASK:",
    "- For categories WHERE a goal IS SET: provide qualitative feedback/interpretation only. Do NOT suggest changing their goal number.",
    "- For categories WHERE a goal is NOT SET: suggest a concrete target number with brief rationale.",
    "",
    "INPUT DATA:",
    categoriesDesc,
    "",
    input.otherSport ? `Cross-sport context (${otherSportLabel}): ${input.otherSport.summary}` : "",
    "",
    "OUTPUT JSON FORMAT (REQUIRED):",
    JSON.stringify(
      {
        sport: input.sport,
        year: input.year,
        summary: "1-2 sentence overall summary",
        categories: {
          distanceKm: {
            status: "set|missing",
            feedback: "Feedback text (2-3 sentences)",
            suggestion: 1234.5,
          },
          count: {
            status: "set|missing",
            feedback: "Feedback text (2-3 sentences)",
            suggestion: 120,
          },
          elevationM: {
            status: "set|missing",
            feedback: "Feedback text (2-3 sentences)",
            suggestion: 9500,
          },
        },
        crossSportNote: "Optional 1 sentence note about balance between sports",
      },
      null,
      2
    ),
    "",
    "RULES:",
    "- status: 'set' if goal is not null, 'missing' if goal is null",
    "- suggestion: provide a number ONLY when status='missing', otherwise use null",
    "- Keep feedback concise (2-3 sentences max per category)",
    "- Ground suggestions in current trend/forecast and remaining weeks",
    "- Be encouraging but realistic",
    "- Do not include any text outside JSON",
  ].join("\n");

  return { system, user };
}

export const handler: Handler = async (event) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing OPENAI_API_KEY" };
    }

    const body = JSON.parse(event.body || "{}");
    const { input, multiCategory } = body;
    
    let system: string;
    let user: string;
    
    if (multiCategory) {
      if (!isValidMultiCategoryInput(input)) {
        return { statusCode: 400, body: "Invalid multi-category input" };
      }
      const prompts = buildMultiCategoryPrompt(input);
      system = prompts.system;
      user = prompts.user;
    } else {
      if (!isValidInput(input)) {
        return { statusCode: 400, body: "Invalid input" };
      }
      const forecastStatus = computeForecastStatus(input);
      const statusGuidance = buildGuidanceForStatus(forecastStatus, input);

      system = [
        "You are a supportive sports coach for an endurance training app.",
        "Write in English and keep the feedback concise and encouraging.",
        "IMPORTANT: Do not perform new calculations. Use ONLY the values provided.",
        "Follow the deterministic guidance provided for suggestion constraints.",
        "Return ONLY valid JSON that matches the specified schema.",
      ].join(" ");

      user = [
        "You are analyzing a single goal input and should provide brief coaching feedback.",
        "Focus on the selected sport and goal type, with a brief cross-sport note if provided.",
        "No medical advice. No extra commentary outside JSON.",
        "",
        "INPUT:",
        JSON.stringify(input, null, 2),
        "",
        "DETERMINISTIC GUIDANCE (REQUIRED):",
        statusGuidance,
        "",
        "OUTPUT JSON FORMAT:",
        JSON.stringify(
          {
            tone: "great|on_track|ambitious|too_ambitious|low|unknown",
            headline: "Short headline",
            explanation: "2-4 sentences, friendly and concrete",
            suggestions: [
              {
                label: "Suggested target label",
                value: 0,
                unit: "km|count|m",
                rationale: "Short rationale",
                confidence: "low|medium|high",
              },
            ],
            crossSportNote: "Optional one-sentence cross-sport note",
          },
          null,
          2
        ),
        "",
        "Rules:",
        "- Use the provided unit for suggestions.",
        "- Max 2 suggestions.",
        "- For activity count goals: use 'activities per week' in labels and rationale.",
        "- Keep crossSportNote to 1 sentence if present.",
        "- Do not include any text outside JSON.",
        "- Strictly follow the DETERMINISTIC GUIDANCE above.",
      ].join("\n");
    }

    const model = "gpt-4o-mini";
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.9,
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      return { statusCode: resp.status, body: t };
    }

    const data = await resp.json();
    const outputText = data.choices?.[0]?.message?.content ?? null;
    if (!outputText) {
      return { statusCode: 500, body: "No content in response" };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(outputText);
    } catch (e) {
      return { statusCode: 500, body: "Model did not return valid JSON" };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
    };
  } catch (e: any) {
    return { statusCode: 500, body: e?.message ?? "AI error" };
  }
};
