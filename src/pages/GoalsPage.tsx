import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import type { GoalMetric, Sport, YearGoals } from "../domain/metrics/types";
import { useGoals } from "../hooks/useGoals";
import { useActivities } from "../hooks/useActivities";
import { useAuth } from "../hooks/useAuth";
import * as goalsRepo from "../repositories/goalsRepository";
import { normalizeActivities } from "../domain/metrics/normalize";
import { aggregateYear } from "../domain/metrics/aggregate";
import { buildUiAthleteStats, type UiAthleteStats, type UiGoalProgress } from "../domain/metrics/uiStats";
import GoalField from "../components/GoalField";
import {
  getGoalCoachFeedback,
  formatActivitiesPerWeek,
  type CoachInput,
  type CoachResult,
  type CoachState,
} from "../domain/coach/goalCoach";
import { formatNumber } from "../utils/format";

const VALID_SPORTS: Sport[] = ["run", "ride"];

const GOAL_FIELDS: Array<{
  key: GoalMetric;
  label: string;
  unit: string;
  helpText?: string;
  allowDecimal: boolean;
}> = [
  {
    key: "distanceKm",
    label: "Distance",
    unit: "km",
    helpText: "Total kilometers you want to cover this year",
    allowDecimal: true,
  },
  {
    key: "count",
    label: "Activities",
    unit: "activities",
    helpText: "Number of workouts you want to complete",
    allowDecimal: false,
  },
  {
    key: "elevationM",
    label: "Elevation",
    unit: "m",
    helpText: "Total meters of elevation gain for the year",
    allowDecimal: true,
  },
];

function emptyGoals(year: number): YearGoals {
  return { year, perSport: { run: {}, ride: {} } };
}

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

export default function GoalsPage() {
  const navigate = useNavigate();
  const { sport: sportParam } = useParams();

  const sport = sportParam as Sport | undefined;
  const isValidSport = sport && VALID_SPORTS.includes(sport);

  const year = new Date().getFullYear();
  const { token } = useAuth();
  const { goals, loading: goalsLoading } = useGoals(year);
  const { activities, loading: activitiesLoading } = useActivities(year, !!token);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const coachCacheRef = useRef(new Map<string, CoachResult>());
  const coachRequestRef = useRef<Record<GoalMetric, string>>({
    distanceKm: "",
    count: "",
    elevationM: "",
  });
  const [coachStates, setCoachStates] = useState<Record<GoalMetric, CoachState>>({
    distanceKm: { status: "idle" },
    count: { status: "idle" },
    elevationM: { status: "idle" },
  });
  const [goalOverrides, setGoalOverrides] = useState<Partial<Record<GoalMetric, number | undefined>>>({});

  const currentGoals = useMemo(() => {
    if (!isValidSport || !goals) return {};
    const baseGoals = goals.perSport?.[sport] ?? {};
    return { ...baseGoals, ...goalOverrides };
  }, [goals, sport, isValidSport, goalOverrides]);

  const goalMeta: Record<GoalMetric, { goalType: CoachInput["goalType"]; unit: CoachInput["unit"] }> = {
    distanceKm: { goalType: "distance", unit: "km" },
    count: { goalType: "count", unit: "count" },
    elevationM: { goalType: "elevation", unit: "m" },
  };

  const statsBySport = useMemo((): Record<Sport, UiAthleteStats> | null => {
    if (!isValidSport || !activities || !token) return null;

    const asOfLocalIso = new Date().toISOString();
    const retrievedAtLocal = new Date().toString();

    const stravaLike = activities.map(toStravaLike);
    const normalized = normalizeActivities(stravaLike as any);

    function buildForSport(s: Sport) {
      const agg = aggregateYear(normalized, year, s, asOfLocalIso);
      const sportGoals = goals?.perSport?.[s];
      return buildUiAthleteStats({
        aggregate: agg,
        asOfDateLocal: asOfLocalIso,
        retrievedAtLocal,
        goals: sportGoals,
        mode: "ytd",
        blendWeightRolling: 0.6,
      });
    }

    return {
      run: buildForSport("run"),
      ride: buildForSport("ride"),
    };
  }, [activities, goals, isValidSport, year, token]);

  if (!isValidSport) {
    return (
      <div className="container-page">
        <div className="card card--primary" style={{ marginTop: "2rem" }}>
          <div className="card__body">
            <h2 style={{ color: "var(--text-muted)" }}>Invalid sport</h2>
            <p style={{ marginTop: "1rem", marginBottom: "1rem" }}>
              Sport <strong>{sportParam}</strong> is not valid. Valid sports: run, ride.
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
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sportKey: Sport = sport;
  const sportLabel = sport === "run" ? "Running" : "Cycling";
  const otherSport: Sport = sportKey === "run" ? "ride" : "run";
  const stats = statsBySport ? statsBySport[sportKey] : null;
  const otherStats = statsBySport ? statsBySport[otherSport] : null;

  useEffect(() => {
    setCoachStates({
      distanceKm: { status: "idle" },
      count: { status: "idle" },
      elevationM: { status: "idle" },
    });
    setGoalOverrides({});
  }, [sportKey, year]);

  useEffect(() => {
    if (!goals) return;
    setGoalOverrides({});
  }, [goals]);

  async function saveGoalField(metric: GoalMetric, value: number | undefined) {
    const base = goals ?? emptyGoals(year);
    const perSport = { ...base.perSport };
    const currentSport = { ...(perSport[sportKey] ?? {}) } as Record<GoalMetric, number>;

    if (typeof value === "number") {
      currentSport[metric] = value;
    } else {
      delete currentSport[metric];
    }

    perSport[sportKey] = currentSport;

    const payload: YearGoals = {
      ...base,
      year,
      perSport,
    };

    const savePromise = goalsRepo.saveGoals(year, payload);
    const tracked = savePromise.then(() => {});
    pendingSaveRef.current = tracked;
    await savePromise;
    if (pendingSaveRef.current === tracked) {
      pendingSaveRef.current = null;
    }

    setGoalOverrides((prev) => {
      const next = { ...prev };
      if (typeof value === "number") {
        next[metric] = value;
      } else {
        delete next[metric];
      }
      return next;
    });
  }

  async function handleBack() {
    const active = document.activeElement as HTMLElement | null;
    if (active && typeof (active as { blur?: () => void }).blur === "function") {
      (active as { blur: () => void }).blur();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
    if (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }
    navigate(`/?sport=${sportKey}`);
  }

  const isLoading = goalsLoading || activitiesLoading;

  function formatSuggestionValue(suggestion: { value: number; unit: string }, isCount: boolean): string {
    if (suggestion.unit === "count") {
      return `${formatNumber(suggestion.value, { maximumFractionDigits: 0 })} ${formatActivitiesPerWeek(
        suggestion.value
      )}`;
    }
    return `${formatNumber(suggestion.value, { maximumFractionDigits: isCount ? 0 : 1 })} ${suggestion.unit}`;
  }

  function formatTimestamp(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "2-digit",
    });
  }

  function buildCoachCacheKey(metric: GoalMetric, goalValue: number) {
    return `${year}:${sportKey}:${goalMeta[metric].goalType}:${goalValue}`;
  }

  function setCoachState(metric: GoalMetric, next: CoachState) {
    setCoachStates((prev) => ({ ...prev, [metric]: next }));
  }

  async function handleApplySuggestion(metric: GoalMetric, rawValue: number) {
    const appliedValue = goalMeta[metric].unit === "count" ? Math.round(rawValue) : rawValue;
    setCoachState(metric, { status: "idle" });
    await saveGoalField(metric, appliedValue);
  }

  async function handleCoachRequest(metric: GoalMetric, goalValue: number, progress: UiGoalProgress) {
    if (!stats) return;

    const cacheKey = buildCoachCacheKey(metric, goalValue);
    coachRequestRef.current[metric] = cacheKey;

    const cached = coachCacheRef.current.get(cacheKey);
    if (cached) {
      setCoachState(metric, { status: "ready", result: cached, goalValue, updatedAt: new Date().toISOString() });
      return;
    }

    setCoachState(metric, { status: "loading", goalValue });

    const otherProgress = otherStats?.progress[metric];
    const otherGoalValue = (goals?.perSport?.[otherSport] as any)?.[metric] as number | undefined;
    const input: CoachInput = {
      year,
      sport: sportKey,
      goalType: goalMeta[metric].goalType,
      goalValue,
      unit: goalMeta[metric].unit,
      ytd: progress.ytd,
      trendPerWeek: progress.avgPerWeek,
      yearEndForecast: progress.forecast,
      remainingWeeks: stats.weeksLeftExact,
      otherSport: otherProgress
        ? {
            sport: otherSport,
            ytd: otherProgress.ytd,
            trendPerWeek: otherProgress.avgPerWeek,
            yearEndForecast: otherProgress.forecast,
            goalValue: otherGoalValue,
          }
        : undefined,
    };

    try {
      const result = await getGoalCoachFeedback(input);
      if (coachRequestRef.current[metric] !== cacheKey) return;
      coachCacheRef.current.set(cacheKey, result);
      setCoachState(metric, {
        status: "ready",
        result,
        goalValue,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (coachRequestRef.current[metric] !== cacheKey) return;
      setCoachState(metric, {
        status: "error",
        error: err instanceof Error ? err.message : "AI coach error",
        goalValue,
      });
    }
  }

  useEffect(() => {
    const values = {
      distanceKm: (currentGoals as any)?.distanceKm as number | undefined,
      count: (currentGoals as any)?.count as number | undefined,
      elevationM: (currentGoals as any)?.elevationM as number | undefined,
    };

    setCoachStates((prev) => {
      const next = { ...prev };
      (Object.keys(values) as GoalMetric[]).forEach((metric) => {
        if (prev[metric]?.goalValue !== values[metric]) {
          next[metric] = { status: "idle" };
        }
      });
      return next;
    });
  }, [(currentGoals as any)?.distanceKm, (currentGoals as any)?.count, (currentGoals as any)?.elevationM]);

  return (
    <div className="container-page" style={{ paddingBottom: "2rem" }}>
      <button
        onClick={handleBack}
        className="nav-back"
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <h1 className="goals-title">
        {sportLabel} Goals
        <span className="goals-title__year">{year}</span>
      </h1>

      {isLoading && (
        <p style={{ marginTop: "1.5rem", color: "var(--text-muted)" }}>Loading...</p>
      )}

      {!isLoading && (
        <div className="goals-grid">
          {GOAL_FIELDS.map((field) => {
            const currentValue = (currentGoals as any)?.[field.key] as number | undefined;
            const progress = stats?.progress[field.key];
            const hasGoalValue = typeof currentValue === "number" && currentValue > 0;
            const coachState = coachStates[field.key];
            const coachStateMatches = coachState?.goalValue === currentValue;
            const coachStatus = coachStateMatches ? coachState.status : "idle";
            const coachResult = coachStateMatches ? coachState.result : undefined;
            const coachError = coachStateMatches ? coachState.error : undefined;

            return (
              <section key={field.key} className="card card--primary">
                <header className="card__header card__header--solo">
                  <div>
                    <div className="card__kicker">{field.label} Goal</div>
                  </div>
                </header>
                <div className="card__body">
                  <GoalField
                    label={field.label}
                    value={currentValue}
                    unit={field.unit}
                    helpText={field.helpText}
                    allowDecimal={field.allowDecimal}
                    onSave={(value) => saveGoalField(field.key, value)}
                  />

                  {hasGoalValue && progress && (
                    <div className="goal-coach">
                      <button
                        type="button"
                        className="goal-coach__button"
                        onClick={() => handleCoachRequest(field.key, currentValue, progress)}
                        disabled={coachStatus === "loading"}
                        aria-label={`AI coach feedback for ${field.label}`}
                      >
                        <Sparkles size={14} />
                        {coachStatus === "loading" ? "Coaching..." : "AI Coach"}
                      </button>

                      {coachStatus === "error" && (
                        <div className="goal-coach__feedback goal-coach__feedback--error">
                          <div>{coachError || "AI coach failed. Please try again."}</div>
                          <button
                            type="button"
                            className="goal-coach__retry"
                            onClick={() => handleCoachRequest(field.key, currentValue, progress)}
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {coachStatus === "ready" && coachResult && (
                        <div className="goal-coach__feedback">
                          <div className="goal-coach__headline">{coachResult.headline}</div>
                          <div className="goal-coach__explanation">{coachResult.explanation}</div>
                          {coachStateMatches && coachState.updatedAt && (
                            <div className="goal-coach__timestamp">
                              Last updated: {formatTimestamp(coachState.updatedAt)}
                            </div>
                          )}
                          {coachResult.crossSportNote && (
                            <div className="goal-coach__cross">{coachResult.crossSportNote}</div>
                          )}
                          {coachResult.suggestions?.length > 0 && (
                            <div className="goal-coach__suggestions">
                              {coachResult.suggestions.slice(0, 2).map((suggestion, index) => (
                                <div key={`${suggestion.label}-${index}`} className="goal-coach__suggestion">
                                  <div className="goal-coach__suggestion-title">
                                    {suggestion.label}: {formatSuggestionValue(suggestion, field.key === "count")}
                                  </div>
                                  <div className="goal-coach__suggestion-note">{suggestion.rationale}</div>
                                  {suggestion.confidence !== "low" && (
                                    <div className="goal-coach__actions">
                                      <button
                                        type="button"
                                        className="goal-coach__apply"
                                        onClick={() => handleApplySuggestion(field.key, suggestion.value)}
                                      >
                                        Apply {formatNumber(suggestion.value, { maximumFractionDigits: field.key === "count" ? 0 : 1 })} {suggestion.unit === "count" ? "activities" : suggestion.unit}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {progress && (
                    <div
                      style={{
                        marginTop: "1.5rem",
                        paddingTop: "1rem",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                        {currentValue ? "Progress & Forecast" : "Current Progress & Forecast"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "0.75rem" }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>YTD</div>
                          <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                            {formatNumber(progress.ytd, { maximumFractionDigits: field.key === "count" ? 0 : 1 })} {field.unit}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Year-End Forecast</div>
                          <div style={{ fontSize: "1.125rem", fontWeight: 600 }}>
                            {formatNumber(progress.forecast, { maximumFractionDigits: field.key === "count" ? 0 : 1 })} {field.unit}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Trend per week</div>
                          <div style={{ fontSize: "1rem", fontWeight: 500 }}>
                            {formatNumber(progress.avgPerWeek, { maximumFractionDigits: field.key === "count" ? 0 : 1 })} {field.unit}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
