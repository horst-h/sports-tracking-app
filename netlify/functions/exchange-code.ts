/**
 * Netlify Function to exchange Strava auth code for access token
 * Called from browser with auth code
 */

type StravaTokenResponse = {
  token_type: "Bearer";
  access_token: string;
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  athlete: unknown;
};

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

export async function handler(event: any) {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { code } = JSON.parse(event.body || "{}");
    
    if (!code) {
      return json(400, { error: "Missing code parameter" });
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return json(500, { error: "Server config error" });
    }

    console.log("[exchange-code] Exchanging code for token...");

    // Exchange authorization code for token (Strava)
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[exchange-code] Token exchange failed:", tokenRes.status, text);
      return json(502, { error: "token_exchange_failed", details: text });
    }

    const tokenJson = (await tokenRes.json()) as StravaTokenResponse;
    console.log("[exchange-code] Token received successfully");

    // Return token to browser
    return json(200, {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_at: tokenJson.expires_at,
    });
  } catch (e: any) {
    console.error("[exchange-code] Error:", e);
    return json(500, { error: "unexpected_error", message: String(e?.message ?? e) });
  }
}
