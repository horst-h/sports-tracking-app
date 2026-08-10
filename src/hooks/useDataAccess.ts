import { useGoogleSession } from "./useGoogleSession";

/**
 * Whether the app may read data, and whether it has to ask for a login first.
 *
 * The gate used to be "is there a Strava token", which was the same question
 * only as long as Strava was both the data source and the identity. It is
 * neither now: activities come from Runalyze through a server-side token, and
 * identity comes from Google. What every screen actually needs to know is
 * whether the athlete is signed in to *this* app.
 *
 * Three states, not two. While the stored session is still being read, neither
 * flag is set — otherwise every reload would flash the login screen before
 * settling on the dashboard.
 */
export type DataAccess = {
  /** Safe to fetch and render personal data. */
  ready: boolean;
  /** Show the login screen; nothing else will work until this is resolved. */
  needsLogin: boolean;
  /** The session is still being read from storage. */
  checking: boolean;
};

export function resolveAccess(status: "checking" | "signed-in" | "signed-out"): DataAccess {
  return {
    ready: status === "signed-in",
    needsLogin: status === "signed-out",
    checking: status === "checking",
  };
}

export function useDataAccess() {
  const session = useGoogleSession();
  return { ...session, ...resolveAccess(session.status) };
}
