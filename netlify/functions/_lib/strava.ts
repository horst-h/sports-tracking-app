import type { StravaAthlete } from "./types";

/**
 * Validates a Strava access token by calling Strava /athlete endpoint.
 * Returns the athlete object if valid, or null if invalid.
 */
export async function validateStravaToken(
  accessToken: string
): Promise<StravaAthlete | null> {
  try {
    const response = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const athlete = await response.json();
    
    if (typeof athlete?.id !== "number") {
      return null;
    }

    return {
      id: athlete.id,
      username: athlete.username,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
    };
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from Authorization header.
 */
export function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}
