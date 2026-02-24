import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GoalMetric, Sport, StravaActivityLike, YearGoals } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";
import { useActivities } from "../hooks/useActivities";
import { useAuth } from "../hooks/useAuth";
import * as goalsRepo from "../repositories/goalsRepository";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats, type UiAthleteStats } from "../domain/metrics/uiStats";
import GoalField from "../components/GoalField";
import GoalsCentralAiCoach from "../components/GoalsCentralAiCoach";
import RunningIcon from "../components/icons/RunningIcon";
import CyclingIcon from "../components/icons/CyclingIcon";
import SwimmingIcon from "../components/icons/SwimmingIcon";

const GOAL_FIELDS: Array<{
  key: GoalMetric;
  label: string;
  unit: string;
  helpText?: string;
  allowDecimal: boolean;
  excludeSports?: Sport[]; // Sports for which this metric is not applicable
}> = [
  {
    key: "distanceKm",
    label: "Distance",
    unit: "km",
    helpText: "Total kilometers you want to cover this year",
    allowDecimal: true,
  },
  {
    key: "count",
    label: "Activities",
    unit: "activities",
    helpText: "Number of workouts you want to complete",
    allowDecimal: false,
  },
  {
    key: "elevationM",
    label: "Elevation",
    unit: "m",
    helpText: "Total meters of elevation gain for the year",
    allowDecimal: true,
    excludeSports: ["swim"], // Elevation is not tracked for swimming
  },
];

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {}, swim: {} } };
}

function toStravaLike(a: unknown): StravaActivityLike | null {
  if (!a || typeof a !== "object") return null;
  const record = a as Record<string, unknown>;

  if (
    typeof record.type === "string" &&
    typeof record.start_date_local === "string" &&
    typeof record.distance === "number"
  ) {
    return record as unknown as StravaActivityLike;
  }

  if (
    (record.sport === "run" || record.sport === "ride" || record.sport === "swim") &&
    typeof record.startDate === "string" &&
    typeof record.distanceKm === "number"
  ) {
    return {
      id: record.id as string | number,
      type: record.sport === "run" ? "Run" : record.sport === "ride" ? "Ride" : "Swim",
      start_date_local: record.startDate,
      distance: record.distanceKm * 1000,
      total_elevation_gain: Number(record.elevationM ?? 0),
      moving_time: Number(record.movingTimeSec ?? 0),
    } satisfies StravaActivityLike;
  }

  return null;
}

export default function GoalsScreen() {
  const navigate = useNavigate();
  const year = new Date().getFullYear();
  const { token } = useAuth();
  
  const [selectedSport, setSelectedSport] = useState<Sport>("run");
  
  const { goals, loading: goalsLoading } = useGoals(year);
  const { activities, loading: activitiesLoading } = useActivities(year, !!token);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const [goalOverridesBySport, setGoalOverridesBySport] = useState<
    Record<Sport, Partial<Record<GoalMetric, number | undefined>>>
  >({ run: {}, ride: {}, swim: {} });

  const currentGoals = useMemo<Partial<Record<GoalMetric, number>>>(() => {
    if (!goals) return {};
    const baseGoals = goals.perSport?.[selectedSport] ?? {};
    const overrides = goalOverridesBySport[selectedSport];
    return { ...baseGoals, ...overrides };
  }, [goals, selectedSport, goalOverridesBySport]);

  const statsBySport = useMemo((): Record<Sport, UiAthleteStats> | null => {
    if (!activities || !token) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const stravaLike = activities.map(toStravaLike).filter((item): item is StravaActivityLike => !!item);
    const normalized = normalizeActivities(stravaLike);

    function buildForSport(s: Sport) {
      const agg = aggregateYear(normalized, year, s, asOfLocalIso);
      const sportGoals = goals?.perSport?.[s];
      return buildUiAthleteStats({
        aggregate: agg,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
        goals: sportGoals,
        mode: "ytd",
        blendWeightRolling: 0.6,
      });
    }

    return {
      run: buildForSport("run"),
      ride: buildForSport("ride"),
      swim: buildForSport("swim"),
    };
  }, [activities, goals, year, token]);

  const otherSport: Sport = selectedSport === "run" ? "ride" : "run";
  const stats = statsBySport ? statsBySport[selectedSport] : null;
  const otherStats = statsBySport ? statsBySport[otherSport] : null;

  async function saveGoalField(metric: GoalMetric, value: number | undefined) {
    const base = goals ?? emptyGoals(year);
    const perSport = { ...base.perSport };
    const currentSport = { ...(perSport[selectedSport] ?? {}) } as Record<GoalMetric, number>;

    if (typeof value === "number") {
      currentSport[metric] = value;
    } else {
      delete currentSport[metric];
    }

    perSport[selectedSport] = currentSport;

    const payload: YearGoals = {
      ...base,
      year,
      perSport,
    };

    const savePromise = goalsRepo.saveGoals(year, payload);
    const tracked = savePromise.then(() => {});
    pendingSaveRef.current = tracked;
    await savePromise;
    if (pendingSaveRef.current === tracked) {
      pendingSaveRef.current = null;
    }

    setGoalOverridesBySport((prev) => {
      const next = { ...prev };
      const sportOverrides = { ...(next[selectedSport] ?? {}) };
      if (typeof value === "number") {
        sportOverrides[metric] = value;
      } else {
        delete sportOverrides[metric];
      }
      next[selectedSport] = sportOverrides;
      return next;
    });
  }

  async function handleBack() {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof (active as { blur?: () => void }).blur === "function") {
      (active as { blur: () => void }).blur();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }
    navigate("/");
  }

  const isLoading = goalsLoading || activitiesLoading;

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          backgroundColor: "var(--bg)",
          paddingBottom: "var(--space-3)",
          marginBottom: "var(--space-4)",
        }}
      >
        <button
          onClick={handleBack}
          className="nav-back"
          aria-label="Back to dashboard"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <h1 className="goals-title">
          Goals
          <span className="goals-title__year">{year}</span>
        </h1>
        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
          Set and manage your yearly targets
        </p>

        {/* Sport tabs */}
        <div className="history-tabs" style={{ marginTop: "var(--space-4)" }}>
          <button
            type="button"
            className={`history-tab${selectedSport === "run" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("run")}
            aria-pressed={selectedSport === "run"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <RunningIcon />
            </span>
            <span>Running</span>
          </button>
          <button
            type="button"
            className={`history-tab${selectedSport === "ride" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("ride")}
            aria-pressed={selectedSport === "ride"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <CyclingIcon />
            </span>
            <span>Cycling</span>
          </button>
          <button
            type="button"
            className={`history-tab${selectedSport === "swim" ? " history-tab--active" : ""}`}
            onClick={() => setSelectedSport("swim")}
            aria-pressed={selectedSport === "swim"}
            style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "15px", padding: "8px 18px" }}
          >
            <span style={{ width: "18px", height: "18px", display: "flex" }}>
              <SwimmingIcon />
            </span>
            <span>Swimming</span>
          </button>
        </div>
      </div>

      {/* Central AI Coach */}
      {!isLoading && stats && (
        <GoalsCentralAiCoach
          sport={selectedSport}
          year={year}
          stats={stats}
          otherStats={otherStats || undefined}
          currentGoals={currentGoals}
        />
      )}

      {isLoading && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-muted)" }}>Loading...</p>
      )}

      {!isLoading && (
        <div className="goals-grid">
          {GOAL_FIELDS.map((field) => {
            // Skip this field if it's excluded for the current sport
            if (field.excludeSports?.includes(selectedSport)) {
              return null;
            }

            const currentValue = currentGoals[field.key];

            return (
              <section key={field.key} className="card card--primary">
                <header className="card__header card__header--solo">
                  <div>
                    <div className="card__kicker">{field.label} Goal</div>
                  </div>
                </header>
                <div className="card__body">
                  <GoalField
                    label={field.label}
                    value={currentValue}
                    unit={field.unit}
                    helpText={field.helpText}
                    allowDecimal={field.allowDecimal}
                    onSave={(value) => saveGoalField(field.key, value)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
