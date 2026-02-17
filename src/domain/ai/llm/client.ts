// LLM Client - Communication with language model services
import type { AiResponse } from "../contracts/aiResponse";
// import { buildInsightsPrompt } from "./prompt"; // TODO: implement when LLM integration is needed
import type { AiContext } from "../contracts/aiContext";
import type { AnalyzeFacts, AnalyzeNarrative } from "../contracts/analyzeNarrative";

export async function fetchAiInsightsViaProxy(_args: {
  ctx: AiContext;
  question?: string;
}): Promise<AiResponse> {
  // TODO: implement actual LLM integration
  const prompt = ""; // buildInsightsPrompt({ ctx: _args.ctx, userQuestion: _args.question });

  const res = await fetch("/.netlify/functions/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok) throw new Error(`AI proxy error ${res.status}`);
  return (await res.json()) as AiResponse;
}

// NEW: narrative for analyze screen
export async function fetchAnalyzeNarrativeViaProxy(args: {
  facts: AnalyzeFacts;
}): Promise<AnalyzeNarrative> {
  const res = await fetch("/.netlify/functions/analyzeNarrative", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ facts: args.facts }),
  });

  if (!res.ok) throw new Error(`Analyze narrative proxy error ${res.status}`);
  return (await res.json()) as AnalyzeNarrative;
}
