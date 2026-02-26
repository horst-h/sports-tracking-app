import { useEffect, useState } from "react";
import type { TokenData } from "../repositories/tokenRepository";
import { loadToken, saveToken } from "../repositories/tokenRepository";

export function useAuth() {
  const [token, setToken] = useState<TokenData | null>(null);
  const [status, setStatus] = useState<string>("Checking auth...");

  useEffect(() => {
    let mounted = true;
    
    const checkAuth = async () => {
      if (!mounted) return;
      
      try {
        console.log("[useAuth] checkAuth called");
        
        // Check for Strava auth code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
          console.log("[useAuth] Found auth code from Strava redirect");
          
          try {
            // Exchange code for token via backend function
            const exchangeRes = await fetch("/.netlify/functions/exchange-code", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ code }),
            });

            if (!exchangeRes.ok) {
              const error = await exchangeRes.json();
              console.error("[useAuth] Code exchange failed:", error);
              if (mounted) setStatus("Login failed");
              return;
            }

            const tokenData = await exchangeRes.json();
            console.log("[useAuth] Token received from exchange-code");
            
            await saveToken(tokenData);
            if (!mounted) return;
            setToken(tokenData);
            setStatus("Logged in");
            console.log("[useAuth] Token saved");

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } catch (e) {
            console.error("[useAuth] Error exchanging code:", e);
            if (mounted) setStatus("Error during login");
            return;
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

    checkAuth();
    
    return () => {
      mounted = false;
    };
  }, []);

  return { token, status, setToken, setStatus };
}
