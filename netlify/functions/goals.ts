import type { Handler } from "@netlify/functions";
import { extractBearerToken, validateStravaToken } from "./_lib/strava";
import { createGoalsStore } from "./_lib/goalsStore";
import type { Sport, GoalData, StoredGoal } from "./_lib/types";

const ALLOWED_SPORTS: Sport[] = ["run", "ride"];

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
      "access-control-allow-headers": "Authorization, Content-Type",
    },
    body: JSON.stringify(body),
  };
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

function validateGoalData(data: any): GoalData | null {
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

export const handler: Handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return json(200, {});
  }

  console.info(`[Goals API] Incoming ${event.httpMethod} request`);

  // Extract and validate token
  const token = extractBearerToken(event.headers.authorization);
  if (!token) {
    console.warn("[Goals API] Missing authorization token");
    return json(401, { error: "missing_authorization" });
  }

  const athlete = await validateStravaToken(token);
  if (!athlete) {
    console.warn("[Goals API] Invalid/expired token");
    return json(401, { error: "invalid_token" });
  }

  console.info(`[Goals API] Authenticated athlete: ${athlete.id}`);

  const store = createGoalsStore();

  // GET: Retrieve a goal
  if (event.httpMethod === "GET") {
    const yearParam = event.queryStringParameters?.year;
    const sportParam = event.queryStringParameters?.sport;

    const year = parseYear(yearParam);
    if (!year) {
      console.warn("[Goals API] Invalid year parameter:", yearParam);
      return json(400, { error: "invalid_year" });
    }

    if (!isValidSport(sportParam)) {
      console.warn("[Goals API] Invalid sport parameter:", sportParam);
      return json(400, { error: "invalid_sport" });
    }

    console.info(`[Goals API] Fetching goal: athlete=${athlete.id}, year=${year}, sport=${sportParam}`);
    const goal = await store.get(athlete.id, year, sportParam);
    console.info(`[Goals API] Goal found:`, goal ? "yes" : "no");
    return json(200, { goal });
  }

  // PUT: Create or update a goal
  if (event.httpMethod === "PUT") {
    let body: any;
    try {
      body = JSON.parse(event.body || "{}");
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

    console.info(`[Goals API] Saving goal: athlete=${athlete.id}, year=${year}, sport=${body.sport}`, goalData);

    // Load existing or create new
    const existing = await store.get(athlete.id, year, body.sport);
    const now = nowIso();

    const storedGoal: StoredGoal = {
      athleteId: athlete.id,
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
  if (event.httpMethod === "DELETE") {
    const yearParam = event.queryStringParameters?.year;
    const sportParam = event.queryStringParameters?.sport;

    const year = parseYear(yearParam);
    if (!year) {
      console.warn("[Goals API] Invalid year for deletion:", yearParam);
      return json(400, { error: "invalid_year" });
    }

    if (!isValidSport(sportParam)) {
      console.warn("[Goals API] Invalid sport for deletion:", sportParam);
      return json(400, { error: "invalid_sport" });
    }

    console.info(`[Goals API] Deleting goal: athlete=${athlete.id}, year=${year}, sport=${sportParam}`);
    const deleted = await store.delete(athlete.id, year, sportParam);
    console.info(`[Goals API] Goal deletion result:`, deleted);
    return json(200, { ok: deleted });
  }

  console.warn(`[Goals API] Unsupported HTTP method: ${event.httpMethod}`);
  return json(405, { error: "method_not_allowed" });
};
