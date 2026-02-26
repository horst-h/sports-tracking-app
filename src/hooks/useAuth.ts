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
    let mounted = true;
    
    const checkAuth = async () => {
      if (!mounted) return;
      
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
            if (!mounted) return;
            setToken(decoded);
            setStatus("Logged in");
            console.log("[useAuth] Token saved and state updated");

            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          } catch (e) {
            console.error("[useAuth] Error processing token:", e);
            if (!mounted) return;
            setStatus("Error processing token");
            return;
          }
          return;
        }

        const existing = await loadToken();
        console.log("[useAuth] Existing token in storage:", existing ? "found" : "not found");
        if (!mounted) return;
        if (existing) {
          setToken(existing);
          setStatus("Logged in");
        } else {
          setStatus("Not logged in");
        }
      } catch (e) {
        console.error("[useAuth] Unexpected error:", e);
        if (!mounted) return;
        setStatus("Error checking auth");
      }
    };

    // Call immediately on mount
    checkAuth();

    // Listen for hash changes (OAuth redirect)
    const handleHashChange = () => {
      console.log("[useAuth] hashchange event detected");
      checkAuth();
    };
    
    // Listen for popstate (browser back/forward)
    const handlePopState = () => {
      console.log("[useAuth] popstate event detected");
      checkAuth();
    };
    
    // Polling fallback - check hash every 500ms for first 5 seconds
    // This handles cases where events don't fire (PWA, cached pages, etc.)
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      if (pollCount > 10) {
        clearInterval(pollInterval);
        return;
      }
      if (window.location.hash.startsWith("#token=")) {
        console.log("[useAuth] Polling detected token in hash");
        checkAuth();
        clearInterval(pollInterval);
      }
    }, 500);
    
    window.addEventListener("hashchange", handleHashChange);
    window.addEventListener("popstate", handlePopState);
    
    return () => {
      mounted = false;
      clearInterval(pollInterval);
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return { token, status, setToken, setStatus };
}
