import type { Context } from "@netlify/functions";
import { requireIdentity } from "./_lib/identity";
import { createGoalsStore } from "./_lib/goalsStore";
import type { Sport, GoalData, StoredGoal } from "./_lib/types";

/**
 * Written against the current Functions runtime, not the Lambda-compatible one.
 *
 * That is not a style preference. Netlify hands a function its Blobs context
 * through `NETLIFY_BLOBS_CONTEXT`, and the legacy runtime this used to run on
 * does not set it — measured, not assumed: a request there reports
 * `NETLIFY_BLOBS_CONTEXT: false`, `NETLIFY: false`, `DEPLOY_ID: false` and
 * `AWS_LAMBDA_FUNCTION_NAME: true`. So `getStore("goals")` had nothing to work
 * with and every request answered 503.
 *
 * The previous author's workaround was a personal access token in the site
 * environment, which is what expired and started this whole outage. Moving the
 * function to the runtime that provides a context is the way to need no
 * credential at all.
 *
 * The URL is unchanged: a default-export function is still served from
 * /.netlify/functions/goals, so nothing on the client moves.
 */

const ALLOWED_SPORTS: Sport[] = ["run", "ride", "swim"];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
    },
  });
}

function isValidSport(sport: unknown): sport is Sport {
  return typeof sport === "string" && ALLOWED_SPORTS.includes(sport as Sport);
}

function isValidYear(year: unknown): year is number {
  if (typeof year !== "number") return false;
  return year >= 2000 && year <= 2100;
}

function parseYear(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    if (isValidYear(parsed)) return parsed;
  } else if (isValidYear(value)) {
    return value;
  }
  return null;
}

function validateGoalData(data: Record<string, unknown>): GoalData | null {
  const goal: GoalData = {};

  if (data.distanceKm !== undefined) {
    if (typeof data.distanceKm === "number" && data.distanceKm >= 0) {
      goal.distanceKm = data.distanceKm;
    } else {
      return null;
    }
  }

  if (data.count !== undefined) {
    if (typeof data.count === "number" && data.count >= 0 && Number.isInteger(data.count)) {
      goal.count = data.count;
    } else {
      return null;
    }
  }

  if (data.elevationM !== undefined) {
    if (typeof data.elevationM === "number" && data.elevationM >= 0) {
      goal.elevationM = data.elevationM;
    } else {
      return null;
    }
  }

  return goal;
}

function nowIso(): string {
  return new Date().toISOString();
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === "OPTIONS") return json(200, {});

  console.info(`[Goals API] Incoming ${req.method} request`);

  // Header names arrive lowercased here; headerOf compares case-insensitively
  // either way, so the identity check does not care which runtime it is on.
  const headers = Object.fromEntries(req.headers) as Record<string, string | undefined>;

  const auth = await requireIdentity(headers);
  if (!auth.ok) {
    console.warn(`[Goals API] Rejected: ${auth.error}`);
    return json(auth.status, { error: auth.error });
  }

  const subject = auth.subject;
  console.info(`[Goals API] Authenticated subject: ${subject}`);

  try {
    return await handleRequest(req, subject);
  } catch (error) {
    // A storage failure is ours, and it is temporary. It must never leave here
    // as 200 with an empty answer: the clients treat "no goal" as fact and
    // erase their local copies to match, so a lapsed credential would delete
    // the goals off every device that asked.
    console.error("[Goals API] Storage unavailable:", error);
    return json(503, { error: "storage_unavailable" });
  }
}

async function handleRequest(req: Request, subject: string): Promise<Response> {
  const store = createGoalsStore();
  const params = new URL(req.url).searchParams;

  // GET: Retrieve a goal
  if (req.method === "GET") {
    const yearParam = params.get("year");
    const sportParam = params.get("sport");

    const year = parseYear(yearParam);
    if (!year) {
      console.warn("[Goals API] Invalid year parameter:", yearParam);
      return json(400, { error: "invalid_year" });
    }

    if (!isValidSport(sportParam)) {
      console.warn("[Goals API] Invalid sport parameter:", sportParam);
      return json(400, { error: "invalid_sport" });
    }

    console.info(`[Goals API] Fetching goal: subject=${subject}, year=${year}, sport=${sportParam}`);
    const goal = await store.get(subject, year, sportParam);
    console.info(`[Goals API] Goal found:`, goal ? "yes" : "no");
    return json(200, { goal });
  }

  // PUT: Create or update a goal
  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      console.warn("[Goals API] Invalid JSON in request body");
      return json(400, { error: "invalid_json" });
    }

    const year = parseYear(body.year);
    if (!year) {
      console.warn("[Goals API] Invalid year:", body.year);
      return json(400, { error: "invalid_year" });
    }

    if (!isValidSport(body.sport)) {
      console.warn("[Goals API] Invalid sport:", body.sport);
      return json(400, { error: "invalid_sport" });
    }

    const goalData = validateGoalData(body);
    if (goalData === null) {
      console.warn("[Goals API] Invalid goal data:", body);
      return json(400, { error: "invalid_goal_data" });
    }

    console.info(
      `[Goals API] Saving goal: subject=${subject}, year=${year}, sport=${body.sport}`,
      goalData
    );

    // Load existing or create new
    const existing = await store.get(subject, year, body.sport);
    const now = nowIso();

    const storedGoal: StoredGoal = {
      subject,
      year,
      sport: body.sport,
      ...goalData,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      version: (existing?.version ?? 0) + 1,
    };

    const saved = await store.set(storedGoal);
    console.info(`[Goals API] Goal saved successfully with version ${saved.version}`);
    return json(200, { goal: saved });
  }

  // DELETE: Remove a goal
  if (req.method === "DELETE") {
    const yearParam = params.get("year");
    const sportParam = params.get("sport");

    const year = parseYear(yearParam);
    if (!year) {
      console.warn("[Goals API] Invalid year for deletion:", yearParam);
      return json(400, { error: "invalid_year" });
    }

    if (!isValidSport(sportParam)) {
      console.warn("[Goals API] Invalid sport for deletion:", sportParam);
      return json(400, { error: "invalid_sport" });
    }

    console.info(`[Goals API] Deleting goal: subject=${subject}, year=${year}, sport=${sportParam}`);
    const deleted = await store.delete(subject, year, sportParam);
    console.info(`[Goals API] Goal deletion result:`, deleted);
    return json(200, { ok: deleted });
  }

  console.warn(`[Goals API] Unsupported HTTP method: ${req.method}`);
  return json(405, { error: "method_not_allowed" });
}
