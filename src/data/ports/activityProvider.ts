import type { Activity, ProviderId } from "../../domain/activity";

/**
 * What a source can and cannot do.
 *
 * Providers are not interchangeable in practice — Strava filters by date
 * server-side and exposes an athlete id, Runalyze does neither. Declaring the
 * differences here keeps them visible at the call site instead of turning them
 * into silent zeroes further down.
 */
export interface ProviderCapabilities {
  /** Can the source narrow a fetch to a date range, or must we filter locally? */
  serverSideDateFilter: boolean;
  /** Is there a stable account id we can partition stored data by? */
  stableAthleteId: boolean;
  /** Does the profile carry an avatar image? */
  avatarUrl: boolean;
  /** Are activities flagged as commutes? */
  commuteFlag: boolean;
  /** Are indoor/trainer activities flagged? */
  indoorFlag: boolean;
}

export interface AthleteProfile {
  /** null when the source has no identity endpoint (see stableAthleteId). */
  id: string | null;
  displayName: string;
  avatarUrl?: string;
}

export interface ActivityProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  /**
   * All activities that fall into the given calendar year, in the athlete's
   * local time. Providers without a server-side date filter fetch what they
   * must and narrow the result themselves.
   */
  listYearActivities(year: number, signal?: AbortSignal): Promise<Activity[]>;

  getAthlete(): Promise<AthleteProfile>;
}
