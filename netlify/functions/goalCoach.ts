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

export const handler: Handler = async (event) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: "Missing OPENAI_API_KEY" };
    }

    const { input } = JSON.parse(event.body || "{}");
    if (!isValidInput(input)) {
      return { statusCode: 400, body: "Invalid input" };
    }

    const forecastStatus = computeForecastStatus(input);
    const statusGuidance = buildGuidanceForStatus(forecastStatus, input);

    const system = [
      "You are a supportive sports coach for an endurance training app.",
      "Write in English and keep the feedback concise and encouraging.",
      "IMPORTANT: Do not perform new calculations. Use ONLY the values provided.",
      "Follow the deterministic guidance provided for suggestion constraints.",
      "Return ONLY valid JSON that matches the specified schema.",
    ].join(" ");

    const user = [
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
