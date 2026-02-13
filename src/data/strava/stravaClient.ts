import type { StravaAthlete, StravaActivity } from './stravaTypes';
import { loadToken } from '../../repositories/tokenRepository';

const STRAVA_API = 'https://www.strava.com/api/v3';

async function authHeader() {
  const token = await loadToken();
  if (!token?.access_token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token.access_token}` };
}

async function getJson<T>(url: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(url, { headers });

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
    } = {},
  ): Promise<StravaActivity[]> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 50;

    const qs = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
    });

    if (params.after) qs.set('after', String(params.after));
    if (params.before) qs.set('before', String(params.before));

    return getJson<StravaActivity[]>(
      `${STRAVA_API}/athlete/activities?${qs.toString()}`,
    );
  },
};
