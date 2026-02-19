import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import SportSwitcher from "../components/SportSwitcher";
import { useGoals } from "../hooks/useGoals";
import type { Sport, GoalMetric } from "../domain/metrics/types";

const METRICS: Array<{ key: GoalMetric; route: "distance" | "count" | "elevation"; label: string; unit: string }> = [
  { key: "distanceKm", route: "distance", label: "Distance", unit: "km" },
  { key: "count", route: "count", label: "Units", unit: "units" },
  { key: "elevationM", route: "elevation", label: "Elevation", unit: "m" },
];

export default function GoalsOverviewPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const sportParam = searchParams.get("sport");
  const initialSport: Sport = sportParam === "ride" ? "ride" : "run";
  const [sport, setSport] = useState<Sport>(initialSport);
  const year = new Date().getFullYear();
  const { goals, loading } = useGoals(year);

  // Update URL when sport changes
  useEffect(() => {
    setSearchParams({ sport }, { replace: true });
  }, [sport, setSearchParams]);

  const currentGoals = goals?.perSport?.[sport] ?? {};

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      <button
        onClick={() => navigate("/")}
        className="nav-back"
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={18} />
        Back to dashboard
      </button>

      <h1 className="goals-title">
        Goals
        <span className="goals-title__year">{year}</span>
      </h1>

      <SportSwitcher value={sport} onChange={setSport} />

      {loading && <p style={{ marginTop: "1.5rem" }}>Loading goals...</p>}

      {!loading && (
        <div className="mt-16 d-grid gap-16">
          {METRICS.map((m) => {
            const value = (currentGoals as any)?.[m.key];
            const hasValue = typeof value === "number";

            return (
              <section key={m.key} className="card card--primary">
                <div className="card__body">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{m.label}</div>
                      <div style={{ color: "var(--text-muted)", marginTop: "0.25rem" }}>
                        {hasValue ? `${value} ${m.unit}` : "not set"}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate(`/goals/${sport}/${m.route}`)}
                      aria-label={`Edit ${m.label} goal`}
                      style={{
                        padding: "0.6rem 0.9rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border)",
                        background: "var(--bg-secondary)",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {hasValue ? "Edit" : "Set"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
