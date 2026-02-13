import { useEffect } from "react";

function decodeTokenPayload(payload: string) {
  const json = atob(decodeURIComponent(payload));
  return JSON.parse(json) as { access_token: string; refresh_token: string; expires_at: number };
}

export default function AuthCallbackPage() {
  useEffect(() => {
    // URL looks like: /#/auth/callback#token=....
    const hash = window.location.hash; // "#/auth/callback#token=..."
    const tokenPart = hash.split("#token=")[1];
    if (!tokenPart) return;

    const data = decodeTokenPayload(tokenPart);

    // TODO: store in IndexedDB tokenRepository (next step)
    console.log("Received tokens:", data);

    // Clean URL
    window.history.replaceState({}, "", "/#/");

  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Signing you in…</h2>
      <p>Bitte kurz warten.</p>
    </div>
  );
}
