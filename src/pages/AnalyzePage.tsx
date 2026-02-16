import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useActivities } from "../hooks/useActivities";
import { useAthlete } from "../hooks/useAthlete";
import { useAuth } from "../hooks/useAuth";
import { buildUiAthleteStats } from "../domain/metrics/uiStats";
import { aggregateYear } from "../domain/metrics/aggregate";
import { normalizeActivities } from "../domain/metrics/normalize";
import { deriveMetricFacts } from "../domain/insights/deriveFacts";
import { buildNarrative } from "../domain/insights/narrative";
import type { Sport } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";

const VALID_SPORTS: Sport[] = ["run", "ride"];
const VALID_METRICS = ["distance", "count", "elevation"];

// Helper: Convert domain activity to Strava-like (same as App.tsx)
function toStravaLike(a: any) {
  if (!a || typeof a !== "object") return a;

  if (typeof a.type === "string" && typeof a.start_date_local === "string" && typeof a.distance === "number") {
    return a;
  }

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

export default function AnalyzePage() {
  const navigate = useNavigate();
  const { sport: sportParam, metric: metricParam } = useParams();

  // Validate route params
  const sport = sportParam as Sport | undefined;
  const metric = metricParam as "distance" | "count" | "elevation" | undefined;

  const isValidSport = sport && VALID_SPORTS.includes(sport);
  const isValidMetric = metric && VALID_METRICS.includes(metric);

  if (!isValidSport || !isValidMetric) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: "2rem" }}>
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>Invalid route</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>sport={sportParam}, metric={metricParam}</p>
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
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Load data
  const year = new Date().getFullYear();
  const { activities, loading: activitiesLoading } = useActivities(year, true);
  useAthlete(true); // Ensure athlete is loaded but not directly used
  const { token } = useAuth();
  const { goals } = useGoals(year);

  // Build UI stats with same logic as App.tsx
  const uiStats = useMemo(() => {
    if (!activities || activities.length === 0 || !goals) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);
    const agg = aggregateYear(normalized, year, sport, asOfLocalIso);
    const sportGoals = goals?.perSport?.[sport];

    const stats = buildUiAthleteStats({
      aggregate: agg,
      asOfDateLocal: asOfLocalIso,
      retrievedAtLocal,
      goals: sportGoals,
      mode: "ytd",
      blendWeightRolling: 0.6,
    });

    return stats;
  }, [activities, goals, year, sport]);

  // Derive facts
  const facts = useMemo(() => {
    if (!uiStats || !goals) return null;
    return deriveMetricFacts(sport, metric, uiStats, goals.perSport);
  }, [uiStats, goals, sport, metric]);

  // Build narrative
  const narrative = useMemo(() => {
    if (!facts) return null;
    return buildNarrative(sport, metric, facts);
  }, [facts, sport, metric]);

  if (activitiesLoading) {
    return (
      <div className="container-page">
        <p style={{ marginTop: "2rem", color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (!uiStats || !facts || !narrative) {
    return (
      <div className="container-page">
        <button
          onClick={() => navigate(-1)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: "14px",
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="card card--primary">
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>No data</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              {!token ? "Sign in with Strava first." : "Sync activities from Strava first."}
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
              Return to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: "14px",
        }}
        aria-label="Go back"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      {/* Title */}
      <h1 style={{ marginBottom: "1.5rem", fontSize: "28px", fontWeight: "700" }}>
        {narrative.title}
      </h1>

      {/* Narrative */}
      <div className="card card--primary" style={{ marginBottom: "2rem" }}>
        <div className="card__body">
          {narrative.paragraphs.map((p, i) => (
            <p
              key={i}
              style={{
                marginBottom: i < narrative.paragraphs.length - 1 ? "1rem" : 0,
                lineHeight: "1.6",
                color: "var(--text)",
              }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>

      {/* Facts */}
      <div className="card card--primary">
        <div className="card__body">
          <div style={{ display: "grid", gap: "1rem" }}>
            {narrative.bullets.map((bullet, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: i < narrative.bullets.length - 1 ? "1rem" : 0,
                  borderBottom: i < narrative.bullets.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontSize: "14px", fontWeight: "500" }}>
                  {bullet.label}
                </span>
                <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--text)" }}>
                  {bullet.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
