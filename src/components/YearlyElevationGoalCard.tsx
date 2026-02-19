import { useNavigate } from "react-router-dom";
import { BarChart3, Pencil } from "lucide-react";
import type { UiAthleteStats } from "../domain/metrics/uiStats";
import type { Sport } from "../domain/metrics/types";
import type { ForecastResult } from "../domain/metrics/forecast";
import {
  calculateGoalStatus,
  getForecastBadgeStyles,
  getStatusStyles,
  type GoalStatus,
} from "../domain/metrics/goalStatus";

type Props = {
  sport: Sport;
  stats: UiAthleteStats;
  forecast?: ForecastResult;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeStatus(hasGoal: boolean, forecast?: ForecastResult) {
  if (!hasGoal || !forecast) {
    return { label: "No Goal", status: undefined as GoalStatus | undefined };
  }

  const status = calculateGoalStatus(forecast.trendPerWeek, forecast.requiredPerWeek);
  if (status === "on-track") {
    return { label: "On Track", status };
  }
  if (status === "catch-up") {
    return { label: "Catch-Up Zone", status };
  }
  return { label: "Off Track", status };
}

export default function YearlyElevationGoalCard({ sport, stats, forecast }: Props) {
  const navigate = useNavigate();
  const m = stats.progress.elevationM;

  const goal = m.goal;
  const completed = m.ytd;
  const hasGoal = typeof goal === "number";

  const pct = typeof goal === "number" && goal > 0 ? clamp((completed / goal) * 100, 0, 999) : 0;
  const pctRounded = Math.round(pct);

  const remaining = m.toVictory ?? undefined;
  const status = computeStatus(hasGoal, forecast);
  const statusStyles = status.status
    ? getStatusStyles(status.status)
    : { pillClass: "bg-slate-100 text-slate-500 border-slate-200", barClass: "bg-slate-400" };

  return (
    <section className="card card--primary" aria-label="Yearly elevation goal summary">
      <header className="card__header card__header--with-forecast">
        <div className="card__header-top">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="card__kicker">Yearly Elevation Goal</span>
            <div
              style={{
                marginTop: "0.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#4b5563",
              }}
            >
              {typeof goal === "number" ? `${goal} m` : "—"}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              flexWrap: "nowrap",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            <div className={`status-badge ${statusStyles.pillClass}`} aria-label={`Status: ${status.label}`}>
              <span className="status-badge__dot" aria-hidden="true"></span>
              <span>{status.label}</span>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "nowrap" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/analyze/${sport}/elevation`);
                }}
                aria-label="Analyze elevation goal"
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
                  navigate(`/goals/${sport}/elevation`);
                }}
                aria-label="Edit elevation goal"
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
        </div>

        {forecast && (
          <div className="card__forecast-header">
            <div className="forecast-header-metrics">
              <div className="forecast-metric-compact">
                <span className="forecast-label">EoY Forecast</span>
                <span className="forecast-value">{Math.round(forecast.forecastEOY)} m</span>
              </div>
              <div className="forecast-metric-compact">
                <span className="forecast-label">
                  {forecast.daysAhead < 0 ? "Required pace" : "Trend"}
                </span>
                <span className="forecast-value">
                  {(forecast.daysAhead < 0 ? forecast.requiredPerWeek : forecast.trendPerWeek).toFixed(0)} m/week
                </span>
              </div>
              {forecast.perUnit && (
                <div className="forecast-metric-compact">
                  <span className="forecast-label">Avg per activity</span>
                  <span className="forecast-value">{forecast.perUnit.toFixed(0)} m</span>
                </div>
              )}
            </div>
            <div className={`forecast-badge ${getForecastBadgeStyles(forecast.badgeColor)}`}>
              {forecast.label}
            </div>
          </div>
        )}
      </header>

      <div className="card__body">
        {!hasGoal && (
          <div style={{ marginBottom: "1rem", color: "var(--text-muted)" }}>
            <div>No goal set - set a goal to see forecast and on/off-track status.</div>
            <button
              type="button"
              onClick={() => navigate(`/goals/${sport}/elevation`)}
              aria-label="Set elevation goal"
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
          <div className="metric__label">Elevation Completed</div>
          <div className="metric__value">
            {completed} m
            {typeof goal === "number" && (
              <span style={{ marginLeft: "12px", fontSize: "0.4em", color: "var(--text-muted)" }}>
                /
                <span style={{ marginLeft: "10px" }}>{goal} m</span>
              </span>
            )}
          </div>
        </div>

        <div className="progress" style={{ ["--progress" as any]: `${pct}%` }}>
          <div
            className="progress__bar"
            role="progressbar"
            aria-label="Yearly elevation goal progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={typeof goal === "number" ? pctRounded : 0}
          >
            <div className={`progress__fill ${statusStyles.barClass}`} aria-hidden="true"></div>
          </div>

          <div className="progress__meta">
            <span className="progress__left">
              {typeof goal === "number" ? `${pctRounded}% of yearly goal reached` : "No goal set"}
            </span>
            <span className="progress__right">
              {typeof remaining === "number" ? `Remaining: ${remaining.toFixed(0)} m` : ""}
            </span>
          </div>
        </div>

        {hasGoal && (
          <p className="forecast">
            Based on current training rhythm goal reached:{" "}
            <strong>{m.reachedOnLocal ?? "—"}</strong>
          </p>
        )}
      </div>
    </section>
  );
}
