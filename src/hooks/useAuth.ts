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
        // Check for Strava auth code in URL
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code) {
          try {
            // Exchange code for token via backend function
            const exchangeRes = await fetch("/.netlify/functions/exchange-code", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ code }),
            });

            if (!exchangeRes.ok) {
              const error = await exchangeRes.json();
              if (mounted) setStatus("Login failed");
              return;
            }

            const tokenData = await exchangeRes.json();
            await saveToken(tokenData);
            if (!mounted) return;
            setToken(tokenData);
            setStatus("Logged in");

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } catch (e) {
            if (mounted) setStatus("Error during login");
            return;
          }
        }

        const existing = await loadToken();
        if (!mounted) return;
        if (existing) {
          setToken(existing);
          setStatus("Logged in");
        } else {
          setStatus("Not logged in");
        }
      } catch (e) {
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
