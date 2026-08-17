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
 * What the server had to say about the stored session, as opposed to what this
 * device believes about it.
 *
 * Kept apart from `status` on purpose. Status answers "do we render a signed-in
 * interface", and offline that has to stay yes. This answers "has anyone
 * actually confirmed it", and offline that is no — a distinction the app was
 * missing entirely, so a deployment that could authenticate nobody still looked
 * completely normal while every request behind it failed.
 */
export type SessionCheck = "pending" | "confirmed" | "unreachable" | "server-error";

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
  const [check, setCheck] = useState<SessionCheck>("pending");

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
          setCheck("confirmed"); // A clean 401 is an answer, not a failure.
          return;
        }

        await saveSession(confirmed);
        if (cancelled) return;
        setSession(confirmed);
        setCheck("confirmed");
      } catch (e) {
        // Unconfirmed is not signed out: the session stays either way, because
        // this app is meant to work with no network at all. What changes is
        // that the app now knows it is running on an unverified session and can
        // say so, instead of presenting itself as fully signed in while every
        // request behind it quietly fails.
        if (!(e instanceof SessionUnavailable)) throw e;
        if (!cancelled) setCheck(e.reason === "unreachable" ? "unreachable" : "server-error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((next: GoogleSession) => {
    setSession(next);
    setStatus("signed-in");
    // This session came from /session a moment ago, which is the server
    // confirming it in the strongest sense available: it just minted it.
    setCheck("confirmed");
  }, []);

  const signOut = useCallback(async () => {
    await endSession();
    await clearSession();
    await disableAutoSelect();
    setSession(null);
    setStatus("signed-out");
    setCheck("pending");
  }, []);

  return { session, status, check, signIn, signOut };
}
