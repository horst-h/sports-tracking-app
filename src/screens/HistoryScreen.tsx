import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import LoginCard from "../components/LoginCard";
import { fetchYearActivitiesLive, useActivities } from "../hooks/useActivities";
import { useAuth } from "../hooks/useAuth";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import type { Sport } from "../domain/metrics/types";
import { loadYearActivities } from "../repositories/activitiesRepository";

const TAB_OPTIONS = ["Distance", "Activities", "Elevation"] as const;

type TabOption = typeof TAB_OPTIONS[number];

type SummaryTotals = {
  count: number;
  distanceKm: number;
  elevationM: number;
};

type SportSummary = {
  sport: Sport;
  totals: SummaryTotals;
};

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

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function YearChips({
  years,
  selectedYear,
  onSelect,
}: {
  years: number[];
  selectedYear: number | null;
  onSelect: (year: number) => void;
}) {
  return (
    <div className="year-chips" role="tablist" aria-label="Select year">
      {years.map((year) => {
        const isActive = year === selectedYear;
        return (
          <button
            key={year}
            type="button"
            className={`year-chip${isActive ? " year-chip--active" : ""}`}
            onClick={() => onSelect(year)}
            aria-pressed={isActive}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}

function SportSummaryCard({ summary }: { summary: SportSummary }) {
  const label = summary.sport === "run" ? "Running" : "Cycling";

  return (
    <div className="card card--primary">
      <div className="card__header">
        <div>
          <div className="card__kicker">{label}</div>
          <h3 className="history-card-title">Year totals</h3>
        </div>
      </div>
      <div className="card__body history-summary">
        <div className="history-summary__item">
          <div className="history-summary__label">Activities</div>
          <div className="history-summary__value">{formatNumber(summary.totals.count)}</div>
        </div>
        <div className="history-summary__item">
          <div className="history-summary__label">Distance</div>
          <div className="history-summary__value">
            {formatNumber(summary.totals.distanceKm, 1)} km
          </div>
        </div>
        <div className="history-summary__item">
          <div className="history-summary__label">Elevation</div>
          <div className="history-summary__value">
            {formatNumber(summary.totals.elevationM)} m
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryTabs({ value, onChange }: { value: TabOption; onChange: (next: TabOption) => void }) {
  return (
    <div className="history-tabs" role="tablist" aria-label="History categories">
      {TAB_OPTIONS.map((option) => {
        const isActive = option === value;
        return (
          <button
            key={option}
            type="button"
            className={`history-tab${isActive ? " history-tab--active" : ""}`}
            onClick={() => onChange(option)}
            role="tab"
            aria-selected={isActive}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function HistoryScreen() {
  const navigate = useNavigate();
  const { year: yearParam } = useParams();
  const { token } = useAuth();
  const currentYear = new Date().getFullYear();

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [yearsLoading, setYearsLoading] = useState(true);
  const [yearsError, setYearsError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabOption>("Distance");

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setYearsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      setYearsLoading(true);
      setYearsError(null);
      try {
        const found: number[] = [];
        let emptyStreak = 0;
        const maxLookback = 50;

        for (let year = currentYear; year >= currentYear - maxLookback; year -= 1) {
          if (cancelled) return;

          const cached = await loadYearActivities(year);
          const activitiesForYear = cached?.activities ?? await fetchYearActivitiesLive(year);

          if (activitiesForYear.length > 0) {
            found.push(year);
            emptyStreak = 0;
          } else {
            emptyStreak += 1;
          }

          setAvailableYears([...new Set(found)].sort((a, b) => b - a));

          if (emptyStreak >= 2) {
            break;
          }
        }
      } catch (e: any) {
        if (!cancelled) setYearsError(String(e?.message ?? e));
      } finally {
        if (!cancelled) setYearsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, currentYear]);

  const parsedYear = yearParam ? Number(yearParam) : null;

  useEffect(() => {
    const yearFromRoute = parsedYear && Number.isFinite(parsedYear) ? parsedYear : null;
    const hasCurrentYear = availableYears.includes(currentYear);

    if (yearFromRoute && yearFromRoute !== selectedYear) {
      setSelectedYear(yearFromRoute);
      return;
    }

    if (!selectedYear) {
      if (hasCurrentYear) {
        setSelectedYear(currentYear);
      } else if (availableYears.length > 0) {
        setSelectedYear(availableYears[0]);
      }
    }
  }, [availableYears, currentYear, parsedYear, selectedYear]);

  const displayYears = useMemo(() => {
    const set = new Set(availableYears);
    if (selectedYear) set.add(selectedYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [availableYears, selectedYear]);

  const selectedYearValue = selectedYear ?? currentYear;
  const enabled = !!token && !!selectedYear;
  const allowLive = selectedYear ? !availableYears.includes(selectedYear) : false;
  const { activities, loading, error, source } = useActivities(selectedYearValue, enabled, { allowLive });

  useEffect(() => {
    if (source !== "live") return;
    if (selectedYear && !availableYears.includes(selectedYear)) {
      setAvailableYears((prev) => [...new Set([...prev, selectedYear])].sort((a, b) => b - a));
    }
  }, [source, selectedYear, availableYears]);

  const summaries = useMemo(() => {
    if (!activities || activities.length === 0 || !selectedYear) return null;

    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);

    const runAgg = aggregateYear(normalized, selectedYear, "run");
    const rideAgg = aggregateYear(normalized, selectedYear, "ride");

    return [
      { sport: "run", totals: runAgg.totals },
      { sport: "ride", totals: rideAgg.totals },
    ] satisfies SportSummary[];
  }, [activities, selectedYear]);

  if (!token) {
    return <LoginCard />;
  }

  const showLoading = yearsLoading || loading;
  const showEmpty = !showLoading && !error && !yearsError && (!activities || activities.length === 0);

  return (
    <div className="history-page">
      <header className="history-header" role="banner">
        <div className="history-header__inner">
          <button
            type="button"
            className="nav-back"
            onClick={() => navigate("/")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={18} />
            Back
          </button>
          <div>
            <h1 className="history-title">Activity History</h1>
            <p className="history-subtitle">All past years overview</p>
          </div>
        </div>
      </header>

      <main className="container" role="main">
        {showLoading && (
          <div className="history-loading" aria-live="polite" aria-busy="true">
            <div className="ai-loading">
              <div className="ai-loading__dots" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="ai-loading__label">Query data from Strava(c)</div>
            </div>
          </div>
        )}
        {(error || yearsError) && (
          <div className="card card--primary">
            <div className="card__body">
              <p className="text-error">{error ?? yearsError}</p>
            </div>
          </div>
        )}

        {!showLoading && !error && !yearsError && displayYears.length > 0 && (
          <section className="d-grid gap-16">
            <YearChips
              years={displayYears}
              selectedYear={selectedYear}
              onSelect={(year) => {
                setSelectedYear(year);
                navigate(`/history/${year}`);
              }}
            />

            {summaries && (
              <div className="d-grid gap-16">
                {summaries.map((summary) => (
                  <SportSummaryCard key={summary.sport} summary={summary} />
                ))}
              </div>
            )}

            <div className="card card--primary">
              <div className="card__body history-tabs__body">
                <CategoryTabs value={activeTab} onChange={setActiveTab} />
                <div className="history-panel" role="tabpanel">
                  Chart coming soon for {activeTab}.
                </div>
              </div>
            </div>
          </section>
        )}

        {showEmpty && (
          <div className="card card--primary">
            <div className="card__body">
              <h3 className="history-empty-title">No history yet</h3>
              <p className="text-muted">
                We could not find any activities yet. Once your Strava data is available, the years will appear here.
              </p>
              <Link to="/" className="history-empty-link">Return to dashboard</Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
