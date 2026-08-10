import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";
import { useActivities } from "../hooks/useActivities";
import { useDataAccess } from "../hooks/useDataAccess";
import * as goalsRepo from "../repositories/goalsRepository";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats, type UiAthleteStats } from "../domain/metrics/uiStats";
import GoalField from "../components/GoalField";
import GoalsCentralAiCoach from "../components/GoalsCentralAiCoach";

const VALID_SPORTS: Sport[] = ["run", "ride", "swim"];

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

export default function GoalsPage() {
  const navigate = useNavigate();
  const { sport: sportParam } = useParams();

  const sport = sportParam as Sport | undefined;
  const isValidSport = sport && VALID_SPORTS.includes(sport);

  const year = new Date().getFullYear();
  const { ready } = useDataAccess();
  const { goals, loading: goalsLoading } = useGoals(year);
  const { activities, loading: activitiesLoading } = useActivities(year, ready);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const [goalOverridesBySport, setGoalOverridesBySport] = useState<
    Record<Sport, Partial<Record<GoalMetric, number | undefined>>>
  >({ run: {}, ride: {}, swim: {} });

  const currentGoals = useMemo<Partial<Record<GoalMetric, number>>>(() => {
    if (!isValidSport || !goals) return {};
    const baseGoals = goals.perSport?.[sport] ?? {};
    const overrides = goalOverridesBySport[sport];
    return { ...baseGoals, ...overrides };
  }, [goals, sport, isValidSport, goalOverridesBySport]);

  const statsBySport = useMemo((): Record<Sport, UiAthleteStats> | null => {
    if (!isValidSport || !activities || !ready) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const normalized = normalizeActivities(activities);

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
  }, [activities, goals, isValidSport, year, ready]);

  const sportKey: Sport = isValidSport ? sport : "run";
  const sportLabel = sportKey === "run" ? "Running" : sportKey === "ride" ? "Cycling" : "Swimming";
  const otherSport: Sport = sportKey === "run" ? "ride" : "run";
  const stats = statsBySport ? statsBySport[sportKey] : null;
  const otherStats = statsBySport ? statsBySport[otherSport] : null;

  async function saveGoalField(metric: GoalMetric, value: number | undefined) {
    const base = goals ?? emptyGoals(year);
    const perSport = { ...base.perSport };
    const currentSport = { ...(perSport[sportKey] ?? {}) } as Record<GoalMetric, number>;

    if (typeof value === "number") {
      currentSport[metric] = value;
    } else {
      delete currentSport[metric];
    }

    perSport[sportKey] = currentSport;

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
      const sportOverrides = { ...(next[sportKey] ?? {}) };
      if (typeof value === "number") {
        sportOverrides[metric] = value;
      } else {
        delete sportOverrides[metric];
      }
      next[sportKey] = sportOverrides;
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
    navigate(`/?sport=${sportKey}`);
  }

  const isLoading = goalsLoading || activitiesLoading;

  if (!isValidSport) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: "2rem" }}>
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>Invalid sport</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              Sport <strong>{sportParam}</strong> is not valid. Valid sports: run, ride, swim.
            </p>
            <button
              onClick={() => navigate("/")}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
              }}
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      <button
        onClick={handleBack}
        className="nav-back"
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <h1 className="goals-title">
        {sportLabel} Goals
        <span className="goals-title__year">{year}</span>
      </h1>

      {isLoading && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-muted)" }}>Loading...</p>
      )}

      {!isLoading && stats && (
        <GoalsCentralAiCoach
          sport={sportKey}
          year={year}
          stats={stats}
          otherStats={otherStats || undefined}
          currentGoals={currentGoals}
        />
      )}

      {!isLoading && (
        <div className="goals-grid">
          {GOAL_FIELDS.map((field) => {
            // Skip this field if it's excluded for the current sport
            if (field.excludeSports?.includes(sportKey)) {
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
