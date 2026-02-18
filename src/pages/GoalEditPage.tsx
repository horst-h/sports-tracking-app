import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";
import * as goalsRepo from "../repositories/goalsRepository";

const VALID_SPORTS: Sport[] = ["run", "ride"];
const VALID_METRICS = ["distance", "count", "elevation"] as const;

const METRIC_MAP: Record<(typeof VALID_METRICS)[number], { key: GoalMetric; label: string; unit: string }> = {
  distance: { key: "distanceKm", label: "Distance", unit: "km" },
  count: { key: "count", label: "Units", unit: "units" },
  elevation: { key: "elevationM", label: "Elevation", unit: "m" },
};

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {} } };
}

function toNumberOrUndefined(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

export default function GoalEditPage() {
  const navigate = useNavigate();
  const { sport: sportParam, metric: metricParam } = useParams();

  const sport = sportParam as Sport | undefined;
  const metric = metricParam as (typeof VALID_METRICS)[number] | undefined;

  const isValidSport = sport && VALID_SPORTS.includes(sport);
  const isValidMetric = metric && VALID_METRICS.includes(metric);

  const year = new Date().getFullYear();
  const { goals, loading } = useGoals(year);

  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const metricConfig = useMemo(() => {
    return metric ? METRIC_MAP[metric] : null;
  }, [metric]);

  useEffect(() => {
    if (!isValidSport || !isValidMetric || !metricConfig) return;
    if (!goals) return;

    const current = (goals.perSport?.[sport] as any)?.[metricConfig.key];
    setValue(typeof current === "number" ? String(current) : "");
  }, [goals, isValidSport, isValidMetric, metricConfig, sport]);

  useEffect(() => {
    if (!saved) return;
    const t = window.setTimeout(() => setSaved(null), 1600);
    return () => window.clearTimeout(t);
  }, [saved]);

  if (!isValidSport || !isValidMetric || !metricConfig) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: "2rem" }}>
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>Invalid route</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              sport={sportParam}, metric={metricParam}
            </p>
            <button
              onClick={() => navigate("/goals")}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "var(--bg-secondary)",
                cursor: "pointer",
              }}
            >
              Back to goals
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sportKey: Sport = sport;
  const metricKey: GoalMetric = metricConfig.key;

  async function saveGoal(nextValue: number | undefined) {
    setSaving(true);
    setError(null);

    try {
      const base = goals ?? emptyGoals(year);
      const perSport = { ...base.perSport };
      const currentSport = { ...(perSport[sportKey] ?? {}) } as Record<GoalMetric, number>;

      if (typeof nextValue === "number") {
        currentSport[metricKey] = nextValue;
      } else {
        delete currentSport[metricKey];
      }

      perSport[sportKey] = currentSport;

      const payload: YearGoals = {
        ...base,
        year,
        perSport,
      };

      await goalsRepo.saveGoals(year, payload);
      setSaved("Saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function onSave() {
    const n = toNumberOrUndefined(value);
    if (value.trim() && n == null) {
      setError("Please enter a valid number.");
      return;
    }
    saveGoal(n);
  }

  function onDelete() {
    saveGoal(undefined);
    setValue("");
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate("/goals");
  }

  const sportLabel = sport === "run" ? "Running" : "Cycling";

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      <button
        onClick={handleBack}
        className="nav-back"
        aria-label="Go back"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <h1 className="goals-title">
        {sportLabel} - {metricConfig.label}
        <span className="goals-title__year">{year}</span>
      </h1>

      <div className="card card--primary">
        <div className="card__body">
          <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600 }}>
            Target
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <input
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="--"
              style={{
                flex: 1,
                padding: "0.75rem 0.9rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
              }}
              aria-label="Goal value"
            />
            <span style={{ minWidth: "48px", textAlign: "right", color: "var(--text-muted)" }}>
              {metricConfig.unit}
            </span>
          </div>

          <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "13px" }}>
            Feasibility hints and performance guidance will appear here.
          </p>

          {loading && <p style={{ marginTop: "0.75rem" }}>Loading...</p>}

          {error && (
            <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>{error}</p>
          )}

          {saved && (
            <p style={{ marginTop: "0.75rem", color: "var(--text-muted)" }}>{saved}</p>
          )}

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "none",
                background: "var(--primary, #111)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
              aria-label="Save goal"
            >
              Save
            </button>

            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid var(--border)",
                background: "transparent",
                cursor: "pointer",
              }}
              aria-label="Delete goal"
            >
              Delete goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
