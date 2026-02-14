import type { StravaToken } from "../repositories/tokenRepository";

/**
 * Refreshes Strava access token via Netlify Function.
 * IMPORTANT: refresh requires client_secret, so it must run server-side.
 */
export async function refreshAccessToken(refreshToken: string): Promise<StravaToken> {
  const res = await fetch("/.netlify/functions/oauth-refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as StravaToken;
}
