import { useCallback, useEffect, useState } from "react";
import {
  clearSession,
  loadSession,
  type GoogleSession,
} from "../repositories/googleSessionRepository";
import { disableAutoSelect } from "../services/googleAuth";

export type SessionStatus = "checking" | "signed-in" | "signed-out";

/**
 * The app's own login, independent of any activity source.
 *
 * Both the goals store and the Runalyze proxy hand out personal data and both
 * require this session, so it is the single thing standing between an opened
 * tab and the athlete's history.
 */
export function useGoogleSession() {
  const [session, setSession] = useState<GoogleSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    void loadSession().then((existing) => {
      if (cancelled) return;
      setSession(existing);
      setStatus(existing ? "signed-in" : "signed-out");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((next: GoogleSession) => {
    setSession(next);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    await clearSession();
    await disableAutoSelect();
    setSession(null);
    setStatus("signed-out");
  }, []);

  return { session, status, signIn, signOut };
}
