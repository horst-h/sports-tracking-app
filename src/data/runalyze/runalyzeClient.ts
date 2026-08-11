import type { RunalyzeActivity } from "./runalyzeTypes";
import { hasSession } from "../../repositories/googleSessionRepository";

/**
 * Talks to the Runalyze proxy, never to Runalyze itself.
 *
 * The browser cannot reach the API directly: only the custom `token` header
 * authenticates and the CORS preflight does not allow it. netlify/functions/
 * runalyze.ts holds the token and does the actual call — and only for a signed-in
 * athlete, whose session cookie the browser attaches to every request here.
 */
const PROXY = "/.netlify/functions/runalyze";

type ProxyError = { error?: string; detail?: string };

async function getJson<T>(
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<T> {
  if (!(await hasSession())) throw new Error("Not signed in");

  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${PROXY}?${qs}`, { signal });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ProxyError;

    if (res.status === 401) {
      // Our own gate, not Runalyze's: the session expired or the account is
      // not on the allowlist.
      throw new Error("Not signed in");
    }
    if (res.status === 503) {
      throw new Error(
        body.error === "verification_unavailable"
          ? "Could not verify the sign-in right now. Please try again."
          : "Runalyze is not configured on the server (RUNALYZE_API_TOKEN is missing)"
      );
    }
    if (res.status === 403) {
      throw new Error(
        "Runalyze rejected the API token. Re-issue it with the activity read permission ticked."
      );
    }

    throw new Error(body.error ?? `Runalyze proxy error ${res.status}`);
  }

  // An undeployed function falls through to the SPA catch-all, which answers
  // 200 with index.html. Without this check that surfaces as a JSON parse
  // error somewhere else entirely.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("The Runalyze proxy did not return JSON — is the function deployed?");
  }

  return (await res.json()) as T;
}

export const runalyzeClient = {
  /** Proves the token is accepted. Carries no identity — see getAthlete. */
  async ping(signal?: AbortSignal): Promise<void> {
    await getJson<unknown>({ resource: "ping" }, signal);
  },

  async listActivities(
    params: { page?: number; itemsPerPage?: number } = {},
    signal?: AbortSignal
  ): Promise<RunalyzeActivity[]> {
    const body = await getJson<unknown>(
      {
        resource: "activity",
        page: String(params.page ?? 1),
        itemsPerPage: String(params.itemsPerPage ?? 200),
      },
      signal
    );

    return Array.isArray(body) ? (body as RunalyzeActivity[]) : [];
  },
};
