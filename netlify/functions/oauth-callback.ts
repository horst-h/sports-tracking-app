type StravaTokenResponse = {
  token_type: "Bearer";
  access_token: string;
  expires_at: number;   // unix epoch seconds
  expires_in: number;   // seconds
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
  try {
    const code = event.queryStringParameters?.code;
    console.log("[oauth-callback] Received code:", code ? "present" : "MISSING");
    
    if (!code) return json(400, { error: "missing_code" });

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    const appBaseUrl = process.env.APP_BASE_URL;

    console.log("[oauth-callback] Config check:", {
      clientId: clientId ? "present" : "MISSING",
      clientSecret: clientSecret ? "present" : "MISSING", 
      appBaseUrl: appBaseUrl ? appBaseUrl : "MISSING",
    });

    if (!clientId || !clientSecret || !appBaseUrl) {
      return json(500, { 
        error: "missing_server_config",
        details: {
          clientId: !clientId,
          clientSecret: !clientSecret,
          appBaseUrl: !appBaseUrl,
        }
      });
    }

    // Exchange authorization code for token (Strava)
    console.log("[oauth-callback] Exchanging code for token with Strava...");
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

    console.log("[oauth-callback] Strava response status:", tokenRes.status);
    
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error("[oauth-callback] Token exchange failed:", text);
      return json(502, { error: "token_exchange_failed", details: text });
    }

    const tokenJson = (await tokenRes.json()) as StravaTokenResponse;
    console.log("[oauth-callback] Token received successfully!");

    // Redirect back to app with token payload in fragment (not sent to server logs)
    // NOTE: we DO NOT put tokens in query params.
    const payload = encodeURIComponent(
      btoa(
        JSON.stringify({
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expires_at: tokenJson.expires_at,
        })
      )
    );

    return {
      statusCode: 302,
      headers: {
        "cache-control": "no-store",
        location: `${appBaseUrl}/#token=${payload}`,
      },
      body: "",
    };
  } catch (e: any) {
    return json(500, { error: "unexpected_error", message: String(e?.message ?? e) });
  }
}
