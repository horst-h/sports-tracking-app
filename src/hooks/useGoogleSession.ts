import { useCallback, useEffect, useState } from "react";
import {
  clearSession,
  loadSession,
  saveSession,
  type GoogleSession,
} from "../repositories/googleSessionRepository";
import { disableAutoSelect } from "../services/googleAuth";
import { endSession, refreshSession, SessionUnavailable } from "../services/appSessionApi";

export type SessionStatus = "checking" | "signed-in" | "signed-out";

/**
 * The app's own login, independent of any activity source.
 *
 * Both the goals store and the Runalyze proxy hand out personal data and both
 * require this session, so it is the single thing standing between an opened
 * tab and the athlete's history.
 *
 * Start-up reads the stored profile first and renders on it, then asks the
 * server. Local first because the app has to work offline and must not stall
 * behind a network call; the server afterwards because only it knows whether
 * the cookie is still good — and because being asked is what slides the
 * ninety-day window forward.
 */
export function useGoogleSession() {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;

      setSession(stored);
      setStatus(stored ? "signed-in" : "signed-out");

      // Nothing stored means nothing to revalidate: the cookie alone cannot
      // sign anyone in, because the profile to render would still be missing.
      if (!stored) return;

      try {
        const confirmed = await refreshSession();
        if (cancelled) return;

        if (!confirmed) {
          await clearSession();
          setSession(null);
          setStatus("signed-out");
          return;
        }

        await saveSession(confirmed);
        if (!cancelled) setSession(confirmed);
      } catch (e) {
        // Unreachable is not rejected. Keep the stored session; the next
        // request that actually needs the server will surface a real 401.
        if (!(e instanceof SessionUnavailable)) throw e;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((next: GoogleSession) => {
    setSession(next);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    await clearSession();
    await disableAutoSelect();
    setSession(null);
    setStatus("signed-out");
  }, []);

  return { session, status, signIn, signOut };
}
