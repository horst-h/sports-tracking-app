import { useEffect, useState } from "react";
import { saveToken } from "../repositories/tokenRepository";

type TokenPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
};

function decodeTokenPayload(payload: string): TokenPayload {
  // oauth-callback packs: encodeURIComponent(btoa(JSON.stringify(...)))
  const json = atob(decodeURIComponent(payload));
  const data = JSON.parse(json) as Partial<TokenPayload>;

  if (
    !data ||
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    typeof data.expires_at !== "number"
  ) {
    throw new Error("Invalid token payload");
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
  };
}

function extractTokenFromHash(hash: string): string | null {
  // Your redirect format is: /#token=...
  // But your comment says: /#/auth/callback#token=...
  // This handles both cases.
  const idx = hash.indexOf("#token=");
  if (idx === -1) return null;
  return hash.substring(idx + "#token=".length) || null;
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const tokenPart = extractTokenFromHash(window.location.hash);
        if (!tokenPart) {
          setError("Kein Token in der URL gefunden.");
          return;
        }

        const data = decodeTokenPayload(tokenPart);

        await saveToken({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: data.expires_at,
        });

        // Clean URL (remove token fragment) and go home
        window.history.replaceState({}, "", "/#/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
        // Still clean URL to avoid leaving tokens in history
        window.history.replaceState({}, "", "/#/");
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Login fehlgeschlagen</h2>
        <p>{error}</p>
        <p>Bitte versuche es erneut.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>Signing you in…</h2>
      <p>Bitte kurz warten.</p>
    </div>
  );
}
