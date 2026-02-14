import type { Handler } from "@netlify/functions";

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(500, { error: "missing_server_config" });
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const refresh_token = body.refresh_token;

    if (!refresh_token || typeof refresh_token !== "string") {
      return json(400, { error: "missing_refresh_token" });
    }

    const tokenRes = await fetch(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token,
      }),
    });

    const text = await tokenRes.text();
    if (!tokenRes.ok) {
      return json(502, { error: "refresh_failed", details: text });
    }

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: text,
    };
  } catch (e: any) {
    return json(500, { error: "unexpected_error", message: String(e?.message ?? e) });
  }
};
