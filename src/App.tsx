import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AppHeader from "./components/AppHeader";
import SportSwitcher from "./components/SportSwitcher";
import YearlyDistanceGoalCard from "./components/YearlyDistanceGoalCard";
import YearlyCountGoalCard from "./components/YearlyCountGoalCard";
import YearlyElevationGoalCard from "./components/YearlyElevationGoalCard";
import BottomDrawer from "./components/BottomDrawer";
import LoginCard from "./components/LoginCard";
import DataAttribution from "./components/DataAttribution";

declare const __VITE_BUILD_TIME__: string;
import PullToRefresh from "./components/PullToRefresh";

import type { Sport, YearGoals, NormalizedActivity } from "./domain/metrics/types";
import type { UiAthleteStats, ForecastMode } from "./domain/metrics/uiStats";
import { normalizeActivities } from "./domain/metrics/normalize";
import { aggregateYear } from "./domain/metrics/aggregate";
import { buildUiAthleteStats } from "./domain/metrics/uiStats";
import { calculateForecast, type ForecastResult } from "./domain/metrics/forecast";

import { useActivities } from "./hooks/useActivities";
import { useAthlete } from "./hooks/useAthlete";
import { useDataAccess } from "./hooks/useDataAccess";
import * as goalsRepo from "./repositories/goalsRepository";
import { clearToken } from "./repositories/tokenRepository";
import { initialsFrom } from "./utils/initials";

// Type for stats with optional forecasts
type StatsWithForecasts = UiAthleteStats & {
  forecasts?: {
    distanceKm?: ForecastResult;
    count?: ForecastResult;
    elevationM?: ForecastResult;
  };
};

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {}, swim: {} } };
}

// Build daily series from normalized activities per sport
function buildDailySeries(
  normalized: NormalizedActivity[],
  sport: Sport,
  year: number,
  metric: "distanceKm" | "count" | "elevationM"
): Array<{ date: string; value: number }> {
  const byDay = new Map<string, number>();

  normalized
    .filter((a) => a.sport === sport && a.year === year)
    .forEach((a) => {
      const key = a.startDateLocal.split("T")[0]; // YYYY-MM-DD
      const current = byDay.get(key) ?? 0;

      if (metric === "count") {
        byDay.set(key, current + 1);
      } else if (metric === "distanceKm") {
        byDay.set(key, current + a.distanceKm);
      } else if (metric === "elevationM") {
        byDay.set(key, current + a.elevationM);
      }
    });

  return Array.from(byDay, ([date, value]) => ({ date, value })).sort(
    (a, b) => a.date.localeCompare(b.date)
  );
}

// Build activity count per day (for per-unit calculations)
function buildDailyActivityCountSeries(
  normalized: NormalizedActivity[],
  sport: Sport,
  year: number
): Array<{ date: string; value: number }> {
  const byDay = new Map<string, number>();

  normalized
    .filter((a) => a.sport === sport && a.year === year)
    .forEach((a) => {
      const key = a.startDateLocal.split("T")[0]; // YYYY-MM-DD
      const current = byDay.get(key) ?? 0;
      byDay.set(key, current + 1);
    });

  return Array.from(byDay, ([date, value]) => ({ date, value })).sort(
    (a, b) => a.date.localeCompare(b.date)
  );
}

export default function App() {
  const [sport, setSport] = useState<Sport>("run");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const year = new Date().getFullYear();
  const [goals, setGoals] = useState<YearGoals>(emptyGoals(year));
  /** Bumped by the pull-to-refresh, mirroring how useActivities re-runs. */
  const [goalsRefreshTrigger, setGoalsRefreshTrigger] = useState(0);

  // Auth check (MUST be before conditional return)
  const { ready, needsLogin, signIn, signOut, session, check } = useDataAccess();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Athlete data (profile image) (MUST be before conditional return)
  const { athlete } = useAthlete(ready);

  // Restore sport from URL on mount
  useEffect(() => {
    const param = searchParams.get("sport");
    // Migration: "hiking" → "swim" (or fallback to "run")
    if (param === "run" || param === "ride" || param === "swim") {
      setSport(param);
    } else if (param === "hiking") {
      // Legacy migration: redirect hiking to swimming
      setSport("swim");
      setSearchParams({ sport: "swim" }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Wrapper to update both state and URL when user clicks sport switcher
  function handleSportChange(newSport: Sport) {
    setSport(newSport);
    setSearchParams({ sport: newSport }, { replace: true });
  }

  // activities (MUST be before conditional return)
  const { activities, loading, refreshing, error, lastSync, refetch } = useActivities(year, ready);

  // Load goals whenever the year changes, the drawer closes after a save, the
  // athlete signs in, or they pull to refresh.
  //
  // Sign-in is not optional here: before it, this can only answer from the
  // local cache, so on a device that has never held these goals it returns
  // nothing — and without `ready` in the dependencies it would never ask again.
  //
  // Neither is the refresh. Pulling down is how someone says "fetch what I am
  // missing", and answering that with activities alone left a goal set on
  // another device invisible until the screen happened to remount.
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    (async () => {
      const loaded = await goalsRepo.loadGoals(year, (fresh) => {
        // The cache answers first; this is the backend catching up afterwards.
        if (!cancelled) setGoals(fresh ?? emptyGoals(year));
      });
      if (!cancelled) setGoals(loaded ?? emptyGoals(year));
    })();

    return () => {
      cancelled = true;
    };
  }, [year, settingsOpen, ready, goalsRefreshTrigger]);

  // optional: later expose in UI
  const mode: ForecastMode = "ytd";

  // Build dashboard data (MUST be before conditional return)
  const dashboard = useMemo(() => {
    if (!ready || !activities) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const normalized = normalizeActivities(activities);

    function buildForSport(s: Sport): StatsWithForecasts {
      const agg = aggregateYear(normalized, year, s, asOfLocalIso);

      const sportGoals = goals?.perSport?.[s];

      const stats = buildUiAthleteStats({
        aggregate: agg,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
        goals: sportGoals,
        mode,
        blendWeightRolling: 0.6,
      });

      // Build forecasts for each metric if goal is set
      const forecasts: StatsWithForecasts["forecasts"] = {};
      const activityCountSeries = buildDailyActivityCountSeries(normalized, s, year);

      if (sportGoals?.distanceKm) {
        const dailySeries = buildDailySeries(normalized, s, year, "distanceKm");
        forecasts.distanceKm = calculateForecast({
          goalValue: sportGoals.distanceKm,
          currentValue: stats.progress.distanceKm.ytd,
          year,
          dailySeries,
          activityCountByDay: activityCountSeries,
        });
      }

      if (sportGoals?.count) {
        const dailySeries = buildDailySeries(normalized, s, year, "count");
        forecasts.count = calculateForecast({
          goalValue: sportGoals.count,
          currentValue: stats.progress.count.ytd,
          year,
          dailySeries,
        });
      }

      if (sportGoals?.elevationM) {
        const dailySeries = buildDailySeries(normalized, s, year, "elevationM");
        forecasts.elevationM = calculateForecast({
          goalValue: sportGoals.elevationM,
          currentValue: stats.progress.elevationM.ytd,
          year,
          dailySeries,
          activityCountByDay: activityCountSeries,
        });
      }

      return { ...stats, forecasts: Object.keys(forecasts).length > 0 ? forecasts : undefined };
    }

    return {
      run: buildForSport("run"),
      ride: buildForSport("ride"),
      swim: buildForSport("swim"),
    };
  }, [activities, goals, year, mode, ready]);

  // Sources that authenticate in the browser need a login first (AFTER all hooks)
  if (needsLogin) {
    return <LoginCard onSignedIn={signIn} />;
  }

  const currentStats = dashboard
    ? (sport === "run" ? dashboard.run : sport === "ride" ? dashboard.ride : dashboard.swim)
    : null;

  async function handleForceLogout() {
    // Both: the app's own session, and whatever Strava token is still lying
    // around from before the switch.
    await signOut();
    await clearToken();
    window.location.href = "/";
  }

  async function handleRefresh() {
    setGoalsRefreshTrigger((n) => n + 1);
    await refetch();
  }

  // Determine sync status
  const syncStatus = error ? 'error' : (loading || refreshing) ? 'syncing' : 'idle';

  return (
    <PullToRefresh onRefresh={handleRefresh} enabled={ready}>
      {/* Sticky Header + Tab Navigation Container */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "var(--bg)",
          borderBottom: "1px solid var(--border)",
          width: "min(100%, 640px)",
          margin: "0 auto",
          paddingLeft: "var(--space-4)",
          paddingRight: "var(--space-4)",
        }}
      >
        <AppHeader
          title="still moving"
          syncStatus={syncStatus}
          lastSync={lastSync}
          avatarText={initialsFrom(session?.name, session?.email)}
          // Google knows who the athlete is; Runalyze has no identity endpoint
          // at all and its provider returns no avatar. The fallback is kept for
          // a source that does offer one.
          avatarImage={session?.picture ?? athlete?.avatarUrl}
          onAvatarClick={() => setSettingsOpen(true)}
          onRefresh={handleRefresh}
        />
        <SportSwitcher value={sport} onChange={handleSportChange} />
      </div>

      <main className="container" role="main" style={{ paddingTop: "0.5rem" }}>
        {/* The server was reachable and would not confirm the session. Not
            offline — offline says nothing, because offline is expected here. */}
        {check === "server-error" && (
          <p role="status" className="mt-16 notice-warning">
            Signed in on this device, but the server would not confirm it. What you
            see may be out of date, and changes may not be saved anywhere else.
            Signing out and back in usually resolves it.
          </p>
        )}

        {loading && <p className="mt-16">Loading activities…</p>}
        {error && (
          <p className="mt-16 text-error">
            {error}
          </p>
        )}

        {!loading && !error && (
          <section className="mt-16 d-grid gap-16">
            {currentStats ? (
              <>
                <YearlyDistanceGoalCard
                  sport={sport}
                  stats={currentStats}
                  forecast={currentStats.forecasts?.distanceKm}
                />
                <YearlyCountGoalCard
                  sport={sport}
                  stats={currentStats}
                  forecast={currentStats.forecasts?.count}
                />
                {/* Elevation is not tracked for swimming */}
                {sport !== "swim" && (
                  <YearlyElevationGoalCard
                    sport={sport}
                    stats={currentStats}
                    forecast={currentStats.forecasts?.elevationM}
                  />
                )}
              </>
            ) : (
              <p>No activities yet for {year}.</p>
            )}
          </section>
        )}

        <BottomDrawer
          open={settingsOpen}
          title="Goals & Settings"
          onClose={() => setSettingsOpen(false)}
        >
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                navigate("/goals");
              }}
              aria-label="Goals"
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Goals
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                navigate("/history");
              }}
              aria-label="Activity history"
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Activity History
            </button>

            <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
              More quick settings coming here.
            </div>
          </div>
          <div className="drawer-footer">
            <button type="button" onClick={handleForceLogout} className="drawer-logout">
              Sign out
            </button>
          </div>
        </BottomDrawer>
      </main>

      <footer style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        padding: '1rem',
        fontSize: '0.875rem',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border)',
        marginTop: '1rem',
        flexWrap: 'wrap'
      }}>
        <DataAttribution />
        <span style={{ opacity: 0.6 }}>• Build: {__VITE_BUILD_TIME__}</span>
      </footer>
    </PullToRefresh>
  );
}
