import { useMemo } from "react";
import { useAuth } from "./hooks/useAuth";
import { useActivities } from "./hooks/useActivities";
import { calcYearSportStats } from "./domain/statsCalculator";
import LoggedInActions from "./components/LoggedInActions";
import { startStravaLogin } from "./services/auth";

export default function App() {
  const { token, status, setToken, setStatus } = useAuth();

  const year = new Date().getFullYear();

  const {
    activities,
    loading,
    refreshing,
    error,
    source,
  } = useActivities(year, !!token);

  // Stats nur berechnen wenn Activities vorhanden sind
  const runStats = useMemo(() => {
    return calcYearSportStats(year, "run", activities);
  }, [year, activities]);

  const rideStats = useMemo(() => {
    return calcYearSportStats(year, "ride", activities);
  }, [year, activities]);

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

          {loading && <p>Loading activities...</p>}
          {error && <p style={{ color: "red" }}>{error}</p>}

          {!loading && !error && (
            <>
              <h3>Running</h3>
              <p>Count: {runStats.count}</p>
              <p>Distance (km): {runStats.distanceKm}</p>
              <p>Elevation (m): {runStats.elevationM}</p>

              <h3 style={{ marginTop: 20 }}>Cycling</h3>
              <p>Count: {rideStats.count}</p>
              <p>Distance (km): {rideStats.distanceKm}</p>
              <p>Elevation (m): {rideStats.elevationM}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
