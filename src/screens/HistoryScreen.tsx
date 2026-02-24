import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import LoginCard from "../components/LoginCard";
import { fetchYearActivitiesLive, useActivities } from "../hooks/useActivities";
import { useAuth } from "../hooks/useAuth";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import type { Sport, StravaActivityLike } from "../domain/metrics/types";
import { buildMonthlySeries, buildMonthlyTotalSeries, type HistoryMetric } from "../domain/metrics/monthly";
import { loadYearActivities } from "../repositories/activitiesRepository";
import { formatNumber } from "../utils/format";
import HistoryMonthlyChart from "../components/history/HistoryMonthlyChart";
import HistoryMonthlyCompareChart, {
  type MonthlyCompareSeriesItem,
} from "../components/history/HistoryMonthlyCompareChart";

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

function toStravaLike(a: unknown): StravaActivityLike | null {
  if (!a || typeof a !== "object") return null;
  const record = a as Record<string, unknown>;

  if (
    typeof record.type === "string" &&
    typeof record.start_date_local === "string" &&
    typeof record.distance === "number"
  ) {
    return record as unknown as StravaActivityLike;
  }

  if (
    (record.sport === "run" || record.sport === "ride" || record.sport === "swim") &&
    typeof record.startDate === "string" &&
    typeof record.distanceKm === "number"
  ) {
    return {
      id: record.id as string | number,
      type: record.sport === "run" ? "Run" : record.sport === "ride" ? "Ride" : "Swim",
      start_date_local: record.startDate,
      distance: record.distanceKm * 1000,
      total_elevation_gain: Number(record.elevationM ?? 0),
      moving_time: Number(record.movingTimeSec ?? 0),
    } satisfies StravaActivityLike;
  }

  return null;
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
  const label = summary.sport === "run" ? "Running" : summary.sport === "ride" ? "Cycling" : "Swimming";

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
            {formatNumber(summary.totals.distanceKm, { maximumFractionDigits: 1 })} km
          </div>
        </div>
        {/* Elevation is not tracked for swimming */}
        {summary.sport !== "swim" && (
          <div className="history-summary__item">
            <div className="history-summary__label">Elevation</div>
            <div className="history-summary__value">
              {formatNumber(summary.totals.elevationM)} m
            </div>
          </div>
        )}
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

function metricLabel(metric: HistoryMetric): string {
  if (metric === "distance") return "Distance";
  if (metric === "elevation") return "Elevation";
  return "Activities";
}

function unitLabel(metric: HistoryMetric): string {
  if (metric === "distance") return "km";
  if (metric === "elevation") return "m";
  return "activities";
}

function defaultCompareYear(primaryYear: number, years: number[]): number | null {
  const candidates = years.filter((year) => year !== primaryYear);
  if (candidates.length === 0) return null;

  const previousYear = primaryYear - 1;
  if (candidates.includes(previousYear)) return previousYear;

  return candidates.reduce((closest, year) => {
    const closestDistance = Math.abs(closest - primaryYear);
    const currentDistance = Math.abs(year - primaryYear);

    if (currentDistance < closestDistance) return year;
    if (currentDistance === closestDistance && year < closest) return year;
    return closest;
  }, candidates[0]);
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
  const [chartMode, setChartMode] = useState<"single" | "compare">("single");
  const [compareYear, setCompareYear] = useState<number | null>(null);

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
      } catch (e: unknown) {
        if (!cancelled) setYearsError(String(e instanceof Error ? e.message : e));
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
  const compareYearOptions = useMemo(
    () => displayYears.filter((year) => year !== selectedYearValue),
    [displayYears, selectedYearValue]
  );
  const compareDisabled = compareYearOptions.length === 0;
  const enabled = !!token && !!selectedYear;
  const allowLive = selectedYear ? !availableYears.includes(selectedYear) : false;
  const { activities, loading, error, source } = useActivities(selectedYearValue, enabled, { allowLive });

  const compareEnabled = !!token && chartMode === "compare" && !!compareYear;
  const compareAllowLive = compareYear ? !availableYears.includes(compareYear) : false;
  const {
    activities: compareActivities,
    loading: compareLoading,
    error: compareError,
    source: compareSource,
  } = useActivities(compareYear ?? selectedYearValue, compareEnabled, { allowLive: compareAllowLive });

  useEffect(() => {
    if (source !== "live") return;
    if (selectedYear && !availableYears.includes(selectedYear)) {
      setAvailableYears((prev) => [...new Set([...prev, selectedYear])].sort((a, b) => b - a));
    }
  }, [source, selectedYear, availableYears]);

  useEffect(() => {
    if (compareSource !== "live") return;
    if (compareYear && !availableYears.includes(compareYear)) {
      setAvailableYears((prev) => [...new Set([...prev, compareYear])].sort((a, b) => b - a));
    }
  }, [compareSource, compareYear, availableYears]);

  useEffect(() => {
    if (compareDisabled) {
      if (chartMode === "compare") setChartMode("single");
      if (compareYear !== null) setCompareYear(null);
      return;
    }

    if (chartMode !== "compare") return;

    if (!compareYear || compareYear === selectedYearValue || !compareYearOptions.includes(compareYear)) {
      const nextDefault = defaultCompareYear(selectedYearValue, displayYears);
      setCompareYear(nextDefault);
    }
  }, [
    chartMode,
    compareDisabled,
    compareYear,
    compareYearOptions,
    displayYears,
    selectedYearValue,
  ]);

  const normalizedActivities = useMemo(() => {
    if (!activities || activities.length === 0 || !selectedYear) return null;
    const stravaLike = activities.map(toStravaLike).filter((item): item is StravaActivityLike => !!item);
    return normalizeActivities(stravaLike);
  }, [activities, selectedYear]);

  const normalizedCompareActivities = useMemo(() => {
    if (!compareActivities || compareActivities.length === 0 || !compareYear) return null;
    const stravaLike = compareActivities.map(toStravaLike).filter((item): item is StravaActivityLike => !!item);
    return normalizeActivities(stravaLike);
  }, [compareActivities, compareYear]);

  const summaries = useMemo(() => {
    if (!normalizedActivities || !selectedYear) return null;

    const runAgg = aggregateYear(normalizedActivities, selectedYear, "run");
    const rideAgg = aggregateYear(normalizedActivities, selectedYear, "ride");

    return [
      { sport: "run", totals: runAgg.totals },
      { sport: "ride", totals: rideAgg.totals },
    ] satisfies SportSummary[];
  }, [normalizedActivities, selectedYear]);

  const selectedMetric: HistoryMetric = useMemo(() => {
    if (activeTab === "Distance") return "distance";
    if (activeTab === "Elevation") return "elevation";
    return "count";
  }, [activeTab]);

  const monthlySeries = useMemo(() => {
    return buildMonthlySeries({
      activities: normalizedActivities ?? [],
      metric: selectedMetric,
      year: selectedYear ?? currentYear,
    });
  }, [normalizedActivities, selectedMetric, selectedYear, currentYear]);

  const primaryTotalSeries = useMemo(() => {
    return buildMonthlyTotalSeries({
      activities: normalizedActivities ?? [],
      metric: selectedMetric,
      year: selectedYear ?? currentYear,
    });
  }, [normalizedActivities, selectedMetric, selectedYear, currentYear]);

  const secondaryTotalSeries = useMemo(() => {
    return buildMonthlyTotalSeries({
      activities: normalizedCompareActivities ?? [],
      metric: selectedMetric,
      year: compareYear ?? currentYear,
    });
  }, [normalizedCompareActivities, selectedMetric, compareYear, currentYear]);

  const compareSeries: MonthlyCompareSeriesItem[] = useMemo(() => {
    return primaryTotalSeries.map((item, index) => {
      const secondaryValue = secondaryTotalSeries[index]?.value ?? 0;
      return {
        month: item.month,
        primary: item.value,
        secondary: secondaryValue,
        delta: secondaryValue - item.value,
      };
    });
  }, [primaryTotalSeries, secondaryTotalSeries]);

  if (!token) {
    return <LoginCard />;
  }

  const showLoading = yearsLoading || loading || (chartMode === "compare" && compareLoading);
  const activeError = yearsError ?? error ?? (chartMode === "compare" ? compareError : null);
  const showEmpty = !showLoading && !activeError && (!activities || activities.length === 0);

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
        {activeError && (
          <div className="card card--primary">
            <div className="card__body">
              <p className="text-error">{activeError}</p>
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
                  <div className="history-chart">
                    <div className="history-chart__header">
                      <div>
                        <div className="history-chart__title">{metricLabel(selectedMetric)}</div>
                        <div className="history-chart__unit">{unitLabel(selectedMetric)}</div>
                      </div>
                      <div className="history-chart__controls">
                        <div className="history-chart__toggle" role="group" aria-label="Chart mode">
                          <button
                            type="button"
                            className={`history-chart__toggle-button${
                              chartMode === "single" ? " history-chart__toggle-button--active" : ""
                            }`}
                            onClick={() => setChartMode("single")}
                            aria-pressed={chartMode === "single"}
                          >
                            Single
                          </button>
                          <button
                            type="button"
                            className={`history-chart__toggle-button${
                              chartMode === "compare" ? " history-chart__toggle-button--active" : ""
                            }`}
                            onClick={() => setChartMode("compare")}
                            aria-pressed={chartMode === "compare"}
                            disabled={compareDisabled}
                          >
                            Compare
                          </button>
                        </div>
                        <div className="history-chart__years">
                          {chartMode === "compare" && compareYear
                            ? `${selectedYearValue} vs ${compareYear}`
                            : selectedYearValue}
                        </div>
                      </div>
                    </div>

                    {compareDisabled && (
                      <div className="history-chart__hint">Not enough years to compare.</div>
                    )}

                    {chartMode === "compare" && compareYear && (
                      <div className="history-chart__compare-row">
                        <div className="history-chart__compare-label">Compare to</div>
                        <div className="history-compare-chips" role="list">
                          {compareYearOptions.map((year) => {
                            const isActive = year === compareYear;
                            return (
                              <button
                                key={year}
                                type="button"
                                className={`history-compare-chip${
                                  isActive ? " history-compare-chip--active" : ""
                                }`}
                                onClick={() => setCompareYear(year)}
                                aria-pressed={isActive}
                              >
                                {year}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="history-chart__body">
                      {chartMode === "compare" && compareYear ? (
                        <HistoryMonthlyCompareChart
                          metric={selectedMetric}
                          data={compareSeries}
                          primaryYear={selectedYearValue}
                          secondaryYear={compareYear}
                        />
                      ) : (
                        <HistoryMonthlyChart metric={selectedMetric} data={monthlySeries} />
                      )}
                    </div>
                  </div>
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
