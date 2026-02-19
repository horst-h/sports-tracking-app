import { useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";
import * as goalsRepo from "../repositories/goalsRepository";
import GoalField from "../components/GoalField";

const VALID_SPORTS: Sport[] = ["run", "ride"];

const GOAL_FIELDS: Array<{
  key: GoalMetric;
  label: string;
  unit: string;
  helpText?: string;
  allowDecimal: boolean;
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
  },
];

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {} } };
}

export default function GoalsPage() {
  const navigate = useNavigate();
  const { sport: sportParam } = useParams();

  const sport = sportParam as Sport | undefined;
  const isValidSport = sport && VALID_SPORTS.includes(sport);

  const year = new Date().getFullYear();
  const { goals, loading } = useGoals(year);
  const pendingSaveRef = useRef<Promise<void> | null>(null);

  const currentGoals = useMemo(() => {
    if (!isValidSport || !goals) return {};
    return goals.perSport?.[sport] ?? {};
  }, [goals, sport, isValidSport]);

  if (!isValidSport) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: "2rem" }}>
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>Invalid sport</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              Sport <strong>{sportParam}</strong> is not valid. Valid sports: run, ride.
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

  const sportKey: Sport = sport;
  const sportLabel = sport === "run" ? "Running" : "Cycling";

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

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      <button
        onClick={handleBack}
        className="nav-back"
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={18} />
        Back to dashboard
      </button>

      <h1 className="goals-title">
        {sportLabel} Goals
        <span className="goals-title__year">{year}</span>
      </h1>

      {loading && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-muted)" }}>Loading goals...</p>
      )}

      {!loading && (
        <div className="goals-grid">
          {GOAL_FIELDS.map((field) => {
            const currentValue = (currentGoals as any)?.[field.key] as number | undefined;

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
