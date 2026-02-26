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
    const checkAuth = async () => {
      console.log("[useAuth] checkAuth called, hash:", window.location.hash);
      const hash = window.location.hash || "";
      const marker = "#token=";

      if (hash.startsWith(marker)) {
        console.log("[useAuth] Token found in hash, decoding...");
        const payload = hash.substring(marker.length);
        const decoded = decodeTokenPayload(payload);

        await saveToken(decoded);
        setToken(decoded);
        setStatus("Logged in");
        console.log("[useAuth] Token saved and state updated");

        window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        return;
      }

      const existing = await loadToken();
      console.log("[useAuth] Existing token in storage:", existing ? "found" : "not found");
      if (existing) {
        setToken(existing);
        setStatus("Logged in");
      } else {
        setStatus("Not logged in");
      }
    };

    checkAuth();

    // Listen for hash changes (OAuth redirect)
    const handleHashChange = () => {
      console.log("[useAuth] hashchange event fired");
      checkAuth();
    };
    
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return { token, status, setToken, setStatus };
}
