import type { ActivityProvider } from "./ports/activityProvider";
import { stravaActivityProvider } from "./strava/stravaActivityProvider";

/**
 * Single place that decides which source the app reads from.
 *
 * Adding Runalyze means registering it here and flipping the default —
 * nothing above this file names a provider.
 */
const providers: Record<string, ActivityProvider> = {
  strava: stravaActivityProvider,
};

const DEFAULT_PROVIDER = "strava";

export function getActivityProvider(id: string = DEFAULT_PROVIDER): ActivityProvider {
  const provider = providers[id];
  if (!provider) throw new Error(`Unknown activity provider: ${id}`);
  return provider;
}
