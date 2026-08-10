import type { Handler } from "@netlify/functions";
import { requireIdentity } from "./_lib/identity";

/**
 * Read-only proxy in front of the Runalyze API.
 *
 * This function is not a convenience wrapper — the browser genuinely cannot
 * talk to Runalyze directly. Measured against the live API:
 *
 *   - only the custom `token` header authenticates; `Authorization: Bearer`
 *     returns 401
 *   - the CORS preflight answers
 *     `access-control-allow-headers: content-type, authorization`
 *     — `token` is not in that list, so a browser request carrying it never
 *     leaves the preflight
 *
 * Beyond that, a Runalyze personal API token is long-lived and account-wide.
 * Unlike a Strava access token it neither expires nor can be scoped down
 * after the fact, so it stays on the server and is never sent to the client.
 *
 * Callers are authenticated: without a Google identity on the allowlist this
 * answers 401 and reaches Runalyze not at all. The activity history is
 * personal data, and the endpoint is as public as the site it is deployed to.
 */

const BASE = "https://runalyze.com/api/v1";

/**
 * Upstream paths this proxy is willing to reach. An allowlist rather than a
 * pass-through path parameter, so no caller can steer the server-side request
 * somewhere else.
 */
const RESOURCES: Record<string, string> = {
  ping: "/ping",
  activity: "/activity",
};

/** Query parameters forwarded upstream, with the shape each one must have. */
const FORWARDED_PARAMS: Record<string, RegExp> = {
  page: /^\d{1,4}$/,
  itemsPerPage: /^\d{1,3}$/,
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
    },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, {});

  // Read-only by construction: the upstream request below is always a GET,
  // and anything but a GET is refused before we get there.
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const auth = await requireIdentity(event.headers);
  if (!auth.ok) {
    console.warn(`[runalyze] Rejected: ${auth.error}`);
    return json(auth.status, { error: auth.error });
  }

  const token = process.env.RUNALYZE_API_TOKEN;
  if (!token) {
    return json(503, {
      error: "Runalyze is not configured",
      detail: "RUNALYZE_API_TOKEN is not set in this environment",
    });
  }

  const params = event.queryStringParameters ?? {};

  const resource = params.resource ?? "";
  const upstreamPath = RESOURCES[resource];
  if (!upstreamPath) {
    return json(400, {
      error: "Unknown resource",
      allowed: Object.keys(RESOURCES),
    });
  }

  const qs = new URLSearchParams();
  for (const [name, pattern] of Object.entries(FORWARDED_PARAMS)) {
    const value = params[name];
    if (value === undefined) continue;
    if (!pattern.test(value)) {
      return json(400, { error: `Invalid value for ${name}` });
    }
    qs.set(name, value);
  }

  // Newest first. Runalyze has no date filter, so the client pages through
  // everything anyway — but a stable order keeps pagination from repeating or
  // skipping records while the account is being written to.
  if (resource === "activity") qs.set("order[id]", "desc");

  const query = qs.toString();
  const url = `${BASE}${upstreamPath}${query ? `?${query}` : ""}`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { token, accept: "application/json" },
    });
  } catch (e) {
    return json(502, {
      error: "Runalyze is unreachable",
      detail: String((e as Error)?.message ?? e),
    });
  }

  const text = await upstream.text();

  if (!upstream.ok) {
    // Pass the status through so the client can tell "token rejected" from
    // "rate limited" from "server down", but keep the upstream body out of
    // the response: on a misconfigured token Runalyze answers with an HTML
    // error page, and that is not useful to a JSON client.
    return json(upstream.status, {
      error: `Runalyze API error ${upstream.status}`,
      detail: text.slice(0, 200),
    });
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
    body: text,
  };
};
