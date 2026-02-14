import type { UiAthleteStats } from "../domain/metrics/uiStats";
import type { Sport } from "../domain/metrics/types";

type Props = {
  sport: Sport;
  stats: UiAthleteStats;
};

function sportLabel(s: Sport) {
  return s === "run" ? "Running" : "Cycling";
}

export default function SportSummaryCard({ sport, stats }: Props) {
  const dist = stats.progress.distanceKm;
  const cnt = stats.progress.count;
  const elev = stats.progress.elevationM;

  // Nice-to-have text pieces
  const weeksLeft = stats.weeksLeftDisplay;
  const avgKmWeek = dist.avgPerWeek;
  const avgRunsWeek = cnt.avgPerWeek;

  return (
    <section className="card card--hero" aria-label={`${sportLabel(sport)} summary`}>
      <header className="card__header">
        <div>
          <h2 className="card__title">{sportLabel(sport)}</h2>
          <p className="card__subtitle">
            {stats.retrievedAtLocal}
          </p>
        </div>

        {/* Goal pill (distance) */}
        {typeof dist.goal === "number" && (
          <div className="pill" aria-label="Distance goal">
            <span className="pill__label">Goal</span>
            <span className="pill__value">{dist.goal}</span>
            <span className="pill__unit">km</span>
          </div>
        )}
      </header>

      {/* Primary numbers */}
      <div className="hero-metrics">
        <div className="hero-metric">
          <div className="hero-metric__label">YTD distance</div>
          <div className="hero-metric__value">
            {dist.ytd} <span className="hero-metric__unit">km</span>
          </div>
        </div>

        <div className="hero-metric">
          <div className="hero-metric__label">Units</div>
          <div className="hero-metric__value">
            {cnt.ytd} <span className="hero-metric__unit">{sport === "run" ? "runs" : "rides"}</span>
          </div>
        </div>

        <div className="hero-metric">
          <div className="hero-metric__label">Elevation</div>
          <div className="hero-metric__value">
            {elev.ytd} <span className="hero-metric__unit">m</span>
          </div>
        </div>
      </div>

      {/* Secondary grid */}
      <div className="grid grid--3" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="stat__label">Weeks left</div>
          <div className="stat__value">{weeksLeft}</div>
        </div>

        <div className="stat">
          <div className="stat__label">Avg / week</div>
          <div className="stat__value">
            {avgKmWeek} <span className="stat__unit">km</span>
            <span className="stat__muted"> · {avgRunsWeek} / week</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat__label">Avg / unit</div>
          <div className="stat__value">
            {stats.avgDistPerRunKm} <span className="stat__unit">km</span>
          </div>
        </div>
      </div>

      {/* Goal reach / forecast */}
      <div className="grid grid--2" style={{ marginTop: 14 }}>
        <div className="stat">
          <div className="stat__label">Forecast (distance)</div>
          <div className="stat__value">
            {dist.forecast} <span className="stat__unit">km</span>
          </div>
          <div className="stat__hint">
            Forecast units: {cnt.forecast} · Elev: {elev.forecast} m
          </div>
        </div>

        <div className="stat">
          <div className="stat__label">Goal status</div>

          {typeof dist.goal === "number" ? (
            <>
              <div className="stat__value">
                {dist.toVictory} <span className="stat__unit">km to victory</span>
              </div>
              <div className="stat__hint">
                Reachable: <b>{String(dist.reachable)}</b>
                {dist.reachedInWeeks != null && dist.reachedOnLocal ? (
                  <>
                    {" "}
                    · in {dist.reachedInWeeks} weeks ({dist.reachedOnLocal})
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="stat__hint">No goal set yet.</div>
          )}
        </div>
      </div>
    </section>
  );
}
