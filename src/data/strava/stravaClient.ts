import type { StravaAthlete, StravaActivity } from "./stravaTypes";
import { withValidAccessToken } from "../../repositories/tokenRepository";
import { refreshAccessToken } from "../../services/stravaAuthApi";

const STRAVA_API = "https://www.strava.com/api/v3";

async function authHeader() {
  const access = await withValidAccessToken(refreshAccessToken, { skewSeconds: 60 });
  if (!access) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${access}` };
}

async function getJson<T>(url: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(url, { headers });

  // If Strava returns 401, token may be expired/revoked; one retry after refresh can help.
  if (res.status === 401) {
    const headers2 = await authHeader();
    const res2 = await fetch(url, { headers: headers2 });

    if (!res2.ok) {
      const text2 = await res2.text();
      throw new Error(`Strava API error ${res2.status}: ${text2}`);
    }
    return (await res2.json()) as T;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API error ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export const stravaClient = {
  async getAthlete(): Promise<StravaAthlete> {
    return getJson<StravaAthlete>(`${STRAVA_API}/athlete`);
  },

  async listActivities(
    params: {
      page?: number;
      perPage?: number;
      after?: number; // unix seconds
      before?: number; // unix seconds
    } = {}
  ): Promise<StravaActivity[]> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;

    const qs = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (params.after) qs.set("after", String(params.after));
    if (params.before) qs.set("before", String(params.before));

    return getJson<StravaActivity[]>(
      `${STRAVA_API}/athlete/activities?${qs.toString()}`
    );
  },
};
