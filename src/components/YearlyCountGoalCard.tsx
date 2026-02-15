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

function unitLabel(s: Sport) {
  return s === "run" ? "runs" : "rides";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeStatus(reachable: boolean | undefined) {
  if (reachable === true) return { label: "On Track", className: "status-badge status-badge--ontrack" };
  if (reachable === false) return { label: "Off Track", className: "status-badge status-badge--offtrack" };
  return { label: "No Goal", className: "status-badge" };
}

export default function YearlyCountGoalCard({ sport, stats, forecast }: Props) {
  const m = stats.progress.count;

  const goal = m.goal;
  const completed = m.ytd;

  const pct = typeof goal === "number" && goal > 0 ? clamp((completed / goal) * 100, 0, 999) : 0;
  const pctRounded = Math.round(pct);

  const remaining = m.toVictory ?? undefined;
  const status = computeStatus(m.reachable);

  return (
    <section className="card card--primary" aria-label="Yearly units goal summary">
      <header className="card__header card__header--with-forecast">
        <div className="card__header-top">
          <span className="card__kicker">Yearly Units Goal</span>

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
        </div>

        {forecast && (
          <div className="card__forecast-header">
            <div className="forecast-badge">{forecast.label}</div>
            <div className="forecast-header-metrics">
              <div className="forecast-metric-compact">
                <span className="forecast-label">EoY Forecast</span>
                <span className="forecast-value">{Math.round(forecast.forecastEOY)} {unitLabel(sport)}</span>
              </div>
              <div className="forecast-metric-compact">
                <span className="forecast-label">Trend</span>
                <span className="forecast-value">{forecast.trendPerWeek.toFixed(1)} {unitLabel(sport)}/week</span>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="card__body">
        <div className="goal-context">
          <span className="goal-context__sport">{sportLabel(sport)}</span>
          <span className="goal-context__goal">
            {typeof goal === "number" ? `Goal: ${goal} ${unitLabel(sport)}` : "Goal: —"}
          </span>
        </div>

        <div className="metric">
          <div className="metric__label">Units Completed</div>
          <div className="metric__value">
            {completed} {unitLabel(sport)}
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
            <div className="progress__fill" aria-hidden="true"></div>
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

        <p className="forecast">
          Based on current training rhythm goal reached:{" "}
          <strong>{m.reachedOnLocal ?? "—"}</strong>
        </p>
      </div>
    </section>
  );
}
