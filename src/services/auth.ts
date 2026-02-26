export async function startStravaLogin() {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  
  // DEBUG: Throw error to display env vars in browser
  throw new Error(`DEBUG INFO - clientId: ${clientId}, all env keys: ${Object.keys(import.meta.env).join(", ")}`);
  
  if (!clientId) throw new Error("Missing VITE_STRAVA_CLIENT_ID");

  const redirectUri = `${window.location.origin}/.netlify/functions/oauth-callback`;

  const scope = "read,activity:read_all"; // later: reduce if possible

  const authUrl =
    "https://www.strava.com/oauth/authorize?" +
    new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      approval_prompt: "auto",
      scope,
    });

  window.location.assign(authUrl);
}
