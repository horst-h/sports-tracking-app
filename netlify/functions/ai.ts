// AI Serverless Function - Proxy for AI requests (optional)
import type { Handler } from "@netlify/functions";

// PSEUDO: implement provider of your choice.
// Keep prompt-only. Don't log user data.

export const handler: Handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const prompt = body.prompt;
    if (!prompt) return { statusCode: 400, body: "Missing prompt" };

    // Here call your LLM provider using env var API key.
    // const apiKey = process.env.LLM_API_KEY!;
    // const outText = await callProvider({ apiKey, prompt });

    const outText = `{"version":"1.0","summaryText":"(stub)","insights":[]}`; // stub

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: outText,
    };
  } catch (e: any) {
    return { statusCode: 500, body: e?.message ?? "AI error" };
  }
};
