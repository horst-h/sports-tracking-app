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
        console.log("[useAuth] window.location.search:", window.location.search);
        console.log("[useAuth] localStorage keys:", Object.keys(localStorage));
        
        // Check for token in localStorage (from oauth-callback.html)
        const storedToken = localStorage.getItem('strava_oauth_token');
        console.log("[useAuth] storedToken from localStorage:", storedToken ? "present" : "not found");
        
        if (storedToken) {
          console.log("[useAuth] Found token in localStorage from callback");
          localStorage.removeItem('strava_oauth_token');
          
          try {
            const json = atob(storedToken);
            console.log("[useAuth] Decoded localStorage token");
            const decoded = JSON.parse(json);
            
            await saveToken(decoded);
            if (!mounted) return;
            setToken(decoded);
            setStatus("Logged in");
            console.log("[useAuth] Token from localStorage saved");
            return;
          } catch (e) {
            console.error("[useAuth] Error processing localStorage token:", e);
          }
        }
        
        // Check for token in URL query parameter (direct method, fallback)
        const urlParams = new URLSearchParams(window.location.search);
        const tokenParam = urlParams.get('token');
        console.log("[useAuth] tokenParam from query:", tokenParam ? "present" : "not found");
        
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
    
    // Listen for storage events (from oauth-callback.html in same tab)
    const handleStorage = () => {
      console.log("[useAuth] storage event detected");
      checkAuth();
    };
    window.addEventListener("storage", handleStorage);
    
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return { token, status, setToken, setStatus };
}
