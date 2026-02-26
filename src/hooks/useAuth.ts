import { useEffect, useState } from "react";
import type { TokenData } from "../repositories/tokenRepository";
import { loadToken, saveToken } from "../repositories/tokenRepository";

function decodeTokenPayload(payload: string): TokenData {
  try {
    const json = atob(decodeURIComponent(payload));
    console.log("[decodeTokenPayload] Decoded JSON (first 100 chars):", json.substring(0, 100));
    const parsed = JSON.parse(json);
    console.log("[decodeTokenPayload] Parsed successfully");
    return parsed;
  } catch (e) {
    console.error("[decodeTokenPayload] Failed to decode:", e);
    throw e;
  }
}

export function useAuth() {
  const [token, setToken] = useState<TokenData | null>(null);
  const [status, setStatus] = useState<string>("Checking auth...");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const hash = window.location.hash || "";
        console.log("[useAuth] checkAuth called, hash:", hash);
        const marker = "#token=";

        if (hash.startsWith(marker)) {
          try {
            console.log("[useAuth] Token found in hash, decoding...");
            const payload = hash.substring(marker.length);
            console.log("[useAuth] Payload (first 50 chars):", payload.substring(0, 50));
            
            const decoded = decodeTokenPayload(payload);
            console.log("[useAuth] Decoded token:", { access_token: decoded.access_token ? "present" : "missing", expires_at: decoded.expires_at });

            await saveToken(decoded);
            setToken(decoded);
            setStatus("Logged in");
            console.log("[useAuth] Token saved and state updated");

            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch (e) {
            console.error("[useAuth] Error processing token:", e);
            setStatus("Error processing token");
            return;
          }
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
      } catch (e) {
        console.error("[useAuth] Unexpected error:", e);
        setStatus("Error checking auth");
      }
    };

    checkAuth();
  }, []);

  return { token, status, setToken, setStatus };
}
