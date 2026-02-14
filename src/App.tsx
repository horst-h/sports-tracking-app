import { useEffect, useMemo, useState } from "react";

import AppHeader from "./components/AppHeader";
import SportSwitcher from "./components/SportSwitcher";
import YearlyDistanceGoalCard from "./components/YearlyDistanceGoalCard";
import YearlyCountGoalCard from "./components/YearlyCountGoalCard";
import YearlyElevationGoalCard from "./components/YearlyElevationGoalCard";
import BottomDrawer from "./components/BottomDrawer";
import GoalsSettingsForm from "./components/GoalsSettingsForm";

import type { Sport, YearGoals } from "./domain/metrics/types";
import type { UiAthleteStats, ForecastMode } from "./domain/metrics/uiStats";
import { normalizeActivities } from "./domain/metrics/normalize";
import { aggregateYear } from "./domain/metrics/aggregate";
import { buildUiAthleteStats } from "./domain/metrics/uiStats";

import { useActivities } from "./hooks/useActivities";
import * as goalsRepo from "./repositories/goalsRepository";

function formatHeaderDate(d: Date) {
  return d.toDateString();
}

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

export default function App() {
  const today = new Date();

  const [sport, setSport] = useState<Sport>("run");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [goals, setGoals] = useState<YearGoals>(emptyGoals(year));

  // optional: later expose in UI
  const mode: ForecastMode = "ytd";

  // activities (requires auth in your hook)
  const { activities, loading, error } = useActivities(year, true);

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

  const dashboard = useMemo(() => {
    if (!activities || activities.length === 0) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    // normalize expects Strava-like; your activities are domain-like
    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);

    function buildForSport(s: Sport): UiAthleteStats {
      const agg = aggregateYear(normalized, year, s, asOfLocalIso);

      const sportGoals = goals?.perSport?.[s];

      return buildUiAthleteStats({
        aggregate: agg,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
        goals: sportGoals,
        mode,
        blendWeightRolling: 0.6,
      });
    }

    return {
      run: buildForSport("run"),
      ride: buildForSport("ride"),
    };
  }, [activities, goals, year, mode]);

  const currentStats = dashboard ? (sport === "run" ? dashboard.run : dashboard.ride) : null;

  return (
    <>
      <AppHeader
        title="Sports-Tracking-App"
        dateLabel={formatHeaderDate(today)}
        dateTimeIso={today.toISOString().slice(0, 10)}
        avatarText="HH"
        onAvatarClick={() => setSettingsOpen(true)}
      />

      <main className="container" role="main">
        <SportSwitcher value={sport} onChange={setSport} showHiking={true} />

        {loading && <p style={{ marginTop: 16 }}>Loading activities…</p>}
        {error && (
          <p style={{ marginTop: 16, color: "crimson" }}>
            {error}
          </p>
        )}

        {!loading && !error && (
          <section style={{ marginTop: 16, display: "grid", gap: 16 }}>
            {currentStats ? (
              <>
                <YearlyDistanceGoalCard sport={sport} stats={currentStats} />
                <YearlyCountGoalCard sport={sport} stats={currentStats} />
                <YearlyElevationGoalCard sport={sport} stats={currentStats} />
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
          <GoalsSettingsForm year={year} onYearChange={setYear} />
        </BottomDrawer>
      </main>
    </>
  );
}
