import { useEffect, useState } from "react";
import { useAuth } from "./hooks/useAuth";
import { useActivities } from "./hooks/useActivities";
import LoggedInActions from "./components/LoggedInActions";
import { startStravaLogin } from "./services/auth";
import DebugPanel from "./components/DebugPanel";

import type { YearDashboard } from "./services/statsService";
import { buildYearDashboardNow } from "./services/statsService";
import type { ForecastMode } from "./domain/metrics/uiStats";

export default function App() {
  const { token, status, setToken, setStatus } = useAuth();

  const year = new Date().getFullYear();

  const { activities, loading, refreshing, error, source } = useActivities(year, !!token);

  // Forecast mode (start with ytd like screenshot)
  const [mode, setMode] = useState<ForecastMode>("ytd");

  const [dashboard, setDashboard] = useState<YearDashboard | null>(null);
  const [dashError, setDashError] = useState<string | null>(null);

  // temporary: log activities for debugging
  // console.log("first activity", activities?.[0]);

  // Recompute dashboard when activities/year/mode changes
  useEffect(() => {
    let cancelled = false;

    async function run() {
      setDashError(null);

      // If no activities yet, reset
      if (!activities || activities.length === 0) {
        setDashboard(null);
        return;
      }

      try {
        const d = await buildYearDashboardNow({
          year,
          activities,
          mode,
          // optional: if you later use blend:
          // blendWeightRolling: 0.6,
        });
        if (!cancelled) setDashboard(d);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setDashError(errorMsg);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [year, activities, mode]);

  const run = dashboard?.run;
  const ride = dashboard?.ride;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1>Sports Tracking App</h1>

      <p>
        <strong>Status:</strong> {status}
      </p>

      {!token && (
        <button
          onClick={() => startStravaLogin()}
          style={{
            padding: "12px 20px",
            fontSize: "16px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: "#FC4C02",
            color: "white",
            cursor: "pointer",
          }}
        >
          Login with Strava
        </button>
      )}

      {token && (
        <>
          <LoggedInActions
            onLoggedOut={() => {
              setToken(null);
              setStatus("Logged out");
            }}
          />

          <hr style={{ margin: "24px 0" }} />

          <h2>{year} Statistics</h2>

          <p>
            Activities source: <b>{source}</b>
            {refreshing ? " (refreshing…)" : ""}
          </p>

          <div style={{ margin: "12px 0" }}>
            <label style={{ marginRight: 8 }}>
              Forecast mode:
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ForecastMode)}
                style={{ marginLeft: 8, padding: "6px 8px" }}
              >
                <option value="ytd">ytd</option>
                <option value="rolling28">rolling28</option>
                <option value="blend">blend</option>
              </select>
            </label>
          </div>

          {loading && <p>Loading activities...</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}
          {dashError && <p style={{ color: "red" }}>{dashError}</p>}

          {!loading && !error && dashboard && (
            <>
              <h3>Running</h3>
              <p>YTD distance (km): {run?.progress?.distanceKm?.ytd?.toFixed(1)}</p>
              <p>YTD runs: {run?.progress?.count?.ytd}</p>
              <p>Avg km/week: {run?.progress?.distanceKm?.avgPerWeek?.toFixed(1)}</p>
              <p>Forecast distance (km): {run?.progress?.distanceKm?.forecast?.toFixed(1)}</p>
              {typeof run?.progress?.distanceKm?.toVictory === "number" && (
                <>
                  <p>Goal (km): {run.progress.distanceKm.goal}</p>
                  <p>Km to victory: {run.progress.distanceKm.toVictory?.toFixed(1)}</p>
                  <p>Reachable: {String(run.progress.distanceKm.reachable)}</p>
                  {run.progress.distanceKm.reachedInWeeks != null && (
                    <p>
                      Target reached in {run.progress.distanceKm.reachedInWeeks} weeks ({run.progress.distanceKm.reachedOnLocal})
                    </p>
                  )}
                </>
              )}

              <h3 style={{ marginTop: 20 }}>Cycling</h3>
              <p>YTD distance (km): {ride?.progress?.distanceKm?.ytd?.toFixed(1)}</p>
              <p>YTD rides: {ride?.progress?.count?.ytd}</p>
              <p>Avg km/week: {ride?.progress?.distanceKm?.avgPerWeek?.toFixed(1)}</p>
              <p>Forecast distance (km): {ride?.progress?.distanceKm?.forecast?.toFixed(1)}</p>
              {typeof ride?.progress?.distanceKm?.toVictory === "number" && (
                <>
                  <p>Goal (km): {ride.progress.distanceKm.goal}</p>
                  <p>Km to victory: {ride.progress.distanceKm.toVictory?.toFixed(1)}</p>
                  <p>Reachable: {String(ride.progress.distanceKm.reachable)}</p>
                  {ride.progress.distanceKm.reachedInWeeks != null && (
                    <p>
                      Target reached in {ride.progress.distanceKm.reachedInWeeks} weeks ({ride.progress.distanceKm.reachedOnLocal})
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}

      {/* DEV-only */}
      <DebugPanel />
    </div>
  );
}
