import { useNavigate } from "react-router-dom";
import { BarChart3, Pencil } from "lucide-react";
import type { UiAthleteStats } from "../domain/metrics/uiStats";
import type { Sport } from "../domain/metrics/types";
import type { ForecastResult } from "../domain/metrics/forecast";
import GoalStatusHeader from "./GoalStatusHeader";
import {
  calculateGoalStatus,
  getStatusStyles,
  type GoalStatus,
} from "../domain/metrics/goalStatus";

type Props = {
  sport: Sport;
  stats: UiAthleteStats;
  forecast?: ForecastResult;
};

function unitLabel(s: Sport) {
  return s === "run" ? "runs" : "rides";
}

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

export default function YearlyCountGoalCard({ sport, stats, forecast }: Props) {
  const navigate = useNavigate();
  const m = stats.progress.count;

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
    <section className="card card--primary" aria-label="Yearly units goal summary">
      <header className="card__header card__header--with-forecast">
        <div className="card__header-top">
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span className="card__kicker">Yearly Units Goal</span>
            <div
              style={{
                marginTop: "0.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#4b5563",
              }}
            >
              {typeof goal === "number" ? `${goal} ${unitLabel(sport)}` : "—"}
            </div>
          </div>

          <GoalStatusHeader
            statusLabel={status.label}
            status={status.status}
            daysAhead={forecast?.daysAhead}
          >
            <div style={{ display: "flex", gap: "6px", flexWrap: "nowrap" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/analyze/${sport}/count`);
                }}
                aria-label="Analyze units goal"
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
                  navigate(`/goals/${sport}`);
                }}
                aria-label="Edit units goal"
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
          </GoalStatusHeader>
        </div>

        {forecast && (
          <div className="card__forecast-header">
            <div className="forecast-header-metrics">
              <div className="forecast-metric-compact">
                <span className="forecast-label">EoY Forecast</span>
            GoalStatusHeader <span className="forecast-value">{Math.round(forecast.forecastEOY)} {unitLabel(sport)}</span>
              </div>
              <div className="forecast-metric-compact">
                <span className="forecast-label">
                  {forecast.daysAhead < 0 ? "Required pace" : "Trend"}
                </span>
                <span className="forecast-value">
                  {(forecast.daysAhead < 0 ? forecast.requiredPerWeek : forecast.trendPerWeek).toFixed(1)} {unitLabel(sport)}/week
                </span>
              </div>
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
              onClick={() => navigate(`/goals/${sport}`)}
              aria-label="Set units goal"
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
          <div className="metric__label">Units Completed</div>
          <div className="metric__value">
            {completed} {unitLabel(sport)}
            {typeof goal === "number" && (
              <span style={{ marginLeft: "12px", fontSize: "0.4em", color: "var(--text-muted)" }}>
                /
                <span style={{ marginLeft: "10px" }}>{goal} {unitLabel(sport)}</span>
              </span>
            )}
          </div>
        </div>

        <div className="progress" style={{ ["--progress" as any]: `${pct}%` }}>
          <div
            className="progress__bar"
            role="progressbar"
            aria-label="Yearly units goal progress"
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
              {typeof remaining === "number" ? `Remaining: ${remaining} ${unitLabel(sport)}` : ""}
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
