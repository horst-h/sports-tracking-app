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
};

type AnalyzeNarrative = {
  headline: string;
  paragraph: string;
  bullets: [string, string];
  toneTag?: "on_track" | "close" | "off_track";
};

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
  if (metric === "elevation") return "hm";
  return "Einheiten";
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

    const extra = {
      unit: unit(facts.metric),
      toneTag: toneTag(facts),
      bufferToGoal: facts.forecastEoy - facts.goal,
    };

    const system = [
      "Du bist ein sportlicher Coach-Writer für eine Ausdauer-App.",
      "Englisch, du-Form, leicht coachig, klar, nicht zu lang.",
      "Nutze ausschließlich die Zahlen aus dem Input (facts).",
      "Keine neuen Berechnungen, keine neuen Zahlen, keine medizinischen Aussagen.",
      "WICHTIG: Füge am Ende des Headline ' (AI)' an, damit klar ist dass dies vom Modell generiert ist.",
      "Gib ausschließlich JSON zurück."
    ].join(" ");

    const user = [
      "Erstelle eine Analyse als Prosa für einen Screen.",
      "Format: 1 Absatz (max ~70–90 Wörter), danach GENAU 2 Bulletpoints.",
      "Beziehe dich auf Trend/Woche vs nötig/Woche; nenne Forecast vs Ziel und weeksLeft.",
      "Wenn avgPerActivity vorhanden ist, baue es natürlich ein.",
      "Nutze die Einheit extra.unit.",
      "",
      "facts:",
      JSON.stringify(facts),
      "",
      "extra (nicht rechnen, nur nutzen):",
      JSON.stringify(extra),
      "",
      "Antwort-JSON:",
      `{"headline": "... (AI)", "paragraph": "...", "bullets": ["...","..."], "toneTag":"on_track|close|off_track"}`
    ].join("\n");

    const model = "gpt-4o-mini";
    console.log("[DEBUG] Calling OpenAI model:", model);
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
