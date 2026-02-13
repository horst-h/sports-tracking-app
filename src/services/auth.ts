import { randomString, sha256base64url } from "./pkce";

const LS_VERIFIER_KEY = "pkce_verifier";

export async function startStravaLogin() {
  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID;
  if (!clientId) throw new Error("Missing VITE_STRAVA_CLIENT_ID");

  const verifier = randomString(64);
  localStorage.setItem(LS_VERIFIER_KEY, verifier);

  // Strava supports PKCE via code_challenge (works with authorization code flow)
  const challenge = await sha256base64url(verifier);

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
      code_challenge: challenge,
      code_challenge_method: "S256",
    });

  window.location.assign(authUrl);
}

export function consumePkceVerifier() {
  const v = localStorage.getItem(LS_VERIFIER_KEY);
  localStorage.removeItem(LS_VERIFIER_KEY);
  return v;
}
