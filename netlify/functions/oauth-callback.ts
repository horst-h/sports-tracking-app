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
    console.log("[oauth-callback] Handler called, code present:", !!code);
    
    if (!code) return json(400, { error: "missing_code" });

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;
    const appBaseUrl = process.env.APP_BASE_URL;

    console.log("[oauth-callback] Config loaded - appBaseUrl:", appBaseUrl);

    if (!clientId || !clientSecret || !appBaseUrl) {
      return json(500, { error: "missing_server_config" });
    }

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
      console.error("[oauth-callback] Token exchange failed:", tokenRes.status, text);
      return json(502, { error: "token_exchange_failed", details: text });
    }

    const tokenJson = (await tokenRes.json()) as StravaTokenResponse;
    console.log("[oauth-callback] Token received, redirecting to:", `${appBaseUrl}/#token=...`);

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

    const redirectUrl = `${appBaseUrl}/#token=${payload}`;
    const escapedUrl = redirectUrl.replace(/'/g, "\\'");
    console.log("[oauth-callback] Returning HTML with redirect to:", redirectUrl);

    // Return HTML that redirects via meta refresh + JavaScript
    // This ensures the redirect works even if JS is briefly blocked
    return {
      statusCode: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store, no-cache, must-revalidate",
      },
      body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url=${redirectUrl}">
  <title>Redirecting...</title>
</head>
<body>
  <p>Logging in... redirecting...</p>
  <script>window.location.replace('${escapedUrl}');</script>
</body>
</html>`,
    };
  } catch (e: any) {
    return json(500, { error: "unexpected_error", message: String(e?.message ?? e) });
  }
}
