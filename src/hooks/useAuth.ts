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
        // Check for token in URL query parameter (most reliable)
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get('token');
        
        if (tokenParam) {
          console.log("[useAuth] Found token in query parameter");
          
          try {
            const json = atob(tokenParam);
            console.log("[useAuth] Decoded query param token");
            const decoded = JSON.parse(json);
            
            await saveToken(decoded);
            if (!mounted) return;
            setToken(decoded);
            setStatus("Logged in");
            console.log("[useAuth] Token from query param saved");
            
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } catch (e) {
            console.error("[useAuth] Error processing query param token:", e);
          }
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
    
    return () => {
      mounted = false;
    };
  }, []);

  return { token, status, setToken, setStatus };
}
