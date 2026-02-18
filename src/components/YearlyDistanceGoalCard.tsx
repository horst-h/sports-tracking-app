import { useNavigate } from "react-router-dom";
import { BarChart3, Pencil } from "lucide-react";
import type { UiAthleteStats } from "../domain/metrics/uiStats";
import type { Sport } from "../domain/metrics/types";
import type { ForecastResult } from "../domain/metrics/forecast";

type Props = {
  sport: Sport;
  stats: UiAthleteStats;
  forecast?: ForecastResult;
};

function sportLabel(s: Sport) {
  return s === "run" ? "Running" : "Cycling";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeStatus(reachable: boolean | undefined, forecast?: ForecastResult) {
  if (reachable === true) {
    return { label: "On Track", className: "status-badge status-badge--ontrack" };
  }
  if (reachable === false) {
    const offTrackClasses = ["status-badge", "status-badge--offtrack"];
    if (forecast && forecast.badgeColor === "warning") {
      offTrackClasses.push("status-badge--warning");
    } else if (forecast && forecast.badgeColor === "danger") {
      offTrackClasses.push("status-badge--danger");
    }
    return { label: "Off Track", className: offTrackClasses.join(" ") };
  }
  return { label: "No Goal", className: "status-badge" };
}

export default function YearlyDistanceGoalCard({ sport, stats, forecast }: Props) {
  const navigate = useNavigate();
  const dist = stats.progress.distanceKm;

  const goal = dist.goal;
  const completed = dist.ytd;
  const hasGoal = typeof goal === "number";

  const pct = typeof goal === "number" && goal > 0 ? clamp((completed / goal) * 100, 0, 999) : 0;
  const pctRounded = Math.round(pct);

  const remaining = dist.toVictory ?? undefined;
  const status = computeStatus(dist.reachable, forecast);

  return (
    <section className="card card--primary" aria-label="Yearly distance goal summary">
      <header className="card__header card__header--with-forecast">
        <div className="card__header-top">
          <span className="card__kicker">Yearly Distance Goal</span>
          <div className={status.className} aria-label={`Status: ${status.label}`}>
            <svg className="status-badge__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9.2 16.2 5.7 12.7l1.4-1.4 2.1 2.1 7.7-7.7 1.4 1.4-9.1 9.1Z"
                fill="currentColor"
              />
            </svg>
            <span className="status-badge__dot" aria-hidden="true"></span>
            <span>{status.label}</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/analyze/${sport}/distance`);
              }}
              aria-label="Analyze distance goal"
              style={{
                padding: "6px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-secondary)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <BarChart3 size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/goals/${sport}/distance`);
              }}
              aria-label="Edit distance goal"
              style={{
                padding: "6px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                transition: "color 0.2s, background 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--bg-secondary)";
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <Pencil size={18} />
            </button>
          </div>
        </div>

        {forecast && (
          <div className="card__forecast-header">
            <div
              className={`forecast-badge${
                forecast.badgeColor === "warning"
                  ? " forecast-badge--warning"
                  : forecast.badgeColor === "danger"
                    ? " forecast-badge--danger"
                    : ""
              }`}
            >
              {forecast.label}
            </div>
            <div className="forecast-header-metrics">
              <div className="forecast-metric-compact">
                <span className="forecast-label">EoY Forecast</span>
                <span className="forecast-value">{forecast.forecastEOY.toFixed(1)} km</span>
              </div>
              <div className="forecast-metric-compact">
                <span className="forecast-label">
                  {forecast.daysAhead < 0 ? "Required pace" : "Trend"}
                </span>
                <span className="forecast-value">
                  {(forecast.daysAhead < 0 ? forecast.requiredPerWeek : forecast.trendPerWeek).toFixed(1)} km/week
                </span>
              </div>
              {forecast.perUnit && (
                <div className="forecast-metric-compact">
                  <span className="forecast-label">Avg per activity</span>
                  <span className="forecast-value">{forecast.perUnit.toFixed(1)} km</span>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="card__body">
        <div className="goal-context">
          <span className="goal-context__sport">{sportLabel(sport)}</span>
          <span className="goal-context__goal">
            {typeof goal === "number" ? `Goal: ${goal} km` : "Goal: —"}
          </span>
        </div>

        {!hasGoal && (
          <div style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
            <div>No goal set - set a goal to see forecast and on/off-track status.</div>
            <button
              type="button"
              onClick={() => navigate(`/goals/${sport}/distance`)}
              aria-label="Set distance goal"
              style={{
                marginTop: "0.5rem",
                border: "none",
                background: "transparent",
                color: "var(--text)",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Set goal
            </button>
          </div>
        )}

        <div className="metric">
          <div className="metric__label">Distance Completed</div>
          <div className="metric__value">{completed.toFixed(1)} km</div>
        </div>

        <div className="progress" style={{ ["--progress" as any]: `${pct}%` }}>
          <div
            className="progress__bar"
            role="progressbar"
            aria-label="Yearly goal progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={typeof goal === "number" ? pctRounded : 0}
          >
            <div className="progress__fill" aria-hidden="true"></div>
          </div>

          <div className="progress__meta">
            <span className="progress__left">
              {typeof goal === "number" ? `${pctRounded}% of yearly goal reached` : "No goal set"}
            </span>
            <span className="progress__right">
              {typeof remaining === "number" ? `Remaining: ${remaining.toFixed(0)} km` : ""}
            </span>
          </div>
        </div>

        {hasGoal && (
          <p className="forecast">
            Based on current training rhythm goal reached:{" "}
            <strong>{dist.reachedOnLocal ?? "—"}</strong>
          </p>
        )}
      </div>
    </section>
  );
}
