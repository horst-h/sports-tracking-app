import { useEffect, useState } from "react";
import type { TokenData } from "../repositories/tokenRepository";
import { loadToken, saveToken } from "../repositories/tokenRepository";

function decodeTokenPayload(payload: string): TokenData {
  const json = atob(decodeURIComponent(payload));
  return JSON.parse(json);
}

export function useAuth() {
  const [token, setToken] = useState<TokenData | null>(null);
  const [status, setStatus] = useState<string>("Checking auth...");

  useEffect(() => {
    (async () => {
      const hash = window.location.hash || "";
      const marker = "#token=";

      if (hash.startsWith(marker)) {
        const payload = hash.substring(marker.length);
        const decoded = decodeTokenPayload(payload);

        await saveToken(decoded);
        setToken(decoded);
        setStatus("Logged in");

        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        return;
      }

      const existing = await loadToken();
      if (existing) {
        setToken(existing);
        setStatus("Logged in");
      } else {
        setStatus("Not logged in");
      }
    })();
  }, []);

  return { token, status, setToken, setStatus };
}
