import type { ActivityProvider } from "./ports/activityProvider";
import type { ProviderId } from "../domain/activity";
import { stravaActivityProvider } from "./strava/stravaActivityProvider";
import { runalyzeActivityProvider } from "./runalyze/runalyzeActivityProvider";

/**
 * Single place that decides which source the app reads from.
 *
 * Runalyze is the source now; Strava access ended with the subscription.
 * Strava stays registered rather than deleted, and `?provider=strava` still
 * selects it: the years already in its cache are readable that way, which is
 * the only remaining copy of anything Runalyze does not carry. Live fetches
 * against it will fail — reading the cache is all it is still good for.
 *
 * Nothing above this file names a provider.
 */
const providers: Record<ProviderId, ActivityProvider> = {
  strava: stravaActivityProvider,
  runalyze: runalyzeActivityProvider,
};

const DEFAULT_PROVIDER: ProviderId = "runalyze";

const STORAGE_KEY = "activityProvider";

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(providers, value);
}

/**
 * The selection rule, kept free of browser globals so it can be tested.
 *
 * The query parameter wins and is remembered afterwards. Remembering matters:
 * the Strava OAuth round trip returns to a bare path and useAuth then strips
 * the query outright, so a selection that lived only in the URL would be lost
 * on every login.
 */
export function resolveProviderId(search: string, stored: string | null): ProviderId {
  const fromUrl = new URLSearchParams(search).get("provider");
  if (isProviderId(fromUrl)) return fromUrl;
  if (isProviderId(stored)) return stored;
  return DEFAULT_PROVIDER;
}

/** Storage access is best effort — Safari's private mode throws on both. */
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: ProviderId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* the URL parameter still works for this page load */
  }
}

/**
 * Persists what the URL asked for, once per page load.
 *
 * Deliberately a module-level effect rather than something getActivityProviderId
 * does: that function is called from render bodies, and a component render must
 * not write to storage.
 */
function rememberUrlSelection(): void {
  if (typeof window === "undefined") return;
  const fromUrl = new URLSearchParams(window.location.search).get("provider");
  if (isProviderId(fromUrl)) writeStored(fromUrl);
}

rememberUrlSelection();

/** Pure read — safe to call during render. */
export function getActivityProviderId(): ProviderId {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  return resolveProviderId(window.location.search, readStored());
}

export function setActivityProviderId(id: ProviderId): void {
  writeStored(id);
}

export function getActivityProvider(id: ProviderId = getActivityProviderId()): ActivityProvider {
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown activity provider: ${id}`);
  return provider;
}
