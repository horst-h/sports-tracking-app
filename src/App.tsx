import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppHeader from "./components/AppHeader";
import SportSwitcher from "./components/SportSwitcher";
import YearlyDistanceGoalCard from "./components/YearlyDistanceGoalCard";
import YearlyCountGoalCard from "./components/YearlyCountGoalCard";
import YearlyElevationGoalCard from "./components/YearlyElevationGoalCard";
import BottomDrawer from "./components/BottomDrawer";
import LoginCard from "./components/LoginCard";

import type { Sport, YearGoals, NormalizedActivity } from "./domain/metrics/types";
import type { UiAthleteStats, ForecastMode } from "./domain/metrics/uiStats";
import { normalizeActivities } from "./domain/metrics/normalize";
import { aggregateYear } from "./domain/metrics/aggregate";
import { buildUiAthleteStats } from "./domain/metrics/uiStats";
import { calculateForecast, type ForecastResult } from "./domain/metrics/forecast";

import { useActivities } from "./hooks/useActivities";
import { useAthlete } from "./hooks/useAthlete";
import { useAuth } from "./hooks/useAuth";
import * as goalsRepo from "./repositories/goalsRepository";
import { clearToken } from "./repositories/tokenRepository";

function formatHeaderDate(d: Date) {
  return d.toDateString();
}

// Type for stats with optional forecasts
type StatsWithForecasts = UiAthleteStats & {
  forecasts?: {
    distanceKm?: ForecastResult;
    count?: ForecastResult;
    elevationM?: ForecastResult;
  };
};

function toStravaLike(a: any) {
  if (!a || typeof a !== "object") return a;

  // already Strava-like
  if (typeof a.type === "string" && typeof a.start_date_local === "string" && typeof a.distance === "number") {
    return a;
  }

  // domain-like (your cached activities)
  if (
    (a.sport === "run" || a.sport === "ride") &&
    typeof a.startDate === "string" &&
    typeof a.distanceKm === "number"
  ) {
    return {
      id: a.id,
      type: a.sport === "run" ? "Run" : "Ride",
      start_date_local: a.startDate,
      distance: a.distanceKm * 1000,
      total_elevation_gain: Number(a.elevationM ?? 0),
      moving_time: Number(a.movingTimeSec ?? 0),
      name: a.name,
    };
  }

  return a;
}

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {} } };
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
  const today = new Date();

  const [sport, setSport] = useState<Sport>("run");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const year = new Date().getFullYear();
  const [goals, setGoals] = useState<YearGoals>(emptyGoals(year));

  // Auth check (MUST be before conditional return)
  const { token } = useAuth();

  const navigate = useNavigate();

  // Athlete data (profile image) (MUST be before conditional return)
  const { athlete } = useAthlete(!!token);

  // activities (MUST be before conditional return)
  const { activities, loading, error } = useActivities(year, !!token);

  // load goals whenever year changes OR drawer closes (after saving)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const loaded = await goalsRepo.loadGoals(year);
      if (!cancelled) setGoals(loaded ?? emptyGoals(year));
    })();

    return () => {
      cancelled = true;
    };
  }, [year, settingsOpen]);

  // optional: later expose in UI
  const mode: ForecastMode = "ytd";

  // Build dashboard data (MUST be before conditional return)
  const dashboard = useMemo(() => {
    if (!token || !activities || activities.length === 0) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    // normalize expects Strava-like; your activities are domain-like
    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);

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
    };
  }, [activities, goals, year, mode, token]);

  // If not authenticated, show login card (AFTER all hooks)
  if (!token) {
    return <LoginCard />;
  }

  const currentStats = dashboard
    ? (sport === "run" ? dashboard.run : dashboard.ride)
    : null;

  async function handleForceLogout() {
    await clearToken();
    window.location.href = "/";
  }

  return (
    <>
      <AppHeader
        title="still moving"
        dateLabel={formatHeaderDate(today)}
        dateTimeIso={today.toISOString().slice(0, 10)}
        avatarText="HH"
        avatarImage={athlete?.profile_medium}
        onAvatarClick={() => setSettingsOpen(true)}
      />

      <main className="container" role="main">
        <SportSwitcher value={sport} onChange={setSport} />

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
                <YearlyElevationGoalCard
                  sport={sport}
                  stats={currentStats}
                  forecast={currentStats.forecasts?.elevationM}
                />
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
              aria-label="Manage goals"
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Manage goals
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
    </>
  );
}
