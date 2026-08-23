/**
 * The one place this app talks to a language model.
 *
 * Both AI endpoints — the analyze narrative and the goal coach — ask the model
 * for the same thing: a JSON object, given a system prompt and a user prompt.
 * They used to each carry their own copy of that call, which is how they also
 * each carried their own copy of the provider. Now the provider is a detail of
 * this file.
 *
 * Gemini rather than OpenAI, because the calls are few — the client caches a
 * narrative per day and fact set — and Google's free tier covers that volume,
 * where OpenAI needs prepaid credit that silently runs out. It did: on
 * 2026-08-23 both endpoints were answering 429 `credit_balance_exhausted`, and
 * the UI had been quietly showing its deterministic fallback ever since.
 *
 * Note this is unrelated to the Google sign-in the app already has. That is
 * OAuth for identity; this needs its own `GEMINI_API_KEY` from AI Studio.
 */

/** Only the parts of Gemini's reply this file reads. */
type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Callers pass a failure straight through, so it carries a real status. */
export type LlmResult =
  | { ok: true; text: string; model: string; durationMs: number }
  | { ok: false; status: number; error: string };

/**
 * Model IDs move faster than deploys, so this is an env var with a default.
 * `gemini-3.5-flash-lite` is the cheap, fast tier. Switching to a larger model
 * is a Netlify env change, not a code change — which is the point, because the
 * two IDs tried before it were both already retired: `gemini-2.0-flash` is shut
 * down, and `gemini-2.5-flash-lite` answers 404 for accounts that had not used
 * it before.
 */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Belt and braces: JSON mode should never fence, but a stray fence is fatal. */
function stripCodeFence(text: string): string {
  const fenced = text.trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}

export async function generateJson(args: {
  system: string;
  user: string;
  temperature?: number;
  /** Prefixes log lines so two endpoints in one log stream stay tellable apart. */
  label: string;
}): Promise<LlmResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(`[${args.label}] GEMINI_API_KEY missing`);
    return { ok: false, status: 500, error: "Missing GEMINI_API_KEY" };
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  console.log(`[${args.label}] Calling Gemini model:`, model);
  const startTime = Date.now();

  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: "POST",
      headers: {
        // The key goes in a header, not the documented `?key=` query param, so
        // it cannot end up in a URL that something else decides to log.
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: "user", parts: [{ text: args.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: args.temperature ?? 1,
        },
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gemini request failed";
    console.log(`[${args.label}] Gemini request failed:`, message);
    return { ok: false, status: 502, error: message };
  }

  const durationMs = Date.now() - startTime;
  console.log(`[${args.label}] Gemini response received in`, durationMs, "ms");

  if (!resp.ok) {
    const body = await resp.text();
    console.log(`[${args.label}] Gemini error response:`, resp.status, body);
    return { ok: false, status: resp.status, error: body };
  }

  const data = (await resp.json()) as GeminiResponse;
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text ?? null;

  if (!text) {
    // A refusal or a truncation arrives as 200 with no text, so say which.
    const reason = candidate?.finishReason ?? data.promptFeedback?.blockReason ?? "unknown";
    console.log(`[${args.label}] No content in Gemini response, finishReason:`, reason);
    return { ok: false, status: 500, error: `No content in response (${reason})` };
  }

  return { ok: true, text: stripCodeFence(text), model, durationMs };
}
