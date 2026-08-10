// LLM Client - Communication with language model services
import type { AiResponse } from "../contracts/aiResponse";
// import { buildInsightsPrompt } from "./prompt"; // TODO: implement when LLM integration is needed
import type { AiContext } from "../contracts/aiContext";
import type { AnalyzeFacts, AnalyzeNarrative } from "../contracts/analyzeNarrative";
import { authHeader } from "../../../repositories/googleSessionRepository";

/**
 * These endpoints spend real money on every call, so they are behind the same
 * sign-in as everything else. Sending the session is not optional: an
 * unauthenticated request is refused before it reaches the model.
 */
async function postJson<T>(path: string, payload: unknown, label: string): Promise<T> {
  const auth = await authHeader();
  if (!auth) throw new Error("Not signed in");

  const res = await fetch(path, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error("Not signed in");
    throw new Error(`${label} error ${res.status}`);
  }

  // An undeployed function falls through to the SPA catch-all, which answers
  // 200 with index.html. Without this check that surfaces as a JSON parse
  // error somewhere else entirely.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`${label} did not return JSON — is the function deployed?`);
  }

  return (await res.json()) as T;
}

export async function fetchAiInsightsViaProxy(_args: {
  ctx: AiContext;
  question?: string;
}): Promise<AiResponse> {
  // TODO: implement actual LLM integration
  const prompt = ""; // buildInsightsPrompt({ ctx: _args.ctx, userQuestion: _args.question });

  return postJson<AiResponse>("/.netlify/functions/ai", { prompt }, "AI proxy");
}

// NEW: narrative for analyze screen
export async function fetchAnalyzeNarrativeViaProxy(args: {
  facts: AnalyzeFacts;
}): Promise<AnalyzeNarrative> {
  return postJson<AnalyzeNarrative>(
    "/.netlify/functions/analyzeNarrative",
    { facts: args.facts },
    "Analyze narrative proxy"
  );
}

export async function fetchGoalCoachViaProxy(args: {
  input: unknown;
  multiCategory?: boolean;
}): Promise<unknown> {
  return postJson<unknown>(
    "/.netlify/functions/goalCoach",
    { input: args.input, multiCategory: args.multiCategory },
    "Goal coach proxy"
  );
}
