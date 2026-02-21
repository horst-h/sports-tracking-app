import type { Handler } from "@netlify/functions";

type AnalyzeFacts = {
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

type AnalyzeNarrative = {
  headline: string;
  paragraph: string;
  bullets: [string, string];
  toneTag?: "on_track" | "close" | "off_track";
};

// Time context helpers
function getDayOfYear(dateISO: string): number {
  const date = new Date(dateISO);
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function getTotalDaysInYear(year: number): number {
  return ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0) ? 366 : 365;
}

function computeExpectedProgressPercent(dayOfYear: number, totalDaysInYear: number): number {
  return Math.round((dayOfYear / totalDaysInYear) * 100);
}

function isValidFacts(x: any): x is AnalyzeFacts {
  if (!x) return false;
  const sportOk = x.sport === "run" || x.sport === "ride";
  const metricOk = x.metric === "distance" || x.metric === "count" || x.metric === "elevation";
  const numsOk = [x.already, x.goal, x.remaining, x.requiredPerWeek, x.trendPerWeek, x.forecastEoy, x.weeksLeft]
    .every((n) => typeof n === "number" && Number.isFinite(n));
  const avgOk = x.avgPerActivity == null || (typeof x.avgPerActivity === "number" && Number.isFinite(x.avgPerActivity));
  return sportOk && metricOk && numsOk && avgOk;
}

function unit(metric: AnalyzeFacts["metric"]) {
  if (metric === "distance") return "km";
  if (metric === "elevation") return "m";
  return "activities";
}

function sportLabel(sport: "run" | "ride") {
  return sport === "run" ? "Running" : "Cycling";
}

function metricLabel(metric: AnalyzeFacts["metric"]) {
  if (metric === "distance") return "Distance";
  if (metric === "count") return "Activity Count";
  return "Elevation";
}

function toneTag(f: AnalyzeFacts): AnalyzeNarrative["toneTag"] {
  const need = Math.max(0.0001, f.requiredPerWeek);
  const ratio = f.trendPerWeek / need;
  if (ratio >= 1.15) return "on_track";
  if (ratio >= 0.95) return "close";
  return "off_track";
}

export const handler: Handler = async (event) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("[DEBUG] OPENAI_API_KEY missing");
      return { statusCode: 500, body: "Missing OPENAI_API_KEY" };
    }

    const { facts } = JSON.parse(event.body || "{}");
    if (!isValidFacts(facts)) {
      console.log("[DEBUG] Invalid facts structure");
      return { statusCode: 400, body: "Invalid facts" };
    }

    console.log("[DEBUG] LLM FUNCTION INVOKED", facts);

    // Compute time context if not provided
    const todayISO = facts.todayISO || new Date().toISOString().split('T')[0];
    const year = new Date(todayISO).getFullYear();
    const dayOfYear = facts.dayOfYear || getDayOfYear(todayISO);
    const totalDaysInYear = facts.totalDaysInYear || getTotalDaysInYear(year);
    const expectedProgressPercent = facts.expectedProgressPercent || computeExpectedProgressPercent(dayOfYear, totalDaysInYear);
    
    const actualProgressPercent = facts.goal > 0 ? Math.round((facts.already / facts.goal) * 100) : 0;

    const extra = {
      unit: unit(facts.metric),
      sportLabel: sportLabel(facts.sport),
      metricLabel: metricLabel(facts.metric),
      toneTag: toneTag(facts),
      bufferToGoal: facts.forecastEoy - facts.goal,
      actualProgressPercent,
      expectedProgressPercent,
      dayOfYear,
      totalDaysInYear,
      todayISO,
    };

    const system = [
      "You are a sports coaching writer for an endurance training app.",
      "Write in English, second person (you), coaching tone, clear and concise.",
      "Use ONLY the numbers from the input (facts). Never calculate new numbers or make medical claims.",
      "IMPORTANT: Append ' (AI)' to the headline to indicate it's AI-generated.",
      "Return ONLY valid JSON."
    ].join(" ");

    const user = [
      "Create a focused analysis for the SELECTED sport and goal category.",
      "",
      "STRUCTURE YOUR RESPONSE WITH THESE SECTIONS:",
      "1. headline: Brief status for selected sport+category (append ' (AI)')",
      "2. paragraph: One focused paragraph (70-90 words) covering:",
      "   - Progress vs time-of-year expectation",
      "   - Current trend vs required weekly pace",
      "   - Forecast vs goal",
      "   - What to do this week for THIS sport/category",
      "3. bullets: EXACTLY 2 actionable tips, specific to selected sport/category",
      "4. toneTag: 'on_track' | 'close' | 'off_track'",
      "",
      "CROSS-SPORT GUIDANCE (keep brief, mention only if relevant):",
      "- If otherSport data is provided and it's off-track while selected is on-track,",
      "  briefly suggest shifting some weekly capacity.",
      "- If both are off-track, warn about overload risk.",
      "- Keep cross-sport mentions to 1 sentence max in the paragraph.",
      "",
      "TIME CONTEXT:",
      `- Today is ${extra.todayISO}, day ${extra.dayOfYear} of ${extra.totalDaysInYear}`,
      `- Expected progress at this point: ${extra.expectedProgressPercent}%`,
      `- Actual progress: ${extra.actualProgressPercent}%`,
      "",
      "SELECTED SPORT & CATEGORY:",
      `- Sport: ${extra.sportLabel}`,
      `- Category: ${extra.metricLabel}`,
      `- Goal: ${facts.goal} ${extra.unit}`,
      `- Already: ${facts.already} ${extra.unit} (${extra.actualProgressPercent}%)`,
      `- Remaining: ${facts.remaining} ${extra.unit}`,
      `- Required per week: ${facts.requiredPerWeek} ${extra.unit}`,
      `- Current trend: ${facts.trendPerWeek} ${extra.unit}/week`,
      `- Forecast for Dec 31: ${facts.forecastEoy} ${extra.unit}`,
      `- Weeks left: ${facts.weeksLeft}`,
      facts.avgPerActivity ? `- Avg per activity: ${facts.avgPerActivity} ${extra.unit}` : "",
      "",
      facts.otherSport ? [
        "OTHER SPORT (context only, keep brief):",
        `- Sport: ${sportLabel(facts.otherSport.sport)}`,
        `- Progress: ${facts.otherSport.progressPercent}%`,
        `- Status: ${facts.otherSport.status}`,
        facts.otherSport.trendPerWeek ? `- Trend: ${facts.otherSport.trendPerWeek}/week` : "",
      ].join("\n") : "OTHER SPORT: none provided",
      "",
      "OUTPUT JSON FORMAT:",
      `{"headline": "... (AI)", "paragraph": "...", "bullets": ["...","..."], "toneTag": "on_track|close|off_track"}`
    ].filter(Boolean).join("\n");

    const model = "gpt-4o-mini";
    console.log("[DEBUG] Calling OpenAI model:", model);
    console.log("[DEBUG] Time context:", { todayISO, dayOfYear, totalDaysInYear, expectedProgressPercent, actualProgressPercent });
    console.log("[DEBUG] Cross-sport context:", facts.otherSport ? `${facts.otherSport.sport} at ${facts.otherSport.progressPercent}%` : "none");
    const startTime = Date.now();

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 1,
      }),
    });

    const durationMs = Date.now() - startTime;
    console.log("[DEBUG] OpenAI API response received in", durationMs, "ms");

    if (!resp.ok) {
      const t = await resp.text();
      console.log("[DEBUG] OpenAI error response:", resp.status, t);
      return { statusCode: resp.status, body: t };
    }

    const data = await resp.json();
    const outputText = data.choices?.[0]?.message?.content ?? null;

    if (!outputText) {
      console.log("[DEBUG] No content in OpenAI response");
      return { statusCode: 500, body: "No content in response" };
    }

    let parsed: AnalyzeNarrative;
    try {
      parsed = JSON.parse(outputText);
      console.log("[DEBUG] Successfully parsed LLM response");
    } catch (e) {
      console.log("[DEBUG] Failed to parse LLM response:", outputText);
      return { statusCode: 500, body: "Model did not return valid JSON" };
    }

    if (!parsed?.headline || !parsed?.paragraph || !Array.isArray(parsed?.bullets) || parsed.bullets.length !== 2) {
      console.log("[DEBUG] JSON shape mismatch in parsed response");
      return { statusCode: 500, body: "JSON shape mismatch" };
    }

    // Add debug metadata
    const responseWithDebug = {
      ...parsed,
      _debug: {
        source: "llm" as const,
        model: model,
        durationMs: durationMs,
      },
    };

    console.log("[DEBUG] Returning successful LLM response with debug info");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(responseWithDebug),
    };
  } catch (e: any) {
    console.log("[DEBUG] Caught error:", e?.message ?? "Unknown error", e);
    return { statusCode: 500, body: e?.message ?? "Error" };
  }
};
